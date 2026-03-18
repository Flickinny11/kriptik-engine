/**
 * Notion OAuth Provider
 *
 * OAuth 2.0 flow for Notion integration access.
 * Documentation: https://developers.notion.com/docs/authorization
 */

import { OAuthProvider, OAuthConfig, OAuthTokens, OAuthUserInfo } from '../types.js';

const NOTION_AUTH_URL = 'https://api.notion.com/v1/oauth/authorize';
const NOTION_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';
const NOTION_API_URL = 'https://api.notion.com/v1';

export class NotionOAuthProvider implements OAuthProvider {
    readonly providerId = 'notion';
    readonly displayName = 'Notion';
    private config: OAuthConfig;

    constructor(config: OAuthConfig) {
        this.config = config;
    }

    getAuthorizationUrl(state: string): string {
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            response_type: 'code',
            owner: 'user',
            state,
        });
        return `${NOTION_AUTH_URL}?${params.toString()}`;
    }

    async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
        // Notion uses Basic auth for token exchange
        const basicAuth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');

        const response = await fetch(NOTION_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28',
            },
            body: JSON.stringify({
                code,
                redirect_uri: this.config.redirectUri,
                grant_type: 'authorization_code',
            }),
        });

        if (!response.ok) throw new Error(`Notion token exchange failed: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(`Notion OAuth error: ${data.error}`);

        return {
            accessToken: data.access_token,
            tokenType: data.token_type || 'bearer',
            // Notion tokens don't expire and don't have refresh tokens
        };
    }

    async refreshAccessToken(_refreshToken: string): Promise<OAuthTokens> {
        throw new Error('Notion OAuth tokens do not expire and cannot be refreshed. User must re-authorize.');
    }

    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
        const response = await fetch(`${NOTION_API_URL}/users/me`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Notion-Version': '2022-06-28',
            },
        });

        if (!response.ok) throw new Error(`Failed to get Notion user info: ${response.status}`);
        const data = await response.json();

        return {
            id: data.id,
            email: data.person?.email,
            name: data.name,
            avatarUrl: data.avatar_url,
            username: data.name,
            raw: data,
        };
    }

    async validateToken(accessToken: string): Promise<boolean> {
        try {
            const response = await fetch(`${NOTION_API_URL}/users/me`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Notion-Version': '2022-06-28',
                },
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}

/**
 * Create a Notion OAuth provider instance from environment variables
 */
export function createNotionProvider(redirectUri: string): NotionOAuthProvider | null {
    const clientId = process.env.NOTION_CLIENT_ID;
    const clientSecret = process.env.NOTION_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        console.warn('Notion OAuth not configured: missing NOTION_CLIENT_ID or NOTION_CLIENT_SECRET');
        return null;
    }
    return new NotionOAuthProvider({
        clientId, clientSecret, redirectUri,
        scopes: [], // Notion doesn't use scopes in the OAuth flow
    });
}
