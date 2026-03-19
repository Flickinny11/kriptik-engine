# RunPod Skills Integration Plan

## Architecture Decision: Brain Knowledge Seeding + Infrastructure Tools

After auditing the codebase, the right integration point is a **two-layer approach**:

1. **Knowledge Layer** — Seed RunPod (and future platform) skills into the Brain at startup so every build instance has this knowledge baked in. Agents query it when relevant, ignore it when not.
2. **Tool Layer** — New executable infrastructure tools that agents can call to actually perform RunPod operations (create pods, deploy endpoints, manage volumes).

### Why NOT an anchor file (like Design_References.md)
- Anchor files require the Lead to explicitly call `load_design_references` — it's a manual step that can be forgotten
- The Brain template approach is automatic — seeded on every build, zero agent action needed
- Skills are more like constraints/capabilities than design references — they inform architectural decisions early

### Why NOT just tools without brain knowledge
- Tools alone are mechanical — agents would know they *can* call `create_runpod_pod` but wouldn't know *when* to use RunPod vs other infra
- Brain knowledge lets agents reason about RunPod capabilities during the UNDERSTAND phase, before any code is written
- The Lead Agent needs to know "this app needs GPU compute → RunPod is available → spawn an infra specialist" — that reasoning requires knowledge, not just tools

---

## Implementation Plan

### Phase 1: Brain Skills Infrastructure

**1a. Create `src/brain/skills/` directory with skill definition modules**

Each skill module exports structured knowledge that gets seeded into the Brain:

```
src/brain/skills/
├── index.ts          # Aggregates all skills, exports seedSkillsBrain()
├── types.ts          # SkillDef interface
├── runpod.ts         # RunPod platform knowledge (Flash + runpodctl)
└── (future: vercel.ts, aws.ts, replicate.ts, etc.)
```

**`types.ts`** — Skill definition interface:
```typescript
export interface SkillDef {
  platform: string;           // 'runpod', 'vercel', 'aws'
  title: string;              // Human-readable name
  capability: string;         // What this skill enables
  when_to_use: string;        // Conditions that trigger this skill
  knowledge: string;          // Core technical knowledge (API patterns, CLI commands, config)
  constraints: string[];      // Limitations, gotchas, requirements
  category: 'gpu-compute' | 'hosting' | 'storage' | 'ai-inference' | 'database';
}
```

**`runpod.ts`** — Two skill definitions:
1. **RunPod Flash** — For deploying Python AI/ML workloads to serverless GPU endpoints
   - `when_to_use`: App requires GPU compute, AI model inference, image generation, video processing, LLM hosting
   - `knowledge`: Flash SDK patterns (@remote decorator, endpoint modes, GPU types, cold start handling, volume mounts)
   - `constraints`: Python ≥3.10, 500MB artifact limit, 10MB payload limit, imports must be inside functions, cold starts ~60s

2. **RunPod Pods** — For persistent GPU containers (training, development, long-running services)
   - `when_to_use`: Need persistent GPU access, model training, development environments
   - `knowledge`: runpodctl CLI commands, pod lifecycle, volume management, template system
   - `constraints`: API key required, datacenter-specific volumes

**1b. Extend brain template seeding**

Modify `src/engine.ts` to call `seedSkillsBrain()` after `seedTemplateBrain()`:

```typescript
await seedTemplateBrain(brain, config.projectId);
await seedSkillsBrain(brain, config.projectId);  // NEW
```

The `seedSkillsBrain()` function writes skill knowledge as **`discovery` nodes** (not constraints — these are capabilities, not rules) with `createdBy: 'skills-template'` and high confidence (1.0). Uses the same idempotency pattern as template.ts.

Node type `discovery` is correct because:
- These are "things known" about available platforms
- Agents already query discoveries during reasoning
- No schema changes needed
- Semantically accurate — the system "discovered" these capabilities at init

Each skill gets edges:
- `relates_to` other skills in the same category
- `enables` relationship to show what kind of apps this skill unlocks

### Phase 2: Infrastructure Tools

**2a. Create `src/tools/infrastructure/` directory**

```
src/tools/infrastructure/
├── index.ts              # createInfrastructureTools()
├── runpod-flash.ts       # Flash SDK tools
├── runpod-pods.ts        # Pod management tools
└── runpod-common.ts      # Shared RunPod utilities (auth, API client)
```

**Tools to implement:**

| Tool | Description | Used By |
|------|-------------|---------|
| `runpod_deploy_endpoint` | Deploy a serverless GPU endpoint via Flash | Specialist |
| `runpod_create_pod` | Create a persistent GPU pod | Specialist |
| `runpod_list_resources` | List pods, endpoints, volumes, templates | Specialist |
| `runpod_manage_pod` | Start/stop/restart/delete a pod | Specialist |
| `runpod_create_volume` | Create a persistent network volume | Specialist |
| `runpod_check_gpu_availability` | Check GPU type availability and pricing | Lead + Specialist |
| `runpod_configure_endpoint` | Configure scaling, timeouts, GPU type for an endpoint | Specialist |

