# KripTik System Sort — 154 Systems

## Summary
- Total systems cataloged: 154
- Bucket 1 (REPLACED by engine): 75
- Bucket 2 (NEEDED as engine tools): 25
- Bucket 3 (STAYS in app): 43
- Bucket 4 (DELETE entirely): 11

---

## Bucket 1: REPLACED BY ENGINE (delete after integration)

These systems are mechanical build orchestration, verification pipelines, agent management, or AI routing that the new engine's agentic architecture replaces entirely. Sorted by confidence (HIGH first).

---

### 1. Build Loop Orchestrator
- **Path:** `server/src/services/automation/build-loop.ts` (12,883 lines)
- **Did:** 6-phase sequential build pipeline — the entire mechanical build engine
- **Replaced by:** Lead Agent reasoning loop + specialist spawning. The Lead Agent decides what to do next by querying the Brain, not following phases.
- **Confidence:** HIGH

### 2. Enhanced Build Loop
- **Path:** `server/src/services/automation/enhanced-build-loop.ts`, `build-loop-bridge.ts`
- **Did:** Extended build loop with Cursor 2.1+ features and bi-directional bridge to main loop
- **Replaced by:** Engine's agent runtime with streaming, continuous verification as tools
- **Confidence:** HIGH

### 3. Build Loop Runner
- **Path:** `server/src/services/automation/build-loop-runner.ts`
- **Did:** Executed the build loop
- **Replaced by:** `initEngine()` entry point in new engine
- **Confidence:** HIGH

### 4. Build Config
- **Path:** `server/src/services/automation/build-config.ts`
- **Did:** Build configuration and settings (cost ceilings, agent counts, etc.)
- **Replaced by:** Engine's `src/config/` centralized configuration
- **Confidence:** HIGH

### 5. Build Logger
- **Path:** `server/src/services/automation/build-logger.ts`
- **Did:** Build event logging
- **Replaced by:** Brain activity logging (`brain.logActivity()`) + agent event emitter
- **Confidence:** HIGH

### 6. Build Integration Hooks
- **Path:** `server/src/services/automation/build-integration-hooks.ts`
- **Did:** Hooks into build pipeline phases
- **Replaced by:** Brain event subscriptions (`node:created`, `node:updated`, etc.)
- **Confidence:** HIGH

### 7. Autonomous Build Controller
- **Path:** `server/src/services/automation/autonomous-controller.ts`
- **Did:** State machine for autonomous feature plan → implementation
- **Replaced by:** Lead Agent reasoning loop — this IS the agentic version
- **Confidence:** HIGH

### 8. Agent Step Loop
- **Path:** `server/src/services/automation/agent-step-loop.ts`
- **Did:** Individual agent step execution with tsc --noEmit checks
- **Replaced by:** Engine's agent reasoning loop in `runtime.ts` with tool-based verification
- **Confidence:** HIGH

### 9. Build Monitor
- **Path:** `server/src/services/automation/build-monitor.ts`
- **Did:** Error detection and fix orchestration during builds
- **Replaced by:** Agents self-verify using `verify_errors` tool; Lead Agent monitors Brain for errors
- **Confidence:** HIGH

### 10. Error Escalation Engine
- **Path:** `server/src/services/automation/error-escalation.ts`, `error-pattern-library.ts`
- **Did:** 4-level error escalation with pre-escalation instant fixes
- **Replaced by:** Agents reason about errors and decide fix strategy; Brain stores error/resolution nodes
- **Confidence:** HIGH

### 11. Loop Blocker
- **Path:** `server/src/services/automation/loop-blocker.ts`
- **Did:** Detected and prevented infinite loops in build cycles
- **Replaced by:** Agent runtime budget enforcement + context window management (compaction at 80%)
- **Confidence:** HIGH

### 12. Mid-Build Evaluator
- **Path:** `server/src/services/automation/mid-build-evaluator.ts`
- **Did:** Mid-build quality evaluation
- **Replaced by:** Lead Agent continuously evaluates Brain state; `run_full_verification` tool
- **Confidence:** HIGH

### 13. Speculative Executor
- **Path:** `server/src/services/automation/speculative-executor.ts`
- **Did:** Dual-stream speculative execution (fast model + smart validation)
- **Replaced by:** Lead Agent decides model selection per-specialist via `spawn_specialist(model:)`
- **Confidence:** HIGH

### 14. Visual Verifier (Automation)
- **Path:** `server/src/services/automation/visual-verifier.ts`
- **Did:** Screenshot comparison and design analysis
- **Replaced by:** `take_screenshot` + `compare_screenshots` (stub) + `score_design` (stub) tools
- **Confidence:** HIGH

### 15. DAG Task System
- **Path:** `server/src/services/dag/task-dag-generator.ts`
- **Did:** Generated DAG from implementation plans, pre-populated all tasks upfront
- **Replaced by:** Lead Agent maintains living task list in Brain; tasks discovered as agents build
- **Confidence:** HIGH

### 16. Agent Pool Dispatcher
- **Path:** `server/src/services/dag/agent-pool-dispatcher.ts` (146KB)
- **Did:** Ran 2-6 concurrent agents pulling from DAG with file lock coordination
- **Replaced by:** Lead Agent's `spawn_specialist` / `terminate_specialist` tools; Brain replaces file locks
- **Confidence:** HIGH

### 17. File Lock Manager
- **Path:** `server/src/services/dag/file-lock-manager.ts`
- **Did:** Mutex-style file locks for concurrent agent file access
- **Replaced by:** Brain `conflicts_with` edges; specialist domains prevent file contention
- **Confidence:** HIGH

### 18. Team Dispatcher
- **Path:** `server/src/services/teams/team-dispatcher.ts`
- **Did:** Read DEPLOYMENT_ARCHITECTURE.md, formed teams, populated task queue from DAG
- **Replaced by:** Lead Agent reasons about team composition and spawns specialists dynamically
- **Confidence:** HIGH

### 19. Agent Grind Loop
- **Path:** `server/src/services/teams/agent-grind-loop.ts`
- **Did:** Per-agent continuous execution: check inbox → claim task → execute with Claude → broadcast
- **Replaced by:** Engine's agent reasoning loop in `runtime.ts`
- **Confidence:** HIGH

### 20. Task Queue Service
- **Path:** `server/src/services/teams/task-queue-service.ts`
- **Did:** DB-backed task queue with SELECT FOR UPDATE SKIP LOCKED
- **Replaced by:** Brain task nodes; agents query Brain for available work
- **Confidence:** HIGH

### 21. Inbox Service
- **Path:** `server/src/services/teams/inbox-service.ts`
- **Did:** DB-backed inter-agent messaging (discovery, solution, error, request types)
- **Replaced by:** Brain nodes — agents communicate by writing/reading Brain nodes
- **Confidence:** HIGH

### 22. File Domain Service
- **Path:** `server/src/services/teams/file-domain-service.ts`
- **Did:** Glob-based file ownership resolution per team
- **Replaced by:** Specialist domains defined by Lead Agent in Brain; no rigid file ownership
- **Confidence:** HIGH

### 23. Tool Definitions
- **Path:** `server/src/services/teams/tool-definitions.ts`
- **Did:** 24 Claude tools with role-based filtering
- **Replaced by:** Engine's tool registry (`src/tools/index.ts`) with per-specialist tool filtering
- **Confidence:** HIGH

### 24. Verification Swarm
- **Path:** `server/src/services/verification/swarm.ts` (~86KB)
- **Did:** 6-agent parallel verification (error, quality, visual, security, placeholder, design)
- **Replaced by:** `run_full_verification` composite tool; agents invoke individual verify tools when needed
- **Confidence:** HIGH

### 25. Anti-Slop Detector
- **Path:** `server/src/services/verification/anti-slop-detector.ts`
- **Did:** 7-principle anti-slop design manifesto enforcement
- **Replaced by:** 15 anti-slop constraint nodes in template Brain; agents query constraints when building
- **Confidence:** HIGH

### 26. Code Quality Checker
- **Path:** `server/src/services/verification/code-quality.ts`
- **Did:** AI-powered code quality analysis (complexity, DRY, code smells)
- **Replaced by:** `check_placeholders` tool + agent reasoning about code quality
- **Confidence:** HIGH

### 27. Completion Gate Evaluator
- **Path:** `server/src/services/verification/completion-gate-evaluator.ts`
- **Did:** Final arbiter of "DONE" evaluating all completion criteria
- **Replaced by:** `evaluate_intent_satisfaction` tool; Lead Agent evaluates Brain state
- **Confidence:** HIGH

### 28. Continuous Verification
- **Path:** `server/src/services/verification/continuous-verification.ts`
- **Did:** Real-time incremental checks on modified files
- **Replaced by:** Agents verify own work using verify tools; Lead monitors Brain for issues
- **Confidence:** HIGH

### 29. Design Style Agent
- **Path:** `server/src/services/verification/design-style-agent.ts`
- **Did:** Blocking design verification with 85+ score threshold
- **Replaced by:** `score_design` tool (stub) + design_reference Brain nodes + agent reasoning
- **Confidence:** HIGH

### 30. Error Checker
- **Path:** `server/src/services/verification/error-checker.ts`
- **Did:** 5-second polling for TypeScript/ESLint/runtime errors
- **Replaced by:** `verify_errors` tool — agents call when they reason they should
- **Confidence:** HIGH

