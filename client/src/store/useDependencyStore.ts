/**
 * Global Dependency Store
 *
 * Zustand store for dependency connection state that persists across page
 * navigations. Centralizes service registry, MCP connections, tool caches,
 * and connection health monitoring.
 *
 * Components use this instead of independently fetching dependency data.
 */

import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import type {
  ServiceRegistryEntry,
  CategoryMeta,
  McpToolDefinition,
} from '@/lib/api-client';

export type ConnectFlowState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'needs_reauth'
  | 'needs_upgrade';

export interface ConnectionEntry {
  serviceId: string;
  state: ConnectFlowState;
  error?: string;
  connectedAt?: string;
  tools?: McpToolDefinition[];
  lastHealthCheck?: string;
}

interface DependencyState {
  // Service registry (cached after first load)
  services: ServiceRegistryEntry[];
  categories: CategoryMeta[];
  registryLoaded: boolean;

  // User connections
  connections: Map<string, ConnectionEntry>;
  connectionsLoaded: boolean;

  // Health check state
  healthCheckInterval: ReturnType<typeof setInterval> | null;

  // Actions
  loadRegistry: () => Promise<void>;
  loadConnections: () => Promise<void>;
  setConnectionState: (serviceId: string, state: ConnectFlowState, extra?: Partial<ConnectionEntry>) => void;
  removeConnection: (serviceId: string) => void;
  setToolsForService: (serviceId: string, tools: McpToolDefinition[]) => void;
  getConnectionState: (serviceId: string) => ConnectFlowState;
  getConnectionsMap: () => Map<string, ConnectFlowState>;
  startHealthChecks: () => void;
  stopHealthChecks: () => void;
  runHealthCheck: () => Promise<void>;
  reset: () => void;
}

export const useDependencyStore = create<DependencyState>((set, get) => ({
  services: [],
  categories: [],
  registryLoaded: false,

  connections: new Map(),
  connectionsLoaded: false,

  healthCheckInterval: null,

  loadRegistry: async () => {
    if (get().registryLoaded) return;
    try {
      const [servicesRes, categoriesRes] = await Promise.all([
        apiClient.getServiceRegistry(),
        apiClient.getServiceCategories(),
      ]);
      set({
        services: servicesRes.services,
        categories: categoriesRes.categories,
        registryLoaded: true,
      });
    } catch {
      // Silently fail — registry can be retried
    }
  },

  loadConnections: async () => {
    try {
      const { connections: serverConnections } = await apiClient.getMcpConnections();
      const connMap = new Map<string, ConnectionEntry>(get().connections);

      // Track which IDs came from the server so we can reconcile
      const serverIds = new Set<string>();

      for (const conn of serverConnections) {
        serverIds.add(conn.serviceId);
        const existing = connMap.get(conn.serviceId);
        connMap.set(conn.serviceId, {
          serviceId: conn.serviceId,
          state: mapServerStatus(conn.status),
          connectedAt: conn.connectedAt,
          tools: existing?.tools,
          lastHealthCheck: new Date().toISOString(),
        });
      }

      // Preserve browser-agent connections (those without lastHealthCheck)
      // that aren't in the server response — they exist only in local state
      // No action needed: they're already in connMap from the clone above

      set({ connections: connMap, connectionsLoaded: true });
    } catch {
      // Silently fail — user may not be authenticated
      set({ connectionsLoaded: true });
    }
  },

  setConnectionState: (serviceId, state, extra) => {
    set(prev => {
      const next = new Map(prev.connections);
      const existing = next.get(serviceId);
      next.set(serviceId, {
        serviceId,
        ...existing,
        state,
        ...extra,
      });
      return { connections: next };
    });
  },

  removeConnection: (serviceId) => {
    set(prev => {
      const next = new Map(prev.connections);
      next.delete(serviceId);
      return { connections: next };
    });
  },

  setToolsForService: (serviceId, tools) => {
    set(prev => {
      const next = new Map(prev.connections);
      const existing = next.get(serviceId);
      if (existing) {
        next.set(serviceId, { ...existing, tools });
      }
      return { connections: next };
    });
  },

  getConnectionState: (serviceId) => {
    return get().connections.get(serviceId)?.state || 'disconnected';
  },

  getConnectionsMap: () => {
    const map = new Map<string, ConnectFlowState>();
    for (const [id, entry] of get().connections) {
      map.set(id, entry.state);
    }
    return map;
  },

  startHealthChecks: () => {
    const existing = get().healthCheckInterval;
    if (existing) return;

    // Check every 5 minutes
    const interval = setInterval(() => {
      get().runHealthCheck();
    }, 5 * 60 * 1000);

    set({ healthCheckInterval: interval });
  },

  stopHealthChecks: () => {
    const interval = get().healthCheckInterval;
    if (interval) {
      clearInterval(interval);
      set({ healthCheckInterval: null });
    }
  },

  runHealthCheck: async () => {
    try {
      const { results } = await apiClient.checkConnectionHealth();
      const now = new Date().toISOString();
      const serverServiceIds = new Set(results.map(r => r.serviceId));

      set(prev => {
        const next = new Map(prev.connections);

        for (const result of results) {
          const existing = next.get(result.serviceId);
          if (existing?.state === 'connecting') continue; // Don't interrupt active flows

          const healthState: ConnectFlowState = result.tokenValid
            ? 'connected'
            : result.status === 'needs_reauth' ? 'needs_reauth' : 'error';

          if (existing) {
            next.set(result.serviceId, {
              ...existing,
              state: healthState,
              lastHealthCheck: now,
            });
          } else {
            next.set(result.serviceId, {
              serviceId: result.serviceId,
              state: healthState,
              lastHealthCheck: now,
            });
          }
        }

        // Reconcile: mark connections as disconnected if they were previously
        // seen via health check (have lastHealthCheck) but are no longer on the
        // server. Connections without lastHealthCheck (e.g. browser-agent) are
        // not affected since they never appear in MCP health results.
        for (const [id, entry] of next) {
          if (
            entry.lastHealthCheck &&
            entry.state !== 'connecting' &&
            !serverServiceIds.has(id)
          ) {
            next.set(id, { ...entry, state: 'disconnected', lastHealthCheck: now });
          }
        }

        return { connections: next };
      });
    } catch {
      // Health check failed — keep existing state
    }
  },

  reset: () => {
    const interval = get().healthCheckInterval;
    if (interval) clearInterval(interval);
    set({
      connections: new Map(),
      connectionsLoaded: false,
      healthCheckInterval: null,
    });
  },
}));

function mapServerStatus(status: string): ConnectFlowState {
  switch (status) {
    case 'connected': return 'connected';
    case 'needs_reauth': return 'needs_reauth';
    case 'error': return 'error';
    case 'refreshing': return 'connecting';
    case 'discovering': return 'connecting';
    case 'registering': return 'connecting';
    case 'authorizing': return 'connecting';
    default: return 'disconnected';
  }
}
