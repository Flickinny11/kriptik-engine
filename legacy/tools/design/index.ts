import type { ToolDefinition } from '../../agents/runtime.js';
import type { SandboxProvider } from '../sandbox/provider.js';
import { createDesignReferencesTool } from './references.js';

export function createDesignTools(opts: { sandbox: SandboxProvider }): ToolDefinition[] {
  return [createDesignReferencesTool(opts.sandbox)];
}
