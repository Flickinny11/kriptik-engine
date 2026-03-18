import { useState, useEffect, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import type { AgentInfo, EventGroup } from '@/hooks/useAgentTracker';
import type { OAuthCatalogEntry } from '@/lib/api-client';
import { AgentResponseBox } from './AgentResponseBox';
import { AgentBadge, AgentDot } from './AgentBadge';
import { CorrectionPrompt } from './CorrectionPrompt';

/**
 * Swim Lane View — vertical columns per agent, time flowing downward.
 *
 * Up to 4 agents visible at once. Each lane shows that agent's response boxes.
 * Agent selector bar at top for choosing which agents are visible.
 * Lane widths are resizable via drag handles.
 * No hardcoded agent roles — lanes are created dynamically from spawn events.
 */
export function SwimLaneView({
  agentGroups,
  agents,
  getAgent,
  projectId,
  oauthCatalog,
  onAnswer,
}: {
  agentGroups: Map<string, EventGroup[]>;
  agents: Map<string, AgentInfo>;
  getAgent: (sessionId: string) => AgentInfo;
  projectId: string;
  oauthCatalog: OAuthCatalogEntry[];
  onAnswer: (nodeId: string, answer: string) => void;
}) {
  const [visibleAgents, setVisibleAgents] = useState<string[]>([]);
  const [correcting, setCorrecting] = useState<{ group: EventGroup; agent: AgentInfo } | null>(null);

  // Auto-select agents: show up to 4, add new ones as they spawn
  const agentList = Array.from(agents.values());
  useEffect(() => {
    const activeIds = agentList.map(a => a.sessionId);
    setVisibleAgents(prev => {
      // Keep existing visible agents that are still active
      const kept = prev.filter(id => activeIds.includes(id));
      // Add new agents if we have room
      for (const id of activeIds) {
        if (kept.length >= 4) break;
        if (!kept.includes(id)) kept.push(id);
      }
      return kept;
    });
  }, [agentList.length]);

  const toggleAgent = (sessionId: string) => {
    setVisibleAgents(prev => {
      if (prev.includes(sessionId)) {
        return prev.filter(id => id !== sessionId);
      }
      if (prev.length >= 4) return prev; // max 4
      return [...prev, sessionId];
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Agent selector bar */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 overflow-x-auto shrink-0">
        {agentList.map((agent) => {
          const isVisible = visibleAgents.includes(agent.sessionId);
          return (
            <button
              key={agent.sessionId}
              onClick={() => toggleAgent(agent.sessionId)}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                isVisible ? 'border' : 'opacity-50 hover:opacity-80'
              }`}
              style={{
                color: agent.color,
                borderColor: isVisible ? agent.color + '40' : 'transparent',
                backgroundColor: isVisible ? agent.color + '15' : undefined,
              }}
              title={isVisible ? 'Hide lane' : (visibleAgents.length >= 4 ? 'Max 4 lanes — hide one first' : 'Show lane')}
            >
              <AgentDot color={agent.color} size={8} />
              {agent.role}
              {agent.status === 'completed' && <span className="text-[8px] text-kriptik-slate ml-1">done</span>}
            </button>
          );
        })}
      </div>

      {/* Lanes */}
      {visibleAgents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-kriptik-slate text-sm">
          No agents active yet
        </div>
      ) : (
        <PanelGroup direction="horizontal" className="flex-1">
          {visibleAgents.map((agentId, idx) => {
            const agent = getAgent(agentId);
            const groups = agentGroups.get(agentId) || [];
            return (
              <LaneWithHandle key={agentId} isLast={idx === visibleAgents.length - 1}>
                <Lane
                  agent={agent}
                  groups={groups}
                  projectId={projectId}
                  oauthCatalog={oauthCatalog}
                  onCorrect={(g, a) => setCorrecting({ group: g, agent: a })}
                  onAnswer={onAnswer}
                  correcting={correcting}
                  onCloseCorrection={() => setCorrecting(null)}
                />
              </LaneWithHandle>
            );
          })}
        </PanelGroup>
      )}
    </div>
  );
}

function LaneWithHandle({ children, isLast }: { children: React.ReactNode; isLast: boolean }) {
  return (
    <>
      <Panel minSize={15}>
        {children}
      </Panel>
      {!isLast && (
        <PanelResizeHandle className="w-1 bg-white/5 hover:bg-kriptik-lime/20 transition-colors" />
      )}
    </>
  );
}

function Lane({
  agent,
  groups,
  projectId,
  oauthCatalog,
  onCorrect,
  onAnswer,
  correcting,
  onCloseCorrection,
}: {
  agent: AgentInfo;
  groups: EventGroup[];
  projectId: string;
  oauthCatalog: OAuthCatalogEntry[];
  onCorrect: (group: EventGroup, agent: AgentInfo) => void;
  onAnswer: (nodeId: string, answer: string) => void;
  correcting: { group: EventGroup; agent: AgentInfo } | null;
  onCloseCorrection: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll each lane independently
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [groups]);

  return (
    <div className="h-full flex flex-col border-r border-white/5 last:border-r-0">
      {/* Sticky lane header */}
      <div
        className="px-3 py-2 border-b shrink-0"
        style={{ borderBottomColor: agent.color + '30', backgroundColor: agent.color + '08' }}
      >
        <AgentBadge agent={agent} size="small" />
      </div>

      {/* Lane content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-2">
        {groups.length === 0 && (
          <div className="text-kriptik-slate text-xs text-center py-4">Waiting...</div>
        )}
        {groups.map((group) => (
          <div key={group.id}>
            <AgentResponseBox
              group={group}
              agent={agent}
              projectId={projectId}
              oauthCatalog={oauthCatalog}
              onCorrect={onCorrect}
              onAnswer={onAnswer}
              compact
            />
            {correcting && correcting.group.id === group.id && (
              <div className="mt-2">
                <CorrectionPrompt
                  group={correcting.group}
                  agent={correcting.agent}
                  projectId={projectId}
                  onClose={onCloseCorrection}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
