/**
 * MCP Metadata Discovery
 *
 * Implements the MCP authorization discovery flow:
 * 1. Attempt connection to MCP server URL
 * 2. On 401, extract resource_metadata URL from WWW-Authenticate header
 * 3. Fetch Protected Resource Metadata (RFC 9728) from /.well-known/oauth-protected-resource
 * 4. Fetch Authorization Server Metadata (RFC 8414) from /.well-known/oauth-authorization-server
 *
 * These metadata documents tell the client which authorization server to use,
 * what endpoints are available, and what scopes can be requested.
 */

import type {
  ProtectedResourceMetadata,
  AuthorizationServerMetadata,
  McpServiceMetadata,
  McpDiscoveryError as McpDiscoveryErrorType,
} from './types.js';
import { McpDiscoveryError } from './types.js';

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Discover MCP service metadata by probing the server URL.
 *
 * Flow:
 * 1. Send GET to mcpServerUrl - expect 401 with WWW-Authenticate header
 * 2. Parse the resource_metadata URL from the header
 * 3. Fetch Protected Resource Metadata
 * 4. From that, get the authorization server URL
 * 5. Fetch Authorization Server Metadata
 */
export async function discoverServiceMetadata(
  mcpServerUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<McpServiceMetadata> {
  const resourceMetadataUrl = await discoverResourceMetadataUrl(mcpServerUrl, timeoutMs);
  const resourceMetadata = await fetchProtectedResourceMetadata(resourceMetadataUrl, timeoutMs);

  if (!resourceMetadata.authorization_servers || resourceMetadata.authorization_servers.length === 0) {
    throw new McpDiscoveryError(
      'Protected Resource Metadata has no authorization_servers',
      mcpServerUrl,
    );
  }

  const authServerUrl = resourceMetadata.authorization_servers[0];
  const authServerMetadata = await fetchAuthorizationServerMetadata(authServerUrl, timeoutMs);

  return {
    serviceId: new URL(mcpServerUrl).hostname,
    mcpServerUrl,
    resourceMetadata,
    authServerMetadata,
    discoveredAt: new Date().toISOString(),
  };
}

/**
 * Step 1 & 2: Probe MCP server and extract resource metadata URL.
 *
 * Sends a request to the MCP server expecting a 401 with a WWW-Authenticate
 * header containing a resource_metadata parameter pointing to the
 * Protected Resource Metadata document.
 *
 * Falls back to /.well-known/oauth-protected-resource at the server's origin
 * if the header doesn't contain resource_metadata.
 */
export async function discoverResourceMetadataUrl(
  mcpServerUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(mcpServerUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    if (response.status === 401) {
      const wwwAuth = response.headers.get('www-authenticate') || '';
      const resourceMetadataUrl = extractResourceMetadataUrl(wwwAuth);
      if (resourceMetadataUrl) {
        return resourceMetadataUrl;
      }
    }

    // Fallback: try well-known URL at the server's origin
    const serverOrigin = new URL(mcpServerUrl).origin;
    return `${serverOrigin}/.well-known/oauth-protected-resource`;
  } catch (err) {
    if (err instanceof McpDiscoveryError) throw err;
    throw new McpDiscoveryError(
      `Failed to probe MCP server: ${err instanceof Error ? err.message : String(err)}`,
      mcpServerUrl,
      err instanceof Error ? err : undefined,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract resource_metadata URL from WWW-Authenticate header value.
 *
 * The header format is:
 *   Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource"
 */
export function extractResourceMetadataUrl(wwwAuthenticate: string): string | null {
  // Match resource_metadata="URL" or resource_metadata=URL
  const match = wwwAuthenticate.match(/resource_metadata="?([^">\s,]+)"?/);
  return match ? match[1] : null;
}

/**
 * Step 3: Fetch Protected Resource Metadata (RFC 9728).
 *
 * This document tells the client:
 * - Which authorization servers are trusted for this resource
 * - What scopes are available
 * - What bearer token methods are supported
 */
export async function fetchProtectedResourceMetadata(
  metadataUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ProtectedResourceMetadata> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(metadataUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new McpDiscoveryError(
        `Protected Resource Metadata returned ${response.status}`,
        metadataUrl,
      );
    }

    const metadata = await response.json() as ProtectedResourceMetadata;

    if (!metadata.resource) {
      throw new McpDiscoveryError(
        'Protected Resource Metadata missing required "resource" field',
        metadataUrl,
      );
    }

    return metadata;
  } catch (err) {
    if (err instanceof McpDiscoveryError) throw err;
    throw new McpDiscoveryError(
      `Failed to fetch Protected Resource Metadata: ${err instanceof Error ? err.message : String(err)}`,
      metadataUrl,
      err instanceof Error ? err : undefined,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Step 4: Fetch Authorization Server Metadata (RFC 8414).
 *
 * Given an authorization server URL, fetches the metadata from
 * /.well-known/oauth-authorization-server
 *
 * This document provides:
 * - Authorization endpoint (for user redirect)
 * - Token endpoint (for code exchange)
 * - Registration endpoint (for dynamic client registration)
 * - Supported grant types, response types, PKCE methods
 */
export async function fetchAuthorizationServerMetadata(
  authServerUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<AuthorizationServerMetadata> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Try well-known URL at the auth server origin
  const authOrigin = new URL(authServerUrl).origin;
  const wellKnownUrl = `${authOrigin}/.well-known/oauth-authorization-server`;

  try {
    let response = await fetch(wellKnownUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    // Some servers use openid-configuration instead
    if (!response.ok) {
      const openIdUrl = `${authOrigin}/.well-known/openid-configuration`;
      response = await fetch(openIdUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
    }

    if (!response.ok) {
      throw new McpDiscoveryError(
        `Authorization Server Metadata returned ${response.status}`,
        authServerUrl,
      );
    }

    const metadata = await response.json() as AuthorizationServerMetadata;

    if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
      throw new McpDiscoveryError(
        'Authorization Server Metadata missing required endpoints (authorization_endpoint, token_endpoint)',
        authServerUrl,
      );
    }

    return metadata;
  } catch (err) {
    if (err instanceof McpDiscoveryError) throw err;
    throw new McpDiscoveryError(
      `Failed to fetch Authorization Server Metadata: ${err instanceof Error ? err.message : String(err)}`,
      authServerUrl,
      err instanceof Error ? err : undefined,
    );
  } finally {
    clearTimeout(timeout);
  }
}
