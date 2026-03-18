/**
 * Shared AES-256-GCM encryption for credentials at rest.
 *
 * Used by:
 * - immortal-build-service.ts (build session credentials)
 * - pending-build-store.ts (pending build credentials)
 * - credential-vault.ts (user credential vault)
 *
 * Key derivation: VAULT_ENCRYPTION_KEY (64-char hex) > CREDENTIAL_ENCRYPTION_KEY > BETTER_AUTH_SECRET
 * Format: { encrypted: hex, iv: hex, authTag: hex }
 */

import crypto, { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

let _cachedKey: Buffer | null = null;

export function deriveEncryptionKey(): Buffer {
    if (_cachedKey) return _cachedKey;

    const vaultKey = process.env.VAULT_ENCRYPTION_KEY;
    if (vaultKey && /^[0-9a-fA-F]{64}$/.test(vaultKey)) {
        _cachedKey = Buffer.from(vaultKey, 'hex');
        return _cachedKey;
    }
    const secret = vaultKey || process.env.CREDENTIAL_ENCRYPTION_KEY ||
        process.env.BETTER_AUTH_SECRET;
    if (!secret) {
        throw new Error('[CredentialCrypto] FATAL: No encryption key available. Set VAULT_ENCRYPTION_KEY or BETTER_AUTH_SECRET.');
    }
    _cachedKey = crypto.createHash('sha256').update(secret).digest();
    return _cachedKey;
}

export interface EncryptedEnvelope {
    encrypted: string;
    iv: string;
    authTag: string;
}

export function encryptCredentials(plaintext: string): EncryptedEnvelope {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', deriveEncryptionKey(), iv);
    let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
    };
}

export function decryptCredentials(encrypted: string, iv: string, authTag: string): string {
    const decipher = createDecipheriv(
        'aes-256-gcm',
        deriveEncryptionKey(),
        Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
}

/**
 * Encrypt a credentials object for database storage.
 * Returns a serialized JSON string of the encrypted envelope.
 */
export function encryptCredentialsForStorage(credentials: Record<string, unknown> | null | undefined): string {
    if (!credentials || Object.keys(credentials).length === 0) {
        return JSON.stringify(null);
    }
    const plaintext = JSON.stringify(credentials);
    const envelope = encryptCredentials(plaintext);
    return JSON.stringify(envelope);
}

/**
 * Decrypt credentials from database storage.
 * Handles both encrypted envelopes and plaintext fallback (for legacy data).
 */
export function decryptCredentialsFromStorage(stored: string | null | undefined): Record<string, string> | undefined {
    if (!stored || stored === 'null') return undefined;
    try {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.encrypted && parsed.iv && parsed.authTag) {
            const decrypted = decryptCredentials(parsed.encrypted, parsed.iv, parsed.authTag);
            return JSON.parse(decrypted);
        }
        // Plaintext fallback for legacy unencrypted data
        if (typeof parsed === 'object' && parsed !== null) {
            return parsed;
        }
    } catch {
        // If all parsing fails, return undefined
    }
    return undefined;
}
