/**
 * MCP Dynamic Client Registration (RFC 7591)
 *
 * When KripTik's MCP client connects to a new authorization server for the
 * first time, it doesn't have a client_id. Dynamic Client Registration
 * automatically registers KripTik as a client and receives credentials.
 *
 * Registrations are cached per authorization server issuer so we only
 * register once per auth server, not once per MCP service.
 */

import type {
  AuthorizationServerMetadata,
  DynamicClientRegistrationRequest,
  DynamicClientRegistrationResponse,
  McpClientRegistration,
  McpClientConfig,
} from './types.js';
import { McpDiscoveryError } from './types.js';

// In-memory cache of registrations by auth server issuer
const registrationCache = new Map<string, McpClientRegistration>();

/**
 * Get or create a client registration for the given authorization server.
 *
 * If we already have a valid registration cached for this auth server,
 * returns it. Otherwise, performs Dynamic Client Registration (RFC 7591).
 */
export async function getOrRegisterClient(
  authServerMetadata: AuthorizationServerMetadata,
  config: McpClientConfig,
): Promise<McpClientRegistration> {
  const issuer = authServerMetadata.issuer;

  // Check cache
  const cached = registrationCache.get(issuer);
  if (cached && !isRegistrationExpired(cached)) {
    return cached;
  }

  // Register dynamically
  if (!authServerMetadata.registration_endpoint) {
    throw new McpDiscoveryError(
      'Authorization server does not support Dynamic Client Registration (no registration_endpoint)',
      issuer,
    );
  }

  const registration = await registerClient(
    authServerMetadata.registration_endpoint,
    config,
  );

  // Cache it
  registrationCache.set(issuer, registration);

  return registration;
}

/**
 * Perform Dynamic Client Registration at the given endpoint.
 */
async function registerClient(
  registrationEndpoint: string,
  config: McpClientConfig,
): Promise<McpClientRegistration> {
  const callbackUrl = `${config.callbackBaseUrl}/api/mcp/callback`;

  const registrationRequest: DynamicClientRegistrationRequest = {
    client_name: config.clientName,
    redirect_uris: [callbackUrl],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
    software_id: config.softwareId,
    software_version: config.softwareVersion,
    client_uri: config.clientUri,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.metadataFetchTimeoutMs);

  try {
    const response = await fetch(registrationEndpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(registrationRequest),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new McpDiscoveryError(
        `Dynamic Client Registration failed (${response.status}): ${errorBody}`,
        registrationEndpoint,
      );
    }

    const regResponse = await response.json() as DynamicClientRegistrationResponse;

    if (!regResponse.client_id) {
      throw new McpDiscoveryError(
        'Dynamic Client Registration response missing client_id',
        registrationEndpoint,
      );
    }

    return {
      authServerIssuer: new URL(registrationEndpoint).origin,
      clientId: regResponse.client_id,
      clientSecret: regResponse.client_secret,
      clientIdIssuedAt: regResponse.client_id_issued_at,
      clientSecretExpiresAt: regResponse.client_secret_expires_at,
      registeredAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof McpDiscoveryError) throw err;
    throw new McpDiscoveryError(
      `Dynamic Client Registration request failed: ${err instanceof Error ? err.message : String(err)}`,
      registrationEndpoint,
      err instanceof Error ? err : undefined,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if a client registration has expired.
 * If no expiry is set, the registration is considered permanent.
 */
function isRegistrationExpired(registration: McpClientRegistration): boolean {
  if (!registration.clientSecretExpiresAt) return false;
  // client_secret_expires_at is in seconds since epoch, 0 means never expires
  if (registration.clientSecretExpiresAt === 0) return false;
  return Date.now() / 1000 > registration.clientSecretExpiresAt;
}

/**
 * Clear a cached registration (e.g., when it's been revoked).
 */
export function clearRegistration(authServerIssuer: string): void {
  registrationCache.delete(authServerIssuer);
}

/**
 * Get all cached registrations (for debugging/admin purposes).
 */
export function getCachedRegistrations(): Map<string, McpClientRegistration> {
  return new Map(registrationCache);
}
