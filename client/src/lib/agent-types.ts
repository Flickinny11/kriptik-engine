/**
 * Agent type definitions — shared between stores and UI components
 *
 * Agents are dynamically spawned and tracked. There is NO fixed pipeline,
 * NO predetermined execution order. The Brain decides which agents to
 * spawn based on the task at hand. An agent's role is a capability
 * descriptor, not a pipeline stage.
 */

/** Agent status reflects its current reasoning state */
export type AgentStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

/** Log entry from any agent — captures reasoning and decisions */
export interface AgentLog {
  agentId: string;
  role: string;
  message: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error';
}

/**
 * Dynamic agent state — tracked per spawned agent instance.
 * Agents are not pre-allocated slots; they appear when the Brain
 * decides to spawn them and disappear when their work is done.
 */
export interface AgentState {
  id: string;
  role: string;
  name: string;
  status: AgentStatus;
  progress: number;
  logs: AgentLog[];
  /** When the agent was spawned — used for ordering, not sequencing */
  spawnedAt: number;
}
