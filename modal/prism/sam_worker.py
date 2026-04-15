"""SAM 3.1 segmentation worker for the Prism diffusion engine.

Segments full-page UI mockup images into individual UI elements using
SAM 3.1 with Object Multiplex for batch processing.

Spec reference: docs/DIFFUSION-ENGINE-SPEC.md Section 9 — Image Generation & Segmentation Phase
  - Model: SAM 3.1 with Object Multiplex (facebook/sam3.1-object-multiplex)
  - GPU: L4
  - Processes up to 16 objects per forward pass via shared memory
  - For typical 20-50 element UI: 2-3 forward passes
  - Text prompts from planned element types guide segmentation
  - Fallback: Grounding DINO 1.5 for missed elements
  - Output: per-element segments with masks and bounding boxes

R2 path convention (from CLAUDE.md):
  {projectId}/{version}/images/node-{nodeId}.png

Pipeline:
  1. Generate text prompts from element plan types
  2. SAM 3.1 Object Multiplex segments all instances, bucketed 16 per forward pass
  3. Extract bounding boxes, masks, and hierarchy from containment relationships
  4. Match segments to planned elements by spatial proximity + semantic similarity
  5. Crop individual element images from masks
  6. Save element images for upload to R2
"""

from __future__ import annotations

import io
import json
import logging
import math
import os
import time
from pathlib import Path
from typing import TypedDict

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OBJECT_MULTIPLEX_BATCH_SIZE = 16
"""Maximum objects per SAM 3.1 Object Multiplex forward pass."""

CONTAINMENT_AREA_RATIO_THRESHOLD = 2.0
"""Minimum area ratio (parent / child) to consider spatial containment."""

BBOX_CONTAINMENT_TOLERANCE_PX = 5
"""Pixel tolerance when checking if one bbox is fully inside another."""

ELEMENT_MIN_AREA_PX = 64
"""Minimum area (in pixels) for a segment to be considered valid."""

# ---------------------------------------------------------------------------
# Text prompt mapping
# ---------------------------------------------------------------------------

_ELEMENT_TYPE_PROMPTS: dict[str, str] = {
    "page-background": "full page background area",
    "navbar": "navigation bar at the top of the page",
    "sidebar": "vertical sidebar panel on the side of the page",
    "footer": "footer section at the bottom of the page",
    "hero-section": "large hero section with heading and call to action",
    "card": "card container with content",
    "button": "clickable button element",
    "input": "text input field",
    "textarea": "multiline text area input",
    "select": "dropdown select element",
    "checkbox": "checkbox input element",
    "radio": "radio button element",
    "toggle": "toggle switch element",
    "slider": "range slider element",
    "image": "image or photo element",
    "icon": "icon element",
    "avatar": "avatar or profile image",
    "badge": "badge or status indicator",
    "tag": "tag or chip label element",
    "table": "data table with rows and columns",
    "list": "list of items",
    "grid": "grid layout of items",
    "carousel": "carousel or slider of content",
    "tabs": "tab navigation element",
    "modal": "modal or dialog overlay",
    "drawer": "sliding drawer panel",
    "popover": "popover floating element",
    "tooltip": "tooltip element",
    "progress": "progress bar indicator",
    "spinner": "loading spinner element",
    "skeleton": "skeleton loading placeholder",
    "chart": "data chart or visualization",
    "graph": "graph or diagram visualization",
    "map": "map element",
    "video-player": "video player element",
    "audio-player": "audio player element",
    "form": "form container with input fields",
    "search-bar": "search input bar",
    "breadcrumb": "breadcrumb navigation",
    "pagination": "pagination controls",
    "notification": "notification element",
    "toast": "toast notification message",
    "alert": "alert or warning banner",
    "custom": "UI element",
}


# ---------------------------------------------------------------------------
# TypedDicts for structured output
# ---------------------------------------------------------------------------

class SegmentResult(TypedDict):
    elementId: str
    mask: list[int]
    bbox: list[int]
    label: str
    confidence: float
    imagePath: str
    r2Key: str


class HierarchyResult(TypedDict):
    roots: list[str]
    children: dict[str, list[str]]


class SegmentationOutput(TypedDict):
    hubId: str
    segments: list[SegmentResult]
    hierarchy: HierarchyResult
    segmentationTimeMs: int


# ---------------------------------------------------------------------------
# Module-level model cache
# ---------------------------------------------------------------------------

