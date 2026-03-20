/**
 * KripTik Engine — public API exports.
 */

// Engine entry point
export { initEngine } from './engine.js';
export type { InitEngineConfig, EngineHandle } from './engine.js';

// Config
export { MODELS, THINKING, CONTEXT, SERVICES, TIMEOUTS, LIMITS } from './config/index.js';

// Brain layer
export { BrainService } from './brain/brain-service.js';
export { createEmbeddingService } from './brain/embeddings.js';
export type { EmbeddingService } from './brain/embeddings.js';
export { seedTemplateBrain } from './brain/template.js';
export { GlobalMemoryService } from './brain/global-memory.js';
export { ExperienceExtractor } from './brain/experience-extractor.js';
export { ExperienceRetriever } from './brain/experience-retriever.js';
export { ExperienceReinforcer } from './brain/experience-reinforcer.js';
export { ExperienceTracker } from './brain/experience-tracker.js';
export { ExperienceMetrics } from './brain/experience-metrics.js';
export * from './types/index.js';
export * from './brain/schema.js';

// Agent layer
export { AgentRuntime } from './agents/runtime.js';
export type { ToolDefinition, ToolContext } from './agents/runtime.js';
export { buildLeadSystemPrompt } from './agents/prompts/lead.js';
export { buildSpecialistSystemPrompt } from './agents/prompts/specialist.js';
export type { SpecialistConfig } from './agents/prompts/specialist.js';

// Tools layer
export { buildToolRegistry, createLocalSandbox } from './tools/index.js';
export type { SandboxProvider } from './tools/sandbox/provider.js';
export type { VisionProvider } from './tools/vision/index.js';

// Provider layer
export { ProviderRouter } from './providers/router.js';
export { AnthropicProvider } from './providers/anthropic.js';
export { OpenAIProvider } from './providers/openai.js';
export type { LLMProvider, LLMRequestOptions, LLMResponse, LLMMessage, LLMContentBlock, LLMTool } from './providers/types.js';

// Bridge layer
export { SSEEmitter } from './bridge/sse-emitter.js';
export type { SSEEvent, SSEEventType } from './bridge/sse-emitter.js';
export { UserInputHandler } from './bridge/user-input.js';
