"""
Prism Text Compositing Utilities

Implements the tiered text rendering approach (Invariant 7):
  1. Sharp+SVG (Pillow) for functional text — button labels, nav items, form labels (100% accuracy)
  2. MSDF metadata for WebGPU runtime text — dynamic content, real-time updates
  3. Diffusion pass-through for decorative text — hero headings, artistic elements

TextContentSpec shape (from prism-graph.ts):
  text: str
  role: 'heading' | 'body' | 'label' | 'placeholder' | 'caption'
  renderMethod: 'sharp-svg' | 'msdf' | 'diffusion'
  typography: { fontFamily: str, fontSize: int, fontWeight: int, color: str }
  position: { x: int, y: int, anchor: 'left' | 'center' | 'right' }
"""

from __future__ import annotations

import io
import math
import struct
from typing import Any

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
except ImportError:
    raise ImportError(
        "Pillow is required for text compositing. "
        "Install with: pip install Pillow"
    )

# Optional: better font handling via fontTools for MSDF metrics
try:
    from fontTools.ttLib import TTFont

    _HAS_FONTTOOLS = True
except ImportError:
    _HAS_FONTTOOLS = False


# ---------------------------------------------------------------------------
# Font weight to file-name suffix mapping (common convention)
# ---------------------------------------------------------------------------
_WEIGHT_SUFFIXES: dict[int, str] = {
    100: "Thin",
    200: "ExtraLight",
    300: "Light",
    400: "Regular",
    500: "Medium",
    600: "SemiBold",
    700: "Bold",
    800: "ExtraBold",
    900: "Black",
}

# Fallback fonts tried in order when the requested font is unavailable.
# These are commonly available on Linux containers (Modal images) and macOS.
_FALLBACK_FONTS: list[str] = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/SFCompact.ttf",
]


