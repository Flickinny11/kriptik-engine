/**
 * check_placeholders — fast scan for patterns that may indicate
 * incomplete code. Returns locations for agent review.
 *
 * The agent decides what's actually a problem. A TODO in a test file
 * is fine. A TODO in a critical auth path isn't. The tool can't know
 * the difference — only the agent can.
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import type { SandboxProvider } from '../sandbox/provider.js';
import { LIMITS } from '../../config/index.js';

export type AttentionLevel = 'high' | 'medium' | 'low';

export const PLACEHOLDER_PATTERNS: Array<{ pattern: RegExp; type: string; attention: AttentionLevel }> = [
  // High attention — likely needs fixing
  { pattern: /\bTODO\b/gi, type: 'todo', attention: 'high' },
  { pattern: /\bFIXME\b/gi, type: 'fixme', attention: 'high' },
  { pattern: /throw new Error\(['"]not implemented['"]\)/gi, type: 'not_implemented', attention: 'high' },
  { pattern: /\blorem\s+ipsum\b/gi, type: 'lorem_ipsum', attention: 'high' },
  { pattern: /\blorem\b/gi, type: 'lorem', attention: 'high' },
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, type: 'exposed_credential', attention: 'high' },
  { pattern: /your-[\w-]+-here/gi, type: 'placeholder_value', attention: 'high' },
  { pattern: /\bCHANGEME\b/gi, type: 'changeme', attention: 'high' },
  { pattern: /\bCHANGE_ME\b/gi, type: 'changeme', attention: 'high' },
  { pattern: /\bREPLACE_ME\b/gi, type: 'replace_me', attention: 'high' },
  { pattern: /['"]test@(?:example|test)\.com/gi, type: 'test_email', attention: 'high' },
  { pattern: /['"]admin@example\.com/gi, type: 'test_email', attention: 'high' },
  { pattern: /['"]https?:\/\/example\.com/gi, type: 'example_url', attention: 'high' },
  { pattern: /['"]John\s+Doe['"]/gi, type: 'test_data', attention: 'high' },
  { pattern: /['"]123\s+Main\s+St/gi, type: 'test_data', attention: 'high' },
  // Warning
  { pattern: /\bHACK\b/g, type: 'hack', attention: 'medium' },
  { pattern: /\bXXX\b/g, type: 'xxx_marker', attention: 'medium' },
  { pattern: /\bplaceholder\b/gi, type: 'placeholder', attention: 'medium' },
  { pattern: /\/\/ stub\b/gi, type: 'stub_comment', attention: 'medium' },
  { pattern: /return\s+(?:null|undefined|{});\s*\/\//gm, type: 'stub_return', attention: 'medium' },
  { pattern: /\bconsole\.log\s*\(/gm, type: 'console_log', attention: 'medium' },
  { pattern: /catch\s*\([^)]*\)\s*\{\s*\}/gm, type: 'empty_catch', attention: 'medium' },
  { pattern: /as\s+any\b/gm, type: 'any_type', attention: 'medium' },
  { pattern: /:\s*any\b/gm, type: 'any_type', attention: 'medium' },
  { pattern: /@ts-ignore(?!\s+\S)/gm, type: 'ts_ignore_no_reason', attention: 'medium' },
  { pattern: /@ts-expect-error(?!\s+\S)/gm, type: 'ts_expect_no_reason', attention: 'medium' },
  { pattern: /window\.alert\s*\(/gm, type: 'browser_alert', attention: 'medium' },
  { pattern: /window\.confirm\s*\(/gm, type: 'browser_confirm', attention: 'medium' },
  // Info
  { pattern: /\bexample\.(com|org|net)\b/gi, type: 'example_domain', attention: 'low' },
];

export function createPlaceholderTool(sandbox: SandboxProvider): ToolDefinition {
  return {
    name: 'check_placeholders',
    description: 'Scan source files for patterns that may indicate incomplete code: TODO/FIXME markers, lorem ipsum, stubs, placeholder values, exposed credentials. Returns locations for agent review with attention levels — the agent decides what is actually a problem in context.',
    input_schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths to scan. Required.',
        },
      },
      required: ['files'],
    },
    execute: async (params) => {
      const filePaths = params.files as string[];
      const findings: Array<{
        file: string; line: number; type: string;
        attention_level: AttentionLevel; snippet: string;
      }> = [];

      for (const filePath of filePaths) {
        let content: string;
        try { content = await sandbox.readFile(filePath); } catch { continue; }
        const lines = content.split('\n');

        for (const pp of PLACEHOLDER_PATTERNS) {
          pp.pattern.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = pp.pattern.exec(content)) !== null) {
            const beforeMatch = content.slice(0, match.index);
            const lineNum = beforeMatch.split('\n').length;
            findings.push({
              file: filePath, line: lineNum, type: pp.type,
              attention_level: pp.attention, snippet: lines[lineNum - 1]?.trim() ?? '',
            });
          }
        }
      }

      return {
        scannedFiles: filePaths.length,
        findingCount: findings.length,
        findings: findings.slice(0, LIMITS.PLACEHOLDER_RESULTS_MAX),
        byAttentionLevel: {
          high: findings.filter((f) => f.attention_level === 'high').length,
          medium: findings.filter((f) => f.attention_level === 'medium').length,
          low: findings.filter((f) => f.attention_level === 'low').length,
        },
        byType: findings.reduce(
          (acc, f) => { acc[f.type] = (acc[f.type] ?? 0) + 1; return acc; },
          {} as Record<string, number>,
        ),
        note: 'These are locations worth reviewing. The agent decides what is actually a problem in context.',
      };
    },
  };
}
