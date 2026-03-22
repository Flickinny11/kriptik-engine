/**
 * useStreamingChat Hook - Integration Bridge for New Streaming Components
 *
 * This hook integrates:
 * 1. Instant-acknowledge endpoint for <100ms initial response
 * 2. Speculative input processing
 * 3. Streaming thinking tokens
 * 4. Action stream items
 * 5. Planning UI state management
 * 6. Dynamic credential collection
 * 7. Deploy button state
 *
 * Used by ChatInterface to enable the new Cursor 2.4-style streaming experience
 * while maintaining backward compatibility with existing orchestration flow.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ActionType } from '../components/builder/chat/ActionStreamItem';
import type { CodeBlockType } from '../components/builder/chat/CodeBlock';
import type { PlanningQuestion } from '../components/builder/chat/EmbeddedPlanningUI';
import type { DynamicCredentialField } from '../services/dynamic-credential-analyzer';
import { analyzeOtherOption, applyOtherOptionChanges } from '../services/other-option-analyzer';
import { API_URL } from '../lib/api-config';

// =============================================================================
// Types
// =============================================================================

export interface StreamingAction {
  id: string;
  type: ActionType;
  label: string;
  detail?: string;
  isActive: boolean;
  timestamp: Date;
}

export interface StreamingCodeBlock {
  id: string;
  type: CodeBlockType;
  content: string;
  language?: string;
  fileName?: string;
  collapsible?: boolean;
}

export interface ThinkingState {
  isActive: boolean;
  tokens: string;
  isCollapsed: boolean;
}

export interface StreamingChatState {
  // Instant acknowledge
  acknowledgment: string | null;
  isAcknowledging: boolean;

  // Thinking tokens
  thinking: ThinkingState;

  // Action stream
  actions: StreamingAction[];

  // Code blocks
  codeBlocks: StreamingCodeBlock[];

  // Planning UI
  showPlanningUI: boolean;
  planningQuestions: PlanningQuestion[];
  isReplanningFromOther: boolean;
  replanRound: number;

  // Credentials UI
  showCredentialsUI: boolean;
  credentialFields: DynamicCredentialField[];

  // Deploy
  showDeployButton: boolean;
  isDeploying: boolean;
  deployingProvider: string | null;

  // Preview deployment
  previewUrl: string | null;
  previewReady: boolean;

  // Overall state
  isStreaming: boolean;
  sessionId: string | null;
}

export interface UseStreamingChatReturn {
  state: StreamingChatState;

  // Actions
  sendInstantAcknowledge: (prompt: string, userId: string, projectId?: string, onToken?: (partialText: string) => void) => Promise<string>;
  appendThinkingToken: (token: string) => void;
  setThinkingActive: (active: boolean) => void;
  toggleThinkingCollapsed: () => void;
  addAction: (action: Omit<StreamingAction, 'id' | 'timestamp'>) => void;
  updateActionActive: (actionId: string, isActive: boolean) => void;
  addCodeBlock: (block: Omit<StreamingCodeBlock, 'id'>) => void;
  showPlanningQuestions: (questions: PlanningQuestion[]) => void;
  handlePlanningSelection: (questionId: string, optionId: string, otherValue?: string) => void;
  handleOtherSubmit: (questionId: string, otherValue: string) => Promise<void>;
  completePlanning: () => void;
  showCredentials: (fields: DynamicCredentialField[]) => void;
  updateCredentialField: (fieldId: string, value: string) => void;
  completeCredentials: () => void;
  showDeploy: () => void;
  startDeploy: (provider: string) => void;
  completeDeploy: () => void;
  setPreviewUrl: (url: string) => void;
  setPreviewReady: (ready: boolean) => void;
  softReset: () => void;
  reset: () => void;
}

// =============================================================================
// Quick Acknowledgment Generator
// =============================================================================

// No pre-generated acknowledgments - all responses stream from the real AI

// =============================================================================
// Initial State
// =============================================================================

const initialState: StreamingChatState = {
  acknowledgment: null,
  isAcknowledging: false,
  thinking: {
    isActive: false,
    tokens: '',
    isCollapsed: false,
  },
  actions: [],
  codeBlocks: [],
  showPlanningUI: false,
  planningQuestions: [],
  isReplanningFromOther: false,
  replanRound: 0,
  showCredentialsUI: false,
  credentialFields: [],
  showDeployButton: false,
  isDeploying: false,
  deployingProvider: null,
  previewUrl: null,
  previewReady: false,
  isStreaming: false,
  sessionId: null,
};

// =============================================================================
// Local Storage Key (persists across browser sessions)
// =============================================================================

const STORAGE_KEY_BASE = 'kriptik-streaming-chat-state';

/** Build a project-scoped storage key, falling back to the global key. */
function getStorageKey(projectId?: string | null): string {
  return projectId ? `${STORAGE_KEY_BASE}-${projectId}` : STORAGE_KEY_BASE;
}

