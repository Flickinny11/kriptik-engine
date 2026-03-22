import { create } from 'zustand';
import { API_URL } from '../lib/api-config';

export type DeploymentProvider = 'cloud-run' | 'vercel' | 'netlify';
export type DeploymentStatus = 'idle' | 'configuring' | 'deploying' | 'success' | 'error';
export type DeploymentTarget = 'production' | 'preview';

export interface DeploymentLog {
    id: string;
    timestamp: number;
    message: string;
    type: 'info' | 'success' | 'error';
}

export interface DeploymentConfig {
    provider: DeploymentProvider;
    projectName: string;
    region: string;
    envVars: { key: string; value: string }[];
    customDomain: string;
    target: DeploymentTarget;
}

export interface DeploymentHistory {
    id: string;
    timestamp: number;
    version: string;
    url: string;
    status: 'active' | 'stopped';
    provider: DeploymentProvider;
}

interface DeploymentState {
    isOpen: boolean;
    status: DeploymentStatus;
    config: DeploymentConfig;
    logs: DeploymentLog[];
    history: DeploymentHistory[];
    currentUrl: string | null;

    // Actions
    setIsOpen: (isOpen: boolean) => void;
    setStatus: (status: DeploymentStatus) => void;
    setConfig: (config: Partial<DeploymentConfig>) => void;
    addLog: (message: string, type?: 'info' | 'success' | 'error') => void;
    clearLogs: () => void;
    startDeployment: () => Promise<void>;
    reset: () => void;
}

/**
 * Generate a unique project slug by appending a short random suffix.
 * Prevents namespace collisions when multiple users pick the same name.
 */
function uniqueSlug(name: string): string {
    const sanitized = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    const suffix = Math.random().toString(36).substring(2, 7);
    return `${sanitized}-${suffix}`;
}

const INITIAL_CONFIG: DeploymentConfig = {
    provider: 'cloud-run',
    projectName: '',
    region: 'us-central1',
    envVars: [],
    customDomain: '',
    target: 'production',
};

