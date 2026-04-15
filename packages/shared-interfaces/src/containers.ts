/**
 * Agent container interfaces — defining how agents are isolated
 * in lightweight containers with process isolation, mounted shared
 * repository, and MCP tool access.
 *
 * Spec Section 4.2, Tier 3 — Agent Container Layer:
 *   Each primary builder agent runs in a lightweight container with
 *   process isolation, a mounted shared repository (full read, scoped
 *   write), a local runtime environment, MCP access to all Tier 1
 *   services, and disposable-by-design lifecycle.
 *
 * Spec Section 12.4, Phase A Step 4 — Agent containers with process
 *   isolation and scoped write access.
 */

import type { AgentRole, ModelTier, IToolDefinition } from "./agents.js";

// ---------------------------------------------------------------------------
// Container state
// ---------------------------------------------------------------------------

/**
 * Possible states of an agent container.
 * Containers are disposable-by-design — when the monitoring system
 * triggers rotation, the container is terminated and a new one
 * launches in seconds against the same repo state.
 */
export type ContainerState =
  | "creating"     // Container being set up (filesystem, mounts, env)
  | "ready"        // Container created but agent not yet launched inside it
  | "running"      // Agent session active within the container
  | "stopping"     // Graceful shutdown in progress
  | "terminated"   // Container stopped and cleaned up
  | "failed";      // Container failed to start or crashed

// ---------------------------------------------------------------------------
// Container configuration
// ---------------------------------------------------------------------------

/**
 * IContainerConfig — configuration for creating an agent container.
 *
 * Spec Section 4.2, Tier 3 — each container gets:
 *   - Process isolation
 *   - Mounted shared repository (full read, scoped write)
 *   - Local runtime environment
 *   - MCP access to Tier 1 services
 *   - Disposable-by-design lifecycle
 */
export interface IContainerConfig {
  /** Unique identifier for this container. */
  readonly containerId: string;
  /** The build this container belongs to. */
  readonly buildId: string;
  /** Agent role — determines MCP tool configuration. */
  readonly role: AgentRole;
  /** Model tier for the agent running in this container. */
  readonly modelTier: ModelTier;
  /** Goal ID assigned to the agent in this container. */
  readonly goalId: string | null;

  /**
   * Absolute path to the shared repository root.
   * The container gets full read access to the entire repo.
   * Spec Section 4.2, Tier 2 — shared repository layer.
   */
  readonly repoPath: string;

  /**
   * The agent's working branch within the shared repository.
   * Write access is restricted to this branch.
   */
  readonly workingBranch: string;

  /**
   * Scoped write paths — files/directories this agent may modify.
   * Enforced at the filesystem level via read-only mounts with
   * targeted writable overlays.
   * Spec Section 4.3, Check 1 — scope verification.
   */
  readonly scopedWritePaths: readonly string[];

  /**
   * MCP tool definitions available to the agent in this container.
   * Configured per agent role — builders get file I/O + CLI,
   * evaluators get read-only + test execution, etc.
   * Spec Section 1.4 — tool use for MCP integration and CLI execution.
   */
  readonly tools: readonly IToolDefinition[];

  /**
   * Environment variables injected into the container.
   * Used for API keys, service URLs, and runtime configuration.
   */
  readonly environment: Readonly<Record<string, string>>;

  /**
   * Resource limits for the container process.
   */
  readonly resourceLimits?: IContainerResourceLimits;

  /**
   * Timeout in milliseconds after which the container is force-terminated.
   * Default: 30 minutes per the spec's "builds complete in minutes" goal.
   */
  readonly timeoutMs?: number;
}

/**
 * Resource limits for a container.
 * Prevents runaway processes from consuming host resources.
 */
export interface IContainerResourceLimits {
  /** Maximum memory in bytes. Default: 2GB. */
  readonly maxMemoryBytes?: number;
  /** Maximum CPU percentage (0-100). Default: 100 (one core). */
  readonly maxCpuPercent?: number;
  /** Maximum disk write in bytes. Default: 1GB. */
  readonly maxDiskWriteBytes?: number;
}

// ---------------------------------------------------------------------------
// Container interface
// ---------------------------------------------------------------------------

/**
 * IAgentContainer — a running container with an agent process inside.
 *
 * Provides the execution environment for a single agent session.
 * The container abstracts process isolation, filesystem mounting,
 * and lifecycle management from the agent harness and orchestrator.
 */
