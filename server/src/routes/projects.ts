import { Router, type Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { projects, buildEvents } from '../schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { verifyProjectOwnership } from '../middleware/ownership.js';
import { activeEngines } from './execute.js';

const router = Router();
router.use(requireAuth as any);

// List user's projects
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const rows = await db.select().from(projects)
    .where(eq(projects.ownerId, req.user!.id))
    .orderBy(desc(projects.updatedAt));
  res.json({ projects: rows });
});

// Create project
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const { name, description } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const id = req.body.id || uuid();
  const [project] = await db.insert(projects).values({
    id,
    name,
    description: description || null,
    ownerId: req.user!.id,
    status: 'idle',
  }).returning();
  res.status(201).json({ project });
});

// Get single project
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, req.params.id), eq(projects.ownerId, req.user!.id)));
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json({ project });
});

// Update project
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { name, description } = req.body;
  const [project] = await db.update(projects)
    .set({ name, description, updatedAt: new Date() })
    .where(and(eq(projects.id, req.params.id), eq(projects.ownerId, req.user!.id)))
    .returning();
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json({ project });
});

// Delete project
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const [deleted] = await db.delete(projects)
    .where(and(eq(projects.id, req.params.id), eq(projects.ownerId, req.user!.id)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json({ success: true });
});

// Get preview URL for a running build's dev server
router.get('/:id/preview', async (req: AuthenticatedRequest, res: Response) => {
  const project = await verifyProjectOwnership(req, req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Check if there's an active local engine with a dev server
  const entry = activeEngines.get(req.params.id);
  if (entry) {
    // For local builds, the preview URL comes from dev server events
    // Query the latest start_dev_server event for this project
    const [devServerEvent] = await db.select().from(buildEvents)
      .where(and(
        eq(buildEvents.projectId, req.params.id),
        eq(buildEvents.eventType, 'agent_tool_result'),
      ))
      .orderBy(desc(buildEvents.id))
      .limit(20);

    // Search recent events for dev server URL
    if (devServerEvent?.eventData) {
      const data = devServerEvent.eventData as any;
      if (data?.data?.toolName === 'start_dev_server' && data?.data?.result?.url) {
        res.json({ url: data.data.result.url, source: 'local' });
        return;
      }
    }
  }

  // For Modal builds, check if MODAL_SPAWN_URL is set (tunnel URL would come from there)
  // For now, return the sandbox path if project has one
  if (project.sandboxPath) {
    res.json({ url: null, sandboxPath: project.sandboxPath, status: project.status });
    return;
  }

  res.json({ url: null, status: project.status });
});

// ── POST /api/projects/:id/import ────────────────────────────────
// Record import source metadata for a project (used before audit starts)
router.post('/:id/import', async (req: AuthenticatedRequest, res: Response) => {
  const project = await verifyProjectOwnership(req, req.params.id);
  if (!project) {
    res.status(403).json({ error: 'Project not found or access denied' });
    return;
  }

  const { source, repoUrl, repoFullName, defaultBranch } = req.body;
  if (!source) {
    res.status(400).json({ error: 'source is required (github, gitlab, or zip)' });
    return;
  }

  // Store import metadata in project description for now
  // (could be a dedicated column in future)
  const importMeta = JSON.stringify({ source, repoUrl, repoFullName, defaultBranch, importedAt: new Date().toISOString() });

  await db.update(projects)
    .set({
      description: `Imported from ${source}: ${repoFullName || repoUrl || 'zip upload'}`,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, req.params.id));

  res.json({ success: true, importMeta });
});

export default router;
