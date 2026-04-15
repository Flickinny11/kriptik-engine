"""Main pipeline orchestrator for Prism diffusion engine.

Executes the 22-step pipeline sequence. Receives config from the Express server
via Modal function call. Streams events back via callbackUrl POST requests.

Pipeline order is SACRED — never reorder, skip, or merge stages:
 1. Dependency pre-installation
 2. FLUX.2 image generation (per hub)
 3. SAM 3.1 segmentation (per hub image)
 4. Post-segmentation verification
 5. Knowledge graph construction
 6. Caption verification blast
 7. Caption repair (if needed)
 8. Texture atlas packing
 9. Parallel code generation (100+ SGLang containers)
10. SWE-RM verification
11. Contamination-aware repair (first pass)
12. Contamination-aware repair (second pass — error description only)
13. Escalation to frontier model (third pass)
14. PixiJS bundle assembly
15. Backend contract application
16. Parallel backend code generation
17. Convergence gate (tsc + AJV + route resolution)
18. Bundle upload to R2
19. Preview server via Modal tunnel
20. Final event emission
21. Cost calculation
22. Build complete

INVARIANT 6: Modal executes, Vercel routes. All compute happens here.
"""

import json
import time
import os
import hashlib

import httpx


def emit_event(callback_url: str, event_type: str, data: dict, **kwargs):
    """POST an event to the callback URL and print NDJSON to stdout.

    The Express server persists these to the buildEvents table,
    which feeds into the SSE stream (Invariant 5).
    """
    event = {
        "type": event_type,
        "data": data,
        "timestamp": time.time(),
        **kwargs,
    }
    try:
        httpx.post(callback_url, json=event, timeout=5)
    except httpx.HTTPError:
        pass  # Non-fatal: log events are best-effort
    print(json.dumps(event), flush=True)


