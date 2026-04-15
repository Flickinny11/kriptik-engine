/**
 * @kriptik/prism-engine — Prism diffusion engine pipeline orchestration.
 *
 * The Prism engine generates complete applications by:
 * 1. Parsing prompts into structured build plans (knowledge graph)
 * 2. Generating full-page UI images via FLUX.2
 * 3. Segmenting images into elements via SAM 3.1
 * 4. Blasting 100+ parallel code generation tasks via SGLang
 * 5. Verifying via SWE-RM, repairing with contamination-aware protocol
 * 6. Assembling into a PixiJS v8 WebGPU application
 */

// Re-export all types for consumers
export type {
  IPrismEngine,
  PrismBuildOptions,
  PrismEngineConfig,
  PrismBuildSession,
  NodeEdit,
  BackendTarget,
  DeploymentTarget,
  PrismGraph,
  GraphNode,
  GraphEdge,
  Hub,
  HubTransition,
  UIElementType,
  NodeVisualSpec,
  NodeBehaviorSpec,
  TextContentSpec,
  AnimationSpec,
  Interaction,
  DataBinding,
  AtlasRegion,
  GraphMetadata,
  AppIntent,
  AppType,
  FeatureSpec,
  PrismPlan,
  PrismGraphPlan,
  HubPlan,
  ElementPlan,
  SharedComponentPlan,
  BackendContract,
  DataModelPlan,
  APIEndpointPlan,
  AuthStrategyPlan,
  PrismEventType,
  PrismEvent,
  OptimizationSession,
  OptimizationReport,
} from './types.js';

// Planning pipeline — domain knowledge, needs mapping, plan validation
export {
  APP_TYPE_DEPENDENCY_TREES,
  getAppTypeDependencyTree,
  mapInferredNeeds,
  validatePlan,
  validateBackendContract,
} from './planning/index.js';
export type {
  AppTypeDependencyTree,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './planning/index.js';

// Verification pipeline — SWE-RM scoring, contamination-aware repair
export {
  SCORE_PASS,
  SCORE_BORDERLINE,
  routeVerificationScore,
  aggregateVerificationResults,
  shouldEscalate,
  buildRepairSpec,
  validateRepairInput,
  isContaminated,
} from './verification/index.js';
export type {
  VerificationAction,
  NodeVerificationResult,
  VerificationSummary,
  RepairSpec,
  RepairInputValidation,
} from './verification/index.js';

// Code generation pipeline — prompt construction, dispatch, validation
export {
  CODEGEN_SYSTEM_PROMPT,
  buildNodeSpec,
  buildUserMessage,
  buildNeighborContext,
  buildDispatchBatch,
  validateGeneratedCode,
  extractCodeFromResponse,
} from './codegen/index.js';
export type {
  NodeSpec,
  DispatchSpec,
  CodeValidation,
} from './codegen/index.js';

// Backend pipeline — contract generation, convergence gate, deployment
export {
  generateTRPCRouterTypes,
  generateZodSchemas,
  generateContractFiles,
  pathToProcedureName,
  runConvergenceGate,
  buildDeploymentRequest,
  validateDeploymentTarget,
  buildDeploymentManifest,
  getExpectedDeployTime,
} from './backend/index.js';
export type {
  ConvergenceIssue,
  ConvergenceResult,
  BackendEndpoint,
  BackendResult,
  DeploymentConfig,
  DeploymentResult,
  DeploymentManifest,
} from './backend/index.js';

// Assembly pipeline — bundle structure validation and manifest generation
export {
  REQUIRED_BUNDLE_FILES,
  validateBundleStructure,
  buildBundleManifest,
  validateGraphJson,
} from './assembly/index.js';
export type {
  BundleValidation,
  BundleManifest,
} from './assembly/index.js';

// Graph pipeline — construction, atlas packing, tree conversion, shared nodes
export {
  constructGraph,
  matchSegmentsToElements,
  computeGraphMetadata,
} from './graph/index.js';
export type {
  SegmentResult,
  SegmentMatch,
} from './graph/index.js';
export {
  ATLAS_SIZE,
  ATLAS_PADDING,
  MaxRectsPacker,
  validateAtlasRegions,
} from './graph/index.js';
export type {
  RectInput,
  PackedRect,
} from './graph/index.js';
export {
  graphToTree,
  getActiveNodes,
} from './graph/index.js';
export type {
  TreeNode,
} from './graph/index.js';
export {
  reparentSharedNodes,
  getSharedNodes,
  isSharedNode,
} from './graph/index.js';
export type {
  ReparentResult,
} from './graph/index.js';
