import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, type PanInfo, AnimatePresence } from 'framer-motion';
import { apiClient } from '@/lib/api-client';
import {
  useFeatureAgentTileStore,
  type StreamMessage,
  type FeatureAgentTileStatus,
  type ImplementationPlan,
  type RequiredCredential,
  type IntegrationRequirement,
} from '@/store/useFeatureAgentTileStore';
import { useFeatureAgentStore, type GhostModeAgentConfig } from '@/store/feature-agent-store';
// NEW CONSOLIDATED COMPONENTS - Same as Builder flow
import { PlanningOptionsUI, type PlanningQuestion, type PlanningOption } from '../builder/planning/PlanningOptionsUI';
import { IntegrationsAuthorizationUI, type RequiredIntegration } from '../builder/auth/IntegrationsAuthorizationUI';
import { AnimatedLogo } from '../builder/AnimatedLogo';
import { getIntegrationById } from '@/data/integrations-database';
// Legacy components - keeping for fallback but will use new ones primarily
import { IntegrationConnectView } from '@/components/integrations/IntegrationConnectView';
import { GhostModeConfig } from './GhostModeConfig';
import { FeaturePreviewWindow } from './FeaturePreviewWindow';
import { FeatureAgentActivityStream } from './FeatureAgentActivityStream';
import type { AgentActivityEvent } from '@/types/agent-activity';
import { parseStreamChunkToEvent } from '@/types/agent-activity';
import TournamentStreamResults, { type TournamentStreamData } from '../builder/TournamentStreamResults';
import './feature-agent-tile.css';

