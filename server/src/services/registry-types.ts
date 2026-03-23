/**
 * Service Registry Types — data structures for the KripTik dependency catalog.
 *
 * Each service entry describes a developer service that KripTik can connect
 * users to via MCP OAuth 2.1 or browser-agent fallback.
 */

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

export type ServiceCategory =
  | 'database'
  | 'hosting'
  | 'auth'
  | 'payments'
  | 'email'
  | 'monitoring'
  | 'ai-ml'
  | 'design'
  | 'communication'
  | 'storage'
  | 'analytics'
  | 'devtools'
  | 'other';

// ---------------------------------------------------------------------------
// Instance model — how dependencies relate to KripTik projects
// ---------------------------------------------------------------------------

/**
 * - project-per-project: Each KripTik project gets its own project/instance
 *   at the service (e.g. Supabase project, Vercel deployment).
 * - api-key-per-project: Same account but a dedicated API key per KripTik
 *   project for billing visibility (e.g. fal.ai, Replicate).
 * - shared: One instance covers all projects (e.g. Sentry org, monitoring).
 */
export type InstanceModel = 'project-per-project' | 'api-key-per-project' | 'shared';

// ---------------------------------------------------------------------------
// MCP connection info
// ---------------------------------------------------------------------------

export interface McpServerInfo {
  /** Full URL to the service's remote MCP endpoint, e.g. "https://mcp.supabase.com/mcp" */
  url: string;
  /** Authentication method the MCP server expects */
  authMethod: 'oauth' | 'api-key' | 'bearer-token';
  /** Optional SSE fallback URL if the service supports it */
  sseFallbackUrl?: string;
}

// ---------------------------------------------------------------------------
// Pricing tiers
// ---------------------------------------------------------------------------

export interface PricingTier {
  /** Display name, e.g. "Free", "Pro", "Enterprise" */
  name: string;
  /** Monthly price in USD. 0 = free tier. -1 = custom/contact-sales. */
  price: number;
  /** Short description of what this tier includes */
  description: string;
}

// ---------------------------------------------------------------------------
// Service entry — the core registry record
// ---------------------------------------------------------------------------

export interface ServiceRegistryEntry {
  /** Unique slug, e.g. "supabase", "vercel", "fal-ai" */
  id: string;
  /** Display name, e.g. "Supabase", "Vercel", "fal.ai" */
  name: string;
  /** One-sentence description of the service */
  description: string;
  /** Official website URL */
  websiteUrl: string;
  /** Category for filtering and grouping */
  category: ServiceCategory;

  /** simple-icons slug for branded logo lookup (lowercase, no spaces) */
  iconSlug: string;
  /** Brand primary hex color for accent theming, e.g. "#3ECF8E" */
  brandColor: string;

  /** MCP server info — null if the service has no MCP server (fallback required) */
  mcp: McpServerInfo | null;
  /** Whether browser-agent fallback is available for signup */
  browserFallbackAvailable: boolean;

  /** How this service maps to KripTik projects */
  instanceModel: InstanceModel;

  /** Pricing tiers — empty array if pricing is unknown or varies */
  pricing: PricingTier[];

  /** Tags for search/filtering beyond category */
  tags: string[];
}

// ---------------------------------------------------------------------------
// Custom MCP server — user-added servers not in the built-in catalog
// ---------------------------------------------------------------------------

export interface CustomMcpServerEntry {
  /** User-provided identifier */
  id: string;
  /** Display name */
  name: string;
  /** Optional description */
  description: string;
  /** MCP server URL */
  mcpServerUrl: string;
  /** The user who added this */
  userId: string;
  /** Timestamp */
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Category display metadata
// ---------------------------------------------------------------------------

export interface CategoryMeta {
  id: ServiceCategory;
  /** Display label */
  label: string;
  /** Short description */
  description: string;
  /** Sort order for UI display */
  sortOrder: number;
}
