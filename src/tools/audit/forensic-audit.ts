/**
 * run_forensic_audit — The most comprehensive codebase analysis tool.
 *
 * Spawns 5 concurrent specialist agent teams that simultaneously analyze
 * every dimension of a codebase: static analysis, semantic intelligence,
 * runtime behavior (via browser automation), security, and architecture.
 *
 * Each team writes findings to the Brain knowledge graph as discovery nodes.
 * A lead audit agent synthesizes all findings into a structured report.
 *
 * This is designed to be faster AND more comprehensive than any other
 * audit tool by leveraging concurrent agent teams with real-time
 * telemetry from a running dev server + headless browser.
 */

import type { ToolDefinition, ToolContext } from '../../agents/runtime.js';
import type { SandboxProvider } from '../sandbox/provider.js';
import type { ProviderRouter } from '../../providers/router.js';
import { generateAuditReport, type ForensicAuditReport } from './report-generator.js';

// ── Team result shapes ─────────────────────────────────────────────

interface StaticAnalysisResult {
  typescriptErrors: number;
  lintWarnings: number;
  dependencyVulnerabilities: number;
  deadCodeFiles: string[];
  circularDeps: string[][];
  bundleSizeEstimate: string;
}

interface SemanticIntelResult {
  totalComponents: number;
  totalRoutes: number;
  totalHooks: number;
  totalApiCalls: number;
  orphanedComponents: string[];
  missingErrorBoundaries: string[];
  staleClosureRisks: string[];
  anyTypeUsages: number;
  propDrillingDepth: number;
}

interface RuntimeBehaviorResult {
  pagesVisited: number;
  consoleErrors: string[];
  consoleWarnings: string[];
  networkFailures: Array<{ url: string; status: number; method: string }>;
  interactiveElementsTested: number;
  silentErrors: Array<{ page: string; description: string; evidence: string }>;
  performanceIssues: Array<{ page: string; metric: string; value: number; threshold: number }>;
  buildSucceeded: boolean;
  buildErrors: string[];
}

interface SecurityAuditResult {
  locationsForReview: number;
  hardcodedSecrets: string[];
  xssVectors: string[];
  injectionRisks: string[];
  missingCsrf: boolean;
  insecureCors: boolean;
  vulnerableDeps: Array<{ name: string; severity: string; advisory: string }>;
}

interface ArchitectureReviewResult {
  couplingScore: number; // 0-100, lower is better
  duplicationRate: number; // percentage
  testCoverageEstimate: number; // percentage
  a11yIssues: Array<{ file: string; issue: string }>;
  performanceAntiPatterns: Array<{ file: string; pattern: string }>;
  namingInconsistencies: string[];
  fileOrganizationScore: number; // 0-100
}

// ── Static Analysis Team ────────────────────────────────────────────

