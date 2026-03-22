/**
 * useProgressiveIntentStream Hook
 *
 * Consumes the SSE stream from the Progressive Intent Engine.
 * Provides real-time progress state to the planning UI so it can
 * show track progress without chat-bubble-style messages.
 *
 * Usage:
 *   const { progress, startResolution, reportSelection, reportCredential, finalizeIntent }
 *     = useProgressiveIntentStream(sessionId);
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { API_URL } from '../lib/api-config';

// =============================================================================
// TYPES (mirrors server-side types)
// =============================================================================

export interface TrackProgress {
    trackId: string;
    label: string;
    status: 'pending' | 'running' | 'complete' | 'failed';
    percentComplete: number;
    startedAt?: string;
    completedAt?: string;
    error?: string;
}

export interface DetectedIntegration {
    id: string;
    name: string;
    category: string;
    authMethod: 'oauth' | 'manual' | 'none';
    envVars: string[];
    retrieveUrl: string;
    matchedKeywords: string[];
    isConnected: boolean;
}

export interface DerivedEnvVar {
    envVarName: string;
    description: string;
    derivedFrom: string;
    value?: string;
    required: boolean;
}

export interface CredentialExpandedEvent {
    integrationId: string;
    envVarName: string;
    status: 'auto_configured' | 'manual_required';
    description?: string;
    userInstructions?: string;
    retrieveUrl?: string;
}

export interface IntentProgressEvent {
    lockProgress: number;
    confirmedIntegrations: number;
    totalIntegrations: number;
    credentialsProvided: number;
    totalCredentials: number;
    architectureChoicesMade: number;
}

export interface ProgressSnapshot {
    sessionId: string;
    overallPercent: number;
    tracks: TrackProgress[];
    readyForBuild: boolean;
    estimatedRemainingMs: number;
    deepIntentContractId: string | null;
    baseIntentContractId: string | null;
    detectedIntegrations: DetectedIntegration[];
    derivedEnvVars: DerivedEnvVar[];
}

export interface ProgressiveIntentState {
    isActive: boolean;
    snapshot: ProgressSnapshot | null;
    readyForBuild: boolean;
    error: string | null;
    /** New integrations detected since last clear */
    newIntegrations: DetectedIntegration[];
    /** New derived env vars since last clear */
    newDerivedVars: DerivedEnvVar[];
    /** Credential expansion events */
    expandedCredentials: CredentialExpandedEvent[];
    /** Progressive intent lock progress (0-100) */
    lockProgress: number;
    intentProgress: IntentProgressEvent | null;
}

