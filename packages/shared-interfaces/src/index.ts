/**
 * @kriptik/shared-interfaces — the contract layer between
 * the Cortex Engine and the KripTik Application.
 *
 * This package contains ONLY TypeScript interfaces and type definitions.
 * No implementation code. No runtime dependencies.
 */

export type {
  BuildPhase,
  BuildEventSeverity,
  IBuildEvent,
  ICortexEngine,
  IBuildOptions,
  IBuildSession,
} from "./engine.js";

export type {
  ModelTier,
  AgentRole,
  AgentSessionState,
  IAgentSession,
  IGoalAssignment,
  GoalStatus,
  IInterfaceContract,
  IAgentHarnessConfig,
  IGoldenWindowSequence,
  ICodeContext,
  IDepartingAgentState,
  IToolDefinition,
  IAgentHarness,
  ILiveAgentSession,
  ITokenUsage,
  IAgentResponse,
  IToolUseBlock,
  AgentSessionEventType,
  IAgentSessionEvent,
} from "./agents.js";

export type {
  IIntentLayers,
  IDesignBrief,
  IConstraintMap,
  IEndpointConstraint,
  ILivingSpecification,
  IFeatureSpec,
  IDependencySpec,
} from "./ice.js";

export type {
  DriftSignalSource,
  DriftSeverity,
  IDriftSignal,
  RotationRecommendation,
  IRotationDecision,
} from "./drift.js";

export type {
  TrailType,
  TrailOutcome,
  ITrailEntry,
  ITrailRankingCriteria,
  IRankedTrail,
  ITrailQuery,
  ITrailStore,
  IVectorPoint,
  IVectorSearchResult,
  IVectorFilter,
  IVectorStore,
  IEmbeddingProvider,
  ITrailExtractor,
  ITrailRanker,
  ILibrarian,
  DocumentationSource,
  IDocumentationFragment,
  IContext7Provider,
  IDocumentationNeed,
  IDocumentationResult,
  IDocumentationResolver,
} from "./knowledge.js";

export type {
  MergeCheckType,
  IMergeCheck,
  IMergeGateResult,
  UXIssueSeverity,
  IUXIssue,
  IUXReport,
  ICVSResult,
} from "./verification.js";

export type {
  ESAAEventCategory,
  IESAAEvent,
  IBuildState,
  IAgentState,
  GoalProgress,
  IMergeRecord,
  IAnchoredState,
  // Phase B, Step 10 — Build State Manager
  BuildStateEventCategory,
  IBuildStateEvent,
  IBuildStateManager,
  IWarmUpContext,
  IWarmUpSequenceBuilder,
} from "./state.js";

export type {
  PeerMessageType,
  IPeerMessage,
  IGraphMeshConfig,
  IGraphEdge,
  PubSubEventType,
  IPubSubEvent,
} from "./communication.js";

export type {
  IDependencyGraph,
  IOrchestratorConfig,
  OrchestratorEventType,
  IOrchestratorEvent,
  ICortexOrchestrator,
} from "./orchestrator.js";

export type {
  ContainerState,
  IContainerConfig,
  IContainerResourceLimits,
  IAgentContainer,
  IContainerExecOptions,
  IContainerExecResult,
  IContainerManager,
  IContainerHealth,
  IContainerEvent,
  ContainerEventType,
} from "./containers.js";

export type {
  IArchitecturalBlueprint,
  IBlueprintModule,
  IBlueprintDataFlow,
  ICodeStyleGuide,
  ISharedConfig,
  IBlueprintRevision,
  IRevisionRequest,
  RevisionDecision,
  IRevisionResponse,
  IArbitrationRequest,
  IArbitrationResult,
  IGoldenWindowConfig,
  IGoldenWindowBuilder,
  IArchitectAgent,
} from "./architect.js";

export type {
  ICompactionConfig,
  ICompactionResult,
  IAnchoredStateTracker,
  ICompactionManager,
} from "./compaction.js";

export type {
  IRotationContext,
  IEnhancedThresholdMonitor,
  IStateCaptureProvider,
  IRotationResult,
  IRotationOutcome,
  IRotationProtocol,
} from "./rotation.js";

