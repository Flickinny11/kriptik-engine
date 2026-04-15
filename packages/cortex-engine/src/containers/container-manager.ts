/**
 * Container manager — creates, monitors, and terminates agent containers.
 *
 * The orchestrator uses the container manager to provision execution
 * environments for agents. Each agent gets its own container with
 * process isolation and scoped filesystem access.
 *
 * Spec Section 4.2, Tier 3 — "When the monitoring system triggers
 * a rotation, the container is terminated and a new one launches
 * in seconds against the same repo state."
 *
 * Spec Section 12.4, Phase A Step 4.
 */

import type {
  IContainerManager,
  IAgentContainer,
  IContainerConfig,
  IContainerHealth,
  IContainerEvent,
  ContainerEventType,
} from "@kriptik/shared-interfaces";
import { AgentContainer } from "./agent-container.js";

/**
 * Manages the lifecycle of all agent containers within the Cortex Engine.
 *
 * Instantiated once per engine instance. The Cortex Orchestrator uses
 * this to create containers before launching agent sessions, and to
 * terminate containers during rotation or build completion.
 */
export class ContainerManager implements IContainerManager {
  private readonly _containers = new Map<string, AgentContainer>();
  private readonly _eventHandlers: Array<(event: IContainerEvent) => void> = [];

  /**
   * Create a new container with the given configuration.
   *
   * Initializes the container (verifies repo access, checks working branch),
   * then returns it in "ready" state. The orchestrator should then launch
   * the agent session via the harness, and call container.start() to mark
   * it as running.
   */
  async create(config: IContainerConfig): Promise<IAgentContainer> {
    if (this._containers.has(config.containerId)) {
      throw new Error(`Container ${config.containerId} already exists`);
    }

    const container = new AgentContainer(config);

    // Wire state changes to manager-level events
    container.onStateChange((state) => {
      const eventTypeMap: Record<string, ContainerEventType> = {
        ready: "container-created",
        running: "container-started",
        terminated: "container-stopped",
        failed: "container-failed",
      };
      const eventType = eventTypeMap[state];
      if (eventType) {
        this._emitEvent(eventType, config.containerId, config.buildId, {
          role: config.role,
          goalId: config.goalId,
          state,
        });
      }
    });

    // Initialize — verify repo, check branch
    try {
      await container.initialize();
    } catch (error) {
      this._emitEvent("container-failed", config.containerId, config.buildId, {
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    this._containers.set(config.containerId, container);

    return container;
  }

  get(containerId: string): IAgentContainer | undefined {
    return this._containers.get(containerId);
  }

  getByBuild(buildId: string): IAgentContainer[] {
    return Array.from(this._containers.values()).filter(
      (c) => c.config.buildId === buildId,
    );
  }

  async terminate(containerId: string, gracePeriodMs?: number): Promise<void> {
    const container = this._containers.get(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }

    await container.stop(gracePeriodMs);
    // Keep terminated containers in the map for post-mortem inspection.
    // They'll be cleaned up when terminateAll is called for the build.
  }

  async terminateAll(buildId: string): Promise<void> {
    const containers = this.getByBuild(buildId);
    await Promise.allSettled(
      containers.map((c) => c.stop()),
    );

    // Clean up all containers for this build from the map
    for (const container of containers) {
      this._containers.delete(container.config.containerId);
    }
  }

  async getHealth(containerId: string): Promise<IContainerHealth> {
    const container = this._containers.get(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }

    const now = Date.now();
    const startedAt = container.startedAt?.getTime() ?? now;

    // In process-isolation mode, we approximate resource usage.
    // Docker mode would query container stats directly.
    return {
      containerId,
      state: container.state,
      memoryUsageBytes: 0, // Approximation — real monitoring in Docker mode
      cpuPercent: 0,
      uptimeMs: container.state === "running" ? now - startedAt : 0,
      healthy: container.state === "running",
    };
  }

  onContainerEvent(handler: (event: IContainerEvent) => void): void {
    this._eventHandlers.push(handler);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private _emitEvent(
    type: ContainerEventType,
    containerId: string,
    buildId: string,
    payload: Record<string, unknown>,
  ): void {
    const event: IContainerEvent = {
      type,
      containerId,
      buildId,
      timestamp: new Date(),
      payload,
    };
    for (const handler of this._eventHandlers) {
      handler(event);
    }
  }
}
