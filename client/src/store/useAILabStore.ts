/**
 * AI Lab store — stub for Open Source Studio's AI Lab tab.
 * Will be expanded when AI Lab features are fully wired.
 */

import { create } from 'zustand';

interface AILabState {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}

export const useAILabStore = create<AILabState>((set) => ({
  isOpen: false,
  setOpen: (open) => set({ isOpen: open }),
}));
