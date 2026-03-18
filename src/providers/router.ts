/**
 * Provider Router — given a model string, finds the right provider and calls it.
 */

import type { LLMProvider, LLMRequestOptions, LLMResponse } from './types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GoogleProvider } from './google.js';
import { XAIProvider } from './xai.js';

export class ProviderRouter {
  private providers: LLMProvider[] = [];

  constructor(opts?: {
    anthropicApiKey?: string;
    openaiApiKey?: string;
    googleApiKey?: string;
    xaiApiKey?: string;
  }) {
    const anthropicKey = opts?.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    const openaiKey = opts?.openaiApiKey ?? process.env.OPENAI_API_KEY;
    const xaiKey = opts?.xaiApiKey ?? process.env.XAI_API_KEY;

    if (anthropicKey) this.providers.push(new AnthropicProvider(anthropicKey));
    if (openaiKey) this.providers.push(new OpenAIProvider({ apiKey: openaiKey }));
    if (xaiKey) this.providers.push(new XAIProvider(xaiKey));

    // Google stub always available (will throw on use)
    this.providers.push(new GoogleProvider());
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    const provider = this.providers.find((p) => p.supports(options.model));
    if (!provider) {
      throw new Error(
        `No provider for model "${options.model}". Available: ${this.providers.map((p) => p.name).join(', ')}. Check API keys.`,
      );
    }
    return provider.complete(options);
  }

  pricing(model: string): { inputPer1M: number; outputPer1M: number } | null {
    const provider = this.providers.find((p) => p.supports(model));
    return provider?.pricing(model) ?? null;
  }

  listProviders(): Array<{ name: string }> {
    return this.providers.map((p) => ({ name: p.name }));
  }
}
