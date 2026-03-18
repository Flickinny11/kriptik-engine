import { EventEmitter } from 'node:events';
import { v4 as uuid } from 'uuid';
import { eq, and, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import {
  brainNodes,
  brainEdges,
  agentSessions,
  brainActivityLog,
  type NodeType,
  type EdgeType,
  type NodeStatus,
  type ActivityType,
} from './schema.js';
import type { EmbeddingService } from './embeddings.js';
import type {
  BrainNode,
  BrainEdge,
  BrainNodeWithEdges,
  SemanticSearchResult,
  WriteNodeOptions,
  QueryOptions,
  BrainEvent,
  BrainEventType,
} from '../types/index.js';

type DrizzleDB = ReturnType<typeof drizzle>;

function now(): string {
  return new Date().toISOString();
}

function collectionName(projectId: string): string {
  return `brain_${projectId.replace(/-/g, '_')}`;
}

export class BrainService extends EventEmitter {
  readonly db: DrizzleDB;
  private embeddings: EmbeddingService;
  private sqlite: Database.Database;

  constructor(opts: { dbPath: string; embeddings: EmbeddingService }) {
    super();
    this.sqlite = new Database(opts.dbPath);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.db = drizzle(this.sqlite);
    this.embeddings = opts.embeddings;
    this.migrate();
  }

  /** Create tables if they don't exist. Drizzle push for SQLite. */
  private migrate(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS brain_nodes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        node_type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        created_by TEXT NOT NULL,
        parent_node_id TEXT REFERENCES brain_nodes(id),
        status TEXT NOT NULL DEFAULT 'active',
        metadata TEXT,
        embedding_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_brain_nodes_project ON brain_nodes(project_id);
      CREATE INDEX IF NOT EXISTS idx_brain_nodes_type ON brain_nodes(project_id, node_type);
      CREATE INDEX IF NOT EXISTS idx_brain_nodes_status ON brain_nodes(project_id, status);

      CREATE TABLE IF NOT EXISTS brain_edges (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        source_node_id TEXT NOT NULL REFERENCES brain_nodes(id),
        target_node_id TEXT NOT NULL REFERENCES brain_nodes(id),
        edge_type TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1.0,
        created_by TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_brain_edges_project ON brain_edges(project_id);
      CREATE INDEX IF NOT EXISTS idx_brain_edges_source ON brain_edges(source_node_id);
      CREATE INDEX IF NOT EXISTS idx_brain_edges_target ON brain_edges(target_node_id);

      CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_role TEXT NOT NULL,
        agent_model TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        context_summary TEXT,
        total_tokens_used INTEGER NOT NULL DEFAULT 0,
        spawned_by TEXT REFERENCES agent_sessions(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_project ON agent_sessions(project_id);

      CREATE TABLE IF NOT EXISTS brain_activity_log (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_session_id TEXT REFERENCES agent_sessions(id),
        activity_type TEXT NOT NULL,
        target_node_id TEXT REFERENCES brain_nodes(id),
        detail TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_activity_log_project ON brain_activity_log(project_id);
    `);
  }

  // --- Emit helpers ---

  private emitBrainEvent(type: BrainEventType, projectId: string, data: unknown): void {
    const event: BrainEvent = {
      type,
      projectId,
      data: data as BrainEvent['data'],
      timestamp: now(),
    };
    this.emit('brain:event', event);
    this.emit(type, event);
  }

  // --- Node CRUD ---

  async writeNode(
    projectId: string,
    nodeType: NodeType,
    title: string,
    content: Record<string, unknown>,
    createdBy: string,
    opts: WriteNodeOptions = {},
  ): Promise<BrainNode> {
    const id = uuid();
    const timestamp = now();

    // Generate embedding
    const embeddingText = `${title} ${JSON.stringify(content)}`;
    const vector = await this.embeddings.generateEmbedding(embeddingText);
    const embeddingId = id;
    await this.embeddings.upsertVector(collectionName(projectId), embeddingId, vector, {
      nodeId: id,
      projectId,
      nodeType,
    });

    const node: typeof brainNodes.$inferInsert = {
      id,
      projectId,
      nodeType,
      title,
      content,
      confidence: opts.confidence ?? 1.0,
      createdBy,
      parentNodeId: opts.parentNodeId ?? null,
      status: opts.status ?? 'active',
      metadata: opts.metadata ?? null,
      embeddingId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.insert(brainNodes).values(node).run();

    const inserted = this.db
      .select()
      .from(brainNodes)
      .where(eq(brainNodes.id, id))
      .get()!;

    await this.logActivity(projectId, null, 'write', { action: 'create_node', nodeType, title }, id);
    this.emitBrainEvent('node:created', projectId, inserted);

    return inserted;
  }

  async updateNode(
    nodeId: string,
    updates: Partial<Pick<BrainNode, 'title' | 'content' | 'confidence' | 'status' | 'metadata'>>,
  ): Promise<BrainNode> {
    const existing = this.db.select().from(brainNodes).where(eq(brainNodes.id, nodeId)).get();
    if (!existing) throw new Error(`Node ${nodeId} not found`);

    const timestamp = now();
    this.db
      .update(brainNodes)
      .set({ ...updates, updatedAt: timestamp })
      .where(eq(brainNodes.id, nodeId))
      .run();

    // Re-generate embedding if content or title changed
    if (updates.title || updates.content) {
      const title = updates.title ?? existing.title;
      const content = updates.content ?? existing.content;
      const embeddingText = `${title} ${JSON.stringify(content)}`;
      const vector = await this.embeddings.generateEmbedding(embeddingText);
      await this.embeddings.upsertVector(
        collectionName(existing.projectId),
        existing.embeddingId ?? nodeId,
        vector,
        { nodeId, projectId: existing.projectId, nodeType: existing.nodeType },
      );
    }

    const updated = this.db.select().from(brainNodes).where(eq(brainNodes.id, nodeId)).get()!;

    await this.logActivity(existing.projectId, null, 'write', { action: 'update_node', updates }, nodeId);
    this.emitBrainEvent('node:updated', existing.projectId, updated);

    return updated;
  }

  async invalidateNode(
    nodeId: string,
    reason: string,
    invalidatedBy: string,
  ): Promise<BrainNode> {
    const node = this.db.select().from(brainNodes).where(eq(brainNodes.id, nodeId)).get();
    if (!node) throw new Error(`Node ${nodeId} not found`);

    // Create a resolution node explaining the invalidation
    const resolutionNode = await this.writeNode(
      node.projectId,
      'resolution',
      `Invalidated: ${node.title}`,
      { reason, originalNodeId: nodeId },
      invalidatedBy,
    );

    // Mark original as invalidated
    this.db
      .update(brainNodes)
      .set({ status: 'invalidated' as NodeStatus, updatedAt: now() })
      .where(eq(brainNodes.id, nodeId))
      .run();

    // Create edge linking the invalidation
    await this.addEdge(node.projectId, resolutionNode.id, nodeId, 'replaces', invalidatedBy);

    // Remove from vector store
    if (node.embeddingId) {
      await this.embeddings.deleteVector(collectionName(node.projectId), node.embeddingId);
    }

    const updated = this.db.select().from(brainNodes).where(eq(brainNodes.id, nodeId)).get()!;
    this.emitBrainEvent('node:invalidated', node.projectId, updated);

    return updated;
  }

  // --- Edge CRUD ---

  async addEdge(
    projectId: string,
    sourceId: string,
    targetId: string,
    edgeType: EdgeType,
    createdBy: string,
    metadata?: Record<string, unknown>,
  ): Promise<BrainEdge> {
    const id = uuid();
    const timestamp = now();

    const edge: typeof brainEdges.$inferInsert = {
      id,
      projectId,
      sourceNodeId: sourceId,
      targetNodeId: targetId,
      edgeType,
      weight: 1.0,
      createdBy,
      metadata: metadata ?? null,
      createdAt: timestamp,
    };

    this.db.insert(brainEdges).values(edge).run();
    const inserted = this.db.select().from(brainEdges).where(eq(brainEdges.id, id)).get()!;

    await this.logActivity(projectId, null, 'write', { action: 'create_edge', edgeType, sourceId, targetId }, null);
    this.emitBrainEvent('edge:created', projectId, inserted);

    return inserted;
  }

  // --- Queries ---

  getNode(nodeId: string): BrainNodeWithEdges | null {
    const node = this.db.select().from(brainNodes).where(eq(brainNodes.id, nodeId)).get();
    if (!node) return null;

    const outgoing = this.db
      .select()
      .from(brainEdges)
      .where(eq(brainEdges.sourceNodeId, nodeId))
      .all();
    const incoming = this.db
      .select()
      .from(brainEdges)
      .where(eq(brainEdges.targetNodeId, nodeId))
      .all();

    return { ...node, outgoing, incoming };
  }

  getNodesByType(
    projectId: string,
    nodeType: NodeType,
    status?: NodeStatus,
  ): BrainNode[] {
    const conditions = [
      eq(brainNodes.projectId, projectId),
      eq(brainNodes.nodeType, nodeType),
    ];
    if (status) conditions.push(eq(brainNodes.status, status));

    return this.db
      .select()
      .from(brainNodes)
      .where(and(...conditions))
      .all();
  }

  async query(
    projectId: string,
    naturalLanguageQuery: string,
    opts: QueryOptions = {},
  ): Promise<SemanticSearchResult[]> {
    const limit = opts.limit ?? 10;

    // Embed the query
    const queryVector = await this.embeddings.generateEmbedding(naturalLanguageQuery);

    // Build Qdrant filter
    const mustConditions: any[] = [
      { key: 'projectId', match: { value: projectId } },
    ];
    if (opts.nodeTypes?.length) {
      mustConditions.push({
        key: 'nodeType',
        match: { any: opts.nodeTypes },
      });
    }

    // Search Qdrant
    const results = await this.embeddings.searchVectors(
      collectionName(projectId),
      queryVector,
      { must: mustConditions },
      limit,
    );

    // Fetch full nodes from SQLite
    const nodeIds = results.map((r) => r.payload.nodeId as string);
    if (nodeIds.length === 0) return [];

    const nodes = this.db
      .select()
      .from(brainNodes)
      .where(inArray(brainNodes.id, nodeIds))
      .all();

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const searchResults: SemanticSearchResult[] = [];
    for (const r of results) {
      const node = nodeMap.get(r.payload.nodeId as string);
      if (!node) continue;
      if (opts.minConfidence && node.confidence < opts.minConfidence) continue;
      searchResults.push({ node, score: r.score });
    }

    await this.logActivity(projectId, null, 'query', {
      query: naturalLanguageQuery,
      resultCount: searchResults.length,
    }, null);

    return searchResults;
  }

  getRelated(
    nodeId: string,
    edgeTypes?: EdgeType[],
    depth: number = 1,
  ): BrainNodeWithEdges[] {
    const visited = new Set<string>();
    const result: BrainNodeWithEdges[] = [];

    const traverse = (currentId: string, currentDepth: number): void => {
      if (currentDepth > depth || visited.has(currentId)) return;
      visited.add(currentId);

      // Get outgoing edges from this node
      let outgoing = this.db
        .select()
        .from(brainEdges)
        .where(eq(brainEdges.sourceNodeId, currentId))
        .all();
      // Get incoming edges to this node
      let incoming = this.db
        .select()
        .from(brainEdges)
        .where(eq(brainEdges.targetNodeId, currentId))
        .all();

      if (edgeTypes?.length) {
        outgoing = outgoing.filter((e) => edgeTypes.includes(e.edgeType as EdgeType));
        incoming = incoming.filter((e) => edgeTypes.includes(e.edgeType as EdgeType));
      }

      // Get all connected node IDs
      const connectedIds = [
        ...outgoing.map((e) => e.targetNodeId),
        ...incoming.map((e) => e.sourceNodeId),
      ];

      for (const connId of connectedIds) {
        if (visited.has(connId)) continue;
        const node = this.getNode(connId);
        if (node) {
          result.push(node);
          traverse(connId, currentDepth + 1);
        }
      }
    };

    traverse(nodeId, 0);
    return result;
  }

  getConflicts(projectId: string): Array<{ source: BrainNode; target: BrainNode; edge: BrainEdge }> {
    const conflictEdges = this.db
      .select()
      .from(brainEdges)
      .where(
        and(
          eq(brainEdges.projectId, projectId),
          eq(brainEdges.edgeType, 'conflicts_with'),
        ),
      )
      .all();

    const conflicts: Array<{ source: BrainNode; target: BrainNode; edge: BrainEdge }> = [];
    for (const edge of conflictEdges) {
      const source = this.db.select().from(brainNodes).where(eq(brainNodes.id, edge.sourceNodeId)).get();
      const target = this.db.select().from(brainNodes).where(eq(brainNodes.id, edge.targetNodeId)).get();
      if (source && target) {
        conflicts.push({ source, target, edge });
      }
    }
    return conflicts;
  }

  // --- subscribe() via EventEmitter ---

  subscribe(
    projectId: string,
    callback: (event: BrainEvent) => void,
  ): () => void {
    const handler = (event: BrainEvent) => {
      if (event.projectId === projectId) callback(event);
    };
    this.on('brain:event', handler);
    return () => this.off('brain:event', handler);
  }

  // --- Activity logging ---

  async logActivity(
    projectId: string,
    agentSessionId: string | null,
    activityType: ActivityType,
    detail: Record<string, unknown>,
    targetNodeId: string | null,
  ): Promise<void> {
    const id = uuid();
    this.db
      .insert(brainActivityLog)
      .values({
        id,
        projectId,
        agentSessionId,
        activityType,
        targetNodeId,
        detail,
        createdAt: now(),
      })
      .run();

    this.emitBrainEvent('activity:logged', projectId, { id, activityType, detail });
  }

  // --- Context compaction ---

  async compact(
    projectId: string,
    agentSessionId: string,
  ): Promise<string> {
    // Gather all nodes this agent created
    const agentNodes = this.db
      .select()
      .from(brainNodes)
      .where(
        and(
          eq(brainNodes.projectId, projectId),
          eq(brainNodes.createdBy, agentSessionId),
        ),
      )
      .all();

    // Build a summary of the agent's contributions
    const summary = agentNodes
      .map((n) => `[${n.nodeType}] ${n.title} (${n.status})`)
      .join('\n');

    // Store the summary on the agent session
    this.db
      .update(agentSessions)
      .set({ contextSummary: summary, updatedAt: now() })
      .where(eq(agentSessions.id, agentSessionId))
      .run();

    return summary;
  }

  // --- Cleanup ---

  close(): void {
    this.sqlite.close();
  }
}
