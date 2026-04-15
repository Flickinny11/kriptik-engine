/**
 * prism-backend.ts — Backend contract and deployment types for Prism engine.
 *
 * tRPC types + Zod schemas are generated BEFORE any frontend or backend code (Invariant 4).
 * Both sides generate against the contract.
 */

export type BackendTarget =
  | 'cloudflare-workers'
  | 'aws-lambda'
  | 'vercel-functions'
  | 'fly-machines'
  | 'modal'
  | 'supabase'
  | 'runpod';

export type DeploymentTarget =
  | 'vercel'
  | 'cloudflare-pages'
  | 'netlify'
  | 'fly-io';

export interface BackendContract {
  tRPCRouter: string;
  zodSchemas: string;
  dataModels: DataModelPlan[];
  apiEndpoints: APIEndpointPlan[];
  authStrategy: AuthStrategyPlan;
  deploymentTargets: BackendTarget[];
}

export interface DataModelPlan {
  name: string;
  fields: { name: string; type: string; required: boolean; unique: boolean; default?: string }[];
  relations: { target: string; type: 'one-to-one' | 'one-to-many' | 'many-to-many' }[];
  indexes: string[][];
}

export interface APIEndpointPlan {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  auth: boolean;
  inputSchema: string;
  outputSchema: string;
  implementation: 'generated' | 'template' | 'integration';
}

export interface AuthStrategyPlan {
  type: 'session' | 'jwt' | 'api-key' | 'oauth' | 'none';
  providers: string[];
  sessionDuration: number;
  refreshStrategy: 'sliding' | 'fixed';
}