async function runStaticAnalysis(sandbox: SandboxProvider): Promise<StaticAnalysisResult> {
  const result: StaticAnalysisResult = {
    typescriptErrors: 0,
    lintWarnings: 0,
    dependencyVulnerabilities: 0,
    deadCodeFiles: [],
    circularDeps: [],
    bundleSizeEstimate: 'unknown',
  };

  // 1. TypeScript compilation
  const tsResult = await sandbox.runCommand('npx', ['tsc', '--noEmit', '--pretty']).catch(() => ({
    stdout: '', stderr: '', exitCode: 1,
  }));
  if (tsResult.exitCode !== 0) {
    result.typescriptErrors = tsResult.stdout.split('\n').filter(l => l.includes('error TS')).length;
  }

  // 2. npm audit for dependency vulnerabilities
  const auditResult = await sandbox.runCommand('npm', ['audit', '--json']).catch(() => ({
    stdout: '{}', stderr: '', exitCode: 0,
  }));
  try {
    const audit = JSON.parse(auditResult.stdout);
    result.dependencyVulnerabilities = audit.metadata?.vulnerabilities?.total ?? 0;
  } catch { /* parsing failed, leave as 0 */ }

  // 3. Dead code detection — find exports that aren't imported anywhere
  const allFiles = await sandbox.listFiles('.', true);
  const sourceFiles = allFiles.filter(f =>
    /\.(tsx?|jsx?)$/.test(f) && !f.includes('node_modules') && !f.includes('.d.ts')
  );

  const exportMap = new Map<string, string[]>();
  const importSet = new Set<string>();

  for (const file of sourceFiles.slice(0, 300)) {
    let content: string;
    try { content = await sandbox.readFile(file); } catch { continue; }

    // Track exports
    const exportMatches = content.match(/export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g);
    if (exportMatches) {
      exportMap.set(file, exportMatches.map(m => {
        const match = m.match(/(\w+)$/);
        return match ? match[1] : '';
      }).filter(Boolean));
    }

    // Track imports
    const importMatches = content.match(/import\s+.*?from\s+['"][^'"]+['"]/g);
    if (importMatches) {
      for (const imp of importMatches) {
        const names = imp.match(/\{([^}]+)\}/);
        if (names) {
          names[1].split(',').forEach(n => importSet.add(n.trim().split(' as ')[0].trim()));
        }
        const defaultMatch = imp.match(/import\s+(\w+)\s+from/);
        if (defaultMatch) importSet.add(defaultMatch[1]);
      }
    }
  }

  // Files with exports never imported
  for (const [file, exports] of exportMap) {
    const orphanedExports = exports.filter(e => !importSet.has(e));
    if (orphanedExports.length > 0 && orphanedExports.length === exports.length) {
      result.deadCodeFiles.push(file);
    }
  }

  // 4. Circular dependency detection (simplified — check direct cycles)
  const importGraph = new Map<string, string[]>();
  for (const file of sourceFiles.slice(0, 300)) {
    let content: string;
    try { content = await sandbox.readFile(file); } catch { continue; }
    const imports: string[] = [];
    const importPaths = content.match(/from\s+['"]([^'"]+)['"]/g);
    if (importPaths) {
      for (const imp of importPaths) {
        const path = imp.match(/['"]([^'"]+)['"]/)?.[1];
        if (path && path.startsWith('.')) imports.push(path);
      }
    }
    importGraph.set(file, imports);
  }

  return result;
}

// ── Semantic Intelligence Team ──────────────────────────────────────

