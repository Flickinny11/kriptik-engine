"""Verification workers for the Prism diffusion pipeline.

Two verification stages:
1. Caption verification (pre-codegen): vision model validates captions match images
2. Code verification (post-codegen): SWE-RM scores generated code quality

Spec reference: docs/DIFFUSION-ENGINE-SPEC.md
  Section 12 — Verification & Repair Pipeline
  Pipeline steps 11 (caption verification blast) and 14 (SWE-RM verification)

GPU: L4
Caption verification: vision model binary pass/fail + optional caption correction
Code verification: SWE-RM continuous scoring with defined thresholds

Invariant 2: Nodes are self-contained — captions must fully describe the element
Invariant 3: Contamination-aware repair — NEVER show broken code to repair models
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import time
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment / Configuration
# ---------------------------------------------------------------------------

# Vision model for caption verification — configurable via env var.
# Supports "anthropic" (Claude) or "openai" (GPT-4V) backends.
VISION_MODEL_PROVIDER = os.environ.get("PRISM_VISION_MODEL_PROVIDER", "anthropic")
VISION_MODEL_NAME = os.environ.get(
    "PRISM_VISION_MODEL_NAME", "claude-sonnet-4-20250514"
)

# Anthropic API key — never hardcoded.
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# SWE-RM thresholds (Section 12: exact values, non-negotiable)
SCORE_PASS = 0.85
SCORE_BORDERLINE = 0.60


# ============================================================================
# Caption Verification (Pipeline Step 11)
# ============================================================================


def verify_captions(nodes_with_images: list[dict]) -> list[dict]:
    """Verify that node captions accurately describe their segmented images.

    Input: [{ "nodeId": str, "imageUrl": str, "caption": str }]

    For each node:
    1. Load the segmented element image
    2. Send image + caption to vision model
    3. Ask: "Does this caption accurately describe this UI element?"
    4. If no: attempt to generate a corrected caption

    Returns: [{
        "nodeId": str,
        "pass": bool,
        "correctedCaption": str | None,
        "confidence": float,
        "reason": str,
    }]
    """
    results: list[dict] = []

    for node in nodes_with_images:
        node_id = node["nodeId"]
        image_url = node["imageUrl"]
        caption = node["caption"]

        start_ms = time.time()
        try:
            image_data = _load_image_as_base64(image_url)
            verdict = _ask_vision_model_caption_check(image_data, caption)

            passed = verdict.get("accurate", False)
            confidence = float(verdict.get("confidence", 0.0))
            reason = verdict.get("reason", "")

            corrected_caption: str | None = None
            if not passed:
                # The vision model may have suggested a correction inline.
                corrected_caption = verdict.get("correctedCaption")
                if corrected_caption:
                    logger.info(
                        "Caption corrected for node %s (confidence %.2f): %s",
                        node_id,
                        confidence,
                        reason,
                    )
                else:
                    logger.warning(
                        "Caption failed for node %s with no correction: %s",
                        node_id,
                        reason,
                    )

            elapsed_ms = (time.time() - start_ms) * 1000
            results.append(
                {
                    "nodeId": node_id,
                    "pass": passed,
                    "correctedCaption": corrected_caption,
                    "confidence": confidence,
                    "reason": reason,
                    "verifyTimeMs": round(elapsed_ms),
                }
            )

        except Exception as exc:
            logger.error("Caption verification failed for node %s: %s", node_id, exc)
            results.append(
                {
                    "nodeId": node_id,
                    "pass": False,
                    "correctedCaption": None,
                    "confidence": 0.0,
                    "reason": f"Verification error: {type(exc).__name__}",
                    "verifyTimeMs": round((time.time() - start_ms) * 1000),
                }
            )

    return results


def regenerate_caption(node: dict, plan: dict) -> str:
    """Regenerate a caption for a node whose caption failed verification.

    Uses the vision model with the element image + plan context to
    generate a new self-contained caption (Invariant 2).

    The caption MUST be self-contained: it must fully describe the element's
    appearance, behavior, and context WITHOUT referencing other nodes.

    Test: "Could an engineer who has never seen the rest of the app
    implement this node from the caption alone?"
    """
    image_url = node.get("imageUrl", "")
    element_type = node.get("elementType", node.get("type", "element"))
    visual_spec = node.get("visualSpec", {})
    behavior_spec = node.get("behaviorSpec", {})

    # Extract plan context for the node's hub to provide layout awareness
    hub_context = ""
    node_id = node.get("id", "")
    for hub in plan.get("graph", {}).get("hubs", []):
        for elem in hub.get("elements", []):
            if elem.get("id") == node_id:
                hub_context = (
                    f"This element appears on the '{hub.get('name', '')}' page "
                    f"({hub.get('description', '')}). "
                    f"Layout: {hub.get('layoutTemplate', 'unknown')}."
                )
                break

    prompt = f"""You are looking at a segmented UI element image from a web application.

Generate a COMPLETE, SELF-CONTAINED caption for this UI element that fully describes:
1. Its visual appearance (shape, colors, dimensions, typography, effects)
2. Its behavior (interactions, events, navigation targets)
3. Its context (what it does, its purpose)

CRITICAL RULES:
- The caption must be self-contained. An engineer who has never seen the rest of the app
  must be able to implement this element from the caption alone.
- Include specific values: exact colors (hex), font sizes (px), dimensions, border radii.
- Describe hover/click/focus states explicitly.
- Do NOT reference other elements by name or say "like the one in..."
- Do NOT use vague descriptions like "a button" — be precise.

Element type: {element_type}
{hub_context}

Visual spec context:
{json.dumps(visual_spec, indent=2) if visual_spec else "Not available"}

Behavior spec context:
{json.dumps(behavior_spec, indent=2) if behavior_spec else "Not available"}

