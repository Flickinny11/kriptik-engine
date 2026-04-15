/**
 * Prism Engine API Routes
 *
 * All routes require authentication via requireAuth.
 * Mounted at /api/prism in server index.ts.
 *
 * Build events flow through existing SSE infrastructure
 * (buildEvents table -> GET /api/events/stream). No new real-time channels.
 */

import { Router, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import {
  projects,
  prismPlans,
  prismGraphs,
  buildEvents,
} from '../schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { verifyProjectOwnership } from '../middleware/ownership.js';
import {
  startPrismBuild,
  isPrismEnabled,
  getR2Config,
  dispatchPrismPlan,
  dispatchPrismNodeEdit,
} from '../modal/prism-manager.js';

const router = Router();
router.use(requireAuth as any);

// ── POST /api/prism/build — Start a Prism build ────────────────────
// Called from execute.ts engine branch or directly.
// Generates a plan and returns it for user approval.
router.post('/build', async (req: AuthenticatedRequest, res: Response) => {
  const { projectId, prompt } = req.body;
  if (!projectId || !prompt) {
    res.status(400).json({ error: 'projectId and prompt are required' });
    return;
  }

  const project = await verifyProjectOwnership(req, projectId);
  if (!project) {
    res.status(403).json({ error: 'Project not found or access denied' });
    return;
  }

  if (project.engineType !== 'prism') {
    res.status(400).json({ error: 'Project is not a Prism engine project' });
    return;
  }

  try {
    const planId = uuid();
    await db.insert(prismPlans).values({
      id: planId,
      projectId,
      userId: req.user!.id,
      prompt,
      parsedIntent: {},
      graphPlan: {},
      status: 'pending',
    });

    await db.update(projects)
      .set({ status: 'planning', updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    // Emit SSE event for plan generation start
    await db.insert(buildEvents).values({
      projectId,
      eventType: 'prism_build_progress',
      eventData: {
        type: 'prism_build_progress',
        data: { phase: 'planning', message: 'Generating build plan...' },
        timestamp: new Date().toISOString(),
        phase: 'planning',
        progress: 5,
      },
    });

    // Dispatch planning to Modal — fire and forget.
    // Modal runs: intent parsing → needs mapping → plan generation
    // Results posted back via planCallbackUrl.
    const apiBase = process.env.API_URL || process.env.BETTER_AUTH_URL || '';
    const callbackUrl = `${apiBase}/api/events/callback/${projectId}`;
    const planCallbackUrl = `${apiBase}/api/prism/plan/${planId}/complete`;

    await dispatchPrismPlan({
      planId,
      projectId,
      prompt,
      callbackUrl,
      planCallbackUrl,
    }).catch((err) => {
      // Non-fatal for the response — planning dispatch failure is logged
      // and reported via SSE error event. The plan stays 'pending'.
      console.error('Planning dispatch failed:', err);
    });

    res.json({
      planId,
      status: 'pending',
      projectId,
    });
  } catch (err) {
    console.error('Prism build start failed:', err);
    res.status(500).json({ error: 'Failed to start Prism build' });
  }
});

// ── POST /api/prism/plan/approve — Approve a generated plan ────────
// Triggers Modal pipeline dispatch.
router.post('/plan/approve', async (req: AuthenticatedRequest, res: Response) => {
  const { planId } = req.body;
  if (!planId) {
    res.status(400).json({ error: 'planId is required' });
    return;
  }

  const plan = await db.query.prismPlans.findFirst({
    where: eq(prismPlans.id, planId),
  });

  if (!plan) {
    res.status(404).json({ error: 'Plan not found' });
    return;
  }

  // Verify user owns the project this plan belongs to
  const project = await verifyProjectOwnership(req, plan.projectId);
  if (!project) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (plan.status !== 'pending') {
    res.status(409).json({ error: `Plan is already ${plan.status}` });
    return;
  }

  try {
    // Update plan status
    await db.update(prismPlans)
      .set({ status: 'generating', approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(prismPlans.id, planId));

    await db.update(projects)
      .set({ status: 'building', updatedAt: new Date() })
      .where(eq(projects.id, plan.projectId));

    // Dispatch to Modal — fire and forget
    const apiBase = process.env.API_URL || process.env.BETTER_AUTH_URL || '';
    const callbackUrl = `${apiBase}/api/events/callback/${plan.projectId}`;

    // Gather project credentials for the build
    const credentials = await getProjectCredentials(plan.projectId);

    await startPrismBuild({
      projectId: plan.projectId,
      userId: plan.userId,
      planId: plan.id,
      plan: plan.graphPlan,
      callbackUrl,
      credentials,
      r2Config: getR2Config(),
    });

    // Emit approval event
    await db.insert(buildEvents).values({
      projectId: plan.projectId,
      eventType: 'prism_plan_approved',
      eventData: {
        type: 'prism_plan_approved',
        data: { planId, projectId: plan.projectId },
        timestamp: new Date().toISOString(),
        phase: 'planning',
        progress: 10,
      },
    });

    res.json({ status: 'generating' });
  } catch (err) {
    console.error('Prism plan approval failed:', err);

    // Revert plan status on failure
    await db.update(prismPlans)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(eq(prismPlans.id, planId));
    await db.update(projects)
      .set({ status: 'planning', updatedAt: new Date() })
      .where(eq(projects.id, plan.projectId));

    res.status(500).json({ error: 'Failed to dispatch build to Modal' });
  }
});

// ── POST /api/prism/plan/reject — Reject plan with feedback ────────
router.post('/plan/reject', async (req: AuthenticatedRequest, res: Response) => {
  const { planId, feedback } = req.body;
  if (!planId) {
    res.status(400).json({ error: 'planId is required' });
    return;
  }

  const plan = await db.query.prismPlans.findFirst({
    where: eq(prismPlans.id, planId),
  });

  if (!plan) {
    res.status(404).json({ error: 'Plan not found' });
    return;
  }

  const project = await verifyProjectOwnership(req, plan.projectId);
  if (!project) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  // Mark plan as pending (re-generating), update project back to planning
  await db.update(prismPlans)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(eq(prismPlans.id, planId));

  await db.update(projects)
    .set({ status: 'planning', updatedAt: new Date() })
    .where(eq(projects.id, plan.projectId));

  // Emit rejection event
  await db.insert(buildEvents).values({
    projectId: plan.projectId,
    eventType: 'prism_plan_rejected',
    eventData: {
      type: 'prism_plan_rejected',
      data: { planId, feedback: feedback || '' },
      timestamp: new Date().toISOString(),
      phase: 'planning',
      progress: 5,
    },
  });

  // Dispatch re-generation to Modal with feedback
  if (feedback) {
    const apiBase = process.env.API_URL || process.env.BETTER_AUTH_URL || '';
    const callbackUrl = `${apiBase}/api/events/callback/${plan.projectId}`;
    const planCallbackUrl = `${apiBase}/api/prism/plan/${planId}/complete`;

    await dispatchPrismPlan({
      planId,
      projectId: plan.projectId,
      prompt: plan.prompt,
      callbackUrl,
      planCallbackUrl,
      previousPlan: {
        id: plan.id,
        projectId: plan.projectId,
        prompt: plan.prompt,
        intent: plan.parsedIntent,
        graph: plan.graphPlan,
        backendContract: (plan as Record<string, unknown>).backendContract || {},
        inferredNeeds: (plan as Record<string, unknown>).inferredNeeds || [],
      },
      feedback,
    }).catch((err) => {
      console.error('Re-generation dispatch failed:', err);
    });
  }

  res.json({ status: 'rejected', planId });
});

// ── POST /api/prism/plan/:planId/complete — Plan generation callback ─
// Called by Modal when planning is complete. Updates prism_plans with
// the generated plan data (parsedIntent, graphPlan, backendContract).
// NOT authenticated via user session — called by Modal infrastructure.
router.post('/plan/:planId/complete', async (req: AuthenticatedRequest, res: Response) => {
  const { planId } = req.params;
  const { plan } = req.body;

  if (!planId || !plan) {
    res.status(400).json({ error: 'planId param and plan body are required' });
    return;
  }

  const existingPlan = await db.query.prismPlans.findFirst({
    where: eq(prismPlans.id, planId),
  });

  if (!existingPlan) {
    res.status(404).json({ error: 'Plan not found' });
    return;
  }

  try {
    // Store plan data. estimatedCost and estimatedTimeSeconds are
    // included in the graphPlan JSON since they aren't separate columns.
    const graphPlanData = plan.graph || {};
    graphPlanData.estimatedCost = plan.estimatedCost ?? 0;
    graphPlanData.estimatedTimeSeconds = plan.estimatedTimeSeconds ?? 0;

    await db.update(prismPlans)
      .set({
        parsedIntent: plan.intent || {},
        graphPlan: graphPlanData,
        backendContract: plan.backendContract || {},
        inferredNeeds: plan.inferredNeeds || [],
        status: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(prismPlans.id, planId));

    res.json({ ok: true, planId });
  } catch (err) {
    console.error('Plan completion callback failed:', err);
    res.status(500).json({ error: 'Failed to persist plan' });
  }
});

// ── GET /api/prism/plan/:planId — Get plan details ─────────────────
router.get('/plan/:planId', async (req: AuthenticatedRequest, res: Response) => {
  const plan = await db.query.prismPlans.findFirst({
    where: eq(prismPlans.id, req.params.planId),
  });

  if (!plan) {
    res.status(404).json({ error: 'Plan not found' });
    return;
  }

  const project = await verifyProjectOwnership(req, plan.projectId);
  if (!project) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  res.json({ plan });
});

// ── GET /api/prism/graph/:graphId — Get graph details ──────────────
router.get('/graph/:graphId', async (req: AuthenticatedRequest, res: Response) => {
  const graph = await db.query.prismGraphs.findFirst({
    where: eq(prismGraphs.id, req.params.graphId),
  });

  if (!graph) {
    res.status(404).json({ error: 'Graph not found' });
    return;
  }

  const project = await verifyProjectOwnership(req, graph.projectId);
  if (!project) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  res.json({ graph });
});

// ── POST /api/prism/graph/:graphId/edit — Edit a node ──────────────
// Single-node mutation: regenerates ONLY the edited node's code.
// Neighbor nodes are NOT regenerated. Atlas is NOT repacked.
// Graph edges preserved unless changes explicitly alter relationships.
// Graph version increments. Preview updates via hot-reload within 5s.
router.post('/graph/:graphId/edit', async (req: AuthenticatedRequest, res: Response) => {
  const { nodeId, changes } = req.body;
  if (!nodeId || !changes) {
    res.status(400).json({ error: 'nodeId and changes are required' });
    return;
  }

  const graph = await db.query.prismGraphs.findFirst({
    where: eq(prismGraphs.id, req.params.graphId),
  });

  if (!graph) {
    res.status(404).json({ error: 'Graph not found' });
    return;
  }

  const project = await verifyProjectOwnership(req, graph.projectId);
  if (!project) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  // Verify the node exists in the graph
  const nodes = graph.nodes as Array<{ id: string }>;
  const targetNode = nodes.find((n) => n.id === nodeId);
  if (!targetNode) {
    res.status(404).json({ error: 'Node not found in graph' });
    return;
  }

  try {
    const newVersion = graph.version + 1;

    // Apply changes to the node in the graph JSON.
    // Only caption, visualSpec, and behaviorSpec are editable.
    const updatedNodes = nodes.map((n) => {
      if (n.id !== nodeId) return n;
      const updated = { ...n } as Record<string, unknown>;
      if (changes.caption != null) updated.caption = changes.caption;
      if (changes.visualSpec != null) updated.visualSpec = changes.visualSpec;
      if (changes.behaviorSpec != null) updated.behaviorSpec = changes.behaviorSpec;
      // Clear code/verification so it gets regenerated
      updated.code = null;
      updated.codeHash = null;
      updated.verificationScore = null;
      updated.status = 'pending';
      return updated;
    });

    // Persist the new graph version (additive — old version stays)
    const newGraphId = uuid();
    await db.insert(prismGraphs).values({
      id: newGraphId,
      planId: graph.planId,
      projectId: graph.projectId,
      version: newVersion,
      nodes: updatedNodes,
      edges: graph.edges,
      hubs: graph.hubs,
      metadata: graph.metadata,
      status: 'editing',
    });

    // Emit SSE event for edit start
    await db.insert(buildEvents).values({
      projectId: graph.projectId,
      eventType: 'prism_node_edit_started',
      eventData: {
        type: 'prism_node_edit_started',
        data: { nodeId, graphId: newGraphId, version: newVersion },
        timestamp: new Date().toISOString(),
        phase: 'editing',
        progress: 50,
        nodeId,
      },
    });

    // Dispatch single-node edit to Modal — fire and forget.
    // Modal regenerates ONLY this node's code, swaps the module,
    // and sends hot-reload + completion events.
    const apiBase = process.env.API_URL || process.env.BETTER_AUTH_URL || '';
    const callbackUrl = `${apiBase}/api/events/callback/${graph.projectId}`;

    await dispatchPrismNodeEdit({
      projectId: graph.projectId,
      graphId: newGraphId,
      nodeId,
      graphVersion: newVersion,
      changes: {
        caption: changes.caption ?? undefined,
        visualSpec: changes.visualSpec ?? undefined,
        behaviorSpec: changes.behaviorSpec ?? undefined,
      },
      callbackUrl,
      r2Config: getR2Config(),
    }).catch((err) => {
      console.error('Node edit dispatch failed:', err);
    });

    res.json({
      status: 'editing',
      graphId: newGraphId,
      nodeId,
      version: newVersion,
    });
  } catch (err) {
    console.error('Graph edit failed:', err);
    res.status(500).json({ error: 'Failed to edit node' });
  }
});

// ── POST /api/prism/optimize/:graphId — Trigger overnight optimization ─
router.post('/optimize/:graphId', async (req: AuthenticatedRequest, res: Response) => {
  const graph = await db.query.prismGraphs.findFirst({
    where: eq(prismGraphs.id, req.params.graphId),
  });

  if (!graph) {
    res.status(404).json({ error: 'Graph not found' });
    return;
  }

  const project = await verifyProjectOwnership(req, graph.projectId);
  if (!project) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  // Optimization dispatch implemented in Phase 10.
  // For now, acknowledge the request.
  res.json({ status: 'queued', graphId: graph.id });
});

// ── GET /api/prism/models — Available diffusion/code models ────────
// No auth required beyond session — returns static config.
router.get('/models', async (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    diffusionModels: [
      { id: 'flux2-klein', name: 'FLUX.2 Klein', gpu: 'L40S', description: 'Fast, high-quality UI generation' },
      { id: 'flux2-pro', name: 'FLUX.2 Pro', gpu: 'A100', description: 'Maximum quality, slower' },
      { id: 'flux2-dev', name: 'FLUX.2 Dev', gpu: 'L40S', description: 'Development/testing model' },
    ],
    codeModels: [
      { id: 'mercury-2', name: 'Mercury 2', gpu: 'L4', description: 'Fast code generation' },
      { id: 'qwen3-coder-80b', name: 'Qwen3 Coder 80B', gpu: 'L4', description: 'High-quality code generation' },
    ],
  });
});

// ── GET /api/prism/config — Default engine configuration ───────────
router.get('/config', async (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    defaultConfig: {
      diffusionModel: 'flux2-klein',
      codeModel: 'mercury-2',
      targetResolution: { width: 1440, height: 900 },
      styleReferences: [],
      backendTargets: ['cloudflare-workers'],
      deploymentTargets: ['vercel'],
      enableCompetitiveAnalysis: false,
      enableOvernightOptimization: false,
    },
    prismEnabled: isPrismEnabled(),
  });
});

// ── POST /api/prism/deploy/:projectId — Deploy to Vercel ─────────
// Deploys the latest Prism bundle from R2 to Vercel.
// Optionally adds {slug}.kriptik.app domain alias.
// INVARIANT 6: Vercel serves static files only. No compute.
router.post('/deploy/:projectId', async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params;

  const project = await verifyProjectOwnership(req, projectId);
  if (!project) {
    res.status(403).json({ error: 'Project not found or access denied' });
    return;
  }

  if (project.engineType !== 'prism') {
    res.status(400).json({ error: 'Only Prism projects can be deployed via this endpoint' });
    return;
  }

  // Find the latest completed graph for this project
  const graph = await db.query.prismGraphs.findFirst({
    where: eq(prismGraphs.projectId, projectId),
    orderBy: (g, { desc }) => [desc(g.version)],
  });

  if (!graph) {
    res.status(404).json({ error: 'No completed build found for this project. Run a build first.' });
    return;
  }

  try {
    const { deployToVercel } = await import('../utils/vercel-deploy.js');

    const vercelProjectName = `kriptik-prism-${projectId.slice(0, 8)}`;
    const result = await deployToVercel({
      projectId,
      graphVersion: graph.version,
      vercelProjectName,
      slug: project.appSlug || undefined,
    });

    if (!result.success) {
      res.status(502).json({
        error: 'Vercel deployment failed',
        detail: result.error,
        deployTimeMs: result.deployTimeMs,
      });
      return;
    }

    // Update project with deployment URL
    const deployUrl = result.productionUrl || result.deploymentUrl || '';
    await db.update(projects)
      .set({ previewUrl: deployUrl, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    // Emit SSE event for deployment completion
    await db.insert(buildEvents).values({
      projectId,
      eventType: 'prism_deployment_complete',
      eventData: {
        type: 'prism_deployment_complete',
        data: {
          deploymentId: result.deploymentId,
          deploymentUrl: result.deploymentUrl,
          productionUrl: result.productionUrl,
          deployTimeMs: result.deployTimeMs,
        },
        timestamp: new Date().toISOString(),
        phase: 'deployment',
        progress: 100,
      },
    });

    res.json({
      status: 'deployed',
      deploymentId: result.deploymentId,
      deploymentUrl: result.deploymentUrl,
      productionUrl: result.productionUrl,
      deployTimeMs: result.deployTimeMs,
    });
  } catch (err) {
    console.error('Prism Vercel deploy failed:', err);
    res.status(500).json({ error: 'Deployment failed' });
  }
});

// ── Helper: Get project credentials ────────────────────────────────
async function getProjectCredentials(
  projectId: string,
): Promise<Record<string, unknown>> {
  // Credentials are fetched from the credentials table.
  // For now, return empty — credential wiring is already in place from
  // the existing credentials route. Full integration in Phase 5.
  return {};
}

// ── handlePrismBuild — called from execute.ts engine branch ────────
// Exported so execute.ts can call it directly on Prism projects.
export async function handlePrismBuild(
  req: AuthenticatedRequest,
  res: Response,
  project: typeof import('../schema.js').projects.$inferSelect,
  prompt: string,
): Promise<void> {
  try {
    const planId = uuid();
    await db.insert(prismPlans).values({
      id: planId,
      projectId: project.id,
      userId: req.user!.id,
      prompt,
      parsedIntent: {},
      graphPlan: {},
      status: 'pending',
    });

    await db.update(projects)
      .set({ status: 'planning', updatedAt: new Date() })
      .where(eq(projects.id, project.id));

    await db.insert(buildEvents).values({
      projectId: project.id,
      eventType: 'prism_build_progress',
      eventData: {
        type: 'prism_build_progress',
        data: { phase: 'planning', message: 'Generating build plan...' },
        timestamp: new Date().toISOString(),
        phase: 'planning',
        progress: 5,
      },
    });

    // Dispatch planning to Modal — fire and forget
    const apiBase = process.env.API_URL || process.env.BETTER_AUTH_URL || '';
    const callbackUrl = `${apiBase}/api/events/callback/${project.id}`;
    const planCallbackUrl = `${apiBase}/api/prism/plan/${planId}/complete`;

    await dispatchPrismPlan({
      planId,
      projectId: project.id,
      prompt,
      callbackUrl,
      planCallbackUrl,
    }).catch((err) => {
      console.error('Planning dispatch failed:', err);
    });

    res.json({
      planId,
      plan: { id: planId, projectId: project.id, status: 'pending' },
      status: 'awaiting_approval',
    });
  } catch (err) {
    console.error('Prism build start failed:', err);
    res.status(500).json({ error: 'Failed to start Prism build' });
  }
}

export default router;
