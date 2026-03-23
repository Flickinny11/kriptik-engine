/**
 * Agent type definitions — shared between stores and UI components
 */

export type AgentType = 'planning' | 'generation' | 'testing' | 'refinement' | 'deployment';
export type AgentStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

export interface AgentLog {
  type: AgentType;
  message: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error';
}

export interface AgentState {
  type: AgentType;
  name: string;
  status: AgentStatus;
  progress: number;
  logs: AgentLog[];
}

export const AGENTS: Record<AgentType, { name: string; description: string }> = {
  planning: { name: 'Architect', description: 'Reasons about architecture and designs the system' },
  generation: { name: 'Builder', description: 'Generates code and implements features' },
  testing: { name: 'Verifier', description: 'Tests, validates, and ensures quality' },
  refinement: { name: 'Refiner', description: 'Polishes, optimizes, and improves output' },
  deployment: { name: 'Deployer', description: 'Builds, bundles, and deploys the application' },
};
