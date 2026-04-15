/**
 * @kriptik/cortex-engine — the autonomous multi-agent orchestration engine.
 *
 * Implementation is built in Phase A-E sessions,
 * one component per session, against the shared interface contracts.
 */

// Phase A, Step 1 — Agent Harness
export {
  AgentHarness,
  AgentSession,
  TokenMonitor,
  ESAAEmitter,
  getModelConfig,
  OPUS_CONFIG,
  SONNET_CONFIG,
  DEFAULT_ROTATION_WARNING_THRESHOLD,
  DEFAULT_ROTATION_CRITICAL_THRESHOLD,
  EXTENDED_THINKING_BUDGET_TOKENS,
  COMPACTION_MODEL,
  buildSystemPrompt,
  buildInitialMessages,
  buildReinjectionMessages,
} from "./agents/index.js";

export type {
  ModelConfig,
  HarnessEventHandler,
  SessionEventHandler,
  ThresholdEventHandler,
  ESAAEventHandler,
  ConversationMessage,
} from "./agents/index.js";

// Phase A, Step 2 — Git Isolation + Merge Gate
export {
  BranchManager,
  MergeGate,
  BuildRepository,
  checkScope,
} from "./git/index.js";

export type {
  BranchManagerOptions,
  MergeGateOptions,
  BuildRepositoryOptions,
} from "./git/index.js";

// Phase A, Step 3 — Cortex Orchestrator
export {
  DependencyGraph,
  CortexOrchestrator,
} from "./orchestrator/index.js";

// Phase A, Step 4 — Agent Containers
export {
  AgentContainer,
  ContainerManager,
  isPathWithinScope,
  getToolsForRole,
  getTier1ServiceTools,
  DOCUMENTATION_TOOLS,
} from "./containers/index.js";

// Phase A, Step 5 — Architect Agent + Blueprint + Golden Window Builder
export {
  ArchitectAgent,
  BlueprintManager,
  GoldenWindowBuilder,
} from "./architect/index.js";

export type {
  ArchitectAgentConfig,
  BlueprintDecomposition,
} from "./architect/index.js";

// Phase A, Step 6 — Compaction API Integration
export {
  CompactionManager,
  AnchoredStateTracker,
  buildDefaultCompactionConfig,
  BUILD_CONTEXT_SUMMARIZATION_INSTRUCTIONS,
  DEFAULT_COMPACTION_THRESHOLD,
  DEFAULT_MAX_COMPACTIONS_BEFORE_ROTATION,
} from "./compaction/index.js";

// Phase B, Step 7 — Experiential Trail System
export {
  InMemoryVectorStore,
  TextSimilarityEmbeddingProvider,
  TrailStore,
  TrailExtractor,
  TrailRanker,
  Librarian,
} from "./knowledge/index.js";

export type {
  SQLiteDatabase,
  SQLiteStatement,
  LibrarianConfig,
} from "./knowledge/index.js";

// Phase B, Step 8 — Context7 MCP + Documentation Resolver
export {
  Context7Provider,
  DocumentationResolver,
} from "./knowledge/index.js";

export type {
  MCPClient,
  MCPToolResult,
  MCPContentBlock,
  Context7ProviderConfig,
  SkillFileReader,
  WebSearchProvider,
  DocumentationResolverConfig,
} from "./knowledge/index.js";

// Phase B, Step 9 — Threshold Monitoring + Basic Rotation
export {
  EnhancedThresholdMonitor,
  RotationProtocol,
  BasicStateCapture,
} from "./agents/index.js";

export type {
  RotationProtocolConfig,
  BasicStateCaptureConfig,
  ModifiedFilesProvider,
  GoalProgressProvider,
  PeerNegotiationProvider,
  ESAAEventQueryProvider,
} from "./agents/index.js";

// Phase B, Step 10 — Build State Manager + Warm-Up Sequences
export {
  BuildStateManager,
  WarmUpSequenceBuilder,
} from "./state/index.js";

export type {
  BuildStateEventHandler,
  WarmUpSequenceBuilderConfig,
} from "./state/index.js";

// Phase B, Step 11 — Anti-Slop Linter + Merge Gate Check 5
export {
  AntiSlopLinter,
  DEFAULT_SLOP_PATTERNS,
  DEFAULT_SLOP_LINTER_CONFIG,
} from "./verification/index.js";

// Phase C, Step 12 — UX Verification Teams (Navigator + Inspector)
export {
  JourneyTestPlanner,
  NavigatorAgent,
  InspectorAgent,
  UXVerificationTeam,
} from "./verification/index.js";

