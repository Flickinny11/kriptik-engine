"""Kriptik Prism — Modal Diffusion Pipeline

Main Modal app definition. Defines all function entry points, images,
volumes, and secrets for the Prism diffusion engine.

App name: kriptik-prism (NOT kriptik-engine — that's the Cortex app).

INVARIANT 6: Modal executes, Vercel routes.
All GPU and CPU-intensive work runs here on Modal.
The Express server on Vercel is a thin API layer and event router.
"""

import modal

# ── App Definition ───────────────────────────────────────────────────

app = modal.App("kriptik-prism")

# ── Base Images ──────────────────────────────────────────────────────

# GPU image for FLUX.2, SAM 3.1
gpu_image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-runtime-ubuntu22.04")
    .apt_install("git", "wget", "libgl1-mesa-glx", "libglib2.0-0",
                 "python3", "python3-pip", "python3-dev")
    .run_commands("ln -sf /usr/bin/python3 /usr/bin/python")
    .pip_install(
        "torch==2.5.1", "torchvision", "transformers>=4.48",
        "diffusers>=0.32", "accelerate", "safetensors",
        # DEVIATION #1: sam2 PyPI package replaces spec's segment-anything-2
        "sam2",
        "Pillow", "numpy", "scipy",
        "httpx", "pydantic>=2.0",
    )
    .run_commands(
        # DEVIATION #2: FLUX.1-schnell replaces spec's FLUX.2-klein-4B
        'python -c "import torch; from diffusers import FluxPipeline; FluxPipeline.from_pretrained(\'black-forest-labs/FLUX.1-schnell\', torch_dtype=torch.float16)"',
        # DEVIATION #3: SAM 2.1 hiera-large replaces spec's SAM 3.1 Object Multiplex
        'python -c "import torch; from sam2.build_sam import build_sam2; from sam2.sam2_image_predictor import SAM2ImagePredictor; SAM2ImagePredictor.from_pretrained(\'facebook/sam2.1-hiera-large\')"',
    )
)

# CPU image for assembly, planning, orchestration
cpu_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("nodejs", "npm")
    .pip_install(
        "httpx", "pydantic>=2.0", "numpy", "Pillow",
        "boto3",  # For R2 uploads (S3-compatible)
    )
    .run_commands(
        "npm install -g typescript tsx",
    )
)

# Code generation image (SGLang + model weights)
codegen_image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-runtime-ubuntu22.04")
    .apt_install("python3", "python3-pip", "python3-dev")
    .run_commands("ln -sf /usr/bin/python3 /usr/bin/python")
    .pip_install(
        "sglang[all]>=0.4", "torch==2.5.1",
        "transformers>=4.48", "autoawq",
        "httpx", "pydantic>=2.0",
    )
    .run_commands(
        # DEVIATION #4: Qwen2.5-Coder-32B-Instruct-AWQ replaces spec's Qwen3-Coder-Next-80B-A3B-AWQ
        'python -c "from transformers import AutoModelForCausalLM, AutoTokenizer; AutoTokenizer.from_pretrained(\'Qwen/Qwen2.5-Coder-32B-Instruct-AWQ\'); AutoModelForCausalLM.from_pretrained(\'Qwen/Qwen2.5-Coder-32B-Instruct-AWQ\', device_map=\'auto\')"',
    )
)

# ── Volumes ──────────────────────────────────────────────────────────

prism_cache = modal.Volume.from_name("kriptik-prism-cache", create_if_missing=True)
prism_outputs = modal.Volume.from_name("kriptik-prism-outputs", create_if_missing=True)

# ── Secrets ──────────────────────────────────────────────────────────

secrets = modal.Secret.from_name("kriptik-prism-env")


# ══════════════════════════════════════════════════════════════════════
#  Pipeline Functions
# ══════════════════════════════════════════════════════════════════════


@app.function(
    image=gpu_image,
    gpu="L40S",
    timeout=120,
    secrets=[secrets],
    volumes={"/cache": prism_cache, "/outputs": prism_outputs},
)
def generate_ui_image(plan_data: dict) -> dict:
    """FLUX.2 Klein: plan -> full-page UI mockup image.

    Generates one image per hub (page) in the plan.
    Returns: { "hubId": str, "imagePath": str, "r2Key": str,
               "dimensions": {...}, "generationTimeMs": int }
    """
    from prism.flux_worker import generate_hub_image

    hub = plan_data.get("hub", {})
    plan = plan_data.get("plan", {})
    project_id = plan_data.get("projectId", "unknown")
    version = plan_data.get("version", 1)

    return generate_hub_image(hub, plan, project_id, version)