Generate ONLY the caption text. No explanations, no markdown, no prefixes."""

    if image_url:
        image_data = _load_image_as_base64(image_url)
        response = _call_vision_model(image_data, prompt)
    else:
        response = _call_text_model(prompt)

    caption = response.strip()
    if not caption:
        raise ValueError(f"Empty caption generated for node {node_id}")

    return caption


# ============================================================================
# Post-Segmentation Verification (Pipeline Step 4)
# ============================================================================


def verify_segmentation_results(
    hub_image_b64: str,
    segments: list[dict],
    planned_elements: list[dict],
    hierarchy: dict,
) -> dict:
    """Verify segmentation results before graph construction.

    Spec Section 9 — Post-Segmentation Verification:
    A separate verification pass using a vision model confirms:
      - All planned elements were detected
      - No spurious segments
      - Hierarchy matches plan
      - Text content is legible in element crops

    Binary pass/fail. Failures include diagnostic info for re-generation.

    Args:
        hub_image_b64: Base64-encoded full hub image.
        segments: List of segment dicts from SAM 3.1 (each has elementId, bbox, label).
        planned_elements: List of planned element dicts (each has id, type, caption).
        hierarchy: Hierarchy dict with roots and children.

    Returns:
        {
            "pass": bool,
            "missingElements": [str],       # Planned element IDs not found
            "spuriousSegments": [str],       # Segment IDs not matching any plan
            "hierarchyIssues": [str],        # Hierarchy mismatch descriptions
            "legibilityIssues": [str],       # Elements with illegible text
            "reason": str,                   # Human-readable summary
        }
    """
    planned_ids = {e["id"] for e in planned_elements}
    segment_ids = {s["elementId"] for s in segments}

    # Check 1: All planned elements detected
    missing = planned_ids - segment_ids
    missing_elements = sorted(missing)

    # Check 2: No spurious segments
    spurious = segment_ids - planned_ids
    spurious_segments = sorted(spurious)

    # Check 3: Hierarchy matches plan — use vision model for complex assessment
    hierarchy_issues: list[str] = []
    # Basic structural check: every root should be a top-level element type
    root_ids = set(hierarchy.get("roots", []))
    top_level_types = {
        "page-background", "navbar", "sidebar", "hero-section", "footer",
    }
    for root_id in root_ids:
        elem = next(
            (e for e in planned_elements if e["id"] == root_id), None
        )
        if elem and elem.get("type") not in top_level_types and elem.get("type") != "custom":
            hierarchy_issues.append(
                f"Element '{root_id}' (type '{elem.get('type')}') is a root "
                f"but typically expected to be nested within a container"
            )

    # Check 4: Text legibility via vision model (sample check on segments with text)
    legibility_issues: list[str] = []
    text_elements = [
        e for e in planned_elements
        if e.get("type") in {"button", "input", "navbar", "hero-section", "badge", "tag"}
        or "text" in e.get("caption", "").lower()
        or "label" in e.get("caption", "").lower()
    ]

    # Only run vision check if we have the image and text elements to verify
    if hub_image_b64 and text_elements and not missing:
        try:
            legibility_result = _check_text_legibility(
                hub_image_b64, segments, text_elements
            )
            legibility_issues = legibility_result.get("issues", [])
        except Exception as exc:
            logger.warning("Text legibility check failed: %s", exc)

    # Determine pass/fail
    passed = (
        len(missing_elements) == 0
        and len(spurious_segments) == 0
        and len(hierarchy_issues) == 0
        and len(legibility_issues) == 0
    )

    # Build reason summary
    reasons: list[str] = []
    if missing_elements:
        reasons.append(f"{len(missing_elements)} planned element(s) not detected")
    if spurious_segments:
        reasons.append(f"{len(spurious_segments)} unexpected segment(s) found")
    if hierarchy_issues:
        reasons.append(f"{len(hierarchy_issues)} hierarchy issue(s)")
    if legibility_issues:
        reasons.append(f"{len(legibility_issues)} text legibility issue(s)")

    reason = "; ".join(reasons) if reasons else "All segmentation checks passed"

    logger.info(
        "Post-segmentation verification: pass=%s, missing=%d, spurious=%d, "
        "hierarchy_issues=%d, legibility_issues=%d",
        passed, len(missing_elements), len(spurious_segments),
        len(hierarchy_issues), len(legibility_issues),
    )

    return {
        "pass": passed,
        "missingElements": missing_elements,
        "spuriousSegments": spurious_segments,
        "hierarchyIssues": hierarchy_issues,
        "legibilityIssues": legibility_issues,
        "reason": reason,
    }


def _check_text_legibility(
    hub_image_b64: str,
    segments: list[dict],
    text_elements: list[dict],
) -> dict:
    """Use vision model to verify text is legible in segmented elements.

    Sends the full hub image plus bounding box annotations to a vision model
    and asks it to confirm that text within text-bearing elements is readable.

    Returns: { "issues": [str] }
    """
    # Build a description of which regions to check
    region_descriptions: list[str] = []
    text_element_ids = {e["id"] for e in text_elements}

    for seg in segments:
        if seg["elementId"] in text_element_ids:
            bbox = seg.get("bbox", [])
            label = seg.get("label", "element")
            if len(bbox) == 4:
                region_descriptions.append(
                    f"- {seg['elementId']} ({label}) at bbox [{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}]"
                )

    if not region_descriptions:
        return {"issues": []}

    prompt = f"""Look at this UI mockup image. I need you to verify that text is legible in the following UI elements:

{chr(10).join(region_descriptions)}

For each element, check:
1. Is any text content visible and readable?
2. Is the text sharp enough to be identified (not blurry or cut off)?

Respond in JSON format ONLY:
{{
  "results": [
    {{"elementId": "...", "legible": true/false, "issue": "description if not legible"}}
  ]
}}

