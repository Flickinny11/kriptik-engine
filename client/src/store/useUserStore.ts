import { create } from 'zustand';
import { signInWithEmail, signUp as authSignUp, signOut as authSignOut, getSession } from '@/lib/auth-client';

interface User {
  id: string;
  email: string;
  name: string;
  image?: string;
}

interface UserState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
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
        set({ user: { id: u.id, email: u.email, name: u.name, image: u.image ?? undefined }, isAuthenticated: true, isLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email, password) => {
    await signInWithEmail(email, password);
    // Give cookie time to set
    await new Promise(r => setTimeout(r, 500));
    const session = await getSession();
    if (session?.data?.user) {
      const u = session.data.user;
      set({ user: { id: u.id, email: u.email, name: u.name, image: u.image ?? undefined }, isAuthenticated: true });
    }
  },

  signup: async (email, password, name) => {
    await authSignUp(email, password, name);
    await new Promise(r => setTimeout(r, 500));
    const session = await getSession();
    if (session?.data?.user) {
      const u = session.data.user;
      set({ user: { id: u.id, email: u.email, name: u.name, image: u.image ?? undefined }, isAuthenticated: true });
    }
  },

  logout: async () => {
    await authSignOut();
    set({ user: null, isAuthenticated: false });
  },
}));
