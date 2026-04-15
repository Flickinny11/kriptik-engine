/**
 * ExperienceExtractor — post-build learning extraction.
 *
 * After a build completes, this analyses the project's Brain contents
 * using an LLM and extracts structured learnings that get written
 * to the global experience memory. The LLM decides what's worth
 * remembering — no hardcoded rules about what constitutes a learning.
 */

import { v4 as uuid } from 'uuid';
import type { BrainService } from './brain-service.js';
import type { GlobalMemoryService } from './global-memory.js';
import type { ProviderRouter } from '../providers/router.js';
import type { ExperienceNode, BrainNode } from '../types/index.js';

const EXTRACTION_MODEL = 'claude-sonnet-4-20250514';

interface ExtractedLearning {
  experienceType: string;
  title: string;
  content: Record<string, unknown>;
  confidence: number;
  frameworks: string[];
  integrations: string[];
  appType: string;
  complexity: string;
  errorCategories: string[];
}

export class ExperienceExtractor {
  private brain: BrainService;
  private globalMemory: GlobalMemoryService;
  private router: ProviderRouter;

  constructor(opts: {
    brain: BrainService;
    globalMemory: GlobalMemoryService;
    router: ProviderRouter;
  }) {
    this.brain = opts.brain;
    this.globalMemory = opts.globalMemory;
    this.router = opts.router;
  }

  /**
   * Extract learnings from a completed build and write them to global memory.
   * Returns the list of experience nodes created.
   */
  async extractAndStore(projectId: string): Promise<ExperienceNode[]> {
    // Gather build data from the project's Brain
    const buildData = this.gatherBuildData(projectId);

    // If there's very little data, skip extraction
    if (buildData.totalNodes < 5) return [];

    // Send to LLM for reflection
    const learnings = await this.reflectOnBuild(buildData);

    // Write each learning as an ExperienceNode
    const experiences: ExperienceNode[] = [];
    for (const learning of learnings) {
      const experience: ExperienceNode = {
        id: uuid(),
        projectId,
        buildTimestamp: new Date().toISOString(),
        experienceType: learning.experienceType,
        title: learning.title,
        content: learning.content,
        context: {
          frameworks: learning.frameworks,
          integrations: learning.integrations,
          appType: learning.appType,
          complexity: learning.complexity,
          errorCategories: learning.errorCategories,
        },
        strength: Math.max(0.1, Math.min(0.9, learning.confidence)),
        activationCount: 0,
        lastActivated: '',
        reinforcements: 0,
        contradictions: 0,
        sourceNodes: [],
      };

      await this.globalMemory.writeExperience(experience);
      experiences.push(experience);
    }

    return experiences;
  }

  private gatherBuildData(projectId: string): {
    totalNodes: number;
    intents: BrainNode[];
    discoveries: BrainNode[];
    constraints: BrainNode[];
    errors: BrainNode[];
    artifacts: BrainNode[];
    userDirectives: BrainNode[];
    decisions: BrainNode[];
    resolutions: BrainNode[];
  } {
    const intents = this.brain.getNodesByType(projectId, 'intent');
    const discoveries = this.brain.getNodesByType(projectId, 'discovery');
    const constraints = this.brain.getNodesByType(projectId, 'constraint');
    const errors = this.brain.getNodesByType(projectId, 'error');
    const artifacts = this.brain.getNodesByType(projectId, 'artifact');
    const userDirectives = this.brain.getNodesByType(projectId, 'user_directive');
    const decisions = this.brain.getNodesByType(projectId, 'decision');
    const resolutions = this.brain.getNodesByType(projectId, 'resolution');

    const totalNodes =
      intents.length +
      discoveries.length +
      constraints.length +
      errors.length +
      artifacts.length +
      userDirectives.length +
      decisions.length +
      resolutions.length;

    return {
      totalNodes,
      intents,
      discoveries,
      constraints,
      errors,
      artifacts,
      userDirectives,
      decisions,
      resolutions,
    };
  }

  private async reflectOnBuild(buildData: ReturnType<typeof this.gatherBuildData>): Promise<ExtractedLearning[]> {
    // Serialize build data for the LLM — keep it concise
    const summary = this.serializeBuildData(buildData);

    const response = await this.router.complete({
      model: EXTRACTION_MODEL,
      messages: [
        {
          role: 'user',
          content: summary,
        },
      ],
      system: EXTRACTION_PROMPT,
      max_tokens: 8192,
      temperature: 0.3,
    });

    // Extract JSON from response
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent?.text) return [];

