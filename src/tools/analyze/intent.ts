/**
 * analyze_intent tool — Deep intent extraction with inferred needs.
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import { createLLMJSON } from './helpers.js';
import type { ProviderRouter } from '../../providers/router.js';

export function createIntentTool(router: ProviderRouter): ToolDefinition {
  const llmJSON = createLLMJSON(router);

  return {
    name: 'analyze_intent',
    description: 'Deep intent extraction with inferred needs. Analyzes what the user asked for AND everything they didn\'t ask for but would expect. Determines scale intent (personal/commercial/internal). Returns explicit intents, inferred needs, scale assessment, complexity estimate, and critical unknowns.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The user prompt to analyze' },
        existing_context: { type: 'string', description: 'Any additional context from the brain' },
      },
      required: ['prompt'],
    },
    execute: async (params) => {
      const system = `You are analyzing a user's app request. Your job is to identify not just what they asked for, but everything they DIDN'T ask for that they would expect in a production app of this type. Think about it from the perspective of someone who would actually USE this app daily.

For example: if a user says "build an AI video generator app", they explicitly want video generation. But they ALSO need: a media player to watch generated videos, a download button, a share button, a generation queue with progress indicators, a library of previously generated videos, proper loading states during generation, error handling when generation fails, the ability to cancel in-progress generations, storage management, and format/resolution options. They need the prompt input to auto-resize. They need the generate button to show a loading state. They need thumbnail previews in the library.

Go deep. Think about every interaction, every state, every edge case, every UI element that a user would expect. Think about what happens when things go wrong — API timeouts, payment failures, upload size limits. Think about what the user sees when they first open the app with no data (empty states). Think about what power users would want after using the app for a month.

Also determine the user's SCALE INTENT:
- Is this a personal tool for themselves and maybe a few friends?
- Is this meant to compete commercially against existing products?
- Is this an internal business tool?

This changes everything about what needs to be built. A personal tool needs basic functionality. A commercial competitor needs feature parity with existing products PLUS differentiation, premium UI, onboarding flows, terms of service, analytics, SEO, and marketing pages.

Return a JSON object with this EXACT structure:
{
  "explicit_intents": [
    { "title": "...", "description": "...", "success_criteria": ["..."] }
  ],
  "inferred_needs": [
    { "title": "...", "description": "...", "reason": "why this is needed even though the user didn't ask", "success_criteria": ["..."], "priority": "critical|high|medium" }
  ],
  "scale_intent": {
    "assessment": "personal|commercial|internal",
    "reasoning": "...",
    "implications": ["what this means for the build"]
  },
  "estimated_complexity": {
    "level": "simple|moderate|complex|very_complex",
    "estimated_specialists": number,
    "key_challenges": ["..."],
    "risk_areas": ["..."]
  },
  "critical_unknowns": [
    { "question": "...", "why_it_matters": "...", "default_assumption": "what to assume if we can't get an answer" }
  ],
  "required_integrations": [
    { "service": "...", "purpose": "...", "needs_credentials": true/false, "documentation_url": "..." }
  ]
}

Be EXHAUSTIVE with inferred_needs. This is the most important part. A typical commercial app request should have 15-30 inferred needs.`;

      const userMsg = params.existing_context
        ? `User prompt: ${params.prompt}\n\nExisting brain context:\n${params.existing_context}`
        : `User prompt: ${params.prompt}`;

      const { parsed, raw, usage } = await llmJSON(system, userMsg);
      if (!parsed) return { error: 'Could not parse intent analysis', rawAnalysis: raw };
      return { analysis: parsed, tokensUsed: usage };
    },
  };
}
