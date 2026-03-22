/**
 * React Hook for Speculative Input
 *
 * Provides reactive state management for speculative input processing.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getSpeculativeInput,
  type IntentPrediction,
  type PlanFragment,
  type SpeculativeInputState,
} from '../services/speculative-input';

interface UseSpeculativeInputReturn {
  processInput: (input: string) => void;
  handlePlanningSelection: (selection: {
    category: string;
    value: string;
    isOther: boolean;
    otherText?: string;
  }) => void;
  predictions: IntentPrediction[];
  planFragments: PlanFragment[];
  isPrimed: boolean;
  isProcessing: boolean;
  clear: () => void;
}

/**
 * React hook for speculative input processing
 */
export function useSpeculativeInput(): UseSpeculativeInputReturn {
  const [state, setState] = useState<SpeculativeInputState>({
    isProcessing: false,
    lastInput: '',
    predictions: [],
    planFragments: [],
    primeStatus: 'idle',
  });

  const service = getSpeculativeInput();

  // Subscribe to service state changes
  useEffect(() => {
    const handlePredictionReady = (data: { predictions: IntentPrediction[] }) => {
      setState((prev) => ({
        ...prev,
        predictions: data.predictions,
        primeStatus: 'ready',
        isProcessing: false,
      }));
    };

    const handlePlanUpdated = (data: { fragments: PlanFragment[] }) => {
      setState((prev) => ({
        ...prev,
        planFragments: data.fragments,
      }));
    };

    const handleProcessingStarted = () => {
      setState((prev) => ({
        ...prev,
        isProcessing: true,
        primeStatus: 'priming',
      }));
    };

    const handleProcessingFailed = () => {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        primeStatus: 'idle',
      }));
    };

    const handleStateCleared = () => {
      setState({
        isProcessing: false,
        lastInput: '',
        predictions: [],
        planFragments: [],
        primeStatus: 'idle',
      });
    };

    // Subscribe to events
    service.on('prediction:ready', handlePredictionReady);
    service.on('plan:updated', handlePlanUpdated);
    service.on('processing:started', handleProcessingStarted);
    service.on('processing:failed', handleProcessingFailed);
    service.on('state:cleared', handleStateCleared);

    // Initial state sync
    const currentState = service.getState();
    setState(currentState);

    // Cleanup
    return () => {
      service.off('prediction:ready', handlePredictionReady);
      service.off('plan:updated', handlePlanUpdated);
      service.off('processing:started', handleProcessingStarted);
      service.off('processing:failed', handleProcessingFailed);
      service.off('state:cleared', handleStateCleared);
    };
  }, [service]);

  const processInput = useCallback(
    (input: string) => {
      service.processInput(input);
    },
    [service]
  );

  const handlePlanningSelection = useCallback(
    (selection: {
      category: string;
      value: string;
      isOther: boolean;
      otherText?: string;
    }) => {
      service.handlePlanningSelection(selection);
    },
    [service]
  );

  const clear = useCallback(() => {
    service.clear();
  }, [service]);

  return {
    processInput,
    handlePlanningSelection,
    predictions: state.predictions,
    planFragments: state.planFragments,
    isPrimed: state.primeStatus === 'ready',
    isProcessing: state.isProcessing,
    clear,
  };
}

export default useSpeculativeInput;
