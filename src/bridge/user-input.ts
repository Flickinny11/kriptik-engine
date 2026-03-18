/**
 * User Input Handler — receives directives and responses from the UI,
 * writes them to the Brain so agents can pick them up.
 *
 * Two types of input:
 * 1. Free-form directives: "Change the color scheme to dark mode"
 *    → Written as user_directive nodes. The Lead Agent picks these up
 *    on its next Brain read cycle and adjusts the plan.
 *
 * 2. Structured responses to agent questions: When the Lead Agent
 *    uses request_user_input, it creates a user_directive node with
 *    awaitingResponse: true. The user's answer is written as a new
 *    node linked to the question node.
 */

import type { BrainService } from '../brain/brain-service.js';

export class UserInputHandler {
  private brain: BrainService;
  private projectId: string;

  constructor(brain: BrainService, projectId: string) {
    this.brain = brain;
    this.projectId = projectId;
  }

  /**
   * Handle a free-form directive from the user.
   * Creates a user_directive node in the Brain.
   */
  async sendDirective(text: string): Promise<string> {
    const node = await this.brain.writeNode(
      this.projectId,
      'user_directive',
      `User directive: ${text.slice(0, 100)}`,
      {
        directive: text,
        source: 'ui',
        type: 'directive',
      },
      'user',
    );
    return node.id;
  }

  /**
   * Handle a user response to a question from the Lead Agent.
   * Writes the answer as a new node linked to the question node.
   */
  async respondToQuestion(questionNodeId: string, answer: string): Promise<string> {
    // Verify the question node exists
    const questionNode = this.brain.getNode(questionNodeId);
    if (!questionNode) {
      throw new Error(`Question node ${questionNodeId} not found`);
    }

    // Write the answer
    const answerNode = await this.brain.writeNode(
      this.projectId,
      'user_directive',
      `User response: ${answer.slice(0, 100)}`,
      {
        answer,
        questionNodeId,
        source: 'ui',
        type: 'response',
      },
      'user',
    );

    // Link the answer to the question
    await this.brain.addEdge(
      this.projectId,
      answerNode.id,
      questionNodeId,
      'refines',
      'user',
    );

    // Mark the question as no longer awaiting response
    await this.brain.updateNode(questionNodeId, {
      content: {
        ...questionNode.content,
        awaitingResponse: false,
        answeredBy: answerNode.id,
      },
    });

    return answerNode.id;
  }
}
