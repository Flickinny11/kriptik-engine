"""SGLang code generation worker for Prism pipeline.

Generates PixiJS v8 code for each UI element node in the knowledge graph.
Dispatched in parallel across 100+ Modal L4 GPU containers.

INVARIANT 9: System prompt is IDENTICAL for ALL containers.
All node-specific content goes in the user message ONLY.
This enables RadixAttention prefix cache sharing for up to 6.4x throughput gain.

INVARIANT 3: Contamination-aware repair.
When code generation fails verification, the failing code is DELETED before
regeneration. The repair model receives ONLY the caption/spec — never the
broken code. See build_repair_spec() for the full protocol.

Spec reference: docs/DIFFUSION-ENGINE-SPEC.md Section 11 — Parallel Code Generation Phase
Model: Qwen3-Coder-Next 80B-A3B (AWQ-INT4 quantized)
Hardware: L4 GPU (24GB VRAM, 300 GB/s bandwidth)
Expected throughput: 400-1000 tok/s per container
Snippet size: ~200 tokens per element
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# The system prompt — IDENTICAL for every node, every container.
# DO NOT add per-node content here. This enables RadixAttention cache sharing.
#
# This constant is defined at module level and never mutated. Every call to
# generate_code() and every container in the fleet sends this exact string
# as the system message. SGLang's RadixAttention caches the KV entries for
# this prefix, so all 100+ containers share a single cached computation.
# ---------------------------------------------------------------------------
CODEGEN_SYSTEM_PROMPT = """You are a code generator for Kriptik Prism. Generate a self-contained PixiJS v8
component module for a UI element.

CONSTRAINTS:
- Use PixiJS v8 API only (Container, Sprite, Graphics, Text, NineSliceSprite)
- Export a single function: createNode(config: NodeConfig): Container
- Handle all events internally (pointerover, pointerout, pointertap)
- Use GSAP for animations
- All text uses BitmapText or programmatic rendering (no DOM text)
- Code must be synchronous (no async/await in render path)
- Return a PixiJS Container with all children attached