export type {
  IBuildBranches,
  IScopeCheckResult,
  IMergeRequest,
  ILSPCheckResult,
  ILSPDiagnostic,
  IContractCheckResult,
  IContractViolation,
  ITestCheckResult,
  ITestFailure,
  IBannedPatternCheckResult,
  IBannedPatternViolation,
  IBannedPatternConfig,
  IBannedCodePattern,
  IBuildRepository,
  IMergeGate,
  IMergeGateCheckDetail,
} from "./git.js";

// Phase B, Step 11 — Anti-Slop Linter
export type {
  SlopSeverity,
  SlopCategory,
  ISlopPattern,
  ISlopViolation,
  ISlopLintResult,
  ISlopLinterConfig,
  IAntiSlopLinter,
} from "./slop.js";

// Phase C, Step 12 — UX Verification Teams (Navigator + Inspector)
export type {
  IUserJourney,
  IJourneyStep,
  IJourneyTestPlan,
  IJourneyTestResult,
  IJourneyStepResult,
  IConsoleLogEntry,
  INetworkRequestLog,
  IPerformanceSnapshot,
  INavigatorStepResult,
  IVisualQualityAssessment,
  IQualityDimension,
  INavigatorAgent,
  IInspectorDiagnostic,
  IInspectorReport,
  IInspectorAgent,
  IUXVerificationResult,
  IUXVerificationTeam,
  IJourneyTestPlanner,
} from "./ux-verification.js";

// Phase C, Step 13 — Design Pioneer Agent
export type {
  IDesignToken,
  IDesignTokenSet,
  IGeneratedFile,
  IExperienceShell,
  IEffectTemplate,
  IComponentTemplate,
  ILayoutTemplate,
  IExampleTemplate,
  IComponentLibrary,
  IRequiredPattern,
  IQualityThreshold,
  IAntiSlopRuleset,
  IDesignPioneerArtifacts,
  IDesignPioneerConfig,
  IDesignPioneerAgent,
} from "./design-pioneer.js";

// Phase C, Step 14 — Seven-Layer Design Enforcement Stack
export type {
  IComponentReference,
  IEffectReference,
  ILayoutReference,
  IDesignContextBlock,
  IPositiveContextInjector,
  IEphemeralGuidance,
  IEphemeralGuidanceRule,
  IEphemeralGuidanceClassifier,
  IRequiredPatternViolation,
  IRequiredPatternCheckResult,
  IRequiredPatternChecker,
  IDesignQualityDimension,
  IDesignQualityScore,
  IDesignQualityScorerConfig,
  IDesignQualityScorer,
  IDesignEnforcementStackConfig,
  IDesignEnforcementStack,
} from "./enforcement.js";

// Phase C, Step 15 — Journey Verification, Intent Satisfaction, CVS Coordinator
export type {
  IJourneyAssessment,
  IJourneyVerificationResult,
  IJourneyVerificationAgent,
  IFeatureAssessment,
  IConstraintAssessment,
  IBuildArtifactsSummary,
  IIntentSatisfactionResult,
  IIntentSatisfactionAgent,
  ICVSCoordinatorConfig,
  ICVSCoordinator,
} from "./cvs.js";

// Phase D, Step 17 — Multi-Signal Drift Monitoring
export type {
  ASICategoryId,
  IASIDimension,
  IASICategory,
  IASIResult,
  IASIMonitor,
  GDIDivergenceType,
  IGDIDivergence,
  IGDIResult,
  IGDIMonitor,
  ConfidenceFeatureLevel,
  IConfidenceFeature,
  IConfidenceCalibrationResult,
  IConfidenceMonitor,
  BehavioralHeuristicId,
  IBehavioralHeuristic,
  IBehavioralHeuristicsResult,
  IBehavioralMonitor,
  IBehavioralObservation,
  IMultiSignalDriftMonitor,
  IMultiSignalSnapshot,
} from "./drift-signals.js";

