import { Router, type Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { projects } from '../schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth as any);

// Reserved subdomains that can't be used as app slugs
const RESERVED_SLUGS = new Set([
  'api', 'app', 'www', 'admin', 'dashboard', 'login', 'signup',
  'auth', 'oauth', 'billing', 'docs', 'help', 'support', 'status',
  'blog', 'about', 'legal', 'privacy', 'terms', 'mail', 'ftp',
  'cdn', 'assets', 'static', 'media', 'preview',
]);

/**
 * Validate an app slug for use as a subdomain.
 * Must be: lowercase, alphanumeric + hyphens, 3-63 chars, not reserved.
 */
function validateSlug(slug: string): string | null {
  if (!slug || slug.length < 3 || slug.length > 63) {
    return 'Slug must be 3-63 characters';
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return 'Slug must be lowercase letters, numbers, and hyphens (cannot start/end with hyphen)';
  }
  if (RESERVED_SLUGS.has(slug)) {
    return `"${slug}" is reserved and cannot be used`;
  }
  return null;
}

// Check if a slug is available
router.get('/check-slug', async (req: AuthenticatedRequest, res: Response) => {
  const slug = (req.query.slug as string || '').toLowerCase().trim();

  const error = validateSlug(slug);
  if (error) {
    res.json({ available: false, error });
    return;
  }

  const [existing] = await db.select({ id: projects.id })
    .from(projects)
    .where(eq(projects.appSlug, slug))
    .limit(1);

  res.json({
    available: !existing,
    slug,
    url: `https://${slug}.kriptik.app`,
  });
});

// Set or update a project's app slug
router.put('/:projectId/slug', async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params;
  const slug = (req.body.slug as string || '').toLowerCase().trim();

  // Verify ownership
  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, req.user!.id)));
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const error = validateSlug(slug);
  if (error) {
    res.status(400).json({ error });
    return;
  }

  // Check uniqueness (exclude current project)
  const [existing] = await db.select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.appSlug, slug)));
  if (existing && existing.id !== projectId) {
    res.status(409).json({ error: `"${slug}" is already taken`, suggestions: suggestAlternatives(slug) });
    return;
  }

  await db.update(projects)
    .set({ appSlug: slug, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  res.json({
    slug,
    url: `https://${slug}.kriptik.app`,
  });
});

// Publish a project — marks it as published and sets the slug
router.post('/:projectId/publish', async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params;

  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, req.user!.id)));
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Auto-generate slug if not set
  let slug = project.appSlug;
  if (!slug) {
    slug = generateSlug(project.name);
    // Ensure uniqueness
    let attempt = slug;
    let suffix = 0;
    while (true) {
      const [existing] = await db.select({ id: projects.id })
        .from(projects)
        .where(eq(projects.appSlug, attempt));
      if (!existing || existing.id === projectId) break;
      suffix++;
      attempt = `${slug}-${suffix}`;
    }
    slug = attempt;
  }

  const version = (project.publishedVersion || 0) + 1;

  // For Prism projects, deploy the bundle to Vercel with the slug domain
  let deploymentUrl: string | undefined;
  if (project.engineType === 'prism') {
    try {
      const { deployToVercel } = await import('../utils/vercel-deploy.js');
      const { prismGraphs } = await import('../schema.js');

      // Find the latest graph version for this project
      const graph = await db.query.prismGraphs.findFirst({
        where: eq(prismGraphs.projectId, projectId),
        orderBy: (g, { desc }) => [desc(g.version)],
      });

      if (graph) {
        const vercelProjectName = `kriptik-prism-${projectId.slice(0, 8)}`;
        const result = await deployToVercel({
          projectId,
          graphVersion: graph.version,
          vercelProjectName,
          slug,
        });

        if (result.success) {
          deploymentUrl = result.productionUrl || result.deploymentUrl;
        }
      }
    } catch (err) {
      // Vercel deployment is best-effort during publish.
      // The project is still marked as published even if deploy fails,
      // since the preview URL (Modal tunnel) remains available.
      console.error('Prism Vercel deploy during publish failed:', err);
    }
  }

  await db.update(projects)
    .set({
      appSlug: slug,
      isPublished: true,
      publishedAt: new Date(),
      publishedVersion: version,
      ...(deploymentUrl ? { previewUrl: deploymentUrl } : {}),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  res.json({
    published: true,
    slug,
    url: `https://${slug}.kriptik.app`,
    version,
    deploymentUrl,
  });
});

// Unpublish a project
router.post('/:projectId/unpublish', async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params;

  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, req.user!.id)));
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  await db.update(projects)
    .set({ isPublished: false, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  res.json({ published: false });
});

// Resolve a subdomain to a project (used by frontend middleware)
router.get('/resolve/:slug', async (_req: AuthenticatedRequest, res: Response) => {
  const slug = _req.params.slug.toLowerCase();

  const [project] = await db.select({
    id: projects.id,
    name: projects.name,
    ownerId: projects.ownerId,
    isPublished: projects.isPublished,
    sandboxPath: projects.sandboxPath,
    previewUrl: projects.previewUrl,
  }).from(projects)
    .where(and(eq(projects.appSlug, slug), eq(projects.isPublished, true)));

  if (!project) {
    res.status(404).json({ error: 'App not found' });
    return;
  }

  res.json({ project });
});

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'my-app';
}

function suggestAlternatives(slug: string): string[] {
  const suffix = Math.random().toString(36).slice(2, 6);
  return [
    `${slug}-${suffix}`,
    `${slug}-app`,
    `${slug}-${new Date().getFullYear()}`,
  ];
}

export default router;
