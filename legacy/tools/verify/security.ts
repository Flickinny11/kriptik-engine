/**
 * check_security — surfaces code locations worth security review.
 *
 * This is NOT a scanner that declares verdicts. It finds files and
 * locations that handle sensitive concerns (auth, queries, user input,
 * payments, config) and returns them for the agent to reason about.
 * The agent is the security reviewer. This tool is its way of finding
 * the relevant code.
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import type { SandboxProvider } from '../sandbox/provider.js';

const SECURITY_CONCERNS: Array<{
  concern: string;
  filePatterns: RegExp[];
  contentSignals: RegExp[];
}> = [
  {
    concern: 'Authentication / session management',
    filePatterns: [/auth/i, /login/i, /session/i, /signup/i, /register/i],
    contentSignals: [/password/i, /bcrypt|argon|hash/i, /jwt|token/i, /session/i, /cookie/i],
  },
  {
    concern: 'Database queries with user input',
    filePatterns: [/query|database|db|prisma|drizzle|sql/i],
    contentSignals: [/query|execute|findMany|findFirst|\$queryRaw/i],
  },
  {
    concern: 'File uploads or user-provided file paths',
    filePatterns: [/upload/i, /file/i, /storage/i],
    contentSignals: [/multer|formidable|readFile|writeFile|createReadStream/i, /req\.file|req\.body/i],
  },
  {
    concern: 'Environment variables and secrets',
    filePatterns: [/config/i, /env/i],
    contentSignals: [/process\.env\./],
  },
  {
    concern: 'Payment or financial data handling',
    filePatterns: [/payment|billing|stripe|credit|charge/i],
    contentSignals: [/stripe|payment_intent|charge|refund|customer/i],
  },
  {
    concern: 'External API calls with credentials',
    filePatterns: [/api|fetch|client|service/i],
    contentSignals: [/Authorization|Bearer|api[_-]?key/i, /fetch\(|axios|got\(/i],
  },
];

export function createSecurityTool(sandbox: SandboxProvider): ToolDefinition {
  return {
    name: 'check_security',
    description: 'Find code locations that handle security-sensitive concerns (auth, database queries, user input, payments, secrets, API credentials). Returns files and locations for agent review — does NOT declare verdicts or severity levels. The agent reasons about whether the code is secure.',
    input_schema: {
      type: 'object',
      properties: {
        focus_areas: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional focus areas (e.g., ["authentication", "api_keys", "sql", "file_access"])',
        },
      },
    },
    execute: async (params) => {
      const focusAreas = params.focus_areas as string[] | undefined;
      const allFiles = await sandbox.listFiles('.', true);
      const sourceFiles = allFiles.filter((f) =>
        /\.(tsx?|jsx?|mjs|cjs)$/.test(f) && !f.includes('node_modules'),
      );

      const reviewLocations: Array<{
        file: string;
        concern: string;
        review_reason: string;
        relevant_lines: string[];
      }> = [];

      for (const file of sourceFiles.slice(0, 200)) {
        let content: string;
        try { content = await sandbox.readFile(file); } catch { continue; }
        const lines = content.split('\n');

        for (const sc of SECURITY_CONCERNS) {
          // Skip if focus_areas specified and this concern doesn't match
          if (focusAreas?.length) {
            const matches = focusAreas.some((fa) => sc.concern.toLowerCase().includes(fa.toLowerCase()));
            if (!matches) continue;
          }

          const fileMatches = sc.filePatterns.some((p) => p.test(file));
          const contentMatches = sc.contentSignals.some((p) => { p.lastIndex = 0; return p.test(content); });

          if (fileMatches || contentMatches) {
            // Extract relevant lines (lines matching content signals)
            const relevant: string[] = [];
            for (let i = 0; i < lines.length && relevant.length < 10; i++) {
              if (sc.contentSignals.some((p) => { p.lastIndex = 0; return p.test(lines[i]); })) {
                relevant.push(`L${i + 1}: ${lines[i].trim()}`);
              }
            }

            reviewLocations.push({
              file,
              concern: sc.concern,
              review_reason: fileMatches
                ? `File name suggests ${sc.concern.toLowerCase()}`
                : `File contains patterns related to ${sc.concern.toLowerCase()}`,
              relevant_lines: relevant,
            });
          }
        }
      }

      return {
        filesScanned: sourceFiles.length,
        locationsForReview: reviewLocations.length,
        locations: reviewLocations,
        note: 'These are locations worth reviewing — not vulnerability declarations. Read the code and reason about security.',
      };
    },
  };
}
