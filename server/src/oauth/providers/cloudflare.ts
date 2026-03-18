/**
 * Cloudflare OAuth Provider
 *
 * OAuth 2.0 flow for Cloudflare Workers/Pages access.
 * Documentation: https://developers.cloudflare.com/fundamentals/api/
 */

import { OAuthProvider, OAuthConfig, OAuthTokens, OAuthUserInfo } from '../types.js';

const CLOUDFLARE_AUTH_URL = 'https://dash.cloudflare.com/oauth2/auth';
const CLOUDFLARE_TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token';
const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';

export class CloudflareOAuthProvider implements OAuthProvider {
    readonly providerId = 'cloudflare';
    readonly displayName = 'Cloudflare';
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
        return `${CLOUDFLARE_AUTH_URL}?${params.toString()}`;
    }

    async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
        const response = await fetch(CLOUDFLARE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                code,
                redirect_uri: this.config.redirectUri,
                grant_type: 'authorization_code',
            }),
        });

        if (!response.ok) throw new Error(`Cloudflare token exchange failed: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(`Cloudflare OAuth error: ${data.error_description || data.error}`);

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            tokenType: data.token_type || 'bearer',
            scope: data.scope,
            expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        };
    }

    async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
        const response = await fetch(CLOUDFLARE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        if (!response.ok) throw new Error(`Cloudflare token refresh failed: ${response.status}`);
        const data = await response.json();

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
            tokenType: data.token_type || 'bearer',
            scope: data.scope,
            expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        };
    }

    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
        const response = await fetch(`${CLOUDFLARE_API_URL}/user`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) throw new Error(`Failed to get Cloudflare user info: ${response.status}`);
        const data = await response.json();
        const user = data.result;

        return {
            id: user.id,
            email: user.email,
            name: user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.email,
            username: user.email,
            raw: user,
        };
    }

    async validateToken(accessToken: string): Promise<boolean> {
        try {
            const response = await fetch(`${CLOUDFLARE_API_URL}/user/tokens/verify`, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}

/**
 * Create a Cloudflare OAuth provider instance from environment variables
 */
export function createCloudflareProvider(redirectUri: string): CloudflareOAuthProvider | null {
    const clientId = process.env.CLOUDFLARE_CLIENT_ID;
    const clientSecret = process.env.CLOUDFLARE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        console.warn('Cloudflare OAuth not configured: missing CLOUDFLARE_CLIENT_ID or CLOUDFLARE_CLIENT_SECRET');
        return null;
    }
    return new CloudflareOAuthProvider({
        clientId, clientSecret, redirectUri,
        scopes: ['account:read', 'user:read', 'zone:read', 'workers:write'],
    });
}
