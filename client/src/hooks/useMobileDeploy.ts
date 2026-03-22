/**
 * useMobileDeploy Hook
 *
 * Frontend hook for the 3-tier mobile deployment pipeline:
 * - Tier 1: PWA (Quick Install)
 * - Tier 2: KripTik Player (Kompanion)
 * - Tier 3: Native App Store (Codemagic)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiClient } from '../lib/api-client';

export type DeploymentTier = 'pwa' | 'player' | 'native';
export type MobileBuildStatus = 'idle' | 'queued' | 'building' | 'signing' | 'uploading' | 'success' | 'failed' | 'cancelled';

export interface TierInfo {
  id: DeploymentTier;
  name: string;
  description: string;
  features: string[];
  requirements: string[];
  available: boolean;
}

export interface BuildEvent {
  type: 'status' | 'progress' | 'phase' | 'build_update' | 'artifact' | 'error' | 'complete';
  buildId: string;
  data: {
    status?: string;
    progress?: number;
    phase?: string;
    downloadUrl?: string;
    qrCodeUrl?: string;
    error?: string;
    message?: string;
  };
  timestamp: number;
}

export interface AppleCredentialStatus {
  hasCredentials: boolean;
  teamId?: string;
  validatedAt?: string | null;
}

export interface MobileDeployState {
  // Tier info
  tiers: TierInfo[];
  tiersLoading: boolean;

  // Credential status
  appleCredentials: AppleCredentialStatus;
  credentialsLoading: boolean;

  // Build state
  buildId: string | null;
  buildStatus: MobileBuildStatus;
  buildProgress: number;
  buildStatus: string;
  buildError: string | null;
  artifactUrl: string | null;
  qrCodeUrl: string | null;

  // PWA state
  pwaUrl: string | null;
  pwaGenerating: boolean;

  // Player state
  playerUrl: string | null;
  playerDeploying: boolean;
}

export function useMobileDeploy(projectId: string) {
  const [state, setState] = useState<MobileDeployState>({
    tiers: [],
    tiersLoading: false,
    appleCredentials: { hasCredentials: false },
    credentialsLoading: false,
    buildId: null,
    buildStatus: 'idle',
    buildProgress: 0,
    buildStatus: '',
    buildError: null,
    artifactUrl: null,
    qrCodeUrl: null,
    pwaUrl: null,
    pwaGenerating: false,
    playerUrl: null,
    playerDeploying: false,
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  /**
   * Load available deployment tiers
   */
  const loadTiers = useCallback(async () => {
    setState(s => ({ ...s, tiersLoading: true }));
    try {
      const { data } = await apiClient.get<{ success: boolean; tiers: TierInfo[] }>('/api/mobile-builds/tiers');
      setState(s => ({ ...s, tiers: data.tiers, tiersLoading: false }));
    } catch {
      setState(s => ({ ...s, tiersLoading: false }));
    }
  }, []);

  /**
   * Check Apple credential status
   */
  const checkAppleCredentials = useCallback(async () => {
    setState(s => ({ ...s, credentialsLoading: true }));
    try {
      const { data } = await apiClient.get<{
        success: boolean;
        hasCredentials: boolean;
        teamId?: string;
        validatedAt?: string | null;
      }>('/api/developer-credentials/apple');
      setState(s => ({
        ...s,
        appleCredentials: {
          hasCredentials: data.hasCredentials,
          teamId: data.teamId,
          validatedAt: data.validatedAt,
        },
        credentialsLoading: false,
      }));
    } catch {
      setState(s => ({ ...s, credentialsLoading: false }));
    }
  }, []);

  /**
   * Store Apple Developer credentials
   */
  const storeAppleCredentials = useCallback(async (creds: {
    teamId: string;
    ascKeyId: string;
    ascIssuerId: string;
    privateKeyContent: string;
  }) => {
    const { data } = await apiClient.post<{ success: boolean; credentialId?: string; error?: string }>(
      '/api/developer-credentials/apple',
      creds
    );
    if (data.success) {
      setState(s => ({
        ...s,
        appleCredentials: { hasCredentials: true, teamId: creds.teamId, validatedAt: null },
      }));
    }
    return data;
  }, []);

  /**
   * Validate stored Apple credentials
   */
  const validateAppleCredentials = useCallback(async () => {
    const { data } = await apiClient.post<{ success: boolean; valid: boolean; error?: string }>(
      '/api/developer-credentials/apple/validate',
      {}
    );
    if (data.valid) {
      setState(s => ({
        ...s,
        appleCredentials: { ...s.appleCredentials, validatedAt: new Date().toISOString() },
      }));
    }
    return data;
  }, []);

  /**
   * Subscribe to build SSE events
   */
  const subscribeToBuild = useCallback((buildId: string) => {
    eventSourceRef.current?.close();

    const apiUrl = import.meta.env.VITE_API_URL || '';
    const es = new EventSource(`${apiUrl}/api/mobile-builds/${buildId}/stream`, {
      withCredentials: true,
    });

    es.onmessage = (event) => {
      try {
        const data: BuildEvent = JSON.parse(event.data);
        setState(s => ({
          ...s,
          buildStatus: (data.data.status as MobileBuildStatus) || s.buildStatus,
          buildProgress: data.data.progress ?? s.buildProgress,
          buildStatus: data.data.phase || s.buildStatus,
          artifactUrl: data.data.downloadUrl || s.artifactUrl,
          qrCodeUrl: data.data.qrCodeUrl || s.qrCodeUrl,
          buildError: data.data.error || null,
        }));

        if (data.type === 'complete' || data.type === 'error') {
          es.close();
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
    };

    eventSourceRef.current = es;
  }, []);

  /**
   * Tier 1: Generate PWA
   */
  const generatePWA = useCallback(async (params: {
    appName: string;
    html: string;
    themeColor?: string;
  }) => {
    setState(s => ({ ...s, pwaGenerating: true, pwaUrl: null }));
    try {
      const { data } = await apiClient.post<{
        success: boolean;
        manifestUrl?: string;
        serviceWorkerUrl?: string;
        installUrl?: string;
      }>('/api/mobile-builds/pwa/generate', {
        projectId,
        appName: params.appName,
        html: params.html,
        themeColor: params.themeColor,
      });
      setState(s => ({
        ...s,
        pwaGenerating: false,
        pwaUrl: data.installUrl || null,
      }));
      return data;
    } catch (error) {
      setState(s => ({ ...s, pwaGenerating: false }));
      throw error;
    }
  }, [projectId]);

  /**
   * Tier 2: Deploy to KripTik Player (Kompanion app)
   *
   * Creates a player deep link URL. The web app is hosted at its
   * kriptik.app subdomain and loaded inside the Kompanion native shell.
   */
  const deployToPlayer = useCallback(async (params: {
    appName: string;
  }) => {
    setState(s => ({ ...s, playerDeploying: true, playerUrl: null }));
    try {
      // The player URL is a deep link that opens the app inside Kompanion
      // Format: kriptik://player/{projectId}
      // Fallback web URL: https://{projectId}.kriptik.app?player=true
      const playerDeepLink = `kriptik://player/${projectId}`;
      const webFallback = `https://${projectId}.kriptik.app?player=true`;

      setState(s => ({
        ...s,
        playerDeploying: false,
        playerUrl: playerDeepLink,
      }));

      return {
        success: true,
        deepLink: playerDeepLink,
        webUrl: webFallback,
        appName: params.appName,
      };
    } catch (error) {
      setState(s => ({ ...s, playerDeploying: false }));
      throw error;
    }
  }, [projectId]);

  /**
   * Tier 3: Start native build
   */
  const startNativeBuild = useCallback(async (params: {
    appName: string;
    bundleIdentifier: string;
    platform?: 'ios' | 'android';
    version?: string;
    buildType?: 'testflight' | 'appstore';
    webAppFiles?: Record<string, string>;
    appIconBase64?: string;
  }) => {
    setState(s => ({
      ...s,
      buildId: null,
      buildStatus: 'queued',
      buildProgress: 0,
      buildStatus: 'Starting build...',
      buildError: null,
      artifactUrl: null,
      qrCodeUrl: null,
    }));

    try {
      const { data } = await apiClient.post<{
        success: boolean;
        buildId?: string;
        error?: string;
      }>('/api/mobile-builds/build', {
        projectId,
        platform: params.platform || 'ios',
        appName: params.appName,
        bundleIdentifier: params.bundleIdentifier,
        version: params.version || '1.0.0',
        buildType: params.buildType || 'testflight',
        distribution: 'internal',
        webAppFiles: params.webAppFiles,
        appIconBase64: params.appIconBase64,
      });

      if (data.success && data.buildId) {
        setState(s => ({ ...s, buildId: data.buildId! }));
        subscribeToBuild(data.buildId);
      } else {
        setState(s => ({
          ...s,
          buildStatus: 'failed',
          buildError: data.error || 'Failed to start build',
        }));
      }

      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start build';
      setState(s => ({
        ...s,
        buildStatus: 'failed',
        buildError: message,
      }));
      throw error;
    }
  }, [projectId, subscribeToBuild]);

  /**
   * Cancel a running build
   */
  const cancelBuild = useCallback(async () => {
    if (!state.buildId) return;
    try {
      await apiClient.post(`/api/mobile-builds/${state.buildId}/cancel`, {});
      setState(s => ({ ...s, buildStatus: 'cancelled' }));
      eventSourceRef.current?.close();
    } catch {
      // Ignore cancel errors
    }
  }, [state.buildId]);

  /**
   * Reset build state
   */
  const resetBuild = useCallback(() => {
    eventSourceRef.current?.close();
    setState(s => ({
      ...s,
      buildId: null,
      buildStatus: 'idle',
      buildProgress: 0,
      buildStatus: '',
      buildError: null,
      artifactUrl: null,
      qrCodeUrl: null,
    }));
  }, []);

  return {
    ...state,
    loadTiers,
    checkAppleCredentials,
    storeAppleCredentials,
    validateAppleCredentials,
    generatePWA,
    deployToPlayer,
    startNativeBuild,
    cancelBuild,
    resetBuild,
  };
}
