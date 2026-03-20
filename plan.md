# Skills & Design Knowledge Integration Plan

## Core Principle: Enrich the Brain, Trust the Agents

This architecture does NOT add gates, regex checks, enforcement hooks, or mechanical
validation. It solves the problem by making the Brain so rich with the right knowledge
that agents naturally encounter it when reasoning about what to build and how.

**The current failure mode:** Design_References.md requires the Lead to call
`load_design_references` — an optional tool call it routinely skips. The 40KB of
curated design intelligence isn't even IN the brain most builds. When a specialist
thinks "how should I build this hero section?", semantic search returns nothing
because there's nothing to find. Of course it defaults to training-data slop.

**The fix:** Seed the knowledge automatically so it's always there. When an agent
reasons about scroll effects, the brain surfaces Lenis + GSAP patterns. When it
reasons about GPU compute, the brain surfaces RunPod Flash. No gates. No enforcement.
Just a well-stocked brain that rewards agents for querying it.

---

## Architecture: Universal Skills System

Everything external the engine might need to integrate with — design libraries,
deployment platforms, payment processors, databases, AI inference services — is a
**skill**. Skills are knowledge that gets seeded into the Brain at engine init,
alongside optional executable tools for platforms that need programmatic access.

```
src/brain/skills/
├── index.ts              # seedSkillsBrain() — runs at engine init, idempotent
├── types.ts              # SkillDef interface
├── design.ts             # Design technique knowledge (condensed from Design_References.md)
├── runpod.ts             # RunPod Flash + Pods + runpodctl
├── (future: stripe.ts, supabase.ts, vercel.ts, netlify.ts, replicate.ts, ...)

src/tools/infrastructure/
├── index.ts              # createInfrastructureTools()
├── platform-setup.ts     # Dynamic CLI/MCP/SDK installer
├── runpod/               # RunPod executable tools
├── (future: stripe/, vercel/, ...)
```

---

## Phase 1: Design Knowledge Seeding

### The Problem

Design_References.md is 40KB / 1,216 lines / 16 sections covering WebGL shaders,
scroll engines, cursor libraries, page transitions, post-processing, integration
recipes, and performance patterns. It's the antidote to AI slop. But it's currently
loaded via an optional tool call that agents skip.

### The Solution: Two-Tier Seeding

**Tier 1 — Design philosophy as constraint nodes (~20 nodes)**

These are the *why* and *what* — condensed reasoning that agents encounter when they
query constraints (which they already do reliably during UNDERSTAND):

```typescript
// Example constraint nodes seeded at init:
{
  title: 'Visual effects require dedicated libraries',
  rule: 'Use WebGL shader libraries (curtains.js, OGL, Three.js) for visual depth and
         motion. CSS animations, Framer Motion defaults, and CSS gradients produce flat,
         generic results. The difference between a premium app and AI slop is whether
         visual effects use GPU-accelerated shaders or CSS tricks.',
  rationale: 'CSS-only effects max out at opacity/transform transitions. WebGL shaders
              can do fluid simulations, displacement effects, noise-driven animations,
              and post-processing that make interfaces feel alive and handcrafted.',
  examples: ['curtains.js for image displacement on hover', 'OGL for particle backgrounds',
             'Three.js + postprocessing for bloom/chromatic aberration'],
  category: 'design-system',
}
```

These sit alongside the existing 28 anti-slop/quality constraints. Agents read them
the same way — during UNDERSTAND. They shape the Lead's thinking about what kind of
specialists to spawn and what to tell them.

**Tier 2 — Full technical references as design_reference nodes (16 nodes)**

Auto-load all 16 sections of Design_References.md at engine init. Same parsing as
the current `load_design_references` tool, but called from `seedSkillsBrain()`
instead of waiting for the Lead to remember.

This is the *how* — full code examples, npm packages, integration recipes, GLSL
snippets. When a specialist semantically queries "smooth scrolling library" or
"WebGL image effects," these nodes surface with complete implementation details.

**Why both tiers matter:**
- Tier 1 (constraints) shapes early reasoning — the Lead thinks "this needs WebGL,
  not CSS" before any specialist is spawned
