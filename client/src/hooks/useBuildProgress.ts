/**
 * Build Progress Hook — Adaptive REST Polling
 *
 * Real-time build progress tracking using REST polling against
 * /api/events/poll. This replaces the previous EventSource/SSE approach
 * which is architecturally broken on Vercel serverless (the webhook
 * Lambda and SSE Lambda are separate processes with no shared memory).
 *
 * Adaptive polling intervals:
 *   - 300ms during active build (near-realtime)
 *   - 2000ms during idle / after completion
 *
 * Supports reconnection catch-up via lastEventId tracking — events are
 * persisted to the DB by the Modal webhook, so no data is lost between
 * polls or across page refreshes.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUserStore } from '@/store/useUserStore';
import { API_URL, authenticatedFetch } from '@/lib/api-config';

// =============================================================================
// TYPES
// =============================================================================

export interface BuildProgress {
    currentActivity: string;
    currentStage: string;
    featuresPending: number;
    featuresCompleted: number;
    featuresFailed: number;
    currentFeature?: string;
    overallProgress: number;
}

export interface AgentProgress {
    slotId?: string;
    agentId?: string;
    type: string;
    message?: string;
    progress?: number;
    feature?: string;
}

export interface EscalationProgress {
    level: number;
    description: string;
    inProgress: boolean;
    resolved?: boolean;
}

export interface BuildProgressState {
    isConnected: boolean;
    isBuilding: boolean;
    progress: BuildProgress | null;
    agentActivity: AgentProgress[];
    escalation: EscalationProgress | null;
    lastUpdate: Date | null;
    error: string | null;
}

export interface UseBuildProgressOptions {
    projectId: string;
    contextId?: string;
    autoConnect?: boolean;
    onComplete?: () => void;
    onError?: (error: string) => void;
}

// Polling intervals in milliseconds
const POLL_ACTIVE_MS = 300;
const POLL_IDLE_MS = 2000;

// =============================================================================
// HOOK
// =============================================================================

export function useBuildProgress(options: UseBuildProgressOptions): BuildProgressState & {
    connect: () => void;
    disconnect: () => void;
    refresh: () => void;
} {
    const { projectId, contextId, autoConnect = true, onComplete, onError } = options;
    const { user } = useUserStore();

    const [state, setState] = useState<BuildProgressState>({
        isConnected: false,
        isBuilding: false,
        progress: null,
        agentActivity: [],
        escalation: null,
        lastUpdate: null,
        error: null,
    });

    const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastEventIdRef = useRef<number>(0);
    const isBuildingRef = useRef(false);
    const isPollingRef = useRef(false);

    const onCompleteRef = useRef(onComplete);
    const onErrorRef = useRef(onError);
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;

    // Process a single event from the poll response
    const processEvent = useCallback((event: { type: string; data: any; timestamp?: string }) => {
        const { type, data: payload } = event;

        setState(prev => {
            const newState = { ...prev, lastUpdate: new Date() };

            switch (type) {
                case 'build-progress':
                    newState.progress = payload as BuildProgress;
                    newState.isBuilding = payload.overallProgress < 100;
                    isBuildingRef.current = payload.overallProgress < 100;
                    if (payload.overallProgress >= 100) {
                        onCompleteRef.current?.();
                    }
                    break;

                case 'agent-progress':
                case 'phase-change':
                    newState.agentActivity = [
                        { ...payload, type: payload.type || type },
                        ...prev.agentActivity.slice(0, 49),
                    ];
                    if (type === 'phase-change' && newState.progress) {
                        newState.progress = {
                            ...newState.progress,
                            currentActivity: payload.activity,
                            overallProgress: payload.progress || newState.progress.overallProgress,
                        };
                    }
                    break;

                case 'escalation-progress':
                    newState.escalation = payload as EscalationProgress;
                    break;

                case 'verification-result':
                case 'verification_result':
                    newState.agentActivity = [
                        {
                            type: 'verification',
                            feature: payload.featureId,
                            message: `${payload.verdict}: ${payload.score}% (${payload.blockers?.length || 0} blockers)`,
                        },
                        ...prev.agentActivity.slice(0, 49),
                    ];
                    break;

                case 'task:completed':
                    newState.agentActivity = [
                        {
                            type: 'task-completed',
                            message: payload.task?.title || 'Task completed',
                            feature: payload.task?.featureId,
                        },
                        ...prev.agentActivity.slice(0, 49),
                    ];
                    break;

                case 'task:failed':
                    newState.agentActivity = [
                        {
                            type: 'task-failed',
                            message: payload.task?.title || 'Task failed',
                            feature: payload.task?.featureId,
                        },
                        ...prev.agentActivity.slice(0, 49),
                    ];
                    break;

                case 'phase_start':
                    newState.isBuilding = true;
                    isBuildingRef.current = true;
                    newState.agentActivity = [
                        { type: 'activity-start', message: `Phase: ${payload.activity}` },
                        ...prev.agentActivity.slice(0, 49),
                    ];
                    if (newState.progress) {
                        newState.progress = { ...newState.progress, currentActivity: payload.activity };
                    }
                    break;

                case 'build_complete':
                case 'build-complete':
                    newState.isBuilding = false;
                    isBuildingRef.current = false;
                    if (newState.progress) {
                        newState.progress = { ...newState.progress, overallProgress: 100 };
                    }
                    onCompleteRef.current?.();
                    break;

                case 'build-error':
                case 'execution-error':
                    newState.error = payload.error || payload.message || 'Build error';
                    newState.isBuilding = false;
                    isBuildingRef.current = false;
                    onErrorRef.current?.(newState.error!);
                    break;

                case 'thinking':
                case 'agent_thinking':
                case 'file_write':
                case 'file_edit':
                case 'file_read':
                case 'tool_call':
                case 'agent_writing':
                case 'agent_code_streaming':
                case 'agent_observing':
                case 'agent_deciding':
                case 'agent_self_correcting':
                case 'agent_completed':
                case 'agent_iterating':
                case 'reasoning':
                    newState.agentActivity = [
                        {
                            type,
                            agentId: payload.agentId,
                            message: payload.content || payload.filePath || payload.tool || payload.message || type,
                        },
                        ...prev.agentActivity.slice(0, 49),
                    ];
                    break;

                case 'initial-state':
                    if (payload.activeWorkflow?.progress) {
                        newState.progress = {
                            currentActivity: payload.activeWorkflow.phase || 'initializing',
                            currentStage: payload.activeWorkflow.stage || 'frontend',
                            featuresPending: 0,
                            featuresCompleted: 0,
                            featuresFailed: 0,
                            overallProgress: payload.activeWorkflow.progress,
                        };
                        newState.isBuilding = payload.activeWorkflow.progress < 100;
                        isBuildingRef.current = payload.activeWorkflow.progress < 100;
                    }
                    break;

                case 'error':
                    newState.error = payload.message || 'Unknown error';
                    onErrorRef.current?.(payload.message);
                    break;

                case 'pipe-test':
                    break;
            }

            return newState;
        });
    }, []);

    // Single poll cycle
    const doPoll = useCallback(async (pollContextId: string) => {
        try {
            const url = `${API_URL}/api/events/poll?contextId=${encodeURIComponent(pollContextId)}&afterId=${lastEventIdRef.current}`;
            const response = await authenticatedFetch(url);
            if (!response.ok) return;

            const result = await response.json();
            const events = result.events as Array<{ id: number; type: string; data: any; timestamp: string }>;

            if (events && events.length > 0) {
                for (const event of events) {
                    processEvent(event);
                }
                lastEventIdRef.current = result.lastEventId;
            }
        } catch (err) {
            console.warn('[useBuildProgress] Poll error:', err instanceof Error ? err.message : err);
        }
    }, [processEvent]);

    // Scheduling: adaptively schedule next poll based on build activity
    const scheduleNextPoll = useCallback((pollContextId: string) => {
        if (!isPollingRef.current) return;

        const interval = isBuildingRef.current ? POLL_ACTIVE_MS : POLL_IDLE_MS;
        pollTimerRef.current = setTimeout(async () => {
            await doPoll(pollContextId);
            scheduleNextPoll(pollContextId);
        }, interval);
    }, [doPoll]);

    const cleanup = useCallback(() => {
        isPollingRef.current = false;
        if (pollTimerRef.current) {
            clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }, []);

    const connect = useCallback(() => {
        if (!user?.id) {
            console.warn('[useBuildProgress] No user ID, skipping connection');
            return;
        }

        const pollContextId = contextId || projectId;
        if (!pollContextId) {
            console.warn('[useBuildProgress] No contextId or projectId, skipping');
            return;
        }

        cleanup();
        isPollingRef.current = true;
        setState(prev => ({ ...prev, isConnected: true, error: null }));
        console.log(`[useBuildProgress] Starting adaptive polling for contextId=${pollContextId}`);

        doPoll(pollContextId).then(() => scheduleNextPoll(pollContextId));
    }, [projectId, contextId, user?.id, cleanup, doPoll, scheduleNextPoll]);

    const disconnect = useCallback(() => {
        cleanup();
        setState(prev => ({ ...prev, isConnected: false }));
    }, [cleanup]);

    const refresh = useCallback(() => {
        const pollContextId = contextId || projectId;
        if (pollContextId) {
            doPoll(pollContextId);
        }
    }, [contextId, projectId, doPoll]);

    // Fetch server-side build status on mount for reconnection awareness
    useEffect(() => {
        if (!projectId || !user?.id) return;

        authenticatedFetch(`${API_URL}/api/build-session/${projectId}/status`)
            .then(r => r.ok ? r.json() : null)
            .then(status => {
                if (!status) return;
                if (status.status === 'running' || status.status === 'completed' || status.status === 'failed') {
                    const building = status.status === 'running';
                    isBuildingRef.current = building;
                    setState(prev => ({
                        ...prev,
                        isBuilding: building,
                        progress: prev.progress ?? (status.progress != null ? {
                            currentActivity: status.currentActivity || 'unknown',
                            currentStage: 'frontend',
                            featuresPending: 0,
                            featuresCompleted: 0,
                            featuresFailed: 0,
                            overallProgress: status.progress,
                        } : null),
                    }));
                }
            })
            .catch(() => { /* best-effort */ });
    }, [projectId, user?.id]);

    // Auto-connect on mount
    useEffect(() => {
        if (autoConnect && projectId && user?.id) {
            connect();
        }
        return cleanup;
    }, [autoConnect, projectId, user?.id, connect, cleanup]);

    return {
        ...state,
        connect,
        disconnect,
        refresh,
    };
}

// =============================================================================
// HELPER HOOK: Simple progress percentage
// =============================================================================

export function useBuildProgressPercent(projectId: string): number {
    const { progress } = useBuildProgress({ projectId });
    return progress?.overallProgress ?? 0;
}

// =============================================================================
// HELPER HOOK: Build status check
// =============================================================================

export function useIsBuilding(projectId: string): boolean {
    const { isBuilding } = useBuildProgress({ projectId, autoConnect: true });
    return isBuilding;
}

export default useBuildProgress;