### 31. Functional Checklist Verifier
- **Path:** `server/src/services/verification/functional-checklist-verifier.ts`
- **Did:** Verified every UI element in intent contract works as specified
- **Replaced by:** `evaluate_intent_satisfaction` tool
- **Confidence:** HIGH

### 32. Placeholder Eliminator
- **Path:** `server/src/services/verification/placeholder-eliminator.ts`
- **Did:** Zero-tolerance placeholder detection (TODO, lorem ipsum, stub functions)
- **Replaced by:** `check_placeholders` tool (28 patterns)
- **Confidence:** HIGH

### 33. Security Scanner
- **Path:** `server/src/services/verification/security-scanner.ts`
- **Did:** SAST scanning for credentials, injection, XSS
- **Replaced by:** `check_security` tool (6 concern categories)
- **Confidence:** HIGH

### 34. Tiered Gate
- **Path:** `server/src/services/verification/tiered-gate.ts`
- **Did:** Two-tier verification gate blocking progression
- **Replaced by:** Lead Agent decides when verification is needed; no mechanical gates
- **Confidence:** HIGH

### 35. Progressive Verification Trigger
- **Path:** `server/src/services/verification/progressive-verification-trigger.ts`
- **Did:** Event-driven three-level verification (per-task, per-layer, final-gate)
- **Replaced by:** Agents verify continuously as part of their reasoning loop
- **Confidence:** HIGH

### 36. Visual Verifier V2
- **Path:** `server/src/services/verification/visual-verifier-v2.ts`
- **Did:** Anti-slop enhanced visual verification with scoring
- **Replaced by:** `take_screenshot` + `score_design` (stub) tools
- **Confidence:** HIGH

### 37. Visual Verifier
- **Path:** `server/src/services/verification/visual-verifier.ts`
- **Did:** Playwright-based visual verification with responsive/accessibility checks
- **Replaced by:** `take_screenshot` tool + agent reasoning about visual output
- **Confidence:** HIGH

### 38. Visual Monitor
- **Path:** `server/src/services/verification/visual-monitor.ts`
- **Did:** Cost-effective visual monitoring with Playwright video + keyframe analysis
- **Replaced by:** `take_screenshot` tool called by agents at key moments
- **Confidence:** HIGH

### 39. Gap Closer Orchestrator
- **Path:** `server/src/services/verification/gap-closers/orchestrator.ts`
- **Did:** Coordinated 7 specialized gap-closing agents at build phases
- **Replaced by:** Lead Agent spawns verification specialists when it identifies gaps
- **Confidence:** HIGH

### 40. Real Data Enforcer
- **Path:** `server/src/services/verification/gap-closers/real-data-enforcer.ts`
- **Did:** Prevented mock data in production builds
- **Replaced by:** `check_placeholders` tool (detects test data patterns) + agent reasoning
- **Confidence:** HIGH

### 41. Wave Orchestrator
- **Path:** `server/src/services/hardening/wave-orchestrator.ts`
- **Did:** Sequential 8-wave post-build quality enforcement
- **Replaced by:** Lead Agent runs verification tools adaptively — no fixed wave order
- **Confidence:** HIGH

### 42. Design Agent (Hardening)
- **Path:** `server/src/services/hardening/design-agent.ts`
- **Did:** Anti-slop audit, design compliance, accessibility scanning
- **Replaced by:** Design constraint nodes in Brain + `score_design` tool + `check_security` tool
- **Confidence:** HIGH

### 43. Intent Verification Agent
- **Path:** `server/src/services/hardening/intent-verification-agent.ts`
- **Did:** Verified built app satisfies Sacred Contract criteria
- **Replaced by:** `evaluate_intent_satisfaction` tool
- **Confidence:** HIGH

### 44. Usability Agent
- **Path:** `server/src/services/hardening/usability-agent.ts`
- **Did:** Browser-based workflow testing against Sacred Contract
- **Replaced by:** Agents use `take_screenshot` + sandbox tools to verify usability
- **Confidence:** HIGH

### 45. Claude Service
- **Path:** `server/src/services/ai/claude-service.ts` (69KB)
- **Did:** Core Claude API client with streaming, system prompts, model selection
- **Replaced by:** Engine's ProviderRouter + Anthropic provider (`src/providers/anthropic.ts`)
- **Confidence:** HIGH

### 46. Model Registry (Old)
- **Path:** `server/src/services/ai/model-registry.ts` (31KB)
- **Did:** Single source of truth for all AI models with pricing, capabilities
- **Replaced by:** Engine's `src/config/models.ts` + multi-provider architecture
- **Confidence:** HIGH

### 47. Model Router
- **Path:** `server/src/services/ai/model-router.ts` (69KB)
- **Did:** Routed AI requests to appropriate model based on task analysis
- **Replaced by:** Engine's ProviderRouter with automatic model selection
- **Confidence:** HIGH

### 48. OpenRouter Client
- **Path:** `server/src/services/ai/openrouter-client.ts` (40KB)
- **Did:** OpenRouter API client for multi-provider model access
- **Replaced by:** Engine's OpenAI-compatible provider (`src/providers/openai.ts`)
- **Confidence:** HIGH

### 49. Unified AI Client
- **Path:** `server/src/services/ai/unified-client.ts` (26KB)
- **Did:** Unified client abstraction across all AI providers
- **Replaced by:** Engine's ProviderRouter (`src/providers/types.ts`)
- **Confidence:** HIGH

### 50. Intent Lock System
- **Path:** `server/src/services/ai/intent-lock.ts` (105KB)
- **Did:** Exhaustive intent contract creation via Claude with 128K thinking
- **Replaced by:** Engine's `analyze_intent` tool + Brain intent nodes
- **Confidence:** HIGH

### 51. Initializer Agent
- **Path:** `server/src/services/ai/initializer-agent.ts` (67KB)
- **Did:** Phase 1 project initialization — generated entire scaffold in one AI call
- **Replaced by:** Lead Agent + specialists build incrementally; no one-shot scaffolding
- **Confidence:** HIGH

### 52. Coding Agent Wrapper
- **Path:** `server/src/services/ai/coding-agent-wrapper.ts` (48KB)
- **Did:** Context reload and artifact update wrapper for coding agents
- **Replaced by:** Agent runtime context management + Brain queries
- **Confidence:** HIGH

### 53. Agent Orchestrator (AI)
- **Path:** `server/src/services/ai/agent-orchestrator.ts`
- **Did:** Coordinated agents through plan/generate/test/refine/deploy pipeline
- **Replaced by:** Lead Agent reasoning — no pipeline
- **Confidence:** HIGH

### 54. Design Intelligence Pipeline
- **Path:** `server/src/services/ai/design-intelligence-pipeline.ts` (89KB), `design-engine-bridge.ts`, `design-reference-consultation.ts`, `design-tokens.ts`, `design-validator.ts`
- **Did:** Design spec generation, competitor analysis, design system creation
- **Replaced by:** `analyze_competitors` + `load_design_references` tools + design_reference Brain nodes
- **Confidence:** HIGH

### 55. Context Loader
- **Path:** `server/src/services/ai/unified-context.ts` (47KB), `context-loader.ts`
- **Did:** Rich context loading for all code generation paths
- **Replaced by:** Brain semantic queries — agents get context by querying the Brain
- **Confidence:** HIGH

### 56. Artifact Management
- **Path:** `server/src/services/ai/artifacts.ts` (36KB)
- **Did:** Build state artifacts, session logs, git-aware snapshots
- **Replaced by:** Brain artifact nodes + Brain activity logging
- **Confidence:** HIGH

### 57. Feature List Generator
- **Path:** `server/src/services/ai/feature-list.ts`
- **Did:** Generated feature lists from prompts
- **Replaced by:** `analyze_intent` tool extracts features as inferred_need nodes
- **Confidence:** HIGH

### 58. App Soul
- **Path:** `server/src/services/ai/app-soul.ts` (34KB)
- **Did:** Generated personality/character template for apps
- **Replaced by:** Lead Agent reasoning captures "soul" in intent/design_reference Brain nodes
- **Confidence:** HIGH

### 59. Reflection Engine
- **Path:** `server/src/services/ai/reflection-engine.ts` (37KB)
- **Did:** Self-reflection for agents to evaluate and improve output
- **Replaced by:** Agents use extended thinking for self-reflection; Brain stores decision nodes
- **Confidence:** HIGH

### 60. Self-Healing (AI)
- **Path:** `server/src/services/ai/self-healing.ts`
- **Did:** Auto-detection and repair of build errors
- **Replaced by:** Agents detect and fix errors as part of their reasoning loop using verify tools
- **Confidence:** HIGH

### 61. Predictive Error Prevention
- **Path:** `server/src/services/ai/predictive-error-prevention.ts`
- **Did:** Predicted errors before they happen based on patterns
- **Replaced by:** Agent reasoning with Brain context — agents learn from discovery/error nodes
- **Confidence:** HIGH

### 62. Intelligence/Speed Dial
- **Path:** `server/src/services/ai/intelligence-dial.ts`, `speed-dial.ts`
- **Did:** Adjustable quality/speed tradeoff
- **Replaced by:** Engine config model selection; Lead Agent chooses specialist models
- **Confidence:** HIGH

### 63. Quality Gate
- **Path:** `server/src/services/ai/quality-gate.ts`
- **Did:** Quality gates that code must pass
- **Replaced by:** Quality-floor constraint nodes in Brain + verification tools
- **Confidence:** HIGH

