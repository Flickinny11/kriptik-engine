/**
 * Credential Service
 *
 * Frontend service for managing OAuth 2.0 credentials and API keys.
 * Integrates with the backend credential vault and OAuth manager.
 */

import { apiClient } from '../lib/api-client';

// =============================================================================
// TYPES
// =============================================================================

export type OAuthProviderId =
  | 'github'
  | 'vercel'
  | 'netlify'
  | 'google'
  | 'cloudflare'
  | 'slack'
  | 'discord'
  | 'notion'
  | 'openrouter'
  | 'supabase'
  | 'turso'
  | 'planetscale'
  | 'stripe';

export interface OAuthProvider {
  id: OAuthProviderId;
  name: string;
  configured: boolean;
  supportsOAuth: boolean;
  scopes?: string[];
  description: string;
}

export interface StoredCredential {
  id: string;
  integrationId: string;
  connectionName?: string;
  isActive: boolean;
  validationStatus: 'valid' | 'invalid' | 'expired' | 'pending';
  lastUsedAt?: string;
  lastValidatedAt?: string;
  createdAt: string;
  updatedAt: string;
  maskedValue?: string;
}

export interface CredentialListResponse {
  credentials: StoredCredential[];
  totalCount: number;
}

export interface OAuthFlowResponse {
  authorizationUrl: string;
  state: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  provider: OAuthProviderId;
  credentialId?: string;
  connectionName?: string;
  error?: string;
}

export interface ApiKeyCredential {
  name: string;
  value: string;
  service: string;
  description?: string;
}

// =============================================================================
// OAUTH PROVIDERS REGISTRY
// =============================================================================

export const OAUTH_PROVIDERS: OAuthProvider[] = [
  {
    id: 'github',
    name: 'GitHub',
    configured: true,
    supportsOAuth: true,
    scopes: ['repo', 'read:user', 'read:org'],
    description: 'Access repositories, user info, and organizations',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    configured: true,
    supportsOAuth: true,
    scopes: ['user', 'project', 'deployment'],
    description: 'Deploy projects and manage deployments',
  },
  {
    id: 'netlify',
    name: 'Netlify',
    configured: true,
    supportsOAuth: true,
    description: 'Deploy static sites and serverless functions',
  },
  {
    id: 'google',
    name: 'Google Cloud',
    configured: true,
    supportsOAuth: true,
    scopes: ['profile', 'email', 'cloud-platform'],
    description: 'Access GCP services and Firebase',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    configured: false,
    supportsOAuth: false,
    description: 'CDN, DNS, and edge computing',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    configured: false,
    supportsOAuth: false,
    description: 'Database, auth, and storage',
  },
  {
    id: 'turso',
    name: 'Turso',
    configured: false,
    supportsOAuth: false,
    description: 'Edge SQLite database',
  },
  {
    id: 'planetscale',
    name: 'PlanetScale',
    configured: false,
    supportsOAuth: false,
    description: 'Serverless MySQL database',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    configured: false,
    supportsOAuth: false,
    description: 'Unified AI model access',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    configured: false,
    supportsOAuth: false,
    description: 'Payment processing',
  },
];

// =============================================================================
// CREDENTIAL SERVICE CLASS
// =============================================================================

class CredentialService {
  private baseUrl = '/api/credentials';

  /**
   * Get list of available OAuth providers
   */
  async getAvailableProviders(): Promise<OAuthProvider[]> {
    try {
      const response = await apiClient.get<{ providers: OAuthProvider[] }>('/api/oauth/providers');
      return response?.data?.providers || OAUTH_PROVIDERS;
    } catch {
      return OAUTH_PROVIDERS;
    }
  }

  /**
   * List all stored credentials for the current user
   */
  async listCredentials(projectId?: string): Promise<StoredCredential[]> {
    try {
      const url = projectId
        ? `/api/projects/${projectId}/credentials`
        : this.baseUrl;
      const response = await apiClient.get<CredentialListResponse>(url);
      return response?.data?.credentials || [];
    } catch {
      return [];
    }
  }

  /**
   * Get a specific credential
   */
  async getCredential(integrationId: string): Promise<StoredCredential | null> {
    try {
      const response = await apiClient.get<{ credential: StoredCredential }>(
        `${this.baseUrl}/${integrationId}`
      );
      return response?.data?.credential || null;
    } catch {
      return null;
    }
  }

