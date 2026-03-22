/**
 * User App Errors Store
 *
 * Tracks runtime errors from the USER'S app (the app being built), NOT KripTik's own runtime.
 * 
 * Flow:
 * 1. User app runs in preview iframe
 * 2. Error occurs in user's app (click handler, API call, etc.)
 * 3. Preview iframe sends postMessage with error details
 * 4. This store captures the error
 * 7. Error resolved -> panel dismisses, swarm stands down
 *
 * The repair-man panel should NEVER activate until there's an error in the
 * USER'S app runtime logs. It should not fire during planning, building, or
 * any other KripTik activity.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type UserAppErrorSeverity = 'error' | 'warning' | 'fatal';

export interface UserAppError {
    id: string;
    timestamp: number;
    message: string;
    stack?: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    severity: UserAppErrorSeverity;
    componentStack?: string;
    url?: string;
    userAgent?: string;
    reproducibilityAttempts: number;
    lastReproducedAt?: number;
    resolved: boolean;
    resolvedAt?: number;
    resolvedBy?: string;
}

export interface ErrorReproductionAttempt {
    id: string;
    errorId: string;
    timestamp: number;
    success: boolean;
    geminiSessionId?: string;
    actions: Array<{
        type: 'click' | 'input' | 'scroll' | 'navigation' | 'hover';
        selector?: string;
        value?: string;
        coordinates?: { x: number; y: number };
    }>;
}

    isDeployed: boolean;
    deployedAt?: number;
    agents: Array<{
        type: 'error_checker' | 'code_quality' | 'visual_verifier' | 'security_scanner' | 'placeholder_eliminator' | 'design_style';
        status: 'idle' | 'investigating' | 'fixing' | 'verifying' | 'complete' | 'error';
        progress: number;
        currentTask?: string;
    }>;
    geminiLiveSessionId?: string;
    verdict?: 'fixing' | 'fixed' | 'cannot_reproduce' | 'cannot_fix';
}

interface UserAppErrorsState {
    projectId: string | null;
    errors: UserAppError[];
    reproductionAttempts: ErrorReproductionAttempt[];
    isRepairManActive: boolean;
    
    lastErrorAt: number | null;
    totalErrorsCaptured: number;
    
    setProjectId: (projectId: string | null) => void;
    
    addError: (error: Omit<UserAppError, 'id' | 'timestamp' | 'reproducibilityAttempts' | 'resolved'>) => void;
    resolveError: (errorId: string, resolvedBy: string) => void;
    clearErrors: () => void;
    clearResolvedErrors: () => void;
    
    addReproductionAttempt: (attempt: Omit<ErrorReproductionAttempt, 'id' | 'timestamp'>) => void;
    
    standDownSwarm: () => void;
    
    setRepairManActive: (active: boolean) => void;
    setGeminiLiveSessionId: (sessionId: string | undefined) => void;
    
    hasUnresolvedErrors: () => boolean;
    getLastError: () => UserAppError | null;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    isDeployed: false,
    agents: [
        { type: 'error_checker', status: 'idle', progress: 0 },
        { type: 'code_quality', status: 'idle', progress: 0 },
        { type: 'visual_verifier', status: 'idle', progress: 0 },
        { type: 'security_scanner', status: 'idle', progress: 0 },
        { type: 'placeholder_eliminator', status: 'idle', progress: 0 },
        { type: 'design_style', status: 'idle', progress: 0 },
    ],
};

export const useUserAppErrorsStore = create<UserAppErrorsState>()(
    persist(
        (set, get) => ({
            projectId: null,
            errors: [],
            reproductionAttempts: [],
            isRepairManActive: false,
            lastErrorAt: null,
            totalErrorsCaptured: 0,
            
            setProjectId: (projectId) => {
                const current = get().projectId;
                if (current !== projectId) {
                    set({
                        projectId,
                        errors: [],
                        reproductionAttempts: [],
                        isRepairManActive: false,
                        lastErrorAt: null,
                    });
                }
            },
            
            addError: (error) => {
                const newError: UserAppError = {
                    ...error,
                    id: generateId(),
                    timestamp: Date.now(),
                    reproducibilityAttempts: 0,
                    resolved: false,
                };
                
                set((state) => ({
                    errors: [...state.errors, newError],
                    lastErrorAt: Date.now(),
                    totalErrorsCaptured: state.totalErrorsCaptured + 1,
                }));
                
                console.log('[UserAppErrors] Captured error:', newError.message, {
                    severity: error.severity,
                    file: error.filename,
                    line: error.lineno,
                });
            },
            
            resolveError: (errorId, resolvedBy) => {
                set((state) => ({
                    errors: state.errors.map((e) =>
                        e.id === errorId
                            ? { ...e, resolved: true, resolvedAt: Date.now(), resolvedBy }
                            : e
                    ),
                }));
            },
            
            clearErrors: () => {
                set({
                    errors: [],
                    reproductionAttempts: [],
                    isRepairManActive: false,
                    lastErrorAt: null,
                });
            },
            
            clearResolvedErrors: () => {
                set((state) => ({
                    errors: state.errors.filter((e) => !e.resolved),
                }));
            },
            
            addReproductionAttempt: (attempt) => {
                const newAttempt: ErrorReproductionAttempt = {
                    ...attempt,
                    id: generateId(),
                    timestamp: Date.now(),
                };
                
                set((state) => ({
                    reproductionAttempts: [...state.reproductionAttempts, newAttempt],
                    errors: state.errors.map((e) =>
                        e.id === attempt.errorId
                            ? {
                                ...e,
                                reproducibilityAttempts: e.reproducibilityAttempts + 1,
                                lastReproducedAt: attempt.success ? Date.now() : e.lastReproducedAt,
                            }
                            : e
                    ),
                }));
            },
            
                set((state) => ({
                        isDeployed: true,
                        deployedAt: Date.now(),
                        verdict: 'fixing',
                            ...a,
                            status: 'investigating' as const,
                            progress: 0,
                        })),
                    },
                    isRepairManActive: true,
                }));
                
            },
            
                set((state) => ({
                            a.type === agentType ? { ...a, ...updates } : a
                        ),
                    },
                }));
            },
            
                set((state) => ({
                        verdict,
                    },
                }));
            },
            
            standDownSwarm: () => {
                set({
                    isRepairManActive: false,
                });
                
            },
            
            setRepairManActive: (active) => {
                set({ isRepairManActive: active });
            },
            
            setGeminiLiveSessionId: (sessionId) => {
                set((state) => ({
                        geminiLiveSessionId: sessionId,
                    },
                }));
            },
            
            hasUnresolvedErrors: () => {
                const state = get();
                return state.errors.some((e) => !e.resolved);
            },
            
            getLastError: () => {
                const state = get();
                const unresolved = state.errors.filter((e) => !e.resolved);
                return unresolved.length > 0 ? unresolved[unresolved.length - 1] : null;
            },
        }),
        {
            name: 'kriptik-user-app-errors',
            storage: createJSONStorage(() => sessionStorage),
            partialize: (state) => ({
                projectId: state.projectId,
                errors: state.errors.slice(-20),
                lastErrorAt: state.lastErrorAt,
                totalErrorsCaptured: state.totalErrorsCaptured,
            }),
        }
    )
);
