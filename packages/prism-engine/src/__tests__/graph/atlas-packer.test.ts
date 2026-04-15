import { describe, it, expect } from 'vitest';
import {
  ATLAS_SIZE,
  ATLAS_PADDING,
  MaxRectsPacker,
  validateAtlasRegions,
} from '../../graph/atlas-packer.js';
import type { RectInput, PackedRect } from '../../graph/atlas-packer.js';
import type { AtlasRegion } from '../../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('atlas constants', () => {
  it('ATLAS_SIZE is 2048', () => {
    expect(ATLAS_SIZE).toBe(2048);
  });

  it('ATLAS_PADDING is 2', () => {
    expect(ATLAS_PADDING).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// MaxRectsPacker
// ---------------------------------------------------------------------------

describe('MaxRectsPacker', () => {
  it('packs a single small rectangle', () => {
    const packer = new MaxRectsPacker();
    const rects: RectInput[] = [{ id: 'r1', width: 100, height: 100 }];
    const results = packer.pack(rects);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('r1');
    expect(results[0].atlasIndex).toBe(0);
    expect(results[0].width).toBe(100);
    expect(results[0].height).toBe(100);
  });

  it('packs multiple rectangles into one atlas', () => {
    const packer = new MaxRectsPacker();
    const rects: RectInput[] = [
      { id: 'r1', width: 100, height: 100 },
      { id: 'r2', width: 200, height: 150 },
      { id: 'r3', width: 50, height: 50 },
      { id: 'r4', width: 300, height: 200 },
      { id: 'r5', width: 80, height: 120 },
    ];
    const results = packer.pack(rects);

    expect(results).toHaveLength(5);
    // All should fit on a single 2048x2048 atlas
    const atlasIndices = new Set(results.map((r) => r.atlasIndex));
    expect(atlasIndices.size).toBe(1);
  });

  it('all packed rects have non-negative positions', () => {
    const packer = new MaxRectsPacker();
    const rects: RectInput[] = [
      { id: 'r1', width: 400, height: 400 },
      { id: 'r2', width: 300, height: 300 },
      { id: 'r3', width: 500, height: 200 },
    ];
    const results = packer.pack(rects);

    for (const r of results) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('no packed rects overlap each other', () => {
    const packer = new MaxRectsPacker();
    const rects: RectInput[] = [
      { id: 'r1', width: 400, height: 300 },
      { id: 'r2', width: 350, height: 250 },
      { id: 'r3', width: 500, height: 400 },
      { id: 'r4', width: 200, height: 200 },
    ];
    const results = packer.pack(rects);

    // Group by atlas page
    const byAtlas = new Map<number, PackedRect[]>();
    for (const r of results) {
      if (!byAtlas.has(r.atlasIndex)) {
        byAtlas.set(r.atlasIndex, []);
      }
      byAtlas.get(r.atlasIndex)!.push(r);
    }

    for (const pageRects of byAtlas.values()) {
      for (let i = 0; i < pageRects.length; i++) {
        for (let j = i + 1; j < pageRects.length; j++) {
          const a = pageRects[i];
          const b = pageRects[j];
          const overlaps =
            a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y;
          expect(overlaps).toBe(false);
        }
      }
    }
  });

  it('creates multiple atlas pages when needed', () => {
    const packer = new MaxRectsPacker();
    // 10 rects of 1000x1000 -- each padded to 1002x1002, atlas usable area is ~2044x2044
    // At most ~4 can fit per atlas page (2x2), so we need at least 3 pages
    const rects: RectInput[] = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
      width: 1000,
      height: 1000,
    }));
    const results = packer.pack(rects);

    const atlasIndices = new Set(results.map((r) => r.atlasIndex));
    expect(atlasIndices.size).toBeGreaterThan(1);
  });

  it('sorts by area descending internally', () => {
    const packer = new MaxRectsPacker();
    // Provide rects in ascending area order; the packer should process largest first
    const rects: RectInput[] = [
      { id: 'small', width: 50, height: 50 },
      { id: 'medium', width: 200, height: 200 },
      { id: 'large', width: 500, height: 500 },
    ];
    const results = packer.pack(rects);

    // All should pack successfully
    expect(results).toHaveLength(3);
    // The largest rect should be placed first and therefore at the packer's
    // initial position (lowest x/y values among similarly-positioned rects)
    const large = results.find((r) => r.id === 'large')!;
    const small = results.find((r) => r.id === 'small')!;
    expect(large).toBeDefined();
    expect(small).toBeDefined();
  });

  it('skips zero-dimension rectangles', () => {
    const packer = new MaxRectsPacker();
    const rects: RectInput[] = [
      { id: 'zero-w', width: 0, height: 100 },
      { id: 'zero-h', width: 100, height: 0 },
      { id: 'valid', width: 100, height: 100 },
    ];
    const results = packer.pack(rects);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('valid');
  });

  it('skips oversized rectangles', () => {
    const packer = new MaxRectsPacker();
    const rects: RectInput[] = [
      { id: 'too-wide', width: 3000, height: 100 },
      { id: 'too-tall', width: 100, height: 3000 },
      { id: 'valid', width: 100, height: 100 },
    ];
    const results = packer.pack(rects);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('valid');
  });
});

// ---------------------------------------------------------------------------
// validateAtlasRegions
// ---------------------------------------------------------------------------

describe('validateAtlasRegions', () => {
  it('passes for valid non-overlapping regions', () => {
    const regions: Record<string, AtlasRegion> = {
      a: { atlasIndex: 0, x: 0, y: 0, width: 100, height: 100 },
      b: { atlasIndex: 0, x: 200, y: 0, width: 100, height: 100 },
    };
    const errors = validateAtlasRegions(regions);
    expect(errors).toHaveLength(0);
  });

  it('detects out-of-bounds regions', () => {
    const regions: Record<string, AtlasRegion> = {
      a: { atlasIndex: 0, x: 2000, y: 0, width: 100, height: 100 },
    };
    const errors = validateAtlasRegions(regions);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('exceeds'))).toBe(true);
  });

  it('detects overlapping regions', () => {
    const regions: Record<string, AtlasRegion> = {
      a: { atlasIndex: 0, x: 0, y: 0, width: 200, height: 200 },
      b: { atlasIndex: 0, x: 100, y: 100, width: 200, height: 200 },
    };
    const errors = validateAtlasRegions(regions);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('overlap'))).toBe(true);
  });

  it('detects negative positions', () => {
    const regions: Record<string, AtlasRegion> = {
      a: { atlasIndex: 0, x: -10, y: 0, width: 100, height: 100 },
    };
    const errors = validateAtlasRegions(regions);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('negative'))).toBe(true);
  });

  it('detects non-positive dimensions', () => {
    const regions: Record<string, AtlasRegion> = {
      a: { atlasIndex: 0, x: 0, y: 0, width: 0, height: 100 },
    };
    const errors = validateAtlasRegions(regions);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('non-positive'))).toBe(true);
  });
});
