/**
 * usePreview Hook
 *
 * React hook for managing preview deployments.
 * Provides state management and callbacks for preview operations.
 */

import { useState, useCallback, useEffect } from 'react';
import {
    createPreview,
    getPreviewStatus,
    redeployPreview,
    waitForPreviewReady,
    type PreviewStatus,
} from '../services/preview-api';

// ============================================================================
// TYPES
// ============================================================================

export interface UsePreviewOptions {
    projectId: string;
    autoFetch?: boolean;
    pollOnDeploying?: boolean;
}

export interface UsePreviewReturn {
    // State
    previewUrl: string | null;
    subdomain: string | null;
    status: 'idle' | 'loading' | 'deploying' | 'live' | 'failed' | 'not_found';
    provider: string | null;
    lastDeployedAt: string | null;
    error: string | null;

    // Computed
    isReady: boolean;
    isDeploying: boolean;
    hasPreview: boolean;

    // Actions
    createPreview: (appName?: string) => Promise<void>;
    redeploy: () => Promise<void>;
    refresh: () => Promise<void>;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function usePreview(options: UsePreviewOptions): UsePreviewReturn {
    const { projectId, autoFetch = true, pollOnDeploying = true } = options;

    // State
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [subdomain, setSubdomain] = useState<string | null>(null);
    const [status, setStatus] = useState<'idle' | 'loading' | 'deploying' | 'live' | 'failed' | 'not_found'>('idle');
    const [provider, setProvider] = useState<string | null>(null);
    const [lastDeployedAt, setLastDeployedAt] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Update state from preview status
    const updateFromStatus = useCallback((previewStatus: PreviewStatus) => {
        setPreviewUrl(previewStatus.previewUrl || null);
        setSubdomain(previewStatus.subdomain || null);
        setStatus(previewStatus.status);
        setProvider(previewStatus.provider);
        setLastDeployedAt(previewStatus.lastDeployedAt);
    }, []);

    // Fetch current status
    const refresh = useCallback(async () => {
        if (!projectId) return;

        setStatus('loading');
        setError(null);

        try {
            const previewStatus = await getPreviewStatus(projectId);
            updateFromStatus(previewStatus);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch preview status');
            setStatus('failed');
        }
    }, [projectId, updateFromStatus]);

    // Create new preview
    const handleCreatePreview = useCallback(async (appName?: string) => {
        if (!projectId) return;

        setStatus('deploying');
        setError(null);

        try {
            const result = await createPreview({ projectId, appName });
            
            setPreviewUrl(result.previewUrl);
            setSubdomain(result.subdomain);
            setProvider(result.provider);
            setLastDeployedAt(result.createdAt);

            if (result.status === 'live') {
                setStatus('live');
            } else if (pollOnDeploying) {
                // Poll for completion
                const finalStatus = await waitForPreviewReady(projectId, {
                    onStatusUpdate: (s) => {
                        if (s.status !== 'deploying') {
                            updateFromStatus(s);
                        }
                    },
                });
                updateFromStatus(finalStatus);
            } else {
                setStatus('deploying');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create preview');
            setStatus('failed');
        }
    }, [projectId, pollOnDeploying, updateFromStatus]);

    // Redeploy existing preview
    const handleRedeploy = useCallback(async () => {
        if (!projectId) return;

        setStatus('deploying');
        setError(null);

        try {
            const result = await redeployPreview(projectId);
            
            setPreviewUrl(result.previewUrl);
            setSubdomain(result.subdomain);
            setProvider(result.provider);
            setLastDeployedAt(result.createdAt);

            if (result.status === 'live') {
                setStatus('live');
            } else if (pollOnDeploying) {
                const finalStatus = await waitForPreviewReady(projectId, {
                    onStatusUpdate: (s) => {
                        if (s.status !== 'deploying') {
                            updateFromStatus(s);
                        }
                    },
                });
                updateFromStatus(finalStatus);
            } else {
                setStatus('deploying');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to redeploy preview');
            setStatus('failed');
        }
    }, [projectId, pollOnDeploying, updateFromStatus]);

    // Auto-fetch on mount
    useEffect(() => {
        if (autoFetch && projectId) {
            refresh();
        }
    }, [autoFetch, projectId, refresh]);

    // Computed values
    const isReady = status === 'live';
    const isDeploying = status === 'deploying' || status === 'loading';
    const hasPreview = status !== 'not_found' && status !== 'idle';

    return {
        previewUrl,
        subdomain,
        status,
        provider,
        lastDeployedAt,
        error,
        isReady,
        isDeploying,
        hasPreview,
        createPreview: handleCreatePreview,
        redeploy: handleRedeploy,
        refresh,
    };
}

export default usePreview;
