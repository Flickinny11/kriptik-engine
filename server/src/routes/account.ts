import { Router } from 'express';
import { eq, sql, count } from 'drizzle-orm';
import { db } from '../db.js';
import { users, projects, session, account, creditTransactions, buildEvents } from '../schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { auth } from '../auth.js';

const router = Router();

// All account routes require authentication
router.use(requireAuth as any);

// ── GET /api/account/profile ───────────────────────────────────────
// Returns the full user profile with credits, tier, etc.
router.get('/profile', async (req: AuthenticatedRequest, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        slug: user.slug,
        credits: user.credits ?? 0,
        tier: user.tier ?? 'free',
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error('Failed to get profile:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// ── PUT /api/account/profile ───────────────────────────────────────
// Update name, image, or slug
router.put('/profile', async (req: AuthenticatedRequest, res) => {
  try {
    const { name, image, slug } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 1) {
        return res.status(400).json({ error: 'Name must be at least 1 character' });
      }
      updates.name = name.trim();
    }

    if (image !== undefined) {
      updates.image = image;
    }

    if (slug !== undefined) {
      if (typeof slug !== 'string') {
        return res.status(400).json({ error: 'Invalid slug' });
      }
      const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (cleanSlug.length < 3) {
        return res.status(400).json({ error: 'Slug must be at least 3 characters' });
      }
      if (cleanSlug.length > 30) {
        return res.status(400).json({ error: 'Slug must be 30 characters or fewer' });
      }
      // Check uniqueness
      const [existing] = await db.select({ id: users.id }).from(users)
        .where(eq(users.slug, cleanSlug)).limit(1);
      if (existing && existing.id !== req.user!.id) {
        return res.status(409).json({ error: 'Slug is already taken' });
      }
      updates.slug = cleanSlug;
    }

    const [updated] = await db.update(users).set(updates).where(eq(users.id, req.user!.id)).returning();
    res.json({
      profile: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        image: updated.image,
        slug: updated.slug,
        credits: updated.credits ?? 0,
        tier: updated.tier ?? 'free',
        emailVerified: updated.emailVerified,
        createdAt: updated.createdAt,
      },
    });
  } catch (err) {
    console.error('Failed to update profile:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ── PUT /api/account/password ──────────────────────────────────────
// Change password — uses Better Auth's built-in password change
router.put('/password', async (req: AuthenticatedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    // Use Better Auth's changePassword API
    await auth.api.changePassword({
      body: { currentPassword, newPassword },
      headers: req.headers as any,
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to change password:', err);
    const message = err?.message || 'Failed to change password';
    res.status(400).json({ error: message });
  }
});

// ── GET /api/account/sessions ──────────────────────────────────────
// List active sessions for the user
router.get('/sessions', async (req: AuthenticatedRequest, res) => {
  try {
    const activeSessions = await db.select({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    }).from(session)
      .where(eq(session.userId, req.user!.id))
      .orderBy(session.createdAt);

    const currentSessionId = req.session?.id;

    res.json({
      sessions: activeSessions.map(s => ({
        ...s,
        isCurrent: s.id === currentSessionId,
      })),
    });
  } catch (err) {
    console.error('Failed to get sessions:', err);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// ── DELETE /api/account/sessions/:sessionId ────────────────────────
// Revoke a specific session
router.delete('/sessions/:sessionId', async (req: AuthenticatedRequest, res) => {
  try {
    const { sessionId } = req.params;
    // Don't allow revoking current session via this endpoint (use logout)
    if (sessionId === req.session?.id) {
      return res.status(400).json({ error: 'Cannot revoke current session. Use logout instead.' });
    }

    await db.delete(session)
      .where(eq(session.id, sessionId));

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to revoke session:', err);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// ── GET /api/account/usage ─────────────────────────────────────────
// Usage stats: project count, total credits used, recent builds
router.get('/usage', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    // Project count
    const [projectCount] = await db.select({ count: count() })
      .from(projects)
      .where(eq(projects.ownerId, userId));

    // Total credits used (sum of negative transactions)
    const [creditsUsed] = await db.select({
      total: sql<number>`COALESCE(SUM(ABS(${creditTransactions.amount})), 0)`,
    }).from(creditTransactions)
      .where(eq(creditTransactions.userId, userId));

    // Recent build projects with status
    const recentProjects = await db.select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      createdAt: projects.createdAt,
    }).from(projects)
      .where(eq(projects.ownerId, userId))
      .orderBy(sql`${projects.createdAt} DESC`)
      .limit(20);

    // Credit transaction history (last 50)
    const transactions = await db.select().from(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
      .orderBy(sql`${creditTransactions.createdAt} DESC`)
      .limit(50);

    res.json({
      usage: {
        totalProjects: projectCount?.count ?? 0,
        totalCreditsUsed: creditsUsed?.total ?? 0,
        recentProjects,
        transactions,
      },
    });
  } catch (err) {
    console.error('Failed to get usage:', err);
    res.status(500).json({ error: 'Failed to get usage' });
  }
});

// ── GET /api/account/oauth-connections ─────────────────────────────
// Connected OAuth providers (Google, GitHub)
router.get('/oauth-connections', async (req: AuthenticatedRequest, res) => {
  try {
    const connections = await db.select({
      id: account.id,
      providerId: account.providerId,
      accountId: account.accountId,
      createdAt: account.createdAt,
    }).from(account)
      .where(eq(account.userId, req.user!.id));

    // Filter to social providers only (not 'credential' which is email/password)
    const socialConnections = connections.filter(c => c.providerId !== 'credential');

    res.json({ connections: socialConnections });
  } catch (err) {
    console.error('Failed to get OAuth connections:', err);
    res.status(500).json({ error: 'Failed to get connections' });
  }
});

// ── DELETE /api/account ────────────────────────────────────────────
// Delete user account and all associated data
router.delete('/', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    // Cascade deletes handle most cleanup via FK constraints
    // But let's be explicit for safety
    await db.delete(creditTransactions).where(eq(creditTransactions.userId, userId));
    await db.delete(session).where(eq(session.userId, userId));
    await db.delete(account).where(eq(account.userId, userId));
    // Projects cascade will handle buildEvents, credentials
    await db.delete(projects).where(eq(projects.ownerId, userId));
    await db.delete(users).where(eq(users.id, userId));

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete account:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;