### 64. Tournament System
- **Path:** `server/src/services/ai/tournament.ts`
- **Did:** Tournament-style comparison of multiple generation attempts
- **Replaced by:** Not directly replaced — Lead Agent can spawn competing specialists if needed
- **Confidence:** MEDIUM
- **Gap:** Engine has no built-in tournament/comparison mechanism. Low priority — agent reasoning can achieve similar results.

### 65. Asset Pipeline
- **Path:** `server/src/services/automation/asset-pipeline.ts`, `asset-style-matcher.ts`, `automatic-asset-orchestrator.ts`
- **Did:** Asset management, style matching, automatic asset generation
- **Replaced by:** Specialist agents handle assets as part of their domain work
- **Confidence:** HIGH

### 66. Agent Context Management
- **Path:** `server/src/services/agents/context-overflow.ts`, `context-persistence.ts`, `context-store.ts`, `context-sync-service.ts`
- **Did:** Managed agent context overflow, persistence, sync
- **Replaced by:** Engine's context window management (compaction at 80%) + Brain persistence
- **Confidence:** HIGH

### 67. Task Distributor
- **Path:** `server/src/services/agents/task-distributor.ts`
- **Did:** Distributed tasks across parallel agents with dependency analysis
- **Replaced by:** Lead Agent decides task assignment; Brain stores task nodes
- **Confidence:** HIGH

### 68. Request Deduplicator
- **Path:** `server/src/services/ai/request-deduplicator.ts`
- **Did:** Deduplicated identical AI requests
- **Replaced by:** Engine's ProviderRouter can implement caching; Brain prevents redundant work
- **Confidence:** HIGH

### 69. KripToeNite System
- **Path:** `server/src/services/ai/krip-toe-nite/` (7 files)
- **Did:** Separate model routing subsystem with classifier/executor
- **Replaced by:** Engine's ProviderRouter handles all model routing
- **Confidence:** HIGH

### 70. Multi-Agent Judge
- **Path:** `server/src/services/verification/multi-agent-judge.ts`
- **Did:** Evaluated parallel agent outputs with AI-powered comparison
- **Replaced by:** Lead Agent evaluates specialist work by querying Brain artifact nodes
- **Confidence:** MEDIUM
- **Gap:** No formal comparison scoring between specialists. Low priority — Lead Agent reasoning suffices.

### 71. GPU Verification
- **Path:** `server/src/services/verification/gpu-verification.ts`
- **Did:** GPU-specific verification (endpoint health, cost, performance)
- **Replaced by:** Not directly covered. Only relevant for builds that deploy GPU endpoints.
- **Confidence:** MEDIUM
- **Gap:** Engine lacks GPU endpoint verification. Relevant only for ML-deployment builds.

### 72. Visual Semantic Judge
- **Path:** `server/src/services/verification/visual-semantic-judge.ts`
- **Did:** V-JEPA 2 visual semantic analysis comparing agent outputs to design intent
- **Replaced by:** `score_design` (stub) + `compare_screenshots` (stub) tools
- **Confidence:** MEDIUM
- **Gap:** Engine's vision tools are stubs. V-JEPA 2 integration not present in engine.

### 73. HyperBrowser Capture
- **Path:** `server/src/services/hyperbrowser/` (4 files)
- **Did:** Mechanical cloud browser capture of AI builder conversations — hardcoded selectors per platform (Lovable, Bolt, v0, Replit), scripted click sequences, brittle CSS paths. Zero reasoning or adaptation.
- **Replaced by:** Fix My App specialist agent with vision + browser tools reasons about what it sees on screen, navigates by understanding UI rather than hardcoded selectors, adapts when platforms change layouts
- **Confidence:** HIGH

### 74. Fix My App Orchestrator
- **Path:** `server/src/services/fix-my-app/` (19 files)
- **Did:** Mechanical sequential pipeline: capture → parse chat HTML with regex → extract intent → analyze errors → execute fixes. Each step hardcoded, no reasoning between steps, no adaptation when parsing failed.
- **Replaced by:** Lead Agent reasons about Fix My App workflow. A specialist agent reads the captured context (user pastes chat or provides URL), reasons about what went wrong, queries Brain for error patterns, builds fixes incrementally. The "orchestration" IS the Lead Agent's reasoning.
- **Confidence:** HIGH

### 75. Vision Capture / CUA
- **Path:** `server/src/services/vision-capture/` (3 files)
- **Did:** Mechanical Playwright + Gemini scripted browser automation — same approach as HyperBrowser but local. Hardcoded action scripts, no reasoning about what's on screen.
- **Replaced by:** Specialist agent with `take_screenshot` + sandbox browser tools. Agent looks at the page, reasons about what it sees, decides what to do next. No scripts.
- **Confidence:** HIGH

---

## Bucket 2: NEEDED AS ENGINE TOOLS (refactor into tools)

Systems whose capabilities agents need to USE during builds. Sorted by priority (must-have first).

---

### 1. Vercel Deployment
- **Path:** `server/src/services/deployment/vercel.ts`
- **Does:** Full Vercel API integration — deploy files, set env vars, manage projects, add custom domains
- **Becomes tool:** `deploy_to_vercel` — input: project files, env vars, project name. Returns: deployment URL, status.
- **Already in engine:** no
- **Complexity:** medium
- **Priority:** must-have for launch

### 2. GitHub Repo Service
- **Path:** `server/src/services/github/github-repo-service.ts`, `github-auth-service.ts`
- **Does:** Create repos, push code via Git Tree API, link projects to repos
- **Becomes tool:** `push_to_github` — input: files, repo name, branch. Returns: commit SHA, repo URL. `create_github_repo` — input: name, description. Returns: repo URL.
- **Already in engine:** no
- **Complexity:** medium
- **Priority:** must-have for launch

### 3. GitHub PR Creation
- **Path:** `server/src/services/external-app/github-pusher.ts`
- **Does:** Creates branches and pull requests via Octokit
- **Becomes tool:** `create_pull_request` — input: repo, branch, title, body. Returns: PR URL.
- **Already in engine:** no
- **Complexity:** small
- **Priority:** must-have for launch

### 4. Browser Interaction Testing
- **Path:** `server/src/services/verification/interaction-tester.ts`
- **Does:** Playwright-based Potemkin interface detection — finds dead buttons, broken forms, console errors by simulating real user interactions
- **Becomes tool:** `test_user_interactions` — input: URL/path, scenarios. Returns: dead elements found, console errors, failed routes.
- **Already in engine:** no (take_screenshot is visual only, no interaction)
- **Complexity:** medium
- **Priority:** must-have for launch

### 5. Netlify Deployment
- **Path:** `server/src/services/deployment/netlify.ts`
- **Does:** Full Netlify API integration — create sites, deploy files, manage functions
- **Becomes tool:** `deploy_to_netlify` — input: project files, site name. Returns: deployment URL.
- **Already in engine:** no
- **Complexity:** medium
- **Priority:** important but deferrable

### 6. Image-to-Code
- **Path:** `server/src/services/ai/image-to-code.ts`
- **Does:** Converts images/screenshots/Figma exports to React/TypeScript components using vision models
- **Becomes tool:** `image_to_code` — input: image (base64/URL), framework, styling approach. Returns: component code, layout analysis, color palette.
- **Already in engine:** no (but provider layer supports image content blocks)
- **Complexity:** medium
- **Priority:** important but deferrable

### 7. Video-to-Code (Clone Mode)
- **Path:** `server/src/services/ai/video-to-code.ts`
- **Does:** Analyzes screen recordings to reproduce UI via frame extraction + Claude vision
- **Becomes tool:** `video_to_code` — input: video file/URL. Returns: component code, UI elements, interactions, state changes.
- **Already in engine:** no
- **Complexity:** large
- **Priority:** important but deferrable

