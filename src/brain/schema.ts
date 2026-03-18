import { sqliteTable, text, real, integer, index } from 'drizzle-orm/sqlite-core';

// -- Node types stored as text (SQLite has no native enums) --
export const NODE_TYPES = [
  'intent',
  'constraint',
  'discovery',
  'artifact',
  'decision',
  'task',
  'status',
  'user_directive',
  'design_reference',
  'api_contract',
  'error',
  'resolution',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const EDGE_TYPES = [
  'requires',
  'conflicts_with',
  'implements',
  'refines',
  'replaces',
  'blocks',
  'enables',
  'discovered_by',
  'relates_to',
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const NODE_STATUSES = ['active', 'superseded', 'invalidated', 'completed'] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const AGENT_STATUSES = ['active', 'paused', 'completed', 'failed'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const ACTIVITY_TYPES = [
  'read',
  'write',
  'query',
  'spawn',
  'tool_invoke',
  'decision',
  'user_interrupt',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// -- Tables --

export const brainNodes = sqliteTable(
  'brain_nodes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    nodeType: text('node_type').notNull().$type<NodeType>(),
    title: text('title').notNull(),
    content: text('content', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
    confidence: real('confidence').notNull().default(1.0),
    createdBy: text('created_by').notNull(),
    parentNodeId: text('parent_node_id').references((): any => brainNodes.id),
    status: text('status').notNull().$type<NodeStatus>().default('active'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    embeddingId: text('embedding_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_brain_nodes_project').on(table.projectId),
    index('idx_brain_nodes_type').on(table.projectId, table.nodeType),
    index('idx_brain_nodes_status').on(table.projectId, table.status),
  ],
);

export const brainEdges = sqliteTable(
  'brain_edges',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    sourceNodeId: text('source_node_id')
      .notNull()
      .references(() => brainNodes.id),
    targetNodeId: text('target_node_id')
      .notNull()
      .references(() => brainNodes.id),
    edgeType: text('edge_type').notNull().$type<EdgeType>(),
    weight: real('weight').notNull().default(1.0),
    createdBy: text('created_by').notNull(),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_brain_edges_project').on(table.projectId),
    index('idx_brain_edges_source').on(table.sourceNodeId),
    index('idx_brain_edges_target').on(table.targetNodeId),
  ],
);

export const agentSessions = sqliteTable(
  'agent_sessions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    agentRole: text('agent_role').notNull(),
    agentModel: text('agent_model').notNull(),
    status: text('status').notNull().$type<AgentStatus>().default('active'),
    contextSummary: text('context_summary'),
    totalTokensUsed: integer('total_tokens_used').notNull().default(0),
    spawnedBy: text('spawned_by').references((): any => agentSessions.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    completedAt: text('completed_at'),
  },
  (table) => [index('idx_agent_sessions_project').on(table.projectId)],
);

export const brainActivityLog = sqliteTable(
  'brain_activity_log',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    agentSessionId: text('agent_session_id').references(() => agentSessions.id),
    activityType: text('activity_type').notNull().$type<ActivityType>(),
    targetNodeId: text('target_node_id').references(() => brainNodes.id),
    detail: text('detail', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_activity_log_project').on(table.projectId)],
);
