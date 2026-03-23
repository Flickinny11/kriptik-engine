/**
 * MCP Client — The Universal Connector
 *
 * This is the main MCP client that orchestrates:
 * 1. Service metadata discovery (Protected Resource + Auth Server)
 * 2. Dynamic Client Registration (RFC 7591)
 * 3. OAuth 2.1 + PKCE authorization flow
 * 4. Token exchange and storage
 * 5. Automatic token refresh
 * 6. tools/list discovery and caching
 *
 * One client replaces the need for per-service OAuth integrations.
 * The user's browser handles the auth redirect; tokens are server-side only.
 */

import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { mcpOauthStates, mcpToolCaches } from '../schema.js';
import { discoverServiceMetadata } from './discovery.js';
import { getOrRegisterClient } from './registration.js';
import {
  storeMcpTokens,
  getMcpTokens,
  getMcpRegistration,
  updateMcpTokens,
  updateMcpConnectionStatus,
} from './token-store.js';
import type {
  McpClientConfig,
  McpServiceMetadata,
  McpTokenPayload,
  McpTokenResponse,
  McpToolDefinition,
  McpToolsListResponse,
  McpClientRegistration,
  PkceChallenge,
} from './types.js';
import { McpAuthError, McpTokenError, McpToolError } from './types.js';

// ── Default Configuration ───────────────────────────────────────────

const DEFAULT_CONFIG: McpClientConfig = {
  callbackBaseUrl: process.env.API_BASE_URL || process.env.BACKEND_URL || 'http://localhost:3001',
  clientName: 'KripTik AI',
  clientUri: 'https://kriptik.app',
  softwareId: 'kriptik-engine',
  softwareVersion: '0.1.0',
  tokenCacheTtlMs: 5 * 60 * 1000,     // 5 minutes
  toolCacheTtlMs: 24 * 60 * 60 * 1000, // 24 hours
  metadataFetchTimeoutMs: 10_000,
};

// In-memory metadata cache (per MCP server URL)
const metadataCache = new Map<string, McpServiceMetadata>();

// In-memory tool cache (per service ID)
const toolMemoryCache = new Map<string, { tools: McpToolDefinition[]; expiresAt: number }>();

// ── PKCE Utilities ──────────────────────────────────────────────────

