/**
 * MCP API Routes
 *
 * Endpoints for managing MCP service connections:
 * - Start OAuth flow for an MCP service
 * - OAuth callback (receives authorization code)
 * - List connected MCP services
 * - Get cached tools for a service
 * - Disconnect a service
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getMcpClient, listMcpConnections, deleteMcpConnection } from '../mcp/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/mcp/:serviceId/authorize
 *
 * Start the MCP OAuth 2.1 flow for a service.
 * Returns an authorization URL to redirect the user's browser to.
 */
router.post('/:serviceId/authorize', requireAuth as any, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { serviceId } = req.params;
  const { mcpServerUrl } = req.body;

  if (!mcpServerUrl) {
    return res.status(400).json({ error: 'mcpServerUrl is required' });
  }

  try {
    const client = getMcpClient();
    const result = await client.startAuthFlow(authReq.user!.id, serviceId, mcpServerUrl);
    res.json(result);
  } catch (err) {
    console.error(`[MCP] Auth flow start failed for ${serviceId}:`, err);
    res.status(500).json({
      error: 'Failed to start MCP authorization',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/mcp/callback
 *
 * OAuth callback endpoint. The MCP service's authorization server redirects
 * here after the user authenticates.
 *
 * Returns an HTML page that posts a message to the opener window
 * (the KripTik app) and auto-closes.
 */
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.send(buildCallbackHtml(false, undefined, String(error_description || error)));
  }

  if (!code || !state) {
    return res.status(400).send(buildCallbackHtml(false, undefined, 'Missing code or state'));
  }

  try {
    const client = getMcpClient();
    const result = await client.completeAuthFlow(String(code), String(state));

    res.send(buildCallbackHtml(true, result.serviceId));
  } catch (err) {
    console.error('[MCP] Callback completion failed:', err);
    res.send(buildCallbackHtml(false, undefined, err instanceof Error ? err.message : 'Unknown error'));
  }
});

/**
 * GET /api/mcp/connections
 *
 * List all MCP connections for the authenticated user.
 * Returns metadata only (no tokens).
 */
router.get('/connections', requireAuth as any, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const connections = await listMcpConnections(authReq.user!.id);
    res.json({ connections });
  } catch (err) {
    console.error('[MCP] Failed to list connections:', err);
    res.status(500).json({ error: 'Failed to list MCP connections' });
  }
});

/**
 * GET /api/mcp/:serviceId/tools
 *
 * Get cached tools for a connected MCP service.
 */
router.get('/:serviceId/tools', requireAuth as any, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { serviceId } = req.params;

  try {
    const client = getMcpClient();
    const tools = await client.getCachedTools(serviceId);

    if (!tools) {
      // Try to refresh tools if we have a valid token
      const token = await client.getValidToken(authReq.user!.id, serviceId);
      if (token) {
        const connections = await listMcpConnections(authReq.user!.id);
        const connection = connections.find(c => c.serviceId === serviceId);
        if (connection) {
          const freshTools = await client.discoverTools(serviceId, connection.mcpServerUrl, token);
          return res.json({ tools: freshTools });
        }
      }
      return res.json({ tools: [] });
    }

    res.json({ tools });
  } catch (err) {
    console.error(`[MCP] Failed to get tools for ${serviceId}:`, err);
    res.status(500).json({ error: 'Failed to get tools' });
  }
});

/**
 * POST /api/mcp/health-check
 *
 * Validate token status for all of the user's MCP connections.
 * Attempts to refresh expired tokens. Returns current health status.
 */
router.post('/health-check', requireAuth as any, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const connections = await listMcpConnections(authReq.user!.id);
    const client = getMcpClient();
    const results = [];

    for (const conn of connections) {
      try {
        const token = await client.getValidToken(authReq.user!.id, conn.serviceId);
        results.push({
          serviceId: conn.serviceId,
          status: 'connected' as const,
          tokenValid: !!token,
          lastRefreshed: new Date().toISOString(),
        });
      } catch (err: unknown) {
        const needsReauth = err && typeof err === 'object' && 'requiresReauth' in err && (err as { requiresReauth: boolean }).requiresReauth;
        results.push({
          serviceId: conn.serviceId,
          status: needsReauth ? 'needs_reauth' as const : 'error' as const,
          tokenValid: false,
        });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error('[MCP] Health check failed:', err);
    res.status(500).json({ error: 'Health check failed' });
  }
});

/**
 * DELETE /api/mcp/:serviceId
 *
 * Disconnect an MCP service.
 */
router.delete('/:serviceId', requireAuth as any, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { serviceId } = req.params;

  try {
    const deleted = await deleteMcpConnection(authReq.user!.id, serviceId);
    res.json({ success: deleted });
  } catch (err) {
    console.error(`[MCP] Failed to disconnect ${serviceId}:`, err);
    res.status(500).json({ error: 'Failed to disconnect service' });
  }
});

/**
 * Build the HTML page returned by the OAuth callback.
 * Posts a message to the opener window and auto-closes.
 */
function buildCallbackHtml(success: boolean, serviceId?: string, error?: string): string {
  const message = JSON.stringify({
    type: 'mcp_oauth_complete',
    success,
    serviceId: serviceId || null,
    error: error || null,
  });

  return `<!DOCTYPE html>
<html>
<head><title>KripTik - MCP Connection</title></head>
<body>
<p>${success ? 'Connected! This window will close automatically.' : 'Connection failed. This window will close automatically.'}</p>
<script>
  if (window.opener) {
    window.opener.postMessage(${message}, '*');
  }
  setTimeout(function() { window.close(); }, 1500);
</script>
</body>
</html>`;
}

export default router;
