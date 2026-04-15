/**
 * initEngine() — wires Brain, AgentRuntime, tools, SSE, and user input
 * into a running engine. This is the single entry point for starting a build.
 */

import { BrainService } from './brain/brain-service.js';
import { createEmbeddingService } from './brain/embeddings.js';
import { seedTemplateBrain } from './brain/template.js';
import { GlobalMemoryService } from './brain/global-memory.js';
import { ExperienceExtractor } from './brain/experience-extractor.js';
import { ExperienceRetriever } from './brain/experience-retriever.js';
import { ExperienceReinforcer } from './brain/experience-reinforcer.js';
import { ExperienceTracker } from './brain/experience-tracker.js';
import { ExperienceMetrics } from './brain/experience-metrics.js';
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

  // Initialize global memory and seed template brain in parallel (independent ops)
  const globalMemory = new GlobalMemoryService({
    qdrantUrl: config.qdrantUrl,
    qdrantApiKey: config.qdrantApiKey,
    embeddings,
  });

  await Promise.all([
    seedTemplateBrain(brain, config.projectId),
    globalMemory.initialize(),
  ]);

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

  // Experience extraction + reinforcement — wire to build completion
  const extractor = new ExperienceExtractor({
    brain,
    globalMemory,
    router,
  });
  const reinforcer = new ExperienceReinforcer({ brain, globalMemory });
  const experienceTracker = new ExperienceTracker(brain, config.projectId);
  experienceTracker.start();
  const experienceMetrics = new ExperienceMetrics(globalMemory);
  const buildStartTime = Date.now();

  // Emit experience metrics at build start (non-blocking)
  experienceMetrics
    .formatForSSE()
    .then((metricsData) => {
      sseEmitter.handleEngineEvent({
        type: 'experience_metrics',
        data: metricsData,
        timestamp: new Date().toISOString(),
      });
    })
    .catch(() => {});

  // Listen for build_complete events and trigger async experience extraction + reinforcement
  brain.subscribe(config.projectId, (event) => {
    if (event.type === 'node:created') {
      const node = event.data as { nodeType?: string; title?: string };
      if (
        node.nodeType === 'status' &&
        typeof node.title === 'string' &&
        node.title.toLowerCase().includes('complete')
      ) {
        // Run extraction then reinforcement asynchronously — never blocks the build completion
        (async () => {
          try {
            const experiences = await extractor.extractAndStore(config.projectId);
            if (experiences.length > 0) {
              sseEmitter.handleEngineEvent({
                type: 'experience_extracted',
                data: { count: experiences.length, types: experiences.map((e) => e.experienceType) },
                timestamp: new Date().toISOString(),
              });
            }

            // Run reinforcement after extraction
            const outcome = reinforcer.determineBuildOutcome(config.projectId, buildStartTime);
            await reinforcer.reinforceFromBuild(config.projectId, outcome);

            // Emit updated metrics after reinforcement
            const metricsData = await experienceMetrics.formatForSSE();
            sseEmitter.handleEngineEvent({
              type: 'experience_metrics',
              data: metricsData,
              timestamp: new Date().toISOString(),
            });
          } catch (err) {
            console.error('[experience] Post-build processing failed (non-blocking):', err);
          }
        })();
      }
    }
  });

  // In dryRun mode, skip starting agents — no API calls
  if (!config.dryRun) {
    // Retrieve relevant experience from global memory BEFORE starting agents
    const retriever = new ExperienceRetriever({ globalMemory, brain });
    const userPrompt =
      typeof config.initialContext === 'string'
        ? config.initialContext
        : typeof config.initialContext === 'object' && config.initialContext !== null
          ? (config.initialContext as Record<string, unknown>).prompt as string || ''
          : '';
    try {
      await retriever.retrieveForBuild(config.projectId, userPrompt);
    } catch (err) {
      console.error('[experience-retriever] Retrieval failed (non-blocking):', err);
    }

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
