/**
 * useProjectSettingsStore - Shared Zustand store for project-level settings
 *
 * This store is the single source of truth for project settings.
 * All floating panels (Verification Swarm, Ghost Mode, Tournament, Live Video,
 * Soft Interrupt) read their configuration from this store instead of using
 * hardcoded defaults.
 *
 * Settings are loaded from the backend on project open and saved via
 * PATCH /api/projects/:id/settings when the user changes them.
 */

import { create } from 'zustand';
import { apiClient } from '../lib/api-client';

// =============================================================================
// TYPES - Mirrors ProjectSettings interface in ProjectSettings.tsx
// =============================================================================

export interface BuildConfig {
  defaultModel: string;
  speedMode: 'standard' | 'tournament' | 'production';
  buildType: 'web' | 'mobile' | 'api';
  extendedThinking: boolean;
  autoMergeOnPass: boolean;
  intelligencePreset?: string;
  thinkingDepth?: string;
  powerLevel?: string;
  speedPriority?: string;
  creativityLevel?: string;
  codeVerbosity?: string;
  designDetail?: string;
  maxParallelAgents?: number;
  buildTimeout?: number;
  costCeiling?: number;
  environment?: string;
}

export interface DesignConfig {
  defaultTheme: string;
  colorScheme: 'light' | 'dark' | 'auto';
  typography: 'modern' | 'classic' | 'playful' | 'minimal';
  enableMockupGeneration: boolean;
  mockupProvider: 'runpod' | 'replicate' | 'local';
  saveGeneratedDesigns: boolean;
  designToCodeTethering: boolean;
  componentLibrary?: string;
  iconLibrary?: string;
  cssFramework?: string;
}

export interface GhostModeConfig {
  enabled: boolean;
  maxRuntime: number;
  maxCredits: number;
  autonomyLevel: 'conservative' | 'moderate' | 'aggressive';
  pauseOnError: boolean;
  notifyOnComplete: boolean;
  autoMerge?: boolean;
  checkpointInterval?: number;
}

export interface VerificationConfig {
  enabled: boolean;
  swarmMode?: string;
  designScoreThreshold: number;
  codeQualityThreshold: number;
  securityScan: boolean;
  placeholderCheck: boolean;
  showWindow: 'always' | 'auto' | 'never';
  autoRunOnBuild?: boolean;
  bugHuntAutoTrigger?: boolean;
  gatePolicy?: string;
  repairManEnabled?: boolean;
  agents?: Record<string, { enabled: boolean; autoFix?: boolean }>;
}

export interface TournamentConfig {
  competitors: number;
  autoMergeWinner: boolean;
}

export interface FeatureAgentConfig {
  defaultModel: string;
  maxConcurrent: number;
  timeoutMinutes: number;
}

export interface TimeMachineConfig {
  enabled: boolean;
  autoCheckpoint: boolean;
  checkpointInterval: number;
  retentionDays: number;
  showBanner: boolean;
}

export interface LearningConfig {
  autoCapture: boolean;
  usePatterns: boolean;
  showSuggestions: boolean;
  captureDecisions: boolean;
}

export interface NotificationsConfig {
  buildStarted: boolean;
  buildComplete: boolean;
  buildFailed: boolean;
  verificationIssues: boolean;
  ghostModeWake?: boolean;
  deploymentComplete?: boolean;
  credentialExpiry?: boolean;
  costThreshold?: boolean;
  costThresholdValue?: number;
  softInterruptResponse?: boolean;
}

export interface GitConfig {
  autoCommit: boolean;
  autoPush: boolean;
  commitTemplate: string;
  defaultBranch: string;
}

export interface ProjectSettings {
  buildConfig: BuildConfig;
  design: DesignConfig;
  ghostMode: GhostModeConfig;
  verification: VerificationConfig;
  tournament?: TournamentConfig;
  featureAgent?: FeatureAgentConfig;
  timeMachine: TimeMachineConfig;
  learning: LearningConfig;
  notifications: NotificationsConfig;
  git?: GitConfig;
}

// =============================================================================
// DEFAULT SETTINGS
// =============================================================================

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  buildConfig: {
    defaultModel: 'claude-sonnet-4',
    speedMode: 'standard',
    buildType: 'web',
    extendedThinking: false,
    autoMergeOnPass: false,
    intelligencePreset: 'balanced',
    thinkingDepth: 'normal',
    powerLevel: 'balanced',
    speedPriority: 'balanced',
    creativityLevel: 'balanced',
    codeVerbosity: 'standard',
    designDetail: 'standard',
    maxParallelAgents: 3,
    buildTimeout: 120,
    costCeiling: 100,
    environment: 'development',
  },
  design: {
    defaultTheme: 'minimal-dark',
    colorScheme: 'dark',
    typography: 'modern',
    enableMockupGeneration: true,
    mockupProvider: 'runpod',
    saveGeneratedDesigns: true,
    designToCodeTethering: true,
    componentLibrary: 'shadcn',
    iconLibrary: 'lucide',
    cssFramework: 'tailwind',
  },
  verification: {
    enabled: true,
    swarmMode: 'thorough',
    designScoreThreshold: 75,
    codeQualityThreshold: 70,
    securityScan: true,
    placeholderCheck: true,
    showWindow: 'auto',
    autoRunOnBuild: true,
    bugHuntAutoTrigger: false,
    gatePolicy: 'warn',
    repairManEnabled: true,
    agents: {
      errorChecker: { enabled: true, autoFix: false },
      codeQuality: { enabled: true },
      visualVerifier: { enabled: true },
      securityScanner: { enabled: true },
      placeholderEliminator: { enabled: true },
      designStyle: { enabled: true },
    },
  },
  ghostMode: {
    enabled: true,
    maxRuntime: 120,
    maxCredits: 100,
    autonomyLevel: 'moderate',
    pauseOnError: true,
    notifyOnComplete: true,
    autoMerge: false,
    checkpointInterval: 15,
  },
  tournament: {
    competitors: 3,
    autoMergeWinner: false,
  },
  featureAgent: {
    defaultModel: 'claude-sonnet-4',
    maxConcurrent: 3,
    timeoutMinutes: 60,
  },
  learning: {
    autoCapture: true,
    usePatterns: true,
    showSuggestions: true,
    captureDecisions: true,
  },
  notifications: {
    buildStarted: true,
    buildComplete: true,
    buildFailed: true,
    verificationIssues: true,
    ghostModeWake: true,
    deploymentComplete: true,
    credentialExpiry: true,
    costThreshold: false,
    costThresholdValue: 50,
    softInterruptResponse: true,
  },
  timeMachine: {
    enabled: true,
    autoCheckpoint: true,
    checkpointInterval: 15,
    retentionDays: 30,
    showBanner: true,
  },
  git: {
    autoCommit: false,
    autoPush: false,
    commitTemplate: '',
    defaultBranch: 'main',
  },
};

