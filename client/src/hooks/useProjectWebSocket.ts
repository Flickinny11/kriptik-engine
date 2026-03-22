/**
 * useProjectWebSocket - Real-time project status updates via SSE (Server-Sent Events)
 *
 * Connects to the SSE event stream for real-time updates on:
 * - Fix My App capture progress
 * - Build phase changes
 * - Agent thoughts/streaming consciousness
 * - Error notifications
 *
 * Uses EventSource with auth pre-flight check and retry limits to prevent
 * infinite reconnection loops that crash iOS Safari.
 *
 * iOS Safari crash fix (March 2026): The security commits that removed
 * userId query param fallback caused EventSource to receive 401 on iOS
 * (where cookies aren't always sent with EventSource). The browser's
 * built-in auto-reconnect then loops infinitely, exhausting the ~150MB
 * web process memory limit and crashing with "cannot open page".
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { API_URL, authenticatedFetch } from '@/lib/api-config';

// =============================================================================
// Constants — SSE reconnection safety
// =============================================================================

/** Max consecutive SSE connection failures before giving up */
const MAX_SSE_RETRIES = 5;

/** Base delay between retries in ms (doubles each attempt) */
const SSE_RETRY_BASE_MS = 2000;

/** Max delay between retries */
const SSE_RETRY_MAX_MS = 30000;

// =============================================================================
// Types
// =============================================================================

export interface ProjectStatusUpdate {
    type: 'capture_progress' | 'build_progress' | 'phase_change' | 'thought_update' | 'screenshot_available' | 'completed' | 'failed';
    projectId: string;
    status?: string;
    progress?: number;
    phase?: string;
    activityIndex?: number;
    totalPhases?: number;
    message?: string;
    thought?: string;
    screenshotUrl?: string;
    error?: string;
    timestamp: number;
}

export interface UseProjectWebSocketOptions {
    projectId: string;
    enabled?: boolean;
    onUpdate?: (update: ProjectStatusUpdate) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Event) => void;
}

export interface UseProjectWebSocketReturn {
    isConnected: boolean;
    lastUpdate: ProjectStatusUpdate | null;
    currentThought: string | null;
    currentActivity: string | null;
    activityIndex: number;
    progress: number;
    status: string | null;
    screenshotUrl: string | null;
}

// =============================================================================
// SSE event type to ProjectStatusUpdate.type mapping
// =============================================================================

/** Map SSE event type strings (kebab-case) to ProjectStatusUpdate type values (snake_case). */
const EVENT_TYPE_MAP: Record<string, ProjectStatusUpdate['type']> = {
    'capture-progress': 'capture_progress',
    'capture_progress': 'capture_progress',
    'build-progress': 'build_progress',
    'build_progress': 'build_progress',
    'phase-change': 'phase_change',
    'phase_change': 'phase_change',
    'thought-update': 'thought_update',
    'thought_update': 'thought_update',
    'screenshot-available': 'screenshot_available',
    'screenshot_available': 'screenshot_available',
    'completed': 'completed',
    'failed': 'failed',
};

// =============================================================================
// Auth pre-flight: verify session before opening EventSource
// =============================================================================

/**
 * Check if the SSE endpoint is reachable with valid auth.
 * EventSource doesn't expose HTTP status codes on error, so we use a fetch
 * pre-flight to detect 401/403 before opening the persistent connection.
 * This prevents infinite reconnect loops on iOS Safari where cookies aren't
 * reliably sent with EventSource requests.
 */
async function checkSSEAuth(url: string): Promise<boolean> {
    try {
        const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Accept': 'text/event-stream' },
            signal: AbortSignal.timeout(5000),
        });
        // Abort the body — we only needed the status code
        res.body?.cancel();
        return res.ok;
    } catch {
        // Network error or timeout — allow SSE attempt (might be transient)
        return true;
    }
}

// =============================================================================
// Hook — Single Project
// =============================================================================