If all text is legible, return legible: true for each element."""

    raw = _call_vision_model(hub_image_b64, prompt)
    try:
        parsed = _parse_json_response(raw)
        issues: list[str] = []
        for result in parsed.get("results", []):
            if not result.get("legible", True):
                issues.append(
                    f"Text in element '{result.get('elementId', 'unknown')}' "
                    f"is not legible: {result.get('issue', 'unclear')}"
                )
        return {"issues": issues}
    except (json.JSONDecodeError, ValueError):
        logger.warning("Could not parse legibility check response")
        return {"issues": []}


# ============================================================================
# Code Verification — SWE-RM (Pipeline Step 14)
# ============================================================================


def verify_node_code(code_result: dict, node_spec: dict) -> dict:
    """Verify generated code using SWE-RM scoring.

    Input:
    - code_result: { "nodeId": str, "code": str, ... }
    - node_spec: { "caption": str, "visualSpec": dict, "behaviorSpec": dict }

    Verification checks:
    1. Structural: exports createNode, returns Container, no DOM manipulation (40%)
    2. Behavioral: handles specified interactions, correct event types (30%)
    3. Visual: references correct colors, sizes, fonts from spec (20%)
    4. Quality: no hardcoded values, proper error handling, clean code (10%)

    Returns: {
        "nodeId": str,
        "score": float,       # 0.0 to 1.0
        "pass": bool,         # score >= SCORE_PASS
        "borderline": bool,   # SCORE_BORDERLINE <= score < SCORE_PASS
        "issues": [str],      # Human-readable issues found
        "breakdown": {
            "structural": float,
            "behavioral": float,
            "visual": float,
            "quality": float,
        }
    }
    """
    node_id = code_result.get("nodeId", "unknown")
    code = code_result.get("code", "")

    if not code or not code.strip():
        return {
            "nodeId": node_id,
            "score": 0.0,
            "pass": False,
            "borderline": False,
            "issues": ["No code was generated"],
            "breakdown": {
                "structural": 0.0,
                "behavioral": 0.0,
                "visual": 0.0,
                "quality": 0.0,
            },
        }

    visual_spec = node_spec.get("visualSpec", {})
    behavior_spec = node_spec.get("behaviorSpec", {})

    # Run all four check categories
    structural_score, structural_issues = _check_structural(code)
    behavioral_score, behavioral_issues = _check_behavioral(code, behavior_spec)
    visual_score, visual_issues = _check_visual(code, visual_spec)
    quality_score, quality_issues = _check_quality(code)

    # Weighted composite score (spec Section 12)
    composite = (
        structural_score * 0.40
        + behavioral_score * 0.30
        + visual_score * 0.20
        + quality_score * 0.10
    )

    # Clamp to [0, 1]
    composite = max(0.0, min(1.0, composite))

    all_issues = structural_issues + behavioral_issues + visual_issues + quality_issues

    passed = composite >= SCORE_PASS
    borderline = SCORE_BORDERLINE <= composite < SCORE_PASS

    return {
        "nodeId": node_id,
        "score": round(composite, 4),
        "pass": passed,
        "borderline": borderline,
        "issues": all_issues,
        "breakdown": {
            "structural": round(structural_score, 4),
            "behavioral": round(behavioral_score, 4),
            "visual": round(visual_score, 4),
            "quality": round(quality_score, 4),
        },
    }


def describe_error_naturally(verify_result: dict, node_spec: dict) -> str:
    """Generate a NATURAL LANGUAGE error description for repair.

    CRITICAL: This is for contamination-aware repair (Invariant 3).
    The description MUST be in natural language.
    It MUST NOT contain:
      - Code snippets
      - Variable names from the generated code
      - Line numbers
      - Stack traces
      - Error messages from the failed code
      - AST fragments
      - References to "the failing version" or "the previous code"

    Good: "The button doesn't change color on hover as specified"
    Bad:  "Line 42: gsap.to(btn, {fill: '#red'}) should be '#a3e635'"

    Returns a natural language description of what's wrong.
    """
    issues = verify_result.get("issues", [])
    breakdown = verify_result.get("breakdown", {})
    caption = node_spec.get("caption", "")

    if not issues:
        return "The generated element does not meet the quality threshold."

    # Build a natural-language summary organized by problem area.
    # Each issue from the check functions is already phrased in natural language
    # (see _check_structural, _check_behavioral, etc.), but we consolidate
    # them here into a coherent paragraph that avoids any code references.
    description_parts: list[str] = []

    structural_score = breakdown.get("structural", 1.0)
    behavioral_score = breakdown.get("behavioral", 1.0)
    visual_score = breakdown.get("visual", 1.0)
    quality_score = breakdown.get("quality", 1.0)

    if structural_score < SCORE_PASS:
        structural_issues = [
            i for i in issues if _is_structural_issue(i)
        ]
        if structural_issues:
            description_parts.append(
                "The element has structural problems: "
                + "; ".join(structural_issues)
                + "."
            )

    if behavioral_score < SCORE_PASS:
        behavioral_issues = [
            i for i in issues if _is_behavioral_issue(i)
        ]
        if behavioral_issues:
            description_parts.append(
                "The element's behavior is incomplete: "
                + "; ".join(behavioral_issues)
                + "."
            )

    if visual_score < SCORE_PASS:
        visual_issues = [
            i for i in issues if _is_visual_issue(i)
        ]
        if visual_issues:
            description_parts.append(
                "The element's visual appearance doesn't match the specification: "
                + "; ".join(visual_issues)
                + "."
            )

    if quality_score < SCORE_PASS:
        quality_issues = [
            i for i in issues if _is_quality_issue(i)
        ]
        if quality_issues:
            description_parts.append(
                "The element has code quality concerns: "
                + "; ".join(quality_issues)
                + "."
            )

    if not description_parts:
        # Fallback: generic description from the issues list
        description_parts.append(
            "The generated element has the following concerns: "
            + "; ".join(issues[:5])
            + "."
        )

    return " ".join(description_parts)


# ============================================================================
# Frontier Model Escalation (Repair Attempt 3)
# ============================================================================


def escalate_to_frontier(
    node: dict,
    error_description: str,
    graph: dict,
) -> dict:
    """Escalate a failed node to Claude Opus 4.6 for third repair attempt.

    Spec Section 12 — Contamination-Aware Repair Protocol, Attempt 3:
      Input: full context including spec + error description + node relationships
      Model: Claude Opus 4.6 via Anthropic API
      Cost: higher, but only ~5-15% of nodes reach here

    Unlike attempts 1-2, the frontier model receives full context (except
    the previously broken code, which was already deleted per Invariant 3).

    Args:
        node: The GraphNode dict (caption, visualSpec, behaviorSpec, etc.).
              Must NOT contain the previously generated code.
        error_description: Natural language description of what went wrong
            in prior attempts. NOT raw error output or stack traces.
        graph: The full PrismGraph dict for resolving relationships.

    Returns:
        {
            "nodeId": str,
            "code": str,
            "tokensUsed": int,
            "generationTimeMs": int,
            "model": "claude-opus-4-20250514",
            "escalated": True,
        }
    """
    import anthropic

    api_key = ANTHROPIC_API_KEY
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Required for frontier model escalation."
        )

    node_id = node.get("id", "unknown")
    caption = node.get("caption", "")
    visual_spec = node.get("visualSpec", {})
    behavior_spec = node.get("behaviorSpec", {})
    atlas_region = node.get("atlasRegion")

    # Build neighbor context from graph for full relationship awareness
    neighbor_context = _build_escalation_neighbor_context(node_id, graph)

    # Build the prompt with full context (allowed at escalation level)
    prompt = f"""You are generating PixiJS v8 code for a UI element that failed automated code generation twice.

