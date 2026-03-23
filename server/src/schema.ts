import { pgTable, text, boolean, integer, timestamp, jsonb, serial, uniqueIndex, index } from 'drizzle-orm/pg-core';

// ── Better Auth managed tables ──────────────────────────────────────

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  emailVerified: boolean('email_verified').default(false),
  image: text('image'),
  slug: text('slug').unique(),               // user's namespace for app URLs
  credits: integer('credits').default(500),
  tier: text('tier').default('free'),
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  scope: text('scope'),
  password: text('password'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Better Auth with usePlural expects: users, sessions, accounts, verifications
export const sessions = session;
export const accounts = account;

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const verifications = verification;

// ── App tables ──────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').default('idle'), // idle | building | complete | failed
  engineSessionId: text('engine_session_id'),
  brainDbPath: text('brain_db_path'),       // path to this project's brain.db
  sandboxPath: text('sandbox_path'),         // path to this project's sandbox directory
  // App hosting — {appSlug}.kriptik.app
  appSlug: text('app_slug'),                 // user-customizable subdomain
  isPublished: boolean('is_published').default(false),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishedVersion: integer('published_version').default(0),
  customDomain: text('custom_domain'),       // future: user's own domain
  previewUrl: text('preview_url'),           // Modal tunnel or dev server URL
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('projects_app_slug_unique').on(table.appSlug),
]);

// Encrypted credential storage — per user, per project, per service
export const credentials = pgTable('credentials', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  encryptedTokens: jsonb('encrypted_tokens').notNull(), // AES-256-GCM envelope
  providerUserId: text('provider_user_id'),
  providerEmail: text('provider_email'),
  status: text('status').default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('credentials_user_project_provider').on(table.userId, table.projectId, table.providerId),
]);

// Short-lived OAuth state tokens for PKCE flow
export const oauthStates = pgTable('oauth_states', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  providerId: text('provider_id').notNull(),
  projectId: text('project_id'),
  codeVerifier: text('code_verifier').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Credit transaction ledger — tracks all credit movements
export const creditTransactions = pgTable('credit_transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),             // 'purchase' | 'build_deduction' | 'bonus' | 'refund'
  amount: integer('amount').notNull(),       // positive = credits in, negative = credits out
  balance: integer('balance').notNull(),     // balance after this transaction
  description: text('description'),
  projectId: text('project_id'),
  stripeSessionId: text('stripe_session_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_credit_transactions_user_id').on(table.userId),
]);

// Append-only log of engine SSE events — for chat replay when user returns
export const buildEvents = pgTable('build_events', {
  id: serial('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  eventData: jsonb('event_data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_build_events_project_id').on(table.projectId),
]);

// ── Project-service instances ────────────────────────────────────────
// Tracks which services are associated with which projects, with per-instance metadata.

export const projectServiceInstances = pgTable('project_service_instances', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  serviceId: text('service_id').notNull(),
  instanceModel: text('instance_model').notNull(), // project-per-project | api-key-per-project | shared
  label: text('label'),
  status: text('status').default('active'),        // active | pending | error
  environment: text('environment').default('development'), // development | staging | production
  externalId: text('external_id'),                 // Project/instance ID at the service
  apiKeyMasked: text('api_key_masked'),            // Masked API key for display
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('project_service_instances_project_service').on(table.projectId, table.serviceId),
  index('idx_project_service_instances_project').on(table.projectId),
  index('idx_project_service_instances_user').on(table.userId),
]);

// ── MCP tables ──────────────────────────────────────────────────────

// MCP service connections — per user, per service (shared across projects)
export const mcpConnections = pgTable('mcp_connections', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  serviceId: text('service_id').notNull(),
  mcpServerUrl: text('mcp_server_url').notNull(),
  authServerIssuer: text('auth_server_issuer').notNull(),
  encryptedTokens: jsonb('encrypted_tokens').notNull(),       // AES-256-GCM envelope
  encryptedRegistration: jsonb('encrypted_registration'),      // Client registration credentials
  status: text('status').default('connected'),                 // connected | needs_reauth | error | disconnected
  connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('mcp_connections_user_service').on(table.userId, table.serviceId),
  index('idx_mcp_connections_user_id').on(table.userId),
]);

// MCP tool cache — stores discovered tools/list results per service
export const mcpToolCaches = pgTable('mcp_tool_caches', {
  id: text('id').primaryKey(),
  serviceId: text('service_id').notNull().unique(),
  tools: jsonb('tools').notNull(),                             // McpToolDefinition[]
  cachedAt: timestamp('cached_at', { withTimezone: true }).defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('idx_mcp_tool_caches_service').on(table.serviceId),
]);

// MCP OAuth state — extends oauth_states pattern for MCP-specific fields
export const mcpOauthStates = pgTable('mcp_oauth_states', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  serviceId: text('service_id').notNull(),
  mcpServerUrl: text('mcp_server_url').notNull(),
  authServerIssuer: text('auth_server_issuer').notNull(),
  clientId: text('client_id').notNull(),
  clientSecret: text('client_secret'),
  codeVerifier: text('code_verifier').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  resource: text('resource'),                                  // RFC 8707 resource indicator
  scopes: text('scopes'),                                      // Space-separated scopes
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