def _resolve_font(
    family: str, size: int, weight: int
) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Resolve a font specification to a Pillow font object.

    Tries several strategies in order:
      1. Exact path if family looks like an absolute path
      2. System font directories with weight suffix variants
      3. Fallback font list
      4. Pillow's built-in default font (bitmap, no scaling)
    """
    import os

    # Strategy 1: family is already an absolute path
    if os.path.isfile(family):
        try:
            return ImageFont.truetype(family, size)
        except (OSError, IOError):
            pass

    # Strategy 2: search common font directories with weight variants
    weight_suffix = _WEIGHT_SUFFIXES.get(weight, "Regular")
    search_dirs = [
        "/usr/share/fonts/truetype",
        "/usr/share/fonts",
        "/usr/local/share/fonts",
        "/System/Library/Fonts",
        "/Library/Fonts",
    ]
    # Normalize family name for file matching (e.g. "Inter" -> "Inter",
    # "Space Grotesk" -> "SpaceGrotesk")
    family_normalized = family.replace(" ", "")
    candidate_names = [
        f"{family_normalized}-{weight_suffix}.ttf",
        f"{family_normalized}-{weight_suffix}.otf",
        f"{family_normalized}.ttf",
        f"{family_normalized}.otf",
        f"{family.replace(' ', '')}.ttf",
    ]

    for search_dir in search_dirs:
        if not os.path.isdir(search_dir):
            continue
        for dirpath, _dirnames, filenames in os.walk(search_dir):
            for candidate in candidate_names:
                if candidate.lower() in (f.lower() for f in filenames):
                    # Find the actual filename (case-insensitive match)
                    actual = next(
                        f for f in filenames if f.lower() == candidate.lower()
                    )
                    full_path = os.path.join(dirpath, actual)
                    try:
                        return ImageFont.truetype(full_path, size)
                    except (OSError, IOError):
                        continue

    # Strategy 3: fallback fonts
    for fallback_path in _FALLBACK_FONTS:
        if os.path.isfile(fallback_path):
            try:
                return ImageFont.truetype(fallback_path, size)
            except (OSError, IOError):
                continue

    # Strategy 4: Pillow built-in default (bitmap font, does not scale)
    return ImageFont.load_default()


def _parse_color(color: str) -> tuple[int, int, int, int]:
    """Parse a CSS-style color string into an RGBA tuple.

    Supports:
      - Hex: #rgb, #rrggbb, #rrggbbaa
      - rgb(r, g, b) / rgba(r, g, b, a)
      - Named colors (a small common subset)
    """
    color = color.strip()

    # Hex colors
    if color.startswith("#"):
        h = color[1:]
        if len(h) == 3:
            r, g, b = (int(c * 2, 16) for c in h)
            return (r, g, b, 255)
        if len(h) == 6:
            r = int(h[0:2], 16)
            g = int(h[2:4], 16)
            b = int(h[4:6], 16)
            return (r, g, b, 255)
        if len(h) == 8:
            r = int(h[0:2], 16)
            g = int(h[2:4], 16)
            b = int(h[4:6], 16)
            a = int(h[6:8], 16)
            return (r, g, b, a)

    # rgb() / rgba()
    if color.startswith("rgb"):
        inner = color.split("(", 1)[-1].rstrip(")")
        parts = [p.strip() for p in inner.split(",")]
        r = int(float(parts[0]))
        g = int(float(parts[1]))
        b = int(float(parts[2]))
        a = int(float(parts[3]) * 255) if len(parts) > 3 else 255
        return (r, g, b, a)

    # Common named colors
    named: dict[str, tuple[int, int, int, int]] = {
        "white": (255, 255, 255, 255),
        "black": (0, 0, 0, 255),
        "red": (255, 0, 0, 255),
        "green": (0, 128, 0, 255),
        "blue": (0, 0, 255, 255),
        "transparent": (0, 0, 0, 0),
    }
    if color.lower() in named:
        return named[color.lower()]

    # Default: black
    return (0, 0, 0, 255)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def composite_text_onto_image(
    image_bytes: bytes,
    text_specs: list[dict],
    output_format: str = "png",
) -> bytes:
    """Render functional text (sharp-svg renderMethod) onto an element image.

    For each text_spec with renderMethod='sharp-svg':
      - Render text using Pillow's ImageDraw with the specified typography
      - Composite onto the element image at the specified position
      - Handle anchor alignment (left/center/right)

    Text specs with renderMethod='msdf' or 'diffusion' are skipped
    (handled by the runtime renderer and the diffusion model respectively).

    Args:
        image_bytes: Source image as PNG/JPEG bytes.
        text_specs: List of TextContentSpec dicts.
        output_format: Output image format ('png' or 'jpeg').

    Returns:
        Composited image as bytes in the requested format.
    """
    base_image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")

    # Create a transparent overlay for text compositing so we can
    # blend cleanly without modifying the base until the end.
    text_layer = Image.new("RGBA", base_image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(text_layer)

    for spec in text_specs:
        render_method = spec.get("renderMethod", "")
        if render_method != "sharp-svg":
            # msdf and diffusion text are not composited here
            continue

        text = spec.get("text", "")
        if not text:
            continue

        typography = spec.get("typography", {})
        font_family = typography.get("fontFamily", "sans-serif")
        font_size = int(typography.get("fontSize", 16))
        font_weight = int(typography.get("fontWeight", 400))
        color_str = typography.get("color", "#000000")

        position = spec.get("position", {})
        x = int(position.get("x", 0))
        y = int(position.get("y", 0))
        anchor = position.get("anchor", "left")

        font = _resolve_font(font_family, font_size, font_weight)
        fill_color = _parse_color(color_str)

        # Measure text to handle anchor alignment
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]

        # Adjust x position based on anchor
        if anchor == "center":
            draw_x = x - text_width // 2
        elif anchor == "right":
            draw_x = x - text_width
        else:
            # "left" or default
            draw_x = x

        # Offset y to account for font ascent (bbox may start above 0)
        draw_y = y - bbox[1]

        draw.text((draw_x, draw_y), text, font=font, fill=fill_color)

    # Composite text layer onto base
    result = Image.alpha_composite(base_image, text_layer)

    # Convert to the requested output format
    output_buf = io.BytesIO()
    if output_format.lower() == "jpeg":
        # JPEG does not support alpha; flatten to white background
        flat = Image.new("RGB", result.size, (255, 255, 255))
        flat.paste(result, mask=result.split()[3])
        flat.save(output_buf, format="JPEG", quality=95)
    else:
        result.save(output_buf, format="PNG")

    return output_buf.getvalue()


def generate_msdf_atlas_entry(
    font_family: str,
    font_size: int,
    font_weight: int,
    chars: str,
) -> dict[str, Any]:
    """Generate MSDF font atlas metadata for runtime text rendering.

    Returns a dict describing the font atlas entry for the given characters.
    The actual MSDF signed-distance-field texture is generated during the
    assembly phase by the msdfgen binary. This function produces the metadata
    structure and per-character metrics that the PixiJS runtime needs.

    If fontTools is available, real glyph metrics (advance widths, bearings)
    are extracted from the font file. Otherwise, estimated metrics based on
    font size are provided.

    Args:
        font_family: Font family name or path.
        font_size: Font size in pixels.
        font_weight: Font weight (100-900).
        chars: String of characters to include in the atlas entry.

    Returns:
        Dict with keys: fontFamily, fontSize, fontWeight, chars, atlasRegion,
        sdfType, lineHeight, baseline.
    """
    unique_chars = sorted(set(chars))
    char_metrics: list[dict[str, Any]] = []

    # Try to load real metrics from the font file via fontTools
    tt_font: TTFont | None = None
    if _HAS_FONTTOOLS:
        try:
            font_obj = _resolve_font(font_family, font_size, font_weight)
            if hasattr(font_obj, "path") and font_obj.path:
                tt_font = TTFont(font_obj.path)
        except Exception:
            tt_font = None

    # Units-per-em for converting font units to pixels
    units_per_em = 1000
    if tt_font is not None:
        try:
            units_per_em = tt_font["head"].unitsPerEm
        except Exception:
            units_per_em = 1000

    scale = font_size / units_per_em

    # Per-character cell size in the atlas (with padding for SDF spread)
    sdf_spread = 4  # pixels of SDF padding around each glyph
    cell_size = font_size + sdf_spread * 2

    for char in unique_chars:
        advance_width = font_size * 0.6  # default monospace estimate
        left_bearing = 0.0
        top_bearing = font_size * 0.8  # approximate ascent

        if tt_font is not None:
            try:
                cmap = tt_font.getBestCmap()
                glyph_name = cmap.get(ord(char))
                if glyph_name:
                    # Get horizontal metrics
                    hmtx = tt_font["hmtx"]
                    raw_advance, raw_lsb = hmtx[glyph_name]
                    advance_width = raw_advance * scale
                    left_bearing = raw_lsb * scale

                    # Get vertical metrics from OS/2 table
                    if "OS/2" in tt_font:
                        os2 = tt_font["OS/2"]
                        top_bearing = os2.sTypoAscender * scale
            except Exception:
                # Fall back to estimates on any lookup failure
                pass

        char_metrics.append(
            {
                "char": char,
                "unicode": ord(char),
                "advance": round(advance_width, 2),
                "leftBearing": round(left_bearing, 2),
                "topBearing": round(top_bearing, 2),
                "width": cell_size,
                "height": cell_size,
            }
        )

    # Compute atlas region: lay out characters in a grid
    num_chars = len(unique_chars)
    cols = max(1, math.ceil(math.sqrt(num_chars)))
    rows = max(1, math.ceil(num_chars / cols))
    atlas_width = cols * cell_size
    atlas_height = rows * cell_size

    # Assign atlas positions to each character
    for i, metric in enumerate(char_metrics):
        col = i % cols
        row = i // cols
        metric["atlasX"] = col * cell_size
        metric["atlasY"] = row * cell_size

    # Compute line height from font metrics or estimate
    line_height = font_size * 1.2
    baseline = font_size * 0.8
    if tt_font is not None:
        try:
            os2 = tt_font["OS/2"]
            ascender = os2.sTypoAscender * scale
            descender = abs(os2.sTypoDescender * scale)
            line_gap = os2.sTypoLineGap * scale
            line_height = ascender + descender + line_gap
            baseline = ascender
        except Exception:
            pass

    if tt_font is not None:
        try:
            tt_font.close()
        except Exception:
            pass

    return {
        "fontFamily": font_family,
        "fontSize": font_size,
        "fontWeight": font_weight,
        "chars": char_metrics,
        "atlasRegion": {
            "x": 0,
            "y": 0,
            "width": atlas_width,
            "height": atlas_height,
        },
        "sdfType": "msdf",
        "lineHeight": round(line_height, 2),
        "baseline": round(baseline, 2),
        "cellSize": cell_size,
        "sdfSpread": sdf_spread,
    }


def classify_text_render_method(text: str, role: str) -> str:
    """Classify which render method a text element should use.

    Rules (from Invariant 7 — Text Rendering Is Solved):
      - 'label', 'placeholder' roles -> 'sharp-svg' (must be pixel-perfect)
      - 'caption' role -> 'sharp-svg'
      - 'heading' role with <= 5 words -> 'diffusion' (artistic treatment)
      - 'heading' role with > 5 words -> 'msdf' (too long for diffusion)
      - 'body' role -> 'msdf' (dynamic content, may change at runtime)

    Args:
        text: The text content string.
        role: The text role ('heading', 'body', 'label', 'placeholder', 'caption').

    Returns:
        One of 'sharp-svg', 'msdf', or 'diffusion'.
    """
    # Functional text roles always use sharp-svg for pixel accuracy
    if role in ("label", "placeholder", "caption"):
        return "sharp-svg"

    # Headings: short ones get artistic diffusion treatment,
    # longer ones use MSDF for runtime flexibility
    if role == "heading":
        word_count = len(text.strip().split())
        if word_count <= 5:
            return "diffusion"
        return "msdf"

    # Body text uses MSDF for runtime rendering
    if role == "body":
        return "msdf"

    # Unknown roles default to sharp-svg for safety (guaranteed accuracy)
    return "sharp-svg"


def extract_text_regions_from_image(image_bytes: bytes) -> list[dict[str, Any]]:
    """Detect text regions in a generated UI image using edge-based heuristics.

    Uses Pillow-based processing to find regions that likely contain text:
      1. Convert to grayscale
      2. Apply edge detection to find high-contrast boundaries
      3. Threshold and find connected components
      4. Filter components by aspect ratio and density (text-like shapes)

    This is a lightweight heuristic approach suitable for UI images where
    text tends to be high-contrast against its background. For production
    accuracy, this could be upgraded to use a proper OCR model (e.g.,
    EasyOCR or PaddleOCR running on Modal).

    Args:
        image_bytes: Image as PNG/JPEG bytes.

    Returns:
        List of detected text region dicts:
        [{"text": "", "bbox": [x1, y1, x2, y2], "confidence": float}]

        Note: The "text" field is empty because this heuristic detector
        does not perform OCR — it only locates regions. Actual text
        content would come from an OCR model in production.
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    width, height = img.size

    # Step 1: Edge detection — find high-contrast boundaries typical of text
    edges = img.filter(ImageFilter.FIND_EDGES)

    # Step 2: Threshold to binary — text edges are strong
    threshold = 30
    pixels = edges.load()
    binary = Image.new("1", (width, height), 0)
    binary_pixels = binary.load()
    for y_pos in range(height):
        for x_pos in range(width):
            if pixels[x_pos, y_pos] > threshold:
                binary_pixels[x_pos, y_pos] = 1

    # Step 3: Connected component analysis via flood fill
    visited = [[False] * width for _ in range(height)]
    components: list[tuple[int, int, int, int, int]] = []  # (x1, y1, x2, y2, pixel_count)

    def _flood_bounds(
        start_x: int, start_y: int
    ) -> tuple[int, int, int, int, int]:
        """BFS flood fill returning bounding box and pixel count."""
        stack = [(start_x, start_y)]
        min_x = max_x = start_x
        min_y = max_y = start_y
        count = 0

        while stack:
            cx, cy = stack.pop()
            if cx < 0 or cx >= width or cy < 0 or cy >= height:
                continue
            if visited[cy][cx]:
                continue
            if not binary_pixels[cx, cy]:
                continue

            visited[cy][cx] = True
            count += 1
            min_x = min(min_x, cx)
            max_x = max(max_x, cx)
            min_y = min(min_y, cy)
            max_y = max(max_y, cy)

            # 4-connected neighbors
            stack.append((cx + 1, cy))
            stack.append((cx - 1, cy))
            stack.append((cx, cy + 1))
            stack.append((cx, cy - 1))

        return (min_x, min_y, max_x, max_y, count)

    for y_pos in range(height):
        for x_pos in range(width):
            if binary_pixels[x_pos, y_pos] and not visited[y_pos][x_pos]:
                comp = _flood_bounds(x_pos, y_pos)
                components.append(comp)

    # Step 4: Merge nearby components into text-line regions
    # Text characters are often close together horizontally
    merged_regions: list[list[int]] = []
    merge_threshold_x = max(8, width // 80)  # horizontal merge distance
    merge_threshold_y = max(4, height // 120)  # vertical merge distance

    # Sort components by y then x for merging
    components.sort(key=lambda c: (c[1], c[0]))

    for x1, y1, x2, y2, count in components:
        comp_w = x2 - x1
        comp_h = y2 - y1

        # Filter out noise: too small or too large
        if count < 5:
            continue
        if comp_w < 3 or comp_h < 3:
            continue
        if comp_w > width * 0.9 and comp_h > height * 0.9:
            # Probably a border or full-image edge, not text
            continue

        # Try to merge with an existing region
        merged = False
        for region in merged_regions:
            rx1, ry1, rx2, ry2 = region
            # Check if this component is near the region
            # (horizontally adjacent and vertically overlapping)
            vertical_overlap = not (y2 < ry1 - merge_threshold_y or y1 > ry2 + merge_threshold_y)
            horizontal_proximity = (
                x1 <= rx2 + merge_threshold_x and x2 >= rx1 - merge_threshold_x
            )
            if vertical_overlap and horizontal_proximity:
                region[0] = min(region[0], x1)
                region[1] = min(region[1], y1)
                region[2] = max(region[2], x2)
                region[3] = max(region[3], y2)
                merged = True
                break

        if not merged:
            merged_regions.append([x1, y1, x2, y2])

    # Step 5: Filter regions by text-like characteristics
    results: list[dict[str, Any]] = []
    for region in merged_regions:
        rx1, ry1, rx2, ry2 = region
        rw = rx2 - rx1
        rh = ry2 - ry1

        if rw < 5 or rh < 5:
            continue

        aspect_ratio = rw / max(rh, 1)

        # Text regions tend to be wider than tall (single lines)
        # or moderately proportioned (short labels).
        # Very tall-and-narrow or huge-square regions are unlikely text.
        if aspect_ratio < 0.3 and rh > 50:
            # Tall narrow strip — probably a vertical line/border
            continue

        # Compute edge density within the region as a confidence proxy
        region_crop = edges.crop((rx1, ry1, rx2, ry2))
        region_pixels = list(region_crop.getdata())
        edge_count = sum(1 for p in region_pixels if p > threshold)
        total_pixels = max(len(region_pixels), 1)
        density = edge_count / total_pixels

        # Text has moderate edge density (not too sparse, not solid)
        if density < 0.02:
            continue

        # Confidence heuristic based on density and aspect ratio
        # Text-like: moderate density (0.05-0.4), wider-than-tall
        confidence = 0.5
        if 0.05 <= density <= 0.5:
            confidence += 0.2
        if 1.0 <= aspect_ratio <= 30.0:
            confidence += 0.15
        if 8 <= rh <= 200:
            confidence += 0.1
        confidence = min(confidence, 0.95)

        results.append(
            {
                "text": "",  # OCR not performed — region detection only
                "bbox": [rx1, ry1, rx2, ry2],
                "confidence": round(confidence, 3),
            }
        )

    # Sort by confidence descending, then by position (top-to-bottom, left-to-right)
    results.sort(key=lambda r: (-r["confidence"], r["bbox"][1], r["bbox"][0]))

    return results
