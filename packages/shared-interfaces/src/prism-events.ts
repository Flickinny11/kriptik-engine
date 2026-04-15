/**
 * prism-events.ts — SSE event types for the Prism engine pipeline.
 *
 * All build events flow through the buildEvents table -> GET /api/events/stream.
 * No WebSockets. No polling. SSE only (Invariant 5).
 */

export type PrismEventType =
  // Planning phase
  | 'prism_intent_parsed'
  | 'prism_competitive_analysis_started'
  | 'prism_competitive_analysis_complete'
  | 'prism_needs_inferred'
  | 'prism_plan_generated'
  | 'prism_plan_approved'
  | 'prism_plan_rejected'
  // Dependency pre-installation
  | 'prism_deps_installing'
  | 'prism_deps_installed'
  // Image generation phase
  | 'prism_image_generating'
  | 'prism_image_ready'
  | 'prism_segmentation_started'
  | 'prism_segmentation_complete'
  // Graph construction
  | 'prism_graph_constructed'
  // Caption verification
  | 'prism_caption_verify_started'
  | 'prism_caption_verify_node_result'
  | 'prism_caption_verify_complete'
  // Atlas packing
  | 'prism_atlas_packed'
  // Code generation phase
  | 'prism_codegen_started'
  | 'prism_codegen_node_complete'
  | 'prism_codegen_batch_complete'
  // Verification phase
  | 'prism_verification_started'
  | 'prism_verification_node_result'
  | 'prism_verification_complete'
  // Repair phase
  | 'prism_repair_started'
  | 'prism_repair_node_regenerated'
  | 'prism_repair_escalated'
  | 'prism_repair_complete'
  // Assembly phase
  | 'prism_assembly_started'
  | 'prism_assembly_complete'
  // Backend phase
  | 'prism_backend_contract_generated'
  | 'prism_backend_codegen_started'
  | 'prism_backend_codegen_complete'
  | 'prism_convergence_gate_result'
  // Deployment
  | 'prism_deployment_started'
  | 'prism_deployment_complete'
  | 'prism_preview_ready'
  // Optimization
  | 'prism_optimization_started'
  | 'prism_optimization_node_improved'
  | 'prism_optimization_complete'
  // Editing (single-node mutation)
  | 'prism_node_edit_started'
  | 'prism_node_edit_codegen'
  | 'prism_node_edit_verified'
  | 'prism_node_edit_complete'
  | 'prism_node_edit_failed'
  // Lifecycle
  | 'prism_build_progress'
  | 'prism_build_complete'
  | 'prism_build_error';

export interface PrismEvent {
  type: PrismEventType;
  data: Record<string, unknown>;
  timestamp: string;
  phase: 'planning' | 'deps' | 'generation' | 'graph' | 'caption_verify'
    | 'codegen' | 'verification' | 'repair'
    | 'assembly' | 'backend' | 'deployment' | 'optimization' | 'editing';
  progress: number;
  nodeId?: string;
  hubId?: string;
}