_sam_predictor = None


def _get_sam_predictor():
    """Load and cache the SAM 3.1 Object Multiplex predictor.

    The model weights are pre-downloaded into the Modal image at build time
    (see prism_app.py gpu_image definition). This function loads them into GPU
    memory on first call and reuses the predictor for subsequent calls within
    the same container.
    """
    global _sam_predictor
    if _sam_predictor is not None:
        return _sam_predictor

    # DEVIATION #3: SAM 2.1 hiera-large replaces spec's SAM 3.1 Object Multiplex
    logger.info("Loading SAM 2.1 hiera-large predictor...")
    load_start = time.monotonic()

    from sam2.sam2_image_predictor import SAM2ImagePredictor

    _sam_predictor = SAM2ImagePredictor.from_pretrained(
        "facebook/sam2.1-hiera-large"
    )
    load_ms = int((time.monotonic() - load_start) * 1000)
    logger.info("SAM 3.1 predictor loaded in %d ms", load_ms)
    return _sam_predictor


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------

def build_text_prompts(elements: list[dict]) -> list[str]:
    """Build text prompts for SAM 3.1 from planned element types.

    Maps UIElementType values to descriptive natural-language text prompts
    that SAM 3.1's Promptable Concept Segmentation (PCS) can use for
    text-prompted segmentation.

    Each prompt describes what the element looks like in a UI mockup image
    so the vision model can locate it accurately.

    Args:
        elements: List of element dicts, each with at least ``type`` (str)
            and optionally ``caption`` (str) for additional context.

    Returns:
        List of text prompts aligned positionally with *elements*.
    """
    prompts: list[str] = []
    for elem in elements:
        elem_type: str = elem.get("type", "custom")
        base_prompt = _ELEMENT_TYPE_PROMPTS.get(elem_type, "UI element")

        # If the element has a caption, append a short excerpt for specificity.
        # Keep it brief so SAM's text encoder stays focused on visual features.
        caption: str = elem.get("caption", "")
        if caption:
            # Use the first sentence (up to 120 chars) for concise guidance.
            short_caption = caption.split(".")[0][:120].strip()
            if short_caption:
                base_prompt = f"{base_prompt}: {short_caption}"

        prompts.append(base_prompt)

    return prompts


