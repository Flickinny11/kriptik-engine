/**
 * LLM Provider interface — the contract all providers implement.
 * Translates between the engine's internal message format and
 * whatever API the provider uses. Dumb pipe, speaks multiple languages.
 */

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | LLMContentBlock[];
}

export interface LLMContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'image';
  // text
  text?: string;
  // thinking (Anthropic-specific, other providers may omit)
  thinking?: string;
  // tool_use
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  // tool_result
  tool_use_id?: string;
  content?: string;
  // image (base64-encoded)
  source?: { type: 'base64'; media_type: string; data: string };
}

export interface LLMTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMResponse {
  content: LLMContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  model: string;
}

export interface LLMRequestOptions {
  model: string;
  messages: LLMMessage[];
  system?: string;
  tools?: LLMTool[];
  max_tokens?: number;
  thinking_budget?: number;
  temperature?: number;
}

export interface LLMProvider {
  name: string;
  complete(options: LLMRequestOptions): Promise<LLMResponse>;
  supports(model: string): boolean;
  pricing(model: string): { inputPer1M: number; outputPer1M: number } | null;
}