// Phase D, Step 18 — ACE-Style Evolving Playbooks
export type {
  PlaybookLevel,
  PlaybookStatus,
  IPlaybook,
  IPlaybookDecision,
  IPlaybookGotcha,
  PlaybookEvolutionType,
  IPlaybookEvolutionRecord,
  IPlaybookSnapshot,
  IBuildOutcome,
  IPlaybookExtraction,
  IPlaybookExtractor,
  IPlaybookEvolver,
  IPlaybookSelection,
  IPlaybookApplicator,
  IPlaybookQuery,
  IPlaybookStore,
} from "./playbooks.js";

// Phase D, Step 19 — Model Tier Routing
export type {
  RoutingPhase,
  ICoverageDensity,
  TaskComplexity,
  ITaskComplexitySignals,
  IRoutingDecision,
  IEscalationTrigger,
  EscalationAction,
  IRoutingOutcome,
  IRoutingMetricsSummary,
  ICoverageDensityCalculator,
  IRoutingDecisionEngine,
  IEscalationMonitor,
  IRoutingMetricsTracker,
  ITaskTypeRoutingStats,
} from "./routing.js";

// Phase D, Step 20 — Anti-Pattern Inference in ICE (Method 6)
export type {
  AntiPatternConfidence,
  AntiPatternStatus,
  AntiPatternSource,
  IAntiPattern,
  IAntiPatternAlert,
  IAntiPatternQuery,
  IInferenceResult,
  IAntiPatternScanResult,
  IAntiPatternLibrary,
  IAntiPatternInferencer,
  IAntiPatternScanner,
  IAntiPatternAlertFormatter,
} from "./anti-patterns.js";

// Phase D, Step 21 — Cross-Build Pattern Analysis and Domain Playbooks
export type {
  KnownDomain,
  IDomainClassification,
  IDomainScore,
  IDomainSignal,
  DomainSignalType,
  ICrossBuildPattern,
  CrossBuildPatternCategory,
  ICrossBuildStatistics,
  ICrossBuildPatternAnalyzer,
  ICrossBuildAnalysisResult,
  ICrossBuildPatternQuery,
  ICrossBuildPatternStore,
  IDomainClassifier,
  IDomainTaxonomy,
  IDomainStats,
  IDomainKnowledgeCurator,
  IDomainCurationResult,
  IDomainKnowledge,
  ICrossDomainCandidate,
  IKnowledgeCompoundingMetrics,
  IBuildKnowledgeContribution,
  IKnowledgeHealthSnapshot,
  IKnowledgeMilestone,
  IKnowledgeQualityImpact,
} from "./cross-build.js";

// Phase E, Step 22 — Ephemeral Decision-Time Guidance Engine
export type {
  GuidanceComplianceOutcome,
  IGuidanceEffectivenessObservation,
  IGuidanceRuleMetrics,
  IGuidanceEffectivenessTracker,
  IDecisionTimeContext,
  IScoredGuidance,
  IDecisionTimeContextAnalyzer,
  IProactiveGuidancePattern,
  IOperatingInstruction,
  IInstructionCompliance,
  IInstructionRevisionProposal,
  InstructionRevisionType,
  IOperatingContextEvolver,
  ILearnedGuidanceRule,
  LearnedRuleSource,
  IGuidanceLearningResult,
  IEphemeralGuidanceEngineDeps,
  IEphemeralGuidanceEngine,
} from "./ephemeral-guidance-engine.js";

// Phase E, Step 23 — Competitive Generation for Critical Paths
export type {
  ForkCriterion,
  NoForkReason,
  IForkAssessment,
  ICriticalPathIdentifier,
  CompetitorStatus,
  ICompetitorConfig,
  ICompetitorResult,
  ICompetitorEvaluation,
  IImplementationComparator,
  ICompetitionOutcome,
  ITournamentSelector,
  ICompetitiveSession,
  ICompetitiveGenerationCoordinatorDeps,
  ICompetitiveGenerationCoordinator,
} from "./competitive-generation.js";