export function useProjectWebSocket({
    projectId,
    enabled = true,
    onUpdate,
    onConnect,
    onDisconnect,
    onError,
}: UseProjectWebSocketOptions): UseProjectWebSocketReturn {
    const esRef = useRef<EventSource | null>(null);

    // Stable refs for callbacks — prevents SSE connection teardown/rebuild
    // when parent re-renders with new callback identities
    const onUpdateRef = useRef(onUpdate);
    const onConnectRef = useRef(onConnect);
    const onDisconnectRef = useRef(onDisconnect);
    const onErrorRef = useRef(onError);
    onUpdateRef.current = onUpdate;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;

    // State
    const [isConnected, setIsConnected] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<ProjectStatusUpdate | null>(null);
    const [currentThought, setCurrentThought] = useState<string | null>(null);
    const [currentActivity, setCurrentPhase] = useState<string | null>(null);
    const [activityIndex, setActivityIndex] = useState(1);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<string | null>(null);
    const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

    // Process incoming update — stable identity (uses refs for external callbacks)
    const processUpdate = useCallback((update: ProjectStatusUpdate) => {
        setLastUpdate(update);

        switch (update.type) {
            case 'capture_progress':
            case 'build_progress':
                if (update.progress !== undefined) setProgress(update.progress);
                if (update.status) setStatus(update.status);
                if (update.message) setCurrentThought(update.message);
                break;

            case 'phase_change':
                if (update.phase) setCurrentPhase(update.phase);
                if (update.activityIndex !== undefined) setActivityIndex(update.activityIndex);
                if (update.progress !== undefined) setProgress(update.progress);
                break;

            case 'thought_update':
                if (update.thought) setCurrentThought(update.thought);
                break;

            case 'screenshot_available':
                if (update.screenshotUrl) setScreenshotUrl(update.screenshotUrl);
                break;

            case 'completed':
                setStatus('completed');
                setProgress(100);
                break;

            case 'failed':
                setStatus('failed');
                if (update.error) setCurrentThought(`Error: ${update.error}`);
                break;
        }

        onUpdateRef.current?.(update);
    }, []); // empty deps — uses refs

    // Connect to SSE stream with auth pre-flight and capped retries.
    // Prevents infinite reconnect loops that crash iOS Safari.
    useEffect(() => {
        if (!enabled || !projectId) return;

        let cancelled = false;
        let retryCount = 0;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        async function attemptConnect() {
            if (cancelled) return;

            // Removed stale userId= param — server now uses session cookie only
            const sseUrl = `${API_URL}/api/events/stream?contextId=${encodeURIComponent(projectId)}&channel=build`;

            // Pre-flight auth check on first attempt to catch 401 before EventSource opens
            if (retryCount === 0) {
                const authOk = await checkSSEAuth(sseUrl);
                if (!authOk) {
                    console.warn(`[SSE] Auth pre-flight failed for project ${projectId} — skipping SSE`);
                    return;
                }
            }

            if (cancelled) return;

            try {
                console.log(`[SSE] Connecting to project ${projectId} (attempt ${retryCount + 1}/${MAX_SSE_RETRIES})`);

                const es = new EventSource(sseUrl, { withCredentials: true });
                esRef.current = es;

                es.onopen = () => {
                    if (cancelled) { es.close(); return; }
                    console.log(`[SSE] Connected to project ${projectId}`);
                    retryCount = 0; // Reset on successful connection
                    setIsConnected(true);
                    onConnectRef.current?.();
                };

                es.onmessage = (event) => {
                    if (cancelled) return;
                    try {
                        const parsed = JSON.parse(event.data);
                        const eventType = parsed.type;
                        const innerData = parsed.data || parsed;

                        if (innerData.projectId && innerData.projectId !== projectId) {
                            return;
                        }

                        const mappedType = EVENT_TYPE_MAP[eventType] || eventType;

                        const update: ProjectStatusUpdate = {
                            type: mappedType,
                            projectId: innerData.projectId || projectId,
                            status: innerData.status,
                            progress: innerData.progress,
                            phase: innerData.phase,
                            activityIndex: innerData.activityIndex,
                            totalPhases: innerData.totalPhases,
                            message: innerData.message,
                            thought: innerData.thought,
                            screenshotUrl: innerData.screenshotUrl,
                            error: innerData.error,
                            timestamp: innerData.timestamp || Date.now(),
                        };

                        processUpdate(update);
                    } catch (err) {
                        console.error('[SSE] Failed to parse message:', err);
                    }
                };

                es.onerror = (error) => {
                    console.error('[SSE] Error:', error);
                    onErrorRef.current?.(error);

                    // CRITICAL: Force-close to prevent browser auto-reconnect.
                    // Without this, iOS Safari's EventSource reconnects infinitely
                    // on 401 responses, exhausting the ~150MB web process memory limit.
                    es.close();
                    esRef.current = null;
                    setIsConnected(false);
                    onDisconnectRef.current?.();

                    if (cancelled) return;

                    retryCount += 1;

                    if (retryCount >= MAX_SSE_RETRIES) {
                        console.warn(`[SSE] Gave up after ${MAX_SSE_RETRIES} failures for project ${projectId}`);
                        return;
                    }

                    // Exponential backoff: 2s, 4s, 8s, 16s, ...
                    const delay = Math.min(
                        SSE_RETRY_BASE_MS * Math.pow(2, retryCount - 1),
                        SSE_RETRY_MAX_MS
                    );
                    console.log(`[SSE] Retrying in ${delay}ms (attempt ${retryCount}/${MAX_SSE_RETRIES})`);
                    retryTimer = setTimeout(() => attemptConnect(), delay);
                };
            } catch (err) {
                console.error('[SSE] Failed to connect:', err);
            }
        }

        attemptConnect();

        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
            if (esRef.current) {
                esRef.current.close();
                esRef.current = null;
            }
            setIsConnected(false);
        };
    }, [enabled, projectId, processUpdate]);

    // Fetch server-side build status on mount for reconnection awareness
    useEffect(() => {
        if (!enabled || !projectId) return;

        authenticatedFetch(`${API_URL}/api/build-session/${projectId}/status`)
            .then(r => r.ok ? r.json() : null)
            .then(statusData => {
                if (!statusData) return;
                if (statusData.status === 'running') {
                    setStatus('running');
                    if (statusData.progress) setProgress(statusData.progress);
                    if (statusData.currentActivity) setCurrentPhase(statusData.currentActivity);
                } else if (statusData.status === 'completed') {
                    setStatus('completed');
                    setProgress(100);
                } else if (statusData.status === 'failed') {
                    setStatus('failed');
                }
            })
            .catch(() => { /* best-effort */ });
    }, [enabled, projectId]);

    return {
        isConnected,
        lastUpdate,
        currentThought,
        currentActivity,
        activityIndex,
        progress,
        status,
        screenshotUrl,
    };
}

