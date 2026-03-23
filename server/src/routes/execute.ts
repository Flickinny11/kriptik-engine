import { Router, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { projects, buildEvents } from '../schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { verifyProjectOwnership } from '../middleware/ownership.js';
import path from 'path';
import os from 'os';
import { isModalEnabled, startModalBuildStreaming } from '../modal/sandbox-manager.js';

// Engine types — defined inline to avoid TypeScript resolving the engine path.
// The actual engine is at ../../../src/engine.js but we don't import it at compile time.
interface EngineHandle {
  onEvent: (handler: (event: any) => void) => (() => void) | void;
  sendDirective: (text: string) => Promise<void>;
  respondToQuestion: (questionId: string, answer: string) => void;
  sendCorrection: (agentId: string, text: string) => Promise<void>;
  stop: () => Promise<void>;
  terminate: () => Promise<void>;
}

// Lazy import: engine loaded only when a build is actually started.
// This prevents the server from loading native deps (better-sqlite3, playwright)
// at startup — they're only needed when initEngine() is called.
// The dynamic import path is constructed to prevent TypeScript from resolving it.
const ENGINE_PATH = '../../../src/engine.js';
async function loadEngine() {
  const mod = await import(/* @vite-ignore */ ENGINE_PATH);
  return mod.initEngine as (...args: any[]) => Promise<EngineHandle>;
}

const router = Router();
router.use(requireAuth as any);

// In-memory map of active engine sessions
// Key: projectId, Value: { handle, ownerId }
// ownerId is stored so we can verify ownership on SSE/directive/stop
export const activeEngines = new Map<string, { handle: EngineHandle; ownerId: string }>();

// Lock set to prevent TOCTOU race on concurrent start requests for the same project
const startingBuilds = new Set<string>();

// Start a build
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const { projectId, prompt } = req.body;
  if (!projectId || !prompt) {
    res.status(400).json({ error: 'projectId and prompt are required' });
    return;
  }

  // Verify ownership — user must own this project
  const project = await verifyProjectOwnership(req, projectId);
  if (!project) {
    res.status(403).json({ error: 'Project not found or access denied' });
    return;
  }

  // Check engine isn't already running or starting for this project
  if (activeEngines.has(projectId) || startingBuilds.has(projectId)) {
    res.status(409).json({ error: 'Build already in progress for this project' });
    return;
  }

  // Acquire start lock — prevents double-click / concurrent requests
  startingBuilds.add(projectId);

  const sessionId = uuid();

  // Persist event helper — used by both local and Modal paths
  // Includes retry on failure and handles both build_complete and build_error
  const persistEvent = async (event: any) => {
    const insert = () => db.insert(buildEvents).values({
      projectId,
      eventType: event.type,
      eventData: event,
    });

    try {
      await insert();
    } catch (err) {
      console.error('Event persist failed, retrying:', err);
      try {
        await new Promise(r => setTimeout(r, 500));
        await insert();
      } catch (err2) {
        console.error('Event persist retry failed:', err2);
      }
    }

    // Update project status on completion or error
    if (event.type === 'build_complete' || event.type === 'build_error') {
      const status = event.type === 'build_complete' ? 'complete' : 'failed';
      db.update(projects)
        .set({ status, updatedAt: new Date() })
        .where(eq(projects.id, projectId))
        .then(() => activeEngines.delete(projectId))
        .catch(console.error);
    }
  };

  try {
    // Update project to building status
    await db.update(projects)
      .set({ status: 'building', engineSessionId: sessionId, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    if (isModalEnabled()) {
      // === MODAL PATH: Run build in Modal container ===
      startingBuilds.delete(projectId);

      // Build callback URL for real-time event streaming from Modal
      const apiBase = process.env.BETTER_AUTH_URL || process.env.API_URL || '';
      const callbackUrl = apiBase ? `${apiBase}/api/events/callback/${projectId}` : undefined;

      // Fire and return — Modal streams events via callback + returns full list
      const isAuditModeModal = typeof prompt === 'string' && prompt.startsWith('[FORENSIC AUDIT]');
      startModalBuildStreaming(
        { projectId, prompt, mode: isAuditModeModal ? 'import' : 'builder', budgetCapDollars: isAuditModeModal ? 10 : 5, callbackUrl },
        persistEvent,
      ).catch((err) => {
        console.error('Modal build error:', err);
        db.update(projects)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(projects.id, projectId))
          .catch(console.error);
      });

      res.json({ sessionId, projectId, runtime: 'modal' });
    } else {
      // === LOCAL PATH: Run engine in-process ===
      const brainDir = path.join(os.tmpdir(), 'kriptik-brains');
      const sandboxDir = path.join(os.tmpdir(), 'kriptik-sandboxes', projectId);

      // Detect forensic audit mode from prompt
      const isAuditMode = typeof prompt === 'string' && prompt.startsWith('[FORENSIC AUDIT]');

      const initEngine = await loadEngine();
      const handle = await initEngine({
        projectId,
        mode: isAuditMode ? 'import' : 'builder',
        initialContext: prompt,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
        qdrantUrl: process.env.QDRANT_URL!,
        qdrantApiKey: process.env.QDRANT_API_KEY,
        hfApiKey: process.env.HF_API_KEY,
        brainDbPath: path.join(brainDir, `${projectId}.db`),
        sandboxRootDir: sandboxDir,
        budgetCapDollars: 5,
      });

      activeEngines.set(projectId, { handle, ownerId: req.user!.id });
      startingBuilds.delete(projectId);

      await db.update(projects)
        .set({
          brainDbPath: path.join(brainDir, `${projectId}.db`),
          sandboxPath: sandboxDir,
        })
        .where(eq(projects.id, projectId));

      handle.onEvent(persistEvent);

      res.json({ sessionId, projectId, runtime: 'local' });
    }
  } catch (err) {
    startingBuilds.delete(projectId);
    console.error('Failed to start engine:', err);
    await db.update(projects)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    res.status(500).json({ error: 'Failed to start build engine' });
  }
});

