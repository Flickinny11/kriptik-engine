/**
 * Golden window formation sequence builder.
 *
 * Constructs the initial message history that puts an agent into its peak
 * cognitive state — the "golden window" where system prompt, plan, and
 * architectural intent are all at peak attention weight.
 *
 * Spec Section 5.2 — Golden Window Management.
 * Spec Section 5.4 — Eight-step formation sequence.
 */

import type { IGoldenWindowSequence } from "@kriptik/shared-interfaces";

/** A message in the Anthropic conversation format. */
export interface ConversationMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/**
 * Build the system prompt from the golden window sequence.
 *
 * The system prompt contains the agent's identity, behavioral rules,
 * and non-negotiable constraints. This is the "baked-in operating context"
 * from spec Section 5.2, Mechanism 3.
 */
export function buildSystemPrompt(sequence: IGoldenWindowSequence): string {
  return sequence.systemPrompt;
}

/**
 * Build the initial conversation messages from the golden window sequence.
 *
 * The golden window is delivered as a structured user→assistant exchange
 * that establishes the agent's full context before it begins autonomous work.
 * This is NOT a series of instructions — it's the formation of the cognitive
 * state the agent needs to operate at peak quality.
 *
 * Spec Section 5.4 — Steps 2-8 of the formation sequence:
 * 2. Project structure
 * 3. Plan with progress
 * 4. Architectural blueprint
 * 5. Relevant code files
 * 6. Experiential trails
 * 7. Departing agent's state (rotation only)
 * 8. Anti-pattern alerts
 */
export function buildInitialMessages(
  sequence: IGoldenWindowSequence,
): ConversationMessage[] {
  const messages: ConversationMessage[] = [];

  // Step 2: Project structure
  messages.push({
    role: "user",
    content: formatSection(
      "Project Structure",
      "Current state of the codebase from the integration branch.",
      sequence.projectStructure,
    ),
  });
  messages.push({
    role: "assistant",
    content:
      "I've reviewed the project structure. I understand the current state of the codebase and how files are organized. Ready for the plan and architectural context.",
  });

  // Step 3: Plan with progress
  messages.push({
    role: "user",
    content: formatSection(
      "Build Plan & Progress",
      "Completed items are checked. Your current goal is highlighted. Remaining goals are listed.",
      sequence.planWithProgress,
    ),
  });
  messages.push({
    role: "assistant",
    content:
      "I understand the build plan, what's been completed, and what my goal is. I can see how my work fits into the larger dependency graph. Ready for the architectural blueprint.",
  });

  // Step 4: Architectural blueprint
  messages.push({
    role: "user",
    content: formatSection(
      "Architectural Blueprint",
      "The current architectural blueprint. This defines interface contracts, data flow paths, code style, and module boundaries.",
      sequence.architecturalBlueprint,
    ),
  });
  messages.push({
    role: "assistant",
    content:
      "I've internalized the architectural blueprint. I understand the interface contracts, module boundaries, and code style requirements. My implementation will conform to this blueprint.",
  });

  // Step 5: Relevant code files
  if (sequence.relevantCode.length > 0) {
    const codeContent = sequence.relevantCode
      .map(
        (ctx) =>
          `### ${ctx.path}\n**Relevance:** ${ctx.relevance}\n\`\`\`\n${ctx.content}\n\`\`\``,
      )
      .join("\n\n");

    messages.push({
      role: "user",
      content: formatSection(
        "Relevant Code",
        "Code files relevant to your current goal and upcoming work.",
        codeContent,
      ),
    });
    messages.push({
      role: "assistant",
      content:
        "I've reviewed all relevant code files and understand the existing patterns, implementations, and interfaces I need to work with.",
    });
  }

  // Step 6: Experiential trails
  if (sequence.trails.length > 0) {
    const trailContent = sequence.trails
      .map((trail, i) => `### Trail ${i + 1}\n${trail}`)
      .join("\n\n");

    messages.push({
      role: "user",
      content: formatSection(
        "Experiential Trails",
        "Relevant experience from past builds. These contain decisions, dead ends, and solutions that inform your approach.",
        trailContent,
      ),
    });
    messages.push({
      role: "assistant",
      content:
        "I've absorbed the experiential trails. I'll leverage these past insights — adopting proven approaches and avoiding documented dead ends.",
    });
  }

  // Step 7: Departing agent's state (rotation only)
  if (sequence.departingAgentState) {
    const state = sequence.departingAgentState;
    const stateContent = [
      `**Modified Files:** ${state.modifiedFiles.join(", ") || "None"}`,
      `**Goal Progress:** ${state.goalProgress}`,
      state.activePeerNegotiations.length > 0
        ? `**Active Peer Negotiations:**\n${state.activePeerNegotiations.map((n) => `- ${n}`).join("\n")}`
        : "",
      state.decisions.length > 0
        ? `**Decisions Made:**\n${state.decisions.map((d) => `- ${d}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    messages.push({
      role: "user",
      content: formatSection(
        "Predecessor Agent State",
        "You are replacing a rotated agent. Here is their state at the time of rotation.",
        stateContent,
      ),
    });
    messages.push({
      role: "assistant",
      content:
        "I understand my predecessor's progress, decisions, and any pending negotiations. I'll continue from where they left off without redoing completed work.",
    });
  }

  // Step 8: Anti-pattern alerts
  if (sequence.antiPatternAlerts.length > 0) {
    const alertContent = sequence.antiPatternAlerts
      .map((alert, i) => `${i + 1}. ${alert}`)
      .join("\n");

    messages.push({
      role: "user",
      content: formatSection(
        "Anti-Pattern Alerts",
        "Known pitfalls for this type of work. Avoid these patterns.",
        alertContent,
      ),
    });
    messages.push({
      role: "assistant",
      content:
        "Noted. I'll actively avoid these anti-patterns during implementation. Ready to begin autonomous work on my assigned goal.",
    });
  }

  return messages;
}

/**
 * Build the post-compaction re-injection messages.
 *
 * When compaction fires, the golden window's behavioral rules and anchored
 * state must be re-injected to restore peak cognitive state.
 *
 * Spec Section 5.2, Mechanism 3 — Goal re-injection hooks.
 * "Compaction preserves the code but loses the rules."
 */
export function buildReinjectionMessages(
  systemPromptSummary: string,
  anchoredState: {
    intent: string;
    changes: string;
    decisions: string;
    nextSteps: string;
  },
): ConversationMessage[] {
  const stateContent = [
    `**Intent:** ${anchoredState.intent}`,
    `**Changes:** ${anchoredState.changes}`,
    `**Decisions:** ${anchoredState.decisions}`,
    `**Next Steps:** ${anchoredState.nextSteps}`,
  ].join("\n\n");

  return [
    {
      role: "user",
      content: formatSection(
        "Context Restored After Compaction",
        "Your conversation was compacted to manage context length. Here are your operating rules and current state.",
        `## Operating Rules\n${systemPromptSummary}\n\n## Current State\n${stateContent}`,
      ),
    },
    {
      role: "assistant",
      content:
        "I've re-internalized my operating rules and current state after compaction. My goal, progress, decisions, and next steps are clear. Continuing work.",
    },
  ];
}

/** Format a golden window section with a header and description. */
function formatSection(
  title: string,
  description: string,
  content: string,
): string {
  return `# ${title}\n\n${description}\n\n---\n\n${content}`;
}
