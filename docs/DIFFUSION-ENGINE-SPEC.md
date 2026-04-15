# Kriptik Diffusion Engine — Production Build Specification v1.1

**Status:** Canonical source of truth for all diffusion engine implementation  
**Date:** 2026-04-08  
**Engine codename:** Prism  
**Target:** Full production integration into Kriptik monorepo  

> This specification governs every line of code written for the Prism diffusion engine.  
> Claude Code MUST read this document before writing any implementation code.  
> Any deviation from this spec requires explicit written justification in `docs/spec-deviations-prism.md`.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Integration Model — Kriptik × Prism](#2-integration-model)
3. [Database Schema Additions](#3-database-schema-additions)
4. [Shared Interfaces Package](#4-shared-interfaces-package)
5. [Modal Diffusion Pipeline](#5-modal-diffusion-pipeline)
6. [Server Routes & API Contracts](#6-server-routes--api-contracts)
7. [Client UI Integration](#7-client-ui-integration)
8. [Planning Phase — NLP to Build Plan](#8-planning-phase)
9. [Image Generation & Segmentation Phase](#9-image-generation--segmentation-phase)
10. [Knowledge Graph Construction](#10-knowledge-graph-construction)
11. [Parallel Code Generation Phase](#11-parallel-code-generation-phase)
12. [Verification & Repair Pipeline](#12-verification--repair-pipeline)
13. [PixiJS Assembly & Rendering](#13-pixijs-assembly--rendering)
14. [Backend Generation Pipeline](#14-backend-generation-pipeline)
15. [Deployment Pipeline](#15-deployment-pipeline)
16. [Live Preview via Modal Tunnel](#16-live-preview-via-modal-tunnel)
17. [Overnight Optimization System](#17-overnight-optimization-system)
18. [Environment Variables](#18-environment-variables)
19. [Testing Specification](#19-testing-specification)
20. [RALPH Loop & Build Phases](#20-ralph-loop--build-phases)
21. [Credit & Cost Accounting](#21-credit--cost-accounting)
22. [SSE Event Types](#22-sse-event-types)
23. [File Storage — Cloudflare R2](#23-file-storage)
24. [Error Handling & Recovery](#24-error-handling--recovery)

---

## 1. Architecture Overview

### System Topology

```
User (kriptik.app)
  │
  ├── Client (Vite + React 19 SPA)
  │     ├── Engine selector: Cortex | Prism
  │     ├── Builder UI (shared layout, engine-specific panels)
  │     ├── SSE event stream (shared infrastructure)
  │     └── Live preview iframe (shared, source differs by engine)
  │
  ├── Server (Express 4 on Vercel)
  │     ├── POST /api/execute          ← branches on engineType
  │     ├── POST /api/events/callback  ← shared for both engines
  │     ├── GET  /api/events/stream    ← shared SSE
  │     ├── POST /api/prism/*          ← Prism-specific routes
  │     └── Drizzle ORM → Supabase PostgreSQL
  │
  └── Modal (Serverless Compute)
        ├── kriptik-engine        (existing — Cortex/legacy, CPU)
        └── kriptik-prism         (NEW — Diffusion pipeline, GPU)
              ├── Orchestrator     (coordinates all phases)
              ├── Planning Pod     (intent → graph plan)
              ├── FLUX.2 Pod       (image generation, L40S GPU)
              ├── SAM 3.1 Pod      (segmentation + Object Multiplex, L4 GPU)
              ├── CodeGen Pool     (100+ L4 containers, SGLang)
              ├── Verify Pod       (SWE-RM, L4 GPU)
              ├── Backend Pod      (contract gen + backend code)
              ├── Assembly Pod     (PixiJS bundling, CPU)
              └── Preview Server   (dev server + Modal tunnel)
```

### 22-Step Pipeline

```
1.  Intent parsing (Anthropic Claude)
2.  Competitive analysis (optional, Firecrawl + vision)
3.  Inferred needs mapping (domain KG + CoT)
4.  Plan generation (Claude Opus 4.6)
5.  Plan presentation → user approval (BLOCKS until approved)
6.  Dependency pre-installation
7.  FLUX.2 image generation (per hub)
8.  SAM 3.1 segmentation (per hub image)
9.  Post-segmentation verification (vision model, binary pass/fail)
10. Knowledge graph construction (from plan + segments)
11. Caption verification blast (vision model, binary pass/fail per node)
12. Texture atlas packing (MaxRects bin packing)
13. Parallel code generation (100+ SGLang containers)
14. SWE-RM verification (per node)
15. Contamination-aware repair (per failed node)
16. PixiJS assembly (graph-to-tree + bundling)
17. Backend contract generation (tRPC + Zod) — generated in step 4, used here
18. Parallel backend code generation
19. Convergence gate (tsc + AJV + route resolution)
20. Bundle upload to R2
21. Preview server via Modal tunnel
22. (Optional) Overnight optimization via GEPA
```

### Three-Phase Lifecycle

**Phase 1 — Generation (~22–28 seconds):**  
NL Input → Intent Parse → Plan Generation → Plan Approval → Dependency Pre-Install → FLUX.2 Image Gen → SAM 3.1 Segmentation → Post-Segmentation Verification → Knowledge Graph Construction → Caption Verification Blast → Texture Atlas Packing → Parallel Code Gen (100+ containers) → SWE-RM Verification → Contamination-Aware Repair → PixiJS Assembly → Backend Contract Gen → Parallel Backend Code Gen → Convergence Gate → Bundle → Deploy Preview

**Phase 2 — Runtime (persistent):**  
Knowledge graph IS the application. PixiJS Render Groups as hubs. Render Layers for shared nodes. Graph-to-tree adapter for PixiJS single-parent constraint. Editing = graph mutation → regenerate only changed nodes.

**Phase 3 — Optimization (overnight, optional):**  
GEPA proposer-evaluator per node. Parallel optimization across all nodes. Graph-level structural optimization. Integration testing with visual regression. Rollback guarantee per node.

### Core Architectural Invariants

These rules are IMMUTABLE. Every implementation decision must preserve them:

1. **The graph is the app.** The knowledge graph produced during generation persists as the runtime representation. No compilation to a different format.
2. **Nodes are self-contained.** Every graph node carries its own identity, purpose, input/output contracts, visual specification (caption), code, and metadata. Any node can be generated, tested, and validated independently.
3. **Contamination-aware repair.** When code generation fails verification, the failing code is DELETED before regeneration. The repair model receives ONLY the caption/spec — never the broken code. This prevents pattern bias (validated by NeurIPS 2023 + IEEE TSE 2025).
4. **Contract-first parallel generation.** Frontend and backend are generated simultaneously against a shared typed contract (tRPC types + Zod schemas) produced during planning. Compatibility is verified by static analysis in a convergence gate.
5. **SSE is the only real-time channel.** All build events flow through the existing SSE infrastructure (buildEvents table → GET /api/events/stream). No WebSockets. No new real-time protocols.
6. **Modal is the execution fabric.** All GPU and CPU-intensive work runs on Modal. The Express server is a thin API layer and event router. Nothing compute-heavy runs on Vercel.
7. **Text rendering is solved.** Use tiered hybrid approach: programmatic Sharp+SVG for functional text (100% accuracy), MSDF for WebGPU runtime text, Ideogram 3.0 / FreeText-enhanced FLUX for decorative text.
8. **Bipartite DAG, not hub-and-spoke.** Elements and pages form two disjoint node types with many-to-many edges. Shared components (nav, footer) exist once canonically with per-page property overrides.
9. **Caption verification before code generation.** Every node's caption is verified against its segmented image by a vision model BEFORE being sent to parallel code generation containers. Catching caption errors here prevents 100+ containers from generating code against bad specs.

---

## 2. Integration Model

### Engine Selection

Kriptik supports two engines side by side. The engine is selected per-project and stored in the `projects` table.

```
projects.engineType: 'cortex' | 'prism'
```

**Default:** `'cortex'` (preserves existing behavior for all current users).

**Selection points in UI:**
- `NewProjectModal` — dropdown during project creation
- `Builder.tsx` prompt bar area — engine badge/selector (can switch before first build only; locked once a build starts)
- `SpeedDialSelector` — build mode options vary by engine

**Server routing in POST /api/execute:**
```typescript
if (project.engineType === 'prism') {
  return handlePrismBuild(req, res, project);
} else {
  return handleCortexBuild(req, res, project); // existing path
}
```

### Package Structure

New package in monorepo:

```
packages/
  shared-interfaces/     (existing — extend with Prism types)
  cortex-engine/         (existing — untouched)
  prism-engine/          (NEW — Prism pipeline orchestration)
    src/
      index.ts           (PrismEngine class, implements IPrismEngine)
      types.ts           (re-exports from shared-interfaces)
      planning/          (intent parsing, plan generation)
        domain-knowledge.ts  (app type → feature dependency trees)
      diffusion/         (FLUX.2 client, image management)
      segmentation/      (SAM 3.1 client, mask processing)
      graph/             (knowledge graph construction, DAG operations)
      codegen/           (SGLang client, Mercury/Qwen dispatch)
      verification/      (SWE-RM client, scoring pipeline)
      repair/            (contamination-aware regeneration)
      assembly/          (PixiJS bundler, atlas packer)
      backend/           (contract gen, backend code gen, deployment)
      preview/           (dev server management, tunnel)
      optimization/      (GEPA integration, overnight runner)
      utils/             (shared utilities)
```

New Modal app:

```
modal/
  app.py                 (existing — Cortex/legacy)
  prism_app.py           (NEW — Prism diffusion pipeline)
  prism/
    orchestrator.py      (main pipeline coordinator)
    planning.py          (intent → plan)
    flux_worker.py       (FLUX.2 image generation)
    sam_worker.py        (SAM 3.1 segmentation)
    codegen_worker.py    (SGLang + code model dispatch)
    verify_worker.py     (SWE-RM scoring)
    caption_verify.py    (caption verification blast)
    backend_worker.py    (backend code generation)
    assembly_worker.py   (PixiJS bundling)
    preview_server.py    (dev server + tunnel)
    utils/
      graph.py           (graph data structures)
      atlas.py           (texture atlas packing)
      text.py            (Sharp+SVG text compositing)
      deps.py            (dependency extraction and pre-installation)
```

### What Stays Shared

These Kriptik systems are used by BOTH engines without modification:

| System | Mechanism |
|--------|-----------|
| Authentication | Better Auth sessions, requireAuth middleware |
| Project CRUD | projects table, ownership verification |
| SSE streaming | buildEvents table, events route, useEngineEvents hook |
| Credit billing | creditTransactions ledger, useCostStore |
| OAuth credentials | credentials table, vault encryption |
| MCP connections | mcpConnections table, MCP client |
| Service registry | 35-service registry, dependency management |
| Publishing | Slug management, publish/unpublish status |
| Error reporting | POST /api/errors/report |

### What Is Engine-Specific

| Cortex | Prism |
|--------|-------|
| Multi-agent orchestrator | Pipeline orchestrator |
| Agent sessions (Anthropic SDK) | SGLang + Mercury/Qwen |
| Text-based code generation | Image → segmentation → code |
| ESAA event sourcing | Graph-based state |
| Brain SQLite databases | Knowledge graph (JSON) |
| Design Pioneer + Anti-Slop | FLUX.2 + SAM 3.1 + PixiJS |
| Modal CPU containers | Modal GPU containers |

---

## 3. Database Schema Additions

### Modified Tables

**projects** — Add two columns:

```sql
ALTER TABLE projects ADD COLUMN engine_type text NOT NULL DEFAULT 'cortex';
-- Constraint: CHECK (engine_type IN ('cortex', 'prism'))

ALTER TABLE projects ADD COLUMN prism_config jsonb;
-- Schema of prism_config:
-- {
--   "planId": string | null,
--   "graphId": string | null,
--   "graphVersion": number,
--   "lastGenerationCost": number | null,
--   "diffusionModel": "flux2-klein" | "flux2-pro" | "flux2-dev",
--   "codeModel": "mercury-2" | "qwen3-coder-80b",
--   "targetResolution": { "width": number, "height": number },
--   "styleReferences": string[],
--   "backendTargets": string[],
--   "deploymentTargets": string[]
-- }
```

### New Tables

**prism_plans** — Stores approved build plans:

```typescript
export const prismPlans = pgTable('prism_plans', {
  id: text('id').primaryKey(),                    // UUID
  projectId: text('project_id').notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),               // Original NL input
  parsedIntent: jsonb('parsed_intent').notNull(), // Structured AppIntent
  competitiveAnalysis: jsonb('competitive_analysis'), // Competitor data
  inferredNeeds: jsonb('inferred_needs'),          // Auto-inferred requirements
  graphPlan: jsonb('graph_plan').notNull(),        // Full graph plan (nodes, edges, hubs)
  backendContract: jsonb('backend_contract'),      // tRPC/OpenAPI contract
  status: text('status').notNull().default('pending'),
    // pending | approved | generating | complete | failed
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  totalCost: integer('total_cost'),               // Credits consumed
  generationTimeMs: integer('generation_time_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

**prism_graphs** — Persists the knowledge graph (the application):

```typescript
export const prismGraphs = pgTable('prism_graphs', {
  id: text('id').primaryKey(),                    // UUID
  planId: text('plan_id').notNull()
    .references(() => prismPlans.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  nodes: jsonb('nodes').notNull(),                // GraphNode[]
  edges: jsonb('edges').notNull(),                // GraphEdge[]
  hubs: jsonb('hubs').notNull(),                  // Hub[]
  metadata: jsonb('metadata').notNull(),          // { totalNodes, totalEdges, etc. }
  frontendBundle: text('frontend_bundle_url'),    // R2 URL to assembled bundle
  backendManifest: jsonb('backend_manifest'),     // Deployed backend endpoints
  optimizationReport: jsonb('optimization_report'), // Overnight optimization results
  status: text('status').notNull().default('draft'),
    // draft | assembled | deployed | optimizing | optimized
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Index for fast lookup by project
CREATE INDEX idx_prism_graphs_project ON prism_graphs(project_id);
// Unique constraint: one active graph per project per version
CREATE UNIQUE INDEX idx_prism_graphs_project_version ON prism_graphs(project_id, version);
```

**prism_node_assets** — Stores per-node generated assets (images, code):

```typescript
export const prismNodeAssets = pgTable('prism_node_assets', {
  id: text('id').primaryKey(),                    // UUID
  graphId: text('graph_id').notNull()
    .references(() => prismGraphs.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),              // References node within graph JSON
  imageUrl: text('image_url'),                    // R2 URL to segmented element image
  atlasUrl: text('atlas_url'),                    // R2 URL to atlas containing this node
  atlasRegion: jsonb('atlas_region'),             // { x, y, width, height } within atlas
  generatedCode: text('generated_code'),          // Final verified code
  codeHash: text('code_hash'),                    // SHA-256 for cache invalidation
  verificationScore: real('verification_score'),  // SWE-RM continuous score
  captionVerified: boolean('caption_verified').default(false), // Caption verification pass
  generationAttempts: integer('generation_attempts').default(1),
  status: text('status').notNull().default('pending'),
    // pending | image_ready | caption_verified | code_generated | verified | failed
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

CREATE INDEX idx_prism_node_assets_graph ON prism_node_assets(graph_id);
```

---

## 4. Shared Interfaces Package

### New Files in packages/shared-interfaces/src/

**prism-engine.ts** — Top-level engine interface:

```typescript
export interface IPrismEngine {
  startBuild(options: PrismBuildOptions): Promise<PrismBuildSession>;
  getPlan(planId: string): Promise<PrismPlan | null>;
  approvePlan(planId: string): Promise<void>;
  rejectPlan(planId: string, feedback: string): Promise<PrismPlan>;
  getGraph(graphId: string): Promise<PrismGraph | null>;
  editNode(graphId: string, nodeId: string, changes: NodeEdit): Promise<PrismGraph>;
  triggerOptimization(graphId: string): Promise<OptimizationSession>;
}

export interface PrismBuildOptions {
  projectId: string;
  userId: string;
  prompt: string;
  engineConfig: PrismEngineConfig;
  credentials: Record<string, EncryptedCredential>;
  serviceInstances: ServiceInstance[];
}

export interface PrismEngineConfig {
  diffusionModel: 'flux2-klein' | 'flux2-pro' | 'flux2-dev';
  codeModel: 'mercury-2' | 'qwen3-coder-80b';
  targetResolution: { width: number; height: number };
  styleReferences: string[];
  backendTargets: BackendTarget[];
  deploymentTargets: DeploymentTarget[];
  enableCompetitiveAnalysis: boolean;
  enableOvernightOptimization: boolean;
}

export type BackendTarget =
  | 'cloudflare-workers'
  | 'aws-lambda'
  | 'vercel-functions'
  | 'fly-machines'
  | 'modal'
  | 'supabase'
  | 'runpod';

export type DeploymentTarget =
  | 'vercel'
  | 'cloudflare-pages'
  | 'netlify'
  | 'fly-io';
```

**prism-graph.ts** — Knowledge graph schema:

```typescript
export interface PrismGraph {
  id: string;
  planId: string;
  projectId: string;
  version: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  hubs: Hub[];
  metadata: GraphMetadata;
}

export interface GraphNode {
  id: string;                          // Persistent UUID
  type: 'element' | 'service' | 'integration' | 'data-model';
  elementType?: UIElementType;         // button, card, input, nav, etc.
  caption: string;                     // Self-contained natural language spec
  captionVerified: boolean;            // Whether caption passed verification blast
  hubMemberships: string[];            // Hub IDs this node belongs to
  position: { x: number; y: number; z: number; width: number; height: number };
  visualSpec: NodeVisualSpec;
  behaviorSpec: NodeBehaviorSpec;
  code: string | null;                 // Generated code (null until codegen)
  codeHash: string | null;
  verificationScore: number | null;
  imageUrl: string | null;             // Segmented element image
  atlasRegion: AtlasRegion | null;
  dependencies: string[];              // Node IDs this depends on
  status: 'pending' | 'image_ready' | 'caption_verified' | 'code_generated' | 'verified' | 'failed';
}

export type UIElementType =
  | 'page-background' | 'navbar' | 'sidebar' | 'footer'
  | 'hero-section' | 'card' | 'button' | 'input' | 'textarea'
  | 'select' | 'checkbox' | 'radio' | 'toggle' | 'slider'
  | 'image' | 'icon' | 'avatar' | 'badge' | 'tag'
  | 'table' | 'list' | 'grid' | 'carousel' | 'tabs'
  | 'modal' | 'drawer' | 'popover' | 'tooltip'
  | 'progress' | 'spinner' | 'skeleton'
  | 'chart' | 'graph' | 'map'
  | 'video-player' | 'audio-player'
  | 'form' | 'search-bar' | 'breadcrumb' | 'pagination'
  | 'notification' | 'toast' | 'alert'
  | 'custom';

export interface NodeVisualSpec {
  description: string;                 // What this looks like
  colors: { primary: string; secondary?: string; accent?: string; text?: string };
  typography: { fontFamily?: string; fontSize?: number; fontWeight?: number };
  spacing: { padding?: string; margin?: string; gap?: string };
  borders: { radius?: string; width?: string; color?: string; style?: string };
  effects: { shadow?: string; blur?: string; opacity?: number; glow?: string };
  animation: AnimationSpec | null;
  textContent: TextContentSpec[];      // Text elements within this node
}

export interface TextContentSpec {
  text: string;
  role: 'heading' | 'body' | 'label' | 'placeholder' | 'caption';
  renderMethod: 'sharp-svg' | 'msdf' | 'diffusion';
  typography: { fontFamily: string; fontSize: number; fontWeight: number; color: string };
  position: { x: number; y: number; anchor: 'left' | 'center' | 'right' };
}

export interface AnimationSpec {
  trigger: 'load' | 'hover' | 'click' | 'scroll' | 'focus';
  type: 'fade' | 'slide' | 'scale' | 'rotate' | 'bounce' | 'glow' | 'custom';
  duration: number;                    // ms
  easing: string;                      // CSS easing function
  customCode?: string;                 // GSAP/tween.js code
}

export interface NodeBehaviorSpec {
  interactions: Interaction[];
  dataBindings: DataBinding[];
  stateManagement: StateSpec | null;
  apiCalls: APICallSpec[];
  accessibilityRole: string;
  tabIndex: number;
}

export interface Interaction {
  event: 'click' | 'hover' | 'focus' | 'submit' | 'change' | 'scroll' | 'keydown';
  action: 'navigate' | 'toggle' | 'submit' | 'open-modal' | 'close-modal'
    | 'api-call' | 'state-update' | 'animation' | 'custom';
  targetNodeId?: string;               // For cross-node interactions
  targetHubId?: string;                // For navigation
  payload?: Record<string, unknown>;
  customCode?: string;
}

export interface GraphEdge {
  id: string;
  source: string;                      // Node ID
  target: string;                      // Node ID
  type: 'contains' | 'navigates-to' | 'triggers' | 'data-flow'
    | 'shares-state' | 'depends-on' | 'renders';
  metadata: Record<string, unknown>;
}

export interface Hub {
  id: string;
  name: string;
  route: string;                       // URL path
  layoutTemplate: 'single-column' | 'two-column' | 'sidebar' | 'dashboard' | 'fullscreen';
  nodeIds: string[];                   // Nodes in this hub
  sharedNodeIds: string[];             // Nodes shared with other hubs
  authRequired: boolean;
  transitions: HubTransition[];
  metadata: Record<string, unknown>;
}

export interface HubTransition {
  targetHubId: string;
  trigger: 'navigation' | 'redirect' | 'modal-open';
  animation: 'fade' | 'slide-left' | 'slide-right' | 'none';
}

export interface AtlasRegion {
  atlasIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphMetadata {
  totalNodes: number;
  totalEdges: number;
  totalHubs: number;
  totalSharedNodes: number;
  estimatedDrawCalls: number;
  atlasCount: number;
  totalCodeSize: number;               // bytes
  generationTimeMs: number;
  totalCost: number;                   // credits
}
```

**prism-plan.ts** — Planning phase types:

```typescript
export interface AppIntent {
  description: string;
  appType: AppType;
  platform: 'web' | 'mobile-web' | 'desktop';
  features: FeatureSpec[];
  visualStyle: VisualStyleSpec;
  integrations: IntegrationSpec[];
  contentStrategy: 'static' | 'dynamic' | 'real-time';
  commercialClassification: 'personal' | 'commercial' | 'enterprise';
  confidenceScore: number;
  ambiguities: string[];
  reasoning: string;                   // Free-form reasoning (BEFORE structured fields)
}

export type AppType =
  | 'landing-page' | 'saas-dashboard' | 'e-commerce' | 'portfolio'
  | 'blog' | 'social-platform' | 'marketplace' | 'crm'
  | 'project-management' | 'analytics-dashboard' | 'ai-tool'
  | 'video-platform' | 'messaging-app' | 'booking-system'
  | 'documentation' | 'admin-panel' | 'custom';

export interface FeatureSpec {
  name: string;
  description: string;
  priority: 'must-have' | 'should-have' | 'nice-to-have';
  category: 'frontend' | 'backend' | 'integration' | 'infrastructure';
  inferredFrom: 'user-input' | 'competitive-analysis' | 'domain-knowledge' | 'security';
  acceptanceCriteria: string[];
}

export interface VisualStyleSpec {
  colorScheme: 'light' | 'dark' | 'auto';
  primaryColor: string;
  accentColor: string;
  typography: {
    headingFont: string;
    bodyFont: string;
    monoFont: string;
  };
  designLanguage: 'minimal' | 'glassmorphism' | 'neobrutalism' | 'material'
    | 'corporate' | 'playful' | 'editorial' | 'custom';
  referenceUrls: string[];
  extractedTokens: ExtractedDesignTokens | null;
}

export interface ExtractedDesignTokens {
  source: string;                      // URL or reference
  colors: Record<string, string>;
  fonts: string[];
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
}

export interface IntegrationSpec {
  serviceId: string;                   // Maps to service registry
  purpose: string;
  requiredScopes: string[];
  credentialStatus: 'connected' | 'pending' | 'missing';
}

export interface PrismPlan {
  id: string;
  projectId: string;
  prompt: string;
  intent: AppIntent;
  competitiveAnalysis: CompetitiveAnalysis | null;
  inferredNeeds: InferredNeed[];
  graph: PrismGraphPlan;               // The plan AS a graph
  backendContract: BackendContract;
  estimatedCost: number;               // Credits
  estimatedTimeSeconds: number;
  status: 'pending' | 'approved' | 'generating' | 'complete' | 'failed';
}

export interface PrismGraphPlan {
  hubs: HubPlan[];
  sharedComponents: SharedComponentPlan[];
  dataModels: DataModelPlan[];
  services: ServicePlan[];
  navigationGraph: NavigationEdge[];
}

export interface HubPlan {
  id: string;
  name: string;
  route: string;
  description: string;
  layoutTemplate: string;
  authRequired: boolean;
  elements: ElementPlan[];             // UI elements in this hub
}

export interface ElementPlan {
  id: string;
  type: UIElementType;
  caption: string;                     // Complete self-contained spec for code gen
  position: { x: number; y: number; width: number; height: number };
  textContent: TextContentSpec[];
  interactions: Interaction[];
  isShared: boolean;                   // If true, appears in sharedComponents too
}

export interface SharedComponentPlan {
  id: string;
  name: string;
  type: UIElementType;
  caption: string;
  hubIds: string[];                    // Which hubs this appears in
  overridesPerHub: Record<string, Partial<NodeVisualSpec>>;
}

export interface BackendContract {
  tRPCRouter: string;                  // TypeScript type definitions
  zodSchemas: string;                  // Zod validation schemas
  dataModels: DataModelPlan[];
  apiEndpoints: APIEndpointPlan[];
  authStrategy: AuthStrategyPlan;
  deploymentTargets: BackendTarget[];
}

export interface DataModelPlan {
  name: string;
  fields: { name: string; type: string; required: boolean; unique: boolean; default?: string }[];
  relations: { target: string; type: 'one-to-one' | 'one-to-many' | 'many-to-many' }[];
  indexes: string[][];
}

export interface APIEndpointPlan {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  auth: boolean;
  inputSchema: string;                 // Zod schema as string
  outputSchema: string;                // Zod schema as string
  implementation: 'generated' | 'template' | 'integration';
}

export interface AuthStrategyPlan {
  type: 'session' | 'jwt' | 'api-key' | 'oauth' | 'none';
  providers: string[];
  sessionDuration: number;
  refreshStrategy: 'sliding' | 'fixed';
}
```

**prism-events.ts** — SSE event types for Prism:

```typescript
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
    | 'assembly' | 'backend' | 'deployment' | 'optimization';
  progress: number;                    // 0-100 overall progress
  nodeId?: string;                     // When event is node-specific
  hubId?: string;                      // When event is hub-specific
}
```

---

## 5. Modal Diffusion Pipeline

### Modal App Definition — `modal/prism_app.py`

```python
import modal

app = modal.App("kriptik-prism")

# --- Base Images ---

# GPU image for FLUX.2, SAM 3.1, SGLang
gpu_image = (
    modal.Image.from_registry("nvidia/cuda:12.4.0-runtime-ubuntu24.04")
    .apt_install("git", "wget", "libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "torch==2.5.1", "torchvision", "transformers>=4.48",
        "diffusers>=0.32", "accelerate", "safetensors",
        "sglang[all]>=0.4",
        "segment-anything-2",  # SAM 3.1
        "sharp-node",  # For text compositing
        "Pillow", "numpy", "scipy",
        "httpx", "pydantic>=2.0",
    )
    .run_commands(
        # Pre-download FLUX.2 Klein weights
        "python -c \"from diffusers import FluxPipeline; FluxPipeline.from_pretrained('black-forest-labs/FLUX.2-klein-4B', torch_dtype=torch.float16)\"",
        # Pre-download SAM 3.1 weights (Object Multiplex variant)
        "python -c \"from segment_anything_2 import SAM3Predictor; SAM3Predictor.from_pretrained('facebook/sam3.1-object-multiplex')\"",
    )
)

# CPU image for assembly, planning, orchestration
cpu_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("nodejs", "npm")
    .pip_install("httpx", "pydantic>=2.0", "numpy")
    .run_commands(
        "npm install -g typescript tsx",
        "npm install -g pixi.js@8 @pixi/node",  # PixiJS for server-side bundling
    )
)

# Code generation image (SGLang + model weights)
codegen_image = (
    modal.Image.from_registry("nvidia/cuda:12.4.0-runtime-ubuntu24.04")
    .pip_install(
        "sglang[all]>=0.4", "torch==2.5.1",
        "transformers>=4.48", "auto-gptq",
        "httpx", "pydantic>=2.0",
    )
    .run_commands(
        # Pre-download code model weights (Qwen3-Coder-Next 80B-A3B, AWQ-INT4)
        "python -c \"from transformers import AutoModelForCausalLM; AutoModelForCausalLM.from_pretrained('Qwen/Qwen3-Coder-Next-80B-A3B-AWQ', device_map='auto')\"",
    )
)

# --- Volumes ---
prism_cache = modal.Volume.from_name("kriptik-prism-cache", create_if_missing=True)
prism_outputs = modal.Volume.from_name("kriptik-prism-outputs", create_if_missing=True)

# --- Secrets ---
secrets = modal.Secret.from_name("kriptik-env")
```

### Pipeline Functions

Each pipeline stage is a separate Modal function with appropriate resources:

```python
@app.function(
    image=gpu_image,
    gpu="L40S",
    timeout=120,
    secrets=[secrets],
    volumes={"/cache": prism_cache, "/outputs": prism_outputs},
)
def generate_ui_image(plan_data: dict) -> dict:
    """FLUX.2 Klein: plan → full-page UI mockup image"""
    # Returns: { "image_url": str, "dimensions": {...}, "generation_time_ms": int }

@app.function(
    image=gpu_image,
    gpu="L4",
    timeout=60,
    secrets=[secrets],
    volumes={"/cache": prism_cache, "/outputs": prism_outputs},
)
def segment_ui_image(image_data: dict, plan_data: dict) -> dict:
    """SAM 3.1 + Object Multiplex + text prompts: full-page image → segmented elements.
    Processes up to 16 objects per forward pass via shared memory.
    For typical 20-50 element UI: 2-3 forward passes."""
    # Returns: { "segments": [...], "masks": [...], "hierarchy": {...} }

@app.function(
    image=gpu_image,
    gpu="L4",
    timeout=60,
    secrets=[secrets],
)
def verify_captions(nodes_with_images: list[dict]) -> list[dict]:
    """Vision model: segmented element image + caption → binary pass/fail.
    Verifies each node's caption accurately describes its visual element
    BEFORE code generation begins."""
    # Returns: [{ "nodeId": str, "pass": bool, "correctedCaption": str | None }]

@app.function(
    image=codegen_image,
    gpu="L4",
    timeout=30,
    secrets=[secrets],
    volumes={"/cache": prism_cache},
    min_containers=50,
    buffer_containers=50,
)
def generate_node_code(node_spec: dict) -> dict:
    """SGLang + Qwen3-Coder: node caption → PixiJS/JS code"""
    # Returns: { "code": str, "tokens_used": int, "generation_time_ms": int }

@app.function(
    image=codegen_image,
    gpu="L4",
    timeout=30,
    secrets=[secrets],
    volumes={"/cache": prism_cache},
)
def verify_node_code(node_code: dict, node_spec: dict) -> dict:
    """SWE-RM: code + spec → verification score"""
    # Returns: { "score": float, "pass": bool, "issues": [...] }

@app.function(
    image=cpu_image,
    timeout=60,
    secrets=[secrets],
    volumes={"/outputs": prism_outputs},
)
def assemble_pixijs_bundle(graph_data: dict) -> dict:
    """CPU: verified graph → PixiJS application bundle"""
    # Returns: { "bundle_url": str, "atlas_urls": [...], "size_bytes": int }

@app.function(
    image=cpu_image,
    timeout=300,
    secrets=[secrets],
    volumes={"/outputs": prism_outputs},
    allow_concurrent_inputs=1,
)
def serve_preview(bundle_data: dict) -> str:
    """Dev server + Modal tunnel for live preview"""
    # Returns tunnel URL
```

### Orchestrator — The Main Pipeline

```python
@app.function(
    image=cpu_image,
    timeout=1800,  # 30 min max for full pipeline
    secrets=[secrets],
    volumes={"/cache": prism_cache, "/outputs": prism_outputs},
)
def run_prism_pipeline(config: dict):
    """
    Main pipeline orchestrator. Receives config from Express server.
    Streams NDJSON events to stdout for Modal callback.
    
    Config shape:
    {
      "projectId": str,
      "userId": str,
      "planId": str,
      "plan": PrismPlan,
      "callbackUrl": str,   // POST events here
      "credentials": {...},
      "r2Config": {...},
    }
    """
    import httpx, json, time
    
    callback_url = config["callbackUrl"]
    start_time = time.time()
    
    def emit(event_type: str, data: dict, **kwargs):
        event = {
            "type": event_type,
            "data": data,
            "timestamp": time.time(),
            **kwargs,
        }
        # POST to callback URL (Express server persists to buildEvents)
        httpx.post(callback_url, json=event, timeout=5)
        # Also print NDJSON to stdout for logging
        print(json.dumps(event), flush=True)
    
    plan = config["plan"]
    
    # --- Phase 0: Dependency Pre-Installation ---
    emit("prism_deps_installing", {}, phase="deps", progress=2)
    
    preinstall_dependencies(plan)
    
    emit("prism_deps_installed", {}, phase="deps", progress=4)
    
    # --- Phase 1: Image Generation ---
    emit("prism_image_generating", {"model": plan["diffusionModel"]}, phase="generation", progress=5)
    
    image_result = generate_ui_image.remote(plan)
    
    emit("prism_image_ready", {
        "imageUrl": image_result["image_url"],
        "dimensions": image_result["dimensions"],
    }, phase="generation", progress=15)
    
    # --- Phase 2: SAM 3.1 Segmentation ---
    emit("prism_segmentation_started", {}, phase="generation", progress=18)
    
    seg_result = segment_ui_image.remote(image_result, plan)
    
    emit("prism_segmentation_complete", {
        "nodeCount": len(seg_result["segments"]),
    }, phase="generation", progress=25)
    
    # --- Phase 3: Graph Construction ---
    graph = construct_knowledge_graph(plan, seg_result)
    
    emit("prism_graph_constructed", {
        "nodes": len(graph["nodes"]),
        "edges": len(graph["edges"]),
        "hubs": len(graph["hubs"]),
    }, phase="graph", progress=30)
    
    # --- Phase 4: Caption Verification Blast ---
    emit("prism_caption_verify_started", {
        "totalNodes": len(graph["nodes"]),
    }, phase="caption_verify", progress=32)
    
    nodes_with_images = [
        {"nodeId": node["id"], "imageUrl": node["imageUrl"], "caption": node["caption"]}
        for node in graph["nodes"]
        if node["imageUrl"]
    ]
    
    caption_results = verify_captions.remote(nodes_with_images)
    
    # Repair failed captions
    failed_captions = [r for r in caption_results if not r["pass"]]
    if failed_captions:
        for result in failed_captions:
            node = next(n for n in graph["nodes"] if n["id"] == result["nodeId"])
            if result["correctedCaption"]:
                node["caption"] = result["correctedCaption"]
                node["captionVerified"] = True
                emit("prism_caption_verify_node_result", {
                    "nodeId": result["nodeId"],
                    "pass": False,
                    "repaired": True,
                }, phase="caption_verify", progress=33, nodeId=result["nodeId"])
            else:
                # Retry caption generation from image + plan context
                regenerated = regenerate_caption(node, plan)
                node["caption"] = regenerated
                # Re-verify
                reverify = verify_captions.remote([{
                    "nodeId": node["id"],
                    "imageUrl": node["imageUrl"],
                    "caption": regenerated,
                }])
                if not reverify[0]["pass"]:
                    node["status"] = "failed"
                    emit("prism_caption_verify_node_result", {
                        "nodeId": node["id"],
                        "pass": False,
                        "repaired": False,
                        "flaggedForReview": True,
                    }, phase="caption_verify", progress=33, nodeId=node["id"])
                else:
                    node["captionVerified"] = True
    
    # Mark all passing nodes
    for result in caption_results:
        if result["pass"]:
            node = next(n for n in graph["nodes"] if n["id"] == result["nodeId"])
            node["captionVerified"] = True
    
    emit("prism_caption_verify_complete", {
        "totalVerified": sum(1 for n in graph["nodes"] if n.get("captionVerified")),
        "totalFailed": sum(1 for n in graph["nodes"] if n.get("status") == "failed"),
        "totalRepaired": len(failed_captions) - sum(1 for n in graph["nodes"] if n.get("status") == "failed"),
    }, phase="caption_verify", progress=35)
    
    # --- Phase 5: Texture Atlas Packing ---
    atlas_result = pack_texture_atlases(graph)
    
    emit("prism_atlas_packed", {
        "atlasCount": atlas_result["count"],
    }, phase="graph", progress=37)
    
    # --- Phase 6: Parallel Code Generation ---
    # Only generate code for caption-verified nodes
    verified_nodes = [n for n in graph["nodes"] if n.get("captionVerified")]
    
    emit("prism_codegen_started", {
        "totalNodes": len(verified_nodes),
    }, phase="codegen", progress=38)
    
    node_specs = [build_node_spec(node, graph) for node in verified_nodes]
    
    # Fire all code gen tasks in parallel
    code_results = list(generate_node_code.map(node_specs, order_outputs=False))
    
    emit("prism_codegen_batch_complete", {
        "completed": len(code_results),
    }, phase="codegen", progress=55)
    
    # --- Phase 7: Verification ---
    emit("prism_verification_started", {}, phase="verification", progress=58)
    
    verify_results = list(verify_node_code.map(
        code_results, node_specs, order_outputs=False
    ))
    
    # --- Phase 8: Contamination-Aware Repair ---
    failed_nodes = [r for r in verify_results if not r["pass"]]
    if failed_nodes:
        emit("prism_repair_started", {
            "failedNodes": len(failed_nodes),
        }, phase="repair", progress=65)
        
        # DELETE failed code, regenerate from spec only
        repair_specs = [build_repair_spec(node) for node in failed_nodes]
        repair_results = list(generate_node_code.map(repair_specs, order_outputs=False))
        
        # Re-verify repaired nodes
        repair_verify = list(verify_node_code.map(
            repair_results, repair_specs, order_outputs=False
        ))
        
        # Second-pass failures: provide error description only (no code)
        still_failed = [r for r in repair_verify if not r["pass"]]
        if still_failed:
            # Escalate: error description only, frontier model
            escalation_specs = [build_escalation_spec(node) for node in still_failed]
            # ... escalation logic ...
        
        emit("prism_repair_complete", {
            "repairedNodes": len(failed_nodes) - len(still_failed),
            "escalatedNodes": len(still_failed),
        }, phase="repair", progress=72)
    
    # --- Phase 9: Assembly ---
    emit("prism_assembly_started", {}, phase="assembly", progress=75)
    
    bundle_result = assemble_pixijs_bundle.remote(graph)
    
    emit("prism_assembly_complete", {
        "bundleUrl": bundle_result["bundle_url"],
        "sizeBytes": bundle_result["size_bytes"],
    }, phase="assembly", progress=82)
    
    # --- Phase 10: Backend (parallel with assembly) ---
    emit("prism_backend_codegen_started", {}, phase="backend", progress=78)
    
    backend_result = generate_backend.remote(plan["backendContract"], config)
    
    emit("prism_backend_codegen_complete", {
        "endpoints": len(backend_result["endpoints"]),
    }, phase="backend", progress=88)
    
    # --- Phase 11: Convergence Gate ---
    convergence = run_convergence_gate(graph, bundle_result, backend_result)
    
    emit("prism_convergence_gate_result", {
        "passed": convergence["passed"],
        "issues": convergence.get("issues", []),
    }, phase="backend", progress=92)
    
    # --- Phase 12: Preview ---
    preview_url = serve_preview.remote(bundle_result)
    
    emit("prism_preview_ready", {
        "previewUrl": preview_url,
    }, phase="deployment", progress=98)
    
    # --- Done ---
    emit("prism_build_complete", {
        "previewUrl": preview_url,
        "totalNodes": len(graph["nodes"]),
        "totalTimeMs": int((time.time() - start_time) * 1000),
        "totalCost": calculate_cost(graph),
    }, phase="deployment", progress=100)
```

---

## 6. Server Routes & API Contracts

### New Route File: `server/src/routes/prism.ts`

```typescript
// POST /api/prism/build — Start Prism build (called from execute.ts branch)
// POST /api/prism/plan/approve — Approve generated plan
// POST /api/prism/plan/reject — Reject plan with feedback
// GET  /api/prism/plan/:planId — Get plan details
// GET  /api/prism/graph/:graphId — Get graph details
// POST /api/prism/graph/:graphId/edit — Edit a node in the graph
// POST /api/prism/optimize/:graphId — Trigger overnight optimization
// GET  /api/prism/models — Available diffusion/code models
// GET  /api/prism/config — Default engine configuration
```

### Execute Route Branch

In `server/src/routes/execute.ts`, modify the POST handler:

```typescript
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { projectId, prompt, engineType } = req.body;
  
  // Validate ownership (existing)
  const project = await verifyProjectOwnership(req, projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  // Branch on engine type
  const engine = project.engineType || 'cortex';
  
  if (engine === 'prism') {
    return handlePrismBuild(req, res, project, prompt);
  } else {
    return handleCortexBuild(req, res, project, prompt); // existing logic
  }
});
```

### handlePrismBuild Flow

```typescript
async function handlePrismBuild(req, res, project, prompt) {
  // 1. Generate plan (synchronous — returns plan for user approval)
  const planResult = await generatePrismPlan(project, prompt, req.user);
  
  // 2. Persist plan
  await db.insert(prismPlans).values(planResult);
  
  // 3. Update project status
  await db.update(projects)
    .set({ status: 'planning', updatedAt: new Date() })
    .where(eq(projects.id, project.id));
  
  // 4. Return plan for UI display (user must approve before generation starts)
  return res.json({
    planId: planResult.id,
    plan: planResult,
    status: 'awaiting_approval',
  });
}
```

### Plan Approval Triggers Generation

```typescript
// POST /api/prism/plan/approve
router.post('/plan/approve', requireAuth, async (req, res) => {
  const { planId } = req.body;
  const plan = await db.query.prismPlans.findFirst({
    where: eq(prismPlans.id, planId),
  });
  
  // Update plan status
  await db.update(prismPlans)
    .set({ status: 'generating', approvedAt: new Date() })
    .where(eq(prismPlans.id, planId));
  
  // Dispatch to Modal
  const callbackUrl = `${process.env.API_URL || process.env.BETTER_AUTH_URL}/api/events/callback/${plan.projectId}`;
  
  await startPrismBuild({
    projectId: plan.projectId,
    userId: plan.userId,
    planId: plan.id,
    plan: plan.graphPlan,
    callbackUrl,
    credentials: await getProjectCredentials(plan.projectId),
    r2Config: getR2Config(),
  });
  
  return res.json({ status: 'generating' });
});
```

---

## 7. Client UI Integration

### Engine Selector Component

New component: `client/src/components/builder/EngineSelector.tsx`

```typescript
// Renders engine selection badge/dropdown
// Shows "Cortex" (multi-agent AI) or "Prism" (diffusion pipeline)
// Locked once a build starts
// Uses Radix Select + glass styling to match SpeedDialSelector
```

### Builder.tsx Modifications

```typescript
// In Builder.tsx, add:
// 1. Engine selector in prompt bar area (next to SpeedDialSelector)
// 2. Plan approval view (when Prism plan is pending approval)
// 3. Prism-specific event handling in useEngineEvents

// Plan approval view:
// - Interactive graph visualization of the plan
// - Hub navigation (click through planned pages)
// - Feature list with inferred needs highlighted
// - Approve / Reject with feedback buttons
// - Estimated cost and time display
```

### Prism-Specific Builder Panels

New components:

```
client/src/components/builder/prism/
  PlanApprovalView.tsx        — Interactive plan display + approve/reject
  GraphVisualization.tsx       — D3 or PixiJS graph visualization
  HubNavigator.tsx            — Click through hub/page previews
  NodeInspector.tsx           — Click a node to see its spec/code/image
  GenerationProgress.tsx      — Pipeline progress with phase indicators
  ImagePreview.tsx            — Generated UI image display
  SegmentationOverlay.tsx     — Show segmentation masks over image
  CaptionVerifyStatus.tsx     — Caption verification results per node
  OptimizationDashboard.tsx   — Overnight optimization results
```

### useEngineEvents Hook Extension

Extend the named event type list in `client/src/hooks/useEngineEvents.ts` to include all `prism_*` event types from Section 4. The existing fallback `onmessage` already catches unlisted types, but explicit handlers enable typed state updates.

### New Zustand Stores

```
client/src/store/
  usePrismStore.ts            — Plan, graph, pipeline state
  usePrismConfigStore.ts      — Engine configuration
```

**usePrismStore shape:**

```typescript
interface PrismState {
  currentPlan: PrismPlan | null;
  currentGraph: PrismGraph | null;
  pipelinePhase: 'idle' | 'planning' | 'awaiting_approval' | 'generating'
    | 'deps' | 'codegen' | 'caption_verifying' | 'verifying' | 'repairing'
    | 'assembling' | 'backend' | 'deploying' | 'complete' | 'failed';
  progress: number;                    // 0-100
  generatedImageUrl: string | null;
  segmentationMasks: SegmentMask[] | null;
  nodeStatuses: Record<string, NodeStatus>;
  captionVerifyResults: Record<string, CaptionVerifyResult>;
  previewUrl: string | null;
  
  // Actions
  setPlan: (plan: PrismPlan) => void;
  approvePlan: (planId: string) => Promise<void>;
  rejectPlan: (planId: string, feedback: string) => Promise<void>;
  handlePrismEvent: (event: PrismEvent) => void;
  editNode: (graphId: string, nodeId: string, changes: NodeEdit) => Promise<void>;
}
```

---

## 8. Planning Phase

### Intent Parsing

**Model:** Anthropic Claude Opus 4.6 (via existing ANTHROPIC_API_KEY)  
**Why:** Already available in Kriptik's env, highest code-related intent interpretation quality (80.9% SWE-bench), native structured output.

**Prompt structure (reasoning-first pattern):**

```
System: You are the planning engine for Kriptik Prism, a diffusion-based app builder.
Parse the user's request into a structured AppIntent. Think step by step in the 
"reasoning" field BEFORE committing to structured fields.

User: {prompt}

Context:
- Connected services: {serviceInstances}
- Available credentials: {credentialProviders}
- Project history: {previousBuilds}

Output JSON matching the AppIntent schema. Include reasoning first.
```

**Structured output enforcement:** Use Anthropic's native tool_use with the AppIntent schema as the tool input schema. This gives 100% schema compliance without post-processing.

### Competitive Analysis (Optional, User-Toggled)

When `enableCompetitiveAnalysis` is true:

1. Extract reference URLs from intent
2. For each URL: Firecrawl `/scrape` with `formats=["branding", "screenshot@fullPage", "markdown"]`
3. Vision analysis of screenshots via Claude (layout, hierarchy, components)
4. Synthesize: common patterns, design tokens, feature matrix

**Cost:** ~$10-30 per cycle. Only run when user enables it.

### Inferred Needs Mapping

Chain-of-thought expansion from parsed intent:

1. Map `appType` → feature dependency tree (domain knowledge graph in `packages/prism-engine/src/planning/domain-knowledge.ts`)
2. Expand first-order dependencies to second/third-order
3. Commercial classification triggers: landing page, pricing, auth, payment, analytics, SEO
4. Security requirements: input validation, CSRF, XSS prevention, rate limiting, auth
5. Multi-agent debate: challenger agent questions completeness, defender justifies

### Application Domain Knowledge Graph — Schema & Initial Implementation

The domain knowledge graph maps app types to their required features and components. It is stored as a TypeScript module in `packages/prism-engine/src/planning/domain-knowledge.ts`. It is NOT a database table — it is a versioned code artifact that evolves with the product.

**Schema:**

```typescript
export interface AppTypeDependencyTree {
  appType: AppType;
  firstOrderDeps: {
    name: string;
    uiPatterns: UIElementType[];
    required: boolean;
  }[];
  secondOrderDeps: {
    name: string;
    triggeredBy: string;   // Which first-order dep triggers this
    uiPatterns: UIElementType[];
  }[];
  securityRequirements: string[];
  infrastructureNeeds: string[];
}

// Example entry:
const LANDING_PAGE: AppTypeDependencyTree = {
  appType: 'landing-page',
  firstOrderDeps: [
    { name: 'hero-section', uiPatterns: ['hero-section', 'button'], required: true },
    { name: 'navigation', uiPatterns: ['navbar'], required: true },
    { name: 'social-proof', uiPatterns: ['card', 'avatar', 'badge'], required: false },
    { name: 'pricing', uiPatterns: ['card', 'button', 'toggle'], required: false },
    { name: 'cta-section', uiPatterns: ['hero-section', 'button', 'input'], required: true },
    { name: 'footer', uiPatterns: ['footer'], required: true },
  ],
  secondOrderDeps: [
    { name: 'form-validation', triggeredBy: 'cta-section', uiPatterns: ['input', 'alert'] },
    { name: 'loading-states', triggeredBy: 'cta-section', uiPatterns: ['spinner', 'skeleton'] },
    { name: 'error-handling', triggeredBy: 'cta-section', uiPatterns: ['toast', 'alert'] },
    { name: 'mobile-nav', triggeredBy: 'navigation', uiPatterns: ['drawer', 'button'] },
  ],
  securityRequirements: ['input-validation', 'xss-prevention', 'csrf-protection'],
  infrastructureNeeds: ['analytics', 'seo-meta-tags'],
};
```

**Initial app types to implement (20):** landing-page, saas-dashboard, e-commerce, portfolio, blog, social-platform, marketplace, crm, project-management, analytics-dashboard, ai-tool, video-platform, messaging-app, booking-system, documentation, admin-panel, authentication-flow, settings-page, onboarding-flow, error-pages

Each entry follows the same `AppTypeDependencyTree` shape. Build all 20 in the initial implementation.

### Plan Generation

**Model:** Claude Opus 4.6 (complex reasoning required for graph construction)

**Output:** Complete `PrismPlan` with all hubs, elements, shared components, data models, services, navigation graph, and backend contract.

**Critical:** Every element's `caption` field must be SELF-CONTAINED — it must fully describe the element's appearance, behavior, and context without reference to other elements. This is what gets sent to each parallel code generation container.

### Plan Presentation & Approval

The plan is returned to the client and rendered in `PlanApprovalView`. The user can:

- Browse hub layouts
- See the element list per hub
- Review inferred needs (highlighted differently from user-specified)
- See estimated cost and time
- Approve → triggers generation pipeline
- Reject with feedback → re-generates plan incorporating feedback

---

## 9. Image Generation & Segmentation Phase

### FLUX.2 Image Generation

**Model selection:**
- `flux2-klein` (4B, Apache 2.0): Draft/preview, <0.5s, L40S GPU
- `flux2-pro` (API): Production quality, 4MP, $0.03/megapixel
- `flux2-dev` (32B, non-commercial): Highest open-weight quality

**Pipeline:**
1. Construct FLUX.2 prompt from hub plan (layout description, element positions, style tokens)
2. Apply ControlNet Union Pro 2.0 conditioning if wireframe/reference provided (Canny mode, strength 0.6-0.7)
3. Generate at target resolution (default 1024×1024, up to 2048×2048)
4. Apply text compositing for functional text via Sharp+SVG (button labels, nav items, headings)
5. Upload to Cloudflare R2
6. Return image URL + metadata

**Per-hub generation:** Each hub gets its own generated image. Style consistency maintained via FLUX.2 multi-reference mode (pass up to 10 reference images from previous hubs).

### SAM 3.1 Segmentation

**Model:** SAM 3.1 with Object Multiplex (released March 27, 2026)

SAM 3.1 introduces Object Multiplex, a shared-memory approach for joint multi-object processing that handles up to 16 objects in a single forward pass. Objects reason about each other through shared memory, yielding ~7× speedup at 128 objects on H100 with zero loss in segmentation accuracy. For a typical UI page with 20–50 elements, SAM 3.1 processes everything in 2–3 forward passes through Object Multiplex bucketing.

The underlying architecture (848M parameters) features Promptable Concept Segmentation (PCS) — it accepts text prompts like "button", "text field", "card", "navbar" and segments all matching instances simultaneously across the image.

**Pipeline:**
1. For each hub image, generate text prompts from the element plan: "navigation bar", "hero section card", "submit button", etc.
2. SAM 3.1 Object Multiplex segments all instances of each concept, bucketing up to 16 per forward pass
3. Extract bounding boxes, masks, and hierarchy from containment relationships
4. Match segments to planned elements by spatial proximity + semantic similarity
5. Crop individual element images from masks
6. Upload element images to R2

**Fallback:** If SAM 3.1 text prompts miss elements, fall back to Grounding DINO 1.5 for detection + SAM 3.1 for mask refinement.

### Post-Segmentation Verification

A separate verification pass using a vision model (Claude with vision) confirms:
- All planned elements were detected
- No spurious segments
- Hierarchy matches plan
- Text content is legible in element crops

Binary pass/fail. Failures trigger re-generation with adjusted prompts.

---

## 10. Knowledge Graph Construction

### Graph Assembly

From plan + segmentation results, construct the knowledge graph:

1. **Create nodes** from segmented elements. Each node gets:
   - UUID (persistent across edits)
   - Element image URL
   - Caption from plan
   - Position from segmentation bounding box
   - Hub membership from plan
   - Visual spec extracted from image analysis
   - Behavior spec from plan

2. **Create edges** from plan relationships:
   - `contains`: parent-child layout containment (from mask hierarchy)
   - `navigates-to`: cross-hub navigation links
   - `triggers`: interaction targets (button → modal, etc.)
   - `data-flow`: component data dependencies
   - `shares-state`: state sharing between nodes

3. **Create hubs** from plan, linking to their node sets

4. **Identify shared nodes** (elements appearing in multiple hubs) and create canonical definitions with per-hub overrides

### Caption Verification Blast

**This step runs AFTER graph construction and BEFORE atlas packing and code generation.**

**Purpose:** Verify that each node's caption accurately and completely describes the segmented element before the caption is sent to 100+ parallel code generation containers. Catching caption errors here prevents widespread code gen failure.

**Implementation:**

1. For each node with a segmented image: send the element image + the node's caption to a vision model (Claude with vision)
2. The model evaluates: "Does this caption completely and accurately describe this UI element? Would an engineer produce the correct PixiJS code from this caption alone?"
3. Binary pass/fail result per node
4. Failed nodes get their captions regenerated using the image + plan context
5. Max 2 caption repair attempts before the node is flagged for manual review

**Caption repair prompt:**
```
Given this segmented UI element image and the original plan context, write a complete, 
self-contained caption that fully describes this element's appearance, behavior, and 
context. An engineer must be able to implement the correct PixiJS code from this 
caption alone, without seeing the image.

Plan context: {hub.description}, {element.type}, {element.interactions}
Current caption (FAILED verification): {node.caption}
```

**Cost:** ~$0.01 per node for the vision call. For a typical 50-node app: ~$0.50 total. This prevents ~$0.10+ in wasted code gen costs per bad caption that would have caused widespread failure.

**Events emitted:**
- `prism_caption_verify_started` — start of verification
- `prism_caption_verify_node_result` — per-node pass/fail/repair status
- `prism_caption_verify_complete` — summary (total verified, failed, repaired)

### Texture Atlas Packing

Pack all element images into 2048×2048 texture atlases:

- 2px padding between sprites (prevents texture bleeding)
- MaxRects bin packing algorithm
- Target: 1-3 atlases for typical app (20-50 elements)
- Each atlas = ~16MB GPU memory (RGBA8)
- Record atlas regions per node in graph metadata

### Graph Serialization

Serialize to JSON matching the `PrismGraph` schema. Store in `prism_graphs` table. This JSON IS the application — it persists through runtime, editing, and optimization.

---

## 11. Parallel Code Generation Phase

### SGLang Server Configuration

**Engine:** SGLang with RadixAttention  
**Model:** Qwen3-Coder-Next 80B-A3B (AWQ-INT4 quantized)  
**Hardware:** L4 GPUs (24GB VRAM, 300 GB/s bandwidth)  
**Expected throughput:** 400-1000 tok/s per container  
**Snippet size:** ~200 tokens per element

### Shared System Prompt (Cached via RadixAttention)

```
You are a code generator for Kriptik Prism. Generate a self-contained PixiJS v8 
component module for a UI element.

CONSTRAINTS:
- Use PixiJS v8 API only (Container, Sprite, Graphics, Text, NineSliceSprite)
- Export a single function: createNode(config: NodeConfig): Container
- Handle all events internally (pointerover, pointerout, pointertap)
- Use GSAP for animations
- All text uses BitmapText or programmatic rendering (no DOM text)
- Code must be synchronous (no async/await in render path)
- Return a PixiJS Container with all children attached

OUTPUT: Only the JavaScript code. No explanation. No markdown fences.
```

This prompt is IDENTICAL across all 100+ containers → RadixAttention caches the KV entries → up to 6.4× throughput gain.

### Per-Node Prompt

Appended after the shared system prompt:

```
ELEMENT SPECIFICATION:
{node.caption}

VISUAL:
- Colors: {node.visualSpec.colors}
- Typography: {node.visualSpec.typography}
- Effects: {node.visualSpec.effects}

BEHAVIOR:
- Interactions: {JSON.stringify(node.behaviorSpec.interactions)}
- Data bindings: {JSON.stringify(node.behaviorSpec.dataBindings)}

NEIGHBORS:
- Parent: {parentNode.id} ({parentNode.type})
- Siblings: {siblingNodes.map(n => `${n.id} (${n.type})`).join(', ')}
- Children: {childNodes.map(n => `${n.id} (${n.type})`).join(', ')}

ATLAS REGION:
- Atlas: {node.atlasRegion.atlasIndex}
- Source rect: {node.atlasRegion.x}, {node.atlasRegion.y}, {node.atlasRegion.width}, {node.atlasRegion.height}
```

### Dispatch Strategy

```python
# Only dispatch caption-verified nodes
verified_nodes = [n for n in graph["nodes"] if n.get("captionVerified")]
node_specs = [build_node_spec(node, graph) for node in verified_nodes]

# Use Modal Function.map with order_outputs=False for maximum throughput
results = list(generate_node_code.map(node_specs, order_outputs=False))
```

As each result arrives, immediately dispatch to verification (don't wait for all code gen to complete).

---

## 12. Verification & Repair Pipeline

### SWE-RM Verification

**Model:** SWE-RM 30B-A3B (3B active, MoE)  
**Input:** Generated code + node caption/spec  
**Output:** Continuous score [0, 1] + issue list

**Scoring thresholds:**
- ≥ 0.85: Pass → proceed to assembly
- 0.60-0.84: Borderline → regenerate once from spec (no code shown)
- < 0.60: Clear fail → regenerate from spec, then escalate if still failing

### Contamination-Aware Repair Protocol

**CRITICAL INVARIANT:** Never show broken code to the repair model.

```
Attempt 1 (from spec only):
  Input: node.caption + node.visualSpec + node.behaviorSpec
  NO CODE from previous attempt
  Model: same code model (Qwen3-Coder-Next)

Attempt 2 (error description only):
  Input: node.caption + node.visualSpec + node.behaviorSpec + errorDescription
  errorDescription is a NATURAL LANGUAGE description of what went wrong
  NOT the error message or stack trace from the broken code
  Model: same code model

Attempt 3 (escalation to frontier):
  Input: full context including spec + error description + node relationships
  Model: Claude Opus 4.6 via Anthropic API
  Cost: higher, but only ~5-15% of nodes reach here
```

### Dependency Pre-Installation

At plan approval time (before ANY code generation begins), pre-install all dependencies the plan requires. This runs as step 6 in the pipeline, after plan approval and before image generation.

**Implementation:**

1. Parse the plan's `services` and `integrations` for required npm packages
2. Parse any `customCode` fields in element plans for import statements
3. Build a unified dependency manifest
4. Pre-install all dependencies in the code generation container image using Modal's `Image.pip_install()` / `Image.run_commands("npm install ...")`
5. If using Mercury Coder API (not self-hosted), pre-validate that the API endpoint is reachable

**Implementation in `modal/prism/utils/deps.py`:**

```python
BASE_DEPENDENCIES = [
    "pixi.js", "@pixi/node", "gsap", "typescript",
    # ... all base image dependencies
]

def extract_dependencies_from_plan(plan: dict) -> list[str]:
    """Extract all npm/pip dependencies from plan services, integrations, and custom code."""
    deps = set()
    
    # From services
    for service in plan.get("services", []):
        deps.update(service.get("requiredPackages", []))
    
    # From integrations
    for integration in plan.get("integrations", []):
        deps.update(integration.get("requiredPackages", []))
    
    # From custom code imports
    for hub in plan.get("hubs", []):
        for element in hub.get("elements", []):
            if element.get("customCode"):
                deps.update(parse_imports(element["customCode"]))
    
    return list(deps)

def preinstall_dependencies(plan: dict):
    """Pre-install plan-specific dependencies not in the base image."""
    deps = extract_dependencies_from_plan(plan)
    additional = [d for d in deps if d not in BASE_DEPENDENCIES]
    if additional:
        # Use Modal's image extension for dynamic deps
        extended_image = codegen_image.pip_install(*additional)
        # Code gen functions use the extended image for this build
```

---

## 13. PixiJS Assembly & Rendering

### Bundle Structure

```
bundle/
  index.html              — Entry point
  app.js                  — PixiJS application setup
  graph.json              — Serialized knowledge graph
  nodes/
    {nodeId}.js           — Per-node code modules
  atlases/
    atlas-0.png           — Texture atlas 0
    atlas-1.png           — Texture atlas 1
  fonts/
    {font}.fnt            — MSDF font atlases
  shared/
    manager.js            — Hub manager (navigation, shared nodes)
    adapter.js            — Graph-to-tree adapter for PixiJS
    animations.js         — Shared animation utilities
    state.js              — Application state management
```

### Graph-to-Tree Adapter

Bridges the bipartite DAG to PixiJS's single-parent tree:

```javascript
class GraphToTreeAdapter {
  constructor(graph, pixiApp) {
    this.graph = graph;
    this.app = pixiApp;
    this.hubContainers = new Map();  // hubId → PixiJS Container
    this.nodeDisplayObjects = new Map();  // nodeId → PixiJS DisplayObject
    this.activeHubId = null;
  }

  activateHub(hubId) {
    // Deactivate current hub
    if (this.activeHubId) {
      this.hubContainers.get(this.activeHubId).visible = false;
    }
    
    // Activate new hub
    const hub = this.graph.hubs.find(h => h.id === hubId);
    let container = this.hubContainers.get(hubId);
    
    if (!container) {
      container = new Container();
      container.isRenderGroup = true;  // PixiJS v8 Render Group
      this.hubContainers.set(hubId, container);
      this.app.stage.addChild(container);
    }
    
    // Reparent shared nodes to this hub's container
    for (const nodeId of hub.sharedNodeIds) {
      const displayObj = this.nodeDisplayObjects.get(nodeId);
      if (displayObj) {
        container.addChild(displayObj);  // Reparent-on-navigate
      }
    }
    
    container.visible = true;
    this.activeHubId = hubId;
  }
}
```

### Rendering Configuration

```javascript
const app = new Application();
await app.init({
  preference: 'webgpu',        // WebGPU preferred, WebGL2 fallback
  width: window.innerWidth,
  height: window.innerHeight,
  antialias: true,
  backgroundColor: 0x000000,
  resolution: window.devicePixelRatio,
  autoDensity: true,
});
```

---

## 14. Backend Generation Pipeline

### Contract-First Architecture

During planning, generate:
1. **tRPC router type definitions** — TypeScript types for all API endpoints
2. **Zod validation schemas** — Input/output validation for all endpoints
3. **Prisma/Drizzle schema** — Data models
4. **Shared templates** — Auth middleware, error handling, logging

### Parallel Backend Code Generation

Each backend node generates independently against its contract slice:

- **API Route Nodes:** Individual serverless functions (one per endpoint)
- **Database Schema Nodes:** Migrations + ORM models
- **Auth Nodes:** JWT/session handling, OAuth integration
- **Integration Nodes:** Stripe, SendGrid, OpenAI client wrappers
- **Middleware Nodes:** CORS, rate limiting, validation

### Convergence Gate (1-3 seconds)

Static analysis only — no runtime:

1. `tsc --noEmit` on combined frontend + backend types
2. AJV validates response shapes against tRPC/OpenAPI schema
3. Route resolution: every frontend API call has a backend handler
4. Data model consistency: frontend form fields match backend schemas

### Deployment Targets

Backend deploys to user-selected targets:

| Target | Deploy Time | Method |
|--------|------------|--------|
| Cloudflare Workers | ~3s | Wrangler API |
| AWS Lambda | ~5s | Pulumi Automation API |
| Vercel Functions | ~10s | Vercel SDK |
| Fly.io Machines | <1s | Machines REST API |
| Supabase Edge Functions | ~5s | Management API |
| Modal | ~2s | Function deployment |

---

## 15. Deployment Pipeline

### Frontend Deployment

The PixiJS bundle deploys as a static site:

1. Bundle assembled in Modal → uploaded to R2
2. Deploy to Vercel via `POST /v13/deployments` (or Cloudflare Pages/Netlify)
3. Set preview URL on project
4. Published apps get `{slug}.kriptik.app` subdomain

### Backend Deployment

Backend services deploy to selected targets:

1. Contract validated in convergence gate
2. Each service node deploys independently
3. Environment variables injected from user's vault credentials
4. Health checks confirm all endpoints responsive
5. Backend manifest (endpoint URLs, credentials) stored in `prism_graphs.backendManifest`

### Infrastructure Pre-Provisioning

Expensive resources (databases, auth services) are pre-provisioned in warm pools:

- Supabase projects: pool of 10 pre-created projects
- Cloudflare KV/D1/R2: instant provisioning, no pool needed
- Lambda/API Gateway: created on demand (~10s combined)

---

## 16. Live Preview via Modal Tunnel

### How It Works

1. Assembly phase produces a complete bundle directory
2. A Modal function starts a lightweight dev server (Vite in preview mode or http-server)
3. Modal tunnel exposes the dev server via HTTPS URL
4. URL returned to client via `prism_preview_ready` SSE event
5. Builder preview iframe loads the tunnel URL
6. For edits: only changed node code regenerates → dev server hot-reloads

### Implementation

```python
@app.function(
    image=cpu_image,
    timeout=3600,     # 1 hour preview session
    secrets=[secrets],
    volumes={"/outputs": prism_outputs},
)
@modal.web_server(8080)
def serve_preview(bundle_path: str):
    """Serves the assembled bundle via Modal tunnel"""
    import subprocess
    subprocess.Popen(
        ["npx", "serve", bundle_path, "-l", "8080", "--cors"],
        cwd="/outputs",
    )
```

The tunnel URL is the same format Kriptik already uses for Cortex previews — the `previewUrl` field in the projects table.

---

## 17. Overnight Optimization System

### GEPA Integration

When user enables optimization:

1. `POST /api/prism/optimize/:graphId` triggers optimization
2. Modal dispatches GEPA overnight runner
3. GEPA proposer-evaluator per node (parallel across all nodes)
4. Phase 1 (hours 1-4): Per-node PixiJS optimization
5. Phase 2 (hours 4-6): Graph-level structural optimization
6. Phase 3 (hours 6-8): Integration testing + visual regression
7. Results stored in `prism_graphs.optimizationReport`
8. SSE event `prism_optimization_complete` when done

### Optimization Targets

Per-node: `cacheAsTexture()`, shared `GraphicsContext`, `BitmapText`, `cullable`, scissor rect masks  
Graph-level: Shared component extraction, render order optimization, dead node elimination, node fusion, preloading edges

---

## 18. Environment Variables

### New Variables Required

```bash
# Modal Prism Pipeline
MODAL_PRISM_ENABLED=true
MODAL_PRISM_SPAWN_URL=https://...modal.run/...

# Cloudflare R2 (image/asset storage)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=kriptik-prism-assets
R2_PUBLIC_URL=https://assets.kriptik.app

# HuggingFace (model access — may reuse existing HF_API_KEY)
HF_TOKEN=

# Optional: External inference APIs (if not self-hosting)
FAL_API_KEY=
REPLICATE_API_TOKEN=
RUNPOD_API_KEY=
RUNPOD_ENDPOINT_ID=

# Deployment targets (user provides via OAuth/credentials)
# These come from the credentials table, not env vars
```

---

## 19. Testing Specification

### Unit Tests

Location: `packages/prism-engine/src/__tests__/`

```
planning/
  intent-parser.test.ts        — AppIntent schema validation
  plan-generator.test.ts       — Plan completeness checks
  needs-mapper.test.ts         — Inferred needs accuracy
  domain-knowledge.test.ts     — All 20 app types have valid dependency trees

graph/
  graph-construction.test.ts   — Node/edge/hub assembly
  atlas-packer.test.ts         — Bin packing correctness
  graph-to-tree.test.ts        — PixiJS adapter logic
  shared-nodes.test.ts         — Reparent-on-navigate

caption/
  caption-verify.test.ts       — Caption verification pass/fail routing
  caption-repair.test.ts       — Caption regeneration from image + plan

codegen/
  prompt-builder.test.ts       — System prompt + per-node prompt construction
  codegen-dispatch.test.ts     — Parallel dispatch logic
  deps-extractor.test.ts       — Dependency extraction from plan

verification/
  scoring.test.ts              — Threshold routing
  repair-protocol.test.ts      — Contamination-aware repair (never shows broken code)

assembly/
  bundler.test.ts              — Bundle structure validation
  pixijs-setup.test.ts         — PixiJS initialization

backend/
  contract-generator.test.ts   — tRPC/Zod schema generation
  convergence-gate.test.ts     — Type checking, route resolution
```

### Integration Tests

Location: `packages/prism-engine/src/__integration__/`

```
pipeline.test.ts               — Full pipeline: prompt → plan → approve → generate
modal-dispatch.test.ts         — Modal function invocation + event callback
r2-upload.test.ts              — Image upload/retrieval
sse-events.test.ts             — Event flow through buildEvents → SSE stream
caption-verify-pipeline.test.ts — Graph → caption verify → atlas → codegen flow
```

### E2E Tests

Location: `tests/e2e/prism/`

```
build-flow.test.ts             — User creates project → selects Prism → enters prompt
                                  → approves plan → waits for build → sees preview
edit-flow.test.ts              — User edits a node → sees updated preview
optimization-flow.test.ts      — User triggers optimization → sees report
```

### Pipeline Smoke Tests

Location: `tests/smoke/prism/`

```
quick-build.test.ts            — Simple landing page: prompt → plan → generate → preview
                                  Must complete in <60 seconds
backend-build.test.ts          — Landing page + auth + API: full stack generation
                                  Must complete in <90 seconds
```

### Test Configuration

```typescript
// vitest.config.ts (updated)
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/prism-engine/src/__tests__/**/*.test.ts',
      'packages/cortex-engine/src/__tests__/**/*.test.ts',
    ],
    testTimeout: 30000,
    pool: 'forks',
  },
});
```

---

## 20. RALPH Loop & Build Phases

### RALPH = Read, Audit, Lint, Patch, Halt-check

Every implementation session follows this loop:

1. **Read** — Read this spec section for the current phase before writing code
2. **Audit** — Check existing code for conflicts/duplicates before adding new code
3. **Lint** — Run `tsc --noEmit` after every file change
4. **Patch** — Make targeted changes; never rewrite files wholesale
5. **Halt-check** — After each phase, verify against acceptance criteria before proceeding

### Implementation Phases (Ordered by Dependency)

**Phase 1: Foundation** (no dependencies)
- [ ] Add `engineType` and `prismConfig` columns to projects table
- [ ] Create `prism_plans`, `prism_graphs`, `prism_node_assets` tables
- [ ] Add new type files to `packages/shared-interfaces/src/`
- [ ] Create `packages/prism-engine/` package skeleton
- [ ] Create `packages/prism-engine/src/planning/domain-knowledge.ts` with all 20 app type dependency trees
- [ ] Add R2 client utility to server
- [ ] Add new env vars to `.env.example`
- [ ] Update CI to typecheck prism-engine package

**Acceptance:** `pnpm tsc --noEmit` passes across all packages. New tables exist in schema.ts. R2 client can upload/download. All 20 app type entries in domain-knowledge.ts are valid.

**Phase 2: Server Routes** (depends on Phase 1)
- [ ] Add engine type branch in `POST /api/execute`
- [ ] Create `server/src/routes/prism.ts` with all routes
- [ ] Add Prism SSE event types to events route
- [ ] Mount prism routes in server `index.ts`
- [ ] Add `engineType` to project creation route

**Acceptance:** All new routes respond correctly. Engine branching works. Events flow through SSE.

**Phase 3: Client Engine Selection** (depends on Phase 2)
- [ ] Create `EngineSelector` component
- [ ] Add to `Builder.tsx` prompt bar area
- [ ] Add to `NewProjectModal`
- [ ] Create `usePrismStore` and `usePrismConfigStore`
- [ ] Add Prism event handlers to `useEngineEvents`
- [ ] Create Prism builder panel components (PlanApprovalView, CaptionVerifyStatus, etc.)

**Acceptance:** User can select engine. Prism events render in builder UI. Plan approval view works.

**Phase 4: Modal Pipeline** (depends on Phase 1)
- [ ] Create `modal/prism_app.py` with all function definitions
- [ ] Create `modal/prism/` directory with all worker modules
- [ ] Implement orchestrator pipeline (22-step sequence)
- [ ] Implement FLUX.2 worker
- [ ] Implement SAM 3.1 worker (with Object Multiplex bucketing)
- [ ] Implement caption verification worker
- [ ] Implement code gen worker with SGLang
- [ ] Implement SWE-RM verification worker
- [ ] Implement assembly worker
- [ ] Implement preview server
- [ ] Implement dependency pre-installation utility
- [ ] Deploy to Modal and verify health endpoint

**Acceptance:** `modal deploy modal/prism_app.py` succeeds. Health endpoint responds. Individual workers execute correctly in isolation.

**Phase 5: Planning Pipeline** (depends on Phases 2, 4)
- [ ] Implement intent parsing (Anthropic SDK)
- [ ] Implement inferred needs mapping (domain knowledge graph, all 20 app types)
- [ ] Implement plan generation
- [ ] Implement plan → graph plan conversion
- [ ] Implement backend contract generation
- [ ] Wire plan routes to Modal planning worker
- [ ] Test: prompt → plan → display in UI

**Acceptance:** A text prompt produces a complete plan with hubs, elements, and backend contract. Plan displays in PlanApprovalView.

**Phase 6: Generation Pipeline** (depends on Phases 4, 5)
- [ ] Wire plan approval → dependency pre-installation → Modal orchestrator dispatch
- [ ] Implement FLUX.2 image generation from plan
- [ ] Implement SAM 3.1 segmentation with text prompts and Object Multiplex
- [ ] Implement graph construction from segments
- [ ] Implement caption verification blast (vision model per node, repair loop)
- [ ] Implement texture atlas packing
- [ ] Implement parallel code generation dispatch (caption-verified nodes only)
- [ ] Implement SWE-RM verification
- [ ] Implement contamination-aware repair
- [ ] Implement PixiJS assembly
- [ ] Upload all assets to R2
- [ ] Test: approved plan → complete bundle

**Acceptance:** An approved plan produces a working PixiJS bundle. All nodes have verified captions and verified code. Caption verification catches bad specs before code gen. Bundle loads in a browser.

**Phase 7: Backend Generation** (depends on Phase 6)
- [ ] Implement contract-first code generation
- [ ] Implement per-target deployment (Cloudflare Workers, Lambda, Vercel, etc.)
- [ ] Implement convergence gate (tsc + AJV + route resolution)
- [ ] Wire backend manifest to graph
- [ ] Test: plan with backend → deployed endpoints

**Acceptance:** Backend endpoints deploy and respond correctly. Convergence gate catches type mismatches.

**Phase 8: Preview & Deployment** (depends on Phases 6, 7)
- [ ] Implement Modal tunnel preview server
- [ ] Wire preview URL to project + SSE event
- [ ] Implement frontend deployment (Vercel SDK)
- [ ] Implement publish flow for Prism projects
- [ ] Test: complete build → live preview → publish

**Acceptance:** Live preview loads in builder iframe. Published app accessible at slug.kriptik.app.

**Phase 9: Editing & Iteration** (depends on Phase 8)
- [ ] Implement node editing (graph mutation → single node regen)
- [ ] Implement hub navigation in preview
- [ ] Implement node inspector (click to see code/image/spec)
- [ ] Test: edit a node → see updated preview

**Acceptance:** Editing a node regenerates only that node's code. Preview updates within 5 seconds.

**Phase 10: Testing & Hardening** (depends on all)
- [ ] Write all unit tests from Section 19
- [ ] Write integration tests
- [ ] Write E2E tests
- [ ] Write pipeline smoke tests
- [ ] Add prism tests to CI
- [ ] Error handling audit
- [ ] Credit accounting verification
- [ ] Rate limiting for Prism routes

**Acceptance:** All tests pass. CI green. Smoke test completes in <60 seconds.

---

## 21. Credit & Cost Accounting

### Cost Model

| Stage | Resource | Cost per Run |
|-------|----------|-------------|
| Planning | Claude Opus 4.6 API | ~$0.05 |
| Image Gen | FLUX.2 Klein on L40S | ~$0.002 |
| Segmentation | SAM 3.1 on L4 | ~$0.001 |
| Caption Verify | Vision model (50 nodes) | ~$0.50 |
| Code Gen (100 nodes) | 100× L4 containers | ~$0.11 |
| Verification | SWE-RM on L4 | ~$0.01 |
| Repair (~15%) | Re-dispatch to code gen | ~$0.01 |
| Assembly | CPU | ~$0.001 |
| Backend Gen | 20× L4 containers | ~$0.02 |
| **Total** | | **~$0.70** |

### Credit Mapping

1 credit = $0.01. A typical Prism build costs ~70 credits.

Record in `creditTransactions`:
```typescript
{
  type: 'build_deduction',
  amount: -70,
  description: 'Prism build: [project name]',
  projectId: project.id,
}
```

---

## 22. SSE Event Types

All Prism events use the existing SSE infrastructure. Events are persisted to `buildEvents` table with `eventType` matching the `PrismEventType` enum from Section 4.

The client's `useEngineEvents` hook routes events to `usePrismStore.handlePrismEvent()` when the event type starts with `prism_`.

---

## 23. File Storage

### Cloudflare R2

**Bucket:** `kriptik-prism-assets`  
**Public URL:** `https://assets.kriptik.app/{path}`

**Storage layout:**
```
{projectId}/
  {graphVersion}/
    images/
      hub-{hubId}.png          — Full-page hub mockups
      node-{nodeId}.png        — Segmented element images
    atlases/
      atlas-{index}.png        — Texture atlases
    bundles/
      frontend/                — Assembled PixiJS bundle
      backend/                 — Backend code artifacts
    graph.json                 — Serialized knowledge graph
```

**Server utility:** `server/src/utils/r2.ts`

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function uploadToR2(key: string, body: Buffer, contentType: string): Promise<string> {
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}
```

---

## 24. Error Handling & Recovery

### Pipeline Error Strategy

Each pipeline stage has independent error handling:

1. **Image generation failure:** Retry with adjusted prompt (2 attempts), then fail with user-facing error
2. **Segmentation failure:** Fall back to Grounding DINO 1.5 + SAM 3.1. If still fails, fail build
3. **Caption verification failure:** Regenerate caption from image + plan context. Max 2 attempts per node. Unrecoverable nodes flagged for manual review (build continues without them)
4. **Code gen failure:** Contamination-aware repair protocol (Section 12). Max 3 attempts per node
5. **Verification failure:** Repair protocol. Unrecoverable nodes marked as `failed` in graph
6. **Assembly failure:** Retry once. If fails, fail build with diagnostic
7. **Backend failure:** Per-endpoint retry. Failed endpoints excluded from manifest with warning
8. **Deployment failure:** Retry with exponential backoff. Fail after 3 attempts

### User-Facing Errors

All errors emit a `prism_build_error` SSE event with:
```typescript
{
  type: 'prism_build_error',
  data: {
    phase: string,           // Which phase failed
    message: string,         // User-friendly error message
    nodeId?: string,         // If node-specific
    recoverable: boolean,    // Can the user retry?
    suggestion: string,      // What the user can do
  }
}
```

### Build State Recovery

If Modal container crashes mid-pipeline:
1. Graph state is persisted after each phase
2. On restart, check `prism_graphs.status` to determine resume point
3. Resume from last completed phase
4. Already-verified nodes are not re-generated

---

*End of specification v1.1. This document is the canonical source of truth.*  
*Any implementation that deviates must document the deviation in `docs/spec-deviations-prism.md`.*
