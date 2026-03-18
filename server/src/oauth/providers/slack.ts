/**
 * Slack OAuth Provider
 *
 * OAuth 2.0 flow for Slack Bot/User tokens.
 * Documentation: https://api.slack.com/authentication/oauth-v2
 */

import { OAuthProvider, OAuthConfig, OAuthTokens, OAuthUserInfo } from '../types.js';

const SLACK_AUTH_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';
const SLACK_API_URL = 'https://slack.com/api';

export class SlackOAuthProvider implements OAuthProvider {
    readonly providerId = 'slack';
    readonly displayName = 'Slack';
    private config: OAuthConfig;

    constructor(config: OAuthConfig) {
        this.config = config;
    }

    getAuthorizationUrl(state: string): string {
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            scope: this.config.scopes.join(','),
            state,
        });
        return `${SLACK_AUTH_URL}?${params.toString()}`;
    }

    async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
        const response = await fetch(SLACK_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                code,
                redirect_uri: this.config.redirectUri,
            }),
        });

        if (!response.ok) throw new Error(`Slack token exchange failed: ${response.status}`);
        const data = await response.json();
        if (!data.ok) throw new Error(`Slack OAuth error: ${data.error}`);

        return {
            accessToken: data.access_token || data.authed_user?.access_token,
            refreshToken: data.refresh_token,
            tokenType: data.token_type || 'bearer',
            scope: data.scope,
        };
    }

    async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
        const response = await fetch(SLACK_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        if (!response.ok) throw new Error(`Slack token refresh failed: ${response.status}`);
        const data = await response.json();
        if (!data.ok) throw new Error(`Slack refresh error: ${data.error}`);

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
            tokenType: data.token_type || 'bearer',
            scope: data.scope,
        };
    }

    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
        const response = await fetch(`${SLACK_API_URL}/auth.test`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) throw new Error(`Failed to get Slack user info: ${response.status}`);
        const data = await response.json();
        if (!data.ok) throw new Error(`Slack API error: ${data.error}`);

        return {
            id: data.user_id,
            name: data.user,
            username: data.user,
            raw: data,
        };
    }

    async validateToken(accessToken: string): Promise<boolean> {
        try {
            const response = await fetch(`${SLACK_API_URL}/auth.test`, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
            });
            const data = await response.json();
            return data.ok === true;
        } catch {
            return false;
        }
    }
}

/**
 * Create a Slack OAuth provider instance from environment variables
 */
export function createSlackProvider(redirectUri: string): SlackOAuthProvider | null {
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        console.warn('Slack OAuth not configured: missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET');
        return null;
    }
    return new SlackOAuthProvider({
        clientId, clientSecret, redirectUri,
        scopes: ['chat:write', 'channels:read', 'users:read'],
    });
}