    try {
      // Find JSON array in the response
      const jsonMatch = textContent.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]) as ExtractedLearning[];

      // Validate and filter
      return parsed.filter(
        (l) =>
          l.experienceType &&
          l.title &&
          l.content &&
          typeof l.confidence === 'number' &&
          l.confidence > 0,
      );
    } catch {
      return [];
    }
  }

  private serializeBuildData(data: ReturnType<typeof this.gatherBuildData>): string {
    const sections: string[] = [];

    if (data.intents.length > 0) {
      sections.push(
        '## User Intents\n' +
          data.intents
            .map((n) => `- ${n.title}: ${JSON.stringify(n.content)}`)
            .join('\n'),
      );
    }

    if (data.discoveries.length > 0) {
      sections.push(
        '## Discoveries Made During Build\n' +
          data.discoveries
            .slice(0, 30) // Cap to prevent prompt explosion
            .map((n) => `- ${n.title}: ${JSON.stringify(n.content)}`)
            .join('\n'),
      );
    }

    if (data.constraints.length > 0) {
      // Filter out template constraints (they're always the same)
      const nonTemplate = data.constraints.filter(
        (n) => n.createdBy !== 'template_seeder',
      );
      if (nonTemplate.length > 0) {
        sections.push(
          '## Runtime Constraints Discovered\n' +
            nonTemplate
              .map((n) => `- ${n.title}: ${JSON.stringify(n.content)}`)
              .join('\n'),
        );
      }
    }

    if (data.errors.length > 0) {
      sections.push(
        '## Errors Encountered\n' +
          data.errors
            .slice(0, 20)
            .map((n) => `- ${n.title} [${n.status}]: ${JSON.stringify(n.content)}`)
            .join('\n'),
      );
    }

    if (data.resolutions.length > 0) {
      sections.push(
        '## Error Resolutions\n' +
          data.resolutions
            .slice(0, 20)
            .map((n) => `- ${n.title}: ${JSON.stringify(n.content)}`)
            .join('\n'),
      );
    }

    if (data.artifacts.length > 0) {
      sections.push(
        '## Artifacts Produced\n' +
          data.artifacts
            .slice(0, 20)
            .map((n) => `- ${n.title}`)
            .join('\n'),
      );
    }

    if (data.userDirectives.length > 0) {
      sections.push(
        '## User Corrections/Directives\n' +
          data.userDirectives
            .map((n) => `- ${n.title}: ${JSON.stringify(n.content)}`)
            .join('\n'),
      );
    }

    if (data.decisions.length > 0) {
      sections.push(
        '## Key Decisions\n' +
          data.decisions
            .slice(0, 20)
            .map((n) => `- ${n.title}: ${JSON.stringify(n.content)}`)
            .join('\n'),
      );
    }

    return sections.join('\n\n');
  }
}

const EXTRACTION_PROMPT = `You are a build analysis system for KripTik AI, an autonomous app builder. You've been given data from a completed build — intents, discoveries, errors, resolutions, artifacts, user corrections, and decisions.

Your job is to extract genuinely useful learnings that would help FUTURE builds. Not everything is worth remembering. Focus on:

1. **Pattern successes** — approaches that worked well and why
2. **Pattern failures** — approaches that failed and what the fix was
3. **Recovery patterns** — how specific errors were diagnosed and resolved
4. **User preferences** — what the user corrected, indicating their preferences
5. **Tool effectiveness** — which tools/approaches were effective for which tasks
6. **Design decisions** — design approaches and their outcomes
7. **Integration insights** — gotchas, auth patterns, rate limits for specific services
8. **Discovery confirmations** — runtime discoveries that were significant

For each learning, assess your confidence that this is a genuinely reusable insight (0.1 to 0.9). A learning that's very specific to one project should have low confidence. A learning that applies broadly should have high confidence.

Return a JSON array of learnings. Each learning must have this exact structure:

[
  {
    "experienceType": "pattern_success" | "pattern_failure" | "recovery" | "user_preference" | "tool_effectiveness" | "design_decision" | "integration_insight" | "discovery",
    "title": "concise human-readable summary",
    "content": {
      "description": "detailed explanation of the learning",
      "context": "when this applies",
      "recommendation": "what to do differently or the same",
      "userIntent": "what the user was trying to accomplish (if relevant)"
    },
    "confidence": 0.1 to 0.9,
    "frameworks": ["react", "next.js", ...],
    "integrations": ["stripe", "supabase", ...],
    "appType": "e-commerce" | "dashboard" | "social" | "productivity" | "portfolio" | "saas" | "game" | "ai-tool" | "other",
    "complexity": "simple" | "moderate" | "complex",
    "errorCategories": ["typescript", "runtime", "build", "styling", ...]
  }
]

Rules:
- Only extract genuinely useful learnings. If nothing is worth remembering, return an empty array [].
- Include enough context that the learning is useful without the original build.
- Do not extract trivial observations ("the build used React" is not a learning).
- Focus on things that would change behavior in a future build.
- The frameworks, integrations, and appType fields should reflect what was ACTUALLY used, not guessed.
- Return ONLY the JSON array, no other text.`;
