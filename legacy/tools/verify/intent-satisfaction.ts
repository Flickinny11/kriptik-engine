/**
 * evaluate_intent_satisfaction — Check whether intent/inferred need
 * success_criteria are satisfied by inspecting actual project files.
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import type { SandboxProvider } from '../sandbox/provider.js';

// --- Intent evaluation helpers ---

export async function evaluateCriterion(
  criterion: string,
  projectFiles: string[],
  sandbox: SandboxProvider,
): Promise<{ criterion: string; status: 'pass' | 'fail' | 'requires_runtime_test'; evidence: string }> {
  const criterionLower = criterion.toLowerCase();

  // --- Pattern: file/component existence ---
  // Look for keywords that imply a file or component should exist
  const componentPatterns = extractComponentNames(criterion);
  const routePatterns = extractRoutePatterns(criterion);
  const filePatterns = extractFilePatterns(criterion);

  // Check for route-like patterns (e.g., "/api/auth/login", "login page")
  if (routePatterns.length > 0) {
    for (const route of routePatterns) {
      const matchingFiles = projectFiles.filter((f) =>
        f.toLowerCase().includes(route.toLowerCase()),
      );
      if (matchingFiles.length > 0) {
        return {
          criterion,
          status: 'pass',
          evidence: `Route file found: ${matchingFiles[0]}`,
        };
      }
    }
    return {
      criterion,
      status: 'fail',
      evidence: `No files matching route patterns: ${routePatterns.join(', ')}`,
    };
  }

  // Check for component names
  if (componentPatterns.length > 0) {
    for (const comp of componentPatterns) {
      const matchingFiles = projectFiles.filter((f) => {
        const lower = f.toLowerCase();
        return lower.includes(comp.toLowerCase()) && (lower.endsWith('.tsx') || lower.endsWith('.jsx') || lower.endsWith('.ts') || lower.endsWith('.js'));
      });
      if (matchingFiles.length > 0) {
        // Verify the file has actual content (not just an empty stub)
        try {
          const content = await sandbox.readFile(matchingFiles[0]);
          if (content.length > 50) {
            return {
              criterion,
              status: 'pass',
              evidence: `Component found: ${matchingFiles[0]} (${content.length} bytes)`,
            };
          }
        } catch {}
      }
    }
  }

  // Check for specific file patterns
  if (filePatterns.length > 0) {
    for (const pattern of filePatterns) {
      const matchingFiles = projectFiles.filter((f) =>
        f.toLowerCase().includes(pattern.toLowerCase()),
      );
      if (matchingFiles.length > 0) {
        return {
          criterion,
          status: 'pass',
          evidence: `File found: ${matchingFiles[0]}`,
        };
      }
    }
    return {
      criterion,
      status: 'fail',
      evidence: `No files matching: ${filePatterns.join(', ')}`,
    };
  }

  // --- Pattern: behavioral criteria (requires runtime) ---
  const runtimeKeywords = [
    'responsive', 'mobile', 'loading state', 'error handling', 'error message',
    'validation', 'accessible', 'wcag', 'performance', 'seo',
    'redirect', 'session', 'real-time', 'notification',
    '60fps', 'smooth', 'animation',
  ];
  if (runtimeKeywords.some((kw) => criterionLower.includes(kw))) {
    // Try to find evidence in source files via keyword search
    const searchTerms = extractSearchTerms(criterion);
    for (const term of searchTerms) {
      const matchingFiles = projectFiles.filter((f) =>
        f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.js'),
      );
      for (const file of matchingFiles.slice(0, 20)) {
        try {
          const content = await sandbox.readFile(file);
          if (content.toLowerCase().includes(term.toLowerCase())) {
            return {
              criterion,
              status: 'pass',
              evidence: `Pattern "${term}" found in ${file}`,
            };
          }
        } catch {}
      }
    }
    return {
      criterion,
      status: 'requires_runtime_test',
      evidence: `Behavioral criterion — needs runtime verification. No source evidence found for: ${searchTerms.join(', ')}`,
    };
  }

  // --- Pattern: keyword search in source files ---
  const searchTerms = extractSearchTerms(criterion);
  if (searchTerms.length > 0) {
    for (const term of searchTerms) {
      const sourceFiles = projectFiles.filter((f) =>
        f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.js'),
      );
      for (const file of sourceFiles.slice(0, 30)) {
        try {
          const content = await sandbox.readFile(file);
          if (content.toLowerCase().includes(term.toLowerCase())) {
            return {
              criterion,
              status: 'pass',
              evidence: `Keyword "${term}" found in ${file}`,
            };
          }
        } catch {}
      }
    }
    return {
      criterion,
      status: 'fail',
      evidence: `None of these keywords found in source files: ${searchTerms.join(', ')}`,
    };
  }

  // Fallback — can't determine from file inspection alone
  return {
    criterion,
    status: 'requires_runtime_test',
    evidence: 'Could not evaluate from file inspection. Requires manual or runtime verification.',
  };
}

function extractComponentNames(criterion: string): string[] {
  const names: string[] = [];
  // PascalCase words are likely component names
  const pascalMatches = criterion.match(/\b[A-Z][a-zA-Z]+(?:Component|Button|Form|Modal|Card|List|Page|View|Panel|Header|Footer|Nav|Sidebar|Menu|Dialog|Drawer|Tooltip|Badge|Avatar|Input|Select|Dropdown|Table|Grid|Chart)\b/g);
  if (pascalMatches) names.push(...pascalMatches);
  // Quoted strings
  const quotedMatches = criterion.match(/["'`]([^"'`]+)["'`]/g);
  if (quotedMatches) names.push(...quotedMatches.map((m) => m.slice(1, -1)));
  return names;
}

function extractRoutePatterns(criterion: string): string[] {
  const routes: string[] = [];
  // /api/... patterns
  const apiRoutes = criterion.match(/\/api\/[\w/-]+/g);
  if (apiRoutes) routes.push(...apiRoutes);
  // "X page" → look for app/x/ or pages/x
  const pageMatch = criterion.match(/(\w+)\s+page/gi);
  if (pageMatch) {
    routes.push(...pageMatch.map((m) => m.replace(/\s+page/i, '').toLowerCase()));
  }
  return routes;
}

function extractFilePatterns(criterion: string): string[] {
  const patterns: string[] = [];
  // Direct file references
  const fileRefs = criterion.match(/[\w./-]+\.\w{2,4}/g);
  if (fileRefs) patterns.push(...fileRefs);
  return patterns;
}

export function extractSearchTerms(criterion: string): string[] {
  // Extract meaningful search terms from the criterion
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
    'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
    'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
    'that', 'this', 'these', 'those', 'what', 'which', 'who', 'whom',
    'when', 'where', 'why', 'how', 'user', 'users', 'should', 'app',
    'application', 'feature', 'functionality', 'implement', 'implemented',
  ]);

  const words = criterion
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // Also look for multi-word technical terms
  const technicalTerms: string[] = [];
  const techPatterns = [
    /local\s*storage/gi, /session\s*storage/gi, /api\s*route/gi,
    /error\s*handling/gi, /loading\s*state/gi, /empty\s*state/gi,
    /form\s*validation/gi, /file\s*upload/gi, /image\s*upload/gi,
    /dark\s*mode/gi, /light\s*mode/gi, /rate\s*limit/gi,
    /credit\s*system/gi, /payment/gi, /stripe/gi, /auth/gi,
    /login/gi, /register/gi, /signup/gi, /logout/gi,
    /gallery/gi, /download/gi, /share/gi, /delete/gi,
    /pagination/gi, /infinite\s*scroll/gi, /search/gi, /filter/gi,
  ];
  for (const pat of techPatterns) {
    if (pat.test(criterion)) {
      const match = criterion.match(pat);
      if (match) technicalTerms.push(match[0].toLowerCase().replace(/\s+/g, ''));
    }
  }

  return [...new Set([...words.slice(0, 5), ...technicalTerms])];
}

export function createIntentSatisfactionTool(sandbox: SandboxProvider): ToolDefinition {
  return {
    name: 'evaluate_intent_satisfaction',
    description: 'Evaluate whether a specific intent or inferred need has been satisfied by inspecting actual project files. Reads the intent node from the Brain, extracts success_criteria, and checks each criterion against the sandbox: does the file exist, does the route exist, is the component implemented. Returns pass/fail/requires_runtime_test for each criterion with file-path evidence.',
    input_schema: {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: 'Brain node ID of the intent or inferred need to evaluate' },
      },
      required: ['node_id'],
    },
    execute: async (params, ctx) => {
      const nodeId = params.node_id as string;

      // Read the intent node from brain
      const node = ctx.brain.getNode(nodeId);
      if (!node) {
        return { error: `Node ${nodeId} not found` };
      }

      const content = node.content as Record<string, unknown>;
      const title = node.title;
      const successCriteria = (content.success_criteria as string[]) ?? [];

      if (successCriteria.length === 0) {
        return {
          nodeId,
          title,
          status: 'no_criteria',
          message: 'This node has no success_criteria defined. Cannot evaluate.',
        };
      }

      // Get all project files for inspection
      let projectFiles: string[] = [];
      try {
        projectFiles = await sandbox.listFiles('.', true);
      } catch {
        return { error: 'Could not list project files' };
      }

      const results: Array<{
        criterion: string;
        status: 'pass' | 'fail' | 'requires_runtime_test';
        evidence: string;
      }> = [];

      for (const criterion of successCriteria) {
        const evaluation = await evaluateCriterion(criterion, projectFiles, sandbox);
        results.push(evaluation);
      }

      const passed = results.filter((r) => r.status === 'pass').length;
      const failed = results.filter((r) => r.status === 'fail').length;
      const needsRuntime = results.filter((r) => r.status === 'requires_runtime_test').length;

      return {
        nodeId,
        title,
        nodeType: node.nodeType,
        totalCriteria: results.length,
        passed,
        failed,
        requiresRuntimeTest: needsRuntime,
        satisfied: failed === 0,
        results,
      };
    },
  };
}
