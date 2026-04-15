# DRIFT-PREVENTION-SENTINEL.md — Anti-Drift Tripwires & Red Lines

> **This document defines the failure modes that WILL occur if drift prevention is not enforced.**
> Each section describes a specific drift pattern, why it happens, what it looks like in code,
> and the exact corrective action. Read this at the START of every implementation session.

---

## Why Drift Happens

Drift in LLM-assisted implementation follows predictable patterns:

1. **Context decay:** Over long sessions, the model's working understanding of the spec gradually diverges from the actual spec text. Details get simplified, edge cases get forgotten.
2. **Simplification bias:** The model unconsciously reaches for simpler implementations. Parallel becomes sequential. Graph becomes array. Structured becomes string.
3. **Pattern contamination:** The model's training data contains millions of examples of "standard" web app patterns (REST APIs, React components, direct returns). These patterns exert gravitational pull away from the spec's novel architecture.
4. **Cortex bleed:** If Cortex patterns are anywhere in context, they will contaminate Prism implementation. Agent-based patterns, ESAA event sourcing, Brain SQLite — these are Cortex concepts that MUST NOT appear in Prism code.

---

## RED LINE 1: Broken Code in Repair Context

**What it looks like:**
```python
# WRONG — this is contamination
def repair_node(failed_code, spec, error_message):
    prompt = f"Fix this code:\n{failed_code}\nError: {error_message}\nSpec: {spec}"
```

**What it MUST look like:**
```python
# CORRECT — contamination-aware
def repair_node(spec, attempt_number, error_description=None):
    if attempt_number == 1:
        prompt = f"Generate code for:\n{spec.caption}\n{spec.visual}\n{spec.behavior}"
    elif attempt_number == 2:
        prompt = f"Generate code for:\n{spec.caption}\n{spec.visual}\n{spec.behavior}\nNote: {error_description}"
    # NO previous code. NO raw error. NO stack trace. EVER.
```

**Why this matters:** NeurIPS 2023 proved >50% pass rate drop from a single bug in context. IEEE TSE 2025 showed 44.44% of LLM-generated bugs are identical to the shown bug. This is the single most important invariant in the pipeline.

**Tripwire:** Search for these patterns in code. If found, delete and rewrite:
```bash
grep -rn "failed_code\|broken_code\|previous_code\|error_message.*code\|stack_trace.*prompt\|traceback.*prompt" modal/prism/
grep -rn "fix this code\|repair this\|here is the broken" modal/prism/
```

---

## RED LINE 2: Sequential Where Parallel Is Specified

**What it looks like:**
```python
# WRONG — sequential code generation
results = []
for node in graph["nodes"]:
    result = generate_node_code.remote(node)
    results.append(result)
```

**What it MUST look like:**
```python
# CORRECT — parallel via Function.map
node_specs = [build_node_spec(node, graph) for node in graph["nodes"]]
results = list(generate_node_code.map(node_specs, order_outputs=False))
```

**Why this matters:** The entire architecture assumes 100+ simultaneous containers. Sequential execution turns a 25-second pipeline into a 500-second pipeline. The cost model, the user experience, and the competitive advantage all depend on parallelism.

**Tripwire:**
```bash
# Should NOT find for-loop calls to .remote() in the orchestrator
grep -n "for.*in.*nodes.*\n.*\.remote(" modal/prism/orchestrator.py
# Should find .map() calls
grep -n "\.map(" modal/prism/orchestrator.py
```

---

## RED LINE 3: Compute on Vercel

**What it looks like:**
```typescript
// WRONG — ML inference on the Express server
router.post('/build', async (req, res) => {
    const image = await generateImage(req.body.plan);  // GPU work on Vercel!
    const segments = await segmentImage(image);          // GPU work on Vercel!
```

**What it MUST look like:**
```typescript
// CORRECT — dispatch to Modal, return immediately
router.post('/plan/approve', async (req, res) => {
    await startPrismBuild({ ...config, callbackUrl });   // Fire to Modal
    return res.json({ status: 'generating' });            // Return immediately
```

**Why this matters:** Vercel has a 10-second function timeout on the free tier, 60 seconds on Pro. ML inference takes longer. Vercel has no GPU. The Express server is a thin router.

**Tripwire:**
```bash
# Should NOT find ML library imports in server/
grep -rn "import.*diffusers\|import.*torch\|import.*transformers\|import.*sglang" server/src/
# Should NOT find heavy processing in route handlers
grep -rn "await.*generate.*Image\|await.*segment\|await.*codegen" server/src/routes/
```

---

## RED LINE 4: WebSocket or Polling Introduction

**What it looks like:**
```typescript
// WRONG — new real-time channel
import { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ port: 8080 });

// WRONG — polling loop
setInterval(() => fetch('/api/prism/status/' + buildId), 1000);
```

**What it MUST look like:**
```typescript
// CORRECT — SSE via existing infrastructure
// Server: POST events to buildEvents table
// Client: useEngineEvents hook → EventSource → usePrismStore.handlePrismEvent
```

**Tripwire:**
```bash
grep -rn "WebSocket\|ws:\|wss:\|Socket\.IO\|socket\.io\|setInterval.*fetch\|polling" packages/prism-engine/ server/src/routes/prism* client/src/store/usePrism*
```

