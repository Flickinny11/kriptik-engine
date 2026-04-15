"""FLUX.2 Klein image generation worker for Prism pipeline.

Generates full-page UI mockup images from a PrismPlan. Each hub (page)
gets its own generated image at the plan's target resolution.

Model: FLUX.2 Klein 4B (black-forest-labs/FLUX.2-klein-4B)
GPU: L40S
Pipeline: diffusers.FluxPipeline, float16

Weights are pre-downloaded in the Modal gpu_image (baked into the container).
The pipeline is cached at module level so it persists across invocations
within the same container.

R2 path convention:
  {projectId}/{version}/images/hub-{hubId}.png
"""

import io
import time
import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level pipeline cache (loaded once per container)
# ---------------------------------------------------------------------------

_flux_pipeline = None

# Default resolution per spec Section 9: "default 1024x1024, up to 2048x2048"
_DEFAULT_WIDTH = 1024
_DEFAULT_HEIGHT = 1024
_MAX_RESOLUTION = 2048


def _get_flux_pipeline():
    """Load and cache the FLUX.2 Klein pipeline.

    Uses float16 for memory efficiency on L40S GPU. Pipeline is cached
    at module level so it persists across invocations within the same
    container.
    """
    global _flux_pipeline
    if _flux_pipeline is not None:
        return _flux_pipeline

    import torch
    from diffusers import FluxPipeline

    # DEVIATION #2: FLUX.1-schnell replaces spec's FLUX.2-klein-4B
    logger.info("Loading FLUX.1-schnell pipeline (float16)...")
    start = time.monotonic()

    _flux_pipeline = FluxPipeline.from_pretrained(
        "black-forest-labs/FLUX.1-schnell",
        torch_dtype=torch.float16,
    ).to("cuda")

    elapsed_ms = int((time.monotonic() - start) * 1000)
    logger.info("FLUX.2 Klein pipeline loaded in %dms", elapsed_ms)

    return _flux_pipeline


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

# Maps design language tokens to FLUX-friendly style descriptors.
_DESIGN_LANGUAGE_TOKENS: dict[str, str] = {
    "minimal": "clean minimalist design, ample whitespace, simple geometry, flat UI",
    "glassmorphism": "frosted glass panels, translucent layers, subtle blur backgrounds, glassmorphism UI",
    "neobrutalism": "bold outlines, raw colors, heavy shadows, neobrutalist web design",
    "material": "material design 3, elevated surfaces, rounded corners, subtle shadows",
    "corporate": "professional corporate layout, structured grid, neutral tones, business UI",
    "playful": "vibrant playful design, rounded shapes, bright gradients, friendly UI",
    "editorial": "editorial magazine layout, strong typography hierarchy, asymmetric grid",
    "custom": "modern web application interface",
}

# Maps app type to FLUX-friendly layout hints.
_APP_TYPE_LAYOUT_HINTS: dict[str, str] = {
    "landing-page": "marketing landing page with hero section, feature grid, testimonials, and call-to-action",
    "saas-dashboard": "SaaS analytics dashboard with sidebar navigation, data cards, charts, and tables",
    "e-commerce": "e-commerce product listing page with search bar, product cards, filters, and shopping cart icon",
    "portfolio": "creative portfolio page with project gallery, about section, and contact form",
    "blog": "blog article page with header, content area, sidebar, and comment section",
    "social-platform": "social media feed with profile sidebar, post cards, and interaction buttons",
    "marketplace": "marketplace listing page with search, category filters, and vendor cards",
    "crm": "CRM dashboard with contact list, pipeline stages, and activity timeline",
    "project-management": "project management board with kanban columns, task cards, and team avatars",
    "analytics-dashboard": "data analytics dashboard with KPI cards, line charts, bar charts, and data tables",
    "ai-tool": "AI tool interface with prompt input area, output display, and settings panel",
    "video-platform": "video platform page with player, playlist sidebar, and comments",
    "messaging-app": "messaging interface with conversation list, chat area, and input bar",
    "booking-system": "booking system with calendar view, time slots, and confirmation panel",
    "documentation": "documentation page with sidebar navigation, content area, and table of contents",
    "admin-panel": "admin panel with sidebar menu, data tables, and form modals",
    "custom": "modern web application interface",
}