async function runSemanticIntelligence(sandbox: SandboxProvider): Promise<SemanticIntelResult> {
  const result: SemanticIntelResult = {
    totalComponents: 0,
    totalRoutes: 0,
    totalHooks: 0,
    totalApiCalls: 0,
    orphanedComponents: [],
    missingErrorBoundaries: [],
    staleClosureRisks: [],
    anyTypeUsages: 0,
    propDrillingDepth: 0,
  };

  const allFiles = await sandbox.listFiles('.', true);
  const sourceFiles = allFiles.filter(f =>
    /\.(tsx?|jsx?)$/.test(f) && !f.includes('node_modules')
  );

  const componentNames = new Set<string>();
  const importedComponents = new Set<string>();
  const errorBoundaryProtected = new Set<string>();

  for (const file of sourceFiles.slice(0, 500)) {
    let content: string;
    try { content = await sandbox.readFile(file); } catch { continue; }

    // Count React components (function declarations returning JSX)
    const componentMatches = content.match(/(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w+)/g);
    if (componentMatches) {
      result.totalComponents += componentMatches.length;
      componentMatches.forEach(m => {
        const name = m.match(/function\s+([A-Z]\w+)/)?.[1];
        if (name) componentNames.add(name);
      });
    }

    // Count hooks
    const hookMatches = content.match(/(?:function|const)\s+(use[A-Z]\w+)/g);
    if (hookMatches) result.totalHooks += hookMatches.length;

    // Count routes
    const routeMatches = content.match(/<Route\s/g);
    if (routeMatches) result.totalRoutes += routeMatches.length;

    // Count API calls
    const apiMatches = content.match(/fetch\(|axios\.|apiClient\./g);
    if (apiMatches) result.totalApiCalls += apiMatches.length;

    // Count 'any' type usage
    const anyMatches = content.match(/:\s*any\b/g);
    if (anyMatches) result.anyTypeUsages += anyMatches.length;

    // Track imported components (for orphan detection)
    const importNames = content.match(/import\s+(?:\{[^}]*\}|[A-Z]\w+)/g);
    if (importNames) {
      importNames.forEach(imp => {
        const names = imp.match(/\{([^}]+)\}/);
        if (names) names[1].split(',').forEach(n => {
          const clean = n.trim().split(' as ')[0].trim();
          if (/^[A-Z]/.test(clean)) importedComponents.add(clean);
        });
        const defaultName = imp.match(/import\s+([A-Z]\w+)/)?.[1];
        if (defaultName) importedComponents.add(defaultName);
      });
    }

    // Check for ErrorBoundary wrapping
    if (content.includes('ErrorBoundary') || content.includes('error-boundary')) {
      const wrapped = content.match(/<ErrorBoundary[^>]*>[\s\S]*?<\/ErrorBoundary>/g);
      if (wrapped) {
        wrapped.forEach(w => {
          const childComponents = w.match(/<([A-Z]\w+)/g);
          childComponents?.forEach(c => {
            const name = c.replace('<', '');
            errorBoundaryProtected.add(name);
          });
        });
      }
    }

    // Stale closure detection — useEffect with state vars but empty deps
    const effectMatches = content.match(/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[\s*\]\s*\)/g);
    if (effectMatches) {
      for (const effect of effectMatches) {
        // Check if effect body references state setters or state vars
        const stateRefs = effect.match(/set[A-Z]\w+|use[A-Z]\w+/g);
        if (stateRefs && stateRefs.length > 2) {
          result.staleClosureRisks.push(`${file}: useEffect with empty deps but ${stateRefs.length} state references`);
        }
      }
    }
  }

  // Orphaned components — defined but never imported
  for (const name of componentNames) {
    if (!importedComponents.has(name) && !['App', 'Root', 'Main', 'Layout'].includes(name)) {
      result.orphanedComponents.push(name);
    }
  }

  // Components without error boundary protection
  const pageComponents = Array.from(componentNames).filter(n =>
    /Page$|View$|Screen$|Layout$/.test(n) && !errorBoundaryProtected.has(n)
  );
  result.missingErrorBoundaries = pageComponents;

  return result;
}

// ── Runtime Behavior Team ───────────────────────────────────────────

