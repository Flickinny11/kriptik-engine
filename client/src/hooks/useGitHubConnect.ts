/**
 * useGitHubConnect - Shared hook for GitHub OAuth connection
 *
 * Provides a unified GitHub connect/disconnect flow that works from
 * any entry point (Settings, Dashboard, Builder, etc.).
 *
 * Uses the dedicated GitHub OAuth service at /api/github/auth/*
 * which stores connections in the github_connections table.
 *
 * The OAuth flow opens in the current window (full redirect) since
 * popup-based OAuth is blocked by most browsers.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

export interface GitHubConnectionStatus {
    connected: boolean;
    username?: string;
    avatarUrl?: string;
    scope?: string;
    connectedAt?: string;
}

interface UseGitHubConnectOptions {
    /** Auto-fetch connection status on mount */
    autoFetch?: boolean;
    /** Custom return path after OAuth (default: current page) */
    returnPath?: string;
}

interface UseGitHubConnectReturn {
    /** Current connection status */
    status: GitHubConnectionStatus | null;
    /** Whether status is being loaded */
    isLoading: boolean;
    /** Whether OAuth redirect is in progress */
    isConnecting: boolean;
    /** Whether disconnect is in progress */
    isDisconnecting: boolean;
    /** Error message if any */
    error: string | null;
    /** Initiate GitHub OAuth flow */
    connect: () => Promise<void>;
    /** Disconnect GitHub account */
    disconnect: () => Promise<void>;
    /** Refresh connection status */
    refreshStatus: () => Promise<void>;
    /** Clear any error */
    clearError: () => void;
}

export function useGitHubConnect(options: UseGitHubConnectOptions = {}): UseGitHubConnectReturn {
    const { autoFetch = true } = options;

    const [status, setStatus] = useState<GitHubConnectionStatus | null>(null);
    const [isLoading, setIsLoading] = useState(autoFetch);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refreshStatus = useCallback(async () => {
        try {
            const response = await apiClient.get<GitHubConnectionStatus>('/api/github/connection');
            setStatus(response.data);
            setError(null);
        } catch (err) {
            console.error('[useGitHubConnect] Failed to fetch status:', err);
            setStatus({ connected: false });
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (autoFetch) {
            refreshStatus();
        }

        // Check URL params for OAuth callback result
        const params = new URLSearchParams(window.location.search);
        const githubStatus = params.get('github');

        if (githubStatus === 'connected') {
            refreshStatus();
            // Clean up URL params
            const nextParams = new URLSearchParams(params);
            nextParams.delete('github');
            const cleanUrl = nextParams.toString()
                ? `${window.location.pathname}?${nextParams.toString()}`
                : window.location.pathname;
            window.history.replaceState({}, '', cleanUrl);
        } else if (githubStatus === 'error') {
            const message = params.get('message');
            setError(message || 'Failed to connect to GitHub');
            // Clean up URL params
            const nextParams = new URLSearchParams(params);
            nextParams.delete('github');
            nextParams.delete('message');
            const cleanUrl = nextParams.toString()
                ? `${window.location.pathname}?${nextParams.toString()}`
                : window.location.pathname;
            window.history.replaceState({}, '', cleanUrl);
        }
    }, [autoFetch, refreshStatus]);

    const connect = useCallback(async () => {
        setIsConnecting(true);
        setError(null);

        try {
            interface AuthUrlResponse {
                url: string;
                state: string;
            }
            // Pass current page path so user returns here after OAuth
            const returnPath = encodeURIComponent(window.location.pathname + window.location.search);
            const response = await apiClient.get<AuthUrlResponse>(`/api/github/auth/url?returnPath=${returnPath}`);

            if (response.data.url) {
                // Full-page redirect to GitHub OAuth
                window.location.href = response.data.url;
            }
        } catch (err: any) {
            console.error('[useGitHubConnect] Failed to initiate OAuth:', err);
            setError(err.response?.data?.message || err.response?.data?.error || 'Failed to connect to GitHub');
            setIsConnecting(false);
        }
    }, []);

    const disconnect = useCallback(async () => {
        setIsDisconnecting(true);
        setError(null);

        try {
            await apiClient.delete('/api/github/connection');
            setStatus({ connected: false });
        } catch (err: any) {
            console.error('[useGitHubConnect] Failed to disconnect:', err);
            setError(err.response?.data?.error || 'Failed to disconnect GitHub');
        } finally {
            setIsDisconnecting(false);
        }
    }, []);

    const clearError = useCallback(() => setError(null), []);

    return {
        status,
        isLoading,
        isConnecting,
        isDisconnecting,
        error,
        connect,
        disconnect,
        refreshStatus,
        clearError,
    };
}
