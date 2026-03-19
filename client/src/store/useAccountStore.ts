import { create } from 'zustand';
import { apiClient, type SessionInfo, type CreditTransaction, type CreditPackage, type OAuthConnection, type UsageData } from '@/lib/api-client';

interface AccountState {
  // Sessions
  sessions: SessionInfo[];
  sessionsLoading: boolean;
  fetchSessions: () => Promise<void>;
  revokeSession: (id: string) => Promise<void>;

  // Billing
  packages: CreditPackage[];
  transactions: CreditTransaction[];
  billingLoading: boolean;
  fetchPackages: () => Promise<void>;
  fetchBillingHistory: () => Promise<void>;

  // OAuth connections
  connections: OAuthConnection[];
  connectionsLoading: boolean;
  fetchConnections: () => Promise<void>;

  // Usage
  usage: UsageData | null;
  usageLoading: boolean;
  fetchUsage: () => Promise<void>;
}

export const useAccountStore = create<AccountState>((set) => ({
  sessions: [],
  sessionsLoading: false,
  packages: [],
  transactions: [],
  billingLoading: false,
  connections: [],
  connectionsLoading: false,
  usage: null,
  usageLoading: false,

  fetchSessions: async () => {
    set({ sessionsLoading: true });
    try {
      const { sessions } = await apiClient.getSessions();
      set({ sessions, sessionsLoading: false });
    } catch {
      set({ sessionsLoading: false });
    }
  },

  revokeSession: async (id) => {
    await apiClient.revokeSession(id);
    set(state => ({ sessions: state.sessions.filter(s => s.id !== id) }));
  },

  fetchPackages: async () => {
    try {
      const { packages } = await apiClient.getCreditPackages();
      set({ packages });
    } catch { /* ignore */ }
  },

  fetchBillingHistory: async () => {
    set({ billingLoading: true });
    try {
      const { transactions } = await apiClient.getBillingHistory();
      set({ transactions, billingLoading: false });
    } catch {
      set({ billingLoading: false });
    }
  },

  fetchConnections: async () => {
    set({ connectionsLoading: true });
    try {
      const { connections } = await apiClient.getOAuthConnections();
      set({ connections, connectionsLoading: false });
    } catch {
      set({ connectionsLoading: false });
    }
  },

  fetchUsage: async () => {
    set({ usageLoading: true });
    try {
      const { usage } = await apiClient.getUsage();
      set({ usage, usageLoading: false });
    } catch {
      set({ usageLoading: false });
    }
  },
}));
