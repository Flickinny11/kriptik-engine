import { useState, useEffect, useRef } from 'react';
import type { AgentInfo, EventGroup } from '@/hooks/useAgentTracker';
import type { OAuthCatalogEntry } from '@/lib/api-client';
import { AgentResponseBox } from './AgentResponseBox';
import { AgentDot } from './AgentBadge';
import { CorrectionPrompt } from './CorrectionPrompt';

/**
 * Unified Feed — single chronological stream of agent activity.
 *
 * Each reasoning cycle from each agent appears as a color-coded response box.
 * Filter chips at the top let the user isolate a single agent's events.
 * No hardcoded agent roles — filter chips are built dynamically from spawned agents.
 */
export function UnifiedFeedView({
  groups,
  agents,
  getAgent,
  projectId,
  oauthCatalog,
  onAnswer,
}: {
  groups: EventGroup[];
  agents: Map<string, AgentInfo>;
  getAgent: (sessionId: string) => AgentInfo;
  projectId: string;
  oauthCatalog: OAuthCatalogEntry[];
  onAnswer: (nodeId: string, answer: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filterAgent, setFilterAgent] = useState<string | null>(null); // null = all agents
  const [correcting, setCorrecting] = useState<{ group: EventGroup; agent: AgentInfo } | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom as new groups arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [groups, autoScroll]);

  // Detect user scrolling up to pause auto-scroll
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 80;
    setAutoScroll(isAtBottom);
  };

  // Filter groups by selected agent
  const filteredGroups = filterAgent
    ? groups.filter(g => g.agentSessionId === filterAgent)
    : groups;

  // Build agent list for filter chips (sorted by spawn order)
  const agentList = Array.from(agents.values());

  return (
    <div className="h-full flex flex-col">
      {/* Filter chips */}
      {agentList.length > 1 && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 overflow-x-auto shrink-0">
          <button
            onClick={() => setFilterAgent(null)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
              filterAgent === null
                ? 'bg-white/10 text-kriptik-white border border-white/20'
                : 'text-kriptik-silver hover:text-kriptik-white hover:bg-white/5'
            }`}
          >
            All Agents
          </button>
          {agentList.map((agent) => (
            <button
              key={agent.sessionId}
              onClick={() => setFilterAgent(filterAgent === agent.sessionId ? null : agent.sessionId)}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                filterAgent === agent.sessionId
                  ? 'border'
                  : 'hover:bg-white/5'
              }`}
              style={{
                color: agent.color,
                borderColor: filterAgent === agent.sessionId ? agent.color + '40' : 'transparent',
                backgroundColor: filterAgent === agent.sessionId ? agent.color + '15' : undefined,
              }}
            >
              <AgentDot color={agent.color} size={8} />
              {agent.role}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable event stream */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {filteredGroups.length === 0 && (
          <div className="text-kriptik-slate text-sm text-center py-8">
            {filterAgent ? 'No events from this agent yet' : 'Waiting for events...'}
          </div>
        )}

        {filteredGroups.map((group) => (
          <div key={group.id}>
            <AgentResponseBox
              group={group}
              agent={getAgent(group.agentSessionId)}
              projectId={projectId}
              oauthCatalog={oauthCatalog}
              onCorrect={(g, a) => setCorrecting({ group: g, agent: a })}
              onAnswer={onAnswer}
            />
            {/* Show correction prompt inline after the box being corrected */}
            {correcting && correcting.group.id === group.id && (
              <div className="mt-2">
                <CorrectionPrompt
                  group={correcting.group}
                  agent={correcting.agent}
                  projectId={projectId}
                  onClose={() => setCorrecting(null)}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Jump to latest button when user has scrolled up */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
          }}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-kriptik-charcoal border border-white/10 rounded-full text-xs text-kriptik-silver hover:text-kriptik-white shadow-lg transition-all"
        >
          Jump to latest
        </button>
      )}
    </div>
  );
}
