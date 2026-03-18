import { useMemo } from 'react';
import type { EngineEvent } from './useEngineEvents';

// ── Agent identity ──────────────────────────────────────────────────

export interface AgentInfo {
  sessionId: string;
  role: string;
  model: string;
  color: string;
  iconShape: string;
  status: 'active' | 'completed';
  spawnedAt: string;
}

// Colors assigned in spawn order — Lead always gets lime (first)
const AGENT_COLORS = ['#c8ff64', '#06b6d4', '#8b5cf6', '#f59e0b', '#ff6b6b', '#f43f5e', '#14b8a6'];
const AGENT_SHAPES = ['diamond', 'circle', 'hexagon', 'square', 'triangle', 'pentagon', 'octagon'];

// ── Event grouping ──────────────────────────────────────────────────

export interface EventGroup {
  id: string;
  agentSessionId: string;
  events: EngineEvent[];
  isStandalone: boolean;
  startedAt: string;
}

// Event types that always get their own standalone box
const STANDALONE_TYPES = new Set([
  'agent_spawned', 'agent_stopped', 'user_input_requested',
  'build_complete', 'connected', 'replay_complete',
]);

/**
 * Tracks agent identities and groups events into response box groups.
 *
 * Agent identities are DYNAMIC — assigned from spawn events, never hardcoded.
 * Event grouping: `agent_thinking` starts a new group for that agent.
 * All subsequent events from the same sessionId accumulate into that group
 * until the next `agent_thinking`.
 */
export function useAgentTracker(events: EngineEvent[]) {
  return useMemo(() => {
    const agents = new Map<string, AgentInfo>();
    const groups: EventGroup[] = [];
    // Track current open group per agent
    const openGroups = new Map<string, EventGroup>();
    let spawnIndex = 0;
    let groupCounter = 0;

    for (const event of events) {
      const sessionId = (event.data.sessionId as string) || 'system';

      // ── Build agent identity from spawn events ──
      if (event.type === 'agent_spawned' && !agents.has(sessionId)) {
        agents.set(sessionId, {
          sessionId,
          role: String(event.data.role || 'agent'),
          model: String(event.data.model || 'unknown'),
          color: AGENT_COLORS[spawnIndex % AGENT_COLORS.length],
          iconShape: AGENT_SHAPES[spawnIndex % AGENT_SHAPES.length],
          status: 'active',
          spawnedAt: event.timestamp,
        });
        spawnIndex++;
      }

      // Mark agent as completed on stop
      if (event.type === 'agent_stopped') {
        const agent = agents.get(sessionId);
        if (agent) agent.status = 'completed';
      }

      // ── Group events into response boxes ──

      // Standalone events always get their own box
      if (STANDALONE_TYPES.has(event.type)) {
        groups.push({
          id: `group-${++groupCounter}`,
          agentSessionId: sessionId,
          events: [event],
          isStandalone: true,
          startedAt: event.timestamp,
        });
        continue;
      }

      // agent_thinking starts a new group for this agent
      if (event.type === 'agent_thinking') {
        const newGroup: EventGroup = {
          id: `group-${++groupCounter}`,
          agentSessionId: sessionId,
          events: [event],
          isStandalone: false,
          startedAt: event.timestamp,
        };
        openGroups.set(sessionId, newGroup);
        groups.push(newGroup);
        continue;
      }

      // All other events accumulate into the current open group for this agent
      const currentGroup = openGroups.get(sessionId);
      if (currentGroup) {
        currentGroup.events.push(event);
      } else {
        // No open group yet (events before first thinking) — create one
        const newGroup: EventGroup = {
          id: `group-${++groupCounter}`,
          agentSessionId: sessionId,
          events: [event],
          isStandalone: false,
          startedAt: event.timestamp,
        };
        openGroups.set(sessionId, newGroup);
        groups.push(newGroup);
      }
    }

    // Build per-agent group lists for swim lanes
    const agentGroups = new Map<string, EventGroup[]>();
    for (const group of groups) {
      const agentId = group.agentSessionId;
      if (!agentGroups.has(agentId)) agentGroups.set(agentId, []);
      agentGroups.get(agentId)!.push(group);
    }

    // Helper to look up agent info (returns a default for unknown sessionIds)
    function getAgent(sessionId: string): AgentInfo {
      return agents.get(sessionId) || {
        sessionId,
        role: 'system',
        model: '',
        color: '#8a8a8a',
        iconShape: 'circle',
        status: 'active' as const,
        spawnedAt: '',
      };
    }

    return { agents, groups, agentGroups, getAgent };
  }, [events]);
}
