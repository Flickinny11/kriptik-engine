/**
 * search_web tool — Web search via Brave Search API.
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import { safeFetch } from './helpers.js';
import { SERVICES, TIMEOUTS } from '../../config/services.js';

export function createWebSearchTool(): ToolDefinition {
  return {
    name: 'search_web',
    description: 'Search the web for information. Use for: finding competitor URLs, discovering API documentation, researching technology choices, finding examples of UI patterns, or any question the brain can\'t answer.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        count: { type: 'number', description: 'Number of results to return (default 5, max 20)' },
      },
      required: ['query'],
    },
    execute: async (params) => {
      const apiKey = process.env[SERVICES.BRAVE_SEARCH.envKey];
      if (!apiKey) {
        return { error: 'BRAVE_SEARCH_API_KEY not set. Web search unavailable.' };
      }

      const query = params.query as string;
      const count = Math.min((params.count as number) ?? 5, 20);

      const url = `${SERVICES.BRAVE_SEARCH.endpoint}?q=${encodeURIComponent(query)}&count=${count}`;

      const result = await safeFetch(url, {
        headers: {
          'X-Subscription-Token': apiKey,
          'Accept': 'application/json',
        } as Record<string, string>,
        timeout: TIMEOUTS.WEB_FETCH,
      });

      if (!result.ok) {
        return {
          error: `Brave Search API error: HTTP ${result.status}`,
          detail: result.text.slice(0, 500),
        };
      }

      try {
        const data = JSON.parse(result.text) as {
          web?: { results?: Array<{ title: string; url: string; description: string; age?: string }> };
        };
        const results = (data.web?.results ?? []).map((r) => ({
          title: r.title,
          url: r.url,
          description: r.description,
          age: r.age,
        }));
        return { results, query, count: results.length };
      } catch {
        return { error: 'Could not parse Brave Search response', raw: result.text.slice(0, 1000) };
      }
    },
  };
}
