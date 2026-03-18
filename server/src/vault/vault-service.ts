/**
 * Credential Vault — encrypted credential storage per user, per project, per service.
 *
 * Stores OAuth tokens encrypted at rest via AES-256-GCM.
 * Agents access credentials through the Brain (discovery nodes written on OAuth completion).
 * No background refresh — agents refresh on-demand when tokens are expired.
 */

import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { credentials } from '../schema.js';
import { encryptCredentialsForStorage, decryptCredentialsFromStorage } from '../oauth/crypto.js';

export interface StoredCredential {
  id: string;
  providerId: string;
  providerUserId: string | null;
  providerEmail: string | null;
  status: string | null;
  createdAt: Date | null;
}

export interface CredentialTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  tokenType?: string;
}

export async function storeCredential(
  userId: string,
  projectId: string,
  providerId: string,
  tokens: CredentialTokens,
  providerUserId?: string,
  providerEmail?: string,
): Promise<string> {
  const id = uuid();
  const encrypted = encryptCredentialsForStorage(tokens as Record<string, unknown>);

  // Upsert — replace existing credential for same user/project/provider
  await db.delete(credentials).where(
    and(
      eq(credentials.userId, userId),
      eq(credentials.projectId, projectId),
      eq(credentials.providerId, providerId),
    ),
  );

  await db.insert(credentials).values({
    id,
    userId,
    projectId,
    providerId,
    encryptedTokens: JSON.parse(encrypted),
    providerUserId: providerUserId || null,
    providerEmail: providerEmail || null,
    status: 'active',
  });

  return id;
}

export async function getCredential(
  userId: string,
  projectId: string,
  providerId: string,
): Promise<CredentialTokens | null> {
  const [row] = await db.select().from(credentials).where(
    and(
      eq(credentials.userId, userId),
      eq(credentials.projectId, projectId),
      eq(credentials.providerId, providerId),
      eq(credentials.status, 'active'),
    ),
  );
  if (!row) return null;
  const decrypted = decryptCredentialsFromStorage(JSON.stringify(row.encryptedTokens));
  return (decrypted as CredentialTokens) || null;
}

export async function listCredentials(
  userId: string,
  projectId: string,
): Promise<StoredCredential[]> {
  const rows = await db.select({
    id: credentials.id,
    providerId: credentials.providerId,
    providerUserId: credentials.providerUserId,
    providerEmail: credentials.providerEmail,
    status: credentials.status,
    createdAt: credentials.createdAt,
  }).from(credentials).where(
    and(
      eq(credentials.userId, userId),
      eq(credentials.projectId, projectId),
      eq(credentials.status, 'active'),
    ),
  );
  return rows;
}

export async function revokeCredential(
  userId: string,
  projectId: string,
  providerId: string,
): Promise<boolean> {
  const [updated] = await db.update(credentials)
    .set({ status: 'revoked', updatedAt: new Date() })
    .where(
      and(
        eq(credentials.userId, userId),
        eq(credentials.projectId, projectId),
        eq(credentials.providerId, providerId),
      ),
    )
    .returning();
  return !!updated;
}
