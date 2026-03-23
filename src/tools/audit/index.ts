/**
 * Barrel — assembles all audit tools into a single array.
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import type { SandboxProvider } from '../sandbox/provider.js';
import type { ProviderRouter } from '../../providers/router.js';
import { createForensicAuditTool } from './forensic-audit.js';

export function createAuditTools(opts: {
  sandbox: SandboxProvider;
  router?: ProviderRouter;
}): ToolDefinition[] {
  return [
    createForensicAuditTool(opts.sandbox, opts.router),
  ];
}

export type { ForensicAuditReport } from './report-generator.js';