def run_pipeline(config: dict, modal_fns: dict | None = None):
    """Execute the full Prism build pipeline.

    Config shape:
    {
      "projectId": str,
      "userId": str,
      "planId": str,
      "plan": dict (PrismPlan),
      "callbackUrl": str,
      "credentials": dict,
      "r2Config": dict,
    }

    modal_fns: Optional dict of Modal Function handles for parallel dispatch.
    When running in Modal, prism_app.py passes these so _parallel_map can
    use Function.map() with order_outputs=False for true parallelism.
    Keys: "generate_node_code", "verify_node_code"
    """
    callback_url = config["callbackUrl"]
    project_id = config["projectId"]
    plan = config["plan"]
    start_time = time.time()
    version = 1  # First build version

    # Resolve Modal function handles for parallel dispatch.
    # When modal_fns is provided (by prism_app.py), _parallel_map uses
    # Function.map(order_outputs=False) for true 100+ container parallelism.
    _modal_fns = modal_fns or {}
    codegen_fn = _modal_fns.get("generate_node_code")
    verify_fn = _modal_fns.get("verify_node_code")

    def emit(event_type: str, data: dict, **kwargs):
        emit_event(callback_url, event_type, data, **kwargs)

    try:
        # ── Step 1: Dependency Pre-Installation ──────────────────────
        emit("prism_deps_installing", {}, phase="deps", progress=2)

        from .planning import preinstall_dependencies
        deps_result = preinstall_dependencies(plan)

        emit("prism_deps_installed", {
            "installed": deps_result["installed"],
            "failed": deps_result["failed"],
        }, phase="deps", progress=4)

        # ── Step 2: FLUX.2 Image Generation (per hub) ───────────────
        emit("prism_image_generating", {
            "model": plan.get("intent", {}).get("diffusionModel", "flux2-klein"),
            "hubCount": len(plan.get("graph", {}).get("hubs", [])),
        }, phase="generation", progress=5)

        from .flux_worker import generate_all_hub_images
        image_results = generate_all_hub_images(plan, project_id, version)

        emit("prism_image_ready", {
            "hubImages": len(image_results),
            "imageUrls": [r["r2Key"] for r in image_results],
        }, phase="generation", progress=15)

        # ── Step 3: SAM 3.1 Segmentation (per hub image) ────────────
        emit("prism_segmentation_started", {
            "hubCount": len(image_results),
        }, phase="generation", progress=18)

        from .sam_worker import segment_hub_image
        all_segments: list[dict] = []
        for img_result in image_results:
            hub_id = img_result["hubId"]
            hub = next(
                (h for h in plan.get("graph", {}).get("hubs", []) if h["id"] == hub_id),
                None,
            )
            if not hub:
                continue

            # Read image bytes from output volume
            image_path = img_result.get("imagePath", "")
            image_bytes = b""
            if image_path and os.path.exists(image_path):
                with open(image_path, "rb") as f:
                    image_bytes = f.read()

            seg_result = segment_hub_image(
                image_bytes=image_bytes,
                elements=hub.get("elements", []),
                hub_id=hub_id,
                project_id=project_id,
                version=version,
            )
            all_segments.append(seg_result)

        total_segments = sum(len(s.get("segments", [])) for s in all_segments)
        emit("prism_segmentation_complete", {
            "nodeCount": total_segments,
        }, phase="generation", progress=25)

        # ── Step 4: Post-Segmentation Verification ──────────────────
        emit("prism_segmentation_verifying", {
            "totalSegments": total_segments,
        }, phase="generation", progress=26)

        from .verify_worker import verify_segmentation_results

        seg_verification_passed = True
        for seg_result in all_segments:
            hub_id = seg_result.get("hubId", "")
            hub = next(
                (h for h in plan.get("graph", {}).get("hubs", []) if h["id"] == hub_id),
                None,
            )
            if not hub:
                continue

            # Load hub image for vision verification
            hub_image_b64 = ""
            img_result = next(
                (r for r in image_results if r["hubId"] == hub_id), None
            )
            if img_result:
                image_path = img_result.get("imagePath", "")
                if image_path and os.path.exists(image_path):
                    import base64
                    with open(image_path, "rb") as f:
                        hub_image_b64 = base64.b64encode(f.read()).decode("utf-8")

            verification = verify_segmentation_results(
                hub_image_b64=hub_image_b64,
                segments=seg_result.get("segments", []),
                planned_elements=hub.get("elements", []),
                hierarchy=seg_result.get("hierarchy", {"roots": [], "children": {}}),
            )

            if not verification["pass"]:
                seg_verification_passed = False
                emit("prism_segmentation_verify_failed", {
                    "hubId": hub_id,
                    "reason": verification["reason"],
                    "missingElements": verification["missingElements"],
                }, phase="generation", progress=27)

        if seg_verification_passed:
            emit("prism_segmentation_verified", {
                "result": "pass",
            }, phase="generation", progress=28)

        # ── Step 5-6: Graph Construction ────────────────────────────
        from .utils.graph import construct_knowledge_graph
        flat_seg = {
            "segments": [],
            "hierarchy": {"roots": [], "children": {}},
        }
        for seg in all_segments:
            flat_seg["segments"].extend(seg.get("segments", []))
            flat_seg["hierarchy"]["roots"].extend(
                seg.get("hierarchy", {}).get("roots", [])
            )
            flat_seg["hierarchy"]["children"].update(
                seg.get("hierarchy", {}).get("children", {})
            )

        graph = construct_knowledge_graph(plan, flat_seg)

        emit("prism_graph_constructed", {
            "nodes": len(graph.get("nodes", [])),
            "edges": len(graph.get("edges", [])),
            "hubs": len(graph.get("hubs", [])),
        }, phase="graph", progress=30)

        # ── Step 6: Caption Verification Blast ───────────────────────
        emit("prism_caption_verify_started", {
            "totalNodes": len(graph.get("nodes", [])),
        }, phase="caption_verify", progress=32)

        from .verify_worker import verify_captions, regenerate_caption

        nodes_with_images = [
            {
                "nodeId": node["id"],
                "imageUrl": node.get("imageUrl", ""),
                "caption": node["caption"],
            }
            for node in graph["nodes"]
            if node.get("imageUrl")
        ]

        caption_results = verify_captions(nodes_with_images)

        # ── Step 7: Caption Repair ───────────────────────────────────
        failed_captions = [r for r in caption_results if not r["pass"]]
        repaired_count = 0

        if failed_captions:
            for result in failed_captions:
                node = next(
                    (n for n in graph["nodes"] if n["id"] == result["nodeId"]),
                    None,
                )
                if not node:
                    continue

                if result.get("correctedCaption"):
                    node["caption"] = result["correctedCaption"]
                    node["captionVerified"] = True
                    repaired_count += 1
                    emit("prism_caption_verify_node_result", {
                        "nodeId": result["nodeId"],
                        "pass": False,
                        "repaired": True,
                    }, phase="caption_verify", progress=33, nodeId=result["nodeId"])
                else:
                    regenerated = regenerate_caption(node, plan)
                    node["caption"] = regenerated
                    # Re-verify
                    reverify = verify_captions([{
                        "nodeId": node["id"],
                        "imageUrl": node.get("imageUrl", ""),
                        "caption": regenerated,
                    }])
                    if reverify and reverify[0].get("pass"):
                        node["captionVerified"] = True
                        repaired_count += 1
                    else:
                        node["status"] = "failed"
                        emit("prism_caption_verify_node_result", {
                            "nodeId": node["id"],
                            "pass": False,
                            "repaired": False,
                            "flaggedForReview": True,
                        }, phase="caption_verify", progress=33, nodeId=node["id"])

        # Mark passing nodes
        for result in caption_results:
            if result["pass"]:
                node = next(
                    (n for n in graph["nodes"] if n["id"] == result["nodeId"]),
                    None,
                )
                if node:
                    node["captionVerified"] = True

        total_verified = sum(1 for n in graph["nodes"] if n.get("captionVerified"))
        total_failed = sum(1 for n in graph["nodes"] if n.get("status") == "failed")

        emit("prism_caption_verify_complete", {
            "totalVerified": total_verified,
            "totalFailed": total_failed,
            "totalRepaired": repaired_count,
        }, phase="caption_verify", progress=35)

        # ── Step 8: Texture Atlas Packing ────────────────────────────
        from .utils.atlas import pack_texture_atlases

        node_images: list[dict] = []
        for node in graph["nodes"]:
            if node.get("imageUrl") and node.get("captionVerified"):
                image_path = node.get("imageUrl", "")
                image_bytes = b""
                if os.path.exists(image_path):
                    with open(image_path, "rb") as f:
                        image_bytes = f.read()
                if image_bytes:
                    node_images.append({
                        "nodeId": node["id"],
                        "imageBytes": image_bytes,
                        "width": node["position"].get("width", 100),
                        "height": node["position"].get("height", 100),
                    })

        atlas_result = pack_texture_atlases(node_images)

        # Update graph nodes with atlas regions
        for node_id, region in atlas_result.get("regions", {}).items():
            node = next(
                (n for n in graph["nodes"] if n["id"] == node_id), None
            )
            if node:
                node["atlasRegion"] = region

        emit("prism_atlas_packed", {
            "atlasCount": atlas_result.get("count", 0),
        }, phase="graph", progress=37)

        # ── Step 9: Parallel Code Generation ─────────────────────────
        # Only generate code for caption-verified nodes
        verified_nodes = [
            n for n in graph["nodes"] if n.get("captionVerified")
        ]

        emit("prism_codegen_started", {
            "totalNodes": len(verified_nodes),
        }, phase="codegen", progress=38)

        from .codegen_worker import build_node_spec, generate_code

        node_specs = [build_node_spec(node, graph) for node in verified_nodes]

        # Fire all code gen tasks in parallel via Function.map()
        # When codegen_fn is a Modal Function handle, _parallel_map uses
        # Function.map(order_outputs=False) for 100+ simultaneous containers.
        # Otherwise falls back to local sequential execution.
        _codegen = codegen_fn or generate_code
        code_results = _parallel_map(_codegen, node_specs)

        # Update graph nodes with generated code
        for result in code_results:
            node = next(
                (n for n in graph["nodes"] if n["id"] == result.get("nodeId")),
                None,
            )
            if node and result.get("code"):
                node["code"] = result["code"]
                node["codeHash"] = hashlib.sha256(
                    result["code"].encode()
                ).hexdigest()[:16]
                node["status"] = "code_generated"

        emit("prism_codegen_batch_complete", {
            "completed": len(code_results),
        }, phase="codegen", progress=55)

        # ── Step 10: SWE-RM Verification ─────────────────────────────
        emit("prism_verification_started", {}, phase="verification", progress=58)

        from .verify_worker import verify_node_code, describe_error_naturally

        _verify = verify_fn or verify_node_code
        verify_results = _parallel_map_pair(
            _verify, code_results, node_specs
        )

        passed_nodes = [r for r in verify_results if r.get("pass")]
        failed_nodes = [r for r in verify_results if not r.get("pass")]

        # Update graph with verification scores
        for result in verify_results:
            node = next(
                (n for n in graph["nodes"] if n["id"] == result.get("nodeId")),
                None,
            )
            if node:
                node["verificationScore"] = result.get("score", 0.0)
                if result.get("pass"):
                    node["status"] = "verified"

        emit("prism_verification_complete" if not failed_nodes else "prism_verification_started", {
            "passed": len(passed_nodes),
            "failed": len(failed_nodes),
        }, phase="verification", progress=62)

        # ── Steps 11-13: Contamination-Aware Repair ──────────────────
        if failed_nodes:
            emit("prism_repair_started", {
                "failedNodes": len(failed_nodes),
            }, phase="repair", progress=65)

            from .codegen_worker import build_repair_spec

            # --- First repair pass: spec-only regeneration ---
            # DELETE failed code, regenerate from spec ONLY (Invariant 3)
            repair_specs = []
            for result in failed_nodes:
                node = next(
                    (n for n in graph["nodes"] if n["id"] == result.get("nodeId")),
                    None,
                )
                if node:
                    # DELETE the failed code from memory
                    node["code"] = None
                    node["codeHash"] = None
                    repair_specs.append(build_repair_spec(node, attempt=1))

            repair_results = _parallel_map(_codegen, repair_specs)
            repair_verify = _parallel_map_pair(
                _verify, repair_results, repair_specs
            )

            still_failed = [r for r in repair_verify if not r.get("pass")]

            # Update repaired nodes
            for result in repair_verify:
                if result.get("pass"):
                    node = next(
                        (n for n in graph["nodes"] if n["id"] == result.get("nodeId")),
                        None,
                    )
                    if node:
                        code_result = next(
                            (cr for cr in repair_results if cr.get("nodeId") == result.get("nodeId")),
                            None,
                        )
                        if code_result and code_result.get("code"):
                            node["code"] = code_result["code"]
                            node["codeHash"] = hashlib.sha256(
                                code_result["code"].encode()
                            ).hexdigest()[:16]
                            node["verificationScore"] = result.get("score", 0.0)
                            node["status"] = "verified"
                    emit("prism_repair_node_regenerated", {
                        "nodeId": result.get("nodeId"),
                        "attempt": 1,
                        "score": result.get("score", 0.0),
                    }, phase="repair", progress=68, nodeId=result.get("nodeId"))

            # --- Second repair pass: error description only ---
            if still_failed:
                second_repair_specs = []
                for result in still_failed:
                    node = next(
                        (n for n in graph["nodes"] if n["id"] == result.get("nodeId")),
                        None,
                    )
                    if node:
                        # DELETE code again
                        node["code"] = None
                        node["codeHash"] = None
                        # Generate NATURAL LANGUAGE error description (Invariant 3)
                        node_spec = next(
                            (s for s in node_specs if s.get("nodeId") == node["id"]),
                            None,
                        )
                        error_desc = describe_error_naturally(result, node_spec or {})
                        second_repair_specs.append(
                            build_repair_spec(node, attempt=2, error_description=error_desc)
                        )

                second_repair_results = _parallel_map(_codegen, second_repair_specs)
                second_repair_verify = _parallel_map_pair(
                    _verify, second_repair_results, second_repair_specs
                )

                escalated = [r for r in second_repair_verify if not r.get("pass")]

                for result in second_repair_verify:
                    if result.get("pass"):
                        node = next(
                            (n for n in graph["nodes"] if n["id"] == result.get("nodeId")),
                            None,
                        )
                        if node:
                            code_result = next(
                                (cr for cr in second_repair_results if cr.get("nodeId") == result.get("nodeId")),
                                None,
                            )
                            if code_result and code_result.get("code"):
                                node["code"] = code_result["code"]
                                node["codeHash"] = hashlib.sha256(
                                    code_result["code"].encode()
                                ).hexdigest()[:16]
                                node["verificationScore"] = result.get("score", 0.0)
                                node["status"] = "verified"
                        emit("prism_repair_node_regenerated", {
                            "nodeId": result.get("nodeId"),
                            "attempt": 2,
                            "score": result.get("score", 0.0),
                        }, phase="repair", progress=70, nodeId=result.get("nodeId"))

                # --- Third pass: Escalation to frontier model (Claude Opus 4.6) ---
                if escalated:
                    from .verify_worker import escalate_to_frontier

                    frontier_still_failed = []
                    for result in escalated:
                        node_id = result.get("nodeId")
                        node = next(
                            (n for n in graph["nodes"] if n["id"] == node_id),
                            None,
                        )
                        if not node:
                            continue

                        # DELETE code again (Invariant 3)
                        node["code"] = None
                        node["codeHash"] = None

                        # Build natural language error description
                        node_spec = next(
                            (s for s in node_specs if s.get("nodeId") == node_id),
                            None,
                        )
                        error_desc = describe_error_naturally(result, node_spec or {})

                        try:
                            frontier_result = escalate_to_frontier(
                                node=node,
                                error_description=error_desc,
                                graph=graph,
                            )

                            if frontier_result.get("code"):
                                node["code"] = frontier_result["code"]
                                node["codeHash"] = hashlib.sha256(
                                    frontier_result["code"].encode()
                                ).hexdigest()[:16]

                                # Verify the frontier-generated code
                                frontier_verify = verify_node_code(
                                    frontier_result, node_spec or {}
                                )
                                node["verificationScore"] = frontier_verify.get("score", 0.0)

                                if frontier_verify.get("pass"):
                                    node["status"] = "verified"
                                    node["escalated"] = True
                                    emit("prism_repair_node_regenerated", {
                                        "nodeId": node_id,
                                        "attempt": 3,
                                        "score": frontier_verify.get("score", 0.0),
                                        "model": "claude-opus-4-20250514",
                                    }, phase="repair", progress=71, nodeId=node_id)
                                else:
                                    node["status"] = "failed"
                                    node["escalated"] = True
                                    frontier_still_failed.append(result)
                                    emit("prism_repair_escalated", {
                                        "nodeId": node_id,
                                        "reason": "Failed verification even after frontier model escalation",
                                    }, phase="repair", progress=71, nodeId=node_id)
                            else:
                                node["status"] = "failed"
                                frontier_still_failed.append(result)
                        except Exception as exc:
                            node["status"] = "failed"
                            frontier_still_failed.append(result)
                            emit("prism_repair_escalated", {
                                "nodeId": node_id,
                                "reason": f"Frontier model escalation failed: {type(exc).__name__}",
                            }, phase="repair", progress=71, nodeId=node_id)

                    still_failed = frontier_still_failed

            total_repaired = len(failed_nodes) - len(still_failed)
            emit("prism_repair_complete", {
                "repairedNodes": total_repaired,
                "escalatedNodes": len(still_failed),
            }, phase="repair", progress=72)

        # ── Step 14: PixiJS Bundle Assembly ──────────────────────────
        emit("prism_assembly_started", {}, phase="assembly", progress=75)

        from .assembly_worker import assemble_bundle

        bundle_result = assemble_bundle(
            graph=graph,
            atlas_data=atlas_result,
            output_dir=f"/outputs/{project_id}/{version}/bundles/frontend",
        )

        emit("prism_assembly_complete", {
            "bundleSize": bundle_result.get("bundleSize", 0),
            "nodeCount": bundle_result.get("nodeCount", 0),
        }, phase="assembly", progress=82)

        # ── Steps 15-17: Backend Generation + Convergence Gate ───────
        backend_contract = plan.get("backendContract")
        backend_result = None

        if backend_contract and backend_contract.get("apiEndpoints"):
            emit("prism_backend_codegen_started", {
                "endpoints": len(backend_contract.get("apiEndpoints", [])),
            }, phase="backend", progress=78)

            from .backend_worker import (
                generate_backend,
                run_convergence_gate,
                build_backend_manifest,
            )

            backend_result = generate_backend(backend_contract, config)

            emit("prism_backend_codegen_complete", {
                "endpoints": len(backend_result.get("endpoints", [])),
            }, phase="backend", progress=88)

            # Convergence gate
            convergence = run_convergence_gate(graph, bundle_result, backend_result)

            emit("prism_convergence_gate_result", {
                "passed": convergence.get("passed", False),
                "issues": convergence.get("issues", []),
            }, phase="backend", progress=92)

            # Wire backend manifest to graph
            manifest = build_backend_manifest(
                backend_result,
                backend_result.get("deploymentConfigs", {}),
            )
            graph["backendManifest"] = manifest

        # ── Step 18: Upload to R2 ────────────────────────────────────
        _upload_to_r2(config, graph, bundle_result, atlas_result, project_id, version)

        # ── Step 19: Preview Server ──────────────────────────────────
        # The serve_preview Modal function runs as a @web_server on the
        # shared /outputs volume in multi-project mode. Its URL is
        # deterministic: {MODAL_PRISM_PREVIEW_URL}/{projectId}/{version}/
        # The function is already deployed — no need to start it here.
        preview_base = os.environ.get(
            "MODAL_PRISM_PREVIEW_URL",
            "https://kriptik-prism--serve-preview.modal.run",
        )
        preview_url = f"{preview_base.rstrip('/')}/{project_id}/{version}/"

        emit("prism_preview_ready", {
            "previewUrl": preview_url,
        }, phase="deployment", progress=98)

        # ── Steps 20-22: Final Events ────────────────────────────────
        total_time_ms = int((time.time() - start_time) * 1000)
        total_cost = _calculate_cost(graph)

        # Persist final graph to output volume
        graph_path = f"/outputs/{project_id}/{version}/graph.json"
        os.makedirs(os.path.dirname(graph_path), exist_ok=True)
        with open(graph_path, "w") as f:
            json.dump(graph, f)

        emit("prism_build_complete", {
            "previewUrl": preview_url,
            "totalNodes": len(graph.get("nodes", [])),
            "verifiedNodes": sum(
                1 for n in graph["nodes"] if n.get("status") == "verified"
            ),
            "failedNodes": sum(
                1 for n in graph["nodes"] if n.get("status") == "failed"
            ),
            "totalTimeMs": total_time_ms,
            "totalCost": total_cost,
        }, phase="deployment", progress=100)

    except Exception as exc:
        emit("prism_build_error", {
            "phase": "pipeline",
            "message": f"Pipeline failed: {type(exc).__name__}: {exc}",
            "recoverable": False,
            "suggestion": "Check Modal logs for details and retry the build.",
        }, phase="deployment", progress=-1)
        raise


