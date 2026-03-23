/**
 * Service Registry API Routes
 *
 * Serves the dependency catalog to the client for the dependency management
 * UI and connect flows. Also handles post-connection instance creation.
 */

import { Router } from 'express';
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
 * POST /api/services/:serviceId/create-instance
 *
 * After connecting to a service, create the appropriate instance for a project.
 * The instance type depends on the service's instanceModel:
 * - project-per-project: Creates a new project/database at the service
 * - api-key-per-project: Generates a new API key for billing visibility
 * - shared: Associates the existing connection with the project
 *
 * This endpoint records the association. Actual resource creation at the service
 * is done via MCP tool calls (handled separately by the agent or connect flow).
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

  // Return the instance model info — actual resource creation happens via MCP tools
  // or browser agent, depending on the service
  res.json({
    instance: {
      serviceId,
      projectId,
      instanceModel: service.instanceModel,
      label: instanceLabel || `${service.name} for project`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  });
});

export default router;
