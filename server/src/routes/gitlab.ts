import { Router, type Response } from 'express';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../db.js';
import { account } from '../schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// All GitLab routes require authentication
router.use(requireAuth as any);

const CALLBACK_BASE = process.env.API_URL || 'http://localhost:3001';

// ── GET /api/gitlab/connection ─────────────────────────────────────
// Returns GitLab connection status for the authenticated user
router.get('/connection', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [glAccount] = await db.select({
      id: account.id,
      accountId: account.accountId,
      scope: account.scope,
      createdAt: account.createdAt,
    }).from(account)
      .where(and(
        eq(account.userId, req.user!.id),
        eq(account.providerId, 'gitlab'),
      ))
      .limit(1);

    if (!glAccount) {
      res.json({ connected: false });
      return;
    }

    // Fetch username and avatar from GitLab API
    let username: string | undefined;
    let avatarUrl: string | undefined;

    const [fullAccount] = await db.select({
      accessToken: account.accessToken,
    }).from(account)
      .where(eq(account.id, glAccount.id))
      .limit(1);

    if (fullAccount?.accessToken) {
      try {
        const userResponse = await fetch('https://gitlab.com/api/v4/user', {
          headers: {
            'Authorization': `Bearer ${fullAccount.accessToken}`,
          },
        });
        if (userResponse.ok) {
          const user = await userResponse.json();
          username = user.username;
          avatarUrl = user.avatar_url;
        }
      } catch {
        // Best-effort
      }
    }

    res.json({
      connected: true,
      username,
      avatarUrl,
    });
  } catch (err) {
    console.error('Failed to get GitLab connection:', err);
    res.status(500).json({ error: 'Failed to get GitLab connection status' });
  }
});

// ── GET /api/gitlab/auth/url ───────────────────────────────────────
// Returns the GitLab OAuth authorization URL with CSRF state
router.get('/auth/url', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = process.env.GITLAB_CLIENT_ID;
    if (!clientId) {
      res.status(503).json({ error: 'GitLab OAuth is not configured' });
      return;
    }

    const state = crypto.randomBytes(32).toString('hex');
    const redirectUri = `${CALLBACK_BASE}/api/oauth/callback/gitlab`;
    const scopes = 'api read_user read_repository';

    const url = `https://gitlab.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}`;

    res.json({ url, state });
  } catch (err) {
    console.error('Failed to generate GitLab auth URL:', err);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

// ── GET /api/gitlab/repos ──────────────────────────────────────────
// Returns the user's GitLab repositories
router.get('/repos', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [glAccount] = await db.select({
      accessToken: account.accessToken,
    }).from(account)
      .where(and(
        eq(account.userId, req.user!.id),
        eq(account.providerId, 'gitlab'),
      ))
      .limit(1);

    if (!glAccount?.accessToken) {
      res.status(404).json({ error: 'GitLab account not connected' });
      return;
    }

    const response = await fetch(
      'https://gitlab.com/api/v4/projects?membership=true&order_by=last_activity_at&per_page=30',
      {
        headers: {
          'Authorization': `Bearer ${glAccount.accessToken}`,
        },
      },
    );

    if (!response.ok) {
      if (response.status === 401) {
        res.status(401).json({ error: 'GitLab token expired or revoked. Please reconnect.' });
        return;
      }
      res.status(response.status).json({ error: `GitLab API error: ${response.status}` });
      return;
    }

    const projects = await response.json();

    // Map GitLab project shape to match our GitHubRepo interface for frontend reuse
    res.json({
      repos: projects.map((project: any) => ({
        id: project.id,
        name: project.name,
        fullName: project.path_with_namespace,
        description: project.description,
        private: project.visibility === 'private',
        htmlUrl: project.web_url,
        cloneUrl: project.http_url_to_repo,
        sshUrl: project.ssh_url_to_repo,
        defaultBranch: project.default_branch,
        language: null, // GitLab doesn't include language in list endpoint
        stargazersCount: project.star_count,
        forksCount: project.forks_count,
        updatedAt: project.last_activity_at,
      })),
    });
  } catch (err) {
    console.error('Failed to fetch GitLab repos:', err);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// ── DELETE /api/gitlab/connection ──────────────────────────────────
// Disconnect GitLab account
router.delete('/connection', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await db.delete(account)
      .where(and(
        eq(account.userId, req.user!.id),
        eq(account.providerId, 'gitlab'),
      ));

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to disconnect GitLab:', err);
    res.status(500).json({ error: 'Failed to disconnect GitLab' });
  }
});

export default router;