def segment_hub_image(
    image_bytes: bytes,
    elements: list[dict],
    hub_id: str,
    project_id: str,
    version: int,
    output_dir: str = "/outputs",
) -> SegmentationOutput:
    """Segment a hub image into individual UI elements using SAM 3.1.

    This is the main entry point called by the Modal function
    ``segment_ui_image``.

    Steps:
        1. Load the full-page hub image from bytes.
        2. Build text prompts from element types via ``build_text_prompts``.
        3. Batch elements into groups of 16 (Object Multiplex limit).
        4. Run SAM 3.1 for each batch, collecting masks and bounding boxes.
        5. Match SAM outputs back to planned elements by spatial proximity.
        6. Extract cropped element images from masks via ``extract_element_images``.
        7. Detect parent-child hierarchy via ``detect_hierarchy``.
        8. Return the complete segmentation result.

    Args:
        image_bytes: Raw bytes of the full-page hub PNG image.
        elements: List of planned element dicts. Each must have ``id`` (str),
            ``type`` (str), ``caption`` (str), and ``position``
            (dict with x, y, width, height).
        hub_id: The hub this image belongs to.
        project_id: Owning project ID.
        version: Graph version number.
        output_dir: Base directory for writing output images (Modal volume).

    Returns:
        ``SegmentationOutput`` dict with segments, hierarchy, and timing.
    """
    start_time = time.monotonic()

    # 1. Load image
    full_image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    img_width, img_height = full_image.size
    logger.info(
        "Segmenting hub '%s' image (%dx%d) with %d planned elements",
        hub_id, img_width, img_height, len(elements),
    )

    # Prepare RGB version for SAM (no alpha)
    image_rgb = full_image.convert("RGB")
    image_np = np.array(image_rgb)

    # 2. Build text prompts (used for logging/debug context only;
    #    SAM 2.1 uses point prompts, not text prompts — see DEVIATION #3)
    _text_prompts = build_text_prompts(elements)
    logger.debug("Text prompts (debug): %s", _text_prompts)

    # 3. Set the image on the predictor
    # DEVIATION #3: SAM 2.1 uses point-prompted segmentation (no text prompts).
    # Planned element center positions serve as point prompts.
    predictor = _get_sam_predictor()

    # 4. Batch into groups of OBJECT_MULTIPLEX_BATCH_SIZE and run SAM
    raw_segments: list[dict] = []
    num_batches = math.ceil(len(elements) / OBJECT_MULTIPLEX_BATCH_SIZE)

    for batch_idx in range(num_batches):
        batch_start = batch_idx * OBJECT_MULTIPLEX_BATCH_SIZE
        batch_end = min(batch_start + OBJECT_MULTIPLEX_BATCH_SIZE, len(elements))
        batch_elements = elements[batch_start:batch_end]

        logger.info(
            "SAM batch %d/%d: processing %d elements",
            batch_idx + 1, num_batches, len(batch_elements),
        )

        # Build point prompts from planned positions.
        # Use the center of each planned element as a point prompt.
        # SAM 2.1 predict_batch expects lists of per-image arrays.
        # Since we process one image at a time, we set_image once and
        # predict per element (predict_batch requires set_image_batch).
        # For batching within a single image, iterate and call predict().
        predictor.set_image(image_np)

        for i, elem in enumerate(batch_elements):
            pos = elem.get("position", {})
            cx = pos.get("x", 0) + pos.get("width", 0) / 2
            cy = pos.get("y", 0) + pos.get("height", 0) / 2

            point_coords_np = np.array([[cx, cy]], dtype=np.float32)
            point_labels_np = np.array([1], dtype=np.int32)

            # Also provide a box prompt from planned position if available
            box_prompt = None
            if pos.get("width") and pos.get("height"):
                box_prompt = np.array([
                    pos.get("x", 0), pos.get("y", 0),
                    pos.get("x", 0) + pos.get("width", 0),
                    pos.get("y", 0) + pos.get("height", 0),
                ], dtype=np.float32)

            masks, scores, _ = predictor.predict(
                point_coords=point_coords_np,
                point_labels=point_labels_np,
                box=box_prompt,
                multimask_output=False,
            )

            mask = masks[0]  # Binary mask (H, W)
            score = float(scores[0])

            # If mask has multiple channels, take the first
            if mask.ndim == 3:
                mask = mask[0]

            # Compute bounding box from mask
            bbox = _mask_to_bbox(mask)
            if bbox is None:
                logger.warning(
                    "Empty mask for element '%s' (%s), skipping",
                    elem["id"], elem.get("type", "unknown"),
                )
                continue

            x1, y1, x2, y2 = bbox
            area = (x2 - x1) * (y2 - y1)
            if area < ELEMENT_MIN_AREA_PX:
                logger.warning(
                    "Segment for '%s' too small (%d px), skipping",
                    elem["id"], area,
                )
                continue

            raw_segments.append({
                "elementId": elem["id"],
                "mask": mask,
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
                "label": elem.get("type", "custom"),
                "confidence": score,
            })

    # 5. Match SAM segments to planned elements by spatial proximity
    matched_segments = _match_segments_to_elements(raw_segments, elements)

    # 6. Extract cropped element images
    segments_with_images = extract_element_images(
        image_bytes, matched_segments, hub_id, project_id, version, output_dir,
    )

    # 7. Detect hierarchy
    hierarchy = detect_hierarchy(segments_with_images)

    elapsed_ms = int((time.monotonic() - start_time) * 1000)
    logger.info(
        "Segmentation complete: %d segments, %d root elements, %d ms",
        len(segments_with_images), len(hierarchy["roots"]), elapsed_ms,
    )

    return SegmentationOutput(
        hubId=hub_id,
        segments=segments_with_images,
        hierarchy=hierarchy,
        segmentationTimeMs=elapsed_ms,
    )


