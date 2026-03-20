/**
 * SSE Emitter — translates Brain activity and agent events into
 * structured events for the frontend UI.
 *
 * Subscribes to:
 * - Brain events (node created, updated, invalidated, edge created)
 * - Agent runtime events (thinking, tool calls, text, errors)
 *
 * Emits structured events that KripTik's AgentStreamingChat component
 * can render. Uses a local EventEmitter for now — this will connect
 * to the Modal webhook pipeline when integrated with KripTik's backend.
 */

import { EventEmitter } from 'node:events';
import type { BrainService } from '../brain/brain-service.js';
import type { BrainEvent, BrainNode, EngineEvent } from '../types/index.js';

// --- SSE event types the frontend understands ---

export type SSEEventType =
  | 'agent_thinking'
  | 'agent_tool_call'
  | 'agent_tool_result'
  | 'agent_text'
  | 'agent_discovery'
  | 'agent_file_write'
  | 'agent_error'
  | 'agent_spawned'
  | 'agent_stopped'
  | 'agent_compacted'
  | 'brain_node_created'
  | 'brain_node_updated'
  | 'brain_edge_created'
  | 'brain_conflict_detected'
  | 'user_input_requested'
  | 'build_progress'
  | 'build_complete'
  | 'experience_extracted'
  | 'experience_metrics';

export interface SSEEvent {
  id: string;
  type: SSEEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

// --- Emitter ---

export class SSEEmitter extends EventEmitter {
  private projectId: string;
  private unsubBrain: (() => void) | null = null;
  private eventCounter = 0;

  constructor(projectId: string) {
    super();
    this.projectId = projectId;
  }

  /** Subscribe to Brain events and translate them to SSE events. */
  connectBrain(brain: BrainService): void {
    this.unsubBrain = brain.subscribe(this.projectId, (event) => {
      this.handleBrainEvent(event);
    });
  }

  /** Process an EngineEvent from the AgentRuntime and emit as SSE. */
  handleEngineEvent(event: EngineEvent): void {
    switch (event.type) {
      case 'agent:thinking': {
        const d = event.data as { sessionId: string; thinking: string };
        this.emit_sse('agent_thinking', {
          sessionId: d.sessionId,
          thinking: d.thinking.slice(0, 500), // truncate for UI
        });
        break;
      }

      case 'agent:text': {
        const d = event.data as { sessionId: string; text: string };
        this.emit_sse('agent_text', {
          sessionId: d.sessionId,
          text: d.text,
        });
        break;
      }

      case 'agent:tool_call': {
        const d = event.data as { sessionId: string; tool: string; input: unknown };
        const sseType = this.classifyToolCall(d.tool, d.input);
        this.emit_sse(sseType, {
          sessionId: d.sessionId,
          tool: d.tool,
          input: d.input,
        });
        break;
      }

      case 'agent:tool_result': {
        const d = event.data as { sessionId: string; tool: string; result: unknown };
        this.emit_sse('agent_tool_result', {
          sessionId: d.sessionId,
          tool: d.tool,
          result: d.result,
        });
        break;
      }

      case 'agent:error': {
        const d = event.data as { sessionId: string; error: string };
        this.emit_sse('agent_error', {
          sessionId: d.sessionId,
          error: d.error,
        });
        break;
      }

      case 'agent:spawned': {
        const d = event.data as { sessionId: string; role: string; model: string };
        this.emit_sse('agent_spawned', d);
        break;
      }

      case 'agent:stopped': {
        const d = event.data as { sessionId: string; status: string };
        this.emit_sse('agent_stopped', d);
        break;
      }

      case 'agent:compacted': {
        const d = event.data as { sessionId: string; estimatedTokens: number; summary: string };
        this.emit_sse('agent_compacted', {
          sessionId: d.sessionId,
          estimatedTokens: d.estimatedTokens,
        });
        break;
      }

      case 'experience_extracted': {
        const d = event.data as Record<string, unknown>;
        this.emit_sse('experience_extracted', d);
        break;
      }

      case 'experience_metrics': {
        const d = event.data as Record<string, unknown>;
        this.emit_sse('experience_metrics', d);
        break;
      }
    }
  }

  /** Classify a tool call into a more specific SSE event type. */
  private classifyToolCall(toolName: string, input: unknown): SSEEventType {
    if (toolName === 'write_file') return 'agent_file_write';
    if (toolName === 'brain_write_node') {
      const inp = input as Record<string, unknown>;
      if (inp.node_type === 'discovery') return 'agent_discovery';
    }
    return 'agent_tool_call';
  }

  /** Translate Brain events into SSE events. */
  private handleBrainEvent(event: BrainEvent): void {
    switch (event.type) {
      case 'node:created': {
        const node = event.data as BrainNode;

        // Special cases based on node type
        if (node.nodeType === 'user_directive') {
          const content = node.content as Record<string, unknown>;
          if (content.awaitingResponse) {
            this.emit_sse('user_input_requested', {
              nodeId: node.id,
              question: content.question,
              context: content.context,
            });
            return;
          }
        }

        if (node.nodeType === 'status') {
          const content = node.content as Record<string, unknown>;
          if (node.title.toLowerCase().includes('complete')) {
            this.emit_sse('build_complete', {
              nodeId: node.id,
              title: node.title,
              content,
            });
            return;
          }
          this.emit_sse('build_progress', {
            nodeId: node.id,
            title: node.title,
            content,
          });
          return;
        }

        if (node.nodeType === 'error') {
          this.emit_sse('agent_error', {
            nodeId: node.id,
            title: node.title,
            content: node.content,
          });
          return;
        }

        this.emit_sse('brain_node_created', {
          nodeId: node.id,
          nodeType: node.nodeType,
          title: node.title,
          createdBy: node.createdBy,
        });
        break;
      }

      case 'node:updated': {
        const node = event.data as BrainNode;
        this.emit_sse('brain_node_updated', {
          nodeId: node.id,
          nodeType: node.nodeType,
          title: node.title,
          status: node.status,
        });
        break;
      }

      case 'edge:created': {
        const edge = event.data as { edgeType?: string; sourceNodeId?: string; targetNodeId?: string };
        if (edge.edgeType === 'conflicts_with') {
          this.emit_sse('brain_conflict_detected', {
            source: edge.sourceNodeId,
            target: edge.targetNodeId,
          });
        } else {
          this.emit_sse('brain_edge_created', edge);
        }
        break;
      }
    }
  }

  /** Core emit: wraps data into SSEEvent and emits on 'sse' channel. */
  private emit_sse(type: SSEEventType, data: Record<string, unknown>): void {
    const event: SSEEvent = {
      id: String(++this.eventCounter),
      type,
      data,
      timestamp: new Date().toISOString(),
    };
    this.emit('sse', event);
  }

  /** Register a listener for SSE events. */
  onSSE(callback: (event: SSEEvent) => void): () => void {
    this.on('sse', callback);
    return () => this.off('sse', callback);
  }

  /** Clean up subscriptions. */
  disconnect(): void {
    if (this.unsubBrain) {
      this.unsubBrain();
      this.unsubBrain = null;
    }
    this.removeAllListeners();
  }
}
