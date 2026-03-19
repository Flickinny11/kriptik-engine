import { create } from 'zustand';
import { signInWithEmail, signUp as authSignUp, signOut as authSignOut, getSession } from '@/lib/auth-client';
import { apiClient } from '@/lib/api-client';

interface User {
  id: string;
  email: string;
  name: string;
  image?: string;
  slug?: string;
  credits: number;
  tier: string;
  createdAt?: string;
}

interface UserState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  updateProfile: (data: { name?: string; image?: string; slug?: string }) => Promise<void>;
  refreshCredits: () => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: async () => {
    try {
      const session = await getSession();
      if (session?.data?.user) {
        const u = session.data.user;
        set({ user: { id: u.id, email: u.email, name: u.name, image: u.image ?? undefined, credits: 0, tier: 'free' }, isAuthenticated: true, isLoading: false });
        // Fetch full profile with credits/tier in background
        try {
          const { profile } = await apiClient.getProfile();
          set({ user: { id: profile.id, email: profile.email, name: profile.name, image: profile.image ?? undefined, slug: profile.slug ?? undefined, credits: profile.credits, tier: profile.tier, createdAt: profile.createdAt } });
        } catch { /* profile fetch is best-effort during init */ }
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email, password) => {
    await signInWithEmail(email, password);
    await new Promise(r => setTimeout(r, 500));
    const session = await getSession();
    if (session?.data?.user) {
      const u = session.data.user;
      set({ user: { id: u.id, email: u.email, name: u.name, image: u.image ?? undefined, credits: 0, tier: 'free' }, isAuthenticated: true });
      // Fetch full profile
      try {
        const { profile } = await apiClient.getProfile();
        set({ user: { id: profile.id, email: profile.email, name: profile.name, image: profile.image ?? undefined, slug: profile.slug ?? undefined, credits: profile.credits, tier: profile.tier, createdAt: profile.createdAt } });
      } catch { /* best-effort */ }
    }
  },

  signup: async (email, password, name) => {
    await authSignUp(email, password, name);
    await new Promise(r => setTimeout(r, 500));
    const session = await getSession();
    if (session?.data?.user) {
      const u = session.data.user;
      set({ user: { id: u.id, email: u.email, name: u.name, image: u.image ?? undefined, credits: 500, tier: 'free' }, isAuthenticated: true });
    }
  },

  logout: async () => {
    await authSignOut();
    set({ user: null, isAuthenticated: false });
  },

  fetchProfile: async () => {
    try {
      const { profile } = await apiClient.getProfile();
      set({ user: { id: profile.id, email: profile.email, name: profile.name, image: profile.image ?? undefined, slug: profile.slug ?? undefined, credits: profile.credits, tier: profile.tier, createdAt: profile.createdAt } });
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    }
  },

  updateProfile: async (data) => {
    const { profile } = await apiClient.updateProfile(data);
    set({ user: { id: profile.id, email: profile.email, name: profile.name, image: profile.image ?? undefined, slug: profile.slug ?? undefined, credits: profile.credits, tier: profile.tier, createdAt: profile.createdAt } });
  },

  refreshCredits: async () => {
    try {
      const { credits, tier } = await apiClient.getBillingBalance();
      set(state => state.user ? { user: { ...state.user, credits, tier } } : {});
    } catch (err) {
      console.error('Failed to refresh credits:', err);
    }
  },
}));
