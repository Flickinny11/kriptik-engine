/**
 * Stripe OAuth Provider (Stripe Connect)
 *
 * OAuth 2.0 flow for Stripe Connect integration.
 * Documentation: https://docs.stripe.com/connect/oauth-reference
 */

import { OAuthProvider, OAuthConfig, OAuthTokens, OAuthUserInfo } from '../types.js';

const STRIPE_AUTH_URL = 'https://connect.stripe.com/oauth/authorize';
const STRIPE_TOKEN_URL = 'https://connect.stripe.com/oauth/token';
const STRIPE_API_URL = 'https://api.stripe.com/v1';

export class StripeOAuthProvider implements OAuthProvider {
    readonly providerId = 'stripe';
    readonly displayName = 'Stripe';
    private config: OAuthConfig;

    constructor(config: OAuthConfig) {
        this.config = config;
    }

    getAuthorizationUrl(state: string): string {
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            response_type: 'code',
            scope: this.config.scopes.join(' '),
            state,
        });
        return `${STRIPE_AUTH_URL}?${params.toString()}`;
    }

    async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
        const response = await fetch(STRIPE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_secret: this.config.clientSecret,
                code,
                grant_type: 'authorization_code',
            }),
        });

        if (!response.ok) throw new Error(`Stripe token exchange failed: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(`Stripe OAuth error: ${data.error_description || data.error}`);

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            tokenType: data.token_type || 'bearer',
            scope: data.scope,
        };
    }

    async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
        const response = await fetch(STRIPE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_secret: this.config.clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        if (!response.ok) throw new Error(`Stripe token refresh failed: ${response.status}`);
        const data = await response.json();

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
            tokenType: data.token_type || 'bearer',
            scope: data.scope,
        };
    }

    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
        const response = await fetch(`${STRIPE_API_URL}/account`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) throw new Error(`Failed to get Stripe account info: ${response.status}`);
        const account = await response.json();

        return {
            id: account.id,
            email: account.email,
            name: account.business_profile?.name || account.settings?.dashboard?.display_name || account.email,
            username: account.id,
            raw: account,
        };
    }

    async revokeTokens(accessToken: string): Promise<void> {
        // Stripe deauthorize requires the connected account ID (acct_xxx),
        // not the access token. Retrieve it first via /v1/account.
        const accountResponse = await fetch(`${STRIPE_API_URL}/account`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!accountResponse.ok) {
            throw new Error(`Failed to get Stripe account for revocation: ${accountResponse.status}`);
        }

        const account = await accountResponse.json();
        const stripeUserId = account.id;

        await fetch('https://connect.stripe.com/oauth/deauthorize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                stripe_user_id: stripeUserId,
            }),
        });
    }

    async validateToken(accessToken: string): Promise<boolean> {
        try {
            const response = await fetch(`${STRIPE_API_URL}/account`, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}

/**
 * Create a Stripe OAuth provider instance from environment variables
 */
export function createStripeProvider(redirectUri: string): StripeOAuthProvider | null {
    const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
    const clientSecret = process.env.STRIPE_SECRET_KEY;
    if (!clientId || !clientSecret) {
        console.warn('Stripe OAuth not configured: missing STRIPE_CONNECT_CLIENT_ID or STRIPE_SECRET_KEY');
        return null;
    }
    return new StripeOAuthProvider({
        clientId, clientSecret, redirectUri,
        scopes: ['read_write'],
    });
}
