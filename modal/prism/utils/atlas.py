"""Texture atlas packing utility for the Prism diffusion engine.

Implements MaxRects bin packing (Best Short Side Fit heuristic) for creating
texture atlases from segmented UI element images.

Spec reference: docs/DIFFUSION-ENGINE-SPEC.md Section 10 — Texture Atlas Packing
  - Atlas size: 2048x2048
  - Padding: 2px between sprites (prevents texture bleeding)
  - MaxRects bin packing algorithm
  - Target: 1-3 atlases for typical app (20-50 elements)
  - Each atlas = ~16MB GPU memory (RGBA8)
  - Record atlas regions per node in graph metadata

AtlasRegion shape (from shared-interfaces/src/prism-graph.ts):
  atlasIndex: int
  x: int
  y: int
  width: int
  height: int
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from typing import TypedDict

from PIL import Image

logger = logging.getLogger(__name__)

ATLAS_SIZE = 2048
ATLAS_PADDING = 2


class RectInput(TypedDict):
    id: str
    width: int
    height: int


class AtlasRegionDict(TypedDict):
    atlasIndex: int
    x: int
    y: int
    width: int
    height: int


class PackedRect(TypedDict):
    id: str
    atlasIndex: int
    x: int
    y: int
    width: int
    height: int


class NodeImageInput(TypedDict):
    nodeId: str
    imageBytes: bytes
    width: int
    height: int


class AtlasOutput(TypedDict):
    index: int
    imageBytes: bytes
    width: int
    height: int


class PackResult(TypedDict):
    atlases: list[AtlasOutput]
    regions: dict[str, AtlasRegionDict]
    count: int


@dataclass
class Rect:
    """A free rectangle in the atlas available for placement."""

    x: int
    y: int
    width: int
    height: int


@dataclass
class _AtlasPage:
    """Internal state for a single atlas page during packing."""

    index: int
    free_rects: list[Rect] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.free_rects:
            # No free rects were provided, which means this is a fresh page.
            # We do NOT initialize here; the packer sets up the initial free rect
            # so it can apply padding-aware sizing.
            pass


class MaxRectsAtlasPacker:
    """MaxRects bin packing for texture atlas generation.

    Uses the Best Short Side Fit (BSSF) heuristic for placing rectangles.
    Creates multiple atlas pages if needed.

    The BSSF heuristic works by: for each candidate free rectangle that can
    contain the item, computing the shorter leftover side after placement.
    The placement with the smallest such value is chosen, since it means the
    rectangle fits most tightly along its shorter dimension.
    """

    def __init__(self, atlas_size: int = ATLAS_SIZE, padding: int = ATLAS_PADDING) -> None:
        self.atlas_size = atlas_size
        self.padding = padding
        # Usable area accounts for padding on edges
        self.usable_size = atlas_size - padding
        self._pages: list[_AtlasPage] = []

    def _create_page(self) -> _AtlasPage:
        """Create a new atlas page with a single free rectangle covering the full usable area."""
        page = _AtlasPage(index=len(self._pages))
        page.free_rects = [Rect(
            x=self.padding,
            y=self.padding,
            width=self.usable_size - self.padding,
            height=self.usable_size - self.padding,
        )]
        self._pages.append(page)
        return page

    def pack(self, rectangles: list[RectInput]) -> list[PackedRect]:
        """Pack a list of rectangles into atlas pages.

        Input: [{ "id": str, "width": int, "height": int }]
        Output: [{ "id": str, "atlasIndex": int, "x": int, "y": int, "width": int, "height": int }]

        Sorts rectangles by area (largest first) for better packing efficiency.
        Creates new atlas pages as needed when a rectangle cannot fit in any
        existing page.
        """
        self._pages = []
        results: list[PackedRect] = []
        errors: list[str] = []

        # Filter and validate
        valid_rects: list[RectInput] = []
        for rect in rectangles:
            padded_w = rect["width"] + self.padding
            padded_h = rect["height"] + self.padding
            max_allowed = self.usable_size - self.padding

            if rect["width"] <= 0 or rect["height"] <= 0:
                errors.append(
                    f"Skipping rect '{rect['id']}': zero or negative dimensions "
                    f"({rect['width']}x{rect['height']})"
                )
                continue

            if padded_w > max_allowed or padded_h > max_allowed:
                errors.append(
                    f"Skipping rect '{rect['id']}': dimensions {rect['width']}x{rect['height']} "
                    f"exceed maximum atlas area ({max_allowed - self.padding}x{max_allowed - self.padding} "
                    f"with {self.padding}px padding)"
                )
                continue

            valid_rects.append(rect)

        for msg in errors:
            logger.warning(msg)

        # Sort by area descending for better packing
        sorted_rects = sorted(valid_rects, key=lambda r: r["width"] * r["height"], reverse=True)

        for rect in sorted_rects:
            padded_w = rect["width"] + self.padding
            padded_h = rect["height"] + self.padding
            placed = False

            # Try to place in an existing page
            for page in self._pages:
                placement = self._find_best_placement(page, padded_w, padded_h)
                if placement is not None:
                    fx, fy = placement
                    self._place_rect(page, fx, fy, padded_w, padded_h)
                    results.append(PackedRect(
                        id=rect["id"],
                        atlasIndex=page.index,
                        x=fx,
                        y=fy,
                        width=rect["width"],
                        height=rect["height"],
                    ))
                    placed = True
                    break

            # Create a new page if no existing page can fit it
            if not placed:
                page = self._create_page()
                placement = self._find_best_placement(page, padded_w, padded_h)
                if placement is not None:
                    fx, fy = placement
                    self._place_rect(page, fx, fy, padded_w, padded_h)
                    results.append(PackedRect(
                        id=rect["id"],
                        atlasIndex=page.index,
                        x=fx,
                        y=fy,
                        width=rect["width"],
                        height=rect["height"],
                    ))
                else:
                    # This should not happen since we already filtered oversized rects,
                    # but guard against it anyway.
                    logger.error(
                        f"Failed to place rect '{rect['id']}' ({rect['width']}x{rect['height']}) "
                        f"in a fresh atlas page — this indicates a bug in the packer."
                    )

        return results

    def _find_best_placement(
        self, page: _AtlasPage, width: int, height: int
    ) -> tuple[int, int] | None:
        """Find the best position for a rectangle using BSSF heuristic.

        BSSF (Best Short Side Fit): For each free rectangle that can contain the
        item, compute min(remaining_width, remaining_height). Pick the free rect
        with the lowest such score (tightest fit along the shorter leftover
        dimension).

        Returns (x, y) of the best placement, or None if it cannot fit.
        """
        best_score = float("inf")
        best_pos: tuple[int, int] | None = None

        for free_rect in page.free_rects:
            # Try placing without rotation
            if width <= free_rect.width and height <= free_rect.height:
                leftover_w = free_rect.width - width
                leftover_h = free_rect.height - height
                short_side = min(leftover_w, leftover_h)
                if short_side < best_score:
                    best_score = short_side
                    best_pos = (free_rect.x, free_rect.y)

        return best_pos

    def _place_rect(
        self, page: _AtlasPage, x: int, y: int, width: int, height: int
    ) -> None:
        """Place a rectangle and update the free rectangle list.

        After placing a rectangle, each existing free rectangle that overlaps
        the placed rectangle is split into up to 4 non-overlapping sub-rectangles
        (the portions that remain free). Then redundant free rectangles (those
        fully contained within another) are pruned.
        """
        placed = Rect(x=x, y=y, width=width, height=height)
        new_free: list[Rect] = []

        for free_rect in page.free_rects:
            if not self._intersects(placed, free_rect):
                new_free.append(free_rect)
                continue

            # The placed rect overlaps this free rect. Split into up to 4 pieces.
            splits = self._split_free_rect(free_rect, placed)
            new_free.extend(splits)

        # Prune: remove any free rect that is fully contained within another
        page.free_rects = self._prune_contained(new_free)

    def _intersects(self, a: Rect, b: Rect) -> bool:
        """Check if two rectangles overlap (share any interior area)."""
        return (
            a.x < b.x + b.width
            and a.x + a.width > b.x
            and a.y < b.y + b.height
            and a.y + a.height > b.y
        )

    def _split_free_rect(self, free: Rect, placed: Rect) -> list[Rect]:
        """Split a free rectangle around a placed rectangle.

        Returns up to 4 sub-rectangles representing the remaining free space
        after the placed rectangle occupies part of the free rectangle.
        """
        result: list[Rect] = []

        # Left strip
        if placed.x > free.x:
            result.append(Rect(
                x=free.x,
                y=free.y,
                width=placed.x - free.x,
                height=free.height,
            ))

        # Right strip
        right_edge = placed.x + placed.width
        free_right = free.x + free.width
        if right_edge < free_right:
            result.append(Rect(
                x=right_edge,
                y=free.y,
                width=free_right - right_edge,
                height=free.height,
            ))

        # Top strip
        if placed.y > free.y:
            result.append(Rect(
                x=free.x,
                y=free.y,
                width=free.width,
                height=placed.y - free.y,
            ))

        # Bottom strip
        bottom_edge = placed.y + placed.height
        free_bottom = free.y + free.height
        if bottom_edge < free_bottom:
            result.append(Rect(
                x=free.x,
                y=bottom_edge,
                width=free.width,
                height=free_bottom - bottom_edge,
            ))

        return result

    def _prune_contained(self, rects: list[Rect]) -> list[Rect]:
        """Remove rectangles that are fully contained within another rectangle.

        This prevents the free list from growing unboundedly. A rect is pruned
        if there exists any other rect that fully contains it.
        """
        pruned: list[Rect] = []
        n = len(rects)
        contained = [False] * n

        for i in range(n):
            if contained[i]:
                continue
            for j in range(n):
                if i == j or contained[j]:
                    continue
                if self._contains(rects[j], rects[i]):
                    contained[i] = True
                    break

        for i in range(n):
            if not contained[i]:
                pruned.append(rects[i])

        return pruned

    def _contains(self, outer: Rect, inner: Rect) -> bool:
        """Check if outer fully contains inner."""
        return (
            outer.x <= inner.x
            and outer.y <= inner.y
            and outer.x + outer.width >= inner.x + inner.width
            and outer.y + outer.height >= inner.y + inner.height
        )


def pack_texture_atlases(node_images: list[NodeImageInput]) -> PackResult:
    """Pack node images into texture atlases.

    Takes a list of node images with their dimensions and produces one or more
    2048x2048 RGBA atlas images, plus a region mapping that records where each
    node's image was placed.

    Steps:
    1. Pack rectangles using MaxRects BSSF
    2. Create atlas images using Pillow (RGBA, 2048x2048)
    3. Paste each node image at its packed position
    4. Return atlas images as PNG bytes and the region mapping

    Input: list of { "nodeId": str, "imageBytes": bytes, "width": int, "height": int }

    Output: {
        "atlases": [{ "index": int, "imageBytes": bytes, "width": int, "height": int }],
        "regions": { nodeId: { "atlasIndex": int, "x": int, "y": int, "width": int, "height": int } },
        "count": int
    }
    """
    if not node_images:
        return PackResult(atlases=[], regions={}, count=0)

    # Build rectangle list for the packer
    rects: list[RectInput] = [
        RectInput(id=img["nodeId"], width=img["width"], height=img["height"])
        for img in node_images
    ]

    packer = MaxRectsAtlasPacker()
    packed = packer.pack(rects)

    # Build a lookup from nodeId to image bytes
    image_lookup: dict[str, bytes] = {
        img["nodeId"]: img["imageBytes"] for img in node_images
    }

    # Determine how many atlas pages we need
    if not packed:
        return PackResult(atlases=[], regions={}, count=0)

    num_atlases = max(p["atlasIndex"] for p in packed) + 1

    # Create blank atlas images (transparent RGBA)
    atlas_images: list[Image.Image] = [
        Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))
        for _ in range(num_atlases)
    ]

    # Build regions mapping and paste images
    regions: dict[str, AtlasRegionDict] = {}

    for placement in packed:
        node_id = placement["id"]
        atlas_idx = placement["atlasIndex"]
        px = placement["x"]
        py = placement["y"]
        pw = placement["width"]
        ph = placement["height"]

        regions[node_id] = AtlasRegionDict(
            atlasIndex=atlas_idx,
            x=px,
            y=py,
            width=pw,
            height=ph,
        )

        # Paste the node image onto the atlas
        img_bytes = image_lookup.get(node_id)
        if img_bytes is None:
            logger.warning(f"No image bytes found for node '{node_id}', skipping paste")
            continue

        try:
            node_img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
            # Resize if the actual image dimensions don't match the declared dimensions
            if node_img.size != (pw, ph):
                node_img = node_img.resize((pw, ph), Image.LANCZOS)
            atlas_images[atlas_idx].paste(node_img, (px, py), node_img)
        except Exception:
            logger.exception(f"Failed to paste image for node '{node_id}' onto atlas {atlas_idx}")

    # Serialize atlas images to PNG bytes
    atlases: list[AtlasOutput] = []
    for idx, atlas_img in enumerate(atlas_images):
        buf = io.BytesIO()
        atlas_img.save(buf, format="PNG", optimize=True)
        atlases.append(AtlasOutput(
            index=idx,
            imageBytes=buf.getvalue(),
            width=ATLAS_SIZE,
            height=ATLAS_SIZE,
        ))

    logger.info(
        f"Packed {len(packed)} nodes into {num_atlases} atlas(es) "
        f"({ATLAS_SIZE}x{ATLAS_SIZE}, {ATLAS_PADDING}px padding)"
    )

    return PackResult(atlases=atlases, regions=regions, count=num_atlases)


def validate_atlas_regions(
    regions: dict[str, AtlasRegionDict], atlas_size: int = ATLAS_SIZE
) -> list[str]:
    """Validate that all atlas regions are within bounds and don't overlap.

    Checks:
    1. Every region fits within the atlas boundaries (0..atlas_size)
    2. No two regions on the same atlas page overlap

    Returns a list of error messages. An empty list means all regions are valid.
    """
    errors: list[str] = []

    # Group regions by atlas index for overlap checking
    by_atlas: dict[int, list[tuple[str, AtlasRegionDict]]] = {}

    for node_id, region in regions.items():
        ax = region["x"]
        ay = region["y"]
        aw = region["width"]
        ah = region["height"]

        # Bounds check
        if ax < 0 or ay < 0:
            errors.append(
                f"Node '{node_id}': negative position ({ax}, {ay})"
            )
        if ax + aw > atlas_size:
            errors.append(
                f"Node '{node_id}': exceeds atlas width "
                f"(x={ax} + w={aw} = {ax + aw} > {atlas_size})"
            )
        if ay + ah > atlas_size:
            errors.append(
                f"Node '{node_id}': exceeds atlas height "
                f"(y={ay} + h={ah} = {ay + ah} > {atlas_size})"
            )
        if aw <= 0 or ah <= 0:
            errors.append(
                f"Node '{node_id}': non-positive dimensions ({aw}x{ah})"
            )

        atlas_idx = region["atlasIndex"]
        if atlas_idx not in by_atlas:
            by_atlas[atlas_idx] = []
        by_atlas[atlas_idx].append((node_id, region))

    # Overlap check within each atlas page
    for atlas_idx, page_regions in by_atlas.items():
        n = len(page_regions)
        for i in range(n):
            id_a, ra = page_regions[i]
            for j in range(i + 1, n):
                id_b, rb = page_regions[j]
                if _regions_overlap(ra, rb):
                    errors.append(
                        f"Atlas {atlas_idx}: nodes '{id_a}' and '{id_b}' overlap "
                        f"({id_a}: {ra['x']},{ra['y']} {ra['width']}x{ra['height']} | "
                        f"{id_b}: {rb['x']},{rb['y']} {rb['width']}x{rb['height']})"
                    )

    return errors


def _regions_overlap(a: AtlasRegionDict, b: AtlasRegionDict) -> bool:
    """Check if two atlas regions overlap (share any interior area)."""
    return (
        a["x"] < b["x"] + b["width"]
        and a["x"] + a["width"] > b["x"]
        and a["y"] < b["y"] + b["height"]
        and a["y"] + a["height"] > b["y"]
    )
