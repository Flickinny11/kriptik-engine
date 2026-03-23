# Plan: Fix Dashboard Button Wiring + Import App Dropdown + Forensic Audit Engine

## Problem Summary
1. **Bug**: "Import App" button navigates to `/fix-my-app` (wrong — that's the Fix My App workflow)
2. **Fix My App** button correctly shows intro animation then navigates to `/fix-my-app` (correct)
3. **Missing**: Import App needs its own dropdown flow with zip/GitHub/GitLab options
4. **Missing**: Comprehensive forensic audit engine that runs concurrent agents against live app

---

## Part 1: Fix Dashboard Button Wiring

### File: `client/src/pages/Dashboard.tsx`

**Change 1**: Replace the "Import App" button (lines 1072-1079) with an `<ImportAppDropdown>` component that renders a button + animated dropdown with three options:
- **ZIP Upload** — file picker for .zip
- **GitHub** — branded GitHub icon, checks connection status
- **GitLab** — branded GitLab icon, checks connection status

**Change 2**: The "Fix My App" button (lines 1082-1090) stays as-is — it already correctly triggers `setShowFixMyAppIntro(true)`.

### New Component: `ImportAppDropdown` (inline in Dashboard.tsx)

```
States:
- isOpen: boolean (dropdown visibility)
- showConfirmModal: boolean
- selectedSource: 'zip' | 'github' | 'gitlab' | null
- selectedRepo: GitHubRepo | null (for GH/GL repo selection)
- ghConnected / glConnected: boolean
- repos: GitHubRepo[] (fetched when connected)

Flow:
1. Click "Import App" → dropdown appears with 3 branded options
2. ZIP → file input opens, on file select → confirmation modal
3. GitHub → if connected, inline repo list loads; if not, redirect to auth
4. GitLab → if connected, inline repo list loads; if not, redirect to auth
5. After repo/file selection → Confirmation modal:
   "Do you wish to continue? Selecting yes will perform a forensic audit of your codebase.
    This will analyze every component, endpoint, route, hook, and function for issues."
   [Cancel] [Yes, Start Audit]
6. On confirm → create project via apiClient.createProject(), navigate to
   `/builder/${projectId}` with state: { importSource, repoUrl/files, runForensicAudit: true }
```

### API Client Addition: `client/src/lib/api-client.ts`

Add GitLab methods mirroring GitHub:
- `getGitLabConnection()` → GET `/api/oauth/connections/gitlab`
- `getGitLabRepos()` → GET `/api/gitlab/repos` (new server route or via OAuth token)
- `getGitLabAuthUrl()` → GET `/api/oauth/authorize/gitlab`

### Server Route: `server/src/routes/gitlab.ts` (new)

- GET `/api/gitlab/repos` — uses stored GitLab OAuth token to fetch user repos from GitLab API
- Mirrors the pattern in `server/src/routes/github.ts`

---

## Part 2: Forensic Audit Engine (Backend)

### New File: `src/tools/audit/forensic-audit.ts`

The forensic audit is the **most comprehensive, fastest codebase analysis system** — it uses multiple concurrent agent teams that simultaneously:

#### Architecture: Multi-Team Concurrent Audit

**Team 1: Static Analysis Swarm** (runs first, ~2-5 seconds)
- TypeScript compilation check (`tsc --noEmit`)
- ESLint/linting pass
- Dependency vulnerability scan (`npm audit --json`)
- Dead code detection (unreachable exports, unused imports)
- Bundle size analysis
- Circular dependency detection
- License compliance check

**Team 2: Semantic Code Intelligence** (concurrent with Team 1)
- AST-based component mapping — every component, hook, route, API call
- Intent extraction — what is the app trying to do?
- Data flow tracing — prop drilling, state management paths
- API contract validation — do endpoints match frontend calls?
- Route completeness — are all routes reachable? Do they render?
- Hook dependency analysis — stale closures, missing deps
- Type safety coverage — any → typed ratio
- Error boundary coverage — which components are unprotected?

**Team 3: Runtime Behavioral Analysis** (starts after build succeeds)
- Build the app in Modal sandbox (`npm run build` / `npm run dev`)
- Launch headless browser (Playwright)
- **Concurrent browser agents** each assigned routes/pages:
  - Navigate to every route
  - Click every interactive element (buttons, links, forms, dropdowns)
  - Fill forms with test data
  - Check for console errors, warnings, unhandled rejections
  - Capture network requests — failed fetches, CORS errors, 404s, 500s
  - Measure render times, layout shifts, interaction delays
  - Screenshot each page state for visual regression baseline
- **Telemetry collection**: Every DOM event, network request, console output piped to analysis agent
- **Silent error detection**: Catch errors that don't crash but produce wrong behavior:
  - API calls returning wrong data shapes
  - State not updating after mutations
  - UI showing stale data
  - Race conditions (click → navigate → component unmounted)
  - Memory leaks (growing heap over navigation cycles)

**Team 4: Security & Quality Audit** (concurrent)
- OWASP Top 10 pattern detection (XSS, injection, CSRF, auth bypass)
- Hardcoded secrets/credentials scan
- Environment variable validation
- CORS configuration review
- Authentication/authorization flow verification
- Input sanitization check
- SQL/NoSQL injection vectors
- Prototype pollution risks
- Supply chain risk (known vulnerable dependencies)

**Team 5: Architecture & Best Practices** (concurrent)
- Component coupling analysis (fan-in/fan-out metrics)
- Code duplication detection (semantic, not just textual)
- Naming convention consistency
- File organization assessment
- Test coverage estimation
- Accessibility audit (a11y) — missing alt text, ARIA, keyboard nav, contrast
- Performance anti-patterns (unnecessary re-renders, large bundles, unoptimized images)
- SEO health (meta tags, structured data, canonical URLs)

#### Implementation Pattern

Each team is a specialist agent spawned via `AgentRuntime.spawnSpecialist()`. They all run concurrently and write findings to the Brain knowledge graph as `discovery` nodes. A Lead Audit Agent orchestrates, waits for all teams, then synthesizes the report.

```typescript
// src/tools/audit/forensic-audit.ts
export function createForensicAuditTool(sandbox, router): ToolDefinition {
  return {
    name: 'run_forensic_audit',
    description: 'Run comprehensive forensic audit with concurrent agent teams',
    input_schema: { type: 'object', properties: { repoUrl: { type: 'string' } } },
    execute: async (params, ctx) => {
      // 1. Clone repo into sandbox
      // 2. Install dependencies
      // 3. Spawn 5 concurrent specialist teams
      // 4. Collect all findings into Brain nodes
      // 5. Synthesize report
    }
  };
}
```

### New File: `src/agents/prompts/audit-teams.ts`

System prompts for each audit specialist team:
- `buildStaticAnalysisPrompt()`
- `buildSemanticIntelligencePrompt()`
- `buildRuntimeBehaviorPrompt()`
- `buildSecurityAuditPrompt()`
- `buildArchitectureReviewPrompt()`

---

## Part 3: Forensic Audit Report

### New File: `src/tools/audit/report-generator.ts`

Compiles all Brain discovery nodes from the audit into a structured report:

```typescript
interface ForensicAuditReport {
  summary: {
    overallHealth: 'critical' | 'poor' | 'fair' | 'good' | 'excellent';
    score: number; // 0-100
    totalFindings: number;
    criticalFindings: number;
    timestamp: string;
    auditDuration: string;
  };
  sections: {
    compilation: { errors: CompilationError[]; warnings: string[] };
    security: { vulnerabilities: SecurityFinding[]; riskLevel: string };
    runtime: {
      silentErrors: SilentError[];
      consoleErrors: ConsoleError[];
      networkFailures: NetworkFailure[];
      performanceIssues: PerformanceIssue[];
    };
    architecture: {
      couplingScore: number;
      duplicationRate: number;
      testCoverage: number;
      a11yIssues: A11yIssue[];
    };
    codeQuality: {
      deadCode: string[];
      circularDeps: string[][];
      typeSafety: number; // percentage
      errorBoundary Coverage: number;
    };
    dependencies: {
      vulnerabilities: DependencyVuln[];
      outdated: OutdatedDep[];
      unused: string[];
    };
    routes: {
      total: number;
      broken: RouteIssue[];
      unreachable: string[];
    };
    components: {
      total: number;
      orphaned: string[];
      missingProps: PropIssue[];
      hookViolations: HookIssue[];
    };
  };
  recommendations: {
    priority: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    affectedFiles: string[];
    suggestedFix: string;
  }[];
}
```

---

## Part 4: Builder Integration

### File: `client/src/pages/Builder.tsx`

When navigated to with `state.runForensicAudit: true`:
1. Clone/branch the selected repo in the sandbox
2. Open repo files in code editor
3. Start build (`npm install && npm run dev`)
4. Display live preview in iframe
5. Simultaneously kick off forensic audit via `/api/execute` with audit prompt
6. Stream audit progress events via SSE
7. When complete, show audit report in a slide-out panel or dedicated tab

### File: `server/src/routes/execute.ts`

Add audit mode support — when prompt contains forensic audit directive, the engine spawns the audit orchestrator agent instead of the normal build Lead.

---

## Part 5: Server Route for Importing Repos

### File: `server/src/routes/projects.ts`

Add `POST /api/projects/:id/import` endpoint:
- Accepts `{ source: 'github' | 'gitlab' | 'zip', repoUrl?: string }`
- For GitHub: clones via `git clone` using stored OAuth token
- For GitLab: clones via `git clone` using stored OAuth token
- For ZIP: processes uploaded file
- Creates new branch for audit work
- Returns `{ success: true, files: string[] }`

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `client/src/pages/Dashboard.tsx` | EDIT | Replace Import App button with dropdown component, add confirmation modal |
| `client/src/lib/api-client.ts` | EDIT | Add GitLab API methods |
| `server/src/routes/gitlab.ts` | NEW | GitLab repo listing endpoint |
| `server/src/index.ts` | EDIT | Register gitlab routes |
| `src/tools/audit/forensic-audit.ts` | NEW | Forensic audit tool with concurrent teams |
| `src/tools/audit/report-generator.ts` | NEW | Report compilation from Brain nodes |
| `src/tools/audit/index.ts` | NEW | Barrel export for audit tools |
| `src/agents/prompts/audit-teams.ts` | NEW | Specialist prompts for 5 audit teams |
| `src/tools/index.ts` | EDIT | Register audit tools in tool registry |
| `client/src/pages/Builder.tsx` | EDIT | Handle forensic audit mode on import |
| `server/src/routes/execute.ts` | EDIT | Support audit mode |
| `server/src/routes/projects.ts` | EDIT | Add import endpoint |
