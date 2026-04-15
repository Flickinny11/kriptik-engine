/**
 * usePrismStore — Zustand store for Prism engine pipeline state.
 *
 * Manages plan, graph, pipeline phase, progress, node statuses,
 * and processes SSE events from the Prism build pipeline.
 *
 * All build events arrive via SSE through useEngineEvents, which
 * routes prism_* events to handlePrismEvent (Invariant 5: SSE Only).
 */

import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import type {
  PrismPlan, PrismGraph, GraphNode,
  PrismEvent, PrismEventType,
} from '@kriptik/shared-interfaces';

export type PipelinePhase =
  | 'idle' | 'planning' | 'awaiting_approval' | 'generating'
  | 'deps' | 'codegen' | 'caption_verifying' | 'verifying'
  | 'repairing' | 'assembling' | 'backend' | 'deploying'
  | 'editing' | 'complete' | 'failed';

export interface NodeStatus {
  nodeId: string;
  phase: 'pending' | 'image_ready' | 'caption_verified' | 'generating' | 'verifying' | 'verified' | 'repairing' | 'failed';
  verificationScore: number | null;
  error: string | null;
}

export interface CaptionVerifyResult {
  nodeId: string;
  passed: boolean;
  reason: string | null;
  repairedCaption: string | null;
}

export interface SegmentMask {
  nodeId: string;
  bbox: { x: number; y: number; width: number; height: number };
  maskUrl: string | null;
}

interface PrismState {
  currentPlan: PrismPlan | null;
  currentGraph: PrismGraph | null;
  pipelinePhase: PipelinePhase;
  progress: number;
  generatedImageUrl: string | null;
  segmentationMasks: SegmentMask[] | null;
  nodeStatuses: Record<string, NodeStatus>;
  captionVerifyResults: Record<string, CaptionVerifyResult>;
  previewUrl: string | null;
  buildError: { phase: string; message: string; recoverable: boolean; suggestion: string } | null;

  // Actions
  setPlan: (plan: PrismPlan) => void;
  setGraph: (graph: PrismGraph) => void;
  approvePlan: (planId: string) => Promise<void>;
  rejectPlan: (planId: string, feedback: string) => Promise<void>;
  editNode: (graphId: string, nodeId: string, changes: Record<string, unknown>) => Promise<void>;
  handlePrismEvent: (event: PrismEvent) => void;
  reset: () => void;
}

const initialState = {
  currentPlan: null,
  currentGraph: null,
  pipelinePhase: 'idle' as PipelinePhase,
  progress: 0,
  generatedImageUrl: null,
  segmentationMasks: null,
  nodeStatuses: {},
  captionVerifyResults: {},
  previewUrl: null,
  buildError: null,
};