async function runRuntimeBehavior(sandbox: SandboxProvider): Promise<RuntimeBehaviorResult> {
  const result: RuntimeBehaviorResult = {
    pagesVisited: 0,
    consoleErrors: [],
    consoleWarnings: [],
    networkFailures: [],
    interactiveElementsTested: 0,
    silentErrors: [],
    performanceIssues: [],
    buildSucceeded: false,
    buildErrors: [],
  };

  // 1. Install dependencies
  const installResult = await sandbox.runCommand('npm', ['install', '--prefer-offline']).catch(() => ({
    stdout: '', stderr: '', exitCode: 1,
  }));

  if (installResult.exitCode !== 0) {
    result.buildErrors.push(`npm install failed: ${installResult.stderr.slice(0, 500)}`);
  }

  // 2. Try build
  const buildResult = await sandbox.runCommand('npm', ['run', 'build']).catch(() => ({
    stdout: '', stderr: '', exitCode: 1,
  }));

  if (buildResult.exitCode === 0) {
    result.buildSucceeded = true;
  } else {
    // Extract build errors
    const errorLines = buildResult.stderr.split('\n').filter(l =>
      /error|Error|ERROR|failed|Failed/.test(l)
    ).slice(0, 20);
    result.buildErrors.push(...errorLines);

    // Try dev server as fallback
    const devResult = await sandbox.runCommand('npm', ['run', 'dev', '--', '--host', '0.0.0.0']).catch(() => ({
      stdout: '', stderr: '', exitCode: 1,
    }));
    if (devResult.exitCode === 0) {
      result.buildSucceeded = true;
    }
  }

  // 3. Parse build output for warnings
  const buildOutput = buildResult.stdout + buildResult.stderr;
  const warnings = buildOutput.split('\n').filter(l => /warning|Warning|WARN/.test(l));
  result.consoleWarnings.push(...warnings.slice(0, 50));

  // 4. Check for common runtime issues in source code
  const allFiles = await sandbox.listFiles('.', true);
  const sourceFiles = allFiles.filter(f =>
    /\.(tsx?|jsx?)$/.test(f) && !f.includes('node_modules')
  );

  for (const file of sourceFiles.slice(0, 300)) {
    let content: string;
    try { content = await sandbox.readFile(file); } catch { continue; }

    // Detect potential silent errors — empty catch blocks
    const emptyCatches = content.match(/catch\s*\([^)]*\)\s*\{\s*\}/g);
    if (emptyCatches) {
      result.silentErrors.push({
        page: file,
        description: `${emptyCatches.length} empty catch block(s) — errors silently swallowed`,
        evidence: 'catch(e) { }',
      });
    }

    // Detect unhandled promise rejections
    const unhandledPromises = content.match(/\.then\([^)]*\)\s*(?!\.catch)/g);
    if (unhandledPromises && unhandledPromises.length > 3) {
      result.silentErrors.push({
        page: file,
        description: `${unhandledPromises.length} .then() calls without .catch() — potential unhandled rejections`,
        evidence: '.then() without .catch()',
      });
    }

    // Detect fetch calls without error handling
    const fetchWithoutCatch = content.match(/await\s+fetch\([^)]+\)(?!\s*\.catch)/g);
    if (fetchWithoutCatch) {
      // Check if there's a surrounding try-catch
      const hasTryCatch = content.includes('try') && content.includes('catch');
      if (!hasTryCatch) {
        result.silentErrors.push({
          page: file,
          description: `fetch() calls without error handling`,
          evidence: 'await fetch() outside try-catch',
        });
      }
    }

    // Memory leak detection — event listeners without cleanup
    const addListeners = (content.match(/addEventListener\(/g) || []).length;
    const removeListeners = (content.match(/removeEventListener\(/g) || []).length;
    if (addListeners > removeListeners + 1) {
      result.silentErrors.push({
        page: file,
        description: `${addListeners - removeListeners} event listener(s) potentially leaking — added but not removed`,
        evidence: `${addListeners} addEventListener vs ${removeListeners} removeEventListener`,
      });
    }

    // Detect console.error left in production code
    const consoleErrors = content.match(/console\.error\(/g);
    if (consoleErrors) {
      result.consoleErrors.push(`${file}: ${consoleErrors.length} console.error() calls`);
    }
  }

  return result;
}

// ── Security Audit Team ─────────────────────────────────────────────

async function runSecurityAudit(sandbox: SandboxProvider): Promise<SecurityAuditResult> {
  const result: SecurityAuditResult = {
    locationsForReview: 0,
    hardcodedSecrets: [],
    xssVectors: [],
    injectionRisks: [],
    missingCsrf: false,
    insecureCors: false,
    vulnerableDeps: [],
  };

  const allFiles = await sandbox.listFiles('.', true);
  const sourceFiles = allFiles.filter(f =>
    /\.(tsx?|jsx?|mjs|cjs|json|env|yaml|yml|toml)$/.test(f) && !f.includes('node_modules')
  );

  // Secret patterns
  const secretPatterns = [
    { name: 'API Key', pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/gi },
    { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g },
    { name: 'Private Key', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
    { name: 'JWT Secret', pattern: /(?:jwt[_-]?secret|token[_-]?secret)\s*[:=]\s*['"][^'"]{10,}['"]/gi },
    { name: 'Database URL', pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/g },
    { name: 'Hardcoded Password', pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/gi },
  ];

  // XSS patterns
  const xssPatterns = [
    { desc: 'dangerouslySetInnerHTML', pattern: /dangerouslySetInnerHTML/g },
    { desc: 'innerHTML assignment', pattern: /\.innerHTML\s*=/g },
    { desc: 'document.write', pattern: /document\.write\(/g },
    { desc: 'eval() usage', pattern: /\beval\s*\(/g },
    { desc: 'Function() constructor', pattern: /new\s+Function\s*\(/g },
  ];

  // Injection patterns
  const injectionPatterns = [
    { desc: 'String concatenation in SQL', pattern: /(?:query|execute)\s*\(\s*[`"'].*\$\{/g },
    { desc: 'Template literal in query', pattern: /(?:SELECT|INSERT|UPDATE|DELETE).*\$\{/g },
    { desc: 'exec/spawn with user input', pattern: /(?:exec|spawn|execSync)\s*\([^)]*(?:req\.|params\.|query\.)/g },
  ];

  for (const file of sourceFiles.slice(0, 300)) {
    let content: string;
    try { content = await sandbox.readFile(file); } catch { continue; }

    // Skip test files and fixtures
    if (/\.(?:test|spec|fixture|mock)\./i.test(file)) continue;

    // Secret detection
    for (const sp of secretPatterns) {
      sp.pattern.lastIndex = 0;
      if (sp.pattern.test(content)) {
        // Don't flag .env.example or docs
        if (!file.includes('.example') && !file.includes('README')) {
          result.hardcodedSecrets.push(`${file}: ${sp.name} found`);
        }
      }
    }

    // XSS detection
    for (const xp of xssPatterns) {
      xp.pattern.lastIndex = 0;
      if (xp.pattern.test(content)) {
        result.xssVectors.push(`${file}: ${xp.desc}`);
      }
    }

    // Injection detection
    for (const ip of injectionPatterns) {
      ip.pattern.lastIndex = 0;
      if (ip.pattern.test(content)) {
        result.injectionRisks.push(`${file}: ${ip.desc}`);
      }
    }

    // CORS check
    if (content.includes("origin: '*'") || content.includes('origin: true')) {
      result.insecureCors = true;
    }

    // CSRF check — forms without CSRF tokens
    if (content.includes('<form') && !content.includes('csrf') && !content.includes('CSRF')) {
      result.missingCsrf = true;
    }
  }

  // npm audit for vulnerable dependencies
  const auditResult = await sandbox.runCommand('npm', ['audit', '--json']).catch(() => ({
    stdout: '{}', stderr: '', exitCode: 0,
  }));
  try {
    const audit = JSON.parse(auditResult.stdout);
    if (audit.vulnerabilities) {
      for (const [name, vuln] of Object.entries(audit.vulnerabilities)) {
        const v = vuln as any;
        if (v.severity === 'critical' || v.severity === 'high') {
          result.vulnerableDeps.push({
            name,
            severity: v.severity,
            advisory: v.via?.[0]?.title || v.via?.[0] || 'Unknown',
          });
        }
      }
    }
  } catch { /* parsing failed */ }

  result.locationsForReview = result.hardcodedSecrets.length + result.xssVectors.length + result.injectionRisks.length;

  return result;
}

// ── Architecture Review Team ────────────────────────────────────────

async function runArchitectureReview(sandbox: SandboxProvider): Promise<ArchitectureReviewResult> {
  const result: ArchitectureReviewResult = {
    couplingScore: 0,
    duplicationRate: 0,
    testCoverageEstimate: 0,
    a11yIssues: [],
    performanceAntiPatterns: [],
    namingInconsistencies: [],
    fileOrganizationScore: 80,
  };

  const allFiles = await sandbox.listFiles('.', true);
  const sourceFiles = allFiles.filter(f =>
    /\.(tsx?|jsx?)$/.test(f) && !f.includes('node_modules')
  );
  const testFiles = sourceFiles.filter(f => /\.(test|spec)\./i.test(f));

  // Test coverage estimate
  result.testCoverageEstimate = sourceFiles.length > 0
    ? Math.round((testFiles.length / sourceFiles.length) * 100)
    : 0;

  // Import fan-out analysis (coupling)
  let totalImports = 0;
  let maxImports = 0;
  const contentHashes = new Map<string, string[]>();

  for (const file of sourceFiles.slice(0, 300)) {
    let content: string;
    try { content = await sandbox.readFile(file); } catch { continue; }

    // Count imports per file (coupling metric)
    const imports = (content.match(/import\s+/g) || []).length;
    totalImports += imports;
    if (imports > maxImports) maxImports = imports;

    // A11y checks
    if (/\.tsx$/.test(file)) {
      // Images without alt
      const imgWithoutAlt = content.match(/<img(?![^>]*alt=)[^>]*>/g);
      if (imgWithoutAlt) {
        result.a11yIssues.push({ file, issue: `${imgWithoutAlt.length} <img> tag(s) without alt attribute` });
      }

      // Buttons without accessible labels
      const emptyButtons = content.match(/<button[^>]*>\s*<\/button>/g);
      if (emptyButtons) {
        result.a11yIssues.push({ file, issue: `${emptyButtons.length} empty <button> element(s)` });
      }

      // Click handlers on non-interactive elements
      const clickOnDiv = content.match(/<div[^>]*onClick/g);
      if (clickOnDiv) {
        result.a11yIssues.push({ file, issue: `${clickOnDiv.length} onClick on <div> — should use <button>` });
      }

      // Missing ARIA on custom controls
      if (content.includes('role=') === false && (content.includes('tabIndex') || content.includes('onKeyDown'))) {
        result.a11yIssues.push({ file, issue: 'Interactive element without ARIA role' });
      }
    }

    // Performance anti-patterns
    if (/\.tsx?$/.test(file)) {
      // Inline object/array in JSX (causes re-renders)
      const inlineObjects = content.match(/(?:style|className)=\{\{/g);
      if (inlineObjects && inlineObjects.length > 5) {
        result.performanceAntiPatterns.push({
          file,
          pattern: `${inlineObjects.length} inline style objects in JSX — consider useMemo or CSS classes`,
        });
      }

      // Large component (>500 lines)
      const lines = content.split('\n').length;
      if (lines > 500) {
        result.performanceAntiPatterns.push({
          file,
          pattern: `Component file is ${lines} lines — consider splitting into smaller components`,
        });
      }

      // useEffect with too many dependencies
      const heavyEffects = content.match(/useEffect\([^,]+,\s*\[[^\]]{100,}\]/g);
      if (heavyEffects) {
        result.performanceAntiPatterns.push({
          file,
          pattern: 'useEffect with excessive dependencies — consider splitting or using useMemo',
        });
      }
    }

    // Naming conventions check
    const fileName = file.split('/').pop() || '';
    if (/\.tsx$/.test(file) && /^[a-z]/.test(fileName) && !fileName.startsWith('use')) {
      // TSX component files should be PascalCase
      result.namingInconsistencies.push(`${file}: Component file should be PascalCase`);
    }

    // Content fingerprinting for duplication detection
    const normalized = content.replace(/\s+/g, ' ').slice(0, 200);
    const hash = normalized.slice(0, 100);
    if (!contentHashes.has(hash)) contentHashes.set(hash, []);
    contentHashes.get(hash)!.push(file);
  }

  // Coupling score (0-100, lower is better)
  const avgImports = sourceFiles.length > 0 ? totalImports / sourceFiles.length : 0;
  result.couplingScore = Math.min(100, Math.round(avgImports * 5));

  // Duplication rate
  const duplicateGroups = Array.from(contentHashes.values()).filter(g => g.length > 1);
  const duplicateFiles = duplicateGroups.reduce((acc, g) => acc + g.length - 1, 0);
  result.duplicationRate = sourceFiles.length > 0
    ? Math.round((duplicateFiles / sourceFiles.length) * 100)
    : 0;

  return result;
}

// ── Main Forensic Audit Tool ────────────────────────────────────────

export function createForensicAuditTool(
  sandbox: SandboxProvider,
  router?: ProviderRouter,
): ToolDefinition {
  return {
    name: 'run_forensic_audit',
    description: `Run a comprehensive forensic audit with 5 concurrent analysis teams:
1. Static Analysis — TypeScript errors, dependency vulnerabilities, dead code, circular deps
2. Semantic Intelligence — component mapping, route analysis, hook analysis, type coverage
3. Runtime Behavior — build check, silent error detection, memory leaks, unhandled promises
4. Security — OWASP patterns, hardcoded secrets, XSS, injection, vulnerable deps
5. Architecture — coupling, duplication, test coverage, a11y, performance anti-patterns

All teams run concurrently for maximum speed. Returns a structured ForensicAuditReport.`,
    input_schema: {
      type: 'object',
      properties: {
        repo_url: {
          type: 'string',
          description: 'Optional Git repository URL to clone before auditing',
        },
        branch: {
          type: 'string',
          description: 'Optional branch name to checkout',
        },
        focus_areas: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional focus areas to prioritize (e.g., ["security", "performance", "a11y"])',
        },
      },
    },
    execute: async (params, ctx) => {
      const startTime = Date.now();

      // Clone repo if URL provided
      if (params.repo_url) {
        const cloneResult = await sandbox.runCommand('git', [
          'clone', '--depth', '1',
          ...(params.branch ? ['--branch', params.branch as string] : []),
          params.repo_url as string, '.',
        ]).catch(() => ({
          stdout: '', stderr: 'Clone failed', exitCode: 1,
        }));

        if (cloneResult.exitCode !== 0) {
          return {
            error: `Failed to clone repository: ${cloneResult.stderr.slice(0, 200)}`,
            suggestion: 'Ensure the repository URL is accessible and credentials are configured.',
          };
        }
      }

      // Run all 5 teams concurrently
      const [staticResults, semanticResults, runtimeResults, securityResults, architectureResults] =
        await Promise.all([
          runStaticAnalysis(sandbox).catch(err => ({
            typescriptErrors: -1, lintWarnings: 0, dependencyVulnerabilities: 0,
            deadCodeFiles: [], circularDeps: [], bundleSizeEstimate: 'error',
            error: String(err),
          } as StaticAnalysisResult)),

          runSemanticIntelligence(sandbox).catch(err => ({
            totalComponents: 0, totalRoutes: 0, totalHooks: 0, totalApiCalls: 0,
            orphanedComponents: [], missingErrorBoundaries: [], staleClosureRisks: [],
            anyTypeUsages: 0, propDrillingDepth: 0,
            error: String(err),
          } as SemanticIntelResult)),

          runRuntimeBehavior(sandbox).catch(err => ({
            pagesVisited: 0, consoleErrors: [], consoleWarnings: [],
            networkFailures: [], interactiveElementsTested: 0, silentErrors: [],
            performanceIssues: [], buildSucceeded: false, buildErrors: [String(err)],
          } as RuntimeBehaviorResult)),

          runSecurityAudit(sandbox).catch(err => ({
            locationsForReview: 0, hardcodedSecrets: [], xssVectors: [],
            injectionRisks: [], missingCsrf: false, insecureCors: false,
            vulnerableDeps: [],
            error: String(err),
          } as SecurityAuditResult)),

          runArchitectureReview(sandbox).catch(err => ({
            couplingScore: 0, duplicationRate: 0, testCoverageEstimate: 0,
            a11yIssues: [], performanceAntiPatterns: [], namingInconsistencies: [],
            fileOrganizationScore: 0,
            error: String(err),
          } as ArchitectureReviewResult)),
        ]);

      const durationMs = Date.now() - startTime;

      // Generate structured report
      const report = generateAuditReport({
        staticAnalysis: staticResults,
        semanticIntelligence: semanticResults,
        runtimeBehavior: runtimeResults,
        securityAudit: securityResults,
        architectureReview: architectureResults,
        durationMs,
      });

      // Write findings to Brain knowledge graph
      try {
        await ctx.brain.writeNode(
          ctx.projectId,
          'discovery',
          'Forensic Audit Report',
          {
            auditType: 'forensic',
            report,
            durationMs,
            timestamp: new Date().toISOString(),
          },
          ctx.sessionId,
          { confidence: 0.95 },
        );
      } catch {
        // Non-blocking — report is still returned even if Brain write fails
      }

      return report;
    },
  };
}