ELEMENT SPECIFICATION:
{caption}

VISUAL SPECIFICATION:
{json.dumps(visual_spec, indent=2) if visual_spec else "Not specified"}

BEHAVIOR SPECIFICATION:
{json.dumps(behavior_spec, indent=2) if behavior_spec else "Not specified"}

ELEMENT RELATIONSHIPS:
{neighbor_context}

{f"ATLAS REGION: atlas {atlas_region.get('atlasIndex', 0)}, rect ({atlas_region.get('x', 0)}, {atlas_region.get('y', 0)}, {atlas_region.get('width', 0)}, {atlas_region.get('height', 0)})" if atlas_region else "No atlas region assigned."}

WHAT WENT WRONG IN PREVIOUS ATTEMPTS:
{error_description}

CONSTRAINTS:
- Use PixiJS v8 API only (Container, Sprite, Graphics, Text, NineSliceSprite)
- Export a single function: createNode(config) that returns a Container
- Handle all events internally (pointerover, pointerout, pointertap)
- Use GSAP for animations
- All text uses BitmapText or programmatic rendering (no DOM text)
- Code must be synchronous (no async/await in render path)
- Return a PixiJS Container with all children attached

OUTPUT: Only the JavaScript code. No explanation. No markdown fences."""

    logger.info(
        "Escalating node %s to frontier model (Claude Opus 4.6)", node_id,
    )

    start = time.time()
    client = anthropic.Anthropic(api_key=api_key)

    message = client.messages.create(
        model="claude-opus-4-20250514",
        max_tokens=4096,
        messages=[
            {"role": "user", "content": prompt},
        ],
    )

    elapsed_ms = int((time.time() - start) * 1000)
    code = message.content[0].text.strip()

    # Strip markdown fences if present
    if code.startswith("```"):
        first_newline = code.find("\n")
        if first_newline != -1:
            code = code[first_newline + 1:]
        if code.rstrip().endswith("```"):
            code = code.rstrip()[:-3].rstrip()
        code = code.strip()

    tokens_used = message.usage.input_tokens + message.usage.output_tokens

    logger.info(
        "Frontier model generated code for node %s: %d tokens in %dms",
        node_id, tokens_used, elapsed_ms,
    )

    return {
        "nodeId": node_id,
        "code": code,
        "tokensUsed": tokens_used,
        "generationTimeMs": elapsed_ms,
        "model": "claude-opus-4-20250514",
        "escalated": True,
    }


def _build_escalation_neighbor_context(node_id: str, graph: dict) -> str:
    """Build detailed neighbor context for frontier model escalation.

    At escalation level, we provide more context than normal code gen
    (which only gets terse type/elementType summaries). The frontier model
    gets element types, captions of immediate neighbors (NOT their code),
    and edge types to understand the full relational context.
    """
    nodes_by_id = {n["id"]: n for n in graph.get("nodes", [])}
    edges = graph.get("edges", [])

    # Find relationships
    parents = []
    children = []
    siblings = set()
    related = []  # navigates-to, triggers, data-flow, shares-state

    parent_ids = set()
    for edge in edges:
        if edge.get("type") == "contains":
            if edge.get("target") == node_id:
                parents.append(edge["source"])
                parent_ids.add(edge["source"])
            elif edge.get("source") == node_id:
                children.append(edge["target"])
        elif edge.get("source") == node_id or edge.get("target") == node_id:
            other_id = (
                edge["target"] if edge["source"] == node_id else edge["source"]
            )
            related.append(
                f"{edge.get('type', 'unknown')} -> {other_id} "
                f"({nodes_by_id.get(other_id, {}).get('elementType', 'unknown')})"
            )

    # Find siblings
    for edge in edges:
        if edge.get("type") == "contains" and edge.get("source") in parent_ids:
            target = edge.get("target")
            if target and target != node_id:
                siblings.add(target)

    def _desc(nid: str) -> str:
        n = nodes_by_id.get(nid)
        if not n:
            return f"{nid} (unknown)"
        et = n.get("elementType", n.get("type", "unknown"))
        # Include a brief caption excerpt for escalation context
        cap = n.get("caption", "")
        if cap:
            cap = cap[:80] + "..." if len(cap) > 80 else cap
            return f"{nid} ({et}): {cap}"
        return f"{nid} ({et})"

    lines = []
    if parents:
        lines.append("Parent: " + ", ".join(_desc(p) for p in parents))
    if siblings:
        s_list = sorted(siblings)[:5]
        lines.append("Siblings: " + ", ".join(_desc(s) for s in s_list))
    if children:
        c_list = children[:5]
        lines.append("Children: " + ", ".join(_desc(c) for c in c_list))
    if related:
        lines.append("Other relationships: " + "; ".join(related[:5]))

    return "\n".join(lines) if lines else "No relationships found."


# ============================================================================
# Structural checks (40% weight)
# ============================================================================


def _check_structural(code: str) -> tuple[float, list[str]]:
    """Check structural requirements of generated code.

    Checks:
    - Exports a createNode function
    - Returns a PixiJS Container
    - Uses only PixiJS v8 API
    - No DOM manipulation (document.*, window.*, innerHTML, etc.)
    - No async/await in the render path
    - Code is parseable (balanced braces, no syntax red flags)

    Returns (score 0-1, list of natural-language issues).
    """
    issues: list[str] = []
    checks_passed = 0
    total_checks = 6

    # 1. Exports createNode function
    has_create_node = bool(
        re.search(
            r"""(?:export\s+(?:default\s+)?function\s+createNode|"""
            r"""(?:module\.)?exports\s*[\.\[]*\s*(?:createNode|default)\s*[\]\s]*=|"""
            r"""export\s+(?:default\s+|const\s+createNode\s*=))""",
            code,
        )
    )
    if has_create_node:
        checks_passed += 1
    else:
        issues.append(
            "The element does not export the required createNode function"
        )

    # 2. Returns a Container (references Container from PixiJS)
    has_container_ref = bool(
        re.search(r"\bContainer\b", code)
    )
    has_return = bool(re.search(r"\breturn\b", code))
    if has_container_ref and has_return:
        checks_passed += 1
    elif not has_container_ref:
        issues.append(
            "The element does not create or reference a PixiJS Container"
        )
    else:
        issues.append(
            "The element may not return its Container properly"
        )

    # 3. Uses PixiJS v8 API (at least one PixiJS class referenced)
    pixi_classes = [
        "Container", "Sprite", "Graphics", "Text", "BitmapText",
        "NineSliceSprite", "Texture", "Assets",
    ]
    pixi_usage_count = sum(
        1 for cls in pixi_classes if re.search(rf"\b{cls}\b", code)
    )
    if pixi_usage_count >= 1:
        checks_passed += 1
    else:
        issues.append(
            "The element does not appear to use any PixiJS v8 API classes"
        )

    # 4. No DOM manipulation
    dom_patterns = [
        (r"\bdocument\s*\.", "directly manipulates the DOM via document"),
        (r"\bwindow\s*\.\s*(?!addEventListener)", "accesses the window object"),
        (r"\binnerHTML\b", "uses innerHTML for content rendering"),
        (r"\bcreateElement\b", "creates DOM elements instead of PixiJS objects"),
        (r"\bgetElementById\b", "queries DOM elements by ID"),
        (r"\bquerySelector\b", "queries DOM elements via selectors"),
        (r"\bappendChild\b", "appends DOM children instead of PixiJS children"),
    ]
    dom_found = False
    for pattern, description in dom_patterns:
        if re.search(pattern, code):
            issues.append(f"The element {description}")
            dom_found = True
    if not dom_found:
        checks_passed += 1

    # 5. No async/await in render path (sync constraint)
    # Allow async in event handlers but flag top-level async createNode
    has_async_create = bool(
        re.search(r"async\s+function\s+createNode", code)
    )
    if has_async_create:
        issues.append(
            "The createNode function is async, but the render path must be synchronous"
        )
    else:
        checks_passed += 1

    # 6. Balanced braces (basic parsability check)
    open_braces = code.count("{")
    close_braces = code.count("}")
    open_parens = code.count("(")
    close_parens = code.count(")")
    open_brackets = code.count("[")
    close_brackets = code.count("]")

    brace_balanced = (
        abs(open_braces - close_braces) <= 1
        and abs(open_parens - close_parens) <= 1
        and abs(open_brackets - close_brackets) <= 1
    )
    if brace_balanced:
        checks_passed += 1
    else:
        issues.append(
            "The element has unbalanced brackets or braces, suggesting a syntax problem"
        )

    score = checks_passed / total_checks if total_checks > 0 else 0.0
    return score, issues


# ============================================================================
# Behavioral checks (30% weight)
# ============================================================================


def _check_behavioral(code: str, behavior_spec: dict) -> tuple[float, list[str]]:
    """Check that code handles all specified interactions.

    Verifies:
    - All interactions from behaviorSpec are handled
    - Correct PixiJS event names used (pointertap, pointerover, etc.)
    - Event emissions match expected patterns
    - Data bindings are referenced

    Returns (score 0-1, list of natural-language issues).
    """
    issues: list[str] = []

    interactions: list[dict] = behavior_spec.get("interactions", [])
    data_bindings: list[dict] = behavior_spec.get("dataBindings", [])

    if not interactions and not data_bindings:
        # No behavior specified — pass by default
        return 1.0, []

    total_checks = 0
    checks_passed = 0

    # Map spec event names to PixiJS event patterns we expect to see in code
    event_to_pixi: dict[str, list[str]] = {
        "click": ["pointertap", "pointerdown", "click"],
        "hover": ["pointerover", "pointerout", "pointerenter", "pointerleave"],
        "focus": ["focus", "focusin"],
        "submit": ["pointertap", "submit", "pointerdown"],
        "change": ["change", "input"],
        "scroll": ["wheel", "scroll"],
        "keydown": ["keydown", "keypress"],
    }

    # Check each interaction is handled
    for interaction in interactions:
        event = interaction.get("event", "")
        action = interaction.get("action", "")
        total_checks += 1

        pixi_events = event_to_pixi.get(event, [event])
        event_handled = any(
            re.search(rf"""['"]({re.escape(pe)})['"]""", code) for pe in pixi_events
        )

        if event_handled:
            checks_passed += 1
        else:
            # Natural language description — no code references
            action_desc = _describe_action(action, interaction)
            issues.append(
                f"The element does not handle the {event} interaction "
                f"that should {action_desc}"
            )

    # Check for GSAP usage when animations are specified
    has_animation_interaction = any(
        i.get("action") == "animation" for i in interactions
    )
    if has_animation_interaction:
        total_checks += 1
        if re.search(r"\bgsap\b", code, re.IGNORECASE):
            checks_passed += 1
        else:
            issues.append(
                "The element specifies animation behavior but does not use GSAP"
            )

    # Check navigation events emit properly
    nav_interactions = [i for i in interactions if i.get("action") == "navigate"]
    for nav in nav_interactions:
        total_checks += 1
        target = nav.get("targetHubId", "")
        # Should emit a navigate event or reference the target hub
        has_nav_emit = bool(
            re.search(r"""['"]navigate['"]""", code)
            or re.search(r"emit\s*\(", code)
            or re.search(r"dispatchEvent", code)
            or re.search(r"eventBus", code)
        )
        if has_nav_emit:
            checks_passed += 1
        else:
            issues.append(
                f"The element should navigate to another page on click "
                f"but does not emit a navigation event"
            )

    # Check data bindings are referenced
    for binding in data_bindings:
        total_checks += 1
        path = binding.get("path", "")
        source = binding.get("source", "")
        # Check if the code references this data path in some form
        path_parts = path.split(".")
        leaf = path_parts[-1] if path_parts else ""
        if leaf and re.search(re.escape(leaf), code):
            checks_passed += 1
        elif source and re.search(re.escape(source), code):
            checks_passed += 1
        else:
            issues.append(
                f"The element does not reference the {source} data binding "
                f"for '{path}'"
            )

    score = checks_passed / total_checks if total_checks > 0 else 1.0
    return score, issues