export const usePrismStore = create<PrismState>((set, get) => ({
  ...initialState,

  setPlan: (plan) => set({ currentPlan: plan, pipelinePhase: 'awaiting_approval' }),

  setGraph: (graph) => {
    const nodeStatuses: Record<string, NodeStatus> = {};
    for (const node of graph.nodes) {
      nodeStatuses[node.id] = {
        nodeId: node.id,
        phase: node.status === 'verified' ? 'verified' : node.status === 'failed' ? 'failed' : 'pending',
        verificationScore: node.verificationScore,
        error: null,
      };
    }
    set({ currentGraph: graph, nodeStatuses });
  },

  approvePlan: async (planId) => {
    set({ pipelinePhase: 'generating', progress: 10 });
    await apiClient.approvePrismPlan(planId);
  },

  rejectPlan: async (planId, feedback) => {
    await apiClient.rejectPrismPlan(planId, feedback);
    set({ pipelinePhase: 'planning', progress: 5 });
  },

  editNode: async (graphId, nodeId, changes) => {
    const { nodeStatuses } = get();
    set({
      nodeStatuses: {
        ...nodeStatuses,
        [nodeId]: { ...nodeStatuses[nodeId], phase: 'generating', error: null },
      },
    });
    await apiClient.editPrismNode(graphId, nodeId, changes);
  },

  handlePrismEvent: (event) => {
    const { nodeStatuses, captionVerifyResults } = get();
    const data = event.data as Record<string, unknown>;

    // Update progress from every event
    const updates: Partial<PrismState> = { progress: event.progress };

    // Map event type to phase/state changes
    const phaseMap: Partial<Record<PrismEventType, PipelinePhase>> = {
      prism_intent_parsed: 'planning',
      prism_plan_generated: 'awaiting_approval',
      prism_plan_approved: 'generating',
      prism_deps_installing: 'deps',
      prism_deps_installed: 'generating',
      prism_image_generating: 'generating',
      prism_codegen_started: 'codegen',
      prism_caption_verify_started: 'caption_verifying',
      prism_caption_verify_complete: 'codegen',
      prism_verification_started: 'verifying',
      prism_repair_started: 'repairing',
      prism_repair_complete: 'verifying',
      prism_assembly_started: 'assembling',
      prism_backend_codegen_started: 'backend',
      prism_deployment_started: 'deploying',
      prism_node_edit_started: 'editing',
      prism_node_edit_codegen: 'editing',
      prism_node_edit_verified: 'editing',
      prism_node_edit_complete: 'complete',
      prism_node_edit_failed: 'failed',
      prism_build_complete: 'complete',
      prism_build_error: 'failed',
    };

    if (phaseMap[event.type]) {
      updates.pipelinePhase = phaseMap[event.type];
    }

    // Handle specific event types
    switch (event.type) {
      case 'prism_plan_generated':
        if (data.plan) {
          updates.currentPlan = data.plan as PrismPlan;
        }
        break;

      case 'prism_image_ready':
        if (data.imageUrl) {
          updates.generatedImageUrl = data.imageUrl as string;
        }
        break;

      case 'prism_segmentation_complete':
        if (data.masks) {
          updates.segmentationMasks = data.masks as SegmentMask[];
        }
        break;

      case 'prism_graph_constructed':
        if (data.graph) {
          const graph = data.graph as PrismGraph;
          const newNodeStatuses: Record<string, NodeStatus> = {};
          for (const node of graph.nodes) {
            newNodeStatuses[node.id] = {
              nodeId: node.id,
              phase: 'pending',
              verificationScore: null,
              error: null,
            };
          }
          updates.currentGraph = graph;
          updates.nodeStatuses = newNodeStatuses;
        }
        break;

      case 'prism_caption_verify_node_result': {
        const nodeId = data.nodeId as string;
        if (nodeId) {
          updates.captionVerifyResults = {
            ...captionVerifyResults,
            [nodeId]: {
              nodeId,
              passed: data.passed as boolean,
              reason: (data.reason as string) ?? null,
              repairedCaption: (data.repairedCaption as string) ?? null,
            },
          };
        }
        break;
      }

      case 'prism_codegen_node_complete': {
        const nodeId = event.nodeId || (data.nodeId as string);
        if (nodeId) {
          updates.nodeStatuses = {
            ...nodeStatuses,
            [nodeId]: {
              ...(nodeStatuses[nodeId] || { nodeId, verificationScore: null, error: null }),
              phase: 'verifying',
            },
          };
        }
        break;
      }

      case 'prism_verification_node_result': {
        const nodeId = event.nodeId || (data.nodeId as string);
        const score = data.score as number;
        if (nodeId) {
          updates.nodeStatuses = {
            ...nodeStatuses,
            [nodeId]: {
              ...(nodeStatuses[nodeId] || { nodeId, error: null }),
              phase: score >= 0.85 ? 'verified' : score >= 0.6 ? 'repairing' : 'failed',
              verificationScore: score,
            },
          };
        }
        break;
      }

      case 'prism_repair_node_regenerated': {
        const nodeId = event.nodeId || (data.nodeId as string);
        if (nodeId) {
          updates.nodeStatuses = {
            ...nodeStatuses,
            [nodeId]: {
              ...(nodeStatuses[nodeId] || { nodeId, verificationScore: null, error: null }),
              phase: 'verifying',
            },
          };
        }
        break;
      }

      case 'prism_repair_escalated': {
        const nodeId = event.nodeId || (data.nodeId as string);
        if (nodeId) {
          updates.nodeStatuses = {
            ...nodeStatuses,
            [nodeId]: {
              ...(nodeStatuses[nodeId] || { nodeId, verificationScore: null }),
              phase: 'repairing',
              error: 'Escalated to frontier model',
            },
          };
        }
        break;
      }

      case 'prism_preview_ready':
        if (data.previewUrl) {
          updates.previewUrl = data.previewUrl as string;
        }
        break;

      case 'prism_node_edit_started': {
        const editNodeId = event.nodeId || (data.nodeId as string);
        if (editNodeId) {
          updates.nodeStatuses = {
            ...nodeStatuses,
            [editNodeId]: {
              ...(nodeStatuses[editNodeId] || { nodeId: editNodeId, verificationScore: null, error: null }),
              phase: 'generating',
            },
          };
        }
        break;
      }

      case 'prism_node_edit_verified': {
        const editNodeId = event.nodeId || (data.nodeId as string);
        const score = data.score as number;
        if (editNodeId) {
          updates.nodeStatuses = {
            ...nodeStatuses,
            [editNodeId]: {
              ...(nodeStatuses[editNodeId] || { nodeId: editNodeId, error: null }),
              phase: (data.passed as boolean) ? 'verified' : 'failed',
              verificationScore: score,
            },
          };
        }
        break;
      }

      case 'prism_node_edit_complete': {
        const editNodeId = event.nodeId || (data.nodeId as string);
        if (editNodeId) {
          updates.nodeStatuses = {
            ...nodeStatuses,
            [editNodeId]: {
              ...(nodeStatuses[editNodeId] || { nodeId: editNodeId, error: null }),
              phase: 'verified',
              verificationScore: (data.score as number) ?? nodeStatuses[editNodeId]?.verificationScore ?? null,
            },
          };
        }
        // Update preview URL if a new version is available
        if (data.version != null) {
          const newVersion = data.version as number;
          const previewBase = get().previewUrl?.replace(/\/\d+\/$/, '') || '';
          if (previewBase) {
            updates.previewUrl = `${previewBase}/${newVersion}/`;
          }
        }
        break;
      }

      case 'prism_node_edit_failed': {
        const editNodeId = event.nodeId || (data.nodeId as string);
        if (editNodeId) {
          updates.nodeStatuses = {
            ...nodeStatuses,
            [editNodeId]: {
              ...(nodeStatuses[editNodeId] || { nodeId: editNodeId, verificationScore: null }),
              phase: 'failed',
              error: (data.reason as string) || 'Edit failed',
            },
          };
        }
        break;
      }

      case 'prism_build_error':
        updates.buildError = {
          phase: (data.phase as string) || event.phase,
          message: (data.message as string) || 'Build failed',
          recoverable: (data.recoverable as boolean) ?? false,
          suggestion: (data.suggestion as string) || '',
        };
        break;
    }

    set(updates);
  },

  reset: () => set(initialState),
}));
