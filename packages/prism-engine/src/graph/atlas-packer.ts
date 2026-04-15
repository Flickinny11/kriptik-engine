/**
 * atlas-packer.ts -- TypeScript port of the MaxRects bin packing algorithm.
 *
 * Faithful port of modal/prism/utils/atlas.py MaxRectsAtlasPacker.
 *
 * Spec reference: docs/DIFFUSION-ENGINE-SPEC.md Section 10 -- Texture Atlas Packing
 *   - Atlas size: 2048x2048
 *   - Padding: 2px between sprites (prevents texture bleeding)
 *   - MaxRects bin packing algorithm (Best Short Side Fit)
 *   - Target: 1-3 atlases for typical app (20-50 elements)
 *   - Each atlas = ~16MB GPU memory (RGBA8)
 *   - Record atlas regions per node in graph metadata
 */

import type { AtlasRegion } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ATLAS_SIZE = 2048;
export const ATLAS_PADDING = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input rectangle to be packed into an atlas. */
export interface RectInput {
  id: string;
  width: number;
  height: number;
}

/** A rectangle that has been placed in an atlas page. */
export interface PackedRect {
  id: string;
  atlasIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** A free rectangle in the atlas available for placement. */
interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Internal state for a single atlas page during packing. */
interface AtlasPage {
  index: number;
  freeRects: FreeRect[];
}

// ---------------------------------------------------------------------------
// MaxRectsPacker
// ---------------------------------------------------------------------------

/**
 * MaxRects bin packing for texture atlas generation.
 *
 * Uses the Best Short Side Fit (BSSF) heuristic for placing rectangles.
 * Creates multiple atlas pages as needed.
 *
 * The BSSF heuristic works by: for each candidate free rectangle that can
 * contain the item, computing the shorter leftover side after placement.
 * The placement with the smallest such value is chosen, since it means the
 * rectangle fits most tightly along its shorter dimension.
 */
export class MaxRectsPacker {
  private readonly atlasSize: number;
  private readonly padding: number;
  private readonly usableSize: number;
  private pages: AtlasPage[];

  constructor(atlasSize: number = ATLAS_SIZE, padding: number = ATLAS_PADDING) {
    this.atlasSize = atlasSize;
    this.padding = padding;
    // Usable area accounts for padding on edges
    this.usableSize = atlasSize - padding;
    this.pages = [];
  }

  /**
   * Create a new atlas page with a single free rectangle covering the
   * full usable area.
   */
  private createPage(): AtlasPage {
    const page: AtlasPage = {
      index: this.pages.length,
      freeRects: [
        {
          x: this.padding,
          y: this.padding,
          width: this.usableSize - this.padding,
          height: this.usableSize - this.padding,
        },
      ],
    };
    this.pages.push(page);
    return page;
  }

  /**
   * Pack a list of rectangles into atlas pages.
   *
   * Sorts rectangles by area (largest first) for better packing efficiency.
   * Creates new atlas pages as needed when a rectangle cannot fit in any
   * existing page.
   */
  pack(rects: RectInput[]): PackedRect[] {
    this.pages = [];
    const results: PackedRect[] = [];

    // Filter and validate
    const maxAllowed = this.usableSize - this.padding;
    const validRects: RectInput[] = [];

    for (const rect of rects) {
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }

      const paddedW = rect.width + this.padding;
      const paddedH = rect.height + this.padding;

      if (paddedW > maxAllowed || paddedH > maxAllowed) {
        continue;
      }

      validRects.push(rect);
    }

    // Sort by area descending for better packing
    const sortedRects = [...validRects].sort(
      (a, b) => b.width * b.height - a.width * a.height,
    );

