import { Router, type Request, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { PROVIDER_CATALOG } from '../oauth/catalog.js';
import { startFlow, completeFlow, getConfiguredProviders } from '../oauth/manager.js';

const router = Router();

// Public: Get the full provider catalog (for UI Connect button matching)
router.get('/catalog', (_req: Request, res: Response) => {
  // Return only id, displayName, category, authType — no secrets
  const catalog = PROVIDER_CATALOG.map(p => ({
    id: p.id,
    displayName: p.displayName,
    category: p.category,
    authType: p.authType,
  }));
  res.json({ providers: catalog });
});

// Public: Get which providers have OAuth configured (env vars set)
router.get('/configured', (_req: Request, res: Response) => {
  res.json({ configured: getConfiguredProviders() });
});

// Auth required: Start OAuth flow
router.post('/:provider/authorize', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  const { provider } = req.params;
  const { projectId } = req.body;

  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const result = await startFlow(provider, req.user!.id, projectId);
  if (!result) {
    res.status(404).json({ error: `OAuth not configured for provider: ${provider}` });
    return;
  }

  res.json({ authorizationUrl: result.authorizationUrl, state: result.state });
});

// Public: OAuth callback (user's browser redirects here from provider)
router.get('/callback/:provider', async (req: Request, res: Response) => {
  const { provider } = req.params;
  const { code, state, error } = req.query;

  if (error) {
    res.send(callbackPage(false, provider, String(error)));
    return;
  }

  if (!code || !state) {
    res.status(400).send(callbackPage(false, provider, 'Missing code or state'));
    return;
  }

  try {
    const result = await completeFlow(provider, String(code), String(state));
    if (!result) {
      res.send(callbackPage(false, provider, 'Invalid or expired state'));
      return;
    }

    res.send(callbackPage(true, provider));
  } catch (err: any) {
    console.error(`OAuth callback error for ${provider}:`, err);
    res.send(callbackPage(false, provider, err.message));
  }
});

/**
 * Generates a small HTML page that sends a postMessage to the opener (Builder)
 * and closes the popup. The Builder receives { provider, success } and handles it.
 */
function callbackPage(success: boolean, provider: string, error?: string): string {
  return `<!DOCTYPE html>
<html><head><title>OAuth ${success ? 'Complete' : 'Failed'}</title></head>
<body style="background:#0a0a0a;color:#fafafa;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
  <p style="font-size:18px">${success ? 'Connected!' : 'Connection failed'}</p>
  ${error ? `<p style="color:#ef4444;font-size:14px">${error}</p>` : ''}
  <p style="color:#8a8a8a;font-size:12px">This window will close automatically...</p>
</div>
<script>
  const targetOrigin = window.location.origin || 'http://localhost:5173';
  window.opener?.postMessage({ type: 'oauth_complete', provider: '${provider}', success: ${success}${error ? `, error: '${error.replace(/'/g, "\\'")}'` : ''} }, targetOrigin);
  setTimeout(() => window.close(), 1500);
</script>
</body></html>`;
}

export default router;
