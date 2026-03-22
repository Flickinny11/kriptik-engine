import { create } from 'zustand';

export type NativePlatform = 'ios' | 'android';
export type WizardStep = 'platform' | 'devices' | 'credentials' | 'ready';

export interface NativeMobileConfig {
    platform: NativePlatform;
    selectedDevice: string;
    selectedDevices: string[];
    appName: string;
    bundleId: string;
}

interface NativeBuildState {
    nativeMobileEnabled: boolean;
    config: NativeMobileConfig;
    wizardStep: WizardStep;
    credentialsStored: boolean;
    previewUrl: string | null;
    panelOpen: boolean;

    // Derived
    isNativeBuild: boolean;
    isReady: boolean;

    // Actions
    setNativeMobileEnabled: (enabled: boolean) => void;
    setConfig: (config: Partial<NativeMobileConfig>) => void;
    setSelectedDevice: (deviceId: string) => void;
    toggleDevice: (deviceId: string) => void;
    setWizardStep: (step: WizardStep) => void;
    setCredentialsStored: (stored: boolean) => void;
    setPreviewUrl: (url: string | null) => void;
    setPanelOpen: (open: boolean) => void;
    reset: () => void;
}

const INITIAL_CONFIG: NativeMobileConfig = {
    platform: 'ios',
    selectedDevice: 'iphone16pro',
    selectedDevices: ['iphone16pro'],
    appName: '',
    bundleId: '',
};

export const useBuildTargetStore = create<NativeBuildState>((set, get) => ({
    nativeMobileEnabled: false,
    config: INITIAL_CONFIG,
    wizardStep: 'platform',
    credentialsStored: false,
    previewUrl: null,
    panelOpen: false,

    get isNativeBuild() { return get().nativeMobileEnabled; },
    get isReady() {
        const s = get();
        return s.nativeMobileEnabled && s.credentialsStored && s.config.selectedDevices.length > 0;
    },

    setNativeMobileEnabled: (enabled) => set({
        nativeMobileEnabled: enabled,
        panelOpen: enabled,
        wizardStep: enabled ? 'platform' : 'platform',
    }),

    setConfig: (config) => set((state) => ({
        config: { ...state.config, ...config },
    })),

    setSelectedDevice: (deviceId) => set((state) => ({
        config: { ...state.config, selectedDevice: deviceId },
    })),

    toggleDevice: (deviceId) => set((state) => {
        const devices = state.config.selectedDevices;
        const updated = devices.includes(deviceId)
            ? devices.filter(d => d !== deviceId)
            : [...devices, deviceId];
        return {
            config: {
                ...state.config,
                selectedDevices: updated.length > 0 ? updated : devices,
                selectedDevice: updated.includes(state.config.selectedDevice)
                    ? state.config.selectedDevice
                    : updated[0] || state.config.selectedDevice,
            },
        };
    }),

    setWizardStep: (step) => set({ wizardStep: step }),
    setCredentialsStored: (stored) => set({ credentialsStored: stored }),
    setPreviewUrl: (url) => set({ previewUrl: url }),
    setPanelOpen: (open) => set({ panelOpen: open }),

    reset: () => set({
        nativeMobileEnabled: false,
        config: INITIAL_CONFIG,
        wizardStep: 'platform',
        credentialsStored: false,
        previewUrl: null,
        panelOpen: false,
    }),
}));
