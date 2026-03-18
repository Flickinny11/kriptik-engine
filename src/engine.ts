/**
 * initEngine() — wires Brain, AgentRuntime, tools, SSE, and user input
 * into a running engine. This is the single entry point for starting a build.
 */

import { BrainService } from './brain/brain-service.js';
import { createEmbeddingService } from './brain/embeddings.js';
import { seedTemplateBrain } from './brain/template.js';
import { AgentRuntime } from './agents/runtime.js';
import { buildToolRegistry, createLocalSandbox } from './tools/index.js';
import { SSEEmitter } from './bridge/sse-emitter.js';
import { UserInputHandler } from './bridge/user-input.js';
import { ProviderRouter } from './providers/router.js';
import type { EngineEvent } from './types/index.js';
import type { SSEEvent } from './bridge/sse-emitter.js';
import type { SandboxProvider } from './tools/sandbox/provider.js';

export interface InitEngineConfig {
  projectId: string;
  mode: 'builder' | 'fix' | 'import';
  initialContext: unknown;
  anthropicApiKey: string;
  qdrantUrl: string;
  qdrantApiKey?: string;
  hfApiKey?: string;
  brainDbPath: string;
  sandboxRootDir: string;
  sandbox?: SandboxProvider;
  /** If true, wires everything up but does NOT start the Lead Agent. No API calls. */
  dryRun?: boolean;
  /** Hard budget cap in dollars. Agents abort when estimated cost hits this. */
  budgetCapDollars?: number;
}

export interface EngineHandle {
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  terminate: () => Promise<void>;
  sendDirective: (text: string) => Promise<void>;
  respondToQuestion: (questionNodeId: string, answer: string) => Promise<void>;
  onEvent: (callback: (event: SSEEvent) => void) => () => void;
  brain: BrainService;
  runtime: AgentRuntime;
}

export async function initEngine(config: InitEngineConfig): Promise<EngineHandle> {
  const embeddings = createEmbeddingService({
    qdrantUrl: config.qdrantUrl,
    qdrantApiKey: config.qdrantApiKey,
    hfApiKey: config.hfApiKey,
  });

  const brain = new BrainService({
    dbPath: config.brainDbPath,
    embeddings,
  });

  await seedTemplateBrain(brain, config.projectId);

  const sseEmitter = new SSEEmitter(config.projectId);
  sseEmitter.connectBrain(brain);

  const router = new ProviderRouter({
    anthropicApiKey: config.anthropicApiKey,
  });

  const runtime = new AgentRuntime({
    brain,
    router,
    projectId: config.projectId,
    budgetCapDollars: config.budgetCapDollars,
    onEvent: (event: EngineEvent) => {
      sseEmitter.handleEngineEvent(event);
    },
  });

  const sandbox = config.sandbox ?? createLocalSandbox(config.sandboxRootDir);
  const tools = buildToolRegistry({
    sandbox,
    router,
  });
  runtime.registerTools(tools);

  const userInput = new UserInputHandler(brain, config.projectId);

  // In dryRun mode, skip starting agents — no API calls
  if (!config.dryRun) {
    await runtime.startLead({
      mode: config.mode,
      initialContext: config.initialContext,
    });
  }

  return {
    pause: async () => {
      for (const agent of runtime.getActiveAgents()) {
        await runtime.pauseAgent(agent.sessionId);
      }
    },
    resume: async () => {
      await runtime.startLead({
        mode: config.mode,
        initialContext: config.initialContext,
      });
    },
    terminate: async () => {
      await runtime.terminateAll();
      sseEmitter.disconnect();
      brain.close();
    },
    sendDirective: (text: string) => userInput.sendDirective(text).then(() => {}),
    respondToQuestion: (questionNodeId: string, answer: string) =>
      userInput.respondToQuestion(questionNodeId, answer).then(() => {}),
    onEvent: (callback: (event: SSEEvent) => void) => sseEmitter.onSSE(callback),
    brain,
    runtime,
  };
}
