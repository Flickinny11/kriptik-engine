"""
graph.py -- Knowledge graph construction for Prism diffusion engine.

Constructs the bipartite DAG (PrismGraph) from an approved PrismPlan
and SAM 3.1 segmentation results. The graph IS the application -- it
persists through runtime, editing, and optimization. It is never
compiled to a different format.

Invariants enforced here:
  1. Graph = App (runtime representation, not intermediate)
  2. Self-Contained Nodes (every caption fully describes the element)
  3. Bipartite DAG (elements + hubs are disjoint node types, many-to-many edges)

All dict shapes match the TypeScript interfaces in
packages/shared-interfaces/src/prism-graph.ts and prism-plan.ts.
"""

import re
import uuid
import time
from typing import Optional

import numpy as np
from scipy.optimize import linear_sum_assignment


# ---------------------------------------------------------------------------
# Semantic label similarity map -- maps SAM segment labels to UIElementType
# values for boosting match scores during Hungarian assignment.
# ---------------------------------------------------------------------------

_LABEL_TO_ELEMENT_TYPES: dict[str, set[str]] = {
    "button": {"button", "toggle"},
    "input": {"input", "textarea", "search-bar"},
    "text": {"hero-section", "card", "badge", "tag"},
    "image": {"image", "avatar", "icon"},
    "navbar": {"navbar"},
    "navigation": {"navbar", "sidebar", "breadcrumb"},
    "sidebar": {"sidebar"},
    "footer": {"footer"},
    "card": {"card"},
    "form": {"form", "input", "textarea", "select", "checkbox", "radio"},
    "table": {"table", "list", "grid"},
    "modal": {"modal", "drawer", "popover"},
    "chart": {"chart", "graph"},
    "slider": {"slider", "progress"},
    "tabs": {"tabs"},
    "carousel": {"carousel"},
    "dropdown": {"select", "popover"},
    "icon": {"icon", "badge"},
    "avatar": {"avatar", "image"},
    "hero": {"hero-section", "page-background"},
    "video": {"video-player"},
    "audio": {"audio-player"},
    "pagination": {"pagination"},
    "notification": {"notification", "toast", "alert"},
    "spinner": {"spinner", "skeleton", "progress"},
    "tooltip": {"tooltip"},
    "background": {"page-background"},
}

