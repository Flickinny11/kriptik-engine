/**
 * Agent container subsystem — Phase A, Step 4.
 *
 * Provides lightweight process isolation per agent with:
 * - Scoped write enforcement at the filesystem level
 * - MCP tool configuration per agent role
 * - Container lifecycle management (create, monitor, terminate)
 *
 * Spec Section 4.2, Tier 3 — Agent Container Layer.
 */

export { AgentContainer } from "./agent-container.js";
export { ContainerManager } from "./container-manager.js";
export { isPathWithinScope } from "./scope-guard.js";
export { getToolsForRole, getTier1ServiceTools, DOCUMENTATION_TOOLS } from "./tool-config.js";
