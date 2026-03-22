/**
 * Endpoint Events Hook
 *
 * React hook for real-time SSE (Server-Sent Events) endpoint events.
 * Receives deployment progress, status changes, health alerts, and usage updates.
 *
 * Part of KripTik AI's Auto-Deploy Private Endpoints feature.
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useUserStore } from '../store/useUserStore';
import { API_URL } from '@/lib/api-config';

// =============================================================================
// TYPES
// =============================================================================

export type EndpointEventType =
  | 'DEPLOYMENT_STARTED'
  | 'DEPLOYMENT_PROGRESS'
  | 'DEPLOYMENT_COMPLETE'
  | 'DEPLOYMENT_FAILED'
  | 'ENDPOINT_STATUS_CHANGED'
  | 'ENDPOINT_HEALTH_ALERT'
  | 'ENDPOINT_USAGE_UPDATE'
  | 'CREDITS_LOW_WARNING'
  | 'ENDPOINT_RECOVERY_STARTED'
  | 'ENDPOINT_RECOVERY_COMPLETE'
  | 'ENDPOINT_RECOVERY_FAILED';

export interface EndpointHealth {
  endpointId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastCheck: string;
  consecutiveFailures: number;
  metrics: {
    latencyP50Ms: number;
    latencyP99Ms: number;
    successRate: number;
    activeWorkers: number;
    queuedRequests: number;
    errorRate: number;
  };
  issues: string[];
  recoveryAttempts: number;
  lastRecoveryAt?: string;
}

export interface UsageStats {
  period: 'day' | 'week' | 'month';
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalCreditsUsed: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  totalComputeSeconds: number;
  requestsByDay: Array<{ date: string; count: number; credits: number }>;
}

export interface DeploymentStartedEvent {
  type: 'DEPLOYMENT_STARTED';
  endpointId: string;
  modelName: string;
  provider: 'runpod' | 'modal';
  timestamp: string;
}

export interface DeploymentProgressEvent {
  type: 'DEPLOYMENT_PROGRESS';
  endpointId: string;
  stage: string;
  progress: number;
  message?: string;
  timestamp: string;
}

export interface DeploymentCompleteEvent {
  type: 'DEPLOYMENT_COMPLETE';
  endpointId: string;
  endpointUrl: string;
  apiKey: string;
  provider: 'runpod' | 'modal';
  gpuType: string;
  timestamp: string;
}

export interface DeploymentFailedEvent {
  type: 'DEPLOYMENT_FAILED';
  endpointId: string;
  error: string;
  canRetry: boolean;
  timestamp: string;
}

export interface EndpointStatusChangedEvent {
  type: 'ENDPOINT_STATUS_CHANGED';
  endpointId: string;
  status: string;
  previousStatus: string;
  modelName: string;
  timestamp: string;
}

export interface EndpointHealthAlertEvent {
  type: 'ENDPOINT_HEALTH_ALERT';
  endpointId: string;
  health: EndpointHealth;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: string;
}

export interface EndpointUsageUpdateEvent {
  type: 'ENDPOINT_USAGE_UPDATE';
  endpointId: string;
  usage: UsageStats;
  timestamp: string;
}

export interface CreditsLowWarningEvent {
  type: 'CREDITS_LOW_WARNING';
  currentBalance: number;
  threshold: number;
  message: string;
  timestamp: string;
}

export interface EndpointRecoveryEvent {
  type: 'ENDPOINT_RECOVERY_STARTED' | 'ENDPOINT_RECOVERY_COMPLETE' | 'ENDPOINT_RECOVERY_FAILED';
  endpointId: string;
  action: string;
  success?: boolean;
  error?: string;
  timestamp: string;
}

export type EndpointEvent =
  | DeploymentStartedEvent
  | DeploymentProgressEvent
  | DeploymentCompleteEvent
  | DeploymentFailedEvent
  | EndpointStatusChangedEvent
  | EndpointHealthAlertEvent
  | EndpointUsageUpdateEvent
  | CreditsLowWarningEvent
  | EndpointRecoveryEvent;

interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnectAttempts: number;
}

// =============================================================================
// HOOK: useEndpointEvents
// =============================================================================

/**
 * Hook for subscribing to endpoint events via SSE (Server-Sent Events).
 *
 * EventSource handles automatic reconnection natively, so manual
 * reconnect logic is not needed.
 */
