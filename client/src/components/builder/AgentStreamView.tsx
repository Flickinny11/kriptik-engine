import { useState, useMemo, lazy, Suspense } from 'react';
import type { EngineEvent } from '@/hooks/useEngineEvents';
import type { OAuthCatalogEntry } from '@/lib/api-client';
import { useAgentTracker } from '@/hooks/useAgentTracker';
import { UnifiedFeedView } from './UnifiedFeedView';
import { SwimLaneView } from './SwimLaneView';

// BrainOrb, BrainConnector, WarpBackground use Three.js + OGL at module level.
// Lazy import so they load asynchronously without blocking the streaming chat.
const BrainOrb = lazy(() => import('./BrainOrb').then(m => ({ default: m.BrainOrb })));
const BrainConnectors = lazy(() => import('./BrainConnector').then(m => ({ default: m.BrainConnectors })));
const WarpBackground = lazy(() => import('./WarpBackground').then(m => ({ default: m.WarpBackground })));

type ViewMode = 'feed' | 'lanes';

/**
 * Top-level streaming chat component.
 *
 * Domain-warped OGL background + SDF Brain orb + Feed/Lanes toggle.
 * Both views consume the same event stream. Switching is instant.
 */
export function AgentStreamView({
  events,
  projectId,
  oauthCatalog,
  onAnswer,
}: {
  events: EngineEvent[];
  projectId: string;
  oauthCatalog: OAuthCatalogEntry[];
  onAnswer: (nodeId: string, answer: string) => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem('kriptik_stream_view') as ViewMode) || 'feed';
    } catch {
      return 'feed';
    }
  });

  const { agents, groups, agentGroups, getAgent } = useAgentTracker(events);

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem('kriptik_stream_view', mode); } catch {}
  };

  // Compute brain activity from recent events
  const brainState = useMemo(() => {
    const recent = events.slice(-20);
    const activity = Math.min(agents.size / 5, 1); // more agents = more active
    const readPulse = recent.some(e => e.type === 'brain_node_created' || e.type === 'agent_discovery') ? 1 : 0;
    const writePulse = recent.some(e => e.type === 'brain_node_updated' || e.type === 'brain_edge_created') ? 1 : 0;
    return { activity, readPulse, writePulse };
  }, [events, agents.size]);

  const showToggle = agents.size > 1;
  const buildActive = events.some(e => e.type === 'agent_spawned') && !events.some(e => e.type === 'build_complete');

  return (
    <div className="h-full flex flex-col relative">
      {/* Domain-warped background — organic noise that responds to agent activity */}
      <Suspense fallback={null}>
        <WarpBackground agentCount={agents.size} buildActive={buildActive} />
      </Suspense>

      {/* Top bar: Brain + view toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0 relative z-10">
        <div className="flex items-center gap-3">
          {/* SDF Brain visualization */}
          <Suspense fallback={<div style={{ width: 48, height: 48 }} />}>
            <BrainOrb
              activity={brainState.activity}
              readPulse={brainState.readPulse}
              writePulse={brainState.writePulse}
              size={48}
            />
          </Suspense>
          <div>
            <span className="text-[10px] font-mono text-kriptik-silver uppercase tracking-widest">
              {agents.size} agent{agents.size !== 1 ? 's' : ''} · {events.length} events
            </span>
          </div>
        </div>

        {/* View toggle */}
        {showToggle && (
          <div className="flex items-center gap-1">
            {(['feed', 'lanes'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => handleViewChange(mode)}
                className={`px-3 py-1 text-xs font-display font-semibold rounded-md transition-all uppercase tracking-wider ${
                  viewMode === mode
                    ? 'bg-kriptik-lime/15 text-kriptik-lime border border-kriptik-lime/30'
                    : 'text-kriptik-silver hover:text-kriptik-white hover:bg-white/5'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Brain-to-agent energy connectors */}
      {buildActive && agents.size > 0 && (
        <div className="h-12 relative shrink-0 z-10">
          <Suspense fallback={null}>
            <BrainConnectors
              agents={agents as any}
              recentEvents={events.slice(-15)}
            />
          </Suspense>
        </div>
      )}

      {/* Active view */}
      <div className="flex-1 relative overflow-hidden z-10">
        {viewMode === 'feed' ? (
          <UnifiedFeedView
            groups={groups}
            agents={agents}
            getAgent={getAgent}
            projectId={projectId}
            oauthCatalog={oauthCatalog}
            onAnswer={onAnswer}
          />
        ) : (
          <SwimLaneView
            agentGroups={agentGroups}
            agents={agents}
            getAgent={getAgent}
            projectId={projectId}
            oauthCatalog={oauthCatalog}
            onAnswer={onAnswer}
          />
        )}
      </div>
    </div>
  );
}