// =============================================================================
// Embedded Streaming Thinking Tokens - Compact version for Feature Agent cards
// =============================================================================
function EmbeddedStreamingThinkingTokens({
  tokens,
  isThinking,
  isCollapsed,
  onToggleCollapse,
}: {
  tokens: string;
  isThinking: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  if (!tokens && !isThinking) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-3 rounded-lg overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, rgba(45,45,50,0.9) 0%, rgba(35,35,40,0.95) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      {/* Compact Header */}
      <button
        onClick={onToggleCollapse}
        className="w-full flex items-center justify-between px-3 py-2 text-left transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-2">
          {/* Animated 3D KripTik Logo - planet with rings */}
          <AnimatedLogo
            size={16}
            isActive={isThinking}
            showStatus={false}
            status={isThinking ? 'thinking' : 'idle'}
          />
          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
            {isThinking ? 'Thinking...' : 'Reasoning'}
          </span>
          {tokens && (
            <span className="text-[10px] text-zinc-500">
              ({tokens.split(' ').length} tokens)
            </span>
          )}
        </div>
        <svg
          className={`w-3 h-3 text-zinc-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Content */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="px-3 pb-3 max-h-32 overflow-y-auto"
              style={{
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                fontSize: '11px',
              }}
            >
              <p className="text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {tokens}
                {isThinking && (
                  <motion.span
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    className="inline-block w-1.5 h-3 bg-amber-400 ml-0.5"
                  />
                )}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// Embedded Planning Options - Compact version for Feature Agent cards
// =============================================================================
function EmbeddedPlanningUI({
  plan,
  onApproveAll,
  onRecalculate,
}: {
  plan: ImplementationPlan;
  onApproveAll: (selections: Map<string, { optionId: string; otherValue?: string }>) => void;
  onRecalculate: (selections: Map<string, { optionId: string; otherValue?: string }>) => void;
}) {
  const [selections, setSelections] = useState<Map<string, { optionId: string; otherValue?: string }>>(new Map());
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Convert plan phases to PlanningQuestions
  const questions: PlanningQuestion[] = useMemo(() => {
    return plan.phases.map((phase): PlanningQuestion => ({
      id: `phase-${phase.id}`,
      category: phase.steps?.some(s => s.type === 'frontend') ? 'deployment' : 'database',
      question: phase.name,
      description: phase.description,
      options: phase.steps?.map((step, j): PlanningOption => ({
        id: `${phase.id}-step-${j}`,
        label: step.description,
        description: `${step.type} · ~${step.estimatedTokens} tokens`,
      })) || [{ id: 'default', label: 'Default implementation' }],
      selectedOptionId: selections.get(`phase-${phase.id}`)?.optionId || null,
    }));
  }, [plan.phases, selections]);

  const handleSelectionChange = useCallback((questionId: string, optionId: string, otherValue?: string) => {
    setSelections(prev => {
      const newMap = new Map(prev);
      newMap.set(questionId, { optionId, otherValue });
      return newMap;
    });
  }, []);

  const handleRecalculate = useCallback(async (sels: Map<string, { optionId: string; otherValue?: string }>) => {
    setIsRecalculating(true);
    await onRecalculate(sels);
    setIsRecalculating(false);
  }, [onRecalculate]);

  return (
    <div
      className="rounded-xl overflow-hidden mb-3"
      style={{
        background: 'linear-gradient(145deg, rgba(30,30,35,0.95) 0%, rgba(25,25,30,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <div className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(145deg, rgba(251,191,36,0.3) 0%, rgba(245,158,11,0.2) 100%)' }}>
            <svg className="w-3 h-3 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-white">Review Plan</span>
          <span className="text-[10px] text-zinc-500 ml-auto">{plan.phases.length} phases · ~${plan.estimatedCostUSD.toFixed(2)}</span>
        </div>

        {/* Compact Planning Options */}
        <PlanningOptionsUI
          questions={questions}
          onSelectionChange={handleSelectionChange}
          onConfirmAll={() => onApproveAll(selections)}
          onRecalculateNeeded={handleRecalculate}
          isRecalculating={isRecalculating}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Embedded Integrations Auth - Compact version for Feature Agent cards
// =============================================================================
function EmbeddedIntegrationsAuth({
  credentials,
  onSubmit,
  projectId,
}: {
  credentials: RequiredCredential[];
  onSubmit: (creds: Record<string, string>) => void;
  projectId?: string;
}) {
  // Convert RequiredCredentials to RequiredIntegrations format
  const requiredIntegrations: RequiredIntegration[] = useMemo(() => {
    return credentials.map(cred => {
      const integration = getIntegrationById(cred.platformName.toLowerCase().replace(/\s+/g, '-'));
      return {
        integration: integration || {
          id: cred.id,
          name: cred.name,
          category: 'Other',
          description: cred.description,
          iconSlug: cred.platformName.toLowerCase().replace(/\s+/g, ''),
          authType: 'api_key' as const,
          credentials: [{
            name: cred.name,
            envVariableName: cred.envVariableName,
            required: cred.required,
            type: 'api_key' as const,
          }],
          docsUrl: cred.platformUrl,
          popularityRank: 999,
        },
        purpose: cred.description,
        isAuthorized: !!cred.value,
      };
    });
  }, [credentials]);

  const handleAuthComplete = useCallback((collectedCredentials: Map<string, Record<string, string>>) => {
    const credMap: Record<string, string> = {};
    collectedCredentials.forEach((creds) => {
      Object.entries(creds).forEach(([key, value]) => {
        credMap[key] = value;
      });
    });
    onSubmit(credMap);
  }, [onSubmit]);

  return (
    <div
      className="rounded-xl overflow-hidden mb-3"
      style={{
        background: 'linear-gradient(145deg, rgba(30,30,35,0.95) 0%, rgba(25,25,30,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <div className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(145deg, rgba(16,185,129,0.3) 0%, rgba(5,150,105,0.2) 100%)' }}>
            <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-white">Credentials Required</span>
          <span className="text-[10px] text-zinc-500 ml-auto">{credentials.length} needed</span>
        </div>

        {/* Embedded version - show compact tiles */}
        <IntegrationsAuthorizationUI
          isVisible={true}
          projectId={projectId || ''}
          requiredIntegrations={requiredIntegrations}
          onAuthComplete={handleAuthComplete}
          onCancel={() => {}}
        />
      </div>
    </div>
  );
}

interface FeatureAgentTileProps {
  agentId: string;
  onClose: () => void;
  onMinimize: () => void;
  initialPosition?: { x: number; y: number };
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function labelForStatus(status: FeatureAgentTileStatus): string {
  switch (status) {
    case 'intent_lock':
      return 'INTENT';
    case 'awaiting_plan_approval':
      return 'PLAN';
    case 'awaiting_credentials':
      return 'CREDENTIALS';
    case 'awaiting_integrations':
      return 'CONNECT';
    case 'implementing':
      return 'IMPLEMENTING';
    case 'verifying':
      return 'VERIFYING';
    case 'complete':
      return 'COMPLETE';
    case 'failed':
      return 'FAILED';
    case 'paused':
      return 'PAUSED';
    case 'ghost_mode':
      return 'GHOST';
  }
}

function normalizeMessageType(msgType: StreamMessage['type']): 'thinking' | 'action' | 'result' {
  if (msgType === 'action') return 'action';
  if (msgType === 'result') return 'result';
  return 'thinking';
}

function svgX() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function svgMinimize() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 7H12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function svgStop() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function svgGhost() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1.5C4.51 1.5 2.5 3.51 2.5 6v5c0 .28.22.5.5.5.14 0 .27-.05.35-.15L4.5 10.2l.65.65c.09.1.22.15.35.15s.27-.05.35-.15L7 9.7l1.15 1.15c.09.1.22.15.35.15s.27-.05.35-.15l.65-.65 1.15 1.15c.09.1.21.15.35.15.28 0 .5-.22.5-.5V6c0-2.49-2.01-4.5-4.5-4.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5.25" cy="6" r="0.75" fill="currentColor" />
      <circle cx="8.75" cy="6" r="0.75" fill="currentColor" />
    </svg>
  );
}

function svgEye() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function FeatureAgentTile({ agentId, onClose, onMinimize, initialPosition }: FeatureAgentTileProps) {
  const tile = useFeatureAgentTileStore((s) => s.tiles[agentId]);
  const setTilePosition = useFeatureAgentTileStore((s) => s.setTilePosition);
  const setTileStatus = useFeatureAgentTileStore((s) => s.setTileStatus);
  const addMessage = useFeatureAgentTileStore((s) => s.addMessage);
  const updateProgress = useFeatureAgentTileStore((s) => s.updateProgress);
  const setImplementationPlan = useFeatureAgentTileStore((s) => s.setImplementationPlan);
  const setRequiredCredentials = useFeatureAgentTileStore((s) => s.setRequiredCredentials);
  const setIntegrationRequirements = useFeatureAgentTileStore((s) => s.setIntegrationRequirements);
  const setSandboxUrl = useFeatureAgentTileStore((s) => s.setSandboxUrl);
  const setEscalationProgress = useFeatureAgentTileStore((s) => s.setEscalationProgress);

  // Ghost Mode state from persisted store
  const runningAgent = useFeatureAgentStore((s) => s.runningAgents.find((a) => a.id === agentId));
  const setGhostMode = useFeatureAgentStore((s) => s.setGhostMode);

  const [showGhostModeConfig, setShowGhostModeConfig] = useState(false);
  const [showPreviewWindow, setShowPreviewWindow] = useState(false);
  const [activityEvents, setActivityEvents] = useState<AgentActivityEvent[]>([]);
  const [tournamentData, setTournamentData] = useState<TournamentStreamData | null>(null);

  // NEW: Planning/Iteration mode toggle (like Builder view)
  const [planningMode, setPlanningMode] = useState<'planning' | 'iterate'>('planning');
  const [showModeDropdown, setShowModeDropdown] = useState(false);

  // NEW: Streaming thinking tokens state
  const [thinkingTokens, setThinkingTokens] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingCollapsed, setThinkingCollapsed] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const x = useMotionValue(tile?.position.x ?? initialPosition?.x ?? 80);
  const y = useMotionValue(tile?.position.y ?? initialPosition?.y ?? 120);

  const headerMeta = useMemo(() => {
    const name = tile?.agentName || `Feature Agent ${agentId.slice(0, 6)}`;
    const model = tile?.modelName ? `MODEL · ${tile.modelName}` : undefined;
    return { name, model };
  }, [tile?.agentName, tile?.modelName, agentId]);

  const statusLabel = useMemo(() => labelForStatus(tile?.status || 'implementing'), [tile?.status]);
  const isActive = tile?.status !== 'complete' && tile?.status !== 'failed';

  useEffect(() => {
    if (!tile) return;
    if (tile.minimized) return;

    // Connect only once per visible tile
    if (eventSourceRef.current) return;

    // Use API_URL for proper server connection
    const apiBase = import.meta.env.VITE_API_URL || '';
    const url = `${apiBase}/api/developer-mode/feature-agent/${encodeURIComponent(agentId)}/stream`;
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    const push = (msg: StreamMessage) => {
      addMessage(agentId, msg);
      // keep view pinned to bottom for active streams
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
      });
    };

    es.onmessage = (evt) => {
      try {
        const rawData = JSON.parse(evt.data);
        if (!rawData || typeof rawData !== 'object' || typeof rawData.type !== 'string') return;

        // Handle tournament events separately (they use different type strings)
        const eventType = rawData.type as string;
        if (eventType === 'tournament-started') {
          const meta = (rawData.metadata || {}) as Record<string, unknown>;
          setTournamentData({
            tournamentId: (meta.tournamentId as string) || `t-${Date.now()}`,
            featureDescription: (meta.featureDescription as string) || 'Feature build',
            phase: 'init',
            competitors: (meta.competitors as TournamentStreamData['competitors']) || [],
            judges: (meta.judges as TournamentStreamData['judges']) || [],
            startTime: Date.now(),
          });
          return;
        } else if (eventType === 'tournament-competitor-update') {
          const meta = (rawData.metadata || {}) as Record<string, unknown>;
          setTournamentData(prev => {
            if (!prev) return prev;
            const update = meta.update as Partial<TournamentStreamData['competitors'][0]> || {};
            const competitors = prev.competitors.map(c =>
              c.id === meta.competitorId ? { ...c, ...update } : c
            );
            const phase = (meta.phase as TournamentStreamData['phase']) || prev.phase;
            return { ...prev, competitors, phase };
          });
          return;
        } else if (eventType === 'tournament-judge-update') {
          const meta = (rawData.metadata || {}) as Record<string, unknown>;
          setTournamentData(prev => {
            if (!prev) return prev;
            const update = meta.update as Partial<TournamentStreamData['judges'][0]> || {};
            const judges = prev.judges.map(j =>
              j.id === meta.judgeId ? { ...j, ...update } : j
            );
            const phase = (meta.phase as TournamentStreamData['phase']) || prev.phase;
            return { ...prev, judges, phase };
          });
          return;
        } else if (eventType === 'tournament-complete') {
          const meta = (rawData.metadata || {}) as Record<string, unknown>;
          setTournamentData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              phase: 'complete' as const,
              winner: meta.winner as TournamentStreamData['winner'],
              endTime: Date.now(),
            };
          });
          return;
        }

        // Regular stream messages
        const data = rawData as StreamMessage;
        if (typeof data.type !== 'string') return;

        // Lightweight state inference from stream messages
        if (data.type === 'status') {
          const meta = (data.metadata || {}) as Record<string, unknown>;
          const progress = typeof meta.progress === 'number' ? meta.progress : undefined;
          const phase = typeof meta.currentStep === 'string' ? meta.currentStep : undefined;
          if (typeof progress === 'number') updateProgress(agentId, progress, phase);

          const nextStatus = (() => {
            const s = typeof meta.status === 'string' ? meta.status : '';
            if (s === 'completed') return 'complete';
            if (s === 'failed') return 'failed';
            if (s === 'paused') return 'paused';
            if (s === 'running') return 'implementing';
            if (s === 'pending_intent' || s === 'intent_locked') return 'intent_lock';
            if (s === 'awaiting_plan_approval') return 'awaiting_plan_approval';
            if (s === 'awaiting_credentials') return 'awaiting_credentials';
            if (s === 'awaiting_integrations') return 'awaiting_integrations';
            if (s === 'implementing') return 'implementing';
            if (s === 'verifying') return 'verifying';
            if (s === 'complete') return 'complete';
            if (s === 'ghost_mode') return 'ghost_mode';
            return undefined;
          })();
          if (nextStatus) setTileStatus(agentId, nextStatus);
        }

        if (data.type === 'verification') setTileStatus(agentId, 'verifying');
        if (data.type === 'plan') {
          const meta = (data.metadata || {}) as Record<string, unknown>;
          const plan = meta.plan as ImplementationPlan | undefined;
          if (plan && typeof plan === 'object') {
            setImplementationPlan(agentId, plan);
            setRequiredCredentials(agentId, (plan.requiredCredentials || []) as RequiredCredential[]);
          }
          setTileStatus(agentId, 'awaiting_plan_approval');
        }
        if (data.type === 'credentials') {
          const meta = (data.metadata || {}) as Record<string, unknown>;
          const creds = meta.credentials as RequiredCredential[] | undefined;
          if (Array.isArray(creds)) setRequiredCredentials(agentId, creds);
          setTileStatus(agentId, 'awaiting_credentials');
        }
        if (data.type === 'integrations' as StreamMessage['type']) {
          const meta = (data.metadata || {}) as Record<string, unknown>;
          const integrations = meta.integrations as IntegrationRequirement[] | undefined;
          if (Array.isArray(integrations)) setIntegrationRequirements(agentId, integrations);
          setTileStatus(agentId, 'awaiting_integrations');
        }

        // Handle sandbox URL from backend
        const meta = (data.metadata || {}) as Record<string, unknown>;
        if (typeof meta.sandboxUrl === 'string' && meta.sandboxUrl) {
          setSandboxUrl(agentId, meta.sandboxUrl);
        }

        // Handle escalation progress from backend
        if (typeof meta.escalationLevel === 'number' && typeof meta.escalationAttempt === 'number') {
          setEscalationProgress(agentId, meta.escalationLevel, meta.escalationAttempt);
        }

        // NEW: Handle thinking tokens for streaming display
        if (data.type === 'thinking') {
          setIsThinking(true);
          setThinkingTokens(prev => prev + (prev ? '\n' : '') + data.content);
          setThinkingCollapsed(false); // Auto-expand when new content
        }
        // Handle thinking complete
        if (data.type === 'status' && data.content?.toLowerCase().includes('complete')) {
          setIsThinking(false);
        }

        push({
          type: data.type,
          content: data.content,
          timestamp: data.timestamp || Date.now(),
          metadata: data.metadata,
        });

        // Parse activity events for the activity stream
        const activityEvent = parseStreamChunkToEvent(data, agentId);
        if (activityEvent) {
          setActivityEvents(prev => [...prev.slice(-49), activityEvent]);
        }
      } catch {
        // Ignore malformed SSE messages
      }
    };

    es.onerror = () => {
      // Preserve tile; user can keep it open while the stream reconnects.
      push({
        type: 'status',
        content: 'Stream connection interrupted. Reconnecting…',
        timestamp: Date.now(),
      });
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [agentId, tile, addMessage, setTileStatus, updateProgress, setImplementationPlan, setRequiredCredentials, setIntegrationRequirements, setSandboxUrl, setEscalationProgress]);

  // Close SSE when minimized to reduce background load.
  useEffect(() => {
    if (!tile) return;
    if (!tile.minimized) return;
    if (!eventSourceRef.current) return;
    eventSourceRef.current.close();
    eventSourceRef.current = null;
  }, [tile?.minimized, tile]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const next = {
      x: (tile?.position.x ?? initialPosition?.x ?? 80) + info.offset.x,
      y: (tile?.position.y ?? initialPosition?.y ?? 120) + info.offset.y,
    };
    setTilePosition(agentId, next);
  };

  const stopAgent = async () => {
    try {
      // Prefer Feature Agent stop if available, fall back to Developer Mode agent stop.
      try {
        await apiClient.post(`/api/developer-mode/feature-agent/${encodeURIComponent(agentId)}/stop`, {});
      } catch {
        await apiClient.post(`/api/developer-mode/agents/${encodeURIComponent(agentId)}/stop`, {});
      }
      setTileStatus(agentId, 'paused');
      addMessage(agentId, { type: 'status', content: 'Stop requested.', timestamp: Date.now() });
    } catch (e) {
      addMessage(agentId, {
        type: 'result',
        content: `Stop failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }
  };

  // Phase modification type for API calls
  type PhaseModification = { type: string; content: string };

  const approvePhase = async (phaseId: string) => {
    await apiClient.post(`/api/developer-mode/feature-agent/${encodeURIComponent(agentId)}/plan/approve-phase`, { phaseId });
    addMessage(agentId, { type: 'status', content: `Phase approved: ${phaseId}`, timestamp: Date.now() });
  };

  const modifyPhase = async (phaseId: string, modifications: PhaseModification[]) => {
    await apiClient.post(`/api/developer-mode/feature-agent/${encodeURIComponent(agentId)}/plan/modify-phase`, { phaseId, modifications });
    addMessage(agentId, { type: 'status', content: `Phase modification submitted: ${phaseId}`, timestamp: Date.now() });
  };

  // Suppress unused variable warnings - these are available for future use
  void approvePhase;
  void modifyPhase;

  const approveAll = async () => {
    await apiClient.post(`/api/developer-mode/feature-agent/${encodeURIComponent(agentId)}/plan/approve-all`, {});
    addMessage(agentId, { type: 'status', content: 'All phases approved.', timestamp: Date.now() });
  };

  const submitCredentials = async (credentials: Record<string, string>) => {
    await apiClient.post(`/api/developer-mode/feature-agent/${encodeURIComponent(agentId)}/credentials`, { credentials });
    addMessage(agentId, { type: 'status', content: 'Credentials submitted.', timestamp: Date.now() });
  };

  const handleIntegrationsConnected = async () => {
    await apiClient.post(`/api/developer-mode/feature-agent/${encodeURIComponent(agentId)}/integrations-connected`, {});
    addMessage(agentId, { type: 'status', content: 'All integrations connected.', timestamp: Date.now() });
    setTileStatus(agentId, 'implementing');
  };

  const handleIntegrationsSkipped = async () => {
    await apiClient.post(`/api/developer-mode/feature-agent/${encodeURIComponent(agentId)}/skip-integrations`, {});
    addMessage(agentId, { type: 'status', content: 'Integration connection skipped.', timestamp: Date.now() });
    setTileStatus(agentId, 'implementing');
  };

  const handleGhostModeSave = async (config: GhostModeAgentConfig) => {
    try {
      // Save to API
      await apiClient.post(`/api/developer-mode/feature-agent/${encodeURIComponent(agentId)}/ghost-mode`, config);

      // Update persisted store
      setGhostMode(agentId, config);

      // Update tile status
      setTileStatus(agentId, 'ghost_mode');
      addMessage(agentId, {
        type: 'status',
        content: 'Ghost Mode enabled. You can safely close this tile - the agent will continue running in the background.',
        timestamp: Date.now()
      });

      setShowGhostModeConfig(false);
    } catch (error) {
      addMessage(agentId, {
        type: 'result',
        content: `Failed to enable Ghost Mode: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }
  };

  if (!tile || tile.minimized) return null;

  return (
    <motion.div
      className="fa-tile"
      style={{ x, y }}
      drag
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      initial={{ opacity: 0, scale: 0.96, y: 18 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
    >
      <div className="fa-tile__edge" />
      <div className="fa-tile__noise" />

      <div className="fa-tile__header">
        <div className="fa-tile__title">
          <div className="fa-tile__title-row">
            <div className="fa-tile__status" title={statusLabel}>
              <span className={`fa-tile__status-dot ${isActive ? 'fa-tile__status-dot--active' : ''}`} />
              <span>{statusLabel}</span>
            </div>
            <span className="fa-tile__name">{headerMeta.name}</span>
          </div>
          <div className="fa-tile__meta-row">
            {headerMeta.model && <span className="fa-tile__meta">{headerMeta.model}</span>}
            {/* NEW: Planning/Iterate Mode Toggle */}
            <div className="fa-tile__mode-toggle">
              <button
                className="fa-tile__mode-btn"
                onClick={() => setShowModeDropdown(!showModeDropdown)}
                onBlur={() => setTimeout(() => setShowModeDropdown(false), 150)}
              >
                <span className="fa-tile__mode-label">{planningMode}</span>
                <svg className={`fa-tile__mode-chevron ${showModeDropdown ? 'fa-tile__mode-chevron--open' : ''}`} width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {showModeDropdown && (
                <div className="fa-tile__mode-dropdown">
                  <button
                    className={`fa-tile__mode-option ${planningMode === 'planning' ? 'fa-tile__mode-option--active' : ''}`}
                    onClick={() => { setPlanningMode('planning'); setShowModeDropdown(false); }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    <span>Planning</span>
                  </button>
                  <button
                    className={`fa-tile__mode-option ${planningMode === 'iterate' ? 'fa-tile__mode-option--active' : ''}`}
                    onClick={() => { setPlanningMode('iterate'); setShowModeDropdown(false); }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Iterate</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="fa-tile__actions">
          <button
            className={`fa-tile__iconbtn fa-tile__iconbtn--ghost ${runningAgent?.ghostModeEnabled ? 'fa-tile__iconbtn--ghost-active' : ''}`}
            onClick={() => setShowGhostModeConfig(true)}
            title={runningAgent?.ghostModeEnabled ? 'Ghost Mode Active' : 'Enable Ghost Mode'}
          >
            {svgGhost()}
          </button>
          <button className="fa-tile__iconbtn fa-tile__iconbtn--danger" onClick={stopAgent} title="Stop">
            {svgStop()}
          </button>
          <button className="fa-tile__iconbtn" onClick={onMinimize} title="Minimize">
            {svgMinimize()}
          </button>
          <button className="fa-tile__iconbtn" onClick={onClose} title="Close">
            {svgX()}
          </button>
        </div>
      </div>

      <div className="fa-tile__body">
        <div className="fa-tile__scroll" ref={scrollRef}>
          {/* Tournament Mode Results - shows when tournament is active */}
          {tournamentData && (
            <div className="fa-tile__tournament">
              <TournamentStreamResults
                data={tournamentData}
                onSelectWinner={(files) => {
                  console.log('[FeatureAgentTile] Tournament winner files:', Object.keys(files));
                  setTournamentData(null);
                }}
              />
            </div>
          )}

          {/* NEW: Streaming Thinking Tokens - shows during intent_lock and thinking phases */}
          <AnimatePresence>
            {(isThinking || thinkingTokens) && (
              <EmbeddedStreamingThinkingTokens
                tokens={thinkingTokens}
                isThinking={isThinking}
                isCollapsed={thinkingCollapsed}
                onToggleCollapse={() => setThinkingCollapsed(!thinkingCollapsed)}
              />
            )}
          </AnimatePresence>

          {/* NEW: Planning Options UI - Premium 3D glass styling, embedded in card */}
          {tile.status === 'awaiting_plan_approval' && tile.implementationPlan && (
            <EmbeddedPlanningUI
              plan={tile.implementationPlan}
              onApproveAll={async () => {
                await approveAll();
              }}
              onRecalculate={async (selections) => {
                // Send selections to backend for recalculation
                console.log('[FeatureAgentTile] Recalculating with selections:', selections);
                addMessage(agentId, { type: 'status', content: 'Recalculating plan with your selections...', timestamp: Date.now() });
              }}
            />
          )}

          {/* NEW: Embedded Integrations Auth - Premium 3D glass styling */}
          {tile.status === 'awaiting_credentials' && (tile.requiredCredentials?.length || 0) > 0 && (
            <EmbeddedIntegrationsAuth
              credentials={tile.requiredCredentials || []}
              onSubmit={submitCredentials}
              projectId={agentId}
            />
          )}

          {/* Legacy integration connect - for OAuth integrations */}
          {tile.status === 'awaiting_integrations' && (tile.integrationRequirements?.length || 0) > 0 && (
            <IntegrationConnectView
              requirements={tile.integrationRequirements || []}
              featureAgentId={agentId}
              onAllConnected={handleIntegrationsConnected}
              onSkip={handleIntegrationsSkipped}
            />
          )}

          {/* Agent Activity Stream - shows when implementing */}
          {(tile.status === 'implementing' || tile.status === 'verifying') && (
            <FeatureAgentActivityStream
              agentId={agentId}
              events={activityEvents}
              isActive={isActive}
              compact
            />
          )}

          {tile.messages.map((m, idx) => {
            const kind = normalizeMessageType(m.type);
            return (
              <div key={`${m.timestamp}-${idx}`} className={`fa-tile__msg fa-tile__msg--${kind}`}>
                <div className="fa-tile__msg-head">
                  <span className="fa-tile__msg-type">{m.type}</span>
                  <span className="fa-tile__msg-time">{formatTime(m.timestamp)}</span>
                </div>
                <div className="fa-tile__msg-body">{m.content}</div>
              </div>
            );
          })}
        </div>

        <div className="fa-tile__footer">
          <div className="fa-tile__progress" aria-label="Progress">
            <div className="fa-tile__progress-fill" style={{ width: `${Math.max(0, Math.min(100, tile.progress ?? 0))}%` }} />
          </div>
          <div className="fa-tile__phase">
            {tile.currentActivity ? tile.currentActivity : 'Stream connected'}
          </div>

          {/* Escalation Progress Indicator */}
          {typeof tile.escalationLevel === 'number' && tile.escalationLevel > 0 && (
            <div className="fa-tile__escalation">
              <span className="fa-tile__escalation-badge" data-level={tile.escalationLevel}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M6 1v6M6 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>
                  Level {tile.escalationLevel}{tile.escalationAttempt ? ` · Attempt ${tile.escalationAttempt}` : ''}
                </span>
              </span>
              <span className="fa-tile__escalation-label">Error Recovery</span>
            </div>
          )}

          {/* See Feature In Browser button when complete */}
          {tile.status === 'complete' && (
            <button
              className="fa-tile__preview-btn"
              onClick={() => setShowPreviewWindow(true)}
            >
              {svgEye()}
              <span>See Feature In Browser</span>
            </button>
          )}
        </div>
      </div>

      {/* Ghost Mode Config Popout */}
      {showGhostModeConfig && (
        <GhostModeConfig
          agentId={agentId}
          currentConfig={runningAgent?.ghostModeConfig || null}
          onSave={handleGhostModeSave}
          onClose={() => setShowGhostModeConfig(false)}
        />
      )}

      {/* Ghost Mode Active Badge */}
      {runningAgent?.ghostModeEnabled && (
        <div className="fa-tile__ghost-badge">
          {svgGhost()}
          <span>Ghost Mode Active</span>
        </div>
      )}

      {/* Feature Preview Window */}
      {showPreviewWindow && tile?.sandboxUrl && (
        <FeaturePreviewWindow
          agentId={agentId}
          featureName={headerMeta.name}
          sandboxUrl={tile.sandboxUrl}
          onAccept={() => {
            addMessage(agentId, {
              type: 'result',
              content: 'Feature branch merged successfully into main! Your changes are now live.',
              timestamp: Date.now(),
              metadata: { event: 'merge_complete' },
            });
            setTileStatus(agentId, 'complete');
          }}
          onClose={() => setShowPreviewWindow(false)}
        />
      )}
      {showPreviewWindow && !tile?.sandboxUrl && (
        <div className="fa-tile__preview-loading">
          <div className="fa-tile__preview-loading-content">
            <div className="fa-tile__preview-loading-spinner" />
            <span>Initializing preview sandbox...</span>
            <button
              type="button"
              className="fa-tile__preview-loading-close"
              onClick={() => setShowPreviewWindow(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}


