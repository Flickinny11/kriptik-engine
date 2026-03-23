/**
 * Browser Agent API Routes
 *
 * Handles browser-agent fallback flows for services without MCP servers.
 * Provides endpoints to start signup flows, check progress, submit
 * verification codes, cancel sessions, and retry failed sessions.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getServiceById } from '../services/index.js';
import {
  startSession,
  getSession,
  submitVerificationCode,
  cancelSession,
  onProgress,
  hasTemplate,
} from '../browser-agent/index.js';
import type {
  StartFallbackRequest,
  StartFallbackResponse,
  SessionStatusResponse,
  SubmitVerificationRequest,
} from '../browser-agent/index.js';

const router = Router();

// Track retry counts per user+service to prevent unlimited retries at third-party services.
// Key: `${userId}:${serviceId}`, Value: count of retries (including the initial attempt).
const retryTracker = new Map<string, { count: number; firstAttempt: number }>();
const MAX_RETRIES_PER_SERVICE = 5;
const RETRY_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Sweep expired entries every 30 minutes to prevent unbounded growth under viral traffic.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of retryTracker) {
    if (now - entry.firstAttempt > RETRY_WINDOW_MS) {
      retryTracker.delete(key);
    }
  }
}, 30 * 60 * 1000).unref();

function checkRetryLimit(userId: string, serviceId: string): boolean {
  const key = `${userId}:${serviceId}`;
  const entry = retryTracker.get(key);
  const now = Date.now();
  if (!entry || now - entry.firstAttempt > RETRY_WINDOW_MS) {
    retryTracker.set(key, { count: 1, firstAttempt: now });
    return true;
  }
  if (entry.count >= MAX_RETRIES_PER_SERVICE) {
    return false;
  }
  entry.count++;
  return true;
}

/**
 * POST /api/browser-agent/:serviceId/start
 *
 * Start a browser agent fallback signup flow for a non-MCP service.
 * Requires user approval (confirmed by the client before calling this).
 */
router.post('/:serviceId/start', requireAuth as any, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { serviceId } = req.params;
  const { userEmail, userName, projectId } = req.body as StartFallbackRequest;

  if (!userEmail || !userName) {
    return res.status(400).json({ error: 'userEmail and userName are required' });
  }

  // Prevent creating accounts at third-party services with someone else's email
  if (userEmail !== authReq.user!.email) {
    return res.status(403).json({ error: 'Email must match your authenticated account email' });
  }

  // Verify the service exists and doesn't have MCP
  const service = getServiceById(serviceId);
  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }

  if (service.mcp && service.mcp.authMethod === 'oauth') {
    return res.status(400).json({
      error: `${service.name} has MCP OAuth support. Use the MCP OAuth flow instead.`,
    });
  }

  if (!service.browserFallbackAvailable) {
    return res.status(400).json({
      error: `Browser agent fallback is not available for ${service.name}.`,
    });
  }

  if (!hasTemplate(serviceId)) {
    return res.status(400).json({
      error: `No signup workflow template available for ${service.name}.`,
    });
  }

  if (!checkRetryLimit(authReq.user!.id, serviceId)) {
    return res.status(429).json({
      error: `Too many signup attempts for ${service.name}. Please try again later.`,
    });
  }

  try {
    const session = await startSession(
      authReq.user!.id,
      serviceId,
      userEmail,
      userName,
      projectId,
    );

    const response: StartFallbackResponse = {
      sessionId: session.id,
      status: session.status,
    };

    res.json(response);
  } catch (err) {
    console.error(`[BrowserAgent] Failed to start session for ${serviceId}:`, err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to start browser agent session',
    });
  }
});

/**
 * GET /api/browser-agent/:sessionId/status
 *
 * Get the current status and progress of a browser agent session.
 * Supports long-polling via ?wait=true (waits up to 30s for changes).
 */
router.get('/:sessionId/status', requireAuth as any, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { sessionId } = req.params;
  const wait = req.query.wait === 'true';

  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Verify ownership
  if (session.userId !== authReq.user!.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // If long-polling and session is still running, wait for an update
  if (wait && (session.status === 'running' || session.status === 'extracting-credentials')) {
    const messageCountBefore = session.progressMessages.length;

    await new Promise<void>(resolve => {
      const unsubscribe = onProgress(sessionId, () => {
        const current = getSession(sessionId);
        if (!current || current.progressMessages.length > messageCountBefore || current.status !== session.status) {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      });
      const timeout = setTimeout(() => { unsubscribe(); resolve(); }, 30_000);
    });
  }

  // Re-fetch after potential wait
  const current = getSession(sessionId) || session;

  const response: SessionStatusResponse = {
    sessionId: current.id,
    status: current.status,
    progressMessages: current.progressMessages,
    waitingFor: current.waitingFor,
    error: current.error,
  };

  res.json(response);
});

/**
 * POST /api/browser-agent/:sessionId/verify
 *
 * Submit a verification code (email or SMS) for a session that's
 * waiting for user input.
 */
router.post('/:sessionId/verify', requireAuth as any, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { sessionId } = req.params;
  const { code, type } = req.body as SubmitVerificationRequest;

  if (!code || !type) {
    return res.status(400).json({ error: 'code and type are required' });
  }

  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.userId !== authReq.user!.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (session.status !== 'waiting-user-input') {
    return res.status(400).json({
      error: `Session is not waiting for user input. Current status: ${session.status}`,
    });
  }

  const accepted = submitVerificationCode(sessionId, code, type);
  if (!accepted) {
    return res.status(400).json({ error: 'Failed to submit verification code' });
  }

  res.json({ success: true, message: 'Verification code submitted' });
});

/**
 * POST /api/browser-agent/:sessionId/cancel
 *
 * Cancel a running browser agent session.
 */
router.post('/:sessionId/cancel', requireAuth as any, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { sessionId } = req.params;

  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.userId !== authReq.user!.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const cancelled = cancelSession(sessionId);
  if (!cancelled) {
    return res.status(400).json({
      error: `Cannot cancel session with status: ${session.status}`,
    });
  }

  res.json({ success: true, message: 'Session cancelled' });
});

/**
 * POST /api/browser-agent/:sessionId/retry
 *
 * Retry a failed browser agent session. Creates a new session with
 * the same parameters.
 */
router.post('/:sessionId/retry', requireAuth as any, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { sessionId } = req.params;
  const { userEmail, userName, projectId } = req.body as StartFallbackRequest;

  const oldSession = getSession(sessionId);
  if (!oldSession) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (oldSession.userId !== authReq.user!.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (oldSession.status !== 'failed' && oldSession.status !== 'cancelled') {
    return res.status(400).json({
      error: `Can only retry failed or cancelled sessions. Current status: ${oldSession.status}`,
    });
  }

  if (!userEmail || !userName) {
    return res.status(400).json({ error: 'userEmail and userName are required for retry' });
  }

  if (userEmail !== authReq.user!.email) {
    return res.status(403).json({ error: 'Email must match your authenticated account email' });
  }

  if (!checkRetryLimit(authReq.user!.id, oldSession.serviceId)) {
    return res.status(429).json({
      error: `Too many signup attempts for this service. Please try again later.`,
    });
  }

  try {
    const session = await startSession(
      authReq.user!.id,
      oldSession.serviceId,
      userEmail,
      userName,
      projectId,
    );

    const response: StartFallbackResponse = {
      sessionId: session.id,
      status: session.status,
    };

    res.json(response);
  } catch (err) {
    console.error(`[BrowserAgent] Failed to retry session:`, err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to retry session',
    });
  }
});

export default router;