# ── Single-Node Edit Pipeline ────────────────────────────────────────
# Regenerates ONLY the edited node's code. Neighbor nodes untouched.
# Atlas NOT repacked. Graph edges preserved. Version increments.
# Target: preview update within 5 seconds of edit.


def edit_single_node(config: dict, modal_fns: dict | None = None):
    """Execute the single-node edit pipeline.

    This is NOT a full build — it regenerates code for exactly ONE node.

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

    Steps:
    1. Load existing graph from /outputs volume
    2. Apply changes to the target node
    3. Build node spec (caption + visualSpec + behaviorSpec)
    4. Generate code for ONLY this node
    5. Verify via SWE-RM
    6. Contamination-aware repair if needed (max 3 attempts)
    7. Swap the node's module file in the bundle
    8. Update graph.json on disk
    9. Upload changed files to R2
    10. Notify hot-reload SSE
    11. Emit completion event

    Invariants enforced:
    - Neighbor nodes are NOT regenerated
    - Atlas is NOT repacked (node's region stays the same)
    - Graph edges preserved (unless changes explicitly alter relationships)
    """
    callback_url = config["callbackUrl"]
    project_id = config["projectId"]
    graph_id = config["graphId"]
    node_id = config["nodeId"]
    version = config["graphVersion"]
    changes = config.get("changes", {})
    prev_version = version - 1

    _modal_fns = modal_fns or {}
    codegen_fn = _modal_fns.get("generate_node_code")
    verify_fn = _modal_fns.get("verify_node_code")

    def emit(event_type: str, data: dict, **kwargs):
        emit_event(callback_url, event_type, data, **kwargs)

    start_time = time.time()

    try:
        # ── Step 1: Load existing graph ─────────────────────────────
        graph_path = f"/outputs/{project_id}/{prev_version}/graph.json"
        if not os.path.exists(graph_path):
            emit("prism_node_edit_failed", {
                "nodeId": node_id,
                "reason": "Previous graph version not found on disk",
            }, phase="editing", progress=0, nodeId=node_id)
            return

        with open(graph_path) as f:
            graph = json.load(f)

        # ── Step 2: Find and update the target node ─────────────────
        target_node = None
        for node in graph.get("nodes", []):
            if node["id"] == node_id:
                target_node = node
                break

        if not target_node:
            emit("prism_node_edit_failed", {
                "nodeId": node_id,
                "reason": "Node not found in graph",
            }, phase="editing", progress=0, nodeId=node_id)
            return

        # Apply changes — only caption, visualSpec, behaviorSpec
        if "caption" in changes and changes["caption"] is not None:
            target_node["caption"] = changes["caption"]
        if "visualSpec" in changes and changes["visualSpec"] is not None:
            target_node["visualSpec"] = changes["visualSpec"]
        if "behaviorSpec" in changes and changes["behaviorSpec"] is not None:
            target_node["behaviorSpec"] = changes["behaviorSpec"]

        # Clear previous code (it will be regenerated)
        target_node["code"] = None
        target_node["codeHash"] = None
        target_node["verificationScore"] = None
        target_node["status"] = "pending"

        # Increment graph version
        graph["version"] = version

        emit("prism_node_edit_codegen", {
            "nodeId": node_id,
            "version": version,
        }, phase="editing", progress=60, nodeId=node_id)

        # ── Step 3-4: Build spec and generate code ──────────────────
        from .codegen_worker import build_node_spec, generate_code

        node_spec = build_node_spec(target_node, graph)
        _codegen = codegen_fn or generate_code
        code_result = _codegen(node_spec)

        if not code_result.get("code"):
            emit("prism_node_edit_failed", {
                "nodeId": node_id,
                "reason": "Code generation produced empty output",
            }, phase="editing", progress=0, nodeId=node_id)
            return

        # ── Step 5: Verify via SWE-RM ──────────────────────────────
        from .verify_worker import verify_node_code, describe_error_naturally

        _verify = verify_fn or verify_node_code
        verify_result = _verify(code_result, node_spec)

        # ── Step 6: Contamination-aware repair if needed ────────────
        if not verify_result.get("pass"):
            from .codegen_worker import build_repair_spec

            # First repair: spec-only (Invariant 3 — DELETE code, regen from spec)
            target_node["code"] = None
            target_node["codeHash"] = None
            repair_spec = build_repair_spec(target_node, attempt=1)
            code_result = _codegen(repair_spec)
            if code_result.get("code"):
                verify_result = _verify(code_result, repair_spec)

            # Second repair: natural language error description
            if not verify_result.get("pass"):
                target_node["code"] = None
                target_node["codeHash"] = None
                error_desc = describe_error_naturally(verify_result, node_spec)
                repair_spec = build_repair_spec(
                    target_node, attempt=2, error_description=error_desc
                )
                code_result = _codegen(repair_spec)
                if code_result.get("code"):
                    verify_result = _verify(code_result, repair_spec)

            # Third: escalate to frontier model
            if not verify_result.get("pass"):
                from .verify_worker import escalate_to_frontier

                target_node["code"] = None
                target_node["codeHash"] = None
                error_desc = describe_error_naturally(verify_result, node_spec)
                try:
                    frontier_result = escalate_to_frontier(
                        node=target_node,
                        error_description=error_desc,
                        graph=graph,
                    )
                    if frontier_result.get("code"):
                        code_result = frontier_result
                        verify_result = _verify(code_result, node_spec)
                except Exception:
                    pass  # Keep last verify_result

        # Apply final code to node
        if code_result.get("code"):
            target_node["code"] = code_result["code"]
            target_node["codeHash"] = hashlib.sha256(
                code_result["code"].encode()
            ).hexdigest()[:16]
            target_node["verificationScore"] = verify_result.get("score", 0.0)
            target_node["status"] = "verified" if verify_result.get("pass") else "failed"
        else:
            target_node["status"] = "failed"

        emit("prism_node_edit_verified", {
            "nodeId": node_id,
            "score": verify_result.get("score", 0.0),
            "passed": verify_result.get("pass", False),
        }, phase="editing", progress=80, nodeId=node_id)

        # ── Step 7: Swap the node's module file ────────────────────
        from .assembly_worker import swap_node_module

        bundle_dir = f"/outputs/{project_id}/{prev_version}/bundles/frontend"
        new_bundle_dir = f"/outputs/{project_id}/{version}/bundles/frontend"

        swap_node_module(
            source_bundle_dir=bundle_dir,
            target_bundle_dir=new_bundle_dir,
            node_id=node_id,
            new_code=target_node.get("code", ""),
            graph=graph,
        )

        # ── Step 8: Update graph.json on disk ──────────────────────
        new_graph_path = f"/outputs/{project_id}/{version}/graph.json"
        os.makedirs(os.path.dirname(new_graph_path), exist_ok=True)
        with open(new_graph_path, "w") as f:
            json.dump(graph, f)

        # ── Step 9: Upload changed files to R2 ─────────────────────
        _upload_edit_to_r2(config, graph, node_id, project_id, version)

        # ── Step 10: Notify hot-reload ─────────────────────────────
        from .preview_server import notify_hot_reload
        notify_hot_reload(node_id, new_bundle_dir)

        # ── Step 11: Emit completion ───────────────────────────────
        elapsed_ms = int((time.time() - start_time) * 1000)

        emit("prism_node_edit_complete", {
            "nodeId": node_id,
            "graphId": graph_id,
            "version": version,
            "score": verify_result.get("score", 0.0),
            "editTimeMs": elapsed_ms,
        }, phase="editing", progress=100, nodeId=node_id)

    except Exception as exc:
        emit("prism_node_edit_failed", {
            "nodeId": node_id,
            "reason": f"Edit failed: {type(exc).__name__}: {exc}",
        }, phase="editing", progress=0, nodeId=node_id)
        raise


