/**
 * Credential Generator — generates secure random passwords and stores
 * browser-agent-created credentials in the encrypted vault.
 */

import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { storeCredential } from '../vault/vault-service.js';
import type { ExtractedCredentials } from './types.js';

// ---------------------------------------------------------------------------
// Password generation
// ---------------------------------------------------------------------------

const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*_+-=?';

/**
 * Generate a cryptographically secure password that meets common service requirements:
 * - 20 characters long
 * - At least 1 uppercase, 1 lowercase, 1 digit, 1 symbol
 * - No ambiguous characters (0/O, 1/l/I)
 */
export function generateSecurePassword(length = 20): string {
  const allChars = UPPERCASE + LOWERCASE + DIGITS + SYMBOLS;

  // Guarantee at least one of each required character type
  const required = [
    UPPERCASE[crypto.randomInt(UPPERCASE.length)],
    LOWERCASE[crypto.randomInt(LOWERCASE.length)],
    DIGITS[crypto.randomInt(DIGITS.length)],
    SYMBOLS[crypto.randomInt(SYMBOLS.length)],
  ];

  // Fill remaining with random chars from the full set
  const remaining: string[] = [];
  for (let i = 0; i < length - required.length; i++) {
    remaining.push(allChars[crypto.randomInt(allChars.length)]);
  }

  // Shuffle all characters together
  const all = [...required, ...remaining];
  for (let i = all.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }

  return all.join('');
}

// ---------------------------------------------------------------------------
// Credential storage
// ---------------------------------------------------------------------------

/**
 * Store credentials extracted by the browser agent into the encrypted vault.
 * Returns the credential ID.
 */
export async function storeBrowserAgentCredentials(
  userId: string,
  projectId: string,
  serviceId: string,
  credentials: ExtractedCredentials,
): Promise<string> {
  const tokens: Record<string, string> = {
    password: credentials.password,
    email: credentials.email,
    source: 'browser-agent',
  };

  if (credentials.apiKey) tokens.apiKey = credentials.apiKey;
  if (credentials.secretKey) tokens.secretKey = credentials.secretKey;
  if (credentials.projectId) tokens.serviceProjectId = credentials.projectId;
  if (credentials.dashboardUrl) tokens.dashboardUrl = credentials.dashboardUrl;
  if (credentials.extra) {
    for (const [key, value] of Object.entries(credentials.extra)) {
      tokens[key] = value;
    }
  }

  return storeCredential(
    userId,
    projectId,
    serviceId,
    {
      accessToken: credentials.apiKey || `browser-agent-${uuid()}`,
      scope: 'browser-agent-signup',
      tokenType: 'browser-agent',
    },
    undefined,
    credentials.email,
  );
}
