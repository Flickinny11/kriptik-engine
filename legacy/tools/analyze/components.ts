/**
 * map_components tool — Full component/page/route/model map from brain context.
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import { createLLMJSON } from './helpers.js';
import type { ProviderRouter } from '../../providers/router.js';

export function createComponentsTool(router: ProviderRouter): ToolDefinition {
  const llmJSON = createLLMJSON(router);

  return {
    name: 'map_components',
    description: 'Given brain context (intents, inferred needs, constraints, competitor analysis, design direction), produces a complete component map: every page, component, API route, database model, and integration needed. Each item traces back to the intent or inferred need it satisfies.',
    input_schema: {
      type: 'object',
      properties: {
        brain_context: {
          type: 'string',
          description: 'Serialized brain context: intents, inferred needs, constraints, discoveries, design direction. Get this by querying the brain for all relevant nodes.',
        },
      },
      required: ['brain_context'],
    },
    execute: async (params) => {
      const { parsed, raw, usage } = await llmJSON(
        `You are an application architect. Given comprehensive project context (intents, inferred needs, API constraints, competitor analysis, design direction), produce a COMPLETE component map for the application.

Every single thing that needs to be built should be listed. Nothing should be vague or hand-waved. If a page needs a loading state, list the loading component. If a form needs validation, describe the validation rules. If an API route needs error handling, describe the error cases.

Return JSON:
{
  "pages": [
    {
      "path": "/route/path",
      "title": "Page Name",
      "purpose": "why this page exists",
      "satisfies": ["intent or inferred need titles this page addresses"],
      "components": ["component names used on this page"],
      "data_requirements": ["what data this page needs"],
      "states": ["loading", "empty", "populated", "error"],
      "auth_required": true/false
    }
  ],
  "components": [
    {
      "name": "ComponentName",
      "purpose": "what it does",
      "satisfies": ["intent or inferred need titles"],
      "props": [{ "name": "...", "type": "...", "required": true/false }],
      "internal_state": ["state variables it manages"],
      "behaviors": ["what it does on interaction"],
      "error_states": ["what can go wrong and how it handles it"],
      "loading_states": ["what loading looks like"],
      "empty_states": ["what it looks like with no data"]
    }
  ],
  "api_routes": [
    {
      "method": "GET|POST|PUT|DELETE",
      "path": "/api/...",
      "purpose": "...",
      "satisfies": ["intent or inferred need titles"],
      "request_body": {},
      "response_shape": {},
      "error_responses": [{ "status": 400, "when": "..." }],
      "auth_required": true/false,
      "rate_limited": true/false
    }
  ],
  "database_models": [
    {
      "name": "ModelName",
      "purpose": "...",
      "fields": [{ "name": "...", "type": "...", "constraints": "..." }],
      "relationships": [{ "to": "OtherModel", "type": "one-to-many|many-to-many" }],
      "indexes": ["field combinations that need indexes"]
    }
  ],
  "integrations": [
    {
      "service": "...",
      "purpose": "...",
      "configuration_needed": ["env vars, API keys, etc."],
      "endpoints_used": ["which API endpoints we call"],
      "webhook_handlers": ["webhook endpoints we need to create"]
    }
  ],
  "state_management": {
    "global_state": ["what needs to be globally accessible"],
    "approach": "context|zustand|redux|etc.",
    "reasoning": "..."
  },
  "critical_interactions": [
    {
      "name": "User Flow Name",
      "satisfies": ["intent or inferred need titles"],
      "steps": [
        { "user_action": "...", "system_response": "...", "what_user_sees": "...", "behind_the_scenes": "..." }
      ]
    }
  ]
}

Be EXHAUSTIVE. Every component should trace back to an intent or inferred need. If a component doesn't satisfy any requirement, it shouldn't exist. If a requirement has no component, something is missing.`,
        `Project context from Brain:\n${params.brain_context}`,
      );

      if (!parsed) return { error: 'Could not parse component map', rawOutput: raw };
      return { componentMap: parsed, tokensUsed: usage };
    },
  };
}
