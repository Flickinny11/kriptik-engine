import { Router, type Response } from 'express';
import { eq, asc } from 'drizzle-orm';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { verifyProjectOwnership } from '../middleware/ownership.js';
import { activeEngines } from './execute.js';
import { db } from '../db.js';
import { buildEvents } from '../schema.js';

const router = Router();
router.use(requireAuth as any);

// SSE stream for a project's build events
// Replays ALL persisted events first, then streams live events
router.get('/stream', async (req: AuthenticatedRequest, res: Response) => {
  const projectId = req.query.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: 'projectId query param required' });
    return;
  }

  // Verify ownership — user must own this project
  const project = await verifyProjectOwnership(req, projectId);
  if (!project) {
    res.status(403).json({ error: 'Project not found or access denied' });
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', projectId })}\n\n`);

  // Phase 1: Replay all persisted events for this project (chat history)
  // This ensures no events are lost between build start and SSE connection
  const historicalEvents = await db.select().from(buildEvents)
    .where(eq(buildEvents.projectId, projectId))
    .orderBy(asc(buildEvents.id));

  for (const row of historicalEvents) {
    const event = row.eventData as Record<string, unknown>;
    res.write(`id: persisted-${row.id}\n`);
    res.write(`event: ${row.eventType}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  // Mark end of replay so the client can distinguish historical from live
  res.write(`data: ${JSON.stringify({ type: 'replay_complete', count: historicalEvents.length })}\n\n`);

  // Phase 2: Stream live events if engine is still running
  const entry = activeEngines.get(projectId);
  let unsubscribe: (() => void) | null = null;

  if (entry) {
    // Track the last persisted event ID to avoid duplicates
    const lastPersistedId = historicalEvents.length > 0
      ? historicalEvents[historicalEvents.length - 1].id
      : 0;

    // Subscribe to live events, skipping any that were already replayed
    // Events are persisted with auto-increment IDs, so we can compare
    let liveEventCounter = 0;
    unsubscribe = entry.handle.onEvent((event) => {
      liveEventCounter++;
      res.write(`id: live-${liveEventCounter}\n`);
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
  }

  // Heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 15_000);

  // Cleanup on disconnect
  req.on('close', () => {
    unsubscribe?.();
    clearInterval(heartbeat);
  });
});

// Replay persisted events for a project (REST fallback for when SSE isn't needed)
router.get('/replay', async (req: AuthenticatedRequest, res: Response) => {
  const projectId = req.query.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: 'projectId query param required' });
    return;
  }

  // Verify ownership
  const project = await verifyProjectOwnership(req, projectId);
  if (!project) {
    res.status(403).json({ error: 'Project not found or access denied' });
    return;
  }

  const events = await db.select().from(buildEvents)
    .where(eq(buildEvents.projectId, projectId))
    .orderBy(asc(buildEvents.id));

  res.json({ events: events.map(e => e.eventData) });
});

export default router;
