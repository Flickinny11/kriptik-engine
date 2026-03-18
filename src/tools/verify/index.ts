/**
 * Verification tools barrel — assembles all verify tools into a single array.
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import type { SandboxProvider } from '../sandbox/provider.js';
import { createTypescriptTool } from './typescript.js';
import { createSecurityTool } from './security.js';
import { createPlaceholderTool } from './placeholders.js';
import { createDesignScoreTool } from './design-score.js';
import { createIntentSatisfactionTool } from './intent-satisfaction.js';
import { createFullVerificationTool } from './full-verification.js';

export function createVerifyTools(sandbox: SandboxProvider): ToolDefinition[] {
  return [
    createTypescriptTool(sandbox),
    createSecurityTool(sandbox),
    createPlaceholderTool(sandbox),
    createDesignScoreTool(),
    createIntentSatisfactionTool(sandbox),
    createFullVerificationTool(sandbox),
  ];
}
