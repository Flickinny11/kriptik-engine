import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api-client';

export interface Speculation {
  appType: string;
  confidence: number;
  suggestedStack: {
    framework: string;
    styling: string;
    database: string | null;
    auth: string | null;
    apis: string[];
  };
  estimatedComponents: string[];
  estimatedComplexity: string;
  keyConsiderations: string[];
  suggestedQuestions: string[];
  rawAnalysis?: string;
}

interface SpeculationState {
  speculation: Speculation | null;
  isAnalyzing: boolean;
  error: string | null;
}

/**
 * Real-time speculative analysis of the user's prompt.
 *
 * Debounces input (2 seconds after last keystroke), then calls
 * the AI speculation endpoint. The result shows what kind of app
 * the user is likely building, suggested stack, key components, etc.
 *
 * This is REAL AI inference via Claude Haiku — not regex or pattern matching.
 */
export function useSpeculation(promptText: string, projectId: string | null) {
  const [state, setState] = useState<SpeculationState>({
    speculation: null,
    isAnalyzing: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Don't analyze very short prompts
    if (!promptText || promptText.trim().length < 15 || !projectId) {
      setState(prev => ({ ...prev, isAnalyzing: false }));
      return;
    }

    setState(prev => ({ ...prev, isAnalyzing: true }));

    // Debounce: wait 2 seconds after last keystroke
    const timer = setTimeout(async () => {
      // Cancel any in-flight request
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      try {
        const result = await apiClient.speculate(promptText.trim(), projectId);
        if (result.speculation) {
          setState({
            speculation: result.speculation as Speculation,
            isAnalyzing: false,
            error: null,
          });
        } else {
          setState(prev => ({
            ...prev,
            isAnalyzing: false,
            error: result.reason || null,
          }));
        }
      } catch {
        setState(prev => ({ ...prev, isAnalyzing: false }));
      }
    }, 2000);

    return () => {
      clearTimeout(timer);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [promptText, projectId]);

  return state;
}
