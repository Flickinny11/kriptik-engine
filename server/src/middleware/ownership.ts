/**
 * Project ownership verification.
 *
 * Every project-scoped endpoint MUST verify the requesting user owns the project.
 * This prevents any authenticated user from accessing another user's build data,
 * events, credentials, or engine controls by guessing a project ID.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { projects } from '../schema.js';
import type { AuthenticatedRequest } from './auth.js';

/**
 * Verifies the authenticated user owns the given project.
 * Returns the project row if owned, null if not found or not owned.
 */
export async function verifyProjectOwnership(
  req: AuthenticatedRequest,
  projectId: string,
): Promise<typeof projects.$inferSelect | null> {
  if (!req.user) return null;

  const [project] = await db.select().from(projects).where(
    and(eq(projects.id, projectId), eq(projects.ownerId, req.user.id)),
  );

  return project || null;
}
