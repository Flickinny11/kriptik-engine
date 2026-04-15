/**
 * usePrismConfigStore — Zustand store for Prism engine configuration.
 *
 * Manages model selection, target resolution, deployment targets,
 * and feature flags. Loaded from /api/prism/config on mount.
 */

import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import type { PrismEngineConfig } from '@kriptik/shared-interfaces';

interface PrismConfigState {
  config: PrismEngineConfig;
  prismEnabled: boolean;
  isLoaded: boolean;
  availableModels: {
    diffusion: Array<{ id: string; name: string; gpu: string; description: string }>;
    code: Array<{ id: string; name: string; gpu: string; description: string }>;
  };

  loadConfig: () => Promise<void>;
  loadModels: () => Promise<void>;
  updateConfig: (partial: Partial<PrismEngineConfig>) => void;
}

const defaultConfig: PrismEngineConfig = {
  diffusionModel: 'flux2-klein',
  codeModel: 'mercury-2',
  targetResolution: { width: 1440, height: 900 },
  styleReferences: [],
  backendTargets: ['cloudflare-workers'],
  deploymentTargets: ['vercel'],
  enableCompetitiveAnalysis: false,
  enableOvernightOptimization: false,
};

export const usePrismConfigStore = create<PrismConfigState>((set) => ({
  config: defaultConfig,
  prismEnabled: false,
  isLoaded: false,
  availableModels: { diffusion: [], code: [] },

  loadConfig: async () => {
    try {
      const { defaultConfig: serverConfig, prismEnabled } = await apiClient.getPrismConfig();
      set({
        config: {
          diffusionModel: serverConfig.diffusionModel as PrismEngineConfig['diffusionModel'],
          codeModel: serverConfig.codeModel as PrismEngineConfig['codeModel'],
          targetResolution: serverConfig.targetResolution,
          styleReferences: serverConfig.styleReferences,
          backendTargets: serverConfig.backendTargets as PrismEngineConfig['backendTargets'],
          deploymentTargets: serverConfig.deploymentTargets as PrismEngineConfig['deploymentTargets'],
          enableCompetitiveAnalysis: serverConfig.enableCompetitiveAnalysis,
          enableOvernightOptimization: serverConfig.enableOvernightOptimization,
        },
        prismEnabled,
        isLoaded: true,
      });
    } catch {
      set({ isLoaded: true, prismEnabled: false });
    }
  },

  loadModels: async () => {
    try {
      const { diffusionModels, codeModels } = await apiClient.getPrismModels();
      set({
        availableModels: { diffusion: diffusionModels, code: codeModels },
      });
    } catch {
      // Models will remain empty — UI shows defaults
    }
  },

  updateConfig: (partial) =>
    set((state) => ({ config: { ...state.config, ...partial } })),
}));
