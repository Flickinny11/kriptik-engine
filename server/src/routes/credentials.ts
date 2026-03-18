import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { verifyProjectOwnership } from '../middleware/ownership.js';
import { listCredentials, revokeCredential } from '../vault/vault-service.js';

const router = Router();
router.use(requireAuth as any);

// List connected services for a project
router.get('/:projectId', async (req: AuthenticatedRequest, res: Response) => {
  const project = await verifyProjectOwnership(req, req.params.projectId);
  if (!project) {
    res.status(403).json({ error: 'Project not found or access denied' });
    return;
  }
  const creds = await listCredentials(req.user!.id, req.params.projectId);
  res.json({ credentials: creds });
});

// Revoke a credential
router.delete('/:projectId/:providerId', async (req: AuthenticatedRequest, res: Response) => {
  const project = await verifyProjectOwnership(req, req.params.projectId);
  if (!project) {
    res.status(403).json({ error: 'Project not found or access denied' });
    return;
  }
  const revoked = await revokeCredential(req.user!.id, req.params.projectId, req.params.providerId);
  res.json({ success: revoked });
});

export default router;