// Phase E, Step 24 — Confidence Calibration Integration
export type {
  IConfidencePrediction,
  ICalibrationDataPoint,
  CalibrationDirection,
  ICalibrationBin,
  ICalibrationCurve,
  CalibrationQuality,
  IModelTierCalibrationProfile,
  ITaskTypeCalibrationProfile,
  OverconfidenceSeverity,
  IOverconfidenceAlert,
  OverconfidenceScope,
  OverconfidenceRecommendation,
  ICalibrationRoutingAdjustment,
  CalibrationVerificationLevel,
  ICalibrationDataFilter,
  IPredictionAccuracyTracker,
  IConfidenceCalibrator,
  IOverconfidenceDetector,
  ICalibrationAwareRouter,
} from "./confidence-calibration.js";

// Phase E, Step 25 — Design Quality Scoring Calibration
export type {
  IDesignScorePrediction,
  IDesignDimensionSnapshot,
  IDesignOutcomeSignal,
  DesignOutcomeSignalType,
  IDesignCalibrationDataPoint,
  DesignCalibrationDirection,
  IDesignDimensionCalibrationError,
  IDesignCalibrationBin,
  IDesignCalibrationCurve,
  DesignCalibrationQuality,
  IAppTypeCalibrationProfile,
  IThresholdAdjustment,
  IDimensionWeightAdjustment,
  IDimensionWeightProfile,
  IDesignScoreAccuracyTracker,
  IDesignCalibrationDataFilter,
  IDesignScoreCalibrator,
  ICalibrationAwareDesignThreshold,
  IDesignScoringFeedbackLoop,
} from "./design-scoring-calibration.js";

// Phase E, Step 26 — Continuous Learning Flywheel
export type {
  LearningSignalCategory,
  ILearningSignal,
  LearningSignalPayload,
  ITrailExtractionPayload,
  IPlaybookEvolutionPayload,
  IAntiPatternInferencePayload,
  ICrossBuildPatternPayload,
  IConfidenceCalibrationPayload,
  IDesignScoringCalibrationPayload,
  IRoutingOutcomePayload,
  IUXVerificationPayload,
  IIntentSatisfactionPayload,
  IBuildLearningBundle,
  ISignalRoutingResult,
  IBundleRoutingResult,
  IFlywheelMetricsSnapshot,
  ICalibrationMetricsSummary,
  IDesignCalibrationMetricsSummary,
  ILearningRateMetrics,
  MetricTrend,
  PipelineHealthStatus,
  IFlywheelHealthAlert,
  FlywheelAlertSeverity,
  IFlywheelDiagnostic,
  IBuildCompletionLearningCollector,
  IBuildCompletionLearningCollectorDeps,
  ILearningSignalRouter,
  ILearningSignalRouterDeps,
  IFlywheelMetricsDashboard,
  IRoutingPhaseProgress,
  IFlywheelMetricsDashboardDeps,
  IFlywheelHealthMonitor,
  IFlywheelHealthCheckResult,
  SubsystemHealthStatus,
  IFlywheelHealthConfig,
} from "./continuous-learning-flywheel.js";

// Prism Engine — Diffusion-based app building pipeline
export type {
  IPrismEngine,
  PrismBuildOptions,
  PrismEngineConfig,
  PrismBuildSession,
  NodeEdit,
  EncryptedCredential,
  ServiceInstance,
  BackendTarget,
  DeploymentTarget,
} from "./prism-engine.js";

export type {
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
} from "./prism-graph.js";

export type {
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
} from "./prism-plan.js";

export type {
  BackendContract,
  APIEndpointPlan,
  AuthStrategyPlan,
} from "./prism-backend.js";

export type {
  PrismEventType,
  PrismEvent,
} from "./prism-events.js";

export type {
  OptimizationSession,
  OptimizationReport,
  OptimizationNodeResult,
} from "./prism-optimization.js";

// Phase C, Step 16 — Violation Response Protocol
export type {
  ViolationSeverity,
  EscalationLevel,
  ViolationSource,
  IViolationRecord,
  IPeerContaminationAssessment,
  IContaminatedInterface,
  IFiringResult,
  IReplacementConfig,
  IViolationDetector,
  IViolationResponseProtocol,
  IReplacementAgentBuilder,
} from "./violation.js";
