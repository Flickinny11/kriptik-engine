/**
 * xAI (Grok) provider — uses OpenAI-compatible API with different base URL.
 *
 * Notes (March 2026):
 * - Grok 4.20 Beta is the newest flagship ($2/$6 per 1M, 2M context).
 * - Grok 4 is the standard flagship ($3/$15 per 1M).
 * - Grok 4.1 Fast is the cost-optimized model ($0.20/M input, 2M context).
 * - Grok 3/3 Mini are legacy.
 * - All models support tool calling.
 * - Reasoning can be enabled/disabled on 4.20 and 4.1 Fast reasoning variants.
 */

import { OpenAIProvider } from './openai.js';
import type { LLMProvider, LLMRequestOptions, LLMResponse } from './types.js';

export class XAIProvider implements LLMProvider {
  name = 'xai';
  private inner: OpenAIProvider;

  constructor(apiKey?: string) {
    this.inner = new OpenAIProvider({
      apiKey: apiKey || process.env.XAI_API_KEY,
      baseURL: 'https://api.x.ai/v1',
    });
  }

  supports(model: string): boolean {
    return model.startsWith('grok-');
  }

  pricing(model: string): { inputPer1M: number; outputPer1M: number } | null {
    if (model.includes('grok-4.20')) return { inputPer1M: 2, outputPer1M: 6 };
    if (model.includes('grok-4.1-fast')) return { inputPer1M: 0.2, outputPer1M: 1 };
    if (model.includes('grok-4')) return { inputPer1M: 3, outputPer1M: 15 };
    if (model.includes('grok-3-mini')) return { inputPer1M: 0.3, outputPer1M: 0.5 };
    if (model.includes('grok-3')) return { inputPer1M: 3, outputPer1M: 15 };
    return null;
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    return this.inner.complete(options);
  }
}