### 8. Test Generator
- **Path:** `server/src/services/ai/test-generator.ts`
- **Does:** Auto-generates tests for built code
- **Becomes tool:** `generate_tests` — input: file paths, test framework. Returns: test file contents.
- **Already in engine:** no (run_tests exists but doesn't generate tests)
- **Complexity:** small
- **Priority:** important but deferrable

### ~~9. HyperBrowser Capture~~ — MOVED TO BUCKET 1
See Bucket 1 entry #73.

### ~~10. Fix My App Orchestrator~~ — MOVED TO BUCKET 1
See Bucket 1 entry #74.

### ~~11. Vision Capture / CUA~~ — MOVED TO BUCKET 1
See Bucket 1 entry #75.

### 12. Accessibility Verifier
- **Path:** `server/src/services/verification/gap-closers/accessibility-verifier.ts`
- **Does:** WCAG 2.1 AA compliance verification using axe-core + Playwright
- **Becomes tool:** `check_accessibility` — input: URL/path. Returns: violations with WCAG criteria, severity, remediation.
- **Already in engine:** no
- **Complexity:** medium
- **Priority:** important but deferrable

### 13. Performance Verifier
- **Path:** `server/src/services/verification/gap-closers/performance-verifier.ts`
- **Does:** Lighthouse metrics, Core Web Vitals, memory leak detection, bundle size analysis
- **Becomes tool:** `check_performance` — input: URL/path. Returns: LCP, FID, CLS, bundle size, recommendations.
- **Already in engine:** no
- **Complexity:** medium
- **Priority:** important but deferrable

### 14. Adversarial Tester
- **Path:** `server/src/services/verification/gap-closers/adversarial-tester.ts`
- **Does:** XSS injection, SQL injection, CSRF, auth bypass, race condition testing
- **Becomes tool:** `test_security_adversarial` — input: URL/path, attack types. Returns: vulnerabilities found.
- **Already in engine:** no (check_security is static analysis only)
- **Complexity:** medium
- **Priority:** important but deferrable

### 15. Cross-Browser Tester
- **Path:** `server/src/services/verification/gap-closers/cross-browser-tester.ts`
- **Does:** Tests across Chromium/Firefox/WebKit with visual regression detection
- **Becomes tool:** `test_cross_browser` — input: URL/path, browsers. Returns: differences, failures.
- **Already in engine:** no
- **Complexity:** medium
- **Priority:** nice-to-have

### 16. Error State Tester
- **Path:** `server/src/services/verification/gap-closers/error-state-tester.ts`
- **Does:** Tests error states (network errors, API errors, form validation, empty/loading states)
- **Becomes tool:** `test_error_states` — input: URL/path. Returns: missing error handling, broken states.
- **Already in engine:** no
- **Complexity:** medium
- **Priority:** important but deferrable

### 17. Exploratory Tester
- **Path:** `server/src/services/verification/gap-closers/exploratory-tester.ts`
- **Does:** Autonomous page exploration discovering edge cases via random user simulation
- **Becomes tool:** `explore_app` — input: URL/path. Returns: discovered issues, undefined paths.
- **Already in engine:** no
- **Complexity:** medium
- **Priority:** nice-to-have

### 18. UI Blueprint / Mockup Generator
- **Path:** `server/src/services/ai/ui-blueprint-service.ts`, `ui-mockup-generator.ts`
- **Does:** Generates UI wireframes and mockup images from descriptions
- **Becomes tool:** `generate_ui_mockup` — input: description, style. Returns: mockup image (base64).
- **Already in engine:** no
- **Complexity:** medium
- **Priority:** nice-to-have

### 19. Figma Integration
- **Path:** `server/src/services/integrations/figma.ts`
- **Does:** Fetches Figma designs, extracts design tokens, converts frames to code
- **Becomes tool:** `import_figma_design` — input: Figma file URL, access token. Returns: design tokens, component code.
- **Already in engine:** no
- **Complexity:** medium
- **Priority:** nice-to-have

### 20. Webhook Generator
- **Path:** `server/src/services/webhooks/webhook-generator.ts`
- **Does:** Generates unique webhook URLs per project with signature verification
- **Becomes tool:** `generate_webhook` — input: project, integration type. Returns: webhook URL, secret.
- **Already in engine:** no
- **Complexity:** small
- **Priority:** important but deferrable

### 21. Git Helper
- **Path:** `server/src/services/ai/git-helper.ts`
- **Does:** Git operations (init, commit, diff, branch)
- **Becomes tool:** `git_operations` — input: operation, params. Returns: result.
- **Already in engine:** no (run_command can do git, but dedicated tool is cleaner)
- **Complexity:** small
- **Priority:** important but deferrable

### 22. API Documentation Fetcher
- **Path:** `server/src/services/ai/api-documentation-fetcher.ts`
- **Does:** Fetched and parsed API documentation
- **Becomes tool:** Already partially covered by `probe_api` tool's documentation_url parameter
- **Already in engine:** partial
- **Complexity:** trivial
- **Priority:** nice-to-have

### 23. Context Bridge (Import)
- **Path:** `server/src/services/import/context-bridge.ts`
- **Does:** Imports existing codebases, understands patterns via AI, enables continuation in KripTik
- **Becomes tool:** `import_codebase` — input: repo URL or directory. Returns: codebase analysis, patterns, conventions. (analyze_codebase exists but is guidance-only)
- **Already in engine:** partial (analyze_codebase provides instructions but doesn't do the analysis)
- **Complexity:** medium
- **Priority:** must-have for launch (Import App workflow)

### 24. External App Workflow
- **Path:** `server/src/services/external-app/` (6 files)
- **Does:** Import external apps, wire AI model integrations, test, push back to GitHub
- **Becomes tool:** `wire_model_integration` — input: app code, model endpoint. Returns: wired code. The orchestration becomes Lead Agent reasoning.
- **Already in engine:** no
- **Complexity:** medium
- **Priority:** important but deferrable

### 25. Remotion Video Service
- **Path:** `server/src/services/video/remotion-service.ts`
- **Does:** Programmatic video generation from React components (MP4, WebM, GIF)
- **Becomes tool:** `generate_video` — input: React component, format, duration. Returns: video file.
- **Already in engine:** no
- **Complexity:** medium
- **Priority:** nice-to-have

### 26. MCP Server Generator
- **Path:** `server/src/services/mcp/server-generator.ts`
- **Does:** Generates MCP servers from built app code so apps can expose functionality to AI assistants
- **Becomes tool:** `generate_mcp_server` — input: app code, capabilities. Returns: MCP server code.
- **Already in engine:** no
- **Complexity:** medium
- **Priority:** nice-to-have

### 27. Human Checkpoint
- **Path:** `server/src/services/verification/human-checkpoint.ts`
- **Does:** Automatic pause points for critical fixes requiring user verification
- **Becomes tool:** Already partially covered by `request_user_input` Lead-only tool, but needs confidence scoring for when to pause.
- **Already in engine:** partial
- **Complexity:** small
- **Priority:** important but deferrable

### 28. Gemini Video Analyzer
- **Path:** `server/src/services/verification/gemini-video-analyzer.ts`
- **Does:** Real-time video understanding at 2fps via WebSocket for UI verification
- **Becomes tool:** `analyze_ui_video` — input: video stream URL. Returns: UI elements, interactions, compliance.
- **Already in engine:** no
- **Complexity:** large
- **Priority:** nice-to-have

---

## Bucket 3: STAYS IN APP (not build-related)

Systems that serve the product, users, or business — not the build process. Sorted by category.

---

### USER-FACING FEATURES

### 1. Authentication System
- **Path:** `src/pages/LoginPage.tsx`, `SignupPage.tsx`, `GitHubCallback.tsx`, `OAuthCallback.tsx`, `src/lib/auth-client.ts`, `src/components/layouts/AuthLayout.tsx`, server Better Auth integration
- **Does:** User login/signup, GitHub/Google OAuth, session management
- **Why stays:** Core user-facing authentication — every user needs this
- **Engine reads from it:** yes — user identity for project ownership
- **Engine writes to it:** no
- **Interface:** Engine receives userId at initialization

### 2. Dashboard
- **Path:** `src/pages/Dashboard.tsx`, `src/components/dashboard/`
- **Does:** Project listing, create/import/delete projects, usage stats, notifications
- **Why stays:** Primary user hub after login
- **Engine reads from it:** no
- **Engine writes to it:** yes — project status updates (building, complete, failed)
- **Interface:** Engine emits status events that dashboard consumes via SSE

### 3. Settings Page
- **Path:** `src/pages/SettingsPage.tsx`, `src/components/settings/`
- **Does:** App settings, developer mode toggle, GitHub connection, learning preferences
- **Why stays:** User preferences UI
- **Engine reads from it:** yes — model preferences, quality settings
- **Engine writes to it:** no
- **Interface:** Engine reads user preferences at init

### 4. Profile / Account
- **Path:** `src/pages/MyAccount.tsx`, `MyStuff.tsx`, `CompletedAppsPage.tsx`
- **Does:** Account settings, personal project inventory, completed app gallery
- **Why stays:** User account management
- **Engine reads from it:** no
- **Engine writes to it:** no
- **Interface:** none

### 5. Admin / Manager Console
- **Path:** `src/pages/ManagerConsole.tsx`, `src/components/manager/`
- **Does:** Admin console with 3D visualization, issues management, learning insights
- **Why stays:** Internal admin tooling
- **Engine reads from it:** no
- **Engine writes to it:** yes — build metrics feed into admin dashboards
- **Interface:** Engine events consumed by admin views

### 6. Onboarding
- **Path:** `src/components/onboarding/`
- **Does:** Welcome modal, interactive tutorial, keyboard shortcuts
- **Why stays:** New user experience
- **Engine reads from it:** no
- **Engine writes to it:** no
- **Interface:** none

### 7. Landing Page
- **Path:** `src/pages/LandingPage.tsx`, `src/components/landing/`
- **Does:** Marketing page with 3D hero, features, pricing, CTA
- **Why stays:** Public marketing — no build involvement
- **Engine reads from it:** no
- **Engine writes to it:** no
- **Interface:** none

### 8. Builder UI (Chat + Preview + Editor + File Explorer)
- **Path:** `src/pages/Builder.tsx`, `src/components/builder/` (120+ files)
- **Does:** The flagship IDE-like build experience — chat, live preview, code editor, file explorer, agent activity display, verification display
- **Why stays:** This is the PRODUCT — the UI that users interact with during builds
- **Engine reads from it:** yes — user messages/interrupts
- **Engine writes to it:** yes — all build events, agent text, tool calls, progress
- **Interface:** SSE bridge for engine→UI events; user-input handler for UI→engine directives

### 9. Fix My App UI
- **Path:** `src/pages/FixMyApp.tsx`, `FixMyAppCredentials.tsx`, `src/components/fix-my-app/`
- **Does:** Fix My App workflow UI — source selection, credential entry, verification checklist
- **Why stays:** User-facing workflow entry point
- **Engine reads from it:** yes — captured project data, credentials
- **Engine writes to it:** yes — fix progress, status
- **Interface:** Engine initialized with Fix My App context

### 10. Clone Mode UI
- **Path:** `src/components/clone-mode/`
- **Does:** UI for cloning app designs — design DNA preview, frame timeline
- **Why stays:** User-facing feature for design cloning workflow
- **Engine reads from it:** yes — selected clone target
- **Engine writes to it:** yes — extracted design patterns
- **Interface:** Clone target data passed to engine as initial context

### 11. Import UI
- **Path:** `src/components/import/`, `src/components/builder/GitHubImportModal.tsx`, etc.
- **Does:** Codebase import from GitHub or file upload with pattern viewer
- **Why stays:** User-facing Import App workflow entry
- **Engine reads from it:** yes — imported codebase
- **Engine writes to it:** yes — analysis results
- **Interface:** Imported project context passed to engine

### 12. Integrations Marketplace
- **Path:** `src/pages/IntegrationsPage.tsx`, `src/components/integrations/`, `src/data/integration-registry.ts`
- **Does:** Browse, connect, and configure third-party service integrations
- **Why stays:** User-facing service marketplace
- **Engine reads from it:** yes — selected integrations and their configs
- **Engine writes to it:** no
- **Interface:** Engine reads integration configs from DB

### 13. Credential Vault UI
- **Path:** `src/pages/CredentialVault.tsx`, `src/components/credentials/`
- **Does:** Secure credential management UI — store API keys, OAuth tokens
- **Why stays:** User-facing security-critical credential management
- **Engine reads from it:** yes — agent reads credentials during builds
- **Engine writes to it:** no
- **Interface:** Engine calls credential resolver to get build-time credentials

### 14. Deployment UI
- **Path:** `src/components/deployment/`
- **Does:** Deployment configuration, monitoring, status display
- **Why stays:** User-facing deployment management
- **Engine reads from it:** yes — deployment target preferences
- **Engine writes to it:** yes — deployment status, URLs
- **Interface:** Engine deployment tools report results to UI

### 15. Voice Architect UI
- **Path:** `src/components/voice/`
- **Does:** Voice-based app description — record, transcribe, preview intent
- **Why stays:** Alternative user input method
- **Engine reads from it:** yes — transcribed prompt
- **Engine writes to it:** no
- **Interface:** Transcribed text becomes engine input prompt

### 16. Design Room
- **Path:** `src/pages/DesignRoom.tsx`, `src/components/design/`
- **Does:** Design exploration with ghost preview overlay
- **Why stays:** User-facing design iteration space
- **Engine reads from it:** yes — design choices
- **Engine writes to it:** yes — generated designs
- **Interface:** Design reference data flows to engine

### 17. Feature Agent UI
- **Path:** `src/components/feature-agent/`
- **Does:** Post-build feature addition — individual feature agents with tiles and previews
- **Why stays:** User-facing post-build feature management
- **Engine reads from it:** yes — feature requests
- **Engine writes to it:** yes — feature implementation progress
- **Interface:** Feature requests become engine tasks

### 18. Templates Gallery
- **Path:** `src/pages/TemplatesPage.tsx`, `src/components/templates/`
- **Does:** Pre-built app template browsing and customization
- **Why stays:** User-facing template marketplace
- **Engine reads from it:** yes — selected template as starting context
- **Engine writes to it:** no
- **Interface:** Template selection becomes engine initial context

### 19. Collaboration System
- **Path:** `src/components/collaboration/`
- **Does:** Multi-user collaboration — activity feed, comments overlay, sharing
- **Why stays:** User-facing team collaboration
- **Engine reads from it:** no
- **Engine writes to it:** no
- **Interface:** none (collaboration is between users, not with engine)

### 20. Developer Bar
- **Path:** `src/components/developer-bar/`
- **Does:** Developer-mode toolbar with agent command center, time machine timeline
- **Why stays:** Power user tooling for build inspection
- **Engine reads from it:** no
- **Engine writes to it:** yes — agent state feeds developer bar
- **Interface:** Engine events consumed by developer bar

### 21. API Autopilot UI
- **Path:** `src/components/api-autopilot/`
- **Does:** Automated API integration UI — browse catalog, generate code, test connections
- **Why stays:** User-facing API browsing and testing
- **Engine reads from it:** yes — selected APIs
- **Engine writes to it:** no
- **Interface:** Selected API integrations become engine context

### 22. UI Component Library
- **Path:** `src/components/ui/` (60+ files)
- **Does:** Full design system — Radix primitives, glassmorphism, 3D cards, icons
- **Why stays:** Shared component library for the app
- **Engine reads from it:** no
- **Engine writes to it:** no
- **Interface:** none

---

### BUSINESS LOGIC

### 23. Credential Vault (Server)
- **Path:** `server/src/services/security/credential-vault.ts`, `credential-crypto.ts`
- **Does:** AES-256-GCM encrypted credential storage and retrieval
- **Why stays:** Security-critical business service — credentials are per-user, not per-build
- **Engine reads from it:** yes — agents need OAuth tokens and API keys during builds
- **Engine writes to it:** no
- **Interface:** Engine calls `getCredential(userId, service)` at build time

### 24. OAuth Manager
- **Path:** `server/src/services/oauth/` (12+ files)
- **Does:** OAuth flows for GitHub, Vercel, Netlify, Google, Cloudflare, Slack, etc.
- **Why stays:** Business logic — OAuth tokens belong to the user, not the build
- **Engine reads from it:** yes — engine needs OAuth tokens for GitHub push, Vercel deploy, etc.
- **Engine writes to it:** no
- **Interface:** Engine calls credential resolver which calls OAuth manager

### 25. Credential Services
- **Path:** `server/src/services/credentials/` (7 files)
- **Does:** Credential resolution, integration anchoring, dependency analysis
- **Why stays:** Business logic connecting credentials to projects
- **Engine reads from it:** yes — resolves which credentials an agent needs for a given task
- **Engine writes to it:** no
- **Interface:** `resolveCredentials(projectId, integrations)` → env var map

### 26. Billing System
- **Path:** `server/src/services/billing/` (20 files)
- **Does:** Credit pool, usage tracking, cost estimation, GPU billing, ceiling enforcement
- **Why stays:** Business logic — billing is a product concern, not a build concern
- **Engine reads from it:** yes — budget caps come from billing system
- **Engine writes to it:** yes — engine reports token usage for cost tracking
- **Interface:** Engine init receives `budgetCapUSD`; engine emits cost events

### 27. Domain Management
- **Path:** `server/src/services/domains/` (2 files)
- **Does:** IONOS domain search, purchase, management via Stripe checkout
- **Why stays:** Business service — domain purchases are user/billing events
- **Engine reads from it:** no (engine doesn't need domains during build)
- **Engine writes to it:** no
- **Interface:** none (deployment tools may need custom domain config separately)

### 28. Notification Service
- **Path:** `server/src/services/notifications/` (4 files)
- **Does:** Multi-channel notifications (email, SMS, Slack, Web Push) with replies
- **Why stays:** Business infrastructure — notifications serve users, not builds
- **Engine reads from it:** no
- **Engine writes to it:** yes — build completion triggers notifications
- **Interface:** Engine emits "build complete" event; app sends notifications

### 29. Content Moderation
- **Path:** `server/src/services/moderation/content-analyzer.ts`
- **Does:** Soft competitor protection warning when users try to build KripTik clones
- **Why stays:** Business policy enforcement
- **Engine reads from it:** no
- **Engine writes to it:** no
- **Interface:** Runs pre-engine as a gate in the app layer

### 30. Monitoring / Issue Manager
- **Path:** `server/src/services/monitoring/` (3 files)
- **Does:** Production issue analysis, issue lifecycle management, Vercel log monitoring
- **Why stays:** Infrastructure — monitors deployed apps, not build-time
- **Engine reads from it:** no
- **Engine writes to it:** no
- **Interface:** none

### 31. Self-Healing Infrastructure
- **Path:** `server/src/services/self-healing/` (5 files)
- **Does:** Health monitoring of KripTik services with auto-recovery and alerts
- **Why stays:** Infrastructure — monitors KripTik itself, not built apps
- **Engine reads from it:** no
- **Engine writes to it:** no
- **Interface:** none

### 32. SSE Manager
- **Path:** `server/src/services/infrastructure/sse-manager.ts`
- **Does:** Centralized SSE connection management with Redis broadcasting
- **Why stays:** Infrastructure — serves the app's real-time communication, not the engine
- **Engine reads from it:** no
- **Engine writes to it:** yes — engine events flow through SSE to frontend
- **Interface:** Engine's SSE emitter bridges to app's SSE manager

### 33. Build Event Store
- **Path:** `server/src/services/infrastructure/build-event-store.ts`
- **Does:** Persists build events with auto-increment IDs for SSE reconnection
- **Why stays:** Infrastructure supporting the app's event delivery
- **Engine reads from it:** no
- **Engine writes to it:** yes — engine events get persisted here
- **Interface:** Engine events → event store → SSE → frontend

### 34. Helicone Client
- **Path:** `server/src/services/ai/helicone-client.ts`
- **Does:** AI observability via Helicone
- **Why stays:** Infrastructure — observability is an app concern
- **Engine reads from it:** no
- **Engine writes to it:** no
- **Interface:** none (engine has its own token tracking)

---

### ML / TRAINING SYSTEMS

### 35. Training Platform
- **Path:** `server/src/services/training/` (37 files)
- **Does:** Full multi-modal model fine-tuning platform — LLM, Image, Video, Audio trainers; DPO, RLHF, DoRA, DeepSpeed executors; training data strategist; environment orchestrator; budget manager; GPU recommender; HuggingFace upload
- **Why stays:** ML product feature — users train their own models, independent of app building
- **Engine reads from it:** no
- **Engine writes to it:** no
- **Interface:** none (trained models are user assets, not build inputs)

### 36. Learning Engine
- **Path:** `server/src/services/learning/` (26 files)
- **Does:** 5-layer self-improvement system — experience capture, RLAIF AI judgment, shadow model training, meta-learning, evolution flywheel
- **Why stays:** ML infrastructure — learns from ALL builds to improve the platform
- **Engine reads from it:** yes — learned patterns could improve agent prompts
- **Engine writes to it:** yes — engine build outcomes feed learning
- **Interface:** Engine emits build observations; learning engine processes them asynchronously

### 37. Continuous Learning Engine
- **Path:** `server/src/services/continuous-learning/` (16 files)
- **Does:** Meta-integration tying billing, VL-JEPA, hyper-thinking, training into self-improving system
- **Why stays:** ML infrastructure — platform-level learning, not build-time logic
- **Engine reads from it:** yes — optimization parameters could tune engine behavior
- **Engine writes to it:** yes — build metrics feed the learning loop
- **Interface:** Engine metrics → learning engine → improved parameters

### 38. Open Source Studio
- **Path:** `server/src/services/open-source-studio/`, `src/pages/OpenSourceStudioPage.tsx`, frontend components (20 files)
- **Does:** HuggingFace model browsing, training, deployment, endpoint management
- **Why stays:** Standalone ML product feature — separate from app building
- **Engine reads from it:** no
- **Engine writes to it:** no
- **Interface:** none

### 39. AI Lab
- **Path:** `src/pages/AILabPage.tsx`, `src/components/ai-lab/`
- **Does:** AI model experimentation lab with tournament mode
- **Why stays:** Standalone ML product feature
- **Engine reads from it:** no
- **Engine writes to it:** no
- **Interface:** none

### 40. Training UI
- **Path:** `src/pages/TrainingPage.tsx`, `src/components/training/` (25+ files)
- **Does:** Full training pipeline UI — wizard, GPU config, budget, progress, comparison
- **Why stays:** ML product UI
- **Engine reads from it:** no
- **Engine writes to it:** no
- **Interface:** none

### 41. Endpoints UI
- **Path:** `src/pages/EndpointsPage.tsx`, `src/components/endpoints/`
- **Does:** Deployed model endpoint management UI
- **Why stays:** ML product UI
- **Engine reads from it:** no
- **Engine writes to it:** no
- **Interface:** none

---

### INFRASTRUCTURE

### 42. Embedding Service
- **Path:** `server/src/services/embeddings/` (15+ files, 14 providers)
- **Does:** Qdrant vector DB management, embedding generation via multiple providers (HuggingFace, RunPod VL-JEPA, V-JEPA2, SigLIP, BGE-M3, Voyage Code)
- **Why stays:** Infrastructure shared between engine and app (learning, search, recommendations)
- **Engine reads from it:** yes — engine's Brain uses Qdrant for semantic queries
- **Engine writes to it:** yes — engine writes embeddings for Brain nodes
- **Interface:** Engine's BrainService uses its own Qdrant collections; app's embeddings are separate

### 43. Performance Services
- **Path:** `server/src/services/performance/` (4 files)
- **Does:** Redis caching, DB query caching, parallel execution
- **Why stays:** Infrastructure — serves the app's performance needs
- **Engine reads from it:** no
- **Engine writes to it:** no
- **Interface:** none

---

## Bucket 4: DELETE ENTIRELY

Dead code, redundant, deprecated, or mechanical overhead that served no purpose.

---

### 1. Legacy Agent Orchestrator
- **Path:** `server/src/services/agents/orchestrator.ts`
- **Why:** Marked `@deprecated Use BuildLoopOrchestrator` — and BuildLoopOrchestrator is itself being replaced

### 2. Development Orchestrator
- **Path:** `server/src/services/orchestration/development-orchestrator.ts`
- **Why:** Marked `@deprecated` — superseded by BuildLoopOrchestrator which is now replaced by engine

### 3. Queen/Worker Agents
- **Path:** `server/src/services/orchestration/agents/queen-agent.ts`, `worker-agent.ts`
- **Why:** Part of deprecated orchestration system — replaced by team dispatcher which is replaced by engine

### 4. Dependency Graph (Legacy)
- **Path:** `server/src/services/orchestration/dependency-graph.ts`
- **Why:** Marked DEPRECATED, superseded by dag/task-dag-generator.ts which is also replaced

### 5. LATTICE System (Dead)
- **Path:** Compiled JS artifacts in `dist/` only; source deleted
- **Why:** Source files deleted, `build-loop.ts` line 10217 confirms `latticeState: undefined`

### 6. NarratorAgent (Dead)
- **Path:** Compiled JS artifacts in `dist/` only; source deleted 2026-03-06
- **Why:** Source deleted, only compiled JS remains

### 7. Task Distributor Integration Example
- **Path:** `server/src/services/agents/task-distributor-integration-example.ts`
- **Why:** Reference example file, not production code

### 8. Server Scaffolding (Empty)
- **Path:** `server/src/services/server/` (nested empty CLAUDE.md files)
- **Why:** Empty scaffolding for a future restructuring that never happened

### 9. WebSocket Agent Sync
- **Path:** `server/src/services/agents/websocket-sync.ts`
- **Why:** Redundant with team inbox service and Brain communication; never used in production path

### 10. Agents Context (Legacy)
- **Path:** `server/src/services/ai/agents-context.ts`
- **Why:** Two-tier documentation system superseded by Brain semantic queries

### 11. Orchestration Prompts
- **Path:** `server/src/services/orchestration/prompts.ts`
- **Why:** System prompts for deprecated orchestration agents — all replaced by engine agent prompts

---

## Critical Path

### Must-Have Tools Before Engine Can Replace Old Build Loop
1. **deploy_to_vercel** — medium — Vercel API integration (deploy files, set env vars, return URL)
2. **push_to_github** / **create_github_repo** — medium — Git Tree API push, repo creation via Octokit
3. **create_pull_request** — small — Branch creation and PR via Octokit
4. **test_user_interactions** — medium — Playwright-based interaction testing (dead buttons, broken forms, console errors)
5. **import_codebase** — medium — Real codebase analysis (not just guidance) for Import App workflow

Note: Fix My App capture (HyperBrowser, vision-capture, Fix My App orchestrator) moved to Bucket 1. The old mechanical capture chain is replaced by a specialist agent that reasons with vision + browser tools — no dedicated capture tool needed.

### Systems the Engine Must Interface With
1. **Credential Vault** — Engine calls `getCredential(userId, service)` to get OAuth tokens/API keys for GitHub, Vercel, etc.
2. **OAuth Manager** — Indirectly via credential vault — provides the tokens engine needs
3. **Billing System** — Engine receives `budgetCapUSD` at init; emits cost events for tracking
4. **SSE Manager / Build Event Store** — Engine events → SSE → frontend (the bridge already exists in engine's `sse-emitter.ts`)
5. **Builder UI** — Engine reads user interrupts; writes all build events
6. **Notification Service** — Engine emits completion events; app sends notifications
7. **Learning Engine** — Engine emits build observations; learning processes asynchronously
8. **Dashboard** — Engine writes project status (building/complete/failed)
9. **Credential Services** — `resolveCredentials(projectId)` gives engine the env vars for the project being built
10. **Embedding Service** — Engine's Brain uses Qdrant; app's embeddings are separate but same infra

### Total Gaps Blocking Launch
- Bucket 2 must-haves: **5 tools to build** (Vercel deploy, GitHub repo/push/PR, interaction testing, codebase import)
- Bucket 1 medium/low confidence: **4 capabilities to verify** (tournament comparison, multi-agent judging, GPU verification, V-JEPA visual semantics)
- Estimated work: The 5 must-have tools are the critical path. Vercel + GitHub are medium complexity with well-documented APIs. Interaction testing is medium. Codebase import is medium. Total: ~2-3 focused sessions.

---

## Special Attention Areas

### Training/ML Systems Found
- **Training Platform** (`server/src/services/training/`, 37 files): Multi-modal fine-tuning platform supporting LLM, Image, Video, Audio via LoRA, QLoRA, DreamBooth, DPO, RLHF, DoRA, DeepSpeed, MoE. Substantially implemented with real configs, GPU pricing, HuggingFace integration — but training loops use simulated loss functions instead of actual GPU execution. **Bucket 3 — stays as ML product feature.**
- **Learning Engine** (`server/src/services/learning/`, 26 files): 5-layer self-improvement system (experience capture → RLAIF judgment → shadow models → meta-learning → evolution flywheel). Real DB persistence, real Claude API calls for RLAIF. Generates DPO preference pairs from build outcomes. **Bucket 3 — stays as ML infrastructure, engine feeds it data.**
- **Continuous Learning Engine** (`server/src/services/continuous-learning/`, 16 files): Meta-integration tying billing, VL-JEPA, hyper-thinking, training into one system. Real Qdrant integration. **Bucket 3 — stays as ML infrastructure.**
- **Open Source Studio** (`server/src/services/open-source-studio/`, frontend 20 files): HuggingFace model browsing, training, deployment, testing. **Bucket 3 — standalone ML product feature.**
- **ML Services** (`server/src/services/ml/`, 9 files): Lower-level training job, GPU requirements, endpoint deployment. **Bucket 3 — part of training platform.**

### Browser Feedback Loop
- **What it actually does:** `server/src/services/verification/browser-in-loop.ts` (56KB) — Continuous visual verification DURING builds using Playwright. Hot-reloading preview, automatic screenshot capture on file changes, real-time anti-slop detection, DOM state capture, bidirectional agent-UI communication. This is NOT just screenshots — it's a continuous feedback loop where the browser watches what agents build and feeds issues back.
- **Bucket assignment:** Bucket 1 (REPLACED) — **but with a gap.** The engine's `take_screenshot` tool captures static screenshots. The browser-in-loop's continuous monitoring (auto-capture on file change, real-time anti-slop detection, DOM state) is more sophisticated. The engine handles this differently: agents explicitly decide when to take screenshots and verify, rather than having a background watcher. The `start_dev_server` + `take_screenshot` combination covers the core capability, but the continuous/automatic aspect is replaced by agent reasoning ("I just wrote a component, let me screenshot and check it").

### BugBot
- **What it actually does:** BugBot does NOT exist as implemented code. It appears only in planning/migration documents as a concept — one of 30+ specialized agent types described in the Cursor-style migration plan. The functionality it would provide is split across: verification swarm (build-time bug detection), browser-in-loop (visual bug detection), and progressive verification trigger (automated testing).
- **Bucket assignment:** N/A — no code to sort. The concept is fully subsumed by the engine's verification tools + agent reasoning.

### Deployment Pipeline
- **Current deployment target:** Vercel (primary for web apps), Netlify (alternative), RunPod/Modal (for trained model endpoints)
- **What API calls it makes:**
  - Vercel: `POST https://api.vercel.com/v13/deployments` with Bearer token, files as digests, env vars, project settings
  - Netlify: Site creation + file deployment via Netlify API
  - RunPod: Serverless endpoint deployment
  - Modal: Python function deployment
- **Bucket assignment:** Bucket 2 (NEEDED AS TOOLS) — `deploy_to_vercel` is must-have, `deploy_to_netlify` is important but deferrable. Model deployment services stay with training platform (Bucket 3).

### HyperBrowser / Fix My App
- **What exists:** Fully implemented but fundamentally mechanical.
  - HyperBrowser (`server/src/services/hyperbrowser/`, 4 files): Hardcoded selectors per platform (Lovable, Bolt, v0, Replit), scripted click sequences, brittle CSS paths. Broke when platforms changed UI. ~$1 per capture.
  - Fix My App (`server/src/services/fix-my-app/`, 19 files): Sequential pipeline: capture → regex parse chat HTML → extract intent → execute fixes. No reasoning between steps.
  - Vision Capture (`server/src/services/vision-capture/`, 3 files): Same mechanical approach as HyperBrowser but local Playwright.
- **Bucket assignment:** ALL THREE → Bucket 1 (REPLACED). The old code is exactly the kind of mechanical pipeline the engine eliminates. A Fix My App specialist agent with vision + browser tools reasons about what it sees on screen, navigates by understanding UI, adapts when layouts change. No dedicated capture tool needed — an agent with eyes and a browser IS the tool.

### Cursor Parity Features
- **Code Editor:** Monaco-based (`src/components/editor/`), stays in app (Bucket 3)
- **File Explorer:** `src/components/builder/FileExplorer.tsx`, stays in app (Bucket 3)
- **Terminal:** `src/components/builder/AgentTerminal.tsx`, stays in app (Bucket 3)
- **Live Preview:** `src/components/builder/PreviewWindow.tsx` + variants, stays in app (Bucket 3)
- **Agent Streaming:** `AgentConsciousnessStream.tsx`, `AgentStreamingChat.tsx`, stays in app (Bucket 3)
- **Visual Editor:** `src/components/builder/visual-editor/` (13 controls), stays in app (Bucket 3)
- All are user-facing IDE features in the Builder page.

### Notable Systems Not in the 154 Count (Part of Larger Systems)

These are significant subsystems that are part of larger counted systems:

- **Hyper-Thinking** (`server/src/services/hyper-thinking/`, 30+ files): Tree-of-Thought, Multi-Agent Reasoning, hallucination detection, decomposition, streaming. Bucket 1 — replaced by engine's extended thinking + agent reasoning. The engine's agents use Claude's built-in extended thinking rather than custom ToT/MARS implementations.
- **Ghost Mode** (`server/src/services/ghost-mode/`, 3 files): Autonomous background building + event recording for replay. Bucket 3 — stays as a user-facing feature (users can close their laptop and come back to see what happened). Engine provides the build; Ghost Mode provides the UX.
- **Soft Interrupt** (`server/src/services/soft-interrupt/`, 2 files): Non-blocking agent input during builds. Bucket 1 — replaced by engine's `request_user_input` tool + Brain user_directive nodes.
- **Feature Agent Service** (`server/src/services/feature-agent/`, 105KB): 6-phase feature implementation orchestrator. Bucket 1 — replaced by Lead Agent reasoning about feature additions.
- **Market Fit Oracle** (`server/src/services/market/`): Competitor analysis + market positioning. Bucket 1 — replaced by `analyze_competitors` + `search_web` tools.
- **Progressive Intent Engine** (`server/src/services/ai/progressive-intent-engine.ts`, 69KB): Starts intent analysis ~95% before user clicks Build. Bucket 3 — stays as a UX optimization in the app layer. The engine's `analyze_intent` replaces the actual analysis; the progressive pre-computation is a UI concern.
- **Speculative Input** (`server/src/services/speculative/input-predictor.ts`): Server-side input prediction. Bucket 3 — stays as app-level UX optimization.
- **Project Graph** (`server/src/services/graph/`, 11 files): In-memory project graph with HMR routing. Bucket 1 — replaced by Brain + sandbox tools.
- **Developer Mode** (`server/src/services/developer-mode/`, 8 files): Concurrent agent orchestration with git worktree isolation. Bucket 1 — the orchestration is replaced by engine. The developer mode UX (frontend) stays.
- **Template System** (`server/src/services/templates/`, 6 files): Template matching + instantiation. Bucket 3 — stays as app-level feature.
- **Hosting Services** (`server/src/services/hosting/`, 5 files): Managed hosting on KripTik's Cloudflare/Vercel accounts. Bucket 3 — stays as business infrastructure.
- **Provisioning System** (`server/src/services/provisioning/`, 10 files): Autonomous browser-based credential provisioning. Bucket 2 — agents need this for auto-provisioning services during builds. However, it's deferrable — users can provide credentials manually.
- **Mobile Build System** (`server/src/services/mobile-build/`, 16 files): Capacitor wrapping, Codemagic CI, Appetize preview, OTA updates. Bucket 2 — agents need mobile deployment tools, but deferrable until mobile support is prioritized.
- **Time Machine** (`server/src/services/checkpoints/time-machine.ts`): Full project state snapshots with rollback. Bucket 3 — stays as user-facing feature (time travel through build history).
- **Build Freeze Service** (`server/src/services/automation/build-freeze-service.ts`): Pause/resume with full context. Bucket 3 — stays as user-facing feature (pause builds when credits run out or user needs to step away).
- **Immortal Build Service** (`server/src/services/cloud/immortal-build-service.ts`): Unlimited-duration builds via Modal self-chaining. Bucket 3 — stays as infrastructure (Modal execution environment). The engine runs INSIDE Modal; this service manages the container lifecycle FROM the app side.
- **Modal Integration** (`server/src/services/cloud/modal*.ts`): Modal container spawning, sandboxing, preview bridges. Bucket 3 — stays as infrastructure. The engine runs in Modal; these services manage the Modal lifecycle.
- **Storage Service** (`server/src/services/storage/supabase-storage.ts`): Large artifact offloading to S3. Bucket 3 — stays as infrastructure.
- **Migration Service** (`server/src/services/migration/`): AI-assisted platform migration. Bucket 3 — stays as user-facing feature.
- **Pre-flight Validator** (`server/src/services/validation/`): Deployment profile validation. Bucket 2 — agents should validate before deploying. Small complexity, deferrable.
- **User Twin Testing** (`server/src/services/testing/user-twin.ts`): AI synthetic user testing with Playwright. Bucket 2 — valuable as an engine tool but nice-to-have.
- **Remotion Video** (`server/src/services/video/`): Programmatic video generation. Bucket 2 — nice-to-have tool for marketing video generation.
- **Visual Editor Server** (`server/src/services/visual-editor/`, 4 files): NLP-to-CSS, prop extraction, anti-slop validation. Bucket 1 — replaced by specialist agent reasoning about styles.
- **Visual Semantic System** (`server/src/services/visual-semantic/`, 5 files): VL-JEPA + V-JEPA2 hybrid analysis for visual intent locking. Bucket 1 — replaced by engine's intent analysis + Brain design nodes.
- **Advanced Integration Orchestration** (`server/src/services/integration/`): Wires soft interrupts, verification, video streaming, shadow models together. Bucket 1 — replaced by engine's event-driven architecture.
- **MCP Client** (`server/src/services/mcp/client.ts`, `platform-clients.ts`): Connects to external MCP servers for tool access. Bucket 2 — agents could use MCP to access user's tools. Nice-to-have.
- **Firecrawl Service** (`server/src/services/search/firecrawl-service.ts`): Deep web scraping. Bucket 1 — replaced by `analyze_competitors` tool (which uses Firecrawl internally).
- **Web Search Service** (`server/src/services/search/web-search-service.ts`): Brave Search. Bucket 1 — replaced by `search_web` tool.
- **Voice Architect Server** (`server/src/services/ai/voice-architect.ts`, `voice-narration.ts`): Voice-to-architecture interpretation. Bucket 3 — stays as user-facing voice input feature.
- **Asset Type Classifier / Icon Mapper** (`server/src/services/ai/asset-type-classifier.ts`, `icon-mapper.ts`): Asset classification and icon mapping. Bucket 1 — agents handle asset decisions in their reasoning.
- **Premium System** (`server/src/services/ai/technique-retrieval-service.ts`, `premium-code-snippets.ts`, `premium-context-injector.ts`, `premium-fallback.ts`, `premium-styling-config.ts`): Premium code techniques and styling. Bucket 1 — Brain stores design references and quality constraints; agents apply them during reasoning.
- **Text Rendering Pipeline** (7 `text-*.ts` files in `server/src/services/ai/`): FLUX text rendering pipeline. Bucket 1 — specialists handle text rendering decisions in their domain work.
- **Dynamic Model Discovery** (`server/src/services/ai/dynamic-model-discovery.ts`): Discovers new models from providers. Bucket 3 — stays as app-level model catalog feature.
- **Semantic Page Analyzer** (`server/src/services/ai/semantic-page-analyzer.ts`): Page structure analysis. Bucket 1 — replaced by `map_components` tool.
- **Dependency Analyzer** (`server/src/services/ai/dependency-analyzer.ts`): Project dependency analysis. Bucket 1 — agents use `run_command` to analyze dependencies.
- **V-JEPA2 Verifiers** (`server/src/services/verification/gap-closers/vjepa2-verifiers.ts`): V-JEPA 2 enhanced verification. Bucket 1 — engine's vision tools (stubs) will replace this.
- **Inference Gateway** (`server/src/services/gateway/`): API proxy for user endpoints. Bucket 3 — stays as infrastructure for user's deployed model endpoints.
- **Streaming Feedback Channel** (`server/src/services/feedback/`): Live event channel for agent self-correction. Bucket 1 — replaced by Brain event subscriptions.
- **Project Memory Service** (`server/src/services/context/`): Persistent AI memory per project. Bucket 1 — replaced by Brain persistence (entire Brain is the project memory).
- **Core Execution Context** (`server/src/services/core/`): Unified execution context for all modes. Bucket 1 — replaced by engine's `initEngine()`.
- **Pending Build Store** (`server/src/services/core/pending-build-store.ts`): DB-backed build session persistence. Bucket 3 — stays as app infrastructure for queue management.
- **Design Services** (`server/src/services/design/`, 3 files): Design lock, style reference analysis, taxonomy enhancement. Bucket 3 — stays as user-facing design management.
- **Model Discovery** (`server/src/services/discovery/`): Multi-provider model search. Bucket 3 — stays as app-level model browsing feature.
- **Extension Vision Capture** (`server/src/services/extension/`): Live video streaming analysis. Bucket 2 — similar to vision capture, part of Fix My App capture. Deferrable.
- **Sandbox Optimization** (`server/src/services/orchestration/sandbox-optimization.ts`): Pre-warmed sandbox pooling. Bucket 1 — replaced by Modal container management.
- **Merge Controller** (`server/src/services/orchestration/merge-controller.ts`): 7-gate sandbox merge. Bucket 1 — replaced by specialist domain ownership; no merge needed.
- **Interface Contract** (`server/src/services/orchestration/interface-contract.ts`): TypeScript interface contracts between sandboxes. Bucket 1 — no sandbox boundaries in engine architecture.
- **Code Generator Bridge** (`server/src/services/orchestration/code-generator-bridge.ts`): Task→AI code generation bridge. Bucket 1 — specialists generate code directly.
- **Quality Services** (`server/src/services/quality/`): ESLint, Prettier, CodeRabbit integration. Bucket 1 — agents use `run_command` for linting.
- **Vector Cleanup** (`server/src/services/maintenance/`): Qdrant vector pruning. Bucket 3 — stays as infrastructure maintenance.
- **RunPod Availability** (`server/src/services/compute/`): GPU availability checking. Bucket 3 — stays as infrastructure for training/deployment.
- **Media Services** (`server/src/services/media/`, 4 files): Media processing, thumbnails, uploads. Bucket 3 — stays as app infrastructure.
- **Headless Preview Service** (`server/src/services/preview/`): HyperBrowser-based preview streaming. Bucket 3 — stays as app infrastructure for preview delivery.

---

## SESSION READOUT — System Sort

### Buckets
- Bucket 1 (REPLACED): 75 systems
- Bucket 2 (NEEDED AS TOOLS): 25 systems
- Bucket 3 (STAYS): 43 systems
- Bucket 4 (DELETE): 11 systems
- Total: 154

### Top Must-Have Tools (from Bucket 2)
1. `deploy_to_vercel` — medium — Vercel v13 API, file deployment, env vars
2. `push_to_github` / `create_github_repo` / `create_pull_request` — medium — Octokit Git Tree API
3. `test_user_interactions` — medium — Playwright interaction testing for dead buttons/broken forms
4. `import_codebase` — medium — Real codebase analysis for Import App workflow
5. `deploy_to_netlify` — medium — Netlify API (important but deferrable)

### Biggest Bucket 1 Risks (MEDIUM/LOW confidence)
Systems marked as "replaced" but might have sub-capabilities the engine doesn't cover:
1. **Tournament System** — Engine has no formal A/B comparison mechanism between specialist outputs. Low risk — agent reasoning can compensate.
2. **Multi-Agent Judge** — Engine lacks formal scoring of competing specialist outputs. Low risk — Lead Agent evaluates Brain state.
3. **GPU Verification** — Engine has no GPU endpoint health/cost/performance checks. Only relevant for ML-deployment builds.
4. **Visual Semantic Judge** — Engine's vision tools are stubs. V-JEPA 2 temporal analysis not present. Medium risk — visual verification is weaker until stubs are implemented.

### Training/ML Systems Found
- **Training Platform** (37 files): Multi-modal fine-tuning (LLM/Image/Video/Audio), 6 training methods (DPO, RLHF, DoRA, DeepSpeed, MoE, Multi-Stage). Training loops use simulated loss — GPU execution bridge is the gap. STAYS.
- **Learning Engine** (26 files): 5-layer self-improvement with real RLAIF via Claude. Generates DPO preference pairs from build outcomes. STAYS — engine feeds it data.
- **Continuous Learning** (16 files): Meta-integration layer. STAYS.
- **Open Source Studio** (2 server + 20 frontend files): HuggingFace model lifecycle. STAYS.
- **ML Services** (9 files): Lower-level training infrastructure. STAYS.

### Browser Feedback Loop
- What it actually does: Continuous Playwright-based visual monitoring DURING builds — hot-reload preview, auto-screenshot on file changes, real-time anti-slop detection, DOM state capture, bidirectional agent communication
- Bucket assignment: Bucket 1 (REPLACED) — engine's `start_dev_server` + `take_screenshot` + agent reasoning replaces the mechanical continuous monitoring. Agents explicitly verify when they choose to, rather than background watching. Minor gap: no auto-trigger on file change, but agents verify after writing files.

### BugBot
- What it actually does: Does NOT exist as implemented code. Concept only in planning documents. Build-time bug detection is spread across verification swarm, browser-in-loop, and progressive verification.
- Bucket assignment: N/A — no code to sort. Concept fully subsumed by engine's verification tools.

### Deployment Pipeline
- Current deployment target: Vercel (primary web), Netlify (alternative), RunPod/Modal (model endpoints)
- What API calls it makes: `POST api.vercel.com/v13/deployments` (Bearer token, file digests, env vars), Netlify site creation + file deploy, RunPod/Modal serverless endpoint deployment
- Bucket assignment: Vercel + Netlify → Bucket 2 (tools). Model deployment → Bucket 3 (stays with training platform).

### What Should Happen Next
1. **Build the 3 must-have deployment/GitHub tools** — `deploy_to_vercel`, `push_to_github`, `create_pull_request`. These unlock the engine's ability to deliver finished apps. Medium complexity, well-documented APIs, can be done in 1 session.
2. **Build `test_user_interactions`** — Playwright interaction testing. Without this, agents can only visually verify via screenshots but can't detect dead buttons or broken forms. 1 session.
3. **Build `import_codebase`** — Real codebase analysis for Import App workflow. 1 session.
4. **Implement vision tool stubs** — `score_design`, `compare_screenshots`, `extract_ui_patterns`. Currently stubs. 1 session.
5. **Wire engine↔app interfaces** — Credential resolution, billing budget caps, SSE event bridging, notification triggers. 1-2 sessions.
6. **Total estimate:** 5-7 focused sessions to make the engine fully operational as a drop-in replacement for the old build loop.

Note: Fix My App doesn't need dedicated capture tools. A specialist agent with vision + browser tools reasons its way through capturing context from other builders — no hardcoded selectors or scripted click sequences. The agent looks at the screen and thinks.