// =============================================================================
// STORE
// =============================================================================

interface ProjectSettingsState {
  /** The current project ID these settings belong to */
  projectId: string | null;
  /** The live settings object - always has all fields (merged with defaults) */
  settings: ProjectSettings;
  /** Whether settings are currently being loaded from backend */
  isLoading: boolean;
  /** Whether settings have been modified and need saving */
  hasUnsavedChanges: boolean;
  /** Last time settings were synced from backend */
  lastSyncedAt: Date | null;

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Load settings from backend for a specific project */
  loadSettings: (projectId: string) => Promise<void>;

  /** Save current settings to backend */
  saveSettings: () => Promise<boolean>;

  /** Update a top-level settings section (e.g. 'buildConfig', 'verification') */
  updateSection: <K extends keyof ProjectSettings>(
    section: K,
    updates: Partial<ProjectSettings[K]>
  ) => void;

  /** Replace the entire settings object (used by ProjectSettings modal) */
  setSettings: (settings: ProjectSettings) => void;

  /** Reset settings to defaults */
  resetToDefaults: () => void;

  /** Clear store (when navigating away from project) */
  clearSettings: () => void;
}

// Deep merge utility: merges source into target, preserving nested objects
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = result[key];
    if (
      sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
      targetVal && typeof targetVal === 'object' && !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      ) as T[keyof T];
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T];
    }
  }
  return result;
}

export const useProjectSettingsStore = create<ProjectSettingsState>((set, get) => ({
  projectId: null,
  settings: { ...DEFAULT_PROJECT_SETTINGS },
  isLoading: false,
  hasUnsavedChanges: false,
  lastSyncedAt: null,

  loadSettings: async (projectId: string) => {
    // Skip if already loaded for this project and not stale
    const state = get();
    if (state.projectId === projectId && state.lastSyncedAt) {
      const ageMs = Date.now() - state.lastSyncedAt.getTime();
      if (ageMs < 30_000) return; // Fresh enough (30s cache)
    }

    set({ isLoading: true, projectId });

    try {
      const response = await apiClient.get<{ settings: Partial<ProjectSettings> }>(
        `/api/projects/${projectId}/settings`
      );

      const backendSettings = response?.data?.settings || {};

      // Deep merge backend settings over defaults so all fields are always present
      const merged = deepMerge(
        { ...DEFAULT_PROJECT_SETTINGS },
        backendSettings as Partial<ProjectSettings>
      ) as ProjectSettings;

      set({
        settings: merged,
        isLoading: false,
        hasUnsavedChanges: false,
        lastSyncedAt: new Date(),
      });

      console.log('[ProjectSettingsStore] Loaded settings for', projectId);
    } catch (error) {
      console.warn('[ProjectSettingsStore] Failed to load settings, using defaults:', error);
      set({
        settings: { ...DEFAULT_PROJECT_SETTINGS },
        isLoading: false,
        hasUnsavedChanges: false,
        lastSyncedAt: new Date(),
      });
    }
  },

  saveSettings: async () => {
    const { projectId, settings } = get();
    if (!projectId) return false;

    try {
      await apiClient.patch(`/api/projects/${projectId}/settings`, { settings });
      set({ hasUnsavedChanges: false, lastSyncedAt: new Date() });
      console.log('[ProjectSettingsStore] Settings saved for', projectId);
      return true;
    } catch (error) {
      console.error('[ProjectSettingsStore] Failed to save settings:', error);
      return false;
    }
  },

  updateSection: (section, updates) => {
    set((state) => {
      const currentSection = state.settings[section];
      // Spread current and incoming values using Object.assign for type safety
      const updatedSection = Object.assign({}, currentSection, updates);
      return {
        settings: {
          ...state.settings,
          [section]: updatedSection,
        },
        hasUnsavedChanges: true,
      };
    });
  },

  setSettings: (settings) => {
    set({ settings, hasUnsavedChanges: true });
  },

  resetToDefaults: () => {
    set({
      settings: { ...DEFAULT_PROJECT_SETTINGS },
      hasUnsavedChanges: true,
    });
  },

  clearSettings: () => {
    set({
      projectId: null,
      settings: { ...DEFAULT_PROJECT_SETTINGS },
      isLoading: false,
      hasUnsavedChanges: false,
      lastSyncedAt: null,
    });
  },
}));