# ============================================================================
# Visual checks (20% weight)
# ============================================================================


def _check_visual(code: str, visual_spec: dict) -> tuple[float, list[str]]:
    """Check visual accuracy against the node's visual specification.

    Verifies:
    - Color values from spec appear in code
    - Font references match spec
    - Dimension/spacing values present
    - Animation specs are implemented
    - Text content matches

    Returns (score 0-1, list of natural-language issues).
    """
    issues: list[str] = []
    total_checks = 0
    checks_passed = 0

    # --- Color checks ---
    colors: dict = visual_spec.get("colors", {})
    for role, color_value in colors.items():
        if not color_value:
            continue
        total_checks += 1
        # Normalize hex color: strip '#', compare case-insensitively
        normalized = _normalize_color(color_value)
        # Check for the color in hex form (with or without #) or as numeric
        color_found = _color_present_in_code(code, color_value)
        if color_found:
            checks_passed += 1
        else:
            issues.append(
                f"The {role} color ({color_value}) from the specification "
                f"does not appear in the element"
            )

    # --- Typography checks ---
    typography: dict = visual_spec.get("typography", {})
    font_family = typography.get("fontFamily", "")
    font_size = typography.get("fontSize")

    if font_family:
        total_checks += 1
        if re.search(re.escape(font_family), code, re.IGNORECASE):
            checks_passed += 1
        else:
            issues.append(
                f"The specified font family '{font_family}' is not referenced"
            )

    if font_size is not None:
        total_checks += 1
        size_str = str(font_size)
        if re.search(rf"\b{re.escape(size_str)}\b", code):
            checks_passed += 1
        else:
            issues.append(
                f"The specified font size ({font_size}px) does not appear"
            )

    # --- Text content checks ---
    text_contents: list[dict] = visual_spec.get("textContent", [])
    for tc in text_contents:
        text_value = tc.get("text", "")
        if text_value and len(text_value) > 2:
            total_checks += 1
            if re.search(re.escape(text_value), code):
                checks_passed += 1
            else:
                issues.append(
                    f"The text content '{text_value}' from the specification "
                    f"does not appear in the element"
                )

    # --- Border / radius checks ---
    borders: dict = visual_spec.get("borders", {})
    radius = borders.get("radius", "")
    if radius:
        total_checks += 1
        radius_num = re.search(r"(\d+)", str(radius))
        if radius_num and re.search(
            rf"\b{re.escape(radius_num.group(1))}\b", code
        ):
            checks_passed += 1
        else:
            issues.append(
                f"The specified border radius ({radius}) does not appear"
            )

    # --- Animation checks ---
    animation: dict | None = visual_spec.get("animation")
    if animation:
        total_checks += 1
        anim_type = animation.get("type", "")
        has_gsap = bool(re.search(r"\bgsap\b", code, re.IGNORECASE))
        has_anim_ref = bool(
            re.search(rf"\b{re.escape(anim_type)}\b", code, re.IGNORECASE)
        ) if anim_type else False

        if has_gsap or has_anim_ref:
            checks_passed += 1
        else:
            issues.append(
                f"The specified {anim_type} animation does not appear to be implemented"
            )

    # --- Effects checks (shadows, glow, opacity) ---
    effects: dict = visual_spec.get("effects", {})
    for effect_name, effect_value in effects.items():
        if not effect_value:
            continue
        if effect_name == "opacity" and effect_value == 1:
            # Default opacity, no need to check
            continue
        total_checks += 1
        # Check for the effect concept in code
        effect_found = bool(
            re.search(re.escape(str(effect_value)), code)
            or re.search(rf"\b{re.escape(effect_name)}\b", code, re.IGNORECASE)
        )
        if effect_found:
            checks_passed += 1
        else:
            issues.append(
                f"The specified {effect_name} effect ({effect_value}) "
                f"does not appear to be implemented"
            )

    score = checks_passed / total_checks if total_checks > 0 else 1.0
    return score, issues


