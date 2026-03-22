import { Router, type Response } from 'express';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../db.js';
import { account } from '../schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { createGitHubProvider } from '../oauth/providers/github.js';

const router = Router();

// All GitHub routes require authentication
router.use(requireAuth as any);

const CALLBACK_BASE = process.env.API_URL || 'http://localhost:3001';

// ── GET /api/github/connection ─────────────────────────────────────
// Returns GitHub connection status for the authenticated user
router.get('/connection', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [ghAccount] = await db.select({
      id: account.id,
      accountId: account.accountId,
      scope: account.scope,
      createdAt: account.createdAt,
    }).from(account)
      .where(and(
        eq(account.userId, req.user!.id),
        eq(account.providerId, 'github'),
      ))
      .limit(1);

    if (!ghAccount) {
      res.json({ connected: false });
      return;
    }

    // Fetch username and avatar from GitHub API if we have a token
    let username: string | undefined;
    let avatarUrl: string | undefined;

    const [fullAccount] = await db.select({
      accessToken: account.accessToken,
    }).from(account)
      .where(eq(account.id, ghAccount.id))
      .limit(1);

    if (fullAccount?.accessToken) {
      try {
        const userResponse = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `Bearer ${fullAccount.accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        });
        if (userResponse.ok) {
          const user = await userResponse.json();
          username = user.login;
          avatarUrl = user.avatar_url;
        }
      } catch {
        // Best-effort — don't fail the connection check
      }
    }

    res.json({
      connected: true,
      username,
      avatarUrl,
      scope: ghAccount.scope ?? undefined,
      connectedAt: ghAccount.createdAt,
    });
  } catch (err) {
    console.error('Failed to get GitHub connection:', err);
    res.status(500).json({ error: 'Failed to get GitHub connection status' });
  }
});

// ── GET /api/github/auth/url ───────────────────────────────────────
// Returns the GitHub OAuth authorization URL with CSRF state
router.get('/auth/url', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const redirectUri = `${CALLBACK_BASE}/api/oauth/callback/github`;
    const provider = createGitHubProvider(redirectUri);

    if (!provider) {
      res.status(503).json({ error: 'GitHub OAuth is not configured' });
      return;
    }

    const state = crypto.randomBytes(32).toString('hex');

    const authorizationUrl = provider.getAuthorizationUrl(state);
    res.json({ authorizationUrl, state });
  } catch (err) {
    console.error('Failed to generate GitHub auth URL:', err);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

// ── GET /api/github/repos ──────────────────────────────────────────
// Returns the user's GitHub repositories
router.get('/repos', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [ghAccount] = await db.select({
      accessToken: account.accessToken,
    }).from(account)
      .where(and(
        eq(account.userId, req.user!.id),
        eq(account.providerId, 'github'),
      ))
      .limit(1);

    if (!ghAccount?.accessToken) {
      res.status(404).json({ error: 'GitHub account not connected' });
      return;
    }

    const response = await fetch(
      'https://api.github.com/user/repos?sort=updated&per_page=30',
      {
        headers: {
          'Authorization': `Bearer ${ghAccount.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      },
    );

    if (!response.ok) {
      if (response.status === 401) {
        res.status(401).json({ error: 'GitHub token expired or revoked. Please reconnect.' });
        return;
      }
      res.status(response.status).json({ error: `GitHub API error: ${response.status}` });
      return;
    }

    const repos = await response.json();

    res.json({
      repos: repos.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        private: repo.private,
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        sshUrl: repo.ssh_url,
        defaultBranch: repo.default_branch,
        language: repo.language,
        stargazersCount: repo.stargazers_count,
        forksCount: repo.forks_count,
        updatedAt: repo.updated_at,
      })),
    });
  } catch (err) {
    console.error('Failed to fetch GitHub repos:', err);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// ── DELETE /api/github/connection ──────────────────────────────────
// Disconnect GitHub account
router.delete('/connection', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await db.delete(account)
      .where(and(
        eq(account.userId, req.user!.id),
        eq(account.providerId, 'github'),
      ));

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to disconnect GitHub:', err);
    res.status(500).json({ error: 'Failed to disconnect GitHub' });
  }
});

export default router;