export type {
  JourneyTestPlannerConfig,
  NavigatorAgentConfig,
  InspectorAgentConfig,
} from "./verification/index.js";

// Phase C, Step 13 — Design Pioneer Agent
export {
  DesignPioneerAgent,
  ExperienceShellBuilder,
  ComponentLibraryBuilder,
  AntiSlopRulesetGenerator,
} from "./design/index.js";

export type {
  ExperienceShellBuilderConfig,
  ComponentLibraryBuilderConfig,
  AntiSlopRulesetGeneratorConfig,
} from "./design/index.js";

// Phase C, Step 14 — Seven-Layer Design Enforcement Stack
export {
  PositiveContextInjector,
  EphemeralGuidanceClassifier,
  RequiredPatternChecker,
  DesignQualityScorer,
  DesignEnforcementStack,
} from "./design/index.js";

// Phase C, Step 15 — Journey Verification, Intent Satisfaction, CVS Coordinator
export {
  JourneyVerificationAgent,
  IntentSatisfactionAgent,
  CVSCoordinator,
} from "./verification/index.js";

export type {
  JourneyVerificationAgentConfig,
  IntentSatisfactionAgentConfig,
  CVSCoordinatorDeps,
} from "./verification/index.js";

// Phase C, Step 16 — Violation Response Protocol
export {
  ViolationDetector,
  ViolationResponseProtocol,
  ReplacementAgentBuilder,
} from "./verification/index.js";

export type {
  ViolationResponseDeps,
  IPeerGraphProvider,
  IAcceptedProposal,
  IBranchArchiver,
  ITrailProvider,
} from "./verification/index.js";

// Phase D, Step 18 — ACE-Style Evolving Playbooks
export {
  PlaybookStore,
  PlaybookExtractor,
  PlaybookEvolver,
  PlaybookApplicator,
} from "./knowledge/index.js";

export type {
  PlaybookApplicatorConfig,
} from "./knowledge/index.js";

// Phase D, Step 19 — Model Tier Routing
export {
  CoverageDensityCalculator,
  RoutingDecisionEngine,
  EscalationMonitor,
  RoutingMetricsTracker,
} from "./routing/index.js";

// Phase D, Step 20 — Anti-Pattern Inference in ICE (Method 6)
export {
  AntiPatternLibrary,
  AntiPatternInferencer,
  AntiPatternScanner,
  AntiPatternAlertFormatter,
} from "./knowledge/index.js";

export type {
  AntiPatternInferencerDeps,
} from "./knowledge/index.js";

// Phase D, Step 21 — Cross-Build Pattern Analysis and Domain Playbooks
export {
  CrossBuildPatternStore,
  CrossBuildPatternAnalyzer,
  DomainClassifier,
  DomainKnowledgeCurator,
  KnowledgeCompoundingMetrics,
} from "./knowledge/index.js";

export type {
  DomainKnowledgeCuratorDeps,
} from "./knowledge/index.js";

// Phase E, Step 25 — Design Quality Scoring Calibration
export {
  DesignScoreAccuracyTracker,
  DesignScoreCalibrator,
  CalibrationAwareDesignThreshold,
  DesignScoringFeedbackLoop,
} from "./design/index.js";

// Phase E, Step 22 — Ephemeral Decision-Time Guidance Engine
export {
  GuidanceEffectivenessTracker,
  DecisionTimeContextAnalyzer,
  OperatingContextEvolver,
  EphemeralGuidanceEngine,
} from "./design/index.js";

// Phase E, Step 23 — Competitive Generation for Critical Paths
export {
  CriticalPathIdentifier,
  ImplementationComparator,
  TournamentSelector,
  CompetitiveGenerationCoordinator,
} from "./orchestrator/index.js";

export type {
  ImplementationComparatorDeps,
} from "./orchestrator/index.js";

// Phase E, Step 24 — Confidence Calibration Integration
export {
  PredictionAccuracyTracker,
  ConfidenceCalibrator,
  OverconfidenceDetector,
  CalibrationAwareRouter,
} from "./routing/index.js";

// Phase D, Step 17 — Multi-Signal Drift Monitoring
export {
  ASIMonitor,
  GDIMonitor,
  ConfidenceMonitor,
  BehavioralMonitor,
  MultiSignalDriftMonitor,
} from "./drift/index.js";

export type {
  MultiSignalMonitorDeps,
} from "./drift/index.js";

// Phase E, Step 26 — Continuous Learning Flywheel
export {
  BuildCompletionLearningCollector,
  LearningSignalRouter,
  FlywheelMetricsDashboard,
  FlywheelHealthMonitor,
} from "./knowledge/index.js";
