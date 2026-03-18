import { create } from 'zustand';
import { apiClient, type Project } from '@/lib/api-client';

interface ProjectState {
  projects: Project[];
  isLoading: boolean;
  fetchProjects: () => Promise<void>;
  addProject: (project: Project) => void;
  removeProject: (id: string) => Promise<void>;
  updateProjectStatus: (id: string, status: Project['status']) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  isLoading: false,

  fetchProjects: async () => {
    set({ isLoading: true });
    try {
      const { projects } = await apiClient.getProjects();
      set({ projects, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  addProject: (project) => {
    set({ projects: [project, ...get().projects] });
  },

  removeProject: async (id) => {
    try {
      await apiClient.deleteProject(id);
      set({ projects: get().projects.filter(p => p.id !== id) });
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  },

  updateProjectStatus: (id, status) => {
    set({
      projects: get().projects.map(p => p.id === id ? { ...p, status } : p),
    });
  },
}));