- Tier 2 (references) provides implementation depth — the specialist thinks "I need
  a displacement shader on hover" and finds the curtains.js code example
- Neither tier is gated or enforced. They're knowledge. Agents find them through
  the brain's semantic search when they reason about relevant topics.

**What changes about Design_References.md:**
- The file stays as-is (anchor for humans to read and maintain)
- `load_design_references` tool stays (agents can still call it manually)
- But the file's content is ALSO auto-seeded at init, so it's in the brain
  regardless of whether anyone calls the tool

### Why This Works Without Enforcement

The existing anti-slop constraints (like "No generic gradient backgrounds") already
work — agents query constraints and follow them. Adding design-philosophy constraints
to the same pool means they get the same treatment. No new pattern needed.

The full references work because of semantic search — when an agent writes a brain
query like "how to implement page transitions," Qdrant returns the Barba.js + GSAP
section with code examples. The agent didn't need to be told to look there. It asked
a question and the brain had the answer.

The failure mode today is that the brain literally doesn't have this knowledge. Fix
that, and the reasoning loop works as designed.

---

## Phase 2: Platform Skills (RunPod + Extensible)

### Skill Knowledge Seeding

Each platform gets a skill definition that seeds into the brain as `discovery` nodes.
These are "things the system knows about available platforms." Agents encounter them
when reasoning about infrastructure, deployment, or external services.

**`runpod.ts` seeds two discovery nodes:**

1. **RunPod Flash (Serverless GPU)**
   - Title: "RunPod Flash — serverless GPU/CPU endpoints for AI workloads"
   - Content: Flash SDK patterns, @remote decorator, 3 endpoint modes (queue-based,
     load-balanced routes, external image), GPU options (RTX 4000 → H200), worker
     scaling, cold start handling, volume mounts, 500MB artifact limit, 10MB payload
     limit, Python ≥3.10 requirement, imports-inside-functions gotcha
   - The content is rich enough that when a specialist queries "deploy ML model to
     GPU," this node surfaces with everything needed to make implementation decisions

2. **RunPod Pods (Persistent GPU Containers)**
   - Title: "RunPod Pods — persistent GPU containers for training and development"
   - Content: runpodctl CLI commands (create, start, stop, list, delete), pod
     templates, network volumes, SSH access, datacenter selection, GPU type options,
     proxy URL pattern, API key auth

**How agents encounter this knowledge:**
- Lead runs `analyze_intent` → determines app needs AI inference → queries brain for
  "GPU compute" or "model deployment" → RunPod Flash node surfaces → Lead reasons
  about whether to use it, writes a decision node, includes the knowledge in
  specialist briefings
- Specialist working on AI pipeline → queries brain for "serverless endpoint
  deployment" → finds RunPod knowledge → uses it to implement correctly
- If the app doesn't need GPU compute, no agent ever queries for it, and the
  knowledge sits quietly in the brain. Zero overhead.

### Skill Definition Interface

```typescript
export interface SkillDef {
  platform: string;
  title: string;
  summary: string;          // One-line description for quick brain queries
  knowledge: string;        // Rich technical content — API patterns, CLI commands,
                            // config options, code examples. This is what agents
                            // read when they need implementation details.
  use_cases: string[];      // Semantic triggers — what kinds of problems this solves
  dependencies: string[];   // What this platform needs (API keys, CLIs, SDKs)
  gotchas: string[];        // Common mistakes, limitations, things that surprise
  category: 'gpu-compute' | 'hosting' | 'deployment' | 'payments' | 'database' |
            'auth' | 'storage' | 'ai-inference' | 'monitoring' | 'design';
}
```

The `use_cases` and `summary` fields are important for semantic search — they're
what make a node surface when an agent queries for a related concept. Rich use_cases
mean better vector similarity matches.

### Future Skills (Same Pattern, No Architecture Changes)

