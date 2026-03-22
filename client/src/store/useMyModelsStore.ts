/**
 * My Models Store - Zustand state management for the "My Models" panel
 *
 * Manages user's trained/fine-tuned models, active pods, serverless endpoints.
 * Powers the "My Models" panel in the Builder ChatInterface.
 */

import { create } from 'zustand';
import { authenticatedFetch, API_URL } from '@/lib/api-config';

// =============================================================================
// TYPES
// =============================================================================

export interface UserModel {
  id: string;
  userId: string;
  name: string;
  sourceModelId: string | null;
  outputModelId: string | null;
  modality: string;
  status: 'training' | 'completed' | 'deploying' | 'deployed' | 'failed' | 'stopped';
  trainingJobId: string | null;
  endpointId: string | null;
  endpointUrl: string | null;
  podId: string | null;
  provider: string;
  config: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModelReference {
  id: string;
  name: string;
  displayTag: string;
  endpointId: string | null;
  endpointUrl: string | null;
  modality: string;
  status: string;
}

interface MyModelsState {
  // Data
  models: UserModel[];
  isLoading: boolean;
  error: string | null;

  // UI State
  isOpen: boolean;
  selectedModelId: string | null;

  // Actions
  fetchModels: () => Promise<void>;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  selectModel: (id: string | null) => void;
  deployModel: (id: string, config?: Record<string, unknown>) => Promise<void>;
  deleteModel: (id: string, terminateResources?: boolean) => Promise<void>;

  // Model reference for NLP bar injection
  createModelReference: (modelId: string) => ModelReference | null;
}

// =============================================================================
// STORE
// =============================================================================

export const useMyModelsStore = create<MyModelsState>((set, get) => ({
  models: [],
  isLoading: false,
  error: null,
  isOpen: false,
  selectedModelId: null,

  fetchModels: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await authenticatedFetch(`${API_URL}/api/user-models`);
      if (response.ok) {
        const data = await response.json();
        set({ models: data.models || [], isLoading: false });
      } else {
        const err = await response.json().catch(() => ({ error: 'Failed to fetch models' }));
        set({ error: err.error || 'Failed to fetch models', isLoading: false });
      }
    } catch (err) {
      console.error('[MyModelsStore] Fetch error:', err);
      set({ error: 'Network error fetching models', isLoading: false });
    }
  },

  setOpen: (open) => {
    set({ isOpen: open });
    if (open) {
      // Auto-fetch when opening
      get().fetchModels();
    }
  },

  toggleOpen: () => {
    const wasOpen = get().isOpen;
    set({ isOpen: !wasOpen });
    if (!wasOpen) {
      get().fetchModels();
    }
  },

  selectModel: (id) => set({ selectedModelId: id }),

  deployModel: async (id, config) => {
    try {
      const response = await authenticatedFetch(`${API_URL}/api/user-models/${id}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config || {}),
      });
      if (response.ok) {
        // Refresh the models list
        await get().fetchModels();
      } else {
        const err = await response.json().catch(() => ({ error: 'Deploy failed' }));
        throw new Error(err.error || 'Deploy failed');
      }
    } catch (err) {
      console.error('[MyModelsStore] Deploy error:', err);
      throw err;
    }
  },

  deleteModel: async (id, terminateResources = false) => {
    try {
      const url = `${API_URL}/api/user-models/${id}${terminateResources ? '?terminateResources=true' : ''}`;
      const response = await authenticatedFetch(url, { method: 'DELETE' });
      if (response.ok) {
        set(state => ({ models: state.models.filter(m => m.id !== id) }));
      }
    } catch (err) {
      console.error('[MyModelsStore] Delete error:', err);
    }
  },

  createModelReference: (modelId) => {
    const model = get().models.find(m => m.id === modelId);
    if (!model) return null;

    const shortName = model.name.length > 30 ? model.name.slice(0, 27) + '...' : model.name;
    const displayTag = `@${shortName.replace(/\s+/g, '-').toLowerCase()}`;

    return {
      id: model.id,
      name: model.name,
      displayTag,
      endpointId: model.endpointId,
      endpointUrl: model.endpointUrl,
      modality: model.modality,
      status: model.status,
    };
  },
}));
