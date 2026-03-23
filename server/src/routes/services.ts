/**
 * Service Registry API Routes
 *
 * Serves the dependency catalog to the client for the dependency management
 * UI and connect flows. Also handles project-service instance creation,
 * listing, and removal.
 */

import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  SERVICE_REGISTRY,
  getServiceById,
  getServicesByCategory,
  searchServices,
  getSortedCategories,
} from '../services/index.js';
import { listMcpConnections } from '../mcp/index.js';
import { db } from '../db.js';
import { projectServiceInstances } from '../schema.js';

const router = Router();

/**
 * GET /api/services
 *
 * List all services in the registry. Supports optional category and search filters.
 */
router.get('/', async (req, res) => {
  const { category, search } = req.query;

  let services = SERVICE_REGISTRY;

  if (category && typeof category === 'string') {
    services = getServicesByCategory(category as any);
  }

  if (search && typeof search === 'string') {
    services = searchServices(search);
    // If category filter also set, intersect results
    if (category && typeof category === 'string') {
      const categorySet = new Set(getServicesByCategory(category as any).map(s => s.id));
      services = services.filter(s => categorySet.has(s.id));
    }
  }

  res.json({ services });
});

/**
 * GET /api/services/categories
 *
 * List all service categories with display metadata.
 */
router.get('/categories', (_req, res) => {
  res.json({ categories: getSortedCategories() });
});

/**
 * GET /api/services/user/connections
 *
 * Get all connected services for the authenticated user, enriched with
 * registry metadata. Used by the dependency management view.
 */
router.get('/user/connections', requireAuth as any, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const connections = await listMcpConnections(authReq.user!.id);

    // Enrich each connection with registry data
    const enriched = connections.map(conn => {
      const service = getServiceById(conn.serviceId);
      return {
        ...conn,
        service: service || null,
      };
    });

    res.json({ connections: enriched });
  } catch (err) {
    console.error('[Services] Failed to list user connections:', err);
    res.status(500).json({ error: 'Failed to list connections' });
  }
});

/**
 * GET /api/services/project/:projectId/dependencies
 *
 * List all service instances associated with a project, enriched with
 * registry metadata.
 */
router.get('/project/:projectId/dependencies', requireAuth as any, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { projectId } = req.params;

  try {
    const instances = await db.select()
      .from(projectServiceInstances)
      .where(
        and(
          eq(projectServiceInstances.projectId, projectId),
          eq(projectServiceInstances.userId, authReq.user!.id),
        ),
      );

    // Enrich with registry data
    const enriched = instances.map(inst => ({
      ...inst,
      service: getServiceById(inst.serviceId) || null,
    }));

    res.json({ dependencies: enriched });
  } catch (err) {
    console.error('[Services] Failed to list project dependencies:', err);
    res.status(500).json({ error: 'Failed to list project dependencies' });
  }
});

/**
 * GET /api/services/:serviceId
 *
 * Get a single service by ID.
 */
router.get('/:serviceId', (req, res) => {
  const service = getServiceById(req.params.serviceId);
  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }
  res.json({ service });
});

/**
 * POST /api/services/:serviceId/create-instance
 *
 * After connecting to a service, create the appropriate instance for a project.
 * The instance type depends on the service's instanceModel:
 * - project-per-project: Creates a new project/database at the service
 * - api-key-per-project: Generates a new API key for billing visibility
 * - shared: Associates the existing connection with the project
 *
 * This endpoint records the association in project_service_instances. Actual
 * resource creation at the service is done via MCP tool calls or browser agent.
 */
router.post('/:serviceId/create-instance', requireAuth as any, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { serviceId } = req.params;
  const { projectId, instanceLabel } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  const service = getServiceById(serviceId);
  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }

  // Verify user has a connection to this service
  const connections = await listMcpConnections(authReq.user!.id);
  const connection = connections.find(c => c.serviceId === serviceId);

  if (!connection) {
    return res.status(400).json({ error: 'Not connected to this service. Connect first.' });
  }

  try {
    // Check if already associated
    const existing = await db.select()
      .from(projectServiceInstances)
      .where(
        and(
          eq(projectServiceInstances.projectId, projectId),
          eq(projectServiceInstances.serviceId, serviceId),
        ),
      );

    if (existing.length > 0) {
      return res.json({ instance: { ...existing[0], service } });
    }

    const id = uuid();
    const label = instanceLabel || `${service.name} for project`;

    const [instance] = await db.insert(projectServiceInstances).values({
      id,
      projectId,
      userId: authReq.user!.id,
      serviceId,
      instanceModel: service.instanceModel,
      label,
      status: 'active',
      environment: 'development',
    }).returning();

    res.json({ instance: { ...instance, service } });
  } catch (err) {
    console.error('[Services] Failed to create instance:', err);
    res.status(500).json({ error: 'Failed to create service instance' });
  }
});

/**
 * DELETE /api/services/:serviceId/project/:projectId
 *
 * Remove a service association from a project. Does NOT disconnect the user
 * from the service or delete the account at the service.
 */
router.delete('/:serviceId/project/:projectId', requireAuth as any, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { serviceId, projectId } = req.params;

  try {
    const deleted = await db.delete(projectServiceInstances)
      .where(
        and(
          eq(projectServiceInstances.projectId, projectId),
          eq(projectServiceInstances.serviceId, serviceId),
          eq(projectServiceInstances.userId, authReq.user!.id),
        ),
      )
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Dependency association not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Services] Failed to remove project dependency:', err);
    res.status(500).json({ error: 'Failed to remove dependency' });
  }
});

export default router;