function generatePkceChallenge(): PkceChallenge {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

// ── MCP Client Class ────────────────────────────────────────────────

export class McpClient {
  private config: McpClientConfig;

  constructor(config?: Partial<McpClientConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the MCP OAuth 2.1 authorization flow for a service.
   *
   * Returns an authorization URL to redirect the user's browser to.
   * After the user authenticates and consents, they are redirected back
   * to our callback URL with an authorization code.
   *
   * Flow:
   * 1. Discover service metadata (or use cache)
   * 2. Register client dynamically (or use cache)
   * 3. Generate PKCE challenge
   * 4. Store state in DB (10-minute TTL)
   * 5. Build and return authorization URL
   */
  async startAuthFlow(
    userId: string,
    serviceId: string,
    mcpServerUrl: string,
  ): Promise<{ authorizationUrl: string; state: string }> {
    // Discover service metadata
    const metadata = await this.getServiceMetadata(mcpServerUrl);

    // Get or register client
    const registration = await getOrRegisterClient(metadata.authServerMetadata, this.config);

    // Generate PKCE
    const pkce = generatePkceChallenge();

    // Generate state token
    const state = uuid();
    const redirectUri = `${this.config.callbackBaseUrl}/api/mcp/callback`;

    // Store flow state in DB
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await db.insert(mcpOauthStates).values({
      id: state,
      userId,
      serviceId,
      mcpServerUrl,
      authServerIssuer: metadata.authServerMetadata.issuer,
      clientId: registration.clientId,
      clientSecret: registration.clientSecret || null,
      codeVerifier: pkce.codeVerifier,
      redirectUri,
      resource: metadata.resourceMetadata.resource,
      scopes: metadata.resourceMetadata.scopes_supported?.join(' ') || null,
      expiresAt,
    });

    // Build authorization URL
    const authUrl = new URL(metadata.authServerMetadata.authorization_endpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', registration.clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', pkce.codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    // Add scopes if available
    if (metadata.resourceMetadata.scopes_supported?.length) {
      authUrl.searchParams.set('scope', metadata.resourceMetadata.scopes_supported.join(' '));
    }

    // Add resource indicator (RFC 8707)
    authUrl.searchParams.set('resource', metadata.resourceMetadata.resource);

    return {
      authorizationUrl: authUrl.toString(),
      state,
    };
  }

  /**
   * Complete the MCP OAuth flow after the user is redirected back with a code.
   *
   * Flow:
   * 1. Validate state from DB
   * 2. Exchange code for tokens at the auth server's token endpoint
   * 3. Store encrypted tokens
   * 4. Discover available tools
   * 5. Clean up state
   */
  async completeAuthFlow(
    code: string,
    state: string,
  ): Promise<{
    userId: string;
    serviceId: string;
    tools: McpToolDefinition[];
  }> {
    // Validate and consume state
    const [flowState] = await db.select().from(mcpOauthStates).where(
      eq(mcpOauthStates.id, state),
    );

    if (!flowState) {
      throw new McpAuthError('Invalid or expired OAuth state', 'unknown', 'invalid_state');
    }

    if (new Date() > flowState.expiresAt) {
      await db.delete(mcpOauthStates).where(eq(mcpOauthStates.id, state));
      throw new McpAuthError('OAuth state expired', flowState.serviceId, 'expired_state');
    }

    // Delete state (one-time use)
    await db.delete(mcpOauthStates).where(eq(mcpOauthStates.id, state));

    // Get auth server metadata for token endpoint
    const metadata = await this.getServiceMetadata(flowState.mcpServerUrl);

    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(
      metadata.authServerMetadata.token_endpoint,
      code,
      flowState.codeVerifier,
      flowState.clientId,
      flowState.clientSecret || undefined,
      flowState.redirectUri,
      flowState.resource || undefined,
    );

    // Build registration object for storage
    const registration: McpClientRegistration = {
      authServerIssuer: flowState.authServerIssuer,
      clientId: flowState.clientId,
      clientSecret: flowState.clientSecret || undefined,
      registeredAt: new Date().toISOString(),
    };

    // Store tokens
    await storeMcpTokens(
      flowState.userId,
      flowState.serviceId,
      flowState.mcpServerUrl,
      tokens,
      registration,
    );

    // Discover tools
    const tools = await this.discoverTools(flowState.serviceId, flowState.mcpServerUrl, tokens.accessToken);

    return {
      userId: flowState.userId,
      serviceId: flowState.serviceId,
      tools,
    };
  }

  /**
   * Exchange an authorization code for tokens at the auth server's token endpoint.
   */
  private async exchangeCodeForTokens(
    tokenEndpoint: string,
    code: string,
    codeVerifier: string,
    clientId: string,
    clientSecret: string | undefined,
    redirectUri: string,
    resource?: string,
  ): Promise<McpTokenPayload> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    });

    if (clientSecret) {
      body.set('client_secret', clientSecret);
    }

    if (resource) {
      body.set('resource', resource);
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new McpAuthError(
        `Token exchange failed (${response.status}): ${errorBody}`,
        'unknown',
        'token_exchange_failed',
      );
    }

    const tokenResponse = await response.json() as McpTokenResponse;

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      tokenType: tokenResponse.token_type || 'Bearer',
      expiresAt: tokenResponse.expires_in
        ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
        : undefined,
      scope: tokenResponse.scope,
    };
  }

  /**
   * Get a valid access token for a service, refreshing if needed.
   *
   * Returns the access token string or null if the connection doesn't exist.
   * Throws McpTokenError with requiresReauth=true if refresh fails.
   */
  async getValidToken(
    userId: string,
    serviceId: string,
  ): Promise<string | null> {
    const tokens = await getMcpTokens(userId, serviceId);
    if (!tokens) return null;

    // Check if token is expired
    if (tokens.expiresAt && new Date(tokens.expiresAt) <= new Date()) {
      // Token expired — try to refresh
      if (!tokens.refreshToken) {
        await updateMcpConnectionStatus(userId, serviceId, 'needs_reauth');
        throw new McpTokenError(
          'Access token expired and no refresh token available',
          serviceId,
          true,
        );
      }

      const refreshed = await this.refreshToken(userId, serviceId, tokens.refreshToken);
      return refreshed.accessToken;
    }

    return tokens.accessToken;
  }

  /**
   * Refresh an expired access token using the refresh token.
   */
  async refreshToken(
    userId: string,
    serviceId: string,
    refreshToken: string,
  ): Promise<McpTokenPayload> {
    // Get stored registration to find auth server details
    const registration = await getMcpRegistration(userId, serviceId);
    if (!registration) {
      throw new McpTokenError(
        'No client registration found for token refresh',
        serviceId,
        true,
      );
    }

    // Get current tokens for preserving scope on refresh
    const tokens = await getMcpTokens(userId, serviceId);
    // We need the MCP server URL to discover auth server metadata
    const { listMcpConnections } = await import('./token-store.js');
    const connections = await listMcpConnections(userId);
    const connection = connections.find(c => c.serviceId === serviceId);
    if (!connection) {
      throw new McpTokenError('No connection found', serviceId, true);
    }

    const metadata = await this.getServiceMetadata(connection.mcpServerUrl);

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: registration.clientId,
    });

    if (registration.clientSecret) {
      body.set('client_secret', registration.clientSecret);
    }

    try {
      const response = await fetch(metadata.authServerMetadata.token_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        // Refresh failed — mark as needs_reauth
        await updateMcpConnectionStatus(userId, serviceId, 'needs_reauth');
        throw new McpTokenError(
          `Token refresh failed (${response.status})`,
          serviceId,
          true,
        );
      }

      const tokenResponse = await response.json() as McpTokenResponse;

      const newTokens: McpTokenPayload = {
        accessToken: tokenResponse.access_token,
        // Preserve old refresh token if new one not returned
        refreshToken: tokenResponse.refresh_token || refreshToken,
        tokenType: tokenResponse.token_type || 'Bearer',
        expiresAt: tokenResponse.expires_in
          ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
          : undefined,
        scope: tokenResponse.scope || tokens?.scope,
      };

      // Update stored tokens
      await updateMcpTokens(userId, serviceId, newTokens);

      return newTokens;
    } catch (err) {
      if (err instanceof McpTokenError) throw err;
      await updateMcpConnectionStatus(userId, serviceId, 'needs_reauth');
      throw new McpTokenError(
        `Token refresh request failed: ${err instanceof Error ? err.message : String(err)}`,
        serviceId,
        true,
        err instanceof Error ? err : undefined,
      );
    }
  }

  /**
   * Discover available tools from an MCP server via tools/list.
   *
   * After successful OAuth connection, calls the MCP server's tools/list
   * endpoint to discover what capabilities are available. Results are cached.
   */
  async discoverTools(
    serviceId: string,
    mcpServerUrl: string,
    accessToken: string,
  ): Promise<McpToolDefinition[]> {
    // Check memory cache
    const memoryCached = toolMemoryCache.get(serviceId);
    if (memoryCached && memoryCached.expiresAt > Date.now()) {
      return memoryCached.tools;
    }

    // Check DB cache
    const [dbCached] = await db.select().from(mcpToolCaches).where(
      eq(mcpToolCaches.serviceId, serviceId),
    );
    if (dbCached && new Date(dbCached.expiresAt) > new Date()) {
      const tools = dbCached.tools as McpToolDefinition[];
      toolMemoryCache.set(serviceId, {
        tools,
        expiresAt: new Date(dbCached.expiresAt).getTime(),
      });
      return tools;
    }

    // Fetch from MCP server
    try {
      const tools = await this.fetchToolsList(mcpServerUrl, accessToken);

      // Cache in memory
      const expiresAt = Date.now() + this.config.toolCacheTtlMs;
      toolMemoryCache.set(serviceId, { tools, expiresAt });

      // Cache in DB (upsert)
      if (dbCached) {
        await db.update(mcpToolCaches)
          .set({
            tools: tools as unknown as Record<string, unknown>[],
            cachedAt: new Date(),
            expiresAt: new Date(expiresAt),
          })
          .where(eq(mcpToolCaches.serviceId, serviceId));
      } else {
        await db.insert(mcpToolCaches).values({
          id: uuid(),
          serviceId,
          tools: tools as unknown as Record<string, unknown>[],
          cachedAt: new Date(),
          expiresAt: new Date(expiresAt),
        });
      }

      return tools;
    } catch (err) {
      throw new McpToolError(
        `Failed to discover tools: ${err instanceof Error ? err.message : String(err)}`,
        serviceId,
        err instanceof Error ? err : undefined,
      );
    }
  }

  /**
   * Fetch tools/list from an MCP server.
   *
   * The MCP protocol uses JSON-RPC 2.0 over HTTP for tool listing.
   */
  private async fetchToolsList(
    mcpServerUrl: string,
    accessToken: string,
  ): Promise<McpToolDefinition[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.metadataFetchTimeoutMs);

    try {
      const response = await fetch(mcpServerUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      });

      if (!response.ok) {
        throw new McpToolError(
          `tools/list returned ${response.status}`,
          new URL(mcpServerUrl).hostname,
        );
      }

      const result = await response.json() as { result?: McpToolsListResponse; error?: { message: string } };

      if (result.error) {
        throw new McpToolError(
          `tools/list error: ${result.error.message}`,
          new URL(mcpServerUrl).hostname,
        );
      }

      return result.result?.tools || [];
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get cached tools for a service (from memory or DB cache).
   * Does not make network requests.
   */
  async getCachedTools(serviceId: string): Promise<McpToolDefinition[] | null> {
    // Memory cache
    const memoryCached = toolMemoryCache.get(serviceId);
    if (memoryCached && memoryCached.expiresAt > Date.now()) {
      return memoryCached.tools;
    }

    // DB cache
    const [dbCached] = await db.select().from(mcpToolCaches).where(
      eq(mcpToolCaches.serviceId, serviceId),
    );
    if (dbCached && new Date(dbCached.expiresAt) > new Date()) {
      const tools = dbCached.tools as McpToolDefinition[];
      toolMemoryCache.set(serviceId, {
        tools,
        expiresAt: new Date(dbCached.expiresAt).getTime(),
      });
      return tools;
    }

    return null;
  }

  /**
   * Get service metadata, using cache when available.
   */
  private async getServiceMetadata(mcpServerUrl: string): Promise<McpServiceMetadata> {
    const cached = metadataCache.get(mcpServerUrl);
    if (cached) return cached;

    const metadata = await discoverServiceMetadata(mcpServerUrl, this.config.metadataFetchTimeoutMs);
    metadataCache.set(mcpServerUrl, metadata);
    return metadata;
  }

  /**
   * Clear all caches (for testing or resets).
   */
  clearCaches(): void {
    metadataCache.clear();
    toolMemoryCache.clear();
  }
}

// Singleton instance
let _mcpClient: McpClient | null = null;

export function getMcpClient(config?: Partial<McpClientConfig>): McpClient {
  if (!_mcpClient) {
    _mcpClient = new McpClient(config);
  }
  return _mcpClient;
}