export interface UseProgressiveIntentReturn {
    state: ProgressiveIntentState;
    startResolution: (params: {
        projectId: string;
        userId: string;
        prompt: string;
        plan?: unknown;
        skipVisualIntent?: boolean;
        designModeEnabled?: boolean;
    }) => Promise<void>;
    reportSelection: (params: {
        questionId: string;
        questionCategory?: string;
        selectedOptionId: string;
        selectedOptionLabel?: string;
    }) => Promise<void>;
    reportCredential: (params: {
        integrationId: string;
        integrationName?: string;
        envVarName: string;
        value: string;
        isOAuth?: boolean;
    }) => Promise<void>;
    finalizeIntent: () => Promise<{ deepIntentContractId: string; reconciledInMs: number } | null>;
    abort: () => void;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: ProgressiveIntentState = {
    isActive: false,
    snapshot: null,
    readyForBuild: false,
    error: null,
    newIntegrations: [],
    newDerivedVars: [],
    expandedCredentials: [],
    lockProgress: 0,
    intentProgress: null,
};

// =============================================================================
// HOOK
// =============================================================================

export function useProgressiveIntentStream(sessionId: string | null): UseProgressiveIntentReturn {
    const [state, setState] = useState<ProgressiveIntentState>(initialState);
    const eventSourceRef = useRef<EventSource | null>(null);
    const activeSessionRef = useRef<string | null>(null);
    // Tracks whether startResolution already established the SSE connection
    const sseSetupByStartRef = useRef<boolean>(false);
    // Circuit breaker: stop calling if engine is unavailable (Vercel serverless)
    const engineUnavailableRef = useRef<boolean>(false);

    // Shared SSE message handler — extracted so both useEffect and startResolution use it
    const handleSSEMessage = useCallback((event: MessageEvent) => {
        try {
            const parsed = JSON.parse(event.data);
            const { type, data } = parsed;

            switch (type) {
                case 'not-available':
                    // Engine not available on this serverless instance — stop retrying
                    engineUnavailableRef.current = true;
                    if (eventSourceRef.current) {
                        eventSourceRef.current.close();
                        eventSourceRef.current = null;
                    }
                    setState(prev => ({ ...prev, isActive: false }));
                    return;

                case 'snapshot':
                    setState(prev => ({
                        ...prev,
                        snapshot: data as ProgressSnapshot,
                        readyForBuild: (data as ProgressSnapshot).readyForBuild,
                        isActive: true,
                    }));
                    break;

                case 'progress':
                    setState(prev => ({
                        ...prev,
                        snapshot: data as ProgressSnapshot,
                        readyForBuild: (data as ProgressSnapshot).readyForBuild,
                    }));
                    break;

                case 'track-update':
                    setState(prev => {
                        if (!prev.snapshot) return prev;
                        const track = data as TrackProgress;
                        const updatedTracks = prev.snapshot.tracks.map(t =>
                            t.trackId === track.trackId ? track : t
                        );
                        return {
                            ...prev,
                            snapshot: { ...prev.snapshot, tracks: updatedTracks },
                        };
                    });
                    break;

                case 'integration-detected':
                    setState(prev => ({
                        ...prev,
                        newIntegrations: [...prev.newIntegrations, data as DetectedIntegration],
                    }));
                    break;

                case 'env-var-derived':
                    setState(prev => ({
                        ...prev,
                        newDerivedVars: [...prev.newDerivedVars, data as DerivedEnvVar],
                    }));
                    break;

                case 'credential_expanded':
                    setState(prev => ({
                        ...prev,
                        expandedCredentials: [...prev.expandedCredentials, data as CredentialExpandedEvent],
                    }));
                    break;

                case 'intent_progress':
                    setState(prev => ({
                        ...prev,
                        lockProgress: (data as IntentProgressEvent).lockProgress,
                        intentProgress: data as IntentProgressEvent,
                    }));
                    break;

                case 'ready-for-build':
                    setState(prev => ({ ...prev, readyForBuild: true }));
                    break;

                case 'error':
                    setState(prev => ({
                        ...prev,
                        error: (data as { message: string }).message,
                    }));
                    break;
            }
        } catch {
            // Ignore parse errors (e.g., heartbeats)
        }
    }, []);

    /**
     * Create an SSE EventSource connection for the given session.
     * Returns a promise that resolves when the connection is open
     * (first message received or open event fires).
     */
    const connectSSE = useCallback((sid: string): Promise<EventSource> => {
        // Close previous connection
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        activeSessionRef.current = sid;
        const url = `${API_URL}/api/execute/progressive-intent/stream/${sid}`;
        const es = new EventSource(url, { withCredentials: true });
        eventSourceRef.current = es;

        es.onmessage = handleSSEMessage;
        es.onerror = () => {
            // On Vercel serverless, SSE connections are ephemeral.
            // Silently mark as unavailable instead of showing error to user.
            engineUnavailableRef.current = true;
            es.close();
            eventSourceRef.current = null;
            setState(prev => ({ ...prev, isActive: false }));
        };

        // Return a promise that resolves when the connection is open
        return new Promise<EventSource>((resolve) => {
            const onOpen = () => {
                es.removeEventListener('open', onOpen);
                resolve(es);
            };
            // If already open (readyState === OPEN), resolve immediately
            if (es.readyState === EventSource.OPEN) {
                resolve(es);
            } else {
                es.addEventListener('open', onOpen);
                // Safety timeout: resolve after 3s even if open event never fires
                // (EventSource will still buffer messages, so this is just a fallback)
                setTimeout(() => {
                    es.removeEventListener('open', onOpen);
                    resolve(es);
                }, 3000);
            }
        });
    }, [handleSSEMessage]);

    // Clean up SSE on unmount
    useEffect(() => {
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        };
    }, []);