@app.function(
    image=gpu_image,
    gpu="L4",
    timeout=60,
    secrets=[secrets],
    volumes={"/cache": prism_cache, "/outputs": prism_outputs},
)
def segment_ui_image(image_data: dict, plan_data: dict) -> dict:
    """SAM 3.1 + Object Multiplex: full-page image -> segmented elements.

    Processes up to 16 objects per forward pass.
    For typical 20-50 element UI: 2-3 forward passes.
    Returns: { "segments": [...], "hierarchy": {...}, "segmentationTimeMs": int }
    """
    from prism.sam_worker import segment_hub_image

    return segment_hub_image(
        image_bytes=image_data.get("imageBytes", b""),
        elements=plan_data.get("elements", []),
        hub_id=image_data.get("hubId", ""),
        project_id=plan_data.get("projectId", ""),
        version=plan_data.get("version", 1),
    )


@app.function(
    image=gpu_image,
    gpu="L4",
    timeout=60,
    secrets=[secrets],
)
def verify_captions(nodes_with_images: list[dict]) -> list[dict]:
    """Vision model: segmented element image + caption -> binary pass/fail.

    Verifies each node's caption accurately describes its visual element
    BEFORE code generation begins.
    Returns: [{ "nodeId": str, "pass": bool, "correctedCaption": str | None }]
    """
    from prism.verify_worker import verify_captions as _verify_captions

    return _verify_captions(nodes_with_images)


@app.function(
    image=codegen_image,
    gpu="L4",
    timeout=30,
    secrets=[secrets],
    volumes={"/cache": prism_cache},
    min_containers=50,
    buffer_containers=50,
)
def generate_node_code(node_spec: dict) -> dict:
    """SGLang + Qwen3-Coder: node caption -> PixiJS/JS code.

    INVARIANT 9: System prompt is IDENTICAL for ALL containers.
    All node-specific content in the user message only.
    This enables RadixAttention prefix cache sharing (up to 6.4x throughput).

    Returns: { "nodeId": str, "code": str, "tokensUsed": int, "generationTimeMs": int }
    """
    from prism.codegen_worker import generate_code

    return generate_code(node_spec)


@app.function(
    image=codegen_image,
    gpu="L4",
    timeout=30,
    secrets=[secrets],
    volumes={"/cache": prism_cache},
)
def verify_node_code(node_code: dict, node_spec: dict) -> dict:
    """SWE-RM: code + spec -> verification score.

    Thresholds:
    - >= 0.85: Pass
    - 0.60-0.84: Borderline (regenerate)
    - < 0.60: Fail (regenerate + escalate)

    Returns: { "nodeId": str, "score": float, "pass": bool, "issues": [...] }
    """
    from prism.verify_worker import verify_node_code as _verify_node_code

    return _verify_node_code(node_code, node_spec)


@app.function(
    image=cpu_image,
    timeout=60,
    secrets=[secrets],
    volumes={"/outputs": prism_outputs},
)
def assemble_pixijs_bundle(graph_data: dict) -> dict:
    """CPU: verified graph -> PixiJS application bundle.

    INVARIANT 1: The graph IS the app. graph.json is included in the bundle
    and used at runtime. It is NOT compiled away.

    RED LINE 6: Per-node modules (nodes/{id}.js), NOT monolithic bundle.

    Returns: { "bundlePath": str, "bundleSize": int, "nodeCount": int }
    """
    from prism.assembly_worker import assemble_bundle

    return assemble_bundle(
        graph=graph_data.get("graph", {}),
        atlas_data=graph_data.get("atlasData", {}),
        output_dir=graph_data.get("outputDir", "/outputs"),
    )


@app.function(
    image=cpu_image,
    timeout=300,
    secrets=[secrets],
    volumes={"/outputs": prism_outputs},
)
def generate_backend(contract_data: dict) -> dict:
    """Backend code generation from pre-existing tRPC contract.

    INVARIANT 4: Contract-first. The tRPC router + Zod schemas
    are generated DURING planning, BEFORE any code generation.
    This function generates implementation code AGAINST the contract.

    Returns: { "endpoints": [...], "dataModels": [...], "generationTimeMs": int }
    """
    from prism.backend_worker import generate_backend as _generate_backend

    return _generate_backend(
        contract=contract_data.get("contract", {}),
        config=contract_data.get("config", {}),
    )


