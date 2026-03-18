import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { projects, buildEvents } from '../schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { verifyProjectOwnership } from '../middleware/ownership.js';
import path from 'path';
import os from 'os';

// Engine types — defined inline to avoid TypeScript resolving the engine path.
// The actual engine is at ../../../src/engine.js but we don't import it at compile time.
interface EngineHandle {
  onEvent: (handler: (event: any) => void) => void;
  sendDirective: (text: string) => Promise<void>;
  respondToQuestion: (questionId: string, answer: string) => void;
  sendCorrection: (agentId: string, text: string) => Promise<void>;
  stop: () => Promise<void>;
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
router.post('/', async (req: AuthenticatedRequest, res) => {
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
  const brainDir = path.join(os.tmpdir(), 'kriptik-brains');
  const sandboxDir = path.join(os.tmpdir(), 'kriptik-sandboxes', projectId);

  try {
    const initEngine = await loadEngine();
    const handle = await initEngine({
      projectId,
      mode: 'builder',
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

    // Update project status and store paths
    const brainDbPath = path.join(brainDir, `${projectId}.db`);
    await db.update(projects)
      .set({
        status: 'building',
        engineSessionId: sessionId,
        brainDbPath: brainDbPath,
        sandboxPath: sandboxDir,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    // Persist every engine event for chat replay + update status on complete
    handle.onEvent((event) => {
      db.insert(buildEvents).values({
        projectId,
        eventType: event.type,
        eventData: event,
      }).catch(console.error);

      if (event.type === 'build_complete') {
        db.update(projects)
          .set({ status: 'complete', updatedAt: new Date() })
          .where(eq(projects.id, projectId))
          .then(() => activeEngines.delete(projectId))
          .catch(console.error);
      }
    });

    res.json({ sessionId, projectId });
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
router.post('/:projectId/directive', async (req: AuthenticatedRequest, res) => {
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
router.post('/:projectId/respond', async (req: AuthenticatedRequest, res) => {
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
router.post('/:projectId/correct', async (req: AuthenticatedRequest, res) => {
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
router.post('/:projectId/stop', async (req: AuthenticatedRequest, res) => {
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
