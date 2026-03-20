import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';
import { BrainService } from '../brain/brain-service.js';
import { agentSessions } from '../brain/schema.js';
import type { AgentSession, EngineConfig, EngineEvent } from '../types/index.js';
import { buildLeadSystemPrompt } from './prompts/lead.js';
import { buildSpecialistSystemPrompt, type SpecialistConfig, type SpecialistExperience } from './prompts/specialist.js';
import { MODELS, THINKING, CONTEXT } from '../config/index.js';
import { ProviderRouter } from '../providers/router.js';
import type { LLMMessage, LLMContentBlock, LLMTool } from '../providers/types.js';

// --- Tool definition types ---

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (params: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

export interface ToolContext {
  projectId: string;
  sessionId: string;
  brain: BrainService;
}

// --- Agent state (not a state machine — just bookkeeping) ---

interface AgentHandle {
  sessionId: string;
  role: string;
  model: string;
  abortController: AbortController;
  loopPromise: Promise<void>;
}

// --- Runtime ---

export class AgentRuntime {
  readonly brain: BrainService;
  readonly router: ProviderRouter;
  private agents = new Map<string, AgentHandle>();
  private projectId: string;
  private emitEvent: (event: EngineEvent) => void;
  private toolRegistry = new Map<string, ToolDefinition>();

  // Budget enforcement
  private budgetCapDollars: number | null = null;
  private estimatedSpendDollars = 0;

  constructor(opts: {
    brain: BrainService;
    router: ProviderRouter;
    projectId: string;
    budgetCapDollars?: number;
    onEvent: (event: EngineEvent) => void;
  }) {
    this.brain = opts.brain;
    this.router = opts.router;
    this.projectId = opts.projectId;
    this.budgetCapDollars = opts.budgetCapDollars ?? null;
    this.emitEvent = opts.onEvent;
  }

  /** Check if budget is exceeded. If so, abort all agents. */
  private checkBudget(): boolean {
    if (this.budgetCapDollars === null) return false;
    if (this.estimatedSpendDollars >= this.budgetCapDollars) {
      this.emitEvent({
        type: 'agent:error',
        data: {
          sessionId: 'budget',
          error: `BUDGET CAP REACHED: $${this.estimatedSpendDollars.toFixed(2)} of $${this.budgetCapDollars} limit`,
        },
        timestamp: new Date().toISOString(),
      });
      // Abort all agents
      for (const agent of this.agents.values()) {
        agent.abortController.abort();
      }
      return true;
    }
    return false;
  }

  getEstimatedSpend(): number {
    return this.estimatedSpendDollars;
  }

  // --- Tool registration ---

  registerTool(tool: ToolDefinition): void {
    this.toolRegistry.set(tool.name, tool);
  }

  registerTools(tools: ToolDefinition[]): void {
    for (const t of tools) this.registerTool(t);
  }

  // --- Built-in brain tools that every agent gets ---

  private brainTools(): ToolDefinition[] {
    return [
      {
        name: 'brain_write_node',
        description: 'Write a new node to the Brain knowledge graph. Use this to record discoveries, decisions, constraints, tasks, or any other knowledge.',
        input_schema: {
          type: 'object',
          properties: {
            node_type: {
              type: 'string',
              enum: ['intent', 'constraint', 'discovery', 'artifact', 'decision', 'task', 'status', 'user_directive', 'design_reference', 'api_contract', 'error', 'resolution'],
              description: 'The type of knowledge node to create',
            },
            title: { type: 'string', description: 'Short human-readable title for this node' },
            content: { type: 'object', description: 'Structured content — varies by node type. Include all relevant details.' },
            confidence: { type: 'number', description: 'How confident you are in this information (0-1). Default 1.0' },
            parent_node_id: { type: 'string', description: 'Optional parent node ID for hierarchical organization' },
          },
          required: ['node_type', 'title', 'content'],
        },
        execute: async (params, ctx) => {
          const node = await ctx.brain.writeNode(
            ctx.projectId,
            params.node_type as any,
            params.title as string,
            params.content as Record<string, unknown>,
            ctx.sessionId,
            {
              confidence: params.confidence as number | undefined,
              parentNodeId: params.parent_node_id as string | undefined,
            },
          );
          return { id: node.id, title: node.title, nodeType: node.nodeType };
        },
      },
      {
        name: 'brain_update_node',
        description: 'Update an existing Brain node. Use to refine knowledge, change status, or adjust confidence.',
        input_schema: {
          type: 'object',
          properties: {
            node_id: { type: 'string', description: 'ID of the node to update' },
            title: { type: 'string' },
            content: { type: 'object' },
            confidence: { type: 'number' },
            status: { type: 'string', enum: ['active', 'superseded', 'invalidated', 'completed'] },
          },
          required: ['node_id'],
        },
        execute: async (params, ctx) => {
          const updates: Record<string, unknown> = {};
          if (params.title) updates.title = params.title;
          if (params.content) updates.content = params.content;
          if (params.confidence !== undefined) updates.confidence = params.confidence;
          if (params.status) updates.status = params.status;
          const node = await ctx.brain.updateNode(params.node_id as string, updates as any);
          return { id: node.id, title: node.title, status: node.status };
        },
      },
      {
        name: 'brain_add_edge',
        description: 'Create a relationship between two Brain nodes.',
        input_schema: {
          type: 'object',
          properties: {
            source_id: { type: 'string', description: 'Source node ID' },
            target_id: { type: 'string', description: 'Target node ID' },
            edge_type: {
              type: 'string',
              enum: ['requires', 'conflicts_with', 'implements', 'refines', 'replaces', 'blocks', 'enables', 'discovered_by', 'relates_to'],
            },
          },
          required: ['source_id', 'target_id', 'edge_type'],
        },
        execute: async (params, ctx) => {
          const edge = await ctx.brain.addEdge(
            ctx.projectId,
            params.source_id as string,
            params.target_id as string,
            params.edge_type as any,
            ctx.sessionId,
          );
          return { id: edge.id, edgeType: edge.edgeType };
        },
      },
      {
        name: 'brain_query',
        description: 'Semantic search across the Brain. Ask a natural language question to find relevant knowledge nodes.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Natural language query' },
            node_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional filter by node types',
            },
            limit: { type: 'number', description: 'Max results (default 10)' },
          },
          required: ['query'],
        },
        execute: async (params, ctx) => {
          const results = await ctx.brain.query(ctx.projectId, params.query as string, {
            nodeTypes: params.node_types as any,
            limit: params.limit as number | undefined,
          });
          return results.map((r) => ({
            id: r.node.id,
            type: r.node.nodeType,
            title: r.node.title,
            content: r.node.content,
            confidence: r.node.confidence,
            status: r.node.status,
            score: r.score,
          }));
        },
      },
      {
        name: 'brain_get_nodes_by_type',
        description: 'Get all Brain nodes of a specific type. Useful for reading all intents, tasks, conflicts, etc.',
        input_schema: {
          type: 'object',
          properties: {
            node_type: {
              type: 'string',
              enum: ['intent', 'constraint', 'discovery', 'artifact', 'decision', 'task', 'status', 'user_directive', 'design_reference', 'api_contract', 'error', 'resolution'],
            },
            status: { type: 'string', enum: ['active', 'superseded', 'invalidated', 'completed'] },
          },
          required: ['node_type'],
        },
        execute: async (params, ctx) => {
          const nodes = ctx.brain.getNodesByType(
            ctx.projectId,
            params.node_type as any,
            params.status as any,
          );
          return nodes.map((n) => ({
            id: n.id,
            title: n.title,
            content: n.content,
            confidence: n.confidence,
            status: n.status,
            createdBy: n.createdBy,
          }));
        },
      },
      {
        name: 'brain_get_node',
        description: 'Get a specific Brain node by ID, including its edges.',
        input_schema: {
          type: 'object',
          properties: {
            node_id: { type: 'string' },
          },
          required: ['node_id'],
        },
        execute: async (params, ctx) => {
          const node = ctx.brain.getNode(params.node_id as string);
          if (!node) return { error: 'Node not found' };
          return {
            id: node.id,
            type: node.nodeType,
            title: node.title,
            content: node.content,
            confidence: node.confidence,
            status: node.status,
            outgoing: node.outgoing.map((e) => ({ target: e.targetNodeId, type: e.edgeType })),
            incoming: node.incoming.map((e) => ({ source: e.sourceNodeId, type: e.edgeType })),
          };
        },
      },
      {
        name: 'brain_get_conflicts',
        description: 'Get all conflict relationships in the Brain. Returns pairs of nodes that conflict with each other.',
        input_schema: { type: 'object', properties: {} },
        execute: async (_params, ctx) => {
          const conflicts = ctx.brain.getConflicts(ctx.projectId);
          return conflicts.map((c) => ({
            source: { id: c.source.id, title: c.source.title },
            target: { id: c.target.id, title: c.target.title },
          }));
        },
      },
      {
        name: 'brain_invalidate_node',
        description: 'Mark a Brain node as invalidated with a reason. Creates a resolution node and removes the original from semantic search.',
        input_schema: {
          type: 'object',
          properties: {
            node_id: { type: 'string' },
            reason: { type: 'string', description: 'Why this node is being invalidated' },
          },
          required: ['node_id', 'reason'],
        },
        execute: async (params, ctx) => {
          const node = await ctx.brain.invalidateNode(
            params.node_id as string,
            params.reason as string,
            ctx.sessionId,
          );
          return { id: node.id, status: node.status };
        },
      },
    ];
  }

  // --- Lead-only tools ---

  private leadTools(): ToolDefinition[] {
    return [
      {
        name: 'spawn_specialist',
        description: 'Spawn a new specialist agent to work on a specific domain. The specialist will run autonomously, reading from and writing to the Brain.',
        input_schema: {
          type: 'object',
          properties: {
            role: { type: 'string', description: 'Descriptive role for this specialist (e.g., "video-pipeline", "ui-components", "auth-system")' },
            domain_description: { type: 'string', description: 'Detailed description of what this specialist should work on, including relevant context from the Brain.' },
            tools: {
              type: 'array',
              items: { type: 'string' },
              description: `Names of additional tools this specialist should have access to (beyond brain tools). Available tools: ${[...this.toolRegistry.keys()].join(', ')}. If omitted or empty, ALL registered tools are given.`,
            },
            model: { type: 'string', description: `Model to use. Default: ${MODELS.SPECIALIST_DEFAULT}` },
          },
          required: ['role', 'domain_description'],
        },
        execute: async (params, ctx) => {
          // Pre-flight nudge: warn (don't block) if brain isn't prepared
          const warnings: string[] = [];
          const intentNodes = this.brain.getNodesByType(this.projectId, 'intent');
          const designRefNodes = this.brain.getNodesByType(this.projectId, 'design_reference');
          if (intentNodes.length === 0) {
            warnings.push('No intent nodes in brain — consider running analyze_intent first');
          }
          if (designRefNodes.length === 0) {
            warnings.push('No design_reference nodes in brain — consider running load_design_references first');
          }

          const session = await this.spawnSpecialist({
            role: params.role as string,
            domainDescription: params.domain_description as string,
            toolNames: (params.tools as string[] | undefined) ?? [],
            model: (params.model as string | undefined) ?? MODELS.SPECIALIST_DEFAULT,
            spawnedBy: ctx.sessionId,
          });

          const result: Record<string, unknown> = {
            sessionId: session.id,
            role: session.agentRole,
            status: session.status,
          };
          if (warnings.length > 0) {
            result.warning = `Brain preparation note: ${warnings.join('. ')}. Specialists produce better results when the brain has context.`;
          }
          return result;
        },
      },
      {
        name: 'terminate_specialist',
        description: 'Gracefully terminate a specialist agent. Its context will be compacted and saved to the Brain.',
        input_schema: {
          type: 'object',
          properties: {
            session_id: { type: 'string', description: 'The agent session ID to terminate' },
            reason: { type: 'string', description: 'Why this agent is being terminated' },
          },
          required: ['session_id', 'reason'],
        },
        execute: async (params, _ctx) => {
          await this.terminateAgent(params.session_id as string, params.reason as string);
          return { terminated: params.session_id, reason: params.reason };
        },
      },
      {
        name: 'request_user_input',
        description: 'Ask the user a question. Writes a user_directive node to the Brain requesting input. The user will respond via the UI.',
        input_schema: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'The question to ask the user' },
            context: { type: 'string', description: 'Additional context about why you need this input' },
          },
          required: ['question'],
        },
        execute: async (params, ctx) => {
          const node = await ctx.brain.writeNode(
            ctx.projectId,
            'user_directive',
            `Question: ${params.question}`,
            {
              question: params.question,
              context: params.context,
              awaitingResponse: true,
            },
            ctx.sessionId,
          );
          return { nodeId: node.id, status: 'awaiting_user_response' };
        },
      },
    ];
  }

  // --- Agent session management ---

  private async createSession(
    role: string,
    model: string,
    spawnedBy?: string,
  ): Promise<AgentSession> {
    const id = uuid();
    const timestamp = new Date().toISOString();

    this.brain.db
      .insert(agentSessions)
      .values({
        id,
        projectId: this.projectId,
        agentRole: role,
        agentModel: model,
        status: 'active',
        totalTokensUsed: 0,
        spawnedBy: spawnedBy ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    await this.brain.logActivity(this.projectId, id, 'spawn', { role, model }, null);

    this.emitEvent({
      type: 'agent:spawned',
      data: { sessionId: id, role, model },
      timestamp,
    });

    return this.brain.db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.id, id))
      .get()!;
  }

  private async updateSessionTokens(sessionId: string, tokensUsed: number): Promise<void> {
    const existing = this.brain.db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.id, sessionId))
      .get();
    if (!existing) return;

    this.brain.db
      .update(agentSessions)
      .set({
        totalTokensUsed: existing.totalTokensUsed + tokensUsed,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agentSessions.id, sessionId))
      .run();
  }

  // --- The reasoning loop ---
  // This is the core of the engine. Each agent runs this loop.
  // It is NOT a fixed-iteration loop. The agent decides at each step
  // whether to continue, change approach, or stop.

  private async runReasoningLoop(opts: {
    sessionId: string;
    systemPrompt: string;
    tools: ToolDefinition[];
    model: string;
    abortSignal: AbortSignal;
    maxContextTokens?: number;
  }): Promise<void> {
    const { sessionId, systemPrompt, model, abortSignal } = opts;
    const maxContextTokens = opts.maxContextTokens ?? CONTEXT.MAX_TOKENS;

    // The conversation history for this agent's API calls
    const messages: LLMMessage[] = [];

    // Convert our tool definitions to LLM format
    const llmTools: LLMTool[] = opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    // Build a lookup for tool execution
    const toolMap = new Map(opts.tools.map((t) => [t.name, t]));

    const toolCtx: ToolContext = {
      projectId: this.projectId,
      sessionId,
      brain: this.brain,
    };

    // Estimated token tracking (rough — real count comes from API response)
    let estimatedTokens = 0;

    // Seed the conversation — the API requires at least one user message
    messages.push({
      role: 'user',
      content: 'Begin. Read the Brain for current state and start your work.',
    });

    while (!abortSignal.aborted) {
      try {
        // --- Make the LLM API call via provider router ---
        const response = await this.router.complete({
          model,
          max_tokens: CONTEXT.MAX_OUTPUT_TOKENS,
          system: systemPrompt,
          messages,
          tools: llmTools,
          thinking_budget: THINKING.LEAD_BUDGET,
        });

        // Track token usage and budget
        const inputTokens = response.usage.input_tokens;
        const outputTokens = response.usage.output_tokens;
        const tokensThisTurn = inputTokens + outputTokens;
        estimatedTokens += tokensThisTurn;
        const pricing = this.router.pricing(model);
        if (pricing) {
          this.estimatedSpendDollars +=
            inputTokens * (pricing.inputPer1M / 1_000_000) +
            outputTokens * (pricing.outputPer1M / 1_000_000);
        }
        await this.updateSessionTokens(sessionId, tokensThisTurn);

        // Budget check — abort if cap exceeded
        if (this.checkBudget()) break;

        // --- Process the response ---
        // The response content may contain: thinking blocks, text blocks, tool_use blocks
        const assistantContent = response.content;

        // Emit any text blocks to the UI
        for (const block of assistantContent) {
          if (block.type === 'text') {
            this.emitEvent({
              type: 'agent:text',
              data: { sessionId, text: block.text },
              timestamp: new Date().toISOString(),
            });
          } else if (block.type === 'thinking') {
            this.emitEvent({
              type: 'agent:thinking',
              data: { sessionId, thinking: block.thinking },
              timestamp: new Date().toISOString(),
            });
          }
        }

        // Add assistant's response to conversation
        messages.push({ role: 'assistant', content: assistantContent });

        // --- Handle tool calls ---
        const toolUseBlocks = assistantContent.filter(
          (b) => b.type === 'tool_use',
        );

        if (toolUseBlocks.length > 0) {
          const toolResults: LLMContentBlock[] = [];

          for (const toolUse of toolUseBlocks) {
            const toolName = toolUse.name ?? '';
            const tool = toolMap.get(toolName);

            this.emitEvent({
              type: 'agent:tool_call',
              data: { sessionId, tool: toolName, input: toolUse.input },
              timestamp: new Date().toISOString(),
            });

            await this.brain.logActivity(
              this.projectId,
              sessionId,
              'tool_invoke',
              { tool: toolName, input: toolUse.input },
              null,
            );

            let result: unknown;
            if (tool) {
              try {
                result = await tool.execute(toolUse.input as Record<string, unknown>, toolCtx);
              } catch (err) {
                result = { error: String(err) };
              }
            } else {
              result = { error: `Unknown tool: ${toolName}` };
            }

            this.emitEvent({
              type: 'agent:tool_result',
              data: { sessionId, tool: toolName, result },
              timestamp: new Date().toISOString(),
            });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            });
          }

          // Add tool results to conversation and continue the loop
          messages.push({ role: 'user', content: toolResults });
          continue;
        }

        // --- No tool calls: the agent has finished its turn ---
        // Check stop_reason
        if (response.stop_reason === 'end_turn') {
          // Agent decided to stop. Check if it explicitly said it's done,
          // or if it's a natural pause point.
          // The agent's system prompt instructs it to use brain_write_node
          // with type 'status' to signal completion. We don't enforce this
          // in code — the agent reasons about when to stop.
          break;
        }

        // If we hit max_tokens, the agent's response was truncated.
        // Continue the loop so it can keep going.
        if (response.stop_reason === 'max_tokens') {
          messages.push({
            role: 'user',
            content: 'Your response was truncated due to length. Continue from where you left off.',
          });
          continue;
        }

        // Any other stop reason: end the loop
        break;

      } catch (err) {
        if (abortSignal.aborted) break;

        // Log the error to the brain
        await this.brain.writeNode(
          this.projectId,
          'error',
          `Agent error: ${sessionId}`,
          { error: String(err), sessionId },
          sessionId,
        );

        this.emitEvent({
          type: 'agent:error',
          data: { sessionId, error: String(err) },
          timestamp: new Date().toISOString(),
        });

        // If it's a rate limit, wait and retry
        const errMsg = String(err);
        if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate limit')) {
          await new Promise((r) => setTimeout(r, 30_000));
          continue;
        }

        // For other errors, break the loop
        break;
      }

      // --- Context window management ---
      // If we're approaching the limit, compact and continue
      if (estimatedTokens > maxContextTokens * 0.8) {
        const summary = await this.brain.compact(this.projectId, sessionId);

        this.emitEvent({
          type: 'agent:compacted',
          data: { sessionId, estimatedTokens, summary },
          timestamp: new Date().toISOString(),
        });

        // Reset conversation with compacted context
        messages.length = 0;
        messages.push({
          role: 'user',
          content: `Your previous conversation was compacted due to context length. Here is a summary of your work so far:\n\n${summary}\n\nContinue your work by querying the Brain for current state.`,
        });
        estimatedTokens = 0;
      }
    }

    // --- Agent loop ended ---
    const finalStatus = abortSignal.aborted ? 'failed' : 'completed';
    this.brain.db
      .update(agentSessions)
      .set({
        status: finalStatus,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agentSessions.id, sessionId))
      .run();

    // Compact on exit
    await this.brain.compact(this.projectId, sessionId);

    this.emitEvent({
      type: 'agent:stopped',
      data: { sessionId, status: finalStatus },
      timestamp: new Date().toISOString(),
    });
  }

  // --- Public API ---

  async startLead(config: {
    mode: EngineConfig['mode'];
    initialContext: unknown;
  }): Promise<AgentSession> {
    const model = MODELS.LEAD;
    const session = await this.createSession('lead', model);

    const systemPrompt = buildLeadSystemPrompt({
      projectId: this.projectId,
      mode: config.mode,
      initialContext: config.initialContext,
    });

    const tools = [...this.brainTools(), ...this.leadTools()];

    const abortController = new AbortController();
    const loopPromise = this.runReasoningLoop({
      sessionId: session.id,
      systemPrompt,
      tools,
      model,
      abortSignal: abortController.signal,
    });

    this.agents.set(session.id, {
      sessionId: session.id,
      role: 'lead',
      model,
      abortController,
      loopPromise,
    });

    return session;
  }

  async spawnSpecialist(config: SpecialistConfig & { spawnedBy: string }): Promise<AgentSession> {
    const model = config.model ?? MODELS.SPECIALIST_DEFAULT;
    const session = await this.createSession(config.role, model, config.spawnedBy);

    // Query Brain for experience nodes relevant to this specialist's domain
    let relevantExperiences: SpecialistExperience[] | undefined;
    try {
      const experienceNodes = this.brain.getNodesByType(this.projectId, 'experience');
      if (experienceNodes.length > 0) {
        // Filter to top 5 most relevant using a simple keyword match on domain
        const domainLower = config.domainDescription.toLowerCase();
        const scored = experienceNodes
          .map((node) => {
            const content = node.content as Record<string, unknown>;
            const title = (node.title || '').toLowerCase();
            const frameworks = (content.frameworks as string[]) || [];
            const integrations = (content.integrations as string[]) || [];
            const allTerms = [title, ...frameworks, ...integrations].join(' ');

            // Simple relevance score: count domain keyword overlaps
            const domainWords = domainLower.split(/\s+/).filter((w) => w.length > 3);
            const hits = domainWords.filter((w) => allTerms.includes(w)).length;
            return { node, content, score: hits };
          })
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);

        if (scored.length > 0) {
          relevantExperiences = scored.map((s) => ({
            title: s.node.title.replace('[Past Experience] ', ''),
            content: (s.content.description as Record<string, unknown>) || s.content,
            strength: (s.content.strength as number) || s.node.confidence,
            experienceType: (s.content.experienceType as string) || 'discovery',
          }));
        }
      }
    } catch {
      // Non-blocking — if experience query fails, proceed without it
    }

    const systemPrompt = buildSpecialistSystemPrompt({
      projectId: this.projectId,
      role: config.role,
      domainDescription: config.domainDescription,
      relevantExperiences,
    });

    // Brain tools + requested tools (or ALL registered tools if none specified)
    const tools: ToolDefinition[] = [...this.brainTools()];
    if (config.toolNames.length > 0) {
      for (const name of config.toolNames) {
        const tool = this.toolRegistry.get(name);
        if (tool) tools.push(tool);
      }
    } else {
      tools.push(...this.toolRegistry.values());
    }

    const abortController = new AbortController();
    const loopPromise = this.runReasoningLoop({
      sessionId: session.id,
      systemPrompt,
      tools,
      model,
      abortSignal: abortController.signal,
    });

    this.agents.set(session.id, {
      sessionId: session.id,
      role: config.role,
      model,
      abortController,
      loopPromise,
    });

    return session;
  }

  async terminateAgent(sessionId: string, reason: string): Promise<void> {
    const agent = this.agents.get(sessionId);
    if (!agent) return;

    agent.abortController.abort();

    // Wait for the loop to finish (it checks abortSignal)
    await agent.loopPromise.catch(() => {});

    this.brain.db
      .update(agentSessions)
      .set({
        status: 'completed',
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agentSessions.id, sessionId))
      .run();

    await this.brain.logActivity(
      this.projectId,
      sessionId,
      'decision',
      { action: 'terminated', reason },
      null,
    );

    this.agents.delete(sessionId);
  }

  async pauseAgent(sessionId: string): Promise<void> {
    const agent = this.agents.get(sessionId);
    if (!agent) return;

    agent.abortController.abort();
    await agent.loopPromise.catch(() => {});

    this.brain.db
      .update(agentSessions)
      .set({ status: 'paused', updatedAt: new Date().toISOString() })
      .where(eq(agentSessions.id, sessionId))
      .run();

    this.agents.delete(sessionId);
  }

  async terminateAll(): Promise<void> {
    const promises = [...this.agents.keys()].map((id) => this.terminateAgent(id, 'Engine shutdown'));
    await Promise.allSettled(promises);
  }

  getActiveAgents(): Array<{ sessionId: string; role: string; model: string }> {
    return [...this.agents.values()].map((a) => ({
      sessionId: a.sessionId,
      role: a.role,
      model: a.model,
    }));
  }
}
