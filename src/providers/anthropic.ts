/**
 * Anthropic provider — wraps the Anthropic SDK.
 * Translates LLMRequestOptions ↔ Anthropic API format.
 *
 * Notes (March 2026):
 * - claude-opus-4-6 and claude-sonnet-4-6 support adaptive thinking
 *   (Claude decides how much reasoning to use). Use type: 'enabled' without
 *   explicit budget for these models.
 * - Older dated models (claude-opus-4-20250514, etc.) need explicit budget_tokens.
 * - 1M context window available for Opus 4.6 and Sonnet 4.6.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMRequestOptions, LLMResponse, LLMContentBlock, LLMMessage, LLMTool } from './types.js';

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
  }

  supports(model: string): boolean {
    return model.startsWith('claude-');
  }

  pricing(model: string): { inputPer1M: number; outputPer1M: number } | null {
    if (model.includes('opus')) return { inputPer1M: 15, outputPer1M: 75 };
    if (model.includes('sonnet')) return { inputPer1M: 3, outputPer1M: 15 };
    if (model.includes('haiku')) return { inputPer1M: 1, outputPer1M: 5 };
    return null;
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    // Translate messages — Anthropic doesn't want system messages in the array
    const messages: Anthropic.MessageParam[] = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => this.toAnthropicMessage(m));

    // Translate tools
    const tools: Anthropic.Tool[] | undefined = options.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    }));

    // Build request
    const params: Anthropic.MessageCreateParams = {
      model: options.model,
      max_tokens: options.max_tokens ?? 16_384,
      system: options.system,
      messages,
      tools,
    };

    // Add thinking — adaptive for 4.6 models, explicit budget for older dated models
    if (options.thinking_budget && options.thinking_budget > 0) {
      const isAdaptiveModel = /claude-(opus|sonnet)-4-6/.test(options.model);
      if (isAdaptiveModel) {
        // 4.6 models use adaptive thinking — Claude decides reasoning depth
        (params as any).thinking = { type: 'enabled' };
      } else {
        // Older dated models need explicit budget
        (params as any).thinking = {
          type: 'enabled',
          budget_tokens: options.thinking_budget,
        };
      }
    }

    if (options.temperature !== undefined) {
      params.temperature = options.temperature;
    }

    const response = await this.client.messages.create(params);

    // Translate response
    const content: LLMContentBlock[] = response.content.map((block) => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: block.text };
      }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use' as const,
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        };
      }
      if (block.type === 'thinking') {
        return { type: 'thinking' as const, thinking: (block as any).thinking };
      }
      // Unknown block type — pass as text
      return { type: 'text' as const, text: JSON.stringify(block) };
    });

    const stopReason = response.stop_reason === 'end_turn' ? 'end_turn'
      : response.stop_reason === 'tool_use' ? 'tool_use'
      : response.stop_reason === 'max_tokens' ? 'max_tokens'
      : 'end_turn';

    return {
      content,
      stop_reason: stopReason,
      usage: {
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
      },
      model: options.model,
    };
  }

  private toAnthropicMessage(msg: LLMMessage): Anthropic.MessageParam {
    if (typeof msg.content === 'string') {
      return { role: msg.role as 'user' | 'assistant', content: msg.content };
    }

    // Array of content blocks
    const blocks: Anthropic.ContentBlockParam[] = msg.content.map((b) => {
      if (b.type === 'text') {
        return { type: 'text', text: b.text ?? '' } as Anthropic.TextBlockParam;
      }
      if (b.type === 'tool_use') {
        return {
          type: 'tool_use',
          id: b.id ?? '',
          name: b.name ?? '',
          input: b.input ?? {},
        } as Anthropic.ToolUseBlockParam;
      }
      if (b.type === 'tool_result') {
        return {
          type: 'tool_result',
          tool_use_id: b.tool_use_id ?? '',
          content: b.content ?? '',
        } as Anthropic.ToolResultBlockParam;
      }
      if (b.type === 'thinking') {
        return {
          type: 'thinking',
          thinking: b.thinking ?? '',
          signature: '',
        } as any;
      }
      return { type: 'text', text: JSON.stringify(b) } as Anthropic.TextBlockParam;
    });

    return { role: msg.role as 'user' | 'assistant', content: blocks };
  }
}
