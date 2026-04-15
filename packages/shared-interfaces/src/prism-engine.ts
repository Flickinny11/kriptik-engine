/**
 * prism-engine.ts — Top-level engine interface for Prism.
 *
 * IPrismEngine is the contract between the server and the Prism pipeline.
 * Modal executes, Vercel routes (Invariant 6).
 */

import type { PrismGraph, NodeVisualSpec, NodeBehaviorSpec } from './prism-graph.js';
import type { PrismPlan } from './prism-plan.js';
import type { OptimizationSession } from './prism-optimization.js';
import type { BackendTarget, DeploymentTarget } from './prism-backend.js';

export type { BackendTarget, DeploymentTarget };

export interface IPrismEngine {
  startBuild(options: PrismBuildOptions): Promise<PrismBuildSession>;
  getPlan(planId: string): Promise<PrismPlan | null>;
  approvePlan(planId: string): Promise<void>;
  rejectPlan(planId: string, feedback: string): Promise<PrismPlan>;
  getGraph(graphId: string): Promise<PrismGraph | null>;
  editNode(graphId: string, nodeId: string, changes: NodeEdit): Promise<PrismGraph>;
  triggerOptimization(graphId: string): Promise<OptimizationSession>;
}

export interface PrismBuildOptions {
  projectId: string;
  userId: string;
  prompt: string;
  engineConfig: PrismEngineConfig;
  credentials: Record<string, EncryptedCredential>;
  serviceInstances: ServiceInstance[];
}

export interface PrismEngineConfig {
  diffusionModel: 'flux2-klein' | 'flux2-pro' | 'flux2-dev';
  codeModel: 'mercury-2' | 'qwen3-coder-80b';
  targetResolution: { width: number; height: number };
  styleReferences: string[];
  backendTargets: BackendTarget[];
  deploymentTargets: DeploymentTarget[];
  enableCompetitiveAnalysis: boolean;
  enableOvernightOptimization: boolean;
}

export interface PrismBuildSession {
  sessionId: string;
  projectId: string;
  planId: string | null;
  status: 'planning' | 'awaiting_approval' | 'generating' | 'complete' | 'failed';
  startedAt: string;
  callbackUrl: string;
}

export interface NodeEdit {
  caption?: string;
  visualSpec?: Partial<NodeVisualSpec>;
  behaviorSpec?: Partial<NodeBehaviorSpec>;
  position?: Partial<{ x: number; y: number; z: number; width: number; height: number }>;
}

export interface EncryptedCredential {
  providerId: string;
  encryptedTokens: Record<string, unknown>;
  providerUserId?: string;
  providerEmail?: string;
}

export interface ServiceInstance {
  serviceId: string;
  instanceModel: string;
  label?: string;
  status: string;
  externalId?: string;
}