export function useEndpointEvents(
  onEvent: (event: EndpointEvent) => void,
  options?: {
    endpointId?: string;
    autoConnect?: boolean;
  }
): {
  connectionState: ConnectionState;
  connect: () => void;
  disconnect: () => void;
} {
  const { user } = useUserStore();
  const esRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    reconnectAttempts: 0,
  });

  // Keep callback ref updated
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  /**
   * Connect to SSE stream
   */
  const connect = useCallback(() => {
    if (!user?.id) {
      setConnectionState((prev) => ({
        ...prev,
        error: 'User not authenticated',
      }));
      return;
    }

    // Already connected or connecting
    if (esRef.current && esRef.current.readyState !== EventSource.CLOSED) {
      return;
    }

    setConnectionState((prev) => ({
      ...prev,
      isConnecting: true,
      error: null,
    }));

    // Build SSE URL using centralized API_URL (same-origin in production)
    const sseUrl = `${API_URL}/api/events/stream?channel=endpoints`;

    const es = new EventSource(sseUrl, { withCredentials: true });
    esRef.current = es;

    es.onopen = () => {
      console.log('[useEndpointEvents] SSE connected');
      setConnectionState({
        isConnected: true,
        isConnecting: false,
        error: null,
        reconnectAttempts: 0,
      });
    };

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as {
          type: string;
          data?: Record<string, unknown>;
          timestamp?: string;
        };

        // Map SSE message to EndpointEvent shape
        const innerData = (parsed.data || {}) as Record<string, unknown>;
        const endpointEvent: EndpointEvent = {
          ...innerData,
          type: parsed.type,
          payload: parsed.data || parsed,
          timestamp: parsed.timestamp,
        } as unknown as EndpointEvent;

        // Filter by endpoint ID if specified
        if (options?.endpointId && 'endpointId' in endpointEvent) {
          if ((endpointEvent as { endpointId: string }).endpointId !== options.endpointId) {
            return;
          }
        }

        onEventRef.current(endpointEvent);
      } catch (error) {
        console.error('[useEndpointEvents] Failed to parse SSE message:', error);
      }
    };

    es.onerror = () => {
      // CRITICAL: Force-close to prevent infinite reconnect loop on iOS Safari.
      // Without this, EventSource auto-reconnects infinitely on 401 responses.
      es.close();
      esRef.current = null;
      console.log('[useEndpointEvents] SSE connection closed (force-closed to prevent reconnect loop)');
      setConnectionState((prev) => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        error: 'SSE connection closed',
      }));
    };
  }, [user?.id, options?.endpointId, options?.autoConnect]);

  /**
   * Disconnect from SSE stream
   */
  const disconnect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    setConnectionState({
      isConnected: false,
      isConnecting: false,
      error: null,
      reconnectAttempts: 0,
    });
  }, []);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (options?.autoConnect ?? true) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [user?.id]); // Only reconnect when user changes

  return {
    connectionState,
    connect,
    disconnect,
  };
}

// =============================================================================
// HOOK: useDeploymentProgress
// =============================================================================

/**
 * Specialized hook for tracking deployment progress
 */
export function useDeploymentProgress(endpointId: string): {
  progress: number;
  stage: string;
  status: 'pending' | 'deploying' | 'complete' | 'failed';
  error: string | null;
  result: DeploymentCompleteEvent | null;
} {
  const [state, setState] = useState<{
    progress: number;
    stage: string;
    status: 'pending' | 'deploying' | 'complete' | 'failed';
    error: string | null;
    result: DeploymentCompleteEvent | null;
  }>({
    progress: 0,
    stage: 'Initializing',
    status: 'pending',
    error: null,
    result: null,
  });

  const handleEvent = useCallback((event: EndpointEvent) => {
    if (!('endpointId' in event) || event.endpointId !== endpointId) {
      return;
    }

    switch (event.type) {
      case 'DEPLOYMENT_STARTED':
        setState((prev) => ({
          ...prev,
          status: 'deploying',
          progress: 5,
          stage: 'Starting deployment',
        }));
        break;

      case 'DEPLOYMENT_PROGRESS':
        setState((prev) => ({
          ...prev,
          progress: event.progress,
          stage: event.stage,
          status: 'deploying',
        }));
        break;

      case 'DEPLOYMENT_COMPLETE':
        setState({
          progress: 100,
          stage: 'Complete',
          status: 'complete',
          error: null,
          result: event,
        });
        break;

      case 'DEPLOYMENT_FAILED':
        setState((prev) => ({
          ...prev,
          status: 'failed',
          error: event.error,
        }));
        break;
    }
  }, [endpointId]);

  useEndpointEvents(handleEvent, { endpointId });

  return state;
}

// =============================================================================
// HOOK: useEndpointHealth
// =============================================================================

/**
 * Hook for monitoring endpoint health in real-time
 */
export function useEndpointHealth(endpointId: string): {
  health: EndpointHealth | null;
  alerts: EndpointHealthAlertEvent[];
} {
  const [health, setHealth] = useState<EndpointHealth | null>(null);
  const [alerts, setAlerts] = useState<EndpointHealthAlertEvent[]>([]);

  const handleEvent = useCallback((event: EndpointEvent) => {
    if (event.type === 'ENDPOINT_HEALTH_ALERT' && event.endpointId === endpointId) {
      setHealth(event.health);
      setAlerts((prev) => [...prev.slice(-9), event]); // Keep last 10
    }
  }, [endpointId]);

  useEndpointEvents(handleEvent, { endpointId });

  return { health, alerts };
}

export default useEndpointEvents;