def build_flux_prompt(hub: dict, plan: dict) -> str:
    """Build a FLUX.2 prompt from a hub plan and visual style.

    The prompt describes the overall page layout, visual style, key elements
    and their rough positions, typography hints, and mood/atmosphere. It is a
    text-to-image prompt designed to produce a clean, professional UI mockup.

    Args:
        hub: A hub dict matching the HubPlan schema.
        plan: The full plan dict matching PrismPlan schema.

    Returns:
        A string prompt suitable for FLUX.2 image generation.
    """
    intent: dict = plan.get("intent", {})
    visual_style: dict = intent.get("visualStyle", {})
    app_type: str = intent.get("appType", "custom")

    # Core layout description from app type
    layout_hint = _APP_TYPE_LAYOUT_HINTS.get(app_type, _APP_TYPE_LAYOUT_HINTS["custom"])

    # Design language tokens
    design_language: str = visual_style.get("designLanguage", "minimal")
    style_tokens = _DESIGN_LANGUAGE_TOKENS.get(design_language, _DESIGN_LANGUAGE_TOKENS["custom"])

    # Color scheme
    color_scheme: str = visual_style.get("colorScheme", "light")
    primary_color: str = visual_style.get("primaryColor", "#3B82F6")
    accent_color: str = visual_style.get("accentColor", "#8B5CF6")

    background_hint = "dark background" if color_scheme == "dark" else "light background"
    if color_scheme == "auto":
        background_hint = "light background with dark mode awareness"

    # Typography hints
    typography: dict = visual_style.get("typography", {})
    heading_font: str = typography.get("headingFont", "Inter")
    body_font: str = typography.get("bodyFont", "Inter")

    # Hub-specific description and elements
    hub_name: str = hub.get("name", "Page")
    hub_description: str = hub.get("description", "")
    elements: list[dict] = hub.get("elements", [])

    # Build element position descriptions for spatial layout hints
    element_descriptions: list[str] = []
    for elem in elements:
        elem_type: str = elem.get("type", "custom")
        caption: str = elem.get("caption", "")
        position: dict = elem.get("position", {})

        # Use position to describe rough placement
        x = position.get("x", 0)
        y = position.get("y", 0)
        w = position.get("width", 0)
        h = position.get("height", 0)

        placement = _describe_position(x, y, w, h)
        if caption:
            # Use a shortened version for the image prompt (not full caption)
            short_desc = caption[:120] if len(caption) > 120 else caption
            element_descriptions.append(f"{elem_type} {placement}: {short_desc}")
        else:
            element_descriptions.append(f"{elem_type} {placement}")

    elements_text = ""
    if element_descriptions:
        elements_text = " Elements include: " + "; ".join(element_descriptions[:15]) + "."

    # Assemble the final prompt
    prompt_parts = [
        f"A high-fidelity UI mockup screenshot of a {hub_name} page",
        f"for a {layout_hint}.",
        f"{style_tokens}, {background_hint},",
        f"primary color {primary_color}, accent color {accent_color},",
        f"heading font {heading_font}, body font {body_font}.",
    ]

    if hub_description:
        prompt_parts.append(f"Page purpose: {hub_description}.")

    if elements_text:
        prompt_parts.append(elements_text)

    prompt_parts.append(
        "Pixel-perfect, high resolution, professional web design, "
        "no watermarks, no lorem ipsum, realistic UI content, "
        "sharp text rendering, consistent spacing and alignment."
    )

    return " ".join(prompt_parts)


def _describe_position(x: float, y: float, w: float, h: float) -> str:
    """Convert pixel coordinates into a rough natural-language placement.

    Uses a simple heuristic based on relative position within a typical
    page layout.
    """
    if y < 80:
        vertical = "at the top"
    elif y < 300:
        vertical = "in the upper section"
    elif y < 600:
        vertical = "in the middle section"
    else:
        vertical = "in the lower section"

    if x < 200:
        horizontal = "on the left"
    elif x < 800:
        horizontal = "in the center"
    else:
        horizontal = "on the right"

    if w > 900:
        size_hint = "(full-width)"
    elif w > 400:
        size_hint = "(wide)"
    else:
        size_hint = ""

    parts = [vertical, horizontal]
    if size_hint:
        parts.append(size_hint)
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Image generation
# ---------------------------------------------------------------------------