def _upload_edit_to_r2(
    config: dict,
    graph: dict,
    node_id: str,
    project_id: str,
    version: int,
):
    """Upload only the changed files from a single-node edit to R2.

    Uploads:
    - Updated graph.json
    - Updated node module file (nodes/{nodeId}.js)
    Does NOT re-upload atlas or other node modules.
    """
    r2_config = config.get("r2Config", {})
    if not r2_config.get("accessKeyId"):
        return

    try:
        import boto3

        s3 = boto3.client(
            "s3",
            endpoint_url=f"https://{r2_config['accountId']}.r2.cloudflarestorage.com",
            aws_access_key_id=r2_config["accessKeyId"],
            aws_secret_access_key=r2_config["secretAccessKey"],
            region_name="auto",
        )
        bucket = r2_config.get("bucketName", "kriptik-prism-assets")

        # Upload updated graph.json
        graph_key = f"{project_id}/{version}/graph.json"
        s3.put_object(
            Bucket=bucket,
            Key=graph_key,
            Body=json.dumps(graph).encode(),
            ContentType="application/json",
        )

        # Upload the changed node module
        node_file = f"/outputs/{project_id}/{version}/bundles/frontend/nodes/{node_id}.js"
        if os.path.exists(node_file):
            with open(node_file, "rb") as f:
                s3.put_object(
                    Bucket=bucket,
                    Key=f"{project_id}/{version}/bundles/frontend/nodes/{node_id}.js",
                    Body=f.read(),
                    ContentType="application/javascript",
                )
    except ImportError:
        pass
    except Exception:
        pass  # Non-fatal