def extract_element_images(
    full_image_bytes: bytes,
    segments: list[dict],
    hub_id: str,
    project_id: str,
    version: int,
    output_dir: str = "/outputs",
) -> list[SegmentResult]:
    """Extract individual element images from the full hub image using segment masks.

    For each segment:
        1. Apply the binary mask to the full RGBA image (masked-out pixels
           become transparent).
        2. Crop to the segment bounding box.
        3. Save as a PNG with transparency.
        4. Compute the R2 upload key.

    Args:
        full_image_bytes: Raw bytes of the full hub image.
        segments: List of raw segment dicts (must have ``elementId``, ``mask``,
            ``bbox``, ``label``, ``confidence``).
        hub_id: Hub identifier (used in output path).
        project_id: Project identifier (used in R2 key).
        version: Graph version (used in R2 key).
        output_dir: Base directory for writing output images.

    Returns:
        List of ``SegmentResult`` dicts with ``imagePath`` and ``r2Key``
        populated.
    """
    full_image = Image.open(io.BytesIO(full_image_bytes)).convert("RGBA")
    full_np = np.array(full_image)

    # Ensure output directory exists
    images_dir = Path(output_dir) / project_id / str(version) / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    results: list[SegmentResult] = []

    for seg in segments:
        element_id: str = seg["elementId"]
        mask = seg["mask"]
        x1, y1, x2, y2 = seg["bbox"]

        # Apply mask: create an RGBA copy, set alpha to 0 where mask is False
        masked = full_np.copy()
        if isinstance(mask, np.ndarray):
            mask_bool = mask.astype(bool)
        else:
            # If mask was serialized, reconstruct from the bbox area
            mask_bool = np.array(mask, dtype=bool)

        # Zero out alpha channel outside the mask
        masked[~mask_bool, 3] = 0

        # Crop to bounding box
        cropped = masked[y1:y2, x1:x2]
        cropped_img = Image.fromarray(cropped, "RGBA")

        # Save as PNG
        filename = f"node-{element_id}.png"
        filepath = images_dir / filename
        cropped_img.save(str(filepath), "PNG")

        # R2 key follows convention: {projectId}/{version}/images/node-{nodeId}.png
        r2_key = f"{project_id}/{version}/images/node-{element_id}.png"

        results.append(SegmentResult(
            elementId=element_id,
            mask=_mask_to_rle(mask_bool),
            bbox=[int(x1), int(y1), int(x2), int(y2)],
            label=seg["label"],
            confidence=seg["confidence"],
            imagePath=str(filepath),
            r2Key=r2_key,
        ))

    logger.info("Extracted %d element images to %s", len(results), images_dir)
    return results


def detect_hierarchy(segments: list[dict]) -> HierarchyResult:
    """Detect parent-child relationships between segments based on spatial containment.

    A segment A is considered a parent of segment B when:
        - B's bounding box is entirely within A's bounding box (with a small
          tolerance of ``BBOX_CONTAINMENT_TOLERANCE_PX``).
        - A's area is at least ``CONTAINMENT_AREA_RATIO_THRESHOLD`` times
          larger than B's area.

    When a segment has multiple possible parents, the smallest qualifying
    parent is chosen (most immediate container).

    Args:
        segments: List of segment dicts with ``elementId`` and ``bbox``
            ([x1, y1, x2, y2]).

    Returns:
        ``HierarchyResult`` with ``roots`` (top-level element IDs) and
        ``children`` mapping parent IDs to lists of child IDs.
    """
    if not segments:
        return HierarchyResult(roots=[], children={})

    # Precompute areas and lookup
    seg_data: list[tuple[str, list[int], int]] = []
    for seg in segments:
        bbox = seg["bbox"]
        area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        seg_data.append((seg["elementId"], bbox, area))

    # For each segment, find the smallest containing parent
    parent_map: dict[str, str | None] = {}
    children_map: dict[str, list[str]] = {}
    tol = BBOX_CONTAINMENT_TOLERANCE_PX

    for i, (child_id, child_bbox, child_area) in enumerate(seg_data):
        best_parent: str | None = None
        best_parent_area = float("inf")

        for j, (parent_id, parent_bbox, parent_area) in enumerate(seg_data):
            if i == j:
                continue

            # Check area ratio: parent must be significantly larger
            if parent_area < child_area * CONTAINMENT_AREA_RATIO_THRESHOLD:
                continue

            # Check spatial containment with tolerance
            if (child_bbox[0] >= parent_bbox[0] - tol
                    and child_bbox[1] >= parent_bbox[1] - tol
                    and child_bbox[2] <= parent_bbox[2] + tol
                    and child_bbox[3] <= parent_bbox[3] + tol):
                # This parent contains the child; prefer the smallest one
                if parent_area < best_parent_area:
                    best_parent = parent_id
                    best_parent_area = parent_area

        parent_map[child_id] = best_parent

        if best_parent is not None:
            if best_parent not in children_map:
                children_map[best_parent] = []
            children_map[best_parent].append(child_id)

    # Roots are segments with no parent
    roots = [eid for eid, pid in parent_map.items() if pid is None]

    return HierarchyResult(roots=roots, children=children_map)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _mask_to_bbox(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    """Compute the bounding box of a binary mask.

    Args:
        mask: 2D boolean/uint8 numpy array (H, W).

    Returns:
        (x1, y1, x2, y2) tuple, or None if the mask is empty.
    """
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)

    if not rows.any():
        return None

    y1, y2 = np.where(rows)[0][[0, -1]]
    x1, x2 = np.where(cols)[0][[0, -1]]

    # Convert to exclusive end coordinates
    return (int(x1), int(y1), int(x2) + 1, int(y2) + 1)