/**
 * Load state from localStorage (persists across browser sessions)
 */
function loadPersistedState(projectId?: string | null): StreamingChatState | null {
  try {
    const key = getStorageKey(projectId);
    const stored = localStorage.getItem(key);
    // Fallback: if project-scoped key is empty, try global key for migration
    if (!stored && projectId) {
      const global = localStorage.getItem(STORAGE_KEY_BASE);
      if (global) {
        // Migrate: move global state to project-scoped key and clear global
        localStorage.setItem(key, global);
        localStorage.removeItem(STORAGE_KEY_BASE);
        return loadPersistedState(projectId);
      }
    }
    if (!stored) return null;

    const parsed = JSON.parse(stored);

    // Reset transient streaming FLAGS on page load (stream is no longer active).
    // PRESERVE accumulated content (thinking tokens, actions, code blocks) so
    // the user sees what happened before the refresh.
    parsed.isStreaming = false;
    parsed.isAcknowledging = false;
    parsed.thinking = {
      isActive: false,
      tokens: parsed.thinking?.tokens || '',
      isCollapsed: true,
    };
    // Mark all actions as completed (stream interrupted)
    parsed.actions = (parsed.actions || []).map((a: any) => ({ ...a, isActive: false }));
    parsed.codeBlocks = parsed.codeBlocks || [];
    parsed.isDeploying = false;

    return parsed as StreamingChatState;
  } catch (e) {
    console.warn('[useStreamingChat] Failed to load persisted state:', e);
    return null;
  }
}

/**
 * Save state to localStorage (persists across browser sessions)
 */
