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
  const seenIds = useRef<Set<string>>(new Set());

  const connect = useCallback(() => {
    if (!projectId) return;

    setEvents([]);
    setIsComplete(false);
    seenIds.current.clear();

    const es = new EventSource(`/api/events/stream?projectId=${projectId}`, {
      withCredentials: true,
    });
    eventSourceRef.current = es;

    es.onopen = () => setIsConnected(true);

    // Single handler for incoming events — deduplicates by event ID
    const handleEvent = (e: MessageEvent) => {
      try {
        const event: EngineEvent = JSON.parse(e.data);

        // Deduplicate by event ID (SSE provides id field)
        const eventKey = e.lastEventId || `${event.type}-${event.timestamp}-${JSON.stringify(event.data).slice(0, 50)}`;
        if (seenIds.current.has(eventKey)) return;
        seenIds.current.add(eventKey);

        setEvents(prev => [...prev, event]);

        if (event.type === 'build_complete') {
          setIsComplete(true);
          es.close();
        }
      } catch {
        // Skip non-JSON messages (heartbeats, replay_complete, etc.)
      }
    };

    // Listen for named event types ONLY (no onmessage — avoids duplicate handling)
    const eventTypes = [
      'agent_thinking', 'agent_text', 'agent_tool_call', 'agent_tool_result',
      'agent_file_write', 'agent_discovery', 'agent_error',
      'agent_spawned', 'agent_stopped', 'agent_compacted',
      'brain_node_created', 'brain_node_updated', 'brain_edge_created',
      'brain_conflict_detected', 'user_input_requested',
      'build_progress', 'build_complete', 'build_error',
      'replay_complete',
    ];
    for (const type of eventTypes) {
      es.addEventListener(type, handleEvent);
    }

    // Also catch any unlisted event types via onmessage as fallback
    // but only if the event wasn't already handled by a named listener
    es.onmessage = (e: MessageEvent) => {
      try {
        const event: EngineEvent = JSON.parse(e.data);
        // Only process if this event type isn't in our named list
        if (!eventTypes.includes(event.type)) {
          handleEvent(e);
        }
      } catch { /* skip */ }
    };

    es.onerror = () => {
      setIsConnected(false);
      // EventSource auto-reconnects on error
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