@app.function(
    image=cpu_image,
    timeout=3600,
    secrets=[secrets],
    volumes={"/outputs": prism_outputs},
)
@modal.concurrent(max_inputs=100)
@modal.web_server(8080)
def serve_preview():
    """Dev server + Modal tunnel for live preview.

    Serves assembled PixiJS bundles via HTTPS tunnel.
    Multi-project mode: URL path /{projectId}/{version}/... resolves to
    /outputs/{projectId}/{version}/bundles/frontend/... on the shared volume.
    Hot-reload support for single-node edits via SSE (Invariant 5).

    Modal's @web_server decorator provides the HTTPS tunnel URL.
    The deterministic URL is: https://kriptik-prism--serve-preview.modal.run/
    """
    from prism.preview_server import start_preview_server_multi

    start_preview_server_multi(output_root="/outputs", port=8080)


@app.function(
    image=cpu_image,
    timeout=300,
    secrets=[secrets],
)
def generate_prism_plan(config: dict) -> dict:
    """Planning-only endpoint: prompt -> AppIntent -> InferredNeeds -> PrismPlan.

    Separate from the full pipeline. Used for the interactive planning flow:
    1. User enters prompt
    2. Server dispatches to this function
    3. This function runs intent parsing + needs mapping + plan generation
    4. Posts the generated plan back via planCallbackUrl
    5. Client shows plan in PlanApprovalView
    6. User approves -> server dispatches run_prism_pipeline

    Config shape:
    {
      "planId": str,
      "projectId": str,
      "prompt": str,
      "callbackUrl": str,         -- for SSE events
      "planCallbackUrl": str,     -- for plan data persistence
      "appContext": dict | None,  -- connected services, credentials, etc.
      "previousPlan": dict | None, -- for re-generation after rejection
      "feedback": str | None,     -- user feedback on rejected plan
    }
    """
    from prism.planning import (
        parse_intent,
        map_inferred_needs,
        generate_plan,
        regenerate_plan_with_feedback,
    )
    from prism.orchestrator import emit_event

    callback_url = config["callbackUrl"]
    plan_callback_url = config["planCallbackUrl"]
    plan_id = config["planId"]
    project_id = config["projectId"]
    prompt = config["prompt"]
    previous_plan = config.get("previousPlan")
    feedback = config.get("feedback")

    def emit(event_type: str, data: dict, **kwargs):
        emit_event(callback_url, event_type, data, **kwargs)

    try:
        if previous_plan and feedback:
            # Re-generation with feedback
            emit("prism_build_progress", {
                "phase": "planning",
                "message": "Revising plan based on your feedback...",
            }, phase="planning", progress=5)

            plan = regenerate_plan_with_feedback(previous_plan, feedback)
        else:
            # Fresh planning pipeline
            # Step 1: Intent parsing
            emit("prism_build_progress", {
                "phase": "planning",
                "message": "Analyzing your prompt...",
            }, phase="planning", progress=2)

            intent = parse_intent(prompt, config.get("appContext"))

            emit("prism_intent_parsed", {
                "appType": intent.get("appType", "custom"),
                "confidence": intent.get("confidenceScore", 0),
                "featureCount": len(intent.get("features", [])),
            }, phase="planning", progress=5)

            # Step 2: Inferred needs mapping
            inferred_needs = map_inferred_needs(intent)

            emit("prism_needs_inferred", {
                "inferredCount": len(inferred_needs),
                "sources": list({n.get("source", "") for n in inferred_needs}),
            }, phase="planning", progress=8)

            # Step 3: Plan generation (includes backend contract — Invariant 4)
            emit("prism_build_progress", {
                "phase": "planning",
                "message": "Generating build plan...",
            }, phase="planning", progress=10)

            plan = generate_plan(intent, inferred_needs, project_id)

        # Post the generated plan to the plan callback
        import httpx
        try:
            httpx.post(
                plan_callback_url,
                json={"planId": plan_id, "plan": plan},
                timeout=10,
            )
        except httpx.HTTPError as e:
            emit("prism_build_error", {
                "phase": "planning",
                "message": "Failed to persist generated plan",
                "recoverable": True,
                "suggestion": "Try generating the plan again",
            }, phase="planning", progress=0)
            raise

        emit("prism_plan_generated", {
            "planId": plan_id,
            "hubCount": len(plan.get("graph", {}).get("hubs", [])),
            "elementCount": sum(
                len(h.get("elements", []))
                for h in plan.get("graph", {}).get("hubs", [])
            ),
            "hasBackendContract": bool(plan.get("backendContract")),
            "estimatedCost": plan.get("estimatedCost", 0),
            "estimatedTimeSeconds": plan.get("estimatedTimeSeconds", 0),
        }, phase="planning", progress=15)

        return plan

    except Exception as e:
        emit("prism_build_error", {
            "phase": "planning",
            "message": f"Planning failed: {str(e)}",
            "recoverable": True,
            "suggestion": "Try rephrasing your prompt or simplifying the request",
        }, phase="planning", progress=0)
        raise