  /**
   * Start OAuth 2.0 authorization flow
   * Returns the authorization URL to redirect the user to
   */
  async startOAuthFlow(
    providerId: OAuthProviderId,
    options?: {
      scopes?: string[];
      projectId?: string;
      returnUrl?: string;
    }
  ): Promise<OAuthFlowResponse | { error: string }> {
    try {
      const response = await apiClient.post<OAuthFlowResponse>('/api/oauth/authorize', {
        provider: providerId,
        scopes: options?.scopes,
        projectId: options?.projectId,
        returnUrl: options?.returnUrl || window.location.href,
      });

      if (!response?.data?.authorizationUrl) {
        return { error: 'Failed to get authorization URL' };
      }

      return response.data;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'OAuth flow failed',
      };
    }
  }

  /**
   * Handle OAuth callback (called after redirect back from provider)
   */
  async handleOAuthCallback(
    code: string,
    state: string,
    providerId: OAuthProviderId
  ): Promise<OAuthCallbackResult> {
    try {
      const response = await apiClient.post<OAuthCallbackResult>('/api/oauth/callback', {
        code,
        state,
        provider: providerId,
      });

      return response?.data || { success: false, provider: providerId, error: 'No response' };
    } catch (error) {
      return {
        success: false,
        provider: providerId,
        error: error instanceof Error ? error.message : 'Callback failed',
      };
    }
  }

  /**
   * Store an API key credential (non-OAuth)
   */
  async storeApiKey(
    credential: ApiKeyCredential,
    projectId?: string
  ): Promise<{ success: boolean; credentialId?: string; error?: string }> {
    try {
      const url = projectId
        ? `/api/projects/${projectId}/credentials`
        : this.baseUrl;

      const response = await apiClient.post<{ credentialId: string }>(url, {
        name: credential.name,
        value: credential.value,
        service: credential.service,
        description: credential.description,
        type: 'api_key',
      });

      return {
        success: true,
        credentialId: response?.data?.credentialId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to store credential',
      };
    }
  }

  /**
   * Update an existing credential
   */
  async updateCredential(
    integrationId: string,
    updates: Partial<ApiKeyCredential>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await apiClient.patch(`${this.baseUrl}/${integrationId}`, updates);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update credential',
      };
    }
  }

  /**
   * Delete a credential
   */
  async deleteCredential(integrationId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await apiClient.delete(`${this.baseUrl}/${integrationId}`);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete credential',
      };
    }
  }

  /**
   * Validate a credential
   */
  async validateCredential(integrationId: string): Promise<{
    valid: boolean;
    error?: string;
  }> {
    try {
      const response = await apiClient.post<{ valid: boolean; error?: string }>(
        `${this.baseUrl}/${integrationId}/validate`
      );
      return response?.data || { valid: false };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }

  /**
   * Refresh OAuth tokens for a credential
   */
  async refreshTokens(integrationId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await apiClient.post(`${this.baseUrl}/${integrationId}/refresh`);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      };
    }
  }

  /**
   * Revoke an OAuth connection
   */
  async revokeOAuthConnection(providerId: OAuthProviderId): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      await apiClient.post('/api/oauth/revoke', { provider: providerId });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Revocation failed',
      };
    }
  }

  /**
   * Get audit logs for credentials
   */
  async getAuditLogs(integrationId?: string, limit: number = 50): Promise<Array<{
    id: string;
    integrationId: string;
    action: string;
    status: string;
    createdAt: string;
    details?: Record<string, unknown>;
  }>> {
    try {
      const params = new URLSearchParams();
      if (integrationId) params.set('integrationId', integrationId);
      params.set('limit', limit.toString());

      const response = await apiClient.get<{ logs: Array<{
        id: string;
        integrationId: string;
        action: string;
        status: string;
        createdAt: string;
        details?: Record<string, unknown>;
      }> }>(`${this.baseUrl}/audit-logs?${params.toString()}`);

      return response?.data?.logs || [];
    } catch {
      return [];
    }
  }

  /**
   * Open OAuth authorization in a popup window
   */
  openOAuthPopup(
    authorizationUrl: string,
    options?: {
      width?: number;
      height?: number;
      onSuccess?: (result: OAuthCallbackResult) => void;
      onError?: (error: string) => void;
    }
  ): Window | null {
    const width = options?.width || 600;
    const height = options?.height || 700;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    const popup = window.open(
      authorizationUrl,
      'oauth_popup',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=yes`
    );

    if (popup) {
      // Listen for messages from the popup
      const messageHandler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;

        if (event.data?.type === 'oauth_callback') {
          window.removeEventListener('message', messageHandler);
          popup.close();

          if (event.data.success) {
            options?.onSuccess?.(event.data as OAuthCallbackResult);
          } else {
            options?.onError?.(event.data.error || 'OAuth failed');
          }
        }
      };

      window.addEventListener('message', messageHandler);

      // Check if popup was closed
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
        }
      }, 500);
    }

    return popup;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const credentialService = new CredentialService();

export default credentialService;