These tools execute via the RunPod API (`https://api.runpod.ai/v2/`) using the user's RunPod API key (stored in the credentials vault, retrieved at runtime).

**2b. Register infrastructure tools in the tool registry**

Update `src/tools/index.ts`:
```typescript
import { createInfrastructureTools } from './infrastructure/index.js';

export function buildToolRegistry(config: ToolRegistryConfig): ToolDefinition[] {
  return [
    ...createSandboxTools(config.sandbox),
    ...createVerifyTools(config.sandbox),
    ...createAnalyzeTools({ router: config.router }),
    ...createDesignTools({ sandbox: config.sandbox }),
    ...createVisionTools(),
    ...createInfrastructureTools(),  // NEW
  ];
}
```

### Phase 3: Agent Prompt Awareness

**3a. Update Lead Agent system prompt** (`src/agents/prompts/lead.ts`)

Add a new section in the UNDERSTAND phase after step 5 (probe_api):

```
5b. **Check infrastructure skills.** Query the Brain for discovery nodes with
    createdBy 'skills-template'. These describe available deployment platforms
    (RunPod GPU compute, etc.). If the user's app requires capabilities that
    match a skill's when_to_use criteria (GPU compute, AI inference, model
    training), write a decision node selecting that platform and include its
    constraints in specialist briefings. When spawning infrastructure
    specialists, include the relevant skill knowledge in their domain description.
```

**3b. Update Specialist system prompt** (`src/agents/prompts/specialist.ts`)

Add infrastructure awareness to the "Brain Interaction Rules" section:

```
**Check infrastructure skills.** If your domain involves deployment or
infrastructure, query the Brain for discovery nodes from 'skills-template'.
These contain platform-specific knowledge (API patterns, CLI commands,
configuration options, gotchas). Use this knowledge to make correct
infrastructure decisions without guessing.
```

### Phase 4: Credential Flow

**4a. Add RunPod to the OAuth/API key catalog**

Update `server/src/oauth/catalog.ts` to include RunPod as an API key provider so users can store their RunPod API key in the vault.

**4b. Infrastructure tools read credentials from vault**

Tools retrieve the RunPod API key from the project's credential store at execution time. If no key is found, the tool returns an error instructing the Lead to call `request_user_input` asking for the RunPod API key.

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/brain/skills/types.ts` | **NEW** — SkillDef interface |
| `src/brain/skills/runpod.ts` | **NEW** — RunPod Flash + Pods skill definitions |
| `src/brain/skills/index.ts` | **NEW** — seedSkillsBrain() function |
| `src/tools/infrastructure/runpod-common.ts` | **NEW** — RunPod API client, auth |
| `src/tools/infrastructure/runpod-flash.ts` | **NEW** — Flash deployment tools |
| `src/tools/infrastructure/runpod-pods.ts` | **NEW** — Pod management tools |
| `src/tools/infrastructure/index.ts` | **NEW** — createInfrastructureTools() |
| `src/tools/index.ts` | **EDIT** — Add infrastructure tools to registry |
| `src/engine.ts` | **EDIT** — Call seedSkillsBrain() after seedTemplateBrain() |
| `src/agents/prompts/lead.ts` | **EDIT** — Add infrastructure skill awareness |
| `src/agents/prompts/specialist.ts` | **EDIT** — Add infrastructure skill awareness |
| `server/src/oauth/catalog.ts` | **EDIT** — Add RunPod API key provider |

---

## Why This Approach Is Not Mechanical

1. **Knowledge, not scripts.** Skills are seeded as brain knowledge that agents *reason about*, not hardcoded tool chains they blindly execute.
2. **Contextual activation.** The Lead Agent decides whether RunPod is relevant based on the user's intent — "build me a blog" won't trigger RunPod; "build me an AI image generator" will.
3. **Specialist autonomy.** Infrastructure specialists query skill knowledge from the Brain and make their own decisions about GPU types, scaling configs, and deployment strategies.
4. **Extensible pattern.** Adding Vercel, AWS Lambda, Replicate, or any other platform follows the exact same pattern: skill definition file + tools + catalog entry. No architectural changes needed.
5. **Brain-native.** Skills participate in the knowledge graph — they can have edges to intents ("this app needs GPU compute" → `enables` → "RunPod Flash available"), conflicts can be detected ("user wants cheap hosting" → `conflicts_with` → "H100 GPU pod"), and the Lead resolves them through reasoning.
