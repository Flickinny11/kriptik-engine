/**
 * Context Synchronization Hook
 *
 * Provides real-time synchronization with the agent orchestration backend
 * via Server-Sent Events (SSE / EventSource). Enables live updates for
 * agents, tasks, and deployments.
 *
 * Send operations (messages, tasks, refresh) use HTTP fetch to REST endpoints.
 * EventSource handles automatic reconnection natively, so no manual retry
 * loop is needed.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { API_URL } from '@/lib/api-config';

// ============================================================================
// TYPES
// ============================================================================

export interface Agent {
    id: string;
    type: 'planning' | 'coding' | 'testing' | 'deployment' | 'research' | 'integration' | 'review' | 'debug';
    name: string;
    status: 'idle' | 'working' | 'waiting' | 'blocked' | 'error' | 'completed';
    currentTask?: {
        id: string;
        title: string;
        progress?: number;
    };
    tokensUsed: number;
}

export interface Task {
    id: string;
    type: string;
    title: string;
    description: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
    assignedAgent?: string;
}

export interface Deployment {
    id: string;
    provider: string;
    status: 'pending' | 'building' | 'deploying' | 'running' | 'stopped' | 'failed';
    endpoint?: string;
    logs: string[];
}

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'agent';
    content: string;
    agentId?: string;
    agentType?: string;
    timestamp: Date;
}

export interface WorkflowState {
    id: string;
    name: string;
    status: 'planning' | 'approved' | 'deploying' | 'running' | 'paused' | 'failed';
}

// Advanced Orchestration Types
export interface VerificationResult {
    verdict: 'approved' | 'needs_work' | 'blocked' | 'rejected';
    score: number;
    checkNumber: number;
    issueCount?: number;
    blockers?: Array<{ message: string }>;
}

export interface VideoAnalysis {
    timestamp: Date;
    frameId: string;
    elements: Array<{
        id: string;
        type: string;
        label: string;
        boundingBox: { x: number; y: number; width: number; height: number };
        confidence: number;
        isInteractive: boolean;
    }>;
    suggestions: string[];
    issues: Array<{ type: 'error' | 'warning' | 'info'; message: string }>;
}

export interface RoutingHints {
    preferredModels: string[];
    avoidPatterns: string[];
    successfulApproaches: string[];
}

export interface InterruptApplied {
    interruptId: string;
    type: string;
    action: 'applied' | 'queued' | 'rejected';
    agentResponse?: string;
}

export interface ContextState {
    contextId: string | null;
    sessionId: string | null;
    connected: boolean;
    agents: Agent[];
    tasks: Task[];
    deployments: Deployment[];
    messages: Message[];
    activeWorkflow: WorkflowState | null;
    totalTokensUsed: number;
    // Advanced orchestration state
    verificationResult: VerificationResult | null;
    videoAnalysis: VideoAnalysis | null;
    routingHints: RoutingHints | null;
    lastInterrupt: InterruptApplied | null;
    injectedContext: string | null;
}

interface SSEMessage {
    type: string;
    payload: any;
    timestamp: string;
}

// ============================================================================
// HOOK
// ============================================================================

export function useContextSync(projectId: string, userId: string) {
    const [state, setState] = useState<ContextState>({
        contextId: null,
        sessionId: null,
        connected: false,
        agents: [],
        tasks: [],
        deployments: [],
        messages: [],
        activeWorkflow: null,
        totalTokensUsed: 0,
        // Advanced orchestration state
        verificationResult: null,
        videoAnalysis: null,
        routingHints: null,
        lastInterrupt: null,
        injectedContext: null,
    });

    const esRef = useRef<EventSource | null>(null);
    const { toast } = useToast();

    // Connect to SSE stream
    const connect = useCallback(async () => {
        // First, create or get context via API
        try {
            const response = await fetch(`${API_URL}/api/agents/context`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ projectId }),
            });

            if (!response.ok) {
                throw new Error('Failed to create context');
            }

            const { contextId, sessionId } = await response.json();

            setState(prev => ({ ...prev, contextId, sessionId }));

            // Connect via SSE (EventSource)
            const sseUrl = `${API_URL}/api/events/stream?contextId=${encodeURIComponent(contextId)}&channel=build`;
            const es = new EventSource(sseUrl, { withCredentials: true });

            es.onopen = () => {
                setState(prev => ({ ...prev, connected: true }));
            };

            es.onmessage = (event) => {
                try {
                    const parsed = JSON.parse(event.data);
                    // SSE payload shape is { type, data, timestamp }.
                    // handleMessage expects { type, payload, timestamp }.
                    const message: SSEMessage = {
                        type: parsed.type,
                        payload: parsed.data || parsed,
                        timestamp: parsed.timestamp,
                    };
                    handleMessage(message);
                } catch (error) {
                    console.error('Error parsing SSE message:', error);
                }
            };

            es.onerror = () => {
                // CRITICAL: Force-close to prevent infinite reconnect on iOS Safari.
                es.close();
                setState(prev => ({ ...prev, connected: false }));
            };

            esRef.current = es;

        } catch (error) {
            console.error('Error connecting:', error);
            toast({
                title: 'Connection Error',
                description: 'Failed to connect to the orchestration server',
                variant: 'destructive',
            });
        }
    }, [projectId, userId, toast]);

    // Handle incoming messages
    const handleMessage = useCallback((message: SSEMessage) => {
        switch (message.type) {
            case 'initial-state':
                setState(prev => ({
                    ...prev,
                    agents: message.payload.activeAgents || [],
                    tasks: message.payload.taskQueue || [],
                    deployments: message.payload.deploymentState?.activeDeployments || [],
                    messages: (message.payload.recentMessages || []).map((m: any) => ({
                        ...m,
                        timestamp: new Date(m.timestamp),
                    })),
                    activeWorkflow: message.payload.activeWorkflow || null,
                }));
                break;

            case 'agent-update':
                setState(prev => ({
                    ...prev,
                    agents: prev.agents.map(a =>
                        a.id === message.payload.agent.id ? message.payload.agent : a
                    ),
                }));
                break;

            case 'task-update':
                setState(prev => ({
                    ...prev,
                    tasks: prev.tasks.map(t =>
                        t.id === message.payload.task.id ? message.payload.task : t
                    ),
                }));
                break;

            case 'deployment-update':
                setState(prev => ({
                    ...prev,
                    deployments: prev.deployments.map(d =>
                        d.id === message.payload.deployment.id ? message.payload.deployment : d
                    ),
                }));
                break;

            case 'new-message':
                setState(prev => ({
                    ...prev,
                    messages: [...prev.messages, {
                        ...message.payload.message,
                        timestamp: new Date(message.payload.message.timestamp),
                    }],
                }));
                break;

            case 'context-event':
                // Handle various context events
                const event = message.payload;
                switch (event.type) {
                    case 'agent:started':
                        setState(prev => ({
                            ...prev,
                            agents: [...prev.agents, event.data],
                        }));
                        break;
                    case 'task:created':
                        setState(prev => ({
                            ...prev,
                            tasks: [...prev.tasks, event.data],
                        }));
                        break;
                    // Add more event handlers as needed
                }
                break;

            case 'stream-chunk':
                // Handle streaming AI responses
                const { messageId, chunk } = message.payload;
                setState(prev => {
                    const existingIdx = prev.messages.findIndex(m => m.id === messageId);
                    if (existingIdx >= 0) {
                        const updated = [...prev.messages];
                        updated[existingIdx] = {
                            ...updated[existingIdx],
                            content: updated[existingIdx].content + chunk,
                        };
                        return { ...prev, messages: updated };
                    } else {
                        return {
                            ...prev,
                            messages: [...prev.messages, {
                                id: messageId,
                                role: 'assistant' as const,
                                content: chunk,
                                timestamp: new Date(),
                            }],
                        };
                    }
                });
                break;

            // ================================================================
            // ADVANCED ORCHESTRATION EVENTS
            // ================================================================

            case 'continuous-verification':
            case 'verification-issue':
                // Engine verification results
                setState(prev => ({
                    ...prev,
                    verificationResult: {
                        verdict: message.payload.verdict,
                        score: message.payload.score,
                        checkNumber: message.payload.checkNumber,
                        issueCount: message.payload.issueCount,
                        blockers: message.payload.blockers,
                    },
                }));
                break;

            case 'video-analysis':
                // Gemini video analysis results
                setState(prev => ({
                    ...prev,
                    videoAnalysis: {
                        ...message.payload,
                        timestamp: new Date(message.payload.timestamp),
                    },
                }));
                break;

            case 'routing-hints':
                // Shadow pattern routing hints
                setState(prev => ({
                    ...prev,
                    routingHints: {
                        preferredModels: message.payload.preferredModels || [],
                        avoidPatterns: message.payload.avoidPatterns || [],
                        successfulApproaches: message.payload.successfulApproaches || [],
                    },
                }));
                break;

            case 'interrupt-applied':
                // Soft interrupt was applied
                setState(prev => ({
                    ...prev,
                    lastInterrupt: {
                        interruptId: message.payload.interruptId,
                        type: message.payload.type,
                        action: message.payload.action,
                        agentResponse: message.payload.agentResponse,
                    },
                }));
                break;

            case 'context-injected':
                // Context was injected into agent
                setState(prev => ({
                    ...prev,
                    injectedContext: message.payload.context,
                }));
                break;
        }
    }, []);

    // Send message to backend via HTTP POST
    const sendMessage = useCallback(async (content: string) => {
        if (!state.contextId) {
            toast({
                title: 'Not Connected',
                description: 'Please wait for the connection to be established',
                variant: 'destructive',
            });
            return;
        }

        // Optimistically add message to state
        setState(prev => ({
            ...prev,
            messages: [...prev.messages, {
                id: `temp-${Date.now()}`,
                role: 'user',
                content,
                timestamp: new Date(),
            }],
        }));

        try {
            await fetch(`${API_URL}/api/agents/context/${state.contextId}/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ content }),
            });
        } catch (error) {
            console.error('Error sending message:', error);
            toast({
                title: 'Send Error',
                description: 'Failed to send message',
                variant: 'destructive',
            });
        }
    }, [state.contextId, toast]);

    // Create a task via HTTP POST
    const createTask = useCallback(async (type: string, title: string, description: string, input?: Record<string, unknown>) => {
        if (!state.contextId) {
            return;
        }

        try {
            await fetch(`${API_URL}/api/agents/context/${state.contextId}/task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ type, title, description, input }),
            });
        } catch (error) {
            console.error('Error creating task:', error);
        }
    }, [state.contextId]);

    // Request context refresh via HTTP GET
    const refreshContext = useCallback(async () => {
        if (!state.contextId) {
            return;
        }

        try {
            const response = await fetch(`${API_URL}/api/agents/context/${state.contextId}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            });

            if (response.ok) {
                const data = await response.json();
                setState(prev => ({
                    ...prev,
                    agents: data.activeAgents || prev.agents,
                    tasks: data.taskQueue || prev.tasks,
                    deployments: data.deploymentState?.activeDeployments || prev.deployments,
                    messages: data.recentMessages
                        ? data.recentMessages.map((m: any) => ({
                            ...m,
                            timestamp: new Date(m.timestamp),
                        }))
                        : prev.messages,
                    activeWorkflow: data.activeWorkflow || prev.activeWorkflow,
                }));
            }
        } catch (error) {
            console.error('Error refreshing context:', error);
        }
    }, [state.contextId]);

    // Start orchestration
    const startOrchestration = useCallback(async () => {
        if (!state.contextId) return;

        try {
            await fetch(`${API_URL}/api/agents/context/${state.contextId}/orchestration/start`, {
                method: 'POST',
                credentials: 'include',
            });
            toast({
                title: 'Orchestration Started',
                description: 'Agents are now working on your tasks',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to start orchestration',
                variant: 'destructive',
            });
        }
    }, [state.contextId, toast]);

    // Stop orchestration
    const stopOrchestration = useCallback(async () => {
        if (!state.contextId) return;

        try {
            await fetch(`${API_URL}/api/agents/context/${state.contextId}/orchestration/stop`, {
                method: 'POST',
                credentials: 'include',
            });
            toast({
                title: 'Orchestration Stopped',
                description: 'Agents have stopped working',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to stop orchestration',
                variant: 'destructive',
            });
        }
    }, [state.contextId, toast]);

    // Connect on mount
    useEffect(() => {
        connect();

        return () => {
            if (esRef.current) {
                esRef.current.close();
            }
        };
    }, [connect]);

    return {
        ...state,
        sendMessage,
        createTask,
        refreshContext,
        startOrchestration,
        stopOrchestration,
    };
}
