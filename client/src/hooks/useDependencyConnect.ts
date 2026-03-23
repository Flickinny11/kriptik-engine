/**
 * useDependencyConnect — manages the MCP OAuth connect flow for dependencies.
 *
 * Handles:
 * - Starting the MCP OAuth popup flow for MCP-enabled services
 * - Tracking connection state (disconnected → connecting → connected)
 * - Listening for postMessage callbacks from the OAuth popup
 * - Post-connection instance creation
 * - Disconnect flow
 * - Browser agent fallback triggering for non-MCP services
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import type {
  ServiceRegistryEntry,
  McpConnection,
  McpToolDefinition,
  InstanceModel,
} from '@/lib/api-client';

export type ConnectFlowState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'needs_reauth'
  | 'needs_upgrade';

export interface ConnectionInfo {
  serviceId: string;
  state: ConnectFlowState;
  error?: string;
  connectedAt?: string;
  tools?: McpToolDefinition[];
}

interface UseDependencyConnectReturn {
  /** Current flow state for a given service */
  getConnectionState: (serviceId: string) => ConnectFlowState;
  /** Start the MCP OAuth popup flow for a service */
  startMcpConnect: (service: ServiceRegistryEntry) => Promise<void>;
  /** Disconnect from a service */
  disconnect: (serviceId: string) => Promise<void>;
  /** Create a project instance after connection */
  createInstance: (serviceId: string, projectId: string) => Promise<{ instanceModel: InstanceModel } | null>;
  /** All current connections */
  connections: Map<string, ConnectionInfo>;
  /** Loading state */
  isLoading: boolean;
  /** Refresh connections from server */
  refreshConnections: () => Promise<void>;
}

export function useDependencyConnect(): UseDependencyConnectReturn {
  const [connections, setConnections] = useState<Map<string, ConnectionInfo>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pendingServiceRef = useRef<string | null>(null);

  // Listen for OAuth popup completion messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Handle MCP OAuth completion
      if (event.data?.type === 'mcp_oauth_complete') {
        const { success, serviceId, error } = event.data;
        if (success && serviceId) {
          setConnections(prev => {
            const next = new Map(prev);
            next.set(serviceId, {
              serviceId,
              state: 'connected',
              connectedAt: new Date().toISOString(),
            });
            return next;
          });
          // Fetch tools for the newly connected service
          fetchToolsForService(serviceId);
        } else {
          const failedService = serviceId || pendingServiceRef.current;
          if (failedService) {
            setConnections(prev => {
              const next = new Map(prev);
              next.set(failedService, {
                serviceId: failedService,
                state: 'error',
                error: error || 'Connection failed',
              });
              return next;
            });
          }
        }
        pendingServiceRef.current = null;
      }

      // Also handle legacy oauth_complete for backward compat with QuestionTile
      if (event.data?.type === 'oauth_complete' && event.data.success) {
        const serviceId = event.data.provider;
        if (serviceId) {
          setConnections(prev => {
            const next = new Map(prev);
            next.set(serviceId, {
              serviceId,
              state: 'connected',
              connectedAt: new Date().toISOString(),
            });
            return next;
          });
        }
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const fetchToolsForService = useCallback(async (serviceId: string) => {
    try {
      const { tools } = await apiClient.getMcpTools(serviceId);
      setConnections(prev => {
        const next = new Map(prev);
        const existing = next.get(serviceId);
        if (existing) {
          next.set(serviceId, { ...existing, tools });
        }
        return next;
      });
    } catch {
      // Tools fetch is non-critical
    }
  }, []);

  const refreshConnections = useCallback(async () => {
    setIsLoading(true);
    try {
      const { connections: serverConnections } = await apiClient.getMcpConnections();
      const connMap = new Map<string, ConnectionInfo>();
      for (const conn of serverConnections) {
        connMap.set(conn.serviceId, {
          serviceId: conn.serviceId,
          state: conn.status === 'connected' ? 'connected'
            : conn.status === 'needs_reauth' ? 'needs_reauth'
            : conn.status === 'error' ? 'error'
            : 'disconnected',
          connectedAt: conn.connectedAt,
        });
      }
      setConnections(connMap);
    } catch {
      // Silently fail — user may not be authenticated
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load connections on mount
  useEffect(() => {
    refreshConnections();
  }, [refreshConnections]);

  const getConnectionState = useCallback((serviceId: string): ConnectFlowState => {
    return connections.get(serviceId)?.state || 'disconnected';
  }, [connections]);

  const startMcpConnect = useCallback(async (service: ServiceRegistryEntry) => {
    if (!service.mcp) {
      throw new Error(`${service.name} does not have an MCP server. Use browser fallback.`);
    }

    // Set connecting state
    setConnections(prev => {
      const next = new Map(prev);
      next.set(service.id, {
        serviceId: service.id,
        state: 'connecting',
      });
      return next;
    });
    pendingServiceRef.current = service.id;

    try {
      const { authorizationUrl } = await apiClient.startMcpAuth(service.id, service.mcp.url);

      // Open OAuth popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      popupRef.current = window.open(
        authorizationUrl,
        `mcp_oauth_${service.id}`,
        `width=${width},height=${height},left=${left},top=${top}`,
      );

      // Monitor popup close without completion
      if (popupRef.current) {
        const checkClosed = setInterval(() => {
          if (popupRef.current?.closed) {
            clearInterval(checkClosed);
            // If still connecting after popup closed, mark as disconnected
            setConnections(prev => {
              const next = new Map(prev);
              const current = next.get(service.id);
              if (current?.state === 'connecting') {
                next.set(service.id, {
                  serviceId: service.id,
                  state: 'disconnected',
                });
              }
              return next;
            });
            popupRef.current = null;
          }
        }, 500);
      }
    } catch (err) {
      setConnections(prev => {
        const next = new Map(prev);
        next.set(service.id, {
          serviceId: service.id,
          state: 'error',
          error: err instanceof Error ? err.message : 'Failed to start connection',
        });
        return next;
      });
      pendingServiceRef.current = null;
    }
  }, []);

  const disconnect = useCallback(async (serviceId: string) => {
    try {
      await apiClient.disconnectMcpService(serviceId);
      setConnections(prev => {
        const next = new Map(prev);
        next.delete(serviceId);
        return next;
      });
    } catch (err) {
      console.error(`Failed to disconnect ${serviceId}:`, err);
    }
  }, []);

  const createInstance = useCallback(async (serviceId: string, projectId: string) => {
    try {
      const { instance } = await apiClient.createServiceInstance(serviceId, projectId);
      return { instanceModel: instance.instanceModel };
    } catch {
      return null;
    }
  }, []);

  return {
    getConnectionState,
    startMcpConnect,
    disconnect,
    createInstance,
    connections,
    isLoading,
    refreshConnections,
  };
}
