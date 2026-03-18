/**
 * Shared helpers for analyze tools — JSON extraction, safe fetch, LLM JSON wrapper.
 */

import { ProviderRouter } from '../../providers/router.js';
import { MODELS, THINKING, CONTEXT } from '../../config/models.js';

// --- Helper: extract JSON from LLM response ---

export function extractJSON(text: string): unknown {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (match) {
    try { return JSON.parse(match[1]); } catch {}
  }
  const braceMatch = text.match(/(\{[\s\S]*\})/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[1]); } catch {}
  }
  return null;
}

// --- Helper: safe fetch with timeout ---

export async function safeFetch(
  url: string,
  opts: RequestInit & { timeout?: number } = {},
): Promise<{ ok: boolean; status: number; headers: Record<string, string>; text: string }> {
  const timeout = opts.timeout ?? 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: {
        'User-Agent': 'KripTik-Engine/1.0 (API Probe)',
        ...opts.headers,
      },
    });
    const text = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return { ok: res.ok, status: res.status, headers, text: text.slice(0, 50_000) };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      headers: {},
      text: `Fetch error: ${err.message ?? String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

// --- LLM JSON helper (provider-agnostic) ---

export function createLLMJSON(router: ProviderRouter) {
  return async function llmJSON(
    system: string,
    userMessage: string,
    maxTokens = CONTEXT.MAX_OUTPUT_TOKENS,
  ): Promise<{ parsed: unknown; raw: string; usage: { input_tokens: number; output_tokens: number } }> {
    const response = await router.complete({
      model: MODELS.ANALYSIS,
      max_tokens: maxTokens,
      thinking_budget: THINKING.ANALYSIS_BUDGET,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });
    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    const parsed = extractJSON(raw);
    return { parsed, raw, usage: response.usage };
  };
}