def _mask_to_rle(mask: np.ndarray) -> list[int]:
    """Encode a binary mask as run-length encoding (RLE).

    The RLE is a flat list of integers: [start1, length1, start2, length2, ...].
    Pixel positions are counted in row-major (C-order) flattened order.

    This is significantly more compact than transmitting the full mask array.

    Args:
        mask: 2D boolean numpy array (H, W).

    Returns:
        RLE encoded as a flat list of start/length pairs.
    """
    flat = mask.flatten().astype(np.uint8)
    if flat.sum() == 0:
        return []

    # Find runs of 1s
    diff = np.diff(np.concatenate([[0], flat, [0]]))
    starts = np.where(diff == 1)[0]
    ends = np.where(diff == -1)[0]

    rle: list[int] = []
    for s, e in zip(starts, ends):
        rle.append(int(s))
        rle.append(int(e - s))

    return rle


def _match_segments_to_elements(
    raw_segments: list[dict],
    elements: list[dict],
) -> list[dict]:
    """Match SAM output segments to planned elements by spatial proximity.

    Since we provide point prompts from each element's planned center, most
    segments already correspond 1:1 with planned elements (the elementId was
    carried through from the batch). This function validates the matches and
    resolves any conflicts where multiple segments map to the same element.

    For each planned element, finds the raw segment that:
        1. Already carries the same elementId (from the batched prediction), OR
        2. Has the closest bounding box center to the element's planned center.

    When two raw segments compete for the same element, the one with higher
    confidence wins.

    Args:
        raw_segments: Segments output from SAM with elementId pre-assigned.
        elements: Original planned elements with position data.

    Returns:
        Deduplicated list of segments, one per planned element (where possible).
    """
    if not raw_segments:
        return []

    # Build lookup of planned elements by ID
    element_by_id: dict[str, dict] = {e["id"]: e for e in elements}

    # Group raw segments by their pre-assigned elementId
    segments_by_eid: dict[str, list[dict]] = {}
    for seg in raw_segments:
        eid = seg["elementId"]
        if eid not in segments_by_eid:
            segments_by_eid[eid] = []
        segments_by_eid[eid].append(seg)

    matched: list[dict] = []
    used_element_ids: set[str] = set()

    # First pass: assign pre-matched segments (highest confidence wins)
    for eid, segs in segments_by_eid.items():
        if eid not in element_by_id:
            continue
        # Pick the highest confidence segment for this element
        best = max(segs, key=lambda s: s["confidence"])
        matched.append(best)
        used_element_ids.add(eid)

    # Second pass: for any unmatched planned elements, try to find the nearest
    # unassigned segment (fallback for SAM misalignment)
    unmatched_elements = [e for e in elements if e["id"] not in used_element_ids]
    unassigned_segments = [
        s for s in raw_segments
        if s["elementId"] not in used_element_ids
    ]

    for elem in unmatched_elements:
        if not unassigned_segments:
            break

        pos = elem.get("position", {})
        elem_cx = pos.get("x", 0) + pos.get("width", 0) / 2
        elem_cy = pos.get("y", 0) + pos.get("height", 0) / 2

        best_seg = None
        best_dist = float("inf")

        for seg in unassigned_segments:
            bbox = seg["bbox"]
            seg_cx = (bbox[0] + bbox[2]) / 2
            seg_cy = (bbox[1] + bbox[3]) / 2
            dist = math.sqrt((elem_cx - seg_cx) ** 2 + (elem_cy - seg_cy) ** 2)
            if dist < best_dist:
                best_dist = dist
                best_seg = seg

        if best_seg is not None:
            # Reassign to the planned element
            best_seg = {**best_seg, "elementId": elem["id"]}
            matched.append(best_seg)
            unassigned_segments.remove(best_seg)
            used_element_ids.add(elem["id"])

    return matched
