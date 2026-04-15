/**
 * types.ts — Re-exports all Prism types from shared-interfaces.
 *
 * Import from here within prism-engine to avoid direct
 * shared-interfaces path references in implementation code.
 */

export type {
  // Engine
  IPrismEngine,
  PrismBuildOptions,
  PrismEngineConfig,
  PrismBuildSession,
  NodeEdit,
  EncryptedCredential,
  ServiceInstance,
  BackendTarget,
  DeploymentTarget,
  // Graph
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
  StateSpec,
  APICallSpec,
  AtlasRegion,
  GraphMetadata,
  // Plan
  AppIntent,
  AppType,
  FeatureSpec,
  VisualStyleSpec,
  ExtractedDesignTokens,
  IntegrationSpec,
  PrismPlan,
  PrismGraphPlan,
  HubPlan,
  ElementPlan,
  SharedComponentPlan,
  DataModelPlan,
  CompetitiveAnalysis,
  CompetitorEntry,
  InferredNeed,
  ServicePlan,
  NavigationEdge,
  // Backend
  BackendContract,
  APIEndpointPlan,
  AuthStrategyPlan,
  // Events
  PrismEventType,
  PrismEvent,
  // Optimization
  OptimizationSession,
  OptimizationReport,
  OptimizationNodeResult,
} from '@kriptik/shared-interfaces';