def _resolve_dimensions(plan: dict) -> tuple[int, int]:
    """Extract target resolution from plan, clamped to safe range.

    Spec Section 9: default 1024x1024, max 2048x2048.
    The user prompt mentions 1440x900 as an alternate default — the plan's
    engineConfig.targetResolution takes precedence when present.
    """
    engine_config: dict = plan.get("engineConfig", {})
    target_res: dict = engine_config.get("targetResolution", {})

    width = target_res.get("width", _DEFAULT_WIDTH)
    height = target_res.get("height", _DEFAULT_HEIGHT)

    # Clamp to spec limits
    width = max(256, min(int(width), _MAX_RESOLUTION))
    height = max(256, min(int(height), _MAX_RESOLUTION))

    return width, height


def generate_hub_image(
    hub: dict,
    plan: dict,
    project_id: str,
    version: int,
    output_dir: str = "/outputs",
) -> dict:
    """Generate a UI mockup image for a single hub using FLUX.2 Klein.

    Steps:
      1. Build the FLUX.2 prompt from hub plan
      2. Load the FLUX.2 Klein pipeline (cached after first load)
      3. Generate the image with specified dimensions
      4. Save to output volume
      5. Return metadata

    Args:
        hub: Hub dict matching HubPlan schema.
        plan: Full plan dict matching PrismPlan schema.
        project_id: Project UUID.
        version: Graph version number.
        output_dir: Root output directory (Modal volume mount point).

    Returns:
        Dict with keys:
          hubId, imagePath, r2Key, dimensions, generationTimeMs, prompt
    """
    import torch

    hub_id: str = hub["id"]

    # 1. Build prompt
    prompt = build_flux_prompt(hub, plan)
    logger.info("Generating image for hub %s (project %s, v%d)", hub_id, project_id, version)
    logger.debug("FLUX prompt: %s", prompt)

    # 2. Load pipeline (cached)
    pipe = _get_flux_pipeline()

    # 3. Generate at target resolution
    width, height = _resolve_dimensions(plan)

    start = time.monotonic()

    with torch.inference_mode():
        result = pipe(
            prompt=prompt,
            width=width,
            height=height,
            num_inference_steps=4,  # Klein is a distilled model, 4 steps suffice
            guidance_scale=0.0,  # Klein uses guidance-free distillation
        )

    image = result.images[0]
    generation_time_ms = int((time.monotonic() - start) * 1000)

    # 4. Save to output volume
    # R2 path convention: {projectId}/{version}/images/hub-{hubId}.png
    r2_key = f"{project_id}/{version}/images/hub-{hub_id}.png"
    local_dir = Path(output_dir) / project_id / str(version) / "images"
    local_dir.mkdir(parents=True, exist_ok=True)
    local_path = local_dir / f"hub-{hub_id}.png"

    image.save(str(local_path), format="PNG")
    file_size = local_path.stat().st_size

    logger.info(
        "Hub %s image saved: %s (%dx%d, %d bytes, %dms)",
        hub_id, local_path, width, height, file_size, generation_time_ms,
    )

    # 5. Return metadata
    return {
        "hubId": hub_id,
        "imagePath": str(local_path),
        "r2Key": r2_key,
        "dimensions": {"width": width, "height": height},
        "generationTimeMs": generation_time_ms,
        "prompt": prompt,
    }


def generate_all_hub_images(plan: dict, project_id: str, version: int) -> list[dict]:
    """Generate images for all hubs in the plan.

    Iterates over plan.graph.hubs and generates one FLUX.2 image per hub.
    Style consistency across hubs is maintained via the shared visual style
    tokens in the prompt (same color scheme, design language, typography).

    Args:
        plan: Full plan dict matching PrismPlan schema.
        project_id: Project UUID.
        version: Graph version number.

    Returns:
        List of image result dicts, one per hub.
    """
    graph_plan: dict = plan.get("graph", {})
    hubs: list[dict] = graph_plan.get("hubs", [])

    if not hubs:
        logger.warning("Plan has no hubs — nothing to generate (project %s)", project_id)
        return []

    logger.info(
        "Generating images for %d hub(s) (project %s, v%d)",
        len(hubs), project_id, version,
    )

    results: list[dict] = []
    for hub in hubs:
        result = generate_hub_image(
            hub=hub,
            plan=plan,
            project_id=project_id,
            version=version,
        )
        results.append(result)

    total_time_ms = sum(r["generationTimeMs"] for r in results)
    logger.info(
        "All %d hub images generated in %dms total (project %s, v%d)",
        len(results), total_time_ms, project_id, version,
    )

    return results