// Send a user directive to a running build
router.post('/:projectId/directive', async (req: AuthenticatedRequest, res: Response) => {
  const project = await verifyProjectOwnership(req, req.params.projectId);
  if (!project) {
    res.status(403).json({ error: 'Project not found or access denied' });
    return;
  }

  const entry = activeEngines.get(req.params.projectId);
  if (!entry) {
    res.status(404).json({ error: 'No active build for this project' });
    return;
  }
  await entry.handle.sendDirective(req.body.text || '');
  res.json({ success: true });
});

// Respond to a specific agent question
router.post('/:projectId/respond', async (req: AuthenticatedRequest, res: Response) => {
  const project = await verifyProjectOwnership(req, req.params.projectId);
  if (!project) {
    res.status(403).json({ error: 'Project not found or access denied' });
    return;
  }

  const { nodeId, answer } = req.body;
  if (!nodeId || !answer) {
    res.status(400).json({ error: 'nodeId and answer are required' });
    return;
  }

  const entry = activeEngines.get(req.params.projectId);
  if (!entry) {
    res.status(404).json({ error: 'No active build for this project' });
    return;
  }
  await entry.handle.respondToQuestion(nodeId, answer);
  res.json({ success: true });
});

// Send a user correction — writes richly contextual directive to Brain
router.post('/:projectId/correct', async (req: AuthenticatedRequest, res: Response) => {
  const project = await verifyProjectOwnership(req, req.params.projectId);
  if (!project) {
    res.status(403).json({ error: 'Project not found or access denied' });
    return;
  }

  const { correctionText, eventContext } = req.body;
  if (!correctionText) {
    res.status(400).json({ error: 'correctionText is required' });
    return;
  }

  const entry = activeEngines.get(req.params.projectId);
  if (!entry) {
    res.status(404).json({ error: 'No active build for this project' });
    return;
  }

  // Compose a rich contextual directive so the Brain node has maximum context
  // The Lead Agent reads this and reasons about how to handle it
  const ctx = eventContext || {};
  const directive = [
    `USER CORRECTION targeting ${ctx.agentRole || 'agent'} (${ctx.sessionId || 'unknown'}):`,
    ctx.eventType ? `Event: ${ctx.eventType}` : null,
    ctx.file ? `File: ${ctx.file}` : null,
    ctx.contentPreview ? `Context: ${ctx.contentPreview}` : null,
    `Correction: ${correctionText}`,
    '',
    'Consider writing this as a Brain constraint if it should apply to all future work.',
    'Address the specific file/code that needs fixing.',
  ].filter(Boolean).join('\n');

  await entry.handle.sendDirective(directive);
  res.json({ success: true });
});

// Stop a running build
router.post('/:projectId/stop', async (req: AuthenticatedRequest, res: Response) => {
  const project = await verifyProjectOwnership(req, req.params.projectId);
  if (!project) {
    res.status(403).json({ error: 'Project not found or access denied' });
    return;
  }

  const entry = activeEngines.get(req.params.projectId);
  if (!entry) {
    res.status(404).json({ error: 'No active build for this project' });
    return;
  }
  await entry.handle.terminate();
  activeEngines.delete(req.params.projectId);
  await db.update(projects)
    .set({ status: 'idle', updatedAt: new Date() })
    .where(eq(projects.id, req.params.projectId));
  res.json({ success: true });
});

export default router;