# ── Parallel Execution Helpers ───────────────────────────────────────
# These use Modal's Function.map() with order_outputs=False when running
# in Modal (detected by the presence of a .map attribute on the function).
# Falls back to sequential execution for local testing.


def _parallel_map(fn, items: list) -> list:
    """Execute fn across items in parallel via Modal Function.map().

    When fn is a Modal Function (has .map attribute), uses
    Function.map(items, order_outputs=False) for true parallel dispatch
    across 100+ containers. Otherwise falls back to sequential execution.
    """
    if not items:
        return []

    # Detect Modal Function by checking for .map() method
    if hasattr(fn, "map"):
        try:
            return list(fn.map(items, order_outputs=False))
        except Exception:
            pass  # Fall back to sequential if .map() fails

    return [fn(item) for item in items]


def _parallel_map_pair(fn, items_a: list, items_b: list) -> list:
    """Execute fn(a, b) across paired items in parallel.

    When fn is a Modal Function, uses Function.starmap() for parallel
    dispatch with paired arguments. Falls back to sequential otherwise.
    """
    if not items_a:
        return []

    # Detect Modal Function by checking for .starmap() method
    if hasattr(fn, "starmap"):
        try:
            paired = list(zip(items_a, items_b))
            return list(fn.starmap(paired, order_outputs=False))
        except Exception:
            pass  # Fall back to sequential

    return [fn(a, b) for a, b in zip(items_a, items_b)]


