import { AgentIconSDF } from './AgentIconSDF';
import type { AgentInfo } from '@/hooks/useAgentTracker';

/** Simple colored dot for filter chips and small contexts where full SDF is overkill */
export function AgentDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, backgroundColor: color, boxShadow: `0 0 6px ${color}40` }}
    />
  );
}

/**
 * Agent identity badge — SDF metaball icon + role name + event type pill.
 * No lucide-react icons. No emojis. No flat SVGs.
 * The icon is a mathematically-rendered glowing metaball cluster.
 */

// Event type → display label + style
const EVENT_PILLS: Record<string, { label: string; bg: string; text: string }> = {
  agent_thinking:   { label: 'thinking',  bg: 'rgba(139,92,246,0.15)', text: '#a78bfa' },
  agent_text:       { label: 'response',  bg: 'rgba(255,255,255,0.08)', text: '#8a8a8a' },
  agent_tool_call:  { label: 'action',    bg: 'rgba(6,182,212,0.15)',  text: '#22d3ee' },
  agent_file_write: { label: 'code',      bg: 'rgba(200,255,100,0.15)', text: '#c8ff64' },
  agent_discovery:  { label: 'discovery', bg: 'rgba(245,158,11,0.15)', text: '#fbbf24' },
  agent_error:      { label: 'error',     bg: 'rgba(239,68,68,0.15)',  text: '#f87171' },
  agent_spawned:    { label: 'started',   bg: 'rgba(200,255,100,0.15)', text: '#c8ff64' },
  agent_stopped:    { label: 'done',      bg: 'rgba(255,255,255,0.06)', text: '#4a4a4a' },
  build_progress:   { label: 'progress',  bg: 'rgba(200,255,100,0.15)', text: '#c8ff64' },
  build_complete:   { label: 'complete',  bg: 'rgba(34,197,94,0.15)',  text: '#4ade80' },
};

export function AgentBadge({
  agent,
  eventType,
  size = 'default',
}: {
  agent: AgentInfo;
  eventType?: string;
  size?: 'default' | 'small';
}) {
  const pill = eventType ? EVENT_PILLS[eventType] : null;
  const isSmall = size === 'small';

  return (
    <div className="flex items-center gap-2">
      <AgentIconSDF
        color={agent.color}
        eventType={eventType}
        size={isSmall ? 20 : 28}
      />
      <span
        className={`font-display font-semibold tracking-tight ${isSmall ? 'text-xs' : 'text-sm'}`}
        style={{ color: agent.color }}
      >
        {agent.role}
      </span>
      {pill && (
        <span
          className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase tracking-wider"
          style={{ backgroundColor: pill.bg, color: pill.text }}
        >
          {pill.label}
        </span>
      )}
    </div>
  );
}