---

## RED LINE 5: Flat Array Instead of Bipartite DAG

**What it looks like:**
```typescript
// WRONG — flat node list with no hub structure
interface BadGraph {
    nodes: Node[];  // Just a flat list
    edges: Edge[];  // No hub concept
}
```

**What it MUST look like:**
```typescript
// CORRECT — bipartite DAG with hub memberships
interface PrismGraph {
    nodes: GraphNode[];     // Each has hubMemberships: string[]
    edges: GraphEdge[];     // Typed: contains, navigates-to, triggers, data-flow, shares-state
    hubs: Hub[];            // Each has nodeIds: string[], sharedNodeIds: string[]
}
```

**Why this matters:** The graph topology determines shared component handling, navigation, rendering optimization, and editing granularity. A flat array loses all of this.

**Tripwire:** Verify `GraphNode` has `hubMemberships` field. Verify `Hub` has `sharedNodeIds` field.

---

## RED LINE 6: Monolithic Bundle Instead of Per-Node Modules

**What it looks like:**
```
bundle/
    index.html
    app.js          ← One giant file with all node code
```

**What it MUST look like:**
```
bundle/
    index.html
    app.js              ← PixiJS setup + graph-to-tree adapter
    graph.json           ← Serialized knowledge graph
    nodes/
        {nodeId}.js      ← Per-node code module (one per node)
    atlases/
        atlas-0.png      ← Texture atlas
    fonts/
        {font}.fnt       ← MSDF font atlas
    shared/
        manager.js       ← Hub manager
        adapter.js       ← Graph-to-tree adapter
        animations.js    ← Shared animation utilities
        state.js         ← Application state management
```

**Why this matters:** Per-node modules enable single-node editing (regenerate one file, hot-swap it), parallel assembly, and granular caching.

---

## RED LINE 7: SGLang System Prompt Pollution

**What it looks like:**
```python
# WRONG — per-node content in system prompt
system_prompt = f"""You are a code generator.
Generate code for element: {node.caption}  # <-- THIS BREAKS RADIXATTENTION
Colors: {node.visual.colors}               # <-- THIS BREAKS RADIXATTENTION
"""
```

**What it MUST look like:**
```python
# CORRECT — system prompt is IDENTICAL, per-node in user message
system_prompt = """You are a code generator for Kriptik Prism...
CONSTRAINTS: [identical for all nodes]
OUTPUT: Only JavaScript code. No explanation."""

user_message = f"""ELEMENT SPECIFICATION:
{node.caption}
VISUAL: {node.visual}
BEHAVIOR: {node.behavior}
NEIGHBORS: {node.neighbors}
"""
```

**Why this matters:** RadixAttention caches KV entries for shared prompt prefixes. If the system prompt differs per-node, there is ZERO cache sharing across 100+ containers, eliminating the up to 6.4× throughput gain.

---

## RED LINE 8: DOM Text Rendering

**What it looks like:**
```javascript
// WRONG — DOM text for UI element labels
const label = document.createElement('div');
label.textContent = 'Submit';
label.style.position = 'absolute';
```

**What it MUST look like:**
```javascript
// CORRECT — PixiJS BitmapText or programmatic
const label = new BitmapText({ text: 'Submit', style: { fontFamily: 'Inter' } });
container.addChild(label);

// OR: Sharp+SVG composited into the element image during assembly
// OR: MSDF atlas rendering in WebGPU shader
```

**Only exception:** Transparent `<input>` overlays for interactive text fields.

---

## RED LINE 9: Cortex Pattern Contamination

**Watch for these Cortex concepts appearing in Prism code:**

| Cortex Concept | Prism Equivalent | If You See Cortex Pattern, You've Drifted |
|---------------|-----------------|------------------------------------------|
| Agent sessions | Pipeline stages | "agent" in prism code = WRONG |
| ESAA event sourcing | SSE events via buildEvents | "ESAA" in prism code = WRONG |
| Brain SQLite databases | Knowledge graph JSON | "brain" or "SQLite" in prism code = WRONG |
| Design Pioneer | FLUX.2 + SAM 3.1 | "pioneer" in prism code = WRONG |
| Anti-Slop verification | SWE-RM verification | "slop" in prism code = WRONG |
| Multi-agent orchestrator | Pipeline orchestrator | "multi-agent" in prism code = WRONG |
| Competitive generation (Cortex sense) | Parallel code gen (Prism sense) | Same term, different meaning |

**Tripwire:**
```bash
grep -rni "agent.*session\|esaa\|brain.*sqlite\|design.*pioneer\|anti.slop\|multi.agent" packages/prism-engine/ modal/prism/
```

---

## Session Hygiene Rules

1. **Re-read the spec section** at the start of each new phase, not from memory.
2. **Run tsc after every file.** Not every 5 files. Not at the end. Every. Single. File.
3. **Check the phase gate** before moving on. Not "I think I'm done." Mechanically verify each criterion.
4. **Search before creating.** A file or type may already exist from a previous task in this session.
5. **Never "temporarily" violate an invariant.** "I'll fix it later" means "I'll forget about it." Do it right the first time.
6. **When in doubt, re-read the spec.** Not "I'm pretty sure the spec says X." Open the file and read it.