    for (const rect of sortedRects) {
      const paddedW = rect.width + this.padding;
      const paddedH = rect.height + this.padding;
      let placed = false;

      // Try to place in an existing page
      for (const page of this.pages) {
        const placement = this.findBestPlacement(page, paddedW, paddedH);
        if (placement !== null) {
          const [fx, fy] = placement;
          this.placeRect(page, fx, fy, paddedW, paddedH);
          results.push({
            id: rect.id,
            atlasIndex: page.index,
            x: fx,
            y: fy,
            width: rect.width,
            height: rect.height,
          });
          placed = true;
          break;
        }
      }

      // Create a new page if no existing page can fit it
      if (!placed) {
        const page = this.createPage();
        const placement = this.findBestPlacement(page, paddedW, paddedH);
        if (placement !== null) {
          const [fx, fy] = placement;
          this.placeRect(page, fx, fy, paddedW, paddedH);
          results.push({
            id: rect.id,
            atlasIndex: page.index,
            x: fx,
            y: fy,
            width: rect.width,
            height: rect.height,
          });
        }
        // If placement is null on a fresh page, the rect was already filtered
        // out by validation. This branch should not be reachable.
      }
    }

    return results;
  }

  /**
   * Find the best position for a rectangle using BSSF heuristic.
   *
   * BSSF (Best Short Side Fit): For each free rectangle that can contain
   * the item, compute min(remaining_width, remaining_height). Pick the
   * free rect with the lowest such score (tightest fit along the shorter
   * leftover dimension).
   *
   * Returns [x, y] of the best placement, or null if it cannot fit.
   */
  private findBestPlacement(
    page: AtlasPage,
    width: number,
    height: number,
  ): [number, number] | null {
    let bestScore = Infinity;
    let bestPos: [number, number] | null = null;

    for (const freeRect of page.freeRects) {
      // Try placing without rotation
      if (width <= freeRect.width && height <= freeRect.height) {
        const leftoverW = freeRect.width - width;
        const leftoverH = freeRect.height - height;
        const shortSide = Math.min(leftoverW, leftoverH);
        if (shortSide < bestScore) {
          bestScore = shortSide;
          bestPos = [freeRect.x, freeRect.y];
        }
      }
    }

    return bestPos;
  }

  /**
   * Place a rectangle and update the free rectangle list.
   *
   * After placing a rectangle, each existing free rectangle that overlaps
   * the placed rectangle is split into up to 4 non-overlapping sub-rectangles
   * (the portions that remain free). Then redundant free rectangles (those
   * fully contained within another) are pruned.
   */
  private placeRect(
    page: AtlasPage,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const placed: FreeRect = { x, y, width, height };
    const newFree: FreeRect[] = [];

    for (const freeRect of page.freeRects) {
      if (!this.intersects(placed, freeRect)) {
        newFree.push(freeRect);
        continue;
      }

      // The placed rect overlaps this free rect. Split into up to 4 pieces.
      const splits = this.splitFreeRect(freeRect, placed);
      newFree.push(...splits);
    }

    // Prune: remove any free rect that is fully contained within another
    page.freeRects = this.pruneContained(newFree);
  }

  /**
   * Check if two rectangles overlap (share any interior area).
   */
  private intersects(a: FreeRect, b: FreeRect): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  /**
   * Split a free rectangle around a placed rectangle.
   *
   * Returns up to 4 sub-rectangles representing the remaining free space
   * after the placed rectangle occupies part of the free rectangle.
   */
  private splitFreeRect(free: FreeRect, placed: FreeRect): FreeRect[] {
    const result: FreeRect[] = [];

    // Left strip
    if (placed.x > free.x) {
      result.push({
        x: free.x,
        y: free.y,
        width: placed.x - free.x,
        height: free.height,
      });
    }

    // Right strip
    const rightEdge = placed.x + placed.width;
    const freeRight = free.x + free.width;
    if (rightEdge < freeRight) {
      result.push({
        x: rightEdge,
        y: free.y,
        width: freeRight - rightEdge,
        height: free.height,
      });
    }

    // Top strip
    if (placed.y > free.y) {
      result.push({
        x: free.x,
        y: free.y,
        width: free.width,
        height: placed.y - free.y,
      });
    }

    // Bottom strip
    const bottomEdge = placed.y + placed.height;
    const freeBottom = free.y + free.height;
    if (bottomEdge < freeBottom) {
      result.push({
        x: free.x,
        y: bottomEdge,
        width: free.width,
        height: freeBottom - bottomEdge,
      });
    }

    return result;
  }

