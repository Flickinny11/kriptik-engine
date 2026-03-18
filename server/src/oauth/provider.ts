/**
 * Generic OAuth2 Provider — Factory that implements the OAuthProvider interface
 * for any standard OAuth2-compliant provider.
 *
 * Handles authorization URL construction, token exchange (JSON + form-encoded),
 * token refresh, user info retrieval, token revocation, and PKCE generation.
 */

import { OAuthProvider, OAuthTokens, OAuthUserInfo } from './types.js';
import crypto from 'crypto';

export interface GenericProviderConfig {
    providerId: string;
    displayName: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    authorizationUrl: string;
    tokenUrl: string;
    revokeUrl?: string;
    userInfoUrl?: string;
    defaultScopes: string[];
    pkceRequired: boolean;
}

export class GenericOAuth2Provider implements OAuthProvider {
    readonly providerId: string;
    readonly displayName: string;

    constructor(private config: GenericProviderConfig) {
        this.providerId = config.providerId;
        this.displayName = config.displayName;
    }

    getAuthorizationUrl(state: string, codeChallenge?: string): string {
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            response_type: 'code',
            state,
        });

        if (this.config.defaultScopes.length > 0) {
            params.set('scope', this.config.defaultScopes.join(' '));
        }

        if (codeChallenge) {
            params.set('code_challenge', codeChallenge);
            params.set('code_challenge_method', 'S256');
        }

        return `${this.config.authorizationUrl}?${params.toString()}`;
    }

    async exchangeCodeForTokens(code: string, codeVerifier?: string): Promise<OAuthTokens> {
        const body: Record<string, string> = {
            grant_type: 'authorization_code',
            code,
            redirect_uri: this.config.redirectUri,
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
        };

        if (codeVerifier) {
            body.code_verifier = codeVerifier;
        }

        const response = await fetch(this.config.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body: new URLSearchParams(body).toString(),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Token exchange failed for ${this.providerId}: ${response.status} ${errorText}`
            );
        }

        const contentType = response.headers.get('content-type') || '';
        let data: Record<string, unknown>;

        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            // Handle form-encoded responses (e.g., GitHub returns form-encoded by default)
            const text = await response.text();
            const parsed = new URLSearchParams(text);
            data = Object.fromEntries(parsed.entries());
        }

        return this.parseTokenResponse(data);
    }

    async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
        const body: Record<string, string> = {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
        };

        const response = await fetch(this.config.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body: new URLSearchParams(body).toString(),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Token refresh failed for ${this.providerId}: ${response.status} ${errorText}`
            );
        }

        const contentType = response.headers.get('content-type') || '';
        let data: Record<string, unknown>;

        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            const parsed = new URLSearchParams(text);
            data = Object.fromEntries(parsed.entries());
        }

        const tokens = this.parseTokenResponse(data);

        // Preserve the original refresh token if the response didn't include a new one
        if (!tokens.refreshToken) {
            tokens.refreshToken = refreshToken;
        }

        return tokens;
    }

    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
        if (!this.config.userInfoUrl) {
            return { id: 'unknown', raw: {} };
        }

        const response = await fetch(this.config.userInfoUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(
                `getUserInfo failed for ${this.providerId}: ${response.status} ${response.statusText}`
            );
        }

        const data = await response.json();

        return {
            id: String(data.id ?? data.sub ?? data.user_id ?? 'unknown'),
            email: data.email || data.mail || undefined,
            name: data.name || data.display_name || data.displayName || undefined,
            avatarUrl: data.avatar_url || data.picture || data.photo || undefined,
            username: data.login || data.username || data.nickname || undefined,
            raw: data,
        };
    }

    async revokeTokens(accessToken: string): Promise<void> {
        if (!this.config.revokeUrl) {
            return;
        }

        const response = await fetch(this.config.revokeUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                token: accessToken,
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
            }).toString(),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Token revocation failed for ${this.providerId}: ${response.status} ${errorText}`
            );
        }
    }

    async validateToken(accessToken: string): Promise<boolean> {
        try {
            await this.getUserInfo(accessToken);
            return true;
        } catch {
            return false;
        }
    }

    private parseTokenResponse(data: Record<string, unknown>): OAuthTokens {
        const expiresIn = data.expires_in
            ? Number(data.expires_in)
            : undefined;

        return {
            accessToken: String(data.access_token),
            refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
            tokenType: String(data.token_type || 'Bearer'),
            expiresAt: expiresIn
                ? new Date(Date.now() + expiresIn * 1000)
                : undefined,
            scope: data.scope ? String(data.scope) : undefined,
        };
    }
}

/**
 * Generate a PKCE code verifier and challenge pair.
 * Uses crypto.randomBytes for the verifier and SHA-256 for the challenge.
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
    return { codeVerifier, codeChallenge };
}

/**
 * Factory function to create a GenericOAuth2Provider from a config object.
 */
export function createGenericProvider(config: GenericProviderConfig): OAuthProvider {
    return new GenericOAuth2Provider(config);
}