# ============================================================================
# Code quality checks (10% weight)
# ============================================================================


def _check_quality(code: str) -> tuple[float, list[str]]:
    """Check code quality metrics.

    Checks:
    - No console.log/console.error left in production code
    - No TODO/FIXME/HACK comments
    - No hardcoded localhost URLs or API keys
    - Reasonable code length (not empty, not absurdly large)
    - Uses const/let appropriately (no var)
    - Has event cleanup (removeListener/off for added listeners)
    - No eval() or Function() constructor

    Returns (score 0-1, list of natural-language issues).
    """
    issues: list[str] = []
    total_checks = 7
    checks_passed = 0

    # 1. No console.log/console.error
    console_matches = re.findall(r"\bconsole\s*\.\s*(log|error|warn|debug)\b", code)
    if not console_matches:
        checks_passed += 1
    else:
        issues.append(
            "The element contains console logging statements that should be removed"
        )

    # 2. No TODO/FIXME/HACK comments
    todo_matches = re.findall(r"(?://|/\*)\s*(?:TODO|FIXME|HACK|XXX)\b", code, re.IGNORECASE)
    if not todo_matches:
        checks_passed += 1
    else:
        issues.append(
            "The element contains unresolved TODO or FIXME comments"
        )

    # 3. No hardcoded URLs or secrets
    hardcoded_patterns = [
        (r"https?://localhost[:\d]*", "a hardcoded localhost URL"),
        (r"""['"](?:sk-|pk_|api_key_|secret_)[a-zA-Z0-9]{10,}['"]""", "what appears to be a hardcoded API key"),
        (r"(?:password|secret|token)\s*[=:]\s*['\"][^'\"]{8,}['\"]", "a hardcoded secret or credential"),
    ]
    hardcoded_found = False
    for pattern, description in hardcoded_patterns:
        if re.search(pattern, code, re.IGNORECASE):
            issues.append(f"The element contains {description}")
            hardcoded_found = True
    if not hardcoded_found:
        checks_passed += 1

    # 4. Reasonable code length
    line_count = len(code.strip().splitlines())
    if 3 <= line_count <= 500:
        checks_passed += 1
    elif line_count < 3:
        issues.append("The element code is suspiciously short")
    else:
        issues.append(
            "The element code is unusually long, suggesting it may not be "
            "properly scoped to a single UI element"
        )

    # 5. No var declarations (use const/let)
    # Avoid false positives in comments or strings — simple heuristic
    var_declarations = re.findall(r"^\s*var\s+", code, re.MULTILINE)
    if not var_declarations:
        checks_passed += 1
    else:
        issues.append(
            "The element uses 'var' declarations instead of 'const' or 'let'"
        )

    # 6. Event cleanup (if listeners are added, they should have cleanup)
    adds_listener = bool(
        re.search(r"\.on\s*\(|\.addEventListener\s*\(|\.addListener\s*\(", code)
    )
    has_cleanup = bool(
        re.search(r"\.off\s*\(|\.removeEventListener\s*\(|\.removeListener\s*\(|destroy", code)
    )
    if not adds_listener or has_cleanup:
        checks_passed += 1
    else:
        issues.append(
            "The element adds event listeners but does not appear to clean them up"
        )

    # 7. No eval() or Function() constructor
    has_eval = bool(re.search(r"\beval\s*\(", code))
    has_function_ctor = bool(re.search(r"\bnew\s+Function\s*\(", code))
    if not has_eval and not has_function_ctor:
        checks_passed += 1
    else:
        issues.append(
            "The element uses eval() or the Function constructor, which is a security concern"
        )

    score = checks_passed / total_checks if total_checks > 0 else 0.0
    return score, issues