    // Fallback: Connect to SSE stream when sessionId changes (e.g., page refresh
    // with persisted sessionId). Skip if startResolution already set up the connection.
    useEffect(() => {
        if (!sessionId || sessionId === activeSessionRef.current) return;
        if (sseSetupByStartRef.current) {
            // startResolution already established the connection for this session
            sseSetupByStartRef.current = false;
            return;
        }

        connectSSE(sessionId);

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            activeSessionRef.current = null;
        };
    }, [sessionId, connectSSE]);

    /**
     * Start progressive resolution (call after plan is generated).
     * Establishes SSE connection FIRST, waits for it to open,
     * THEN sends the POST /start to avoid the race condition where
     * the engine starts emitting events before the SSE client connects.
     */
    const startResolution = useCallback(async (params: {
        projectId: string;
        userId: string;
        prompt: string;
        plan?: unknown;
        skipVisualIntent?: boolean;
        designModeEnabled?: boolean;
    }) => {
        if (!sessionId) return;

        // Reset circuit breaker on new start attempt
        engineUnavailableRef.current = false;
        setState(prev => ({ ...prev, isActive: true, error: null }));

        try {
            // Step 1: Establish SSE connection and wait for it to open.
            // This ensures we're listening for events BEFORE the server starts emitting them.
            sseSetupByStartRef.current = true;
            await connectSSE(sessionId);

            // Step 2: Now POST /start — the SSE connection is open and listening
            const response = await fetch(`${API_URL}/api/execute/progressive-intent/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    sessionId,
                    ...params,
                }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Failed to start: ${response.status}`);
            }
        } catch (error) {
            setState(prev => ({
                ...prev,
                error: error instanceof Error ? error.message : 'Failed to start progressive resolution',
            }));
        }
    }, [sessionId, connectSSE]);

    /**
     * Report a planning UI selection to the engine.
     */
    const reportSelection = useCallback(async (params: {
        questionId: string;
        questionCategory?: string;
        selectedOptionId: string;
        selectedOptionLabel?: string;
    }) => {
        if (!sessionId || engineUnavailableRef.current) return;

        try {
            const resp = await fetch(`${API_URL}/api/execute/progressive-intent/selection/${sessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(params),
            });
            const result = await resp.json().catch(() => ({}));
            if (result.active === false) engineUnavailableRef.current = true;
        } catch {
            // Non-blocking - selections are best-effort
        }
    }, [sessionId]);

    /**
     * Report a credential save to trigger expansion agent.
     */
    const reportCredential = useCallback(async (params: {
        integrationId: string;
        integrationName?: string;
        envVarName: string;
        value: string;
        isOAuth?: boolean;
    }) => {
        if (!sessionId || engineUnavailableRef.current) return;

        try {
            const resp = await fetch(`${API_URL}/api/execute/progressive-intent/credential/${sessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(params),
            });
            const result = await resp.json().catch(() => ({}));
            if (result.active === false) engineUnavailableRef.current = true;
        } catch {
            // Non-blocking
        }
    }, [sessionId]);

    /**
     * Finalize intent when user clicks "Build for Production".
     * Returns the deep intent contract ID.
     */
    const finalizeIntent = useCallback(async (): Promise<{ deepIntentContractId: string; reconciledInMs: number } | null> => {
        if (!sessionId || engineUnavailableRef.current) return null;

        try {
            const response = await fetch(`${API_URL}/api/execute/progressive-intent/finalize/${sessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            });

            const result = await response.json().catch(() => ({}));

            // Engine not available — graceful no-op
            if (result.active === false) {
                engineUnavailableRef.current = true;
                return null;
            }

            if (!response.ok) {
                throw new Error(result.error || `Finalize failed: ${response.status}`);
            }

            // Close the SSE stream
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }

            setState(prev => ({ ...prev, isActive: false }));

            return {
                deepIntentContractId: result.deepIntentContractId,
                reconciledInMs: result.reconciledInMs,
            };
        } catch (error) {
            setState(prev => ({
                ...prev,
                error: error instanceof Error ? error.message : 'Finalize failed',
            }));
            return null;
        }
    }, [sessionId]);

    /**
     * Abort progressive resolution (e.g., user navigated away).
     */
    const abort = useCallback(() => {
        if (!sessionId) return;

        // Close SSE
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }

        // Best-effort abort call
        fetch(`${API_URL}/api/execute/progressive-intent/abort/${sessionId}`, {
            method: 'POST',
            credentials: 'include',
        }).catch(() => {});

        setState(initialState);
    }, [sessionId]);

    return {
        state,
        startResolution,
        reportSelection,
        reportCredential,
        finalizeIntent,
        abort,
    };
}

export default useProgressiveIntentStream;