OUTPUT: Only the JavaScript code. No explanation. No markdown fences."""


# Patterns that indicate DOM manipulation (forbidden in PixiJS modules)
_DOM_PATTERNS = [
    r"\bdocument\s*\.\s*createElement\b",
    r"\bdocument\s*\.\s*getElementById\b",
    r"\bdocument\s*\.\s*querySelector\b",
    r"\binnerHTML\b",
    r"\bouterHTML\b",
    r"\btextContent\b",
    r"\bappendChild\b",
    r"\bremoveChild\b",
    r"\bdocument\s*\.\s*body\b",
    r"\bdocument\s*\.\s*head\b",
    r"\bwindow\s*\.\s*document\b",
]

# Compiled regex for DOM detection
_DOM_REGEX = re.compile("|".join(_DOM_PATTERNS))

# Pattern for async/await in the render path
_ASYNC_PATTERN = re.compile(r"\basync\s+function\b|\bawait\s+")

# Pattern for import statements (modules should be self-contained)
_IMPORT_PATTERN = re.compile(r"^\s*import\s+", re.MULTILINE)

# Pattern to verify createNode export exists
_CREATE_NODE_PATTERN = re.compile(
    r"(?:export\s+(?:default\s+)?function\s+createNode|"
    r"(?:module\.)?exports\s*(?:\.\s*createNode)?\s*=|"
    r"export\s+\{[^}]*\bcreateNode\b[^}]*\})"
)

# Pattern to verify Container usage
_CONTAINER_PATTERN = re.compile(r"\bContainer\b")


# ---------------------------------------------------------------------------
# SGLang runtime handle (cached per container)
# ---------------------------------------------------------------------------
_sglang_runtime = None


def _get_sglang_runtime():
    """Initialize and cache the SGLang runtime.

    Loads the Qwen3-Coder-Next model with:
    - AWQ-INT4 quantization for L4 GPU memory (fits in 24GB VRAM)
    - RadixAttention enabled (default in SGLang)
    - Optimized for code generation throughput

    The runtime is initialized once per container and reused across all
    invocations within that container's lifetime.
    """
    global _sglang_runtime
    if _sglang_runtime is not None:
        return _sglang_runtime

    import sglang as sgl

    _sglang_runtime = sgl.Runtime(
        model_path="Qwen/Qwen3-Coder-Next-80B-A3B-AWQ",
        quantization="awq",
        # RadixAttention is enabled by default in SGLang. The identical
        # CODEGEN_SYSTEM_PROMPT across all containers means the KV cache
        # for the system prompt prefix is computed once and shared.
    )
    return _sglang_runtime


# ---------------------------------------------------------------------------
# Spec building
# ---------------------------------------------------------------------------


def build_node_spec(node: dict[str, Any], graph: dict[str, Any]) -> dict[str, Any]:
    """Build the spec dict that gets sent to generate_code().

    Extracts from the node:
    - caption: self-contained natural language description
    - visualSpec: colors, typography, spacing, effects, animations
    - behaviorSpec: interactions, data bindings, state
    - neighborContext: brief summary of adjacent nodes for layout context
    - atlasRegion: texture atlas coordinates if available

    The neighborContext is a brief summary — NOT the neighbor's code or full
    spec. It provides just enough layout context (type, element type, relative
    position) for the code generator to produce spatially-aware output.

    Args:
        node: A GraphNode dict from the knowledge graph.
        graph: The full PrismGraph dict (for resolving edges and neighbors).

    Returns:
        A spec dict suitable for passing to generate_code().
    """
    node_id = node["id"]

    # Extract the core node spec fields
    caption = node.get("caption", "")
    visual_spec = node.get("visualSpec", {})
    behavior_spec = node.get("behaviorSpec", {})
    atlas_region = node.get("atlasRegion")

    # Build neighbor context from graph edges.
    # This is deliberately terse — just node type and element type, no code.
    neighbor_context = _build_neighbor_context(node_id, graph)

    return {
        "nodeId": node_id,
        "caption": caption,
        "visualSpec": visual_spec,
        "behaviorSpec": behavior_spec,
        "neighborContext": neighbor_context,
        "atlasRegion": atlas_region,
    }


def _build_neighbor_context(
    node_id: str, graph: dict[str, Any]
) -> str:
    """Build a terse neighbor context string for a node.

    Examines graph edges to find parent, sibling, and child relationships.
    Returns a human-readable summary like:

        Parent: node-abc (element, navbar)
        Siblings: node-def (element, button), node-ghi (element, input)
        Children: node-jkl (element, icon)

    Only includes type and elementType — never code, captions, or full specs
    of neighbors (those are self-contained in each node's own caption).
    """
    nodes_by_id: dict[str, dict[str, Any]] = {}
    for n in graph.get("nodes", []):
        nodes_by_id[n["id"]] = n

    edges = graph.get("edges", [])

    # Find parent nodes (edges where this node is the target of a 'contains' edge)
    parents: list[str] = []
    # Find child nodes (edges where this node is the source of a 'contains' edge)
    children: list[str] = []
    # Find siblings (other nodes contained by the same parent)
    parent_ids: set[str] = set()

    for edge in edges:
        if edge.get("type") == "contains":
            if edge.get("target") == node_id:
                parents.append(edge["source"])
                parent_ids.add(edge["source"])
            elif edge.get("source") == node_id:
                children.append(edge["target"])

    # Siblings: other nodes that share a parent via 'contains' edges
    sibling_ids: set[str] = set()
    for edge in edges:
        if edge.get("type") == "contains" and edge.get("source") in parent_ids:
            target = edge.get("target")
            if target and target != node_id:
                sibling_ids.add(target)

    def _describe(nid: str) -> str:
        n = nodes_by_id.get(nid)
        if not n:
            return f"{nid} (unknown)"
        node_type = n.get("type", "unknown")
        element_type = n.get("elementType", "")
        if element_type:
            return f"{nid} ({node_type}, {element_type})"
        return f"{nid} ({node_type})"

    lines: list[str] = []

    if parents:
        parent_descs = ", ".join(_describe(pid) for pid in parents)
        lines.append(f"Parent: {parent_descs}")
    else:
        lines.append("Parent: none (root-level element)")

    if sibling_ids:
        # Limit siblings to prevent bloating the prompt
        sibling_list = sorted(sibling_ids)[:10]
        sibling_descs = ", ".join(_describe(sid) for sid in sibling_list)
        if len(sibling_ids) > 10:
            sibling_descs += f", ... (+{len(sibling_ids) - 10} more)"
        lines.append(f"Siblings: {sibling_descs}")
    else:
        lines.append("Siblings: none")

    if children:
        child_list = children[:10]
        child_descs = ", ".join(_describe(cid) for cid in child_list)
        if len(children) > 10:
            child_descs += f", ... (+{len(children) - 10} more)"
        lines.append(f"Children: {child_descs}")
    else:
        lines.append("Children: none")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# User message construction
# ---------------------------------------------------------------------------


def build_user_message(spec: dict[str, Any]) -> str:
    """Build the user message for code generation from a node spec.

    This is the per-node content that varies across containers. It is sent
    as the user message while the system message (CODEGEN_SYSTEM_PROMPT)
    remains identical for all nodes.

    Format follows the spec template:
        ELEMENT SPECIFICATION: {caption}
        VISUAL: {json visualSpec}
        BEHAVIOR: {json behaviorSpec}
        NEIGHBORS: {neighborContext}
        ATLAS REGION: {atlasRegion}

    Args:
        spec: A spec dict from build_node_spec() or build_repair_spec().

    Returns:
        The formatted user message string.
    """
    caption = spec.get("caption", "")
    visual_spec = spec.get("visualSpec", {})
    behavior_spec = spec.get("behaviorSpec", {})
    neighbor_context = spec.get("neighborContext", "")
    atlas_region = spec.get("atlasRegion")

    # Format visual spec: pull out the key fields the spec calls for
    visual_parts: list[str] = []
    colors = visual_spec.get("colors", {})
    if colors:
        visual_parts.append(f"Colors: {json.dumps(colors)}")
    typography = visual_spec.get("typography", {})
    if typography:
        visual_parts.append(f"Typography: {json.dumps(typography)}")
    effects = visual_spec.get("effects", {})
    if effects:
        visual_parts.append(f"Effects: {json.dumps(effects)}")
    spacing = visual_spec.get("spacing", {})
    if spacing:
        visual_parts.append(f"Spacing: {json.dumps(spacing)}")
    borders = visual_spec.get("borders", {})
    if borders:
        visual_parts.append(f"Borders: {json.dumps(borders)}")
    animation = visual_spec.get("animation")
    if animation:
        visual_parts.append(f"Animation: {json.dumps(animation)}")
    text_content = visual_spec.get("textContent", [])
    if text_content:
        visual_parts.append(f"Text content: {json.dumps(text_content)}")

    visual_str = "\n- ".join(visual_parts) if visual_parts else "none"
    if visual_parts:
        visual_str = "- " + visual_str

    # Format behavior spec
    behavior_parts: list[str] = []
    interactions = behavior_spec.get("interactions", [])
    if interactions:
        behavior_parts.append(f"Interactions: {json.dumps(interactions)}")
    data_bindings = behavior_spec.get("dataBindings", [])
    if data_bindings:
        behavior_parts.append(f"Data bindings: {json.dumps(data_bindings)}")
    state_mgmt = behavior_spec.get("stateManagement")
    if state_mgmt:
        behavior_parts.append(f"State: {json.dumps(state_mgmt)}")
    api_calls = behavior_spec.get("apiCalls", [])
    if api_calls:
        behavior_parts.append(f"API calls: {json.dumps(api_calls)}")
    a11y_role = behavior_spec.get("accessibilityRole", "")
    if a11y_role:
        behavior_parts.append(f"Accessibility role: {a11y_role}")

    behavior_str = "\n- ".join(behavior_parts) if behavior_parts else "none"
    if behavior_parts:
        behavior_str = "- " + behavior_str

    # Format atlas region
    if atlas_region:
        atlas_str = (
            f"Atlas: {atlas_region.get('atlasIndex', 0)}, "
            f"Source rect: {atlas_region.get('x', 0)}, {atlas_region.get('y', 0)}, "
            f"{atlas_region.get('width', 0)}, {atlas_region.get('height', 0)}"
        )
    else:
        atlas_str = "none (no atlas region assigned)"

    return (
        f"ELEMENT SPECIFICATION:\n{caption}\n\n"
        f"VISUAL:\n{visual_str}\n\n"
        f"BEHAVIOR:\n{behavior_str}\n\n"
        f"NEIGHBORS:\n{neighbor_context}\n\n"
        f"ATLAS REGION:\n{atlas_str}"
    )


# ---------------------------------------------------------------------------
# Code generation
# ---------------------------------------------------------------------------


def generate_code(spec: dict[str, Any]) -> dict[str, Any]:
    """Generate PixiJS v8 code for a single node using SGLang.

    Steps:
    1. Build user message from spec
    2. Send to SGLang runtime with IDENTICAL system prompt
    3. Extract generated code from response
    4. Basic syntax validation
    5. Return result

    The system prompt (CODEGEN_SYSTEM_PROMPT) is a module-level constant
    shared by ALL containers. SGLang's RadixAttention caches the KV entries
    for this prefix, giving up to 6.4x throughput gain across the fleet.

    Args:
        spec: A spec dict from build_node_spec() or build_repair_spec().

    Returns:
        {
            "nodeId": str,
            "code": str,
            "tokensUsed": int,
            "generationTimeMs": int,
            "valid": bool,
            "validationIssues": list[str],
        }
    """
    node_id = spec.get("nodeId", "unknown")
    user_message = build_user_message(spec)

    start_time = time.monotonic()

    runtime = _get_sglang_runtime()

    # Send to SGLang with the identical system prompt + per-node user message
    response = runtime.generate(
        prompt=None,
        messages=[
            {"role": "system", "content": CODEGEN_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        max_new_tokens=2048,
        temperature=0.2,
        top_p=0.95,
    )

    elapsed_ms = int((time.monotonic() - start_time) * 1000)

    # Extract the generated code from the response
    generated_text = _extract_code_from_response(response)

    # Count tokens from the response metadata
    tokens_used = 0
    if hasattr(response, "meta_info") and response.meta_info:
        tokens_used = response.meta_info.get("completion_tokens", 0)
    elif hasattr(response, "usage") and response.usage:
        tokens_used = response.usage.get("completion_tokens", 0)

    # Validate the generated code
    validation = validate_generated_code(generated_text)

    logger.info(
        "Generated code for node %s: %d tokens in %dms, valid=%s",
        node_id,
        tokens_used,
        elapsed_ms,
        validation["valid"],
    )
    if not validation["valid"]:
        logger.warning(
            "Validation issues for node %s: %s",
            node_id,
            "; ".join(validation["issues"]),
        )

    return {
        "nodeId": node_id,
        "code": generated_text,
        "tokensUsed": tokens_used,
        "generationTimeMs": elapsed_ms,
        "valid": validation["valid"],
        "validationIssues": validation["issues"],
    }


def _extract_code_from_response(response: Any) -> str:
    """Extract the code string from an SGLang response object.

    Handles several response formats:
    - response.text (string output)
    - response["text"] (dict output)
    - response.choices[0].message.content (OpenAI-compatible format)

    Also strips markdown fences if the model included them despite
    the system prompt instruction not to.
    """
    text = ""

    if hasattr(response, "text"):
        text = response.text
    elif isinstance(response, dict) and "text" in response:
        text = response["text"]
    elif hasattr(response, "choices") and response.choices:
        choice = response.choices[0]
        if hasattr(choice, "message") and hasattr(choice.message, "content"):
            text = choice.message.content or ""
        elif hasattr(choice, "text"):
            text = choice.text or ""
    elif isinstance(response, str):
        text = response

    # Strip markdown fences if present (model may ignore the "no fences" instruction)
    text = text.strip()
    if text.startswith("```"):
        # Remove opening fence (with optional language tag)
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline + 1 :]
        # Remove closing fence
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3].rstrip()

    return text.strip()


# ---------------------------------------------------------------------------
# Contamination-aware repair
# ---------------------------------------------------------------------------


def build_repair_spec(
    node: dict[str, Any],
    attempt: int,
    error_description: str | None = None,
) -> dict[str, Any]:
    """Build a repair spec for contamination-aware repair.

    CRITICAL INVARIANT 3: Contamination-Aware Repair

    This function NEVER receives the previous failed code. The orchestrator
    must DELETE the generated code from memory entirely before calling this.

    attempt 1: Use ONLY caption + visualSpec + behaviorSpec
               NEVER include: previous code, error messages, stack traces,
               AST fragments, variable names from the failing version,
               references to "the failing version"

    attempt 2: Add NATURAL LANGUAGE error description only.
               The error_description must be a human-written summary like
               "the button click handler didn't emit the navigation event"
               — NOT the actual error output, stack trace, code snippets,
               or line numbers from the broken code.

    attempt 3+: Escalation to frontier model (Claude Opus 4.6).
                Handled by the orchestrator, not by this worker.
                This function raises ValueError for attempt >= 3.

    Args:
        node: The GraphNode dict (caption, visualSpec, behaviorSpec).
              Must NOT contain the previously generated code.
        attempt: Repair attempt number (1 or 2).
        error_description: For attempt 2 only — a natural language
            description of what went wrong. Must NOT contain actual
            error output, stack traces, code snippets, or line numbers.

    Returns:
        A spec dict suitable for generate_code().

    Raises:
        ValueError: If attempt >= 3 (should be escalated to frontier model).
        ValueError: If attempt == 2 and error_description is None.
    """
    if attempt >= 3:
        raise ValueError(
            f"Repair attempt {attempt} exceeds maximum for this worker. "
            "Escalate to frontier model (Claude Opus 4.6) via the orchestrator."
        )

    node_id = node.get("id", "unknown")

    # Extract ONLY the specification fields — never code, never error data
    caption = node.get("caption", "")
    visual_spec = node.get("visualSpec", {})
    behavior_spec = node.get("behaviorSpec", {})

    if attempt == 1:
        # Attempt 1: Pure spec regeneration. Nothing from the failed attempt.
        logger.info(
            "Building repair spec for node %s (attempt 1): spec-only regeneration",
            node_id,
        )
        return {
            "nodeId": node_id,
            "caption": caption,
            "visualSpec": visual_spec,
            "behaviorSpec": behavior_spec,
            # No neighbor context or atlas region for repair — keep it minimal
            # to reduce any contextual bias from the original generation.
            "neighborContext": "",
            "atlasRegion": node.get("atlasRegion"),
        }

    if attempt == 2:
        if error_description is None:
            raise ValueError(
                "Repair attempt 2 requires a natural language error_description. "
                "This must be a human-written summary of what went wrong — "
                "NOT the actual error output, stack trace, or code snippets."
            )

        # Attempt 2: Spec + natural language error description.
        # The error_description is appended to the caption as additional context.
        # It must be natural language — the orchestrator is responsible for
        # converting machine error output into a human description.
        logger.info(
            "Building repair spec for node %s (attempt 2): spec + error description",
            node_id,
        )

        augmented_caption = (
            f"{caption}\n\n"
            f"ADDITIONAL CONTEXT: {error_description}"
        )

        return {
            "nodeId": node_id,
            "caption": augmented_caption,
            "visualSpec": visual_spec,
            "behaviorSpec": behavior_spec,
            "neighborContext": "",
            "atlasRegion": node.get("atlasRegion"),
        }

    # Should not reach here due to the >= 3 check above, but be explicit
    raise ValueError(f"Invalid repair attempt number: {attempt}")


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def validate_generated_code(code: str) -> dict[str, Any]:
    """Basic syntax validation of generated JavaScript code.

    Checks:
    1. Contains 'createNode' function export
    2. Contains 'Container' usage (PixiJS base class)
    3. No DOM manipulation (document.createElement, innerHTML, etc.)
    4. No async/await in render path
    5. No import statements (self-contained module)
    6. Non-empty code output

    This is a fast pre-check before the code is sent to the SWE-RM
    verification model for full semantic validation. It catches obvious
    structural issues without running any code.

    Args:
        code: The generated JavaScript code string.

    Returns:
        { "valid": bool, "issues": list[str] }
    """
    issues: list[str] = []

    if not code or not code.strip():
        return {"valid": False, "issues": ["Empty code output"]}

    # Check 1: createNode function export
    if not _CREATE_NODE_PATTERN.search(code):
        issues.append(
            "Missing createNode function export. "
            "Expected: export function createNode(config: NodeConfig): Container"
        )

    # Check 2: Container usage
    if not _CONTAINER_PATTERN.search(code):
        issues.append(
            "No Container usage found. "
            "PixiJS v8 Container is required as the return type."
        )

    # Check 3: No DOM manipulation
    dom_match = _DOM_REGEX.search(code)
    if dom_match:
        issues.append(
            f"DOM manipulation detected: '{dom_match.group()}'. "
            "Use PixiJS v8 API only — no direct DOM access."
        )

    # Check 4: No async/await in render path
    async_match = _ASYNC_PATTERN.search(code)
    if async_match:
        issues.append(
            f"Async/await detected: '{async_match.group().strip()}'. "
            "Code must be synchronous in the render path."
        )

    # Check 5: No import statements (self-contained module)
    import_match = _IMPORT_PATTERN.search(code)
    if import_match:
        issues.append(
            "Import statement detected. "
            "Modules must be self-contained — dependencies are injected via config."
        )

    return {"valid": len(issues) == 0, "issues": issues}