# Cross-reference patterns that violate Invariant 2 (self-contained captions).
_CROSS_REFERENCE_PATTERNS: list[re.Pattern] = [
    re.compile(r"\blike the\b.*\bin (?:the )?\w+ (?:section|hub|page)\b", re.IGNORECASE),
    re.compile(r"\bsee (?:the )?\w+ (?:for|hub|section|page)\b", re.IGNORECASE),
    re.compile(r"\bsame as (?:the )?\w+\b", re.IGNORECASE),
    re.compile(r"\brefers? to (?:the )?\w+ (?:node|element|component)\b", re.IGNORECASE),
    re.compile(r"\bmatching (?:the )?\w+ (?:in|from) (?:the )?\w+\b", re.IGNORECASE),
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def construct_knowledge_graph(
    plan: dict,
    segmentation_result: dict,
) -> dict:
    """Build a PrismGraph from an approved plan and SAM 3.1 segmentation results.

    Steps:
      1. Create Hub objects from plan.graph.hubs
      2. Match segmented image regions to planned elements by spatial proximity
         + semantic type via Hungarian algorithm
      3. Create GraphNode for each matched element with self-contained caption
      4. Create shared nodes (nodes appearing in multiple hubs) -- exist once
         canonically with per-hub property overrides
      5. Create GraphEdge connections (contains, navigates-to, shares-state, etc.)
      6. Compute GraphMetadata

    Parameters
    ----------
    plan : dict
        An approved PrismPlan dict.  Must contain ``plan["graph"]["hubs"]``
        and optionally ``plan["graph"]["sharedComponents"]``.
    segmentation_result : dict
        Keyed by hub ID.  Each value is a list of SAM 3.1 segment dicts:
        ``{ "mask": ..., "bbox": [x1, y1, x2, y2], "label": str, "confidence": float }``

    Returns
    -------
    dict
        A complete PrismGraph dict matching the ``PrismGraph`` TypeScript interface.
    """
    start_ms = time.time() * 1000

    graph_id = str(uuid.uuid4())
    plan_id = plan.get("id", str(uuid.uuid4()))
    project_id = plan.get("projectId", "")
    graph_plan = plan.get("graph", {})

    hub_plans: list[dict] = graph_plan.get("hubs", [])
    shared_component_plans: list[dict] = graph_plan.get("sharedComponents", [])

    # ------------------------------------------------------------------
    # 1. Create Hub shells (nodeIds/sharedNodeIds filled after node creation)
    # ------------------------------------------------------------------
    hubs: list[dict] = []
    hub_by_id: dict[str, dict] = {}
    for hp in hub_plans:
        hub = _build_hub_from_plan(hp)
        hubs.append(hub)
        hub_by_id[hub["id"]] = hub

    # ------------------------------------------------------------------
    # 2 + 3. Create nodes per hub, matching segments to planned elements
    # ------------------------------------------------------------------
    nodes: list[dict] = []
    node_by_id: dict[str, dict] = {}
    # Track which shared component IDs we have already created a canonical
    # node for, so we do not duplicate them.
    shared_node_ids: dict[str, str] = {}  # sharedComponentPlan.id -> node.id

    for hp in hub_plans:
        hub_id = hp["id"]
        hub = hub_by_id[hub_id]
        hub_segments = segmentation_result.get(hub_id, [])

        # Separate shared vs non-shared elements
        own_elements = [e for e in hp.get("elements", []) if not e.get("isShared")]
        shared_elements = [e for e in hp.get("elements", []) if e.get("isShared")]

        # -- Own elements: always create a new node -----------------------
        matches = match_segments_to_elements(hub_segments, own_elements)
        for match_entry in matches:
            element = _find_element_by_id(own_elements, match_entry["elementId"])
            if element is None:
                continue
            image_url = segmentation_result.get("_imageUrls", {}).get(hub_id)
            node = build_node_from_element(
                element, hub_id, match_entry, image_url,
            )
            nodes.append(node)
            node_by_id[node["id"]] = node
            hub["nodeIds"].append(node["id"])

        # -- Shared elements: canonical node created once -----------------
        for se in shared_elements:
            plan_element_id = se["id"]
            if plan_element_id in shared_node_ids:
                # Already created canonically -- just record membership
                existing_node_id = shared_node_ids[plan_element_id]
                existing_node = node_by_id[existing_node_id]
                if hub_id not in existing_node["hubMemberships"]:
                    existing_node["hubMemberships"].append(hub_id)
                if existing_node_id not in hub["sharedNodeIds"]:
                    hub["sharedNodeIds"].append(existing_node_id)
            else:
                # First encounter -- create the canonical node
                match_list = match_segments_to_elements(hub_segments, [se])
                match_entry = match_list[0] if match_list else _synthetic_match(se)
                image_url = segmentation_result.get("_imageUrls", {}).get(hub_id)
                node = build_node_from_element(
                    se, hub_id, match_entry, image_url,
                )
                nodes.append(node)
                node_by_id[node["id"]] = node
                shared_node_ids[plan_element_id] = node["id"]
                hub["sharedNodeIds"].append(node["id"])

    # ------------------------------------------------------------------
    # 4. Process explicit SharedComponentPlan entries that may not have
    #    appeared inline in any hub's elements list.
    # ------------------------------------------------------------------
    for scp in shared_component_plans:
        if scp["id"] in shared_node_ids:
            # Already created above -- ensure all declared hubs are recorded
            node_id = shared_node_ids[scp["id"]]
            node = node_by_id[node_id]
            for target_hub_id in scp.get("hubIds", []):
                if target_hub_id not in node["hubMemberships"]:
                    node["hubMemberships"].append(target_hub_id)
                if target_hub_id in hub_by_id:
                    hub_obj = hub_by_id[target_hub_id]
                    if node_id not in hub_obj["sharedNodeIds"]:
                        hub_obj["sharedNodeIds"].append(node_id)
            continue

        # Build a synthetic element dict from the SharedComponentPlan
        element = {
            "id": scp["id"],
            "type": scp.get("type", "custom"),
            "caption": scp.get("caption", ""),
            "position": {"x": 0, "y": 0, "width": 200, "height": 60},
            "textContent": [],
            "interactions": [],
            "isShared": True,
        }
        first_hub_id = scp.get("hubIds", [""])[0]
        match_entry = _synthetic_match(element)
        image_url = segmentation_result.get("_imageUrls", {}).get(first_hub_id)
        node = build_node_from_element(
            element, first_hub_id, match_entry, image_url,
        )
        # Record all hub memberships
        node["hubMemberships"] = list(scp.get("hubIds", [first_hub_id]))
        nodes.append(node)
        node_by_id[node["id"]] = node
        shared_node_ids[scp["id"]] = node["id"]
        for target_hub_id in scp.get("hubIds", []):
            if target_hub_id in hub_by_id:
                hub_by_id[target_hub_id]["sharedNodeIds"].append(node["id"])

    # ------------------------------------------------------------------
    # 5. Build all graph edges
    # ------------------------------------------------------------------
    edges = build_edges(plan, nodes, hubs)

    # ------------------------------------------------------------------
    # 6. Compute metadata
    # ------------------------------------------------------------------
    generation_time_ms = time.time() * 1000 - start_ms
    metadata = compute_graph_metadata(nodes, edges, hubs)
    metadata["generationTimeMs"] = round(generation_time_ms, 2)

    graph: dict = {
        "id": graph_id,
        "planId": plan_id,
        "projectId": project_id,
        "version": 1,
        "nodes": nodes,
        "edges": edges,
        "hubs": hubs,
        "metadata": metadata,
    }

    # ------------------------------------------------------------------
    # 7. Validate and return
    # ------------------------------------------------------------------
    errors = validate_graph_invariants(graph)
    if errors:
        graph["_validationErrors"] = errors

    return graph


def match_segments_to_elements(
    segments: list[dict],
    elements: list[dict],
) -> list[dict]:
    """Match SAM 3.1 segments to planned elements using spatial proximity and
    type hints, solved via the Hungarian algorithm.

    Parameters
    ----------
    segments : list[dict]
        Each segment: ``{ "mask": ..., "bbox": [x1, y1, x2, y2], "label": str, "confidence": float }``
    elements : list[dict]
        Each element: ``{ "id": str, "type": str, "position": { x, y, width, height }, "caption": str }``

    Returns
    -------
    list[dict]
        One entry per element:
        ``{ "elementId": str, "segmentIndex": int | None, "matchScore": float, "bbox": [x1,y1,x2,y2] }``
    """
    if not elements:
        return []

    if not segments:
        # No segments at all -- every element gets a synthetic match
        return [_synthetic_match(el) for el in elements]

    n_segments = len(segments)
    n_elements = len(elements)

    # Build cost matrix (we minimize cost, so cost = 1 - score)
    cost_matrix = np.ones((n_elements, n_segments), dtype=np.float64)

    for ei, element in enumerate(elements):
        el_bbox = _element_to_bbox(element)
        el_type = element.get("type", "custom")

        for si, segment in enumerate(segments):
            seg_bbox = segment.get("bbox", [0, 0, 0, 0])

            # Spatial score: IoU between segment bbox and element planned position
            iou = _compute_iou(seg_bbox, el_bbox)

            # Semantic boost: label matches element type
            label = (segment.get("label") or "").lower().strip()
            semantic_boost = 0.0
            if label in _LABEL_TO_ELEMENT_TYPES:
                if el_type in _LABEL_TO_ELEMENT_TYPES[label]:
                    semantic_boost = 0.15

            # Confidence weighting from SAM
            confidence = segment.get("confidence", 0.5)

            score = (iou * 0.7) + (semantic_boost) + (confidence * 0.15)
            score = min(score, 1.0)

            cost_matrix[ei, si] = 1.0 - score

    # Solve assignment.  If more elements than segments (or vice versa),
    # linear_sum_assignment handles the rectangular matrix -- each row
    # (element) gets at most one column (segment).
    row_indices, col_indices = linear_sum_assignment(cost_matrix)

    assigned: dict[int, tuple[int, float]] = {}
    for ri, ci in zip(row_indices, col_indices):
        match_score = 1.0 - cost_matrix[ri, ci]
        assigned[ri] = (ci, match_score)

    results: list[dict] = []
    for ei, element in enumerate(elements):
        if ei in assigned:
            si, score = assigned[ei]
            seg_bbox = segments[si].get("bbox", [0, 0, 0, 0])
            results.append({
                "elementId": element["id"],
                "segmentIndex": si,
                "matchScore": round(score, 4),
                "bbox": list(seg_bbox),
            })
        else:
            results.append(_synthetic_match(element))

    return results


def build_node_from_element(
    element: dict,
    hub_id: str,
    segment_match: Optional[dict],
    image_url: Optional[str],
) -> dict:
    """Create a GraphNode dict from a planned element and its matched segment.

    The node's caption is taken directly from the plan's ``ElementPlan.caption``
    which must already be self-contained (Invariant 2).  This function does NOT
    fabricate or rewrite captions -- that responsibility lies with the planning
    phase and the post-construction caption verification blast.

    Parameters
    ----------
    element : dict
        An ``ElementPlan`` dict from the plan.
    hub_id : str
        The hub this element belongs to.
    segment_match : dict or None
        Output from ``match_segments_to_elements`` for this element.
    image_url : str or None
        URL to the hub's generated image (node-level image URLs are assigned
        after segmentation crops are uploaded to R2).

    Returns
    -------
    dict
        A ``GraphNode`` dict.
    """
    node_id = str(uuid.uuid4())

    # Determine position from segment bbox (preferred) or plan position
    position = _resolve_position(element, segment_match)

    # Build visual spec from element plan data
    visual_spec = _build_visual_spec(element)

    # Build behavior spec from element plan data
    behavior_spec = _build_behavior_spec(element)

    return {
        "id": node_id,
        "type": "element",
        "elementType": element.get("type", "custom"),
        "caption": element.get("caption", ""),
        "captionVerified": False,
        "hubMemberships": [hub_id],
        "position": position,
        "visualSpec": visual_spec,
        "behaviorSpec": behavior_spec,
        "code": None,
        "codeHash": None,
        "verificationScore": None,
        "imageUrl": image_url,
        "atlasRegion": None,
        "dependencies": element.get("dependencies", []),
        "status": "pending",
    }


def build_edges(
    plan: dict,
    nodes: list[dict],
    hubs: list[dict],
) -> list[dict]:
    """Build all graph edges from the plan structure and node/hub relationships.

    Edge types produced:
      - ``contains``: hub -> node (every node has at least one)
      - ``navigates-to``: node -> hub (from interactions with ``navigate`` action)
      - ``triggers``: node -> node (from interactions with toggle/submit/etc.)
      - ``data-flow``: node -> node (from data bindings referencing other nodes)
      - ``shares-state``: node <-> node (nodes sharing the same state key)
      - ``depends-on``: node -> node (explicit dependencies)
    """
    edges: list[dict] = []
    node_index: dict[str, dict] = {n["id"]: n for n in nodes}

    # ---- 'contains' edges: hub -> node ---------------------------------
    for hub in hubs:
        all_node_ids = list(set(hub.get("nodeIds", []) + hub.get("sharedNodeIds", [])))
        for nid in all_node_ids:
            if nid in node_index:
                edges.append(_make_edge(hub["id"], nid, "contains"))

    # Build a lookup from the plan's element IDs to our generated node IDs.
    # The plan uses ElementPlan.id; our nodes got new UUIDs.  We stored the
    # element type + caption to correlate, but we also need the original plan
    # element IDs.  We match on caption + type + hub membership as the
    # composite key.
    plan_element_id_to_node_id = _build_plan_element_lookup(plan, nodes)

    # ---- 'navigates-to' edges: node -> hub -----------------------------
    for node in nodes:
        behavior = node.get("behaviorSpec", {})
        for interaction in behavior.get("interactions", []):
            if interaction.get("action") == "navigate":
                target_hub_id = interaction.get("targetHubId")
                if target_hub_id:
                    edges.append(_make_edge(
                        node["id"], target_hub_id, "navigates-to",
                        metadata={"event": interaction.get("event", "click")},
                    ))

    # ---- 'triggers' edges: node -> node --------------------------------
    for node in nodes:
        behavior = node.get("behaviorSpec", {})
        for interaction in behavior.get("interactions", []):
            action = interaction.get("action", "")
            if action in ("toggle", "submit", "open-modal", "close-modal",
                          "api-call", "state-update", "animation", "custom"):
                target_node_id_plan = interaction.get("targetNodeId")
                if target_node_id_plan:
                    resolved = plan_element_id_to_node_id.get(target_node_id_plan, target_node_id_plan)
                    if resolved in node_index:
                        edges.append(_make_edge(
                            node["id"], resolved, "triggers",
                            metadata={"action": action, "event": interaction.get("event", "click")},
                        ))

    # ---- 'data-flow' edges: node -> node (via data bindings) -----------
    for node in nodes:
        behavior = node.get("behaviorSpec", {})
        for binding in behavior.get("dataBindings", []):
            if binding.get("source") == "props":
                # 'path' may reference another node's state key
                source_key = binding.get("path", "")
                provider_node = _find_node_by_state_key(nodes, source_key)
                if provider_node and provider_node["id"] != node["id"]:
                    edges.append(_make_edge(
                        provider_node["id"], node["id"], "data-flow",
                        metadata={"binding": source_key},
                    ))

    # ---- 'shares-state' edges: node <-> node ---------------------------
    state_groups: dict[str, list[str]] = {}
    for node in nodes:
        behavior = node.get("behaviorSpec", {})
        state_mgmt = behavior.get("stateManagement")
        if state_mgmt and state_mgmt.get("key"):
            key = state_mgmt["key"]
            state_groups.setdefault(key, []).append(node["id"])

    for _key, group_node_ids in state_groups.items():
        if len(group_node_ids) > 1:
            # Create edges between all pairs (undirected semantics, but edges
            # are directional in the graph -- create A->B for all unique pairs)
            for i in range(len(group_node_ids)):
                for j in range(i + 1, len(group_node_ids)):
                    edges.append(_make_edge(
                        group_node_ids[i], group_node_ids[j], "shares-state",
                        metadata={"stateKey": _key},
                    ))

    # ---- 'depends-on' edges: node -> node (explicit dependencies) ------
    for node in nodes:
        for dep_id in node.get("dependencies", []):
            resolved = plan_element_id_to_node_id.get(dep_id, dep_id)
            if resolved in node_index and resolved != node["id"]:
                edges.append(_make_edge(node["id"], resolved, "depends-on"))

    # ---- Navigation edges from the plan's navigationGraph ---------------
    nav_edges = plan.get("graph", {}).get("navigationGraph", [])
    for nav in nav_edges:
        source_hub_id = nav.get("sourceHubId")
        target_hub_id = nav.get("targetHubId")
        if source_hub_id and target_hub_id:
            # These are hub-to-hub edges; record as metadata on existing
            # navigates-to edges or create hub-level edges as 'navigates-to'.
            # Check if a node-level edge already covers this.
            already_covered = any(
                e["source"] == source_hub_id and e["target"] == target_hub_id
                and e["type"] == "navigates-to"
                for e in edges
            )
            if not already_covered:
                edges.append(_make_edge(
                    source_hub_id, target_hub_id, "navigates-to",
                    metadata={
                        "trigger": nav.get("trigger", "navigation"),
                        "conditions": nav.get("conditions", {}),
                        "hubLevel": True,
                    },
                ))

    return edges


def compute_graph_metadata(
    nodes: list[dict],
    edges: list[dict],
    hubs: list[dict],
) -> dict:
    """Compute ``GraphMetadata`` aggregate statistics.

    Returns a dict matching the ``GraphMetadata`` TypeScript interface.
    """
    shared_node_ids: set[str] = set()
    for hub in hubs:
        for nid in hub.get("sharedNodeIds", []):
            shared_node_ids.add(nid)

    total_code_size = 0
    for node in nodes:
        code = node.get("code")
        if code:
            total_code_size += len(code.encode("utf-8"))

    # Estimated draw calls: one per visible node per hub + atlas texture binds.
    # This is a rough estimate; actual draw calls depend on batching.
    estimated_draw_calls = len(nodes) + len(set(
        (n.get("atlasRegion") or {}).get("atlasIndex", 0)
        for n in nodes
        if n.get("atlasRegion")
    ))

    atlas_indices: set[int] = set()
    for node in nodes:
        region = node.get("atlasRegion")
        if region:
            atlas_indices.add(region.get("atlasIndex", 0))

    return {
        "totalNodes": len(nodes),
        "totalEdges": len(edges),
        "totalHubs": len(hubs),
        "totalSharedNodes": len(shared_node_ids),
        "estimatedDrawCalls": estimated_draw_calls,
        "atlasCount": len(atlas_indices),
        "totalCodeSize": total_code_size,
        "generationTimeMs": 0,  # Caller overwrites
        "totalCost": 0.0,       # Updated by orchestrator
    }


def validate_graph_invariants(graph: dict) -> list[str]:
    """Validate the graph against the Prism architectural invariants.

    Checks:
      1. Every node has at least one hubMembership
      2. Every hub's nodeIds reference actual nodes
      3. Shared nodes appear in multiple hubs
      4. No circular 'contains' edges
      5. All edge source/target IDs reference existing nodes or hubs
      6. Captions don't cross-reference other nodes (Invariant 2)

    Returns
    -------
    list[str]
        Error messages.  Empty list means the graph is valid.
    """
    errors: list[str] = []
    node_ids: set[str] = {n["id"] for n in graph.get("nodes", [])}
    hub_ids: set[str] = {h["id"] for h in graph.get("hubs", [])}
    all_ids: set[str] = node_ids | hub_ids

    # 1. Every node has at least one hubMembership
    for node in graph.get("nodes", []):
        memberships = node.get("hubMemberships", [])
        if not memberships:
            errors.append(
                f"Node {node['id']} has no hubMemberships"
            )

    # 2. Every hub's nodeIds and sharedNodeIds reference actual nodes
    for hub in graph.get("hubs", []):
        for nid in hub.get("nodeIds", []):
            if nid not in node_ids:
                errors.append(
                    f"Hub {hub['id']} references non-existent node {nid} in nodeIds"
                )
        for nid in hub.get("sharedNodeIds", []):
            if nid not in node_ids:
                errors.append(
                    f"Hub {hub['id']} references non-existent node {nid} in sharedNodeIds"
                )

    # 3. Shared nodes (in sharedNodeIds) should appear in multiple hubs
    shared_node_hub_count: dict[str, int] = {}
    for hub in graph.get("hubs", []):
        for nid in hub.get("sharedNodeIds", []):
            shared_node_hub_count[nid] = shared_node_hub_count.get(nid, 0) + 1

    for nid, count in shared_node_hub_count.items():
        if count < 2:
            node = next((n for n in graph.get("nodes", []) if n["id"] == nid), None)
            if node:
                memberships = node.get("hubMemberships", [])
                if len(memberships) < 2:
                    errors.append(
                        f"Shared node {nid} only appears in {count} hub(s) "
                        f"sharedNodeIds and has {len(memberships)} hubMembership(s)"
                    )

    # 4. No circular 'contains' edges
    contains_edges = [
        e for e in graph.get("edges", []) if e.get("type") == "contains"
    ]
    if _has_cycle(contains_edges):
        errors.append("Circular 'contains' edges detected")

    # 5. All edge source/target IDs reference existing nodes or hubs
    for edge in graph.get("edges", []):
        if edge["source"] not in all_ids:
            errors.append(
                f"Edge {edge['id']} source {edge['source']} does not exist"
            )
        if edge["target"] not in all_ids:
            errors.append(
                f"Edge {edge['id']} target {edge['target']} does not exist"
            )

    # 6. Captions don't cross-reference other nodes (Invariant 2)
    for node in graph.get("nodes", []):
        caption = node.get("caption", "")
        for pattern in _CROSS_REFERENCE_PATTERNS:
            if pattern.search(caption):
                errors.append(
                    f"Node {node['id']} caption contains cross-reference "
                    f"pattern (violates Invariant 2): '{caption[:120]}...'"
                )
                break  # One error per node is enough

    return errors


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _build_hub_from_plan(hub_plan: dict) -> dict:
    """Create a Hub dict from a HubPlan."""
    return {
        "id": hub_plan["id"],
        "name": hub_plan.get("name", ""),
        "route": hub_plan.get("route", "/"),
        "layoutTemplate": hub_plan.get("layoutTemplate", "single-column"),
        "nodeIds": [],
        "sharedNodeIds": [],
        "authRequired": hub_plan.get("authRequired", False),
        "transitions": _build_transitions(hub_plan),
        "metadata": {
            "description": hub_plan.get("description", ""),
        },
    }


def _build_transitions(hub_plan: dict) -> list[dict]:
    """Extract HubTransition dicts from a HubPlan's elements' navigate interactions."""
    transitions: list[dict] = []
    seen_targets: set[str] = set()

    for element in hub_plan.get("elements", []):
        for interaction in element.get("interactions", []):
            if interaction.get("action") == "navigate":
                target = interaction.get("targetHubId")
                if target and target not in seen_targets:
                    seen_targets.add(target)
                    transitions.append({
                        "targetHubId": target,
                        "trigger": "navigation",
                        "animation": "fade",
                    })

    return transitions


def _build_visual_spec(element: dict) -> dict:
    """Build a NodeVisualSpec dict from an ElementPlan.

    If the plan already provides a full visual spec (e.g. from competitive
    analysis extraction), we use it directly.  Otherwise we construct a
    minimal spec from the element's type and caption.
    """
    if "visualSpec" in element:
        return element["visualSpec"]

    return {
        "description": element.get("caption", ""),
        "colors": {"primary": "#000000"},
        "typography": {},
        "spacing": {},
        "borders": {},
        "effects": {},
        "animation": None,
        "textContent": element.get("textContent", []),
    }


def _build_behavior_spec(element: dict) -> dict:
    """Build a NodeBehaviorSpec dict from an ElementPlan."""
    if "behaviorSpec" in element:
        return element["behaviorSpec"]

    return {
        "interactions": element.get("interactions", []),
        "dataBindings": element.get("dataBindings", []),
        "stateManagement": element.get("stateManagement", None),
        "apiCalls": element.get("apiCalls", []),
        "accessibilityRole": _infer_accessibility_role(element.get("type", "custom")),
        "tabIndex": 0,
    }


def _infer_accessibility_role(element_type: str) -> str:
    """Map UIElementType to a reasonable default ARIA role."""
    role_map = {
        "button": "button",
        "input": "textbox",
        "textarea": "textbox",
        "select": "listbox",
        "checkbox": "checkbox",
        "radio": "radio",
        "toggle": "switch",
        "slider": "slider",
        "navbar": "navigation",
        "sidebar": "complementary",
        "footer": "contentinfo",
        "hero-section": "banner",
        "modal": "dialog",
        "drawer": "dialog",
        "popover": "dialog",
        "tooltip": "tooltip",
        "alert": "alert",
        "notification": "alert",
        "toast": "status",
        "progress": "progressbar",
        "spinner": "status",
        "tabs": "tablist",
        "table": "table",
        "list": "list",
        "grid": "grid",
        "image": "img",
        "search-bar": "search",
        "breadcrumb": "navigation",
        "pagination": "navigation",
        "form": "form",
    }
    return role_map.get(element_type, "region")


def _resolve_position(
    element: dict,
    segment_match: Optional[dict],
) -> dict:
    """Determine node position -- prefer segment bbox, fall back to plan position."""
    if segment_match and segment_match.get("segmentIndex") is not None:
        bbox = segment_match.get("bbox", [0, 0, 0, 0])
        x1, y1, x2, y2 = bbox
        return {
            "x": x1,
            "y": y1,
            "z": 0,
            "width": max(x2 - x1, 1),
            "height": max(y2 - y1, 1),
        }

    pos = element.get("position", {})
    return {
        "x": pos.get("x", 0),
        "y": pos.get("y", 0),
        "z": 0,
        "width": pos.get("width", 100),
        "height": pos.get("height", 100),
    }


def _element_to_bbox(element: dict) -> list[float]:
    """Convert an element's position dict to [x1, y1, x2, y2] bbox."""
    pos = element.get("position", {})
    x = pos.get("x", 0)
    y = pos.get("y", 0)
    w = pos.get("width", 100)
    h = pos.get("height", 100)
    return [x, y, x + w, y + h]


def _compute_iou(bbox_a: list, bbox_b: list) -> float:
    """Compute Intersection over Union between two [x1, y1, x2, y2] bboxes."""
    x1 = max(bbox_a[0], bbox_b[0])
    y1 = max(bbox_a[1], bbox_b[1])
    x2 = min(bbox_a[2], bbox_b[2])
    y2 = min(bbox_a[3], bbox_b[3])

    intersection = max(0, x2 - x1) * max(0, y2 - y1)
    if intersection == 0:
        return 0.0

    area_a = max(0, bbox_a[2] - bbox_a[0]) * max(0, bbox_a[3] - bbox_a[1])
    area_b = max(0, bbox_b[2] - bbox_b[0]) * max(0, bbox_b[3] - bbox_b[1])

    union = area_a + area_b - intersection
    if union <= 0:
        return 0.0

    return intersection / union


def _synthetic_match(element: dict) -> dict:
    """Create a synthetic match entry for an element with no matching segment."""
    bbox = _element_to_bbox(element)
    return {
        "elementId": element["id"],
        "segmentIndex": None,
        "matchScore": 0.0,
        "bbox": bbox,
    }


def _find_element_by_id(elements: list[dict], element_id: str) -> Optional[dict]:
    """Find an element in a list by its ID."""
    for el in elements:
        if el.get("id") == element_id:
            return el
    return None


def _build_plan_element_lookup(
    plan: dict,
    nodes: list[dict],
) -> dict[str, str]:
    """Build a mapping from plan ElementPlan.id to GraphNode.id.

    Since nodes get new UUIDs during construction, we correlate using the
    caption as the primary key (captions are unique per plan by Invariant 2).
    """
    lookup: dict[str, str] = {}

    plan_elements: list[dict] = []
    for hub in plan.get("graph", {}).get("hubs", []):
        for el in hub.get("elements", []):
            plan_elements.append(el)
    for scp in plan.get("graph", {}).get("sharedComponents", []):
        plan_elements.append(scp)

    # Index nodes by caption for fast lookup
    caption_to_node_id: dict[str, str] = {}
    for node in nodes:
        caption = node.get("caption", "")
        if caption:
            caption_to_node_id[caption] = node["id"]

    for el in plan_elements:
        el_id = el.get("id", "")
        caption = el.get("caption", "")
        if caption and caption in caption_to_node_id:
            lookup[el_id] = caption_to_node_id[caption]

    return lookup


def _find_node_by_state_key(
    nodes: list[dict],
    state_key: str,
) -> Optional[dict]:
    """Find a node that owns a given state key."""
    if not state_key:
        return None
    for node in nodes:
        state_mgmt = node.get("behaviorSpec", {}).get("stateManagement")
        if state_mgmt and state_mgmt.get("key") == state_key:
            return node
    return None


def _has_cycle(edges: list[dict]) -> bool:
    """Detect cycles in a directed edge list using iterative DFS."""
    adjacency: dict[str, list[str]] = {}
    for edge in edges:
        src = edge["source"]
        tgt = edge["target"]
        adjacency.setdefault(src, []).append(tgt)

    all_nodes = set(adjacency.keys())
    for edge in edges:
        all_nodes.add(edge["target"])

    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {n: WHITE for n in all_nodes}

    for start in all_nodes:
        if color[start] != WHITE:
            continue
        stack = [(start, 0)]
        while stack:
            node, idx = stack.pop()
            neighbors = adjacency.get(node, [])
            if idx == 0:
                if color[node] == GRAY:
                    return True
                if color[node] == BLACK:
                    continue
                color[node] = GRAY
            # Process remaining neighbors
            found_unvisited = False
            for i in range(idx, len(neighbors)):
                neighbor = neighbors[i]
                if color[neighbor] == GRAY:
                    return True
                if color[neighbor] == WHITE:
                    # Push current node back with next index, then push neighbor
                    stack.append((node, i + 1))
                    stack.append((neighbor, 0))
                    found_unvisited = True
                    break
            if not found_unvisited:
                color[node] = BLACK

    return False


def _make_edge(
    source: str,
    target: str,
    edge_type: str,
    metadata: Optional[dict] = None,
) -> dict:
    """Create a GraphEdge dict."""
    return {
        "id": str(uuid.uuid4()),
        "source": source,
        "target": target,
        "type": edge_type,
        "metadata": metadata or {},
    }
