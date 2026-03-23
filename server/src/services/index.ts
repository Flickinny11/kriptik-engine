/**
 * Service Registry — public API.
 *
 * Exports the full service catalog, types, categories, and custom server
 * utilities for use by routes, agents, and the client API.
 */

// Types
export type {
  ServiceCategory,
  InstanceModel,
  McpServerInfo,
  PricingTier,
  ServiceRegistryEntry,
  CustomMcpServerEntry,
  CategoryMeta,
} from './registry-types.js';

// Registry data and helpers
export {
  SERVICE_REGISTRY,
  getServiceById,
  getServicesByCategory,
  getMcpEnabledServices,
  getFallbackServices,
  searchServices,
  getActiveCategories,
} from './registry.js';

// Category metadata
export {
  CATEGORIES,
  getCategoryMeta,
  getSortedCategories,
} from './categories.js';

// Custom MCP server utilities
export {
  customServerToRegistryEntry,
  validateMcpServerUrl,
  isCustomService,
  getCustomServerId,
} from './custom-servers.js';
