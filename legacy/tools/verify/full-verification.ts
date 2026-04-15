/**
 * run_full_verification — convenience tool that runs all verification
 * checks in one call and returns a combined summary for the agent
 * to reason about. Does NOT declare PASS/FAIL — the agent decides.
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import type { SandboxProvider } from '../sandbox/provider.js';
import { PLACEHOLDER_PATTERNS } from './placeholders.js';
import { evaluateCriterion } from './intent-satisfaction.js';
import { LIMITS } from '../../config/index.js';

export function createFullVerificationTool(sandbox: SandboxProvider): ToolDefinition {
  return {
    name: 'run_full_verification',
    description: 'Run all verification checks in one call: TypeScript compilation, placeholder scan, intent satisfaction for all brain intent nodes, conflict check, and error node check. Returns a combined summary — the agent reasons about what needs attention.',
    input_schema: {
      type: 'object',
      properties: {},
    },
    execute: async (_params, ctx) => {
      const issues: string[] = [];

      // 1. TypeScript errors
      const tsResult = await sandbox.runCommand('npx', ['tsc', '--noEmit', '--pretty']);
      const tsErrors = tsResult.exitCode !== 0
        ? tsResult.stdout.split('\n').filter((l) => l.includes('error TS')).length
        : 0;
      if (tsErrors > 0) issues.push(`${tsErrors} TypeScript errors`);

      // 2. Placeholder scan
      let highAttention = 0;
      let totalFindings = 0;
      try {
        const allFiles = await sandbox.listFiles('.', true);
        const sourceFiles = allFiles.filter((f) =>
          /\.(tsx?|jsx?|css|html)$/.test(f) && !f.includes('node_modules'),
        );
        for (const file of sourceFiles.slice(0, LIMITS.VERIFICATION_FILES_MAX)) {
          let content: string;
          try { content = await sandbox.readFile(file); } catch { continue; }
          for (const pp of PLACEHOLDER_PATTERNS) {
            pp.pattern.lastIndex = 0;
            if (pp.pattern.test(content)) {
              totalFindings++;
              if (pp.attention === 'high') highAttention++;
            }
          }
        }
      } catch {}
      if (highAttention > 0) issues.push(`${highAttention} high-attention placeholder findings`);

      // 3. Intent satisfaction
      let intentsSatisfied = 0;
      let intentsUnsatisfied = 0;
      let intentsNeedRuntime = 0;

      const intentNodes = ctx.brain.getNodesByType(ctx.projectId, 'intent', 'active');
      let allFiles: string[] = [];
      try { allFiles = await sandbox.listFiles('.', true); } catch {}

      for (const node of intentNodes) {
        const content = node.content as Record<string, unknown>;
        const criteria = (content.success_criteria as string[]) ?? [];
        if (criteria.length === 0) { intentsNeedRuntime++; continue; }

        let failed = false;
        for (const c of criteria) {
          const result = await evaluateCriterion(c, allFiles, sandbox);
          if (result.status === 'fail') { failed = true; break; }
        }
        if (failed) intentsUnsatisfied++; else intentsSatisfied++;
      }
      if (intentsUnsatisfied > 0) issues.push(`${intentsUnsatisfied} intent nodes with unsatisfied criteria`);

      // 4. Conflicts
      const conflicts = ctx.brain.getConflicts(ctx.projectId);
      if (conflicts.length > 0) issues.push(`${conflicts.length} unresolved conflicts`);

      // 5. Error nodes
      const errorNodes = ctx.brain.getNodesByType(ctx.projectId, 'error', 'active');
      if (errorNodes.length > 0) issues.push(`${errorNodes.length} active error nodes`);

      return {
        summary: {
          typescript_errors: tsErrors,
          placeholder_findings: totalFindings,
          high_attention_placeholders: highAttention,
          intents: { satisfied: intentsSatisfied, unsatisfied: intentsUnsatisfied, needs_review: intentsNeedRuntime },
          conflicts: conflicts.length,
          active_errors: errorNodes.length,
        },
        issues_found: issues,
        note: 'Review these findings and reason about what needs attention. Not all findings are problems — context matters.',
      };
    },
  };
}
