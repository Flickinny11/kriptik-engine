/**
 * Agent Store — Dynamic, reactive agent state management
 *
 * Agents are spawned dynamically by the Brain. There is NO fixed roster,
 * NO predetermined pipeline. Agents appear when needed and are tracked
 * by their unique ID. The store simply observes and reflects reality.
 */

import { create } from 'zustand';
import type { AgentStatus, AgentLog, AgentState } from '../lib/agent-types';

interface AgentStore {
    /** Overall system status — derived from agent activity */
    globalStatus: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
    /** Currently focused agent (for UI highlight) */
    activeAgentId: string | null;
    /** Dynamic map of spawned agents — keyed by agent ID */
    agents: Map<string, AgentState>;
    /** Chronological log stream from all agents */
    logs: AgentLog[];

    setGlobalStatus: (status: AgentStore['globalStatus']) => void;
    setActiveAgent: (id: string | null) => void;
    /** Register a newly spawned agent */
    spawnAgent: (id: string, role: string, name: string) => void;
    /** Remove an agent that has finished or been stopped */
    removeAgent: (id: string) => void;
    updateAgentStatus: (id: string, status: AgentStatus) => void;
    updateAgentProgress: (id: string, progress: number) => void;
    addLog: (log: AgentLog) => void;
    reset: () => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
    globalStatus: 'idle',
    activeAgentId: null,
    agents: new Map(),
    logs: [],

    setGlobalStatus: (status) => set({ globalStatus: status }),

    setActiveAgent: (id) => set({ activeAgentId: id }),

    spawnAgent: (id, role, name) => set((state) => {
        const next = new Map(state.agents);
        next.set(id, {
            id,
            role,
            name,
            status: 'running',
            progress: 0,
            logs: [],
            spawnedAt: Date.now(),
        });
        return { agents: next, globalStatus: 'running' };
    }),

    removeAgent: (id) => set((state) => {
        const next = new Map(state.agents);
        next.delete(id);
        const anyRunning = Array.from(next.values()).some(a => a.status === 'running');
        return {
            agents: next,
            activeAgentId: state.activeAgentId === id ? null : state.activeAgentId,
            globalStatus: anyRunning ? 'running' : next.size > 0 ? 'idle' : 'completed',
        };
    }),

    updateAgentStatus: (id, status) => set((state) => {
        const agent = state.agents.get(id);
        if (!agent) return state;
        const next = new Map(state.agents);
        next.set(id, { ...agent, status });
        return { agents: next };
    }),

    updateAgentProgress: (id, progress) => set((state) => {
        const agent = state.agents.get(id);
        if (!agent) return state;
        const next = new Map(state.agents);
        next.set(id, { ...agent, progress });
        return { agents: next };
    }),

    addLog: (log) => set((state) => ({
        logs: [...state.logs, log]
    })),

    reset: () => set({
        globalStatus: 'idle',
        activeAgentId: null,
        agents: new Map(),
        logs: [],
    }),
}));