// =============================================================================
// Multi-Project Hook
// =============================================================================

export interface UseMultiProjectWebSocketOptions {
    projectIds: string[];
    enabled?: boolean;
    onUpdate?: (update: ProjectStatusUpdate) => void;
}

export interface ProjectStatus {
    projectId: string;
    status: string | null;
    progress: number;
    phase: string | null;
    activityIndex: number;
    thought: string | null;
    screenshotUrl: string | null;
    lastUpdate: number | null;
}

export function useMultiProjectWebSocket({
    projectIds,
    enabled = true,
    onUpdate,
}: UseMultiProjectWebSocketOptions) {
    const esRef = useRef<EventSource | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [projectStatuses, setProjectStatuses] = useState<Map<string, ProjectStatus>>(new Map());

    // Stable ref for onUpdate to prevent effect re-runs
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    // Process update for a specific project
    const processUpdate = useCallback((update: ProjectStatusUpdate) => {
        setProjectStatuses(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(update.projectId) || {
                projectId: update.projectId,
                status: null,
                progress: 0,
                phase: null,
                activityIndex: 1,
                thought: null,
                screenshotUrl: null,
                lastUpdate: null,
            };

            // Update based on type
            if (update.progress !== undefined) existing.progress = update.progress;
            if (update.status) existing.status = update.status;
            if (update.phase) existing.phase = update.phase;
            if (update.activityIndex !== undefined) existing.activityIndex = update.activityIndex;
            if (update.thought || update.message) existing.thought = update.thought || update.message || null;
            if (update.screenshotUrl) existing.screenshotUrl = update.screenshotUrl;
            existing.lastUpdate = update.timestamp;

            newMap.set(update.projectId, existing);
            return newMap;
        });

        onUpdateRef.current?.(update);
    }, []);

    // Stable key for projectIds to prevent unnecessary reconnects
    const projectIdsKey = projectIds.join(',');

    // Connect to multi-project SSE stream with capped retries
    useEffect(() => {
        if (!enabled || projectIds.length === 0) return;

        let cancelled = false;
        let retryCount = 0;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        async function attemptConnect() {
            if (cancelled) return;

            // Removed stale userId= param — server now uses session cookie only
            const sseUrl = `${API_URL}/api/events/stream?channel=dashboard`;

            // Pre-flight auth check on first attempt
            if (retryCount === 0) {
                const authOk = await checkSSEAuth(sseUrl);
                if (!authOk) {
                    console.warn('[SSE] Auth pre-flight failed for dashboard — skipping SSE');
                    return;
                }
            }

            if (cancelled) return;

            try {
                console.log(`[SSE] Connecting to dashboard stream (attempt ${retryCount + 1}/${MAX_SSE_RETRIES})`);

                const es = new EventSource(sseUrl, { withCredentials: true });
                esRef.current = es;

                es.onopen = () => {
                    if (cancelled) { es.close(); return; }
                    console.log('[SSE] Connected to dashboard');
                    retryCount = 0;
                    setIsConnected(true);
                };

                es.onmessage = (event) => {
                    if (cancelled) return;
                    try {
                        const parsed = JSON.parse(event.data);
                        const eventType = parsed.type;
                        const innerData = parsed.data || parsed;

                        // Only process events for projects we are tracking
                        const eventProjectId = innerData.projectId;
                        if (!eventProjectId || !projectIds.includes(eventProjectId)) {
                            return;
                        }

                        const mappedType = EVENT_TYPE_MAP[eventType] || eventType;

                        const update: ProjectStatusUpdate = {
                            type: mappedType,
                            projectId: eventProjectId,
                            status: innerData.status,
                            progress: innerData.progress,
                            phase: innerData.phase,
                            activityIndex: innerData.activityIndex,
                            totalPhases: innerData.totalPhases,
                            message: innerData.message,
                            thought: innerData.thought,
                            screenshotUrl: innerData.screenshotUrl,
                            error: innerData.error,
                            timestamp: innerData.timestamp || Date.now(),
                        };

                        processUpdate(update);
                    } catch (err) {
                        console.error('[SSE] Failed to parse message:', err);
                    }
                };

                es.onerror = (error) => {
                    console.error('[SSE] Dashboard error:', error);

                    // CRITICAL: Force-close to prevent browser auto-reconnect loop
                    es.close();
                    esRef.current = null;
                    setIsConnected(false);

                    if (cancelled) return;

                    retryCount += 1;

                    if (retryCount >= MAX_SSE_RETRIES) {
                        console.warn(`[SSE] Gave up dashboard SSE after ${MAX_SSE_RETRIES} failures`);
                        return;
                    }

                    const delay = Math.min(
                        SSE_RETRY_BASE_MS * Math.pow(2, retryCount - 1),
                        SSE_RETRY_MAX_MS
                    );
                    console.log(`[SSE] Dashboard retry in ${delay}ms (attempt ${retryCount}/${MAX_SSE_RETRIES})`);
                    retryTimer = setTimeout(() => attemptConnect(), delay);
                };
            } catch (err) {
                console.error('[SSE] Failed to connect:', err);
            }
        }

        attemptConnect();

        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
            if (esRef.current) {
                esRef.current.close();
                esRef.current = null;
            }
            setIsConnected(false);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, projectIdsKey, processUpdate]);

    // Get status for a specific project
    const getProjectStatus = useCallback((projectId: string): ProjectStatus | undefined => {
        return projectStatuses.get(projectId);
    }, [projectStatuses]);

    return {
        isConnected,
        projectStatuses,
        getProjectStatus,
    };
}

export default useProjectWebSocket;