# ── R2 Upload ────────────────────────────────────────────────────────

def _upload_to_r2(
    config: dict,
    graph: dict,
    bundle_result: dict,
    atlas_result: dict,
    project_id: str,
    version: int,
):
    """Upload all build artifacts to Cloudflare R2.

    Uploads:
    - graph.json
    - Atlas images
    - Bundle files
    - Node element images

    Uses the R2 config from the pipeline config.
    """
    r2_config = config.get("r2Config", {})
    if not r2_config.get("accessKeyId"):
        return  # R2 not configured, skip upload

    try:
        import boto3

        s3 = boto3.client(
            "s3",
            endpoint_url=f"https://{r2_config['accountId']}.r2.cloudflarestorage.com",
            aws_access_key_id=r2_config["accessKeyId"],
            aws_secret_access_key=r2_config["secretAccessKey"],
            region_name="auto",
        )
        bucket = r2_config.get("bucketName", "kriptik-prism-assets")

        # Upload graph.json
        graph_key = f"{project_id}/{version}/graph.json"
        s3.put_object(
            Bucket=bucket,
            Key=graph_key,
            Body=json.dumps(graph).encode(),
            ContentType="application/json",
        )

        # Upload atlas images
        for atlas in atlas_result.get("atlases", []):
            atlas_key = f"{project_id}/{version}/atlases/atlas-{atlas['index']}.png"
            s3.put_object(
                Bucket=bucket,
                Key=atlas_key,
                Body=atlas.get("imageBytes", b""),
                ContentType="image/png",
            )

        # Upload bundle files
        bundle_path = bundle_result.get("bundlePath", "")
        if bundle_path and os.path.isdir(bundle_path):
            for root, _dirs, files in os.walk(bundle_path):
                for filename in files:
                    filepath = os.path.join(root, filename)
                    rel_path = os.path.relpath(filepath, bundle_path)
                    r2_key = f"{project_id}/{version}/bundles/frontend/{rel_path}"

                    content_type = "application/octet-stream"
                    if filename.endswith(".html"):
                        content_type = "text/html"
                    elif filename.endswith(".js"):
                        content_type = "application/javascript"
                    elif filename.endswith(".json"):
                        content_type = "application/json"
                    elif filename.endswith(".png"):
                        content_type = "image/png"
                    elif filename.endswith(".css"):
                        content_type = "text/css"

                    with open(filepath, "rb") as f:
                        s3.put_object(
                            Bucket=bucket,
                            Key=r2_key,
                            Body=f.read(),
                            ContentType=content_type,
                        )
    except ImportError:
        pass  # boto3 not available, skip R2 upload
    except Exception:
        pass  # Non-fatal: R2 upload failure shouldn't kill the build


# ── Cost Calculation ─────────────────────────────────────────────────

def _calculate_cost(graph: dict) -> float:
    """Calculate the estimated cost of a build.

    Cost breakdown:
    - FLUX.2 image generation: ~$0.003 per hub
    - SAM 3.1 segmentation: ~$0.001 per hub
    - SGLang code generation: ~$0.001 per node
    - SWE-RM verification: ~$0.0005 per node
    - Assembly: ~$0.001 flat
    - Preview server: ~$0.01 per hour
    """
    hubs = graph.get("hubs", [])
    nodes = graph.get("nodes", [])

    cost = 0.0
    cost += len(hubs) * 0.003  # FLUX.2
    cost += len(hubs) * 0.001  # SAM 3.1
    cost += len(nodes) * 0.001  # Code gen
    cost += len(nodes) * 0.0005  # Verification
    cost += 0.001  # Assembly
    cost += 0.01  # Preview server (1 hour)

    return round(cost, 4)
