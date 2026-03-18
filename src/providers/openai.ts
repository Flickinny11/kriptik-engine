/**
 * OpenAI provider — wraps the OpenAI SDK.
 * Translates LLMRequestOptions ↔ OpenAI Chat Completions API format.
 *
 * Notes (March 2026):
 * - GPT-5.4 is the latest flagship. GPT-4.1 and o4-mini are retired.
 * - The 'developer' role replaces 'system' for all models since o1.
 * - The Responses API is now primary, but Chat Completions is supported indefinitely.
 * - OpenAI SDK v6.x uses chat.completions.create() with max_completion_tokens.
 */

import OpenAI from 'openai';
import type { LLMProvider, LLMRequestOptions, LLMResponse, LLMContentBlock, LLMMessage } from './types.js';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;

  constructor(opts?: { apiKey?: string; baseURL?: string }) {
    this.client = new OpenAI({
      apiKey: opts?.apiKey || process.env.OPENAI_API_KEY,
      baseURL: opts?.baseURL,
    });
  }

  supports(model: string): boolean {
    return model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('chatgpt-');
  }

  pricing(model: string): { inputPer1M: number; outputPer1M: number } | null {
    // GPT-5.x series (March 2026 current)
    if (model.includes('gpt-5.4')) return { inputPer1M: 2.5, outputPer1M: 10 };
    if (model.includes('gpt-5.3')) return { inputPer1M: 2, outputPer1M: 8 };
    if (model.includes('gpt-5.2')) return { inputPer1M: 2, outputPer1M: 8 };
    // o-series reasoning
    if (model.includes('o3')) return { inputPer1M: 2, outputPer1M: 8 };
    if (model.includes('o1')) return { inputPer1M: 15, outputPer1M: 60 };
    return null;
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    // Build OpenAI messages — 'developer' role replaces 'system' for all modern models
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (options.system) {
      messages.push({ role: 'developer' as any, content: options.system });
    }

    for (const msg of options.messages) {
      messages.push(this.toOpenAIMessage(msg));
    }

    // Build tools
    const tools: OpenAI.ChatCompletionTool[] | undefined = options.tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    const params: OpenAI.ChatCompletionCreateParams = {
      model: options.model,
      messages,
      tools,
      max_completion_tokens: options.max_tokens ?? 16_384,
    };

    if (options.temperature !== undefined) {
      params.temperature = options.temperature;
    }

    // o-series reasoning models use reasoning_effort
    if (options.thinking_budget && (options.model.startsWith('o1') || options.model.startsWith('o3'))) {
      (params as any).reasoning_effort = options.thinking_budget > 8000 ? 'high' : options.thinking_budget > 3000 ? 'medium' : 'low';
    }

    const response = await this.client.chat.completions.create(params);
    const choice = response.choices[0];

    // Translate response
    const content: LLMContentBlock[] = [];

    if (choice.message.content) {
      content.push({ type: 'text', text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        if ('function' in tc) {
          let parsedArgs: Record<string, unknown> = {};
          try { parsedArgs = JSON.parse(tc.function.arguments); } catch {}
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: parsedArgs,
          });
        }
      }
    }

    const stopReason = choice.finish_reason === 'stop' ? 'end_turn'
      : choice.finish_reason === 'tool_calls' ? 'tool_use'
      : choice.finish_reason === 'length' ? 'max_tokens'
      : 'end_turn';

    return {
      content,
      stop_reason: stopReason,
      usage: {
        input_tokens: response.usage?.prompt_tokens ?? 0,
        output_tokens: response.usage?.completion_tokens ?? 0,
      },
      model: response.model,
    };
  }

  private toOpenAIMessage(msg: LLMMessage): OpenAI.ChatCompletionMessageParam {
    if (typeof msg.content === 'string') {
      if (msg.role === 'assistant') return { role: 'assistant', content: msg.content };
      return { role: 'user', content: msg.content };
    }

    // Handle assistant messages with tool_use blocks
    if (msg.role === 'assistant') {
      const textParts = msg.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
      const toolCalls = msg.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({
          id: b.id ?? '',
          type: 'function' as const,
          function: { name: b.name ?? '', arguments: JSON.stringify(b.input ?? {}) },
        }));
      return {
        role: 'assistant',
        content: textParts || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    }

    // Handle user messages with tool_result blocks
    if (msg.role === 'user') {
      const toolResults = msg.content.filter((b) => b.type === 'tool_result');
      if (toolResults.length > 0) {
        return {
          role: 'tool' as any,
          tool_call_id: toolResults[0].tool_use_id ?? '',
          content: toolResults[0].content ?? '',
        };
      }
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
      return { role: 'user', content: text };
    }

    return { role: 'user', content: JSON.stringify(msg.content) };
  }
}
