/**
 * Knowledge subsystem — experiential trail capture, storage, retrieval,
 * and ranking for golden window injection.
 *
 * Spec Section 6.1 — Three-Layer Knowledge Architecture
 * Spec Section 6.3 — Experiential Trail System
 * Spec Section 6.6 — Five-Layer Memory Architecture
 */

export { InMemoryVectorStore } from "./vector-store.js";
export { TextSimilarityEmbeddingProvider } from "./embedding-provider.js";
export { TrailStore } from "./trail-store.js";
export type { SQLiteDatabase, SQLiteStatement } from "./trail-store.js";
export { TrailExtractor } from "./trail-extractor.js";
export { TrailRanker } from "./trail-ranker.js";
export { Librarian } from "./librarian.js";
export type { LibrarianConfig } from "./librarian.js";

// Phase B, Step 8 — Context7 MCP + Documentation Resolver
export { Context7Provider } from "./context7-provider.js";
export type {
  MCPClient,
  MCPToolResult,
  MCPContentBlock,
  Context7ProviderConfig,
} from "./context7-provider.js";
export { DocumentationResolver } from "./documentation-resolver.js";
export type {
  SkillFileReader,
  WebSearchProvider,
  DocumentationResolverConfig,
} from "./documentation-resolver.js";

// Phase D, Step 18 — ACE-Style Evolving Playbooks
export { PlaybookStore } from "./playbook-store.js";
export { PlaybookExtractor } from "./playbook-extractor.js";
export { PlaybookEvolver } from "./playbook-evolver.js";
export { PlaybookApplicator } from "./playbook-applicator.js";
export type { PlaybookApplicatorConfig } from "./playbook-applicator.js";

// Phase D, Step 20 — Anti-Pattern Inference in ICE (Method 6)
export { AntiPatternLibrary } from "./anti-pattern-library.js";
export { AntiPatternInferencer } from "./anti-pattern-inferencer.js";
export type { AntiPatternInferencerDeps } from "./anti-pattern-inferencer.js";
export { AntiPatternScanner } from "./anti-pattern-scanner.js";
export { AntiPatternAlertFormatter } from "./anti-pattern-formatter.js";

// Phase D, Step 21 — Cross-Build Pattern Analysis and Domain Playbooks
export { CrossBuildPatternStore } from "./cross-build-pattern-store.js";
export { CrossBuildPatternAnalyzer } from "./cross-build-pattern-analyzer.js";
export { DomainClassifier } from "./domain-classifier.js";
export { DomainKnowledgeCurator } from "./domain-knowledge-curator.js";
export type { DomainKnowledgeCuratorDeps } from "./domain-knowledge-curator.js";
export { KnowledgeCompoundingMetrics } from "./knowledge-compounding-metrics.js";

// Phase E, Step 26 — Continuous Learning Flywheel
export { BuildCompletionLearningCollector } from "./build-completion-learning-collector.js";
export { LearningSignalRouter } from "./learning-signal-router.js";
export { FlywheelMetricsDashboard } from "./flywheel-metrics-dashboard.js";
export { FlywheelHealthMonitor } from "./flywheel-health-monitor.js";
