/**
 * Tool registry — assembles tools from all modules for AgentRuntime registration.
 */

export type { ToolDefinition, ToolContext } from '../agents/runtime.js';
import type { ToolDefinition } from '../agents/runtime.js';
import type { ProviderRouter } from '../providers/router.js';
import { createSandboxTools } from './sandbox/index.js';
import { createVerifyTools } from './verify/index.js';
import { createAnalyzeTools } from './analyze/index.js';
import { createDesignTools } from './design/index.js';
import { createVisionTools } from './vision/index.js';
import { createAuditTools } from './audit/index.js';
import type { SandboxProvider } from './sandbox/provider.js';

export interface ToolRegistryConfig {
  sandbox: SandboxProvider;
  router?: ProviderRouter;
}

export function buildToolRegistry(config: ToolRegistryConfig): ToolDefinition[] {
  return [
    ...createSandboxTools(config.sandbox),
    ...createVerifyTools(config.sandbox),
    ...createAnalyzeTools({ router: config.router }),
    ...createDesignTools({ sandbox: config.sandbox }),
    ...createVisionTools(),
    ...createAuditTools({ sandbox: config.sandbox, router: config.router }),
  ];
}

// Re-exports for convenience
export { createLocalSandbox } from './sandbox/provider.js';
export type { SandboxProvider } from './sandbox/provider.js';
export type { VisionProvider } from './vision/index.js';
