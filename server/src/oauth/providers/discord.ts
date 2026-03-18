/**
 * Discord OAuth Provider
 *
 * OAuth 2.0 flow for Discord Bot/User access.
 * Documentation: https://discord.com/developers/docs/topics/oauth2
 */

import { OAuthProvider, OAuthConfig, OAuthTokens, OAuthUserInfo } from '../types.js';

const DISCORD_AUTH_URL = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_API_URL = 'https://discord.com/api/v10';

export class DiscordOAuthProvider implements OAuthProvider {
    readonly providerId = 'discord';
    readonly displayName = 'Discord';
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
        return `${DISCORD_AUTH_URL}?${params.toString()}`;
    }

    async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
        const response = await fetch(DISCORD_TOKEN_URL, {
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

        if (!response.ok) throw new Error(`Discord token exchange failed: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(`Discord OAuth error: ${data.error_description || data.error}`);

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            tokenType: data.token_type || 'Bearer',
            scope: data.scope,
            expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        };
    }

    async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
        const response = await fetch(DISCORD_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        if (!response.ok) throw new Error(`Discord token refresh failed: ${response.status}`);
        const data = await response.json();

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
            tokenType: data.token_type || 'Bearer',
            scope: data.scope,
            expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        };
    }

    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
        const response = await fetch(`${DISCORD_API_URL}/users/@me`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) throw new Error(`Failed to get Discord user info: ${response.status}`);
        const user = await response.json();

        return {
            id: user.id,
            email: user.email,
            name: user.global_name || user.username,
            avatarUrl: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : undefined,
            username: user.username,
            raw: user,
        };
    }

    async revokeTokens(accessToken: string): Promise<void> {
        await fetch(`${DISCORD_TOKEN_URL}/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                token: accessToken,
            }),
        });
    }

    async validateToken(accessToken: string): Promise<boolean> {
        try {
            const response = await fetch(`${DISCORD_API_URL}/users/@me`, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}

/**
 * Create a Discord OAuth provider instance from environment variables
 */
export function createDiscordProvider(redirectUri: string): DiscordOAuthProvider | null {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        console.warn('Discord OAuth not configured: missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET');
        return null;
    }
    return new DiscordOAuthProvider({
        clientId, clientSecret, redirectUri,
        scopes: ['identify', 'email', 'guilds'],
    });
}