  /**
   * Remove rectangles that are fully contained within another rectangle.
   *
   * This prevents the free list from growing unboundedly. A rect is pruned
   * if there exists any other rect that fully contains it.
   */
  private pruneContained(rects: FreeRect[]): FreeRect[] {
    const n = rects.length;
    const contained = new Array<boolean>(n).fill(false);

    for (let i = 0; i < n; i++) {
      if (contained[i]) continue;
      for (let j = 0; j < n; j++) {
        if (i === j || contained[j]) continue;
        if (this.contains(rects[j], rects[i])) {
          contained[i] = true;
          break;
        }
      }
    }

    const pruned: FreeRect[] = [];
    for (let i = 0; i < n; i++) {
      if (!contained[i]) {
        pruned.push(rects[i]);
      }
    }

    return pruned;
  }

  /**
   * Check if outer fully contains inner.
   */
  private contains(outer: FreeRect, inner: FreeRect): boolean {
    return (
      outer.x <= inner.x &&
      outer.y <= inner.y &&
      outer.x + outer.width >= inner.x + inner.width &&
      outer.y + outer.height >= inner.y + inner.height
    );
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that all atlas regions are within bounds and don't overlap.
 *
 * Checks:
 * 1. Every region fits within the atlas boundaries (0..atlasSize)
 * 2. No two regions on the same atlas page overlap
 * 3. Dimensions are positive
 * 4. Positions are non-negative
 *
 * Returns error messages. An empty array means all regions are valid.
 */
export function validateAtlasRegions(
  regions: Record<string, AtlasRegion>,
  atlasSize: number = ATLAS_SIZE,
): string[] {
  const errors: string[] = [];

  // Group regions by atlas index for overlap checking
  const byAtlas = new Map<number, Array<[string, AtlasRegion]>>();

  for (const [nodeId, region] of Object.entries(regions)) {
    const { x, y, width, height, atlasIndex } = region;

    // Bounds check
    if (x < 0 || y < 0) {
      errors.push(`Node '${nodeId}': negative position (${x}, ${y})`);
    }
    if (x + width > atlasSize) {
      errors.push(
        `Node '${nodeId}': exceeds atlas width (x=${x} + w=${width} = ${x + width} > ${atlasSize})`,
      );
    }
    if (y + height > atlasSize) {
      errors.push(
        `Node '${nodeId}': exceeds atlas height (y=${y} + h=${height} = ${y + height} > ${atlasSize})`,
      );
    }
    if (width <= 0 || height <= 0) {
      errors.push(`Node '${nodeId}': non-positive dimensions (${width}x${height})`);
    }

    if (!byAtlas.has(atlasIndex)) {
      byAtlas.set(atlasIndex, []);
    }
    byAtlas.get(atlasIndex)!.push([nodeId, region]);
  }

  // Overlap check within each atlas page
  for (const [atlasIdx, pageRegions] of byAtlas.entries()) {
    const n = pageRegions.length;
    for (let i = 0; i < n; i++) {
      const [idA, ra] = pageRegions[i];
      for (let j = i + 1; j < n; j++) {
        const [idB, rb] = pageRegions[j];
        if (regionsOverlap(ra, rb)) {
          errors.push(
            `Atlas ${atlasIdx}: nodes '${idA}' and '${idB}' overlap ` +
              `(${idA}: ${ra.x},${ra.y} ${ra.width}x${ra.height} | ` +
              `${idB}: ${rb.x},${rb.y} ${rb.width}x${rb.height})`,
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Check if two atlas regions overlap (share any interior area).
 */
function regionsOverlap(a: AtlasRegion, b: AtlasRegion): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
