import { useState, useEffect, useRef, useCallback } from 'react';

export interface EngineEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Subscribes to the engine's SSE event stream for a project.
 * Returns the list of events and connection status.
 *
 * This is the ONLY way the UI reads engine output.
 * No phases, no waves, no swarms — just a stream of events.
 */
export function useEngineEvents(projectId: string | null) {
  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!projectId) return;

    // Clear state from any previous project (defense in depth)
    setEvents([]);
    setIsComplete(false);

    const es = new EventSource(`/api/events/stream?projectId=${projectId}`, {
      withCredentials: true,
    });
    eventSourceRef.current = es;

    es.onopen = () => setIsConnected(true);

    es.onmessage = (e) => {
      try {
        const event: EngineEvent = JSON.parse(e.data);
        setEvents(prev => [...prev, event]);
        if (event.type === 'build_complete') {
          setIsComplete(true);
          es.close();
        }
      } catch {
        // Skip non-JSON messages (heartbeats, etc.)
      }
    };

    // Also listen for named event types
    const eventTypes = [
      'agent_thinking', 'agent_text', 'agent_tool_call', 'agent_tool_result',
      'agent_file_write', 'agent_discovery', 'agent_error',
      'agent_spawned', 'agent_stopped', 'agent_compacted',
      'brain_node_created', 'brain_node_updated',
      'user_input_requested', 'build_progress', 'build_complete',
    ];
    for (const type of eventTypes) {
      es.addEventListener(type, (e: MessageEvent) => {
        try {
          const event: EngineEvent = JSON.parse(e.data);
          setEvents(prev => [...prev, event]);
          if (type === 'build_complete') {
            setIsComplete(true);
            es.close();
          }
        } catch { /* skip */ }
      });
    }

    es.onerror = () => {
      setIsConnected(false);
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      setIsConnected(false);
    };
  }, [projectId]);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    setIsConnected(false);
  }, []);

  return { events, isConnected, isComplete, disconnect };
}
