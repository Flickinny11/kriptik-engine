import type { Request, Response, NextFunction } from 'express';
import { auth } from '../auth.js';

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; name: string; image?: string | null };
  session?: { id: string; token: string; expiresAt: Date };
}

/**
 * Populates req.user from session cookie if present. Does NOT enforce auth.
 */
export async function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (session?.user) {
      req.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
      };
      req.session = {
        id: session.session.id,
        token: session.session.token,
        expiresAt: session.session.expiresAt,
      };
    }
  } catch {
    // No valid session — that's fine
  }
  next();
}

/**
 * Requires a valid session. Returns 401 if not authenticated.
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  await optionalAuth(req, res, () => {});
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}
