/**
 * Google (Gemini) provider — stub.
 * Interface in place, implementation pending.
 *
 * Notes (March 2026):
 * - Gemini 3.1 Pro Preview is the latest flagship.
 * - Gemini 3.1 Flash-Lite is the cost-optimized model.
 * - Gemini 3 Flash Preview is the fast frontier model.
 * - Gemini 2.x models are being retired (2.0 Flash/Lite retire June 1, 2026).
 * - Gemini 3 series uses dynamic thinking by default.
 */

import type { LLMProvider, LLMRequestOptions, LLMResponse } from './types.js';

export class GoogleProvider implements LLMProvider {
  name = 'google';

  supports(model: string): boolean {
    return model.startsWith('gemini-');
  }

  pricing(model: string): { inputPer1M: number; outputPer1M: number } | null {
    // Gemini 3.1 series (March 2026 current)
    if (model.includes('3.1-pro')) return { inputPer1M: 1.25, outputPer1M: 10 };
    if (model.includes('3.1-flash-lite')) return { inputPer1M: 0.25, outputPer1M: 1.5 };
    if (model.includes('3.1-flash')) return { inputPer1M: 0.5, outputPer1M: 2 };
    // Gemini 3 series
    if (model.includes('3-pro')) return { inputPer1M: 1.25, outputPer1M: 10 };
    if (model.includes('3-flash')) return { inputPer1M: 0.5, outputPer1M: 2 };
    return null;
  }

  async complete(_options: LLMRequestOptions): Promise<LLMResponse> {
    throw new Error('Google provider not yet implemented. Install @google/generative-ai and implement translation.');
  }
}
