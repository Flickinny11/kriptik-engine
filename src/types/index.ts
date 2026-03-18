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

// Engine handle returned by initEngine
export interface EngineHandle {
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  terminate: () => Promise<void>;
  sendDirective: (text: string) => Promise<void>;
}
