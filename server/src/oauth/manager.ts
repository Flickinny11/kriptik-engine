/**
 * OAuth Manager — orchestrates OAuth flows for credential collection.
 *
 * startFlow()    → generates auth URL with PKCE, stores state in DB
 * completeFlow() → exchanges code for tokens, stores in vault, writes Brain discovery
 *
 * No background refresh. No lifecycle management. No mechanical patterns.
 * Agents refresh tokens on-demand when they need them.
 */

import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { db } from '../db.js';
import { oauthStates } from '../schema.js';
import { PROVIDER_CATALOG, type ProviderCatalogEntry } from './catalog.js';
import { GenericOAuth2Provider } from './provider.js';
import { storeCredential } from '../vault/vault-service.js';
import type { OAuthProvider } from './types.js';

// Import custom providers
import {
  createGitHubProvider, createVercelProvider, createNetlifyProvider,
  createGoogleProvider, createCloudflareProvider, createSlackProvider,
  createDiscordProvider, createNotionProvider, createStripeProvider,
} from './providers/index.js';

const CALLBACK_BASE = process.env.API_URL || 'http://localhost:3001';

// Initialized providers cache
const providers = new Map<string, OAuthProvider>();

function getRedirectUri(providerId: string): string {
  return `${CALLBACK_BASE}/api/oauth/callback/${providerId}`;
}

function initProvider(entry: ProviderCatalogEntry): OAuthProvider | null {
  if (entry.authType !== 'oauth2' && entry.authType !== 'oauth2-pkce') return null;

  const envPrefix = entry.id.toUpperCase().replace(/-/g, '_');
  const clientId = process.env[`${envPrefix}_CLIENT_ID`] || process.env[`${envPrefix}_OAUTH_CLIENT_ID`];
  const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`] || process.env[`${envPrefix}_OAUTH_CLIENT_SECRET`];

  if (!clientId || !clientSecret) return null;

  // Check for custom provider implementations first
  const customProviders: Record<string, () => OAuthProvider | null> = {
    github: () => createGitHubProvider(getRedirectUri('github')),
    vercel: () => createVercelProvider(getRedirectUri('vercel')),
    netlify: () => createNetlifyProvider(getRedirectUri('netlify')),
    google: () => createGoogleProvider(getRedirectUri('google')),
    cloudflare: () => createCloudflareProvider(getRedirectUri('cloudflare')),
    slack: () => createSlackProvider(getRedirectUri('slack')),
    discord: () => createDiscordProvider(getRedirectUri('discord')),
    notion: () => createNotionProvider(getRedirectUri('notion')),
    stripe: () => createStripeProvider(getRedirectUri('stripe')),
  };

  if (customProviders[entry.id]) {
    return customProviders[entry.id]();
  }

  // Fall back to generic OAuth2
  if (!entry.authorizationUrl || !entry.tokenUrl) return null;

  return new GenericOAuth2Provider({
    providerId: entry.id,
    displayName: entry.displayName,
    clientId,
    clientSecret,
    redirectUri: getRedirectUri(entry.id),
    authorizationUrl: entry.authorizationUrl,
    tokenUrl: entry.tokenUrl,
    revokeUrl: entry.revokeUrl || undefined,
    userInfoUrl: entry.userInfoUrl || undefined,
    defaultScopes: entry.defaultScopes,
    pkceRequired: entry.pkceRequired,
  });
}

function getProvider(providerId: string): OAuthProvider | null {
  if (providers.has(providerId)) return providers.get(providerId)!;

  const entry = PROVIDER_CATALOG.find(p => p.id === providerId);
  if (!entry) return null;

  const provider = initProvider(entry);
  if (provider) providers.set(providerId, provider);
  return provider;
}

// Generate PKCE pair
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Start an OAuth flow. Returns the authorization URL to redirect the user to.
 */
export async function startFlow(
  providerId: string,
  userId: string,
  projectId: string,
): Promise<{ authorizationUrl: string; state: string } | null> {
  const provider = getProvider(providerId);
  if (!provider) return null;

  const state = uuid();
  const { codeVerifier, codeChallenge } = generatePKCE();

  // Store state for callback verification
  await db.insert(oauthStates).values({
    id: state,
    userId,
    providerId,
    projectId,
    codeVerifier,
    redirectUri: getRedirectUri(providerId),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min expiry
  });

  const authorizationUrl = provider.getAuthorizationUrl(state, codeChallenge);
  return { authorizationUrl, state };
}

/**
 * Complete an OAuth flow after the callback. Exchanges code for tokens and stores them.
 */
export async function completeFlow(
  providerId: string,
  code: string,
  state: string,
): Promise<{ userId: string; projectId: string; providerId: string; providerEmail?: string } | null> {
  // Validate and consume state
  const [stateRow] = await db.select().from(oauthStates).where(eq(oauthStates.id, state));
  if (!stateRow || stateRow.providerId !== providerId) return null;
  if (new Date(stateRow.expiresAt) < new Date()) {
    await db.delete(oauthStates).where(eq(oauthStates.id, state));
    return null;
  }

  // Consume the state (one-time use)
  await db.delete(oauthStates).where(eq(oauthStates.id, state));

  const provider = getProvider(providerId);
  if (!provider) return null;

  // Exchange code for tokens
  const tokens = await provider.exchangeCodeForTokens(code, stateRow.codeVerifier);

  // Get user info if possible
  let providerEmail: string | undefined;
  let providerUserId: string | undefined;
  try {
    if (provider.getUserInfo) {
      const userInfo = await provider.getUserInfo(tokens.accessToken);
      providerEmail = userInfo.email || undefined;
      providerUserId = userInfo.id;
    }
  } catch {
    // User info is best-effort — don't fail the flow
  }

  // Store in vault
  await storeCredential(
    stateRow.userId,
    stateRow.projectId || '',
    providerId,
    {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt?.toISOString(),
      scope: tokens.scope,
      tokenType: tokens.tokenType,
    },
    providerUserId,
    providerEmail,
  );

  return {
    userId: stateRow.userId,
    projectId: stateRow.projectId || '',
    providerId,
    providerEmail,
  };
}

/**
 * Get list of providers that have OAuth configured (client ID + secret set in env).
 */
export function getConfiguredProviders(): string[] {
  return PROVIDER_CATALOG
    .filter(entry => {
      if (entry.authType !== 'oauth2' && entry.authType !== 'oauth2-pkce') return false;
      const envPrefix = entry.id.toUpperCase().replace(/-/g, '_');
      const clientId = process.env[`${envPrefix}_CLIENT_ID`] || process.env[`${envPrefix}_OAUTH_CLIENT_ID`];
      return !!clientId;
    })
    .map(e => e.id);
}
