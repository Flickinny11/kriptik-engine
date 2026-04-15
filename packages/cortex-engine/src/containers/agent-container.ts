/**
 * Agent container — lightweight process isolation for a single agent.
 *
 * Each agent runs in its own container with:
 * - Full read access to the shared repository
 * - Write access restricted to scoped paths
 * - Its own local runtime environment
 * - MCP tool access configured per agent role
 * - Disposable lifecycle — terminate and replace in seconds
 *
 * Spec Section 4.2, Tier 3 — Agent Container Layer.
 * Spec Section 12.4, Phase A Step 4.
 *
 * Implementation note: This initial version uses Node.js child_process
 * for process isolation with filesystem-level scope enforcement. The
 * container abstraction allows swapping in Docker containers (the spec's
 * target) when the integration layer is ready, without changing the
 * IAgentContainer interface contract.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, access, constants } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import type {
  IAgentContainer,
  IContainerConfig,
  IContainerExecOptions,
  IContainerExecResult,
  ContainerState,
} from "@kriptik/shared-interfaces";
import { isPathWithinScope } from "./scope-guard.js";

const execFileAsync = promisify(execFile);

/** Default timeout for container commands: 60 seconds. */
const DEFAULT_EXEC_TIMEOUT_MS = 60_000;

/** Default container lifetime timeout: 30 minutes. */
const DEFAULT_CONTAINER_TIMEOUT_MS = 30 * 60 * 1000;

/** Default grace period for stop: 5 seconds. */
const DEFAULT_STOP_GRACE_MS = 5_000;

/**
 * A lightweight agent container backed by process isolation.
 *
 * Provides the IAgentContainer interface with filesystem-level
 * scope enforcement. Commands executed via exec() run as child
 * processes with the container's working directory and environment.
 */
export class AgentContainer implements IAgentContainer {
  readonly config: IContainerConfig;
  private _state: ContainerState = "creating";
  private _pid: number | null = null;
  private readonly _createdAt: Date;
  private _startedAt: Date | null = null;
  private _terminatedAt: Date | null = null;
  private readonly _stateHandlers: Array<(state: ContainerState) => void> = [];
  private _timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private readonly _activeProcesses = new Set<ReturnType<typeof execFile>>();

  constructor(config: IContainerConfig) {
    this.config = config;
    this._createdAt = new Date();
  }

  get state(): ContainerState {
    return this._state;
  }

