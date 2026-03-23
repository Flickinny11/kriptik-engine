/**
 * MCP Token Store
 *
 * Encrypted storage for MCP OAuth tokens, per user, per service.
 * Reuses the existing AES-256-GCM encryption from oauth/crypto.ts
 * and stores in the mcp_connections table.
 *
 * Unlike the existing credentials table (scoped per user+project+provider),
 * MCP connections are per user+service — the same connection is shared
 * across all projects that use that service.
 */

import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { mcpConnections } from '../schema.js';
import { encryptCredentialsForStorage, decryptCredentialsFromStorage } from '../oauth/crypto.js';
import type {
  McpTokenPayload,
  McpConnectionStatus,
  StoredMcpConnection,
  McpClientRegistration,
} from './types.js';

/**
 * Store or update MCP tokens for a user+service pair.
 */
export async function storeMcpTokens(
  userId: string,
  serviceId: string,
  mcpServerUrl: string,
  tokens: McpTokenPayload,
  registration: McpClientRegistration,
): Promise<string> {
  const id = uuid();
  const encryptedTokens = encryptCredentialsForStorage(tokens as unknown as Record<string, unknown>);
  const encryptedRegistration = encryptCredentialsForStorage({
    clientId: registration.clientId,
    clientSecret: registration.clientSecret,
    clientIdIssuedAt: registration.clientIdIssuedAt,
    clientSecretExpiresAt: registration.clientSecretExpiresAt,
  });

  // Upsert: delete existing, insert new
  await db.delete(mcpConnections).where(
    and(
      eq(mcpConnections.userId, userId),
      eq(mcpConnections.serviceId, serviceId),
    ),
  );

  await db.insert(mcpConnections).values({
    id,
    userId,
    serviceId,
    mcpServerUrl,
    authServerIssuer: registration.authServerIssuer,
    encryptedTokens: JSON.parse(encryptedTokens),
    encryptedRegistration: JSON.parse(encryptedRegistration),
    status: 'connected',
    connectedAt: new Date(),
  });

  return id;
}

/**
 * Retrieve decrypted MCP tokens for a user+service.
 */
export async function getMcpTokens(
  userId: string,
  serviceId: string,
): Promise<McpTokenPayload | null> {
  const [row] = await db.select().from(mcpConnections).where(
    and(
      eq(mcpConnections.userId, userId),
      eq(mcpConnections.serviceId, serviceId),
    ),
  );
  if (!row) return null;

  const decrypted = decryptCredentialsFromStorage(JSON.stringify(row.encryptedTokens));
  return (decrypted as unknown as McpTokenPayload) || null;
}

/**
 * Get the stored client registration for a user+service connection.
 */
export async function getMcpRegistration(
  userId: string,
  serviceId: string,
): Promise<McpClientRegistration | null> {
  const [row] = await db.select().from(mcpConnections).where(
    and(
      eq(mcpConnections.userId, userId),
      eq(mcpConnections.serviceId, serviceId),
    ),
  );
  if (!row || !row.encryptedRegistration) return null;

  const decrypted = decryptCredentialsFromStorage(JSON.stringify(row.encryptedRegistration));
  if (!decrypted) return null;

  return {
    authServerIssuer: row.authServerIssuer,
    clientId: (decrypted as Record<string, unknown>).clientId as string,
    clientSecret: (decrypted as Record<string, unknown>).clientSecret as string | undefined,
    clientIdIssuedAt: (decrypted as Record<string, unknown>).clientIdIssuedAt as number | undefined,
    clientSecretExpiresAt: (decrypted as Record<string, unknown>).clientSecretExpiresAt as number | undefined,
    registeredAt: row.connectedAt?.toISOString() || new Date().toISOString(),
  };
}

/**
 * Update stored tokens after a refresh.
 */
export async function updateMcpTokens(
  userId: string,
  serviceId: string,
  tokens: McpTokenPayload,
): Promise<boolean> {
  const encrypted = encryptCredentialsForStorage(tokens as unknown as Record<string, unknown>);

  const [updated] = await db.update(mcpConnections)
    .set({
      encryptedTokens: JSON.parse(encrypted),
      lastRefreshedAt: new Date(),
      status: 'connected',
    })
    .where(
      and(
        eq(mcpConnections.userId, userId),
        eq(mcpConnections.serviceId, serviceId),
      ),
    )
    .returning();

  return !!updated;
}

/**
 * Update the connection status (e.g., to 'needs_reauth' or 'error').
 */
export async function updateMcpConnectionStatus(
  userId: string,
  serviceId: string,
  status: McpConnectionStatus,
): Promise<boolean> {
  const [updated] = await db.update(mcpConnections)
    .set({ status })
    .where(
      and(
        eq(mcpConnections.userId, userId),
        eq(mcpConnections.serviceId, serviceId),
      ),
    )
    .returning();

  return !!updated;
}

/**
 * List all MCP connections for a user (metadata only, no tokens).
 */
export async function listMcpConnections(
  userId: string,
): Promise<StoredMcpConnection[]> {
  const rows = await db.select({
    id: mcpConnections.id,
    userId: mcpConnections.userId,
    serviceId: mcpConnections.serviceId,
    mcpServerUrl: mcpConnections.mcpServerUrl,
    authServerIssuer: mcpConnections.authServerIssuer,
    status: mcpConnections.status,
    connectedAt: mcpConnections.connectedAt,
    lastRefreshedAt: mcpConnections.lastRefreshedAt,
  }).from(mcpConnections).where(
    eq(mcpConnections.userId, userId),
  );

  return rows.map(row => ({
    id: row.id,
    userId: row.userId,
    serviceId: row.serviceId,
    mcpServerUrl: row.mcpServerUrl,
    authServerIssuer: row.authServerIssuer,
    clientId: '', // Not exposed in listings
    status: row.status as McpConnectionStatus,
    connectedAt: row.connectedAt?.toISOString(),
    lastRefreshedAt: row.lastRefreshedAt?.toISOString(),
  }));
}

/**
 * Delete an MCP connection (revoke).
 */
export async function deleteMcpConnection(
  userId: string,
  serviceId: string,
): Promise<boolean> {
  const [deleted] = await db.delete(mcpConnections).where(
    and(
      eq(mcpConnections.userId, userId),
      eq(mcpConnections.serviceId, serviceId),
    ),
  ).returning();

  return !!deleted;
}

/**
 * Check if a user has a connected MCP service.
 */
export async function hasMcpConnection(
  userId: string,
  serviceId: string,
): Promise<boolean> {
  const [row] = await db.select({ id: mcpConnections.id }).from(mcpConnections).where(
    and(
      eq(mcpConnections.userId, userId),
      eq(mcpConnections.serviceId, serviceId),
      eq(mcpConnections.status, 'connected'),
    ),
  );
  return !!row;
}