export interface IAgentContainer {
  /** The container's configuration. */
  readonly config: IContainerConfig;
  /** Current container state. */
  readonly state: ContainerState;
  /** Process ID of the container (if running). */
  readonly pid: number | null;
  /** When the container was created. */
  readonly createdAt: Date;
  /** When the container started running (agent launched). */
  readonly startedAt: Date | null;
  /** When the container was terminated. */
  readonly terminatedAt: Date | null;

  /**
   * Execute a command inside the container's isolated environment.
   * Used by the agent harness to run CLI commands, test commands, etc.
   * Write operations are restricted to the agent's scoped paths.
   *
   * @returns stdout, stderr, and exit code of the command.
   */
  exec(
    command: string,
    args: readonly string[],
    options?: IContainerExecOptions,
  ): Promise<IContainerExecResult>;

  /**
   * Read a file from the shared repository (or container filesystem).
   * All agents have full read access to the entire repository.
   */
  readFile(path: string): Promise<string>;

  /**
   * Write a file — only succeeds if the path is within the agent's
   * scoped write paths. Throws if out of scope.
   * Spec Section 4.2 — scoped write enforcement at filesystem level.
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Check whether a path is writable by this container's agent.
   */
  isPathWritable(path: string): boolean;

  /**
   * Gracefully stop the container. Sends SIGTERM, waits for gracePeriodMs,
   * then SIGKILL if still running.
   */
  stop(gracePeriodMs?: number): Promise<void>;

  /**
   * Subscribe to container lifecycle events.
   */
  onStateChange(handler: (state: ContainerState) => void): void;
}

/** Options for executing a command in a container. */
export interface IContainerExecOptions {
  /** Working directory relative to the repo root. */
  readonly cwd?: string;
  /** Timeout in milliseconds for this specific command. */
  readonly timeoutMs?: number;
  /** Additional environment variables for this command. */
  readonly env?: Readonly<Record<string, string>>;
}

/** Result of executing a command in a container. */
export interface IContainerExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

// ---------------------------------------------------------------------------
// Container manager
// ---------------------------------------------------------------------------

/**
 * IContainerManager — creates, monitors, and terminates agent containers.
 *
 * The container manager is used by the Cortex Orchestrator to provision
 * execution environments for agents. Each agent gets its own container
 * with process isolation and scoped filesystem access.
 *
 * Spec Section 4.2 — "When the monitoring system triggers a rotation,
 * the container is terminated and a new one launches in seconds."
 */
export interface IContainerManager {
  /**
   * Create a new container with the given configuration.
   * The container is created in "ready" state — call the agent harness
   * to launch the agent session inside it.
   */
  create(config: IContainerConfig): Promise<IAgentContainer>;

  /**
   * Get a container by its ID.
   */
  get(containerId: string): IAgentContainer | undefined;

  /**
   * Get all containers for a specific build.
   */
  getByBuild(buildId: string): IAgentContainer[];

  /**
   * Terminate a container. Used during rotation and goal completion.
   */
  terminate(containerId: string, gracePeriodMs?: number): Promise<void>;

  /**
   * Terminate all containers for a build. Used during build shutdown.
   */
  terminateAll(buildId: string): Promise<void>;

  /**
   * Get health/resource usage for a container.
   */
  getHealth(containerId: string): Promise<IContainerHealth>;

  /**
   * Subscribe to container lifecycle events across all containers.
   */
  onContainerEvent(handler: (event: IContainerEvent) => void): void;
}

/**
 * Health and resource usage for a running container.
 */
export interface IContainerHealth {
  readonly containerId: string;
  readonly state: ContainerState;
  readonly memoryUsageBytes: number;
  readonly cpuPercent: number;
  readonly uptimeMs: number;
  /** Whether the container is responding to health checks. */
  readonly healthy: boolean;
}

/**
 * Events emitted by the container manager for lifecycle tracking.
 */
export interface IContainerEvent {
  readonly type: ContainerEventType;
  readonly containerId: string;
  readonly buildId: string;
  readonly timestamp: Date;
  readonly payload: Record<string, unknown>;
}

export type ContainerEventType =
  | "container-created"
  | "container-started"
  | "container-stopped"
  | "container-failed"
  | "container-timeout"
  | "container-oom";       // Out of memory kill