  get pid(): number | null {
    return this._pid;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get startedAt(): Date | null {
    return this._startedAt;
  }

  get terminatedAt(): Date | null {
    return this._terminatedAt;
  }

  /**
   * Initialize the container — set up the working directory,
   * verify repo access, and transition to "ready" state.
   */
  async initialize(): Promise<void> {
    // Verify the repository path exists and is accessible
    await access(this.config.repoPath, constants.R_OK);

    // Ensure the working branch exists by checking it out
    // (the orchestrator creates the branch via BranchManager before
    // creating the container, so it should exist)
    try {
      await execFileAsync("git", ["rev-parse", "--verify", this.config.workingBranch], {
        cwd: this.config.repoPath,
      });
    } catch {
      throw new Error(
        `Working branch "${this.config.workingBranch}" does not exist in repository at ${this.config.repoPath}`,
      );
    }

    this._setState("ready");
  }

  /**
   * Mark the container as running — called by the orchestrator
   * after the agent session is launched inside this container.
   */
  start(): void {
    if (this._state !== "ready") {
      throw new Error(
        `Cannot start container ${this.config.containerId}: state is "${this._state}", expected "ready"`,
      );
    }

    this._startedAt = new Date();
    this._pid = process.pid; // Parent process — child processes spawn per-exec

    // Set up container timeout
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_CONTAINER_TIMEOUT_MS;
    this._timeoutHandle = setTimeout(() => {
      this._handleTimeout();
    }, timeoutMs);

    this._setState("running");
  }

  async exec(
    command: string,
    args: readonly string[],
    options?: IContainerExecOptions,
  ): Promise<IContainerExecResult> {
    if (this._state !== "running") {
      throw new Error(
        `Cannot exec in container ${this.config.containerId}: state is "${this._state}"`,
      );
    }

    const cwd = options?.cwd
      ? join(this.config.repoPath, options.cwd)
      : this.config.repoPath;

    const env: Record<string, string | undefined> = {
      ...process.env,
      ...this.config.environment,
      ...options?.env,
      // Inject container identity for scope enforcement
      KRIPTIK_CONTAINER_ID: this.config.containerId,
      KRIPTIK_BUILD_ID: this.config.buildId,
      KRIPTIK_AGENT_ROLE: this.config.role,
      KRIPTIK_WORKING_BRANCH: this.config.workingBranch,
    };

    const timeoutMs = options?.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;

    try {
      const child = execFile(command, args as string[], {
        cwd,
        env,
        maxBuffer: 10 * 1024 * 1024,
        timeout: timeoutMs,
      });

      this._activeProcesses.add(child);

      const result = await new Promise<IContainerExecResult>(
        (resolveResult, reject) => {
          let stdout = "";
          let stderr = "";

          child.stdout?.on("data", (data: Buffer) => {
            stdout += data.toString();
          });
          child.stderr?.on("data", (data: Buffer) => {
            stderr += data.toString();
          });

          child.on("close", (code) => {
            this._activeProcesses.delete(child);
            resolveResult({
              stdout,
              stderr,
              exitCode: code ?? 1,
            });
          });

          child.on("error", (err) => {
            this._activeProcesses.delete(child);
            reject(err);
          });
        },
      );

      return result;
    } catch (error) {
      // Handle exec errors (command not found, etc.)
      const execError = error as {
        stdout?: string;
        stderr?: string;
        code?: number;
      };
      return {
        stdout: execError.stdout ?? "",
        stderr:
          execError.stderr ??
          (error instanceof Error ? error.message : String(error)),
        exitCode: typeof execError.code === "number" ? execError.code : 1,
      };
    }
  }

  async readFile(path: string): Promise<string> {
    if (this._state !== "running" && this._state !== "ready") {
      throw new Error(
        `Cannot read in container ${this.config.containerId}: state is "${this._state}"`,
      );
    }

    // All agents have full read access — resolve relative to repo root
    const absolutePath = resolve(this.config.repoPath, path);

    // Prevent directory traversal outside the repo
    if (!absolutePath.startsWith(resolve(this.config.repoPath))) {
      throw new Error(`Path "${path}" escapes the repository root`);
    }

    return readFile(absolutePath, "utf-8");
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (this._state !== "running") {
      throw new Error(
        `Cannot write in container ${this.config.containerId}: state is "${this._state}"`,
      );
    }

    // Enforce scoped write paths
    if (!this.isPathWritable(path)) {
      throw new Error(
        `Write denied: "${path}" is outside scoped write paths for container ${this.config.containerId}` +
          ` [allowed: ${this.config.scopedWritePaths.join(", ")}]`,
      );
    }

    const absolutePath = resolve(this.config.repoPath, path);

    // Prevent directory traversal
    if (!absolutePath.startsWith(resolve(this.config.repoPath))) {
      throw new Error(`Path "${path}" escapes the repository root`);
    }

    // Ensure parent directory exists
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf-8");
  }

  isPathWritable(path: string): boolean {
    return isPathWithinScope(path, this.config.repoPath, this.config.scopedWritePaths);
  }

  async stop(gracePeriodMs?: number): Promise<void> {
    if (this._state === "terminated" || this._state === "failed") {
      return; // Already stopped
    }

    this._setState("stopping");

    // Clear the timeout timer
    if (this._timeoutHandle) {
      clearTimeout(this._timeoutHandle);
      this._timeoutHandle = null;
    }

    // Kill all active child processes
    const grace = gracePeriodMs ?? DEFAULT_STOP_GRACE_MS;
    const killPromises = Array.from(this._activeProcesses).map((child) =>
      this._killProcess(child, grace),
    );
    await Promise.allSettled(killPromises);

    this._terminatedAt = new Date();
    this._pid = null;
    this._setState("terminated");
  }

  onStateChange(handler: (state: ContainerState) => void): void {
    this._stateHandlers.push(handler);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private _setState(state: ContainerState): void {
    this._state = state;
    for (const handler of this._stateHandlers) {
      handler(state);
    }
  }

  private _handleTimeout(): void {
    this._timeoutHandle = null;
    // Force stop the container on timeout
    this.stop(1000).catch(() => {
      // Best effort — if stop fails, mark as failed
      this._state = "failed";
    });
  }

  private async _killProcess(
    child: ReturnType<typeof execFile>,
    graceMs: number,
  ): Promise<void> {
    if (!child.pid) return;

    // Send SIGTERM first
    child.kill("SIGTERM");

    // Wait for grace period, then SIGKILL
    await new Promise<void>((resolveKill) => {
      const timeout = setTimeout(() => {
        if (child.pid) {
          child.kill("SIGKILL");
        }
        resolveKill();
      }, graceMs);

      child.on("close", () => {
        clearTimeout(timeout);
        resolveKill();
      });
    });
  }
}