function savePersistedState(state: StreamingChatState, projectId?: string | null): void {
  try {
    // Persist accumulated content (thinking tokens, actions, code blocks) so
    // the user sees what happened before the refresh. Reset streaming FLAGS only.
    const toPersist: StreamingChatState = {
      ...state,
      isStreaming: false,
      isAcknowledging: false,
      thinking: {
        isActive: false,
        tokens: state.thinking.tokens,
        isCollapsed: true,
      },
      actions: state.actions.map(a => ({ ...a, isActive: false })),
      codeBlocks: state.codeBlocks,
      isDeploying: false,
    };
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(toPersist));
  } catch (e) {
    console.warn('[useStreamingChat] Failed to save state:', e);
  }
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useStreamingChat(projectId?: string | null): UseStreamingChatReturn {
  // Initialize with persisted state if available
  const [state, setState] = useState<StreamingChatState>(() => {
    const persisted = loadPersistedState(projectId);
    return persisted || initialState;
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const prevProjectIdRef = useRef<string | null | undefined>(projectId);

  // When projectId changes, save old project's state and load new project's state
  useEffect(() => {
    if (prevProjectIdRef.current !== projectId) {
      // Archive current state under old project key
      savePersistedState(state, prevProjectIdRef.current);
      // Load state for new project
      const newState = loadPersistedState(projectId);
      setState(newState || initialState);
      prevProjectIdRef.current = projectId;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when projectId changes
  }, [projectId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Persist state to localStorage on changes (survives browser close)
  useEffect(() => {
    savePersistedState(state, projectId);
  }, [state, projectId]);

  /**
   * Send instant acknowledge request for fast initial response
   * Returns the acknowledgment string directly for immediate use
   */
  const sendInstantAcknowledge = useCallback(async (
    prompt: string,
    userId: string,
    projectId?: string,
    onToken?: (partialText: string) => void,
  ): Promise<string> => {
    setState(prev => ({
      ...prev,
      isAcknowledging: true,
      isStreaming: true,
    }));

    try {
      const response = await fetch(`${API_URL}/api/execute/instant-acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          prompt,
          userId,
          projectId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get instant acknowledge: ${response.status}`);
      }

      // Consume SSE stream for progressive token delivery
      let fullText = '';
      let streamSessionId = '';
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.type === 'session') {
                streamSessionId = payload.streamSessionId || '';
              } else if (payload.type === 'token') {
                fullText += payload.text;
                onToken?.(fullText);
              } else if (payload.type === 'done') {
                // Final text — use it if streaming produced nothing
                if (!fullText && payload.text) {
                  fullText = payload.text;
                  onToken?.(fullText);
                }
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
        }
      }

      const acknowledgment = fullText || '';

      setState(prev => ({
        ...prev,
        acknowledgment,
        sessionId: streamSessionId,
        isAcknowledging: false,
        thinking: {
          ...prev.thinking,
          isActive: true,
        },
      }));

      console.log('[useStreamingChat] Instant acknowledge streamed:', { length: acknowledgment.length, streamSessionId });
      return acknowledgment;

    } catch (error) {
      console.error('[useStreamingChat] Instant acknowledge error:', error);
      // No fallback pre-gen text - return empty so the streaming thinking takes over
      setState(prev => ({
        ...prev,
        isAcknowledging: false,
        acknowledgment: '',
      }));
      return '';
    }
  }, []);

  /**
   * Append token to thinking stream
   */
  const appendThinkingToken = useCallback((token: string) => {
    setState(prev => ({
      ...prev,
      thinking: {
        ...prev.thinking,
        tokens: prev.thinking.tokens + token,
      },
    }));
  }, []);

  /**
   * Set thinking active state
   */
  const setThinkingActive = useCallback((active: boolean) => {
    setState(prev => ({
      ...prev,
      thinking: {
        ...prev.thinking,
        isActive: active,
        // Auto-collapse after 1 second when thinking completes
        isCollapsed: !active ? prev.thinking.isCollapsed : false,
      },
    }));

    // Auto-collapse after delay when thinking stops
    if (!active) {
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          thinking: {
            ...prev.thinking,
            isCollapsed: true,
          },
        }));
      }, 1000);
    }
  }, []);

  /**
   * Toggle thinking collapsed state
   */
  const toggleThinkingCollapsed = useCallback(() => {
    setState(prev => ({
      ...prev,
      thinking: {
        ...prev.thinking,
        isCollapsed: !prev.thinking.isCollapsed,
      },
    }));
  }, []);

  /**
   * Add an action to the stream
   */
  const addAction = useCallback((action: Omit<StreamingAction, 'id' | 'timestamp'>) => {
    const newAction: StreamingAction = {
      ...action,
      id: uuidv4(),
      timestamp: new Date(),
    };

    setState(prev => ({
      ...prev,
      actions: [...prev.actions, newAction],
    }));
  }, []);

  /**
   * Update an action's active state
   */
  const updateActionActive = useCallback((actionId: string, isActive: boolean) => {
    setState(prev => ({
      ...prev,
      actions: prev.actions.map(a =>
        a.id === actionId ? { ...a, isActive } : a
      ),
    }));
  }, []);

  /**
   * Add a code block
   */
  const addCodeBlock = useCallback((block: Omit<StreamingCodeBlock, 'id'>) => {
    const newBlock: StreamingCodeBlock = {
      ...block,
      id: uuidv4(),
    };

    setState(prev => ({
      ...prev,
      codeBlocks: [...prev.codeBlocks, newBlock],
    }));
  }, []);

  /**
   * Show planning UI with questions
   */
  const showPlanningQuestions = useCallback((questions: PlanningQuestion[]) => {
    setState(prev => ({
      ...prev,
      showPlanningUI: true,
      planningQuestions: questions,
      isStreaming: false,
    }));
  }, []);

  /**
   * Handle planning option selection
   */
  const handlePlanningSelection = useCallback((
    questionId: string,
    optionId: string,
    otherValue?: string
  ) => {
    setState(prev => ({
      ...prev,
      planningQuestions: prev.planningQuestions.map(q =>
        q.id === questionId
          ? { ...q, selectedOptionId: optionId, otherValue }
          : q
      ),
    }));
  }, []);

  /**
   * Handle "Other" option submission - triggers re-planning
   */
  const handleOtherSubmit = useCallback(async (
    questionId: string,
    otherValue: string
  ) => {
    const question = state.planningQuestions.find(q => q.id === questionId);
    if (!question) return;

    setState(prev => ({
      ...prev,
      isReplanningFromOther: true,
    }));

    // Analyze the "Other" input
    const analysis = analyzeOtherOption({
      questionId,
      questionCategory: question.category,
      questionText: question.question,
      otherValue,
      currentSelections: Object.fromEntries(
        state.planningQuestions
          .filter(q => q.selectedOptionId)
          .map(q => [q.id, q.selectedOptionId!])
      ),
      currentIntegrations: state.credentialFields.map(f => f.integrationId),
    }, state.replanRound);

    console.log('[useStreamingChat] Other option analysis:', analysis);

    if (analysis.requiresCompleteReplan) {
      // Would trigger full replan via API
      console.log('[useStreamingChat] Complete replan required');
    } else if (analysis.requiresNewDependencies || analysis.removeDependencies) {
      // Update credential fields based on dependency changes
      const { updatedIntegrations } = applyOtherOptionChanges(
        '', // Plan text would come from state
        state.credentialFields.map(f => f.integrationId),
        analysis
      );
      console.log('[useStreamingChat] Updated integrations:', updatedIntegrations);
    }

    setState(prev => ({
      ...prev,
      isReplanningFromOther: false,
      replanRound: analysis.replanRound,
      planningQuestions: prev.planningQuestions.map(q =>
        q.id === questionId
          ? { ...q, selectedOptionId: 'other', otherValue }
          : q
      ),
    }));
  }, [state.planningQuestions, state.credentialFields, state.replanRound]);

  /**
   * Complete planning and move to credentials
   */
  const completePlanning = useCallback(() => {
    setState(prev => ({
      ...prev,
      showPlanningUI: false,
    }));
  }, []);

  /**
   * Show credentials UI
   */
  const showCredentials = useCallback((fields: DynamicCredentialField[]) => {
    setState(prev => ({
      ...prev,
      showCredentialsUI: true,
      credentialFields: fields,
    }));
  }, []);

  /**
   * Update a credential field
   */
  const updateCredentialField = useCallback((fieldId: string, value: string) => {
    setState(prev => ({
      ...prev,
      credentialFields: prev.credentialFields.map(f =>
        f.id === fieldId
          ? { ...f, value, isComplete: !!value }
          : f
      ),
    }));
  }, []);

  /**
   * Complete credentials and move to build
   */
  const completeCredentials = useCallback(() => {
    setState(prev => ({
      ...prev,
      showCredentialsUI: false,
      isStreaming: true,
    }));
  }, []);

  /**
   * Show deploy button after build
   */
  const showDeploy = useCallback(() => {
    setState(prev => ({
      ...prev,
      showDeployButton: true,
      isStreaming: false,
    }));
  }, []);

  /**
   * Start deployment
   */
  const startDeploy = useCallback((provider: string) => {
    setState(prev => ({
      ...prev,
      isDeploying: true,
      deployingProvider: provider,
    }));
  }, []);

  /**
   * Complete deployment
   */
  const completeDeploy = useCallback(() => {
    setState(prev => ({
      ...prev,
      isDeploying: false,
      deployingProvider: null,
    }));
  }, []);

  /**
   * Set preview URL after build
   */
  const setPreviewUrl = useCallback((url: string) => {
    setState(prev => ({
      ...prev,
      previewUrl: url,
    }));
  }, []);

  /**
   * Set preview ready state
   */
  const setPreviewReady = useCallback((ready: boolean) => {
    setState(prev => ({
      ...prev,
      previewReady: ready,
    }));
  }, []);

  /**
   * Soft reset — clears transient streaming flags but preserves accumulated
   * content (actions, thinking tokens, code blocks) as history. Used when
   * starting a new plan generation so the user doesn't lose the chat context.
   */
  const softReset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState(prev => ({
      ...prev,
      isAcknowledging: false,
      isStreaming: false,
      isDeploying: false,
      deployingProvider: null,
      thinking: {
        isActive: false,
        tokens: prev.thinking.tokens,
        isCollapsed: true,
      },
      actions: prev.actions.map(a => ({ ...a, isActive: false })),
      showPlanningUI: false,
      showCredentialsUI: false,
      showDeployButton: false,
    }));
  }, []);

  /**
   * Hard reset — clears all state AND localStorage. Only used for intentional
   * full session clear (e.g. user starts a completely new project).
   */
  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState(initialState);
    try {
      localStorage.removeItem(getStorageKey(projectId));
    } catch (e) {
      console.warn('[useStreamingChat] Failed to clear persisted state:', e);
    }
  }, [projectId]);

  return {
    state,
    sendInstantAcknowledge,
    appendThinkingToken,
    setThinkingActive,
    toggleThinkingCollapsed,
    addAction,
    updateActionActive,
    addCodeBlock,
    showPlanningQuestions,
    handlePlanningSelection,
    handleOtherSubmit,
    completePlanning,
    showCredentials,
    updateCredentialField,
    completeCredentials,
    showDeploy,
    startDeploy,
    completeDeploy,
    setPreviewUrl,
    setPreviewReady,
    softReset,
    reset,
  };
}

export default useStreamingChat;
