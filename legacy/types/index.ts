import type { InferSelectModel } from 'drizzle-orm';
import type { brainNodes, brainEdges, agentSessions, brainActivityLog } from '../brain/schema.js';

export type {
  NodeType,
  EdgeType,
  NodeStatus,
  AgentStatus,
  ActivityType,
} from '../brain/schema.js';

// Inferred row types from Drizzle schema
export type BrainNode = InferSelectModel<typeof brainNodes>;
export type BrainEdge = InferSelectModel<typeof brainEdges>;
export type AgentSession = InferSelectModel<typeof agentSessions>;
export type ActivityLogEntry = InferSelectModel<typeof brainActivityLog>;

// Node with its edges attached
export interface BrainNodeWithEdges extends BrainNode {
  outgoing: BrainEdge[];
  incoming: BrainEdge[];
}

// Semantic search result
export interface SemanticSearchResult {
  node: BrainNode;
  score: number;
}

// Options for writeNode
export interface WriteNodeOptions {
  parentNodeId?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
  status?: BrainNode['status'];
}

// Options for semantic query
export interface QueryOptions {
  limit?: number;
  nodeTypes?: BrainNode['nodeType'][];
  minConfidence?: number;
}

// Brain event types emitted by subscribe()
export type BrainEventType = 'node:created' | 'node:updated' | 'node:invalidated' | 'edge:created' | 'activity:logged';

export interface BrainEvent {
  type: BrainEventType;
  projectId: string;
  data: BrainNode | BrainEdge | ActivityLogEntry;
  timestamp: string;
}

// Engine configuration
export interface EngineConfig {
  projectId: string;
  mode: 'builder' | 'fix' | 'import';
  initialContext: unknown;
  anthropicApiKey: string;
  qdrantUrl: string;
  qdrantApiKey?: string;
  hfApiKey?: string;
  modalTokenId?: string;
  modalTokenSecret?: string;
  brainDbPath: string;
  onEvent: (event: EngineEvent) => void;
}

// SSE events for the UI
export interface EngineEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

// --- Experience / Continuous Learning types ---

export interface ExperienceNode {
  id: string;
  projectId: string;
  buildTimestamp: string;
  experienceType: string;
  title: string;
  content: Record<string, unknown>;
  context: {
    frameworks: string[];
    integrations: string[];
    appType: string;
    complexity: string;
    errorCategories: string[];
  };
  strength: number;
  activationCount: number;
  lastActivated: string;
  reinforcements: number;
  contradictions: number;
  sourceNodes: string[];
}

export interface ExperienceQuery {
  semanticSignal?: string;
  domainSignal?: string;
  outcomeSignal?: string;
  intentSignal?: string;
  contextFilters?: {
    frameworks?: string[];
    integrations?: string[];
    appType?: string;
  };
  limit?: number;
  minStrength?: number;
}

export interface BuildOutcome {
  projectId: string;
  success: boolean;
  verificationScore: number;
  userCorrections: number;
  errorsEncountered: number;
  errorsResolved: number;
  totalTokens: number;
  specialistCount: number;
  buildDurationMs: number;
  intentSatisfaction: number;
}

// Engine handle returned by initEngine
export interface EngineHandle {
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  terminate: () => Promise<void>;
  sendDirective: (text: string) => Promise<void>;
}