| Skill | Category | Surfaces When Agent Reasons About... |
|-------|----------|--------------------------------------|
| Vercel | deployment | "deploy Next.js app", "serverless functions", "edge runtime" |
| Netlify | deployment | "static site hosting", "deploy React app", "form handling" |
| Stripe | payments | "billing", "subscriptions", "payment processing", "pricing page" |
| Supabase | database + auth | "PostgreSQL", "real-time subscriptions", "auth provider" |
| Replicate | ai-inference | "run ML model", "image generation API", "model hosting" |
| Cloudflare | hosting + storage | "CDN", "workers", "R2 storage", "edge compute" |
| AWS S3 | storage | "file uploads", "image storage", "static assets" |

Each one: a TypeScript file in `src/brain/skills/`, seeded at init, zero
enforcement needed.

---

## Phase 3: Infrastructure Tools

Skills give agents *knowledge*. Tools give them *hands*.

### `src/tools/infrastructure/`

**RunPod tools:**

| Tool | What It Does |
|------|-------------|
| `runpod_deploy_endpoint` | Deploy a serverless GPU endpoint via Flash SDK |
| `runpod_create_pod` | Create a persistent GPU pod |
| `runpod_list_resources` | List pods, endpoints, volumes, templates |
| `runpod_manage_pod` | Start/stop/restart/delete a pod |
| `runpod_create_volume` | Create a persistent network volume |
| `runpod_check_gpu_availability` | Check GPU type availability and pricing |
| `runpod_configure_endpoint` | Configure scaling, timeouts, GPU type |

These execute via RunPod's API using the user's API key from the credential vault.
If no key is found, the tool returns a clear message — the specialist writes a
discovery node, the Lead sees it, and asks the user for credentials via
`request_user_input`. Natural flow, no hardcoded gate.

**Platform setup tool:**

`platform_setup` — A general-purpose tool that can install CLIs, configure MCP
servers, or set up SDK clients in the sandbox environment. When a specialist needs
`runpodctl` or `stripe-cli` or `supabase` CLI, it calls this tool with the platform
name. The tool:

1. Checks if the CLI/SDK is already available in the sandbox
2. If not, installs it (npm/pip/curl as appropriate)
3. Configures it with credentials from the vault
4. Returns the available commands/capabilities

This is how the engine handles "programmatically do everything" — the specialist
reasons about what it needs, installs the tools, and uses them. No pre-installed
requirement, no hardcoded tool list.

---

## Phase 4: Agent Prompt Updates (Knowledge, Not Rules)

### Lead Agent (`src/agents/prompts/lead.ts`)

Add to UNDERSTAND section — not as a numbered step (which implies sequence), but as
enrichment to existing reasoning:

```
### Available Platform Knowledge

The Brain contains knowledge about deployment platforms, external services, and
design techniques — seeded at startup as discovery and design_reference nodes.
When analyzing intent, consider what platforms and services the app will need.
Query the Brain for relevant platform knowledge before making architectural
decisions — it contains API patterns, configuration details, CLI commands, and
gotchas that will save specialists from guessing.

When spawning specialists for domains that involve external platforms (GPU compute,
payments, deployment, database), include relevant platform knowledge from the Brain
in their domain_description. This gives them the context to make correct decisions
autonomously.
```

Also update step 7 (load_design_references) to reflect that design references are
now auto-seeded:

```
7. **Design intelligence is pre-loaded.** The Brain already contains design_reference
   nodes with advanced UI techniques (WebGL shaders, scroll engines, cursor libraries,
   page transitions, post-processing) and design-system constraints that guide
   specialists toward premium, distinctive interfaces. You don't need to load them —
   they're there. When spawning UI specialists, remind them that the Brain contains
   design references they should query for implementation patterns. When generating
   design direction, query the Brain for design_reference nodes to ground your
   direction in proven techniques rather than generic advice.
```

### Specialist Agent (`src/agents/prompts/specialist.ts`)

Add to "Brain Interaction Rules" — as knowledge awareness, not enforcement:

```
**The Brain has deep knowledge.** Beyond intents and constraints, the Brain contains:
- Design reference nodes with advanced UI techniques, library recommendations, code
  examples, and integration recipes. If you're building anything visual, query for
  design_reference nodes — they contain proven patterns that produce premium results.
- Platform knowledge for external services (deployment, GPU compute, payments,
  databases). If your domain involves external platforms, query for discovery nodes
  from 'skills-template' — they contain API patterns, CLI commands, configuration
  details, and known gotchas.

This knowledge exists to help you make better decisions. The Brain's semantic search
finds relevant nodes based on what you're thinking about — use natural language
queries about what you're trying to accomplish.
```

