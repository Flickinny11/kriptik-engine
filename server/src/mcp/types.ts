/**
 * MCP Client Types
 *
 * Type definitions for the Model Context Protocol client implementation.
 * Covers OAuth 2.1 + PKCE authorization, metadata discovery, dynamic client
 * registration, token management, and tool schema caching.
 */

// ── Connection State ────────────────────────────────────────────────

export type McpConnectionStatus =
  | 'disconnected'
  | 'discovering'
  | 'registering'
  | 'authorizing'
  | 'connected'
  | 'refreshing'
  | 'error'
  | 'needs_reauth';

export interface McpConnectionState {
  serviceId: string;
  mcpServerUrl: string;
  status: McpConnectionStatus;
  error?: string;
  connectedAt?: string;
  lastToolRefresh?: string;
}

// ── RFC 9728: Protected Resource Metadata ───────────────────────────

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
  resource_signing_alg_values_supported?: string[];
  resource_documentation?: string;
}

// ── RFC 8414: Authorization Server Metadata ─────────────────────────

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
  introspection_endpoint?: string;
  jwks_uri?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
}

// ── RFC 7591: Dynamic Client Registration ───────────────────────────

export interface DynamicClientRegistrationRequest {
  client_name: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
  scope?: string;
  contacts?: string[];
  logo_uri?: string;
  client_uri?: string;
  policy_uri?: string;
  tos_uri?: string;
  software_id?: string;
  software_version?: string;
}

export interface DynamicClientRegistrationResponse {
  client_id: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
  redirect_uris?: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
  scope?: string;
  registration_access_token?: string;
  registration_client_uri?: string;
}

// ── OAuth 2.1 Token Types ───────────────────────────────────────────

export interface McpTokenPayload {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: string;
  scope?: string;
}

export interface McpTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

// ── PKCE Types ──────────────────────────────────────────────────────

export interface PkceChallenge {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

// ── MCP Tool Schema (from tools/list) ───────────────────────────────

export interface McpToolInputSchema {
  type: 'object';
  properties?: Record<string, McpToolPropertySchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface McpToolPropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: McpToolPropertySchema;
  properties?: Record<string, McpToolPropertySchema>;
  required?: string[];
  default?: unknown;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: McpToolInputSchema;
}

export interface McpToolsListResponse {
  tools: McpToolDefinition[];
}

// ── Service Metadata (cached per service) ───────────────────────────

export interface McpServiceMetadata {
  serviceId: string;
  mcpServerUrl: string;
  resourceMetadata: ProtectedResourceMetadata;
  authServerMetadata: AuthorizationServerMetadata;
  discoveredAt: string;
}

// ── Client Registration (cached per auth server) ────────────────────

export interface McpClientRegistration {
  authServerIssuer: string;
  clientId: string;
  clientSecret?: string;
  clientIdIssuedAt?: number;
  clientSecretExpiresAt?: number;
  registeredAt: string;
}

// ── Stored MCP Connection (per user, per service) ───────────────────

export interface StoredMcpConnection {
  id: string;
  userId: string;
  serviceId: string;
  mcpServerUrl: string;
  authServerIssuer: string;
  clientId: string;
  status: McpConnectionStatus;
  connectedAt?: string;
  lastRefreshedAt?: string;
}

// ── Tool Cache Entry ────────────────────────────────────────────────

export interface McpToolCache {
  serviceId: string;
  tools: McpToolDefinition[];
  cachedAt: string;
  expiresAt: string;
}

// ── MCP OAuth State (extends existing oauth_states) ─────────────────

export interface McpOAuthFlowState {
  userId: string;
  serviceId: string;
  mcpServerUrl: string;
  authServerIssuer: string;
  clientId: string;
  codeVerifier: string;
  redirectUri: string;
  resource?: string;
  scopes?: string[];
  expiresAt: Date;
}

// ── MCP Client Configuration ────────────────────────────────────────

export interface McpClientConfig {
  callbackBaseUrl: string;
  clientName: string;
  clientUri?: string;
  softwareId?: string;
  softwareVersion?: string;
  tokenCacheTtlMs: number;
  toolCacheTtlMs: number;
  metadataFetchTimeoutMs: number;
}

// ── Error Types ─────────────────────────────────────────────────────

export class McpDiscoveryError extends Error {
  constructor(
    message: string,
    public readonly serviceUrl: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'McpDiscoveryError';
  }
}

export class McpAuthError extends Error {
  constructor(
    message: string,
    public readonly serviceId: string,
    public readonly errorCode?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'McpAuthError';
  }
}

export class McpTokenError extends Error {
  constructor(
    message: string,
    public readonly serviceId: string,
    public readonly requiresReauth: boolean = false,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'McpTokenError';
  }
}

export class McpToolError extends Error {
  constructor(
    message: string,
    public readonly serviceId: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}