@app.function(
    image=cpu_image,
    timeout=120,
    secrets=[secrets],
    volumes={"/cache": prism_cache, "/outputs": prism_outputs},
)
def edit_node(config: dict):
    """Single-node edit: regenerate ONLY the edited node's code.

    Phase 9: Editing & Iteration.

    Receives edit config from Express server, executes the single-node
    edit pipeline. ONLY the edited node's code regenerates ($0.001-0.01).
    Neighbor nodes are NOT regenerated. Atlas is NOT repacked.
    Graph version increments. Preview updates via hot-reload within 5s.

    Config shape:
    {
      "projectId": str,
      "graphId": str,
      "nodeId": str,
      "graphVersion": int,
      "changes": { "caption"?: str, "visualSpec"?: dict, "behaviorSpec"?: dict },
      "callbackUrl": str,
      "r2Config": dict,
    }

    Events flow: Modal -> POST callbackUrl -> Express -> buildEvents -> SSE
    """
    from prism.orchestrator import edit_single_node

    edit_single_node(config, modal_fns={
        "generate_node_code": generate_node_code,
        "verify_node_code": verify_node_code,
    })


@app.function(
    image=cpu_image,
    timeout=1800,
    secrets=[secrets],
    volumes={"/cache": prism_cache, "/outputs": prism_outputs},
)
def run_prism_pipeline(config: dict):
    """Main pipeline orchestrator.

    Receives config from Express server, executes the full 22-step pipeline.
    Streams NDJSON events to stdout and POSTs to callbackUrl.

    Config shape:
    {
      "projectId": str,
      "userId": str,
      "planId": str,
      "plan": PrismPlan dict,
      "callbackUrl": str,
      "credentials": dict,
      "r2Config": dict,
    }

    Events flow: Modal -> POST callbackUrl -> Express -> buildEvents table -> SSE
    """
    from prism.orchestrator import run_pipeline

    # Pass Modal function handles for parallel dispatch.
    # _parallel_map detects .map() on these and uses
    # Function.map(order_outputs=False) for 100+ container parallelism.
    run_pipeline(config, modal_fns={
        "generate_node_code": generate_node_code,
        "verify_node_code": verify_node_code,
    })


# ══════════════════════════════════════════════════════════════════════
#  Health Check
# ══════════════════════════════════════════════════════════════════════


@app.function(image=cpu_image, timeout=10)
def health() -> dict:
    """Health check endpoint.

    Returns pipeline status and available workers.
    """
    import time

    return {
        "status": "ok",
        "app": "kriptik-prism",
        "timestamp": time.time(),
        "workers": {
            "generate_ui_image": "L40S",
            "segment_ui_image": "L4",
            "generate_node_code": "L4 (min=50, buffer=50)",
            "verify_node_code": "L4",
            "assemble_pixijs_bundle": "CPU",
            "generate_backend": "CPU",
            "serve_preview": "CPU",
            "run_prism_pipeline": "CPU",
            "edit_node": "CPU (single-node regen, timeout=120)",
        },
    }


# ══════════════════════════════════════════════════════════════════════
#  Local Entry Point (for testing)
# ══════════════════════════════════════════════════════════════════════

import os

if __name__ == "__main__":
    print("Kriptik Prism Modal App")
    print("Deploy with: modal deploy modal/prism_app.py")
    print("Test with:   modal run modal/prism_app.py::health")
