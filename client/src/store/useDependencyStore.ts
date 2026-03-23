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
  McpConnection,
  McpToolDefinition,
  EnrichedMcpConnection,
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
      const connMap = new Map<string, ConnectionEntry>();

      for (const conn of serverConnections) {
        const existing = get().connections.get(conn.serviceId);
        connMap.set(conn.serviceId, {
          serviceId: conn.serviceId,
          state: mapServerStatus(conn.status),
          connectedAt: conn.connectedAt,
          tools: existing?.tools,
          lastHealthCheck: new Date().toISOString(),
        });
      }

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
      const { connections: serverConnections } = await apiClient.getMcpConnections();
      const now = new Date().toISOString();

      set(prev => {
        const next = new Map(prev.connections);

        // Update states from server
        for (const conn of serverConnections) {
          const existing = next.get(conn.serviceId);
          const serverState = mapServerStatus(conn.status);

          if (existing) {
            // Only update if server says something changed
            if (existing.state === 'connecting') continue; // Don't interrupt active flows
            next.set(conn.serviceId, {
              ...existing,
              state: serverState,
              lastHealthCheck: now,
            });
          } else {
            next.set(conn.serviceId, {
              serviceId: conn.serviceId,
              state: serverState,
              connectedAt: conn.connectedAt,
              lastHealthCheck: now,
            });
          }
        }

        // Mark connections that no longer exist on server
        for (const [id, entry] of next) {
          if (entry.state === 'connecting') continue;
          const stillExists = serverConnections.some((c: McpConnection) => c.serviceId === id);
          if (!stillExists && entry.state === 'connected') {
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
