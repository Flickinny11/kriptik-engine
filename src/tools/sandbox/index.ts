/**
 * Sandbox tools — assembled from individual modules.
 */

export { createLocalSandbox } from './provider.js';
export type { SandboxProvider, CommandResult } from './provider.js';
import type { ToolDefinition } from '../../agents/runtime.js';
import type { SandboxProvider } from './provider.js';
import { createFilesystemTools } from './filesystem.js';
import { createCommandTools } from './commands.js';
import { createDevServerTools } from './dev-server.js';
import { createScreenshotTools } from './screenshot.js';

export function createSandboxTools(sandbox: SandboxProvider): ToolDefinition[] {
  return [
    ...createFilesystemTools(sandbox),
    ...createCommandTools(sandbox),
    ...createDevServerTools(sandbox),
    ...createScreenshotTools(sandbox),
  ];
}