export const useDeploymentStore = create<DeploymentState>((set, get) => ({
    isOpen: false,
    status: 'idle',
    config: INITIAL_CONFIG,
    logs: [],
    history: [],
    currentUrl: null,

    setIsOpen: (isOpen) => set({ isOpen }),
    setStatus: (status) => set({ status }),
    setConfig: (newConfig) => set((state) => ({ config: { ...state.config, ...newConfig } })),

    addLog: (message, type = 'info') => set((state) => ({
        logs: [...state.logs, { id: Math.random().toString(), timestamp: Date.now(), message, type }]
    })),

    clearLogs: () => set({ logs: [] }),

    reset: () => set({ status: 'idle', logs: [], currentUrl: null }),

    startDeployment: async () => {
        const { setStatus, addLog, config } = get();

        if (!config.projectName.trim()) {
            addLog('Project name is required.', 'error');
            return;
        }

        setStatus('deploying');
        set({ logs: [] });

        const slug = uniqueSlug(config.projectName);
        addLog(`Project slug: ${slug}`, 'info');
        addLog(`Target: ${config.target} • Provider: ${config.provider}`, 'info');

        try {
            // ─── Cloud Run (KripTik managed) ───
            if (config.provider === 'cloud-run') {
                addLog('Deploying via KripTik managed Cloud Run...', 'info');

                const response = await fetch(`${API_URL}/api/deploy/cloud-run`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        name: slug,
                        region: config.region || 'us-central1',
                        target: config.target,
                        envVars: config.envVars.filter(v => v.key && v.value),
                        customDomain: config.customDomain || undefined,
                    }),
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({ error: 'Deploy failed' }));
                    throw new Error(err.error || `Cloud Run deploy failed (${response.status})`);
                }

                const result = await response.json();
                addLog('Cloud Run service provisioned', 'info');

                if (config.customDomain) {
                    addLog(`Custom domain ${config.customDomain} configured`, 'info');
                }

                addLog('Deployment successful!', 'success');

                const url = result.url || `https://${slug}.run.app`;
                set((state) => ({
                    status: 'success',
                    currentUrl: url,
                    history: [{
                        id: result.deploymentId || Math.random().toString(),
                        timestamp: Date.now(),
                        version: `v${state.history.length + 1}.0.0`,
                        url,
                        status: 'active',
                        provider: 'cloud-run',
                    }, ...state.history],
                }));
                return;
            }

            // ─── Vercel ───
            if (config.provider === 'vercel') {
                addLog('Deploying to Vercel...', 'info');
                addLog(`Target environment: ${config.target}`, 'info');

                const response = await fetch(`${API_URL}/api/deploy/vercel`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        name: slug,
                        target: config.target,
                        files: [],  // Build system populates this from the built project
                        projectSettings: {
                            framework: 'nextjs',
                            buildCommand: 'npm run build',
                            outputDirectory: '.next',
                        },
                        environmentVariables: Object.fromEntries(
                            config.envVars.filter(v => v.key && v.value).map(v => [v.key, v.value])
                        ),
                        customDomain: config.customDomain || undefined,
                    }),
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({ error: 'Deploy failed' }));
                    throw new Error(err.error || `Vercel deploy failed (${response.status})`);
                }

                const result = await response.json();
                const deployment = result.deployment;

                addLog(`Deployment created: ${deployment.id}`, 'info');
                addLog('Waiting for build to complete...', 'info');

                // Poll for deployment status
                let attempts = 0;
                const maxAttempts = 60; // 5 minutes max
                while (attempts < maxAttempts) {
                    await new Promise(r => setTimeout(r, 5000));
                    attempts++;

                    const statusResp = await fetch(
                        `${API_URL}/api/deploy/vercel/status/${deployment.id}`,
                        { credentials: 'include' }
                    );

                    if (!statusResp.ok) continue;

                    const statusData = await statusResp.json();
                    const state = statusData.deployment?.state || statusData.deployment?.readyState;

                    if (state === 'READY') {
                        const url = `https://${statusData.deployment.url || deployment.url}`;

                        // Configure custom domain if provided
                        if (config.customDomain) {
                            addLog(`Configuring custom domain: ${config.customDomain}`, 'info');
                            await fetch(`${API_URL}/api/deploy/vercel/domain`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({
                                    projectName: slug,
                                    domain: config.customDomain,
                                }),
                            });
                        }

                        addLog('Deployment successful!', 'success');
                        set((prev) => ({
                            status: 'success',
                            currentUrl: url,
                            history: [{
                                id: deployment.id,
                                timestamp: Date.now(),
                                version: `v${prev.history.length + 1}.0.0`,
                                url,
                                status: 'active',
                                provider: 'vercel',
                            }, ...prev.history],
                        }));
                        return;
                    }

                    if (state === 'ERROR' || state === 'CANCELED') {
                        throw new Error(`Vercel build ${state.toLowerCase()}`);
                    }

                    if (attempts % 4 === 0) {
                        addLog(`Build in progress... (${attempts * 5}s)`, 'info');
                    }
                }

                throw new Error('Deployment timed out after 5 minutes');
            }

            // ─── Netlify ───
            if (config.provider === 'netlify') {
                addLog('Deploying to Netlify...', 'info');

                const response = await fetch(`${API_URL}/api/deploy/netlify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        siteName: slug,
                        files: [],  // Build system populates this from the built project
                        customDomain: config.customDomain || undefined,
                    }),
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({ error: 'Deploy failed' }));
                    throw new Error(err.error || `Netlify deploy failed (${response.status})`);
                }

                const result = await response.json();
                const deploy = result.deployment;

                addLog(`Deploy created: ${deploy.id}`, 'info');
                addLog('Waiting for Netlify to process...', 'info');

                // Poll for deploy status
                let attempts = 0;
                const maxAttempts = 60;
                while (attempts < maxAttempts) {
                    await new Promise(r => setTimeout(r, 5000));
                    attempts++;

                    const statusResp = await fetch(
                        `${API_URL}/api/deploy/netlify/status/${deploy.id}`,
                        { credentials: 'include' }
                    );

                    if (!statusResp.ok) continue;

                    const statusData = await statusResp.json();
                    const state = statusData.deploy?.state;

                    if (state === 'ready') {
                        const url = statusData.deploy.deploy_ssl_url || statusData.deploy.deploy_url;

                        if (config.customDomain) {
                            addLog(`Configuring custom domain: ${config.customDomain}`, 'info');
                            await fetch(`${API_URL}/api/deploy/netlify/domain`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({
                                    siteId: deploy.site_id,
                                    domain: config.customDomain,
                                }),
                            });
                        }

                        addLog('Deployment successful!', 'success');
                        set((prev) => ({
                            status: 'success',
                            currentUrl: url,
                            history: [{
                                id: deploy.id,
                                timestamp: Date.now(),
                                version: `v${prev.history.length + 1}.0.0`,
                                url,
                                status: 'active',
                                provider: 'netlify',
                            }, ...prev.history],
                        }));
                        return;
                    }

                    if (state === 'error') {
                        throw new Error('Netlify deploy failed');
                    }

                    if (attempts % 4 === 0) {
                        addLog(`Processing... (${attempts * 5}s)`, 'info');
                    }
                }

                throw new Error('Deployment timed out after 5 minutes');
            }
        } catch (error: any) {
            addLog(`Error: ${error.message || 'Deployment failed'}`, 'error');
            setStatus('error');
        }
    }
}));
