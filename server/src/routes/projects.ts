import { Router, type Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { projects } from '../schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

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

export default router;
