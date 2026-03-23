/**
 * Custom MCP Server management — lets users add their own MCP servers
 * that are not in the built-in catalog.
 *
 * Custom servers are stored in the database and treated as first-class
 * entries in the dependency catalog alongside built-in services.
 */

import type { CustomMcpServerEntry, ServiceRegistryEntry } from './registry-types.js';

/**
 * Convert a user-added custom MCP server into a ServiceRegistryEntry
 * so it can be displayed alongside built-in services in the catalog.
 */
export function customServerToRegistryEntry(custom: CustomMcpServerEntry): ServiceRegistryEntry {
  return {
    id: `custom:${custom.id}`,
    name: custom.name,
    description: custom.description || `Custom MCP server at ${custom.mcpServerUrl}`,
    websiteUrl: custom.mcpServerUrl,
    category: 'other',
    iconSlug: 'mcp',
    brandColor: '#7C3AED',
    mcp: {
      url: custom.mcpServerUrl,
      authMethod: 'oauth',
    },
    browserFallbackAvailable: false,
    instanceModel: 'shared',
    pricing: [],
    tags: ['custom', 'mcp'],
  };
}

/** Validate a custom MCP server URL */
export function validateMcpServerUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, error: 'URL must use https:// or http://' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/** Check if a service ID represents a custom (user-added) MCP server */
export function isCustomService(serviceId: string): boolean {
  return serviceId.startsWith('custom:');
}

/** Extract the original custom server ID from a prefixed service ID */
export function getCustomServerId(serviceId: string): string | null {
  if (!serviceId.startsWith('custom:')) return null;
  return serviceId.slice('custom:'.length);
}
