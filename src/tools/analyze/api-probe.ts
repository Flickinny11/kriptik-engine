/**
 * probe_api tool — Real API probing with live requests.
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import { safeFetch, createLLMJSON } from './helpers.js';
import type { ProviderRouter } from '../../providers/router.js';
import { TIMEOUTS } from '../../config/services.js';

export function createApiProbeTool(router: ProviderRouter): ToolDefinition {
  const llmJSON = createLLMJSON(router);

  return {
    name: 'probe_api',
    description: 'Probe a real API to discover its capabilities, constraints, rate limits, auth requirements, and response formats. Makes actual HTTP requests. If no credentials are provided, fetches public documentation and reports what it can learn.',
    input_schema: {
      type: 'object',
      properties: {
        base_url: { type: 'string', description: 'API base URL (e.g., "https://api.replicate.com/v1")' },
        documentation_url: { type: 'string', description: 'URL to the API documentation page' },
        auth_header: { type: 'string', description: 'Authorization header value (e.g., "Token r8_xxxxx" or "Bearer sk-xxxxx")' },
        endpoints_to_probe: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
              path: { type: 'string' },
              body: { type: 'object' },
            },
          },
          description: 'Specific endpoints to test',
        },
      },
      required: ['base_url'],
    },
    execute: async (params) => {
      const baseUrl = (params.base_url as string).replace(/\/+$/, '');
      const authHeader = params.auth_header as string | undefined;
      const docUrl = params.documentation_url as string | undefined;
      const endpointsToProbe = (params.endpoints_to_probe as Array<{ method: string; path: string; body?: Record<string, unknown> }>) ?? [];

      const probeResults: Record<string, unknown> = {
        base_url: baseUrl,
        probed_at: new Date().toISOString(),
      };

      // --- Fetch documentation if URL provided ---
      let docContent = '';
      if (docUrl) {
        const docResult = await safeFetch(docUrl, { timeout: TIMEOUTS.COMPETITOR_FETCH });
        if (docResult.ok) {
          // Strip HTML tags for readable text
          docContent = docResult.text
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 30_000);
          probeResults.documentation = {
            url: docUrl,
            fetched: true,
            length: docContent.length,
          };
        } else {
          probeResults.documentation = {
            url: docUrl,
            fetched: false,
            error: `HTTP ${docResult.status}`,
          };
        }
      }

      // --- Probe common discovery endpoints ---
      const discoveryPaths = [
        '/',
        '/health',
        '/v1',
        '/api',
        '/openapi.json',
        '/swagger.json',
        '/.well-known/openapi',
      ];

      const headers: Record<string, string> = {};
      if (authHeader) headers['Authorization'] = authHeader;

      const discoveryResults: Array<{
        path: string;
        status: number;
        contentType: string;
        rateLimitHeaders: Record<string, string>;
        snippet: string;
      }> = [];

      for (const path of discoveryPaths) {
        const result = await safeFetch(`${baseUrl}${path}`, {
          headers,
          timeout: TIMEOUTS.API_PROBE_DISCOVERY,
        });

        const rateLimitHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(result.headers)) {
          if (k.toLowerCase().includes('rate') || k.toLowerCase().includes('limit') ||
              k.toLowerCase().includes('remaining') || k.toLowerCase().includes('retry')) {
            rateLimitHeaders[k] = v;
          }
        }

        discoveryResults.push({
          path,
          status: result.status,
          contentType: result.headers['content-type'] ?? '',
          rateLimitHeaders,
          snippet: result.text.slice(0, 1000),
        });
      }

      probeResults.discovery = discoveryResults.filter((r) => r.status > 0);

      // --- Probe specific endpoints ---
      const endpointResults: Array<{
        method: string;
        path: string;
        status: number;
        rateLimitHeaders: Record<string, string>;
        responseFormat: string;
        snippet: string;
        error?: string;
      }> = [];

      for (const ep of endpointsToProbe) {
        const fetchOpts: RequestInit = {
          method: ep.method,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
        };
        if (ep.body && ep.method !== 'GET') {
          fetchOpts.body = JSON.stringify(ep.body);
        }

        const result = await safeFetch(`${baseUrl}${ep.path}`, {
          ...fetchOpts,
          timeout: TIMEOUTS.API_PROBE,
        });

        const rateLimitHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(result.headers)) {
          if (k.toLowerCase().includes('rate') || k.toLowerCase().includes('limit') ||
              k.toLowerCase().includes('remaining') || k.toLowerCase().includes('retry')) {
            rateLimitHeaders[k] = v;
          }
        }

        endpointResults.push({
          method: ep.method,
          path: ep.path,
          status: result.status,
          rateLimitHeaders,
          responseFormat: result.headers['content-type'] ?? 'unknown',
          snippet: result.text.slice(0, 2000),
        });
      }

      if (endpointResults.length > 0) {
        probeResults.endpoints = endpointResults;
      }

      // --- Synthesize findings with Claude ---
      const analysisInput = {
        base_url: baseUrl,
        has_auth: !!authHeader,
        discovery: probeResults.discovery,
        endpoints: endpointResults,
        documentation_excerpt: docContent.slice(0, 15_000),
      };

      try {
        const { parsed, usage } = await llmJSON(
          `You are an API analyst. Given probe results from a real API, extract structured constraints and capabilities.

Return JSON:
{
  "api_name": "...",
  "authentication": { "method": "...", "header_format": "...", "needs_signup": true/false },
  "rate_limits": { "requests_per_minute": number|null, "concurrent": number|null, "daily_limit": number|null, "details": "..." },
  "capabilities": ["list of what this API can do"],
  "request_format": { "content_type": "...", "example_body": {} },
  "response_format": { "content_type": "...", "example_structure": {} },
  "constraints": [
    { "type": "...", "description": "...", "severity": "blocking|limiting|informational" }
  ],
  "webhook_support": { "available": true/false, "details": "..." },
  "pricing": { "model": "...", "details": "..." },
  "error_format": { "structure": "...", "common_errors": ["..."] },
  "unverified_without_auth": ["things we couldn't check without credentials"]
}`,
          `API probe results:\n${JSON.stringify(analysisInput, null, 2)}`,
        );
        if (parsed) {
          probeResults.analysis = parsed;
          probeResults.tokensUsed = usage;
        }
      } catch {
        // If Claude synthesis fails, still return raw probe data
      }

      return probeResults;
    },
  };
}