This is framed as "here's what's available to help you" — not "you must do this
before that." Agents reason about whether to query based on their domain and current
task. A specialist building a REST API won't query design references. A specialist
building a hero section will — because it's thinking about visual effects and the
brain has answers.

---

## Phase 5: Credential Flow

### Add platforms to OAuth/API key catalog

Update `server/src/oauth/catalog.ts` to include RunPod (and other platforms as they're
added) as API key providers. Users store their keys in the vault through the settings
UI.

### Tools read credentials at execution time

Infrastructure tools call into the vault service to retrieve the relevant API key.
If absent, the tool returns a descriptive result (not an error code — a message like
"RunPod API key not found in project credentials. The user needs to add their RunPod
API key to use this tool."). The specialist writes this as a discovery node. The Lead
sees it on its next brain check and uses `request_user_input` to ask the user.

This is the natural brain-driven flow — no special error handling, no gates, no
retries. Just knowledge flowing through the graph.

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/brain/skills/types.ts` | **NEW** — SkillDef interface |
| `src/brain/skills/design.ts` | **NEW** — ~20 design philosophy constraints + auto-load Design_References.md sections |
| `src/brain/skills/runpod.ts` | **NEW** — RunPod Flash + Pods skill definitions |
| `src/brain/skills/index.ts` | **NEW** — seedSkillsBrain() orchestrator |
| `src/tools/infrastructure/index.ts` | **NEW** — createInfrastructureTools() |
| `src/tools/infrastructure/platform-setup.ts` | **NEW** — Dynamic CLI/MCP/SDK installer |
| `src/tools/infrastructure/runpod/index.ts` | **NEW** — RunPod tool definitions |
| `src/tools/infrastructure/runpod/client.ts` | **NEW** — RunPod API client |
| `src/tools/index.ts` | **EDIT** — Add infrastructure tools to registry |
| `src/engine.ts` | **EDIT** — Call seedSkillsBrain() after seedTemplateBrain() |
| `src/agents/prompts/lead.ts` | **EDIT** — Add platform knowledge + update design references section |
| `src/agents/prompts/specialist.ts` | **EDIT** — Add brain knowledge awareness |
| `server/src/oauth/catalog.ts` | **EDIT** — Add RunPod API key provider |

---

## Why This Preserves Intelligent, Reasoning Agents

1. **No gates.** No "you must query X before doing Y." Agents reason about what they
   need and find it in the brain through semantic search.

2. **No regex/validation.** No checking agent output for compliance. The brain is rich
   with knowledge — if agents reason well, they produce good results. If they don't,
   the existing verification phase (run_build, check_placeholders, evaluate_intent_satisfaction)
   catches quality issues the same way it always has.

3. **No mechanical sequences.** Skills are seeded knowledge, not workflow steps.
   Agents encounter them when their reasoning naturally leads to related queries.
   A blog app never touches RunPod knowledge. An AI image generator finds it
   immediately.

4. **Knowledge rewards curiosity.** The better an agent queries the brain, the better
   its output. This is the intended incentive structure — not "follow these steps"
   but "the brain has answers if you ask good questions."

5. **Extensible without architecture changes.** New platform? Add a `.ts` file to
   `src/brain/skills/`. New design technique? Update Design_References.md (it gets
   auto-seeded). New deployment target? Add tools to `src/tools/infrastructure/`.
   Same brain, same agents, richer knowledge.

6. **The Lead reasons, not follows.** The Lead's prompt says "the brain has platform
   knowledge — consider it when making architectural decisions." It doesn't say
   "call tool X then tool Y." The Lead decides what's relevant based on the user's
   intent.

7. **Specialists are autonomous.** They're told "the brain has deep knowledge about
   design techniques and external platforms." They decide when to query based on
   what they're building. An auth specialist queries Supabase knowledge. A UI
   specialist queries design references. Neither is forced to query both.
