/**
 * Preview Deployment API Client
 *
 * Frontend client for the preview deployment service.
 * Handles creation, status checks, and management of preview deployments
 * at *.kriptik.app subdomains.
 */

import { API_URL, authenticatedFetch } from '../lib/api-config';

// ============================================================================
// TYPES
// ============================================================================

export interface PreviewDeploymentRequest {
    projectId: string;
    appName?: string;
}

export interface PreviewDeploymentResult {
    success: boolean;
    previewUrl: string;
    subdomain: string;
    deploymentId: string;
    hostedDeploymentId: string;
    provider: 'cloudflare' | 'vercel';
    status: 'deploying' | 'live' | 'failed';
    createdAt: string;
}

export interface PreviewStatus {
    previewUrl: string;
    subdomain: string;
    status: 'deploying' | 'live' | 'failed' | 'not_found';
    lastDeployedAt: string | null;
    provider: string | null;
}

export interface SubdomainCheckResult {
    available: boolean;
    subdomain: string;
    fullUrl: string | null;
    reason: string | null;
}

// ============================================================================
// API CLIENT
// ============================================================================

/**
 * Create a new preview deployment
 */
export async function createPreview(request: PreviewDeploymentRequest): Promise<PreviewDeploymentResult> {
    const response = await authenticatedFetch(`${API_URL}/api/preview`, {
        method: 'POST',
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to create preview' }));
        throw new Error(error.message || 'Failed to create preview deployment');
    }

    return response.json();
}

/**
 * Get preview status for a project
 */
export async function getPreviewStatus(projectId: string): Promise<PreviewStatus> {
    const response = await authenticatedFetch(`${API_URL}/api/preview/${projectId}`);

    if (response.status === 404) {
        return {
            previewUrl: '',
            subdomain: '',
            status: 'not_found',
            lastDeployedAt: null,
            provider: null,
        };
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to get preview status' }));
        throw new Error(error.message || 'Failed to get preview status');
    }

    return response.json();
}

/**
 * Redeploy an existing preview
 */
export async function redeployPreview(projectId: string): Promise<PreviewDeploymentResult> {
    const response = await authenticatedFetch(`${API_URL}/api/preview/${projectId}/redeploy`, {
        method: 'POST',
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to redeploy preview' }));
        throw new Error(error.message || 'Failed to redeploy preview');
    }

    return response.json();
}

/**
 * Delete a preview deployment
 */
export async function deletePreview(projectId: string): Promise<boolean> {
    const response = await authenticatedFetch(`${API_URL}/api/preview/${projectId}`, {
        method: 'DELETE',
    });

    return response.ok;
}

/**
 * Check if a subdomain is available
 */
export async function checkSubdomainAvailability(subdomain: string): Promise<SubdomainCheckResult> {
    const response = await authenticatedFetch(`${API_URL}/api/preview/check-subdomain`, {
        method: 'POST',
        body: JSON.stringify({ subdomain }),
    });

    if (!response.ok) {
        throw new Error('Failed to check subdomain availability');
    }

    return response.json();
}

/**
 * Get all previews for current user
 */
export async function getUserPreviews(): Promise<{ previews: PreviewStatus[]; count: number }> {
    const response = await authenticatedFetch(`${API_URL}/api/preview/user/all`);

    if (!response.ok) {
        throw new Error('Failed to get user previews');
    }

    return response.json();
}

/**
 * Poll for preview deployment status
 * Returns when status is 'live' or 'failed', or times out
 */
export async function waitForPreviewReady(
    projectId: string,
    options: {
        maxWaitMs?: number;
        pollIntervalMs?: number;
        onStatusUpdate?: (status: PreviewStatus) => void;
    } = {}
): Promise<PreviewStatus> {
    const { maxWaitMs = 120000, pollIntervalMs = 3000, onStatusUpdate } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        const status = await getPreviewStatus(projectId);
        
        onStatusUpdate?.(status);

        if (status.status === 'live' || status.status === 'failed') {
            return status;
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    // Timeout - return last known status
    return getPreviewStatus(projectId);
}

// ============================================================================
// REACT HOOK HELPERS
// ============================================================================

/**
 * Create preview and wait for it to be ready
 * Combines createPreview with waitForPreviewReady
 */
export async function createAndWaitForPreview(
    request: PreviewDeploymentRequest,
    options: {
        maxWaitMs?: number;
        pollIntervalMs?: number;
        onStatusUpdate?: (status: PreviewStatus | PreviewDeploymentResult) => void;
    } = {}
): Promise<PreviewStatus> {
    const { onStatusUpdate, ...waitOptions } = options;

    // Create the preview
    const result = await createPreview(request);
    onStatusUpdate?.(result);

    // If already live, return immediately
    if (result.status === 'live') {
        return {
            previewUrl: result.previewUrl,
            subdomain: result.subdomain,
            status: 'live',
            lastDeployedAt: result.createdAt,
            provider: result.provider,
        };
    }

    // Wait for deployment to complete
    return waitForPreviewReady(request.projectId, {
        ...waitOptions,
        onStatusUpdate,
    });
}

export default {
    createPreview,
    getPreviewStatus,
    redeployPreview,
    deletePreview,
    checkSubdomainAvailability,
    getUserPreviews,
    waitForPreviewReady,
    createAndWaitForPreview,
};