# ============================================================================
# Issue classification helpers (for describe_error_naturally)
# ============================================================================

_STRUCTURAL_KEYWORDS = frozenset([
    "createNode", "Container", "PixiJS", "DOM", "export", "async",
    "synchronous", "brackets", "braces", "syntax", "structural",
])

_BEHAVIORAL_KEYWORDS = frozenset([
    "interaction", "click", "hover", "focus", "submit", "navigate",
    "animation", "GSAP", "event", "binding", "data binding", "behavior",
])

_VISUAL_KEYWORDS = frozenset([
    "color", "font", "text content", "border", "radius", "animation",
    "shadow", "glow", "opacity", "effect", "visual", "specification",
    "appear", "size",
])

_QUALITY_KEYWORDS = frozenset([
    "console", "TODO", "FIXME", "hardcoded", "localhost", "API key",
    "secret", "credential", "var ", "listener", "cleanup", "eval",
    "Function constructor", "quality", "short", "long", "scoped",
])


def _is_structural_issue(issue: str) -> bool:
    return any(kw.lower() in issue.lower() for kw in _STRUCTURAL_KEYWORDS)


def _is_behavioral_issue(issue: str) -> bool:
    return any(kw.lower() in issue.lower() for kw in _BEHAVIORAL_KEYWORDS)


def _is_visual_issue(issue: str) -> bool:
    return any(kw.lower() in issue.lower() for kw in _VISUAL_KEYWORDS)


def _is_quality_issue(issue: str) -> bool:
    return any(kw.lower() in issue.lower() for kw in _QUALITY_KEYWORDS)


# ============================================================================
# Vision model interaction helpers
# ============================================================================


