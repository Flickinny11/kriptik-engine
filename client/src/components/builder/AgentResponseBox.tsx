import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronDownIcon, ChevronRightIcon, MessageSquareIcon } from '@/components/ui/icons';
import type { AgentInfo, EventGroup } from '@/hooks/useAgentTracker';
import type { EngineEvent } from '@/hooks/useEngineEvents';
import { AgentBadge } from './AgentBadge';
import { TypeAnimatedText, RevealOnMount } from './TypeAnimatedText';
import './response-box.css';
import './state-effects.css';
import { QuestionTile } from './QuestionTile';
import type { OAuthCatalogEntry, ServiceRegistryEntry } from '@/lib/api-client';
import { useDependencyStore } from '@/store/useDependencyStore';
import { apiClient } from '@/lib/api-client';

/**
 * Renders one response box for a group of events from a single agent reasoning cycle.
 *
 * The box grows as events accumulate. Thinking is expandable, tool calls are collapsible,
 * text streams in as type-animated content. No hardcoded agent roles — identity comes
 * from the dynamic AgentInfo assigned by spawn order.
 */
export function AgentResponseBox({
  group,
  agent,
  projectId,
  oauthCatalog,
  onCorrect,
  onAnswer,
  compact = false,
}: {
  group: EventGroup;
  agent: AgentInfo;
  projectId: string;
  oauthCatalog: OAuthCatalogEntry[];
  onCorrect: (group: EventGroup, agent: AgentInfo) => void;
  onAnswer: (nodeId: string, answer: string) => void;
  compact?: boolean;
}) {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [expanded, setExpanded] = useState(!compact);

  // Determine the current event type pill (last meaningful event type in the group)
  const lastEvent = group.events[group.events.length - 1];
  const currentEventType = lastEvent?.type || 'agent_thinking';

  // Handle standalone events
  if (group.isStandalone) {
    return <StandaloneBox event={group.events[0]} agent={agent} projectId={projectId} oauthCatalog={oauthCatalog} onAnswer={onAnswer} />;
  }

  const isStreaming = group.events.length > 0 && group.events[group.events.length - 1].type === 'agent_thinking';

  // Compact mode: just show badge + first line, click to expand
  if (compact && !expanded) {
    return (
      <div
        className="response-box compact p-2 cursor-pointer"
        style={{ '--agent-color': agent.color, '--agent-color-dim': agent.color + '14', '--agent-color-glow': agent.color + '26' } as React.CSSProperties}
        onClick={() => setExpanded(true)}
      >
        <AgentBadge agent={agent} eventType={currentEventType} size="small" />
        <p className="text-xs text-kriptik-silver mt-1 truncate relative z-10">
          {getGroupPreview(group)}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`response-box ${isStreaming ? 'is-streaming heat-distortion state-chromatic-active' : ''}`}
      style={{ '--agent-color': agent.color, '--agent-color-dim': agent.color + '14', '--agent-color-glow': agent.color + '26' } as React.CSSProperties}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.03] relative z-10">
        <AgentBadge agent={agent} eventType={currentEventType} />
        <button
          onClick={() => onCorrect(group, agent)}
          className="text-kriptik-slate hover:text-kriptik-amber transition-colors p-1 rounded hover:bg-kriptik-amber/10"
          title="Send correction"
        >
          <MessageSquareIcon size={14} />
        </button>
      </div>

      {/* Content — each event in the group renders as a section */}
      <div className="px-3 py-2 space-y-2 relative z-10">
        {group.events.map((event, i) => (
          <EventSection
            key={`${group.id}-${i}`}
            event={event}
            agent={agent}
            thinkingExpanded={thinkingExpanded}
            onToggleThinking={() => setThinkingExpanded(!thinkingExpanded)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Renders one event within a response box group.
 * This is NOT a standalone component — it's a section inside AgentResponseBox.
 */
function EventSection({
  event,
  agent,
  thinkingExpanded,
  onToggleThinking,
}: {
  event: EngineEvent;
  agent: AgentInfo;
  thinkingExpanded: boolean;
  onToggleThinking: () => void;
}) {
  switch (event.type) {
    case 'agent_thinking':
      return (
        <div className={`thinking-section text-xs ${thinkingExpanded ? 'expanded' : ''}`}>
          <button
            onClick={onToggleThinking}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-kriptik-violet/70 hover:text-kriptik-violet transition-colors"
          >
            {thinkingExpanded ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />}
            <span className="italic font-mono text-[10px]">thinking...</span>
          </button>
          <div className="thinking-content">
            <div className="px-3 pb-2 text-kriptik-violet/40 italic whitespace-pre-wrap text-[11px] leading-relaxed">
              {String(event.data.thinking || '')}
            </div>
          </div>
        </div>
      );

    case 'agent_text':
      return (
        <RevealOnMount>
          <div className="text-sm text-kriptik-white whitespace-pre-wrap leading-relaxed">
            <TypeAnimatedText text={String(event.data.text || '')} isLive className="" />
          </div>
        </RevealOnMount>
      );

    case 'agent_tool_call':
      return <ToolCallSection event={event} agent={agent} />;

    case 'agent_tool_result':
      return <ToolResultSection event={event} />;

    case 'agent_file_write':
      return (
        <RevealOnMount>
          <div className="file-write-block text-xs font-mono px-2.5 py-2">
            <span className="text-kriptik-lime font-semibold">Wrote:</span>{' '}
            <span className="text-kriptik-white/80">{extractFilePath(event)}</span>
          </div>
        </RevealOnMount>
      );

    case 'agent_discovery':
      return (
        <RevealOnMount>
          <div className="discovery-block discovery-glow text-xs px-2.5 py-2">
            <span className="text-amber-400 font-semibold">Discovery:</span>{' '}
            <span className="text-kriptik-white/80">{String(event.data.title || '')}</span>
          </div>
        </RevealOnMount>
      );

    case 'agent_error':
      return (
        <RevealOnMount>
          <div className="error-block state-error-pulse text-xs px-2.5 py-2">
            <span className="text-red-400 font-semibold">Error:</span>{' '}
            <span className="text-red-300/80">{String(event.data.message || event.data.error || '')}</span>
          </div>
        </RevealOnMount>
      );

    case 'build_progress':
      return (
        <div className="text-xs text-kriptik-lime font-medium">
          {String(event.data.title || event.data.message || '')}
        </div>
      );

    default:
      return null;
  }
}

function ToolCallSection({ event, agent }: { event: EngineEvent; agent: AgentInfo }) {
  const [expanded, setExpanded] = useState(false);
  const toolName = String(event.data.tool || event.data.toolName || event.data.name || 'unknown');

  return (
    <div className="tool-block text-xs overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-2.5 py-2 text-left"
      >
        {expanded ? <ChevronDownIcon size={10} className="text-cyan-400" /> : <ChevronRightIcon size={10} className="text-cyan-400" />}
        <span className="font-mono text-cyan-400 font-medium">{toolName}</span>
      </button>
      {expanded && event.data.input != null && (
        <div className="px-2 pb-1.5 text-kriptik-slate font-mono text-[10px] whitespace-pre-wrap border-t border-cyan-500/5">
          {String(typeof event.data.input === 'string' ? event.data.input : JSON.stringify(event.data.input, null, 2)).slice(0, 500)}
        </div>
      )}
    </div>
  );
}

function ToolResultSection({ event }: { event: EngineEvent }) {
  const [expanded, setExpanded] = useState(false);
  const toolName = String(event.data.tool || 'result');

  return (
    <div className="text-xs text-kriptik-slate">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 hover:text-kriptik-silver transition-colors"
      >
        {expanded ? <ChevronDownIcon size={10} /> : <ChevronRightIcon size={10} />}
        <span className="font-mono">{toolName} result</span>
      </button>
      {expanded && event.data.result != null && (
        <div className="mt-1 pl-3 font-mono text-[10px] whitespace-pre-wrap max-h-40 overflow-y-auto">
          {String(typeof event.data.result === 'string' ? event.data.result : JSON.stringify(event.data.result, null, 2)).slice(0, 1000)}
        </div>
      )}
    </div>
  );
}

/**
 * Standalone events that always get their own box (spawned, stopped, question, complete)
 */
function StandaloneBox({
  event,
  agent,
  projectId,
  oauthCatalog,
  onAnswer,
}: {
  event: EngineEvent;
  agent: AgentInfo;
  projectId: string;
  oauthCatalog: OAuthCatalogEntry[];
  onAnswer: (nodeId: string, answer: string) => void;
}) {
  // Pull MCP service data from the global dependency store
  const services = useDependencyStore(s => s.services);
  const connectionsMap = useDependencyStore(s => s.getConnectionsMap());
  const setConnectionState = useDependencyStore(s => s.setConnectionState);
  const setToolsForService = useDependencyStore(s => s.setToolsForService);
  const popupCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (popupCheckRef.current) clearInterval(popupCheckRef.current);
    };
  }, []);

  const handleMcpConnect = useCallback(async (service: ServiceRegistryEntry) => {
    if (!service.mcp) return;
    setConnectionState(service.id, 'connecting');
    try {
      const { authorizationUrl } = await apiClient.startMcpAuth(service.id);
      const width = 600, height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(authorizationUrl, `mcp_oauth_${service.id}`, `width=${width},height=${height},left=${left},top=${top}`);
      if (popup) {
        if (popupCheckRef.current) clearInterval(popupCheckRef.current);
        popupCheckRef.current = setInterval(() => {
          if (popup.closed) {
            if (popupCheckRef.current) clearInterval(popupCheckRef.current);
            popupCheckRef.current = null;
            // If still connecting, revert to disconnected
            const current = useDependencyStore.getState().connections.get(service.id);
            if (current?.state === 'connecting') {
              setConnectionState(service.id, 'disconnected');
            }
          }
        }, 500);
      }
    } catch {
      setConnectionState(service.id, 'error', { error: 'Failed to start connection' });
    }
  }, [setConnectionState, setToolsForService]);

  switch (event.type) {
    case 'agent_spawned':
      return (
        <div
          className="standalone-box spawn-flash flex items-center gap-2 py-2 px-3"
          style={{ '--agent-color-glow': agent.color + '40', background: agent.color + '08', borderColor: agent.color + '18' } as React.CSSProperties}
        >
          <AgentBadge agent={agent} eventType="agent_spawned" size="small" />
        </div>
      );

    case 'agent_stopped':
      return (
        <div className="standalone-box flex items-center gap-2 py-2 px-3 bg-white/[0.02]">
          <AgentBadge agent={agent} eventType="agent_stopped" size="small" />
        </div>
      );

    case 'user_input_requested':
      return (
        <QuestionTile
          nodeId={String(event.data.nodeId || event.id)}
          question={String(event.data.question || event.data.title || '')}
          context={event.data.context ? String(event.data.context) : undefined}
          projectId={projectId}
          oauthCatalog={oauthCatalog}
          serviceRegistry={services}
          mcpConnectionStates={connectionsMap}
          onMcpConnect={handleMcpConnect}
          onAnswer={onAnswer}
        />
      );

    case 'build_complete':
      return (
        <div className="standalone-box complete-glow py-3 px-4 bg-green-500/5 border border-green-500/20 text-center">
          <span className="text-green-400 font-display font-bold text-sm tracking-wide">Build complete!</span>
        </div>
      );

    case 'connected':
      return <div className="text-xs text-kriptik-slate text-center py-1">Connected to build stream</div>;

    case 'replay_complete':
      return event.data.count ? (
        <div className="text-xs text-kriptik-slate text-center py-1 border-b border-white/5 mb-1">
          Loaded {String(event.data.count)} previous events
        </div>
      ) : null;

    default:
      return null;
  }
}

// Helpers

function extractFilePath(event: EngineEvent): string {
  const input = event.data.input as Record<string, unknown> | undefined;
  return String(input?.path || input?.filePath || event.data.path || event.data.filePath || 'unknown');
}

function getGroupPreview(group: EventGroup): string {
  for (const event of group.events) {
    if (event.type === 'agent_text') return String(event.data.text || '').slice(0, 80);
    if (event.type === 'agent_file_write') return `Writing ${extractFilePath(event)}`;
    if (event.type === 'agent_tool_call') return `Using ${String(event.data.tool || 'tool')}`;
    if (event.type === 'agent_thinking') return 'Thinking...';
  }
  return '';
}