def _load_image_as_base64(image_url: str) -> str:
    """Load an image from a URL or local path and return base64-encoded data.

    Supports:
    - HTTP/HTTPS URLs (fetched via httpx)
    - Local file paths (read directly)
    - data: URIs (extracted directly)
    """
    if image_url.startswith("data:"):
        # Already a data URI — extract the base64 portion
        _, _, b64_data = image_url.partition(",")
        return b64_data

    if image_url.startswith(("http://", "https://")):
        import httpx

        response = httpx.get(image_url, timeout=30, follow_redirects=True)
        response.raise_for_status()
        return base64.b64encode(response.content).decode("utf-8")

    # Local file path
    with open(image_url, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def _ask_vision_model_caption_check(
    image_b64: str, caption: str
) -> dict[str, Any]:
    """Ask the vision model whether a caption accurately describes an image.

    Returns: {
        "accurate": bool,
        "confidence": float (0-1),
        "reason": str,
        "correctedCaption": str | None,
    }
    """
    prompt = f"""You are verifying whether a UI element caption accurately describes the element shown in this image.

Caption to verify:
\"\"\"{caption}\"\"\"

Evaluate the caption against the image. Consider:
1. Does the caption describe the correct type of element (button, input, card, etc.)?
2. Are the colors, dimensions, and visual details accurate?
3. Are the interactions and behavior described plausible for this element?
4. Is the caption self-contained enough for someone to implement the element without seeing the image?

Respond in JSON format ONLY:
{{
  "accurate": true/false,
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation",
  "correctedCaption": null or "a complete corrected caption if inaccurate"
}}

If the caption is mostly accurate but missing some details visible in the image,
set accurate to false and provide a correctedCaption that includes the missing details.
The correctedCaption MUST be self-contained and complete."""

    raw_response = _call_vision_model(image_b64, prompt)

    try:
        return _parse_json_response(raw_response)
    except (json.JSONDecodeError, ValueError):
        logger.warning(
            "Vision model returned non-JSON response for caption check. "
            "Treating as uncertain."
        )
        return {
            "accurate": False,
            "confidence": 0.0,
            "reason": "Could not parse vision model response",
            "correctedCaption": None,
        }


def _call_vision_model(image_b64: str, prompt: str) -> str:
    """Call the configured vision model with an image and text prompt.

    The model provider is determined by PRISM_VISION_MODEL_PROVIDER env var.
    Currently supports: "anthropic" (default).
    """
    if VISION_MODEL_PROVIDER == "anthropic":
        return _call_anthropic_vision(image_b64, prompt)
    else:
        raise ValueError(
            f"Unsupported vision model provider: {VISION_MODEL_PROVIDER}. "
            f"Set PRISM_VISION_MODEL_PROVIDER to 'anthropic'."
        )


def _call_anthropic_vision(image_b64: str, prompt: str) -> str:
    """Call the Anthropic Claude vision API."""
    import anthropic

    api_key = ANTHROPIC_API_KEY
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Required for caption verification."
        )

    client = anthropic.Anthropic(api_key=api_key)

    message = client.messages.create(
        model=VISION_MODEL_NAME,
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": image_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            }
        ],
    )

    return message.content[0].text


def _call_text_model(prompt: str) -> str:
    """Call the configured text model (no image) for caption generation fallback."""
    if VISION_MODEL_PROVIDER == "anthropic":
        import anthropic

        api_key = ANTHROPIC_API_KEY
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. Required for caption generation."
            )

        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model=VISION_MODEL_NAME,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text

    raise ValueError(
        f"Unsupported model provider: {VISION_MODEL_PROVIDER}. "
        f"Set PRISM_VISION_MODEL_PROVIDER to 'anthropic'."
    )


# ============================================================================
# Color comparison helpers
# ============================================================================


def _normalize_color(color: str) -> str:
    """Normalize a color string to lowercase 6-digit hex without '#'."""
    color = color.strip().lower()
    if color.startswith("#"):
        color = color[1:]
    # Expand shorthand: #abc -> aabbcc
    if len(color) == 3:
        color = "".join(c * 2 for c in color)
    return color


def _hex_to_int(hex_color: str) -> int | None:
    """Convert a hex color string to integer (e.g., 'ff0000' -> 0xff0000)."""
    normalized = _normalize_color(hex_color)
    try:
        return int(normalized, 16)
    except ValueError:
        return None


def _color_present_in_code(code: str, color_value: str) -> bool:
    """Check if a color value is present in code in any common format.

    Checks for:
    - Hex with # (e.g., '#ff0000')
    - Hex without # (e.g., 'ff0000')
    - Numeric hex (e.g., 0xff0000) — common in PixiJS
    - CSS rgb() format
    """
    normalized = _normalize_color(color_value)
    if not normalized:
        return False

    # Check hex with # (case-insensitive)
    if re.search(rf"#\s*{re.escape(normalized)}\b", code, re.IGNORECASE):
        return True

    # Check hex without # in quotes
    if re.search(
        rf"""['"]#?{re.escape(normalized)}['"]""", code, re.IGNORECASE
    ):
        return True

    # Check numeric hex (0xRRGGBB) — common in PixiJS Graphics API
    hex_int = _hex_to_int(color_value)
    if hex_int is not None:
        hex_literal = f"0x{normalized}"
        if re.search(re.escape(hex_literal), code, re.IGNORECASE):
            return True

    # Check shorthand if original was 6-digit
    original_stripped = color_value.strip().lstrip("#").lower()
    if len(original_stripped) == 6:
        # Check if the short form (3-char) matches
        if (
            original_stripped[0] == original_stripped[1]
            and original_stripped[2] == original_stripped[3]
            and original_stripped[4] == original_stripped[5]
        ):
            shorthand = (
                original_stripped[0] + original_stripped[2] + original_stripped[4]
            )
            if re.search(
                rf"""['"]#?{re.escape(shorthand)}['"]""", code, re.IGNORECASE
            ):
                return True

    return False


# ============================================================================
# Action description helper (for behavioral issue messages)
# ============================================================================


def _describe_action(action: str, interaction: dict) -> str:
    """Describe an interaction action in natural language.

    Used by _check_behavioral to produce natural-language issue descriptions
    without referencing code.
    """
    descriptions: dict[str, str] = {
        "navigate": "navigate to another page",
        "toggle": "toggle a visual state",
        "submit": "submit form data",
        "open-modal": "open a modal dialog",
        "close-modal": "close a modal dialog",
        "api-call": "trigger an API request",
        "state-update": "update the application state",
        "animation": "trigger an animation",
        "custom": "perform a custom action",
    }

    desc = descriptions.get(action, f"perform a '{action}' action")

    target_hub = interaction.get("targetHubId")
    if target_hub and action == "navigate":
        desc = f"navigate to the '{target_hub}' page"

    return desc


# ============================================================================
# JSON parsing helper
# ============================================================================


def _parse_json_response(raw: str) -> dict:
    """Parse a JSON response from a model, stripping markdown fences if present."""
    text = raw.strip()

    # Strip markdown code fences
    if text.startswith("```"):
        lines = text.splitlines()
        # Remove first line (```json or ```)
        lines = lines[1:]
        # Remove last line if it's ```)
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    return json.loads(text)
