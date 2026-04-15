"""Planning utilities for Prism pipeline.

Handles intent parsing, inferred needs mapping, and plan generation.
These run on Modal CPU with Anthropic API calls.

INVARIANT 4: Contract-first — tRPC/Zod schemas are generated DURING planning,
BEFORE any code generation begins.
"""

import json
import os
import time
from typing import Any


# --- Intent Parsing ---

def parse_intent(prompt: str, app_context: dict | None = None) -> dict:
    """Parse a natural language prompt into a structured AppIntent.

    Uses Claude to analyze the prompt and extract:
    - appType (landing-page, saas-dashboard, e-commerce, etc.)
    - features (must-have, should-have, nice-to-have)
    - visualStyle (colors, typography, design language)
    - integrations (third-party services)
    - contentStrategy (static, dynamic, real-time)
    - commercialClassification (personal, commercial, enterprise)
    - confidenceScore (0-1)
    - ambiguities (unresolved questions)
    - reasoning (chain-of-thought explanation)

    Returns an AppIntent dict.
    """
    import httpx

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is required")

    system_prompt = """You are an expert UI/UX analyst for Kriptik Prism, an AI app builder.
Analyze the user's app description and extract a structured intent.

You MUST respond with valid JSON matching this schema:
{
  "description": "string — refined description of what the user wants",
  "appType": "landing-page|saas-dashboard|e-commerce|portfolio|blog|social-platform|marketplace|crm|project-management|analytics-dashboard|ai-tool|video-platform|messaging-app|booking-system|documentation|admin-panel|custom",
  "platform": "web|mobile-web|desktop",
  "features": [{ "name": "string", "description": "string", "priority": "must-have|should-have|nice-to-have", "category": "frontend|backend|integration|infrastructure", "inferredFrom": "user-input", "acceptanceCriteria": ["string"] }],
  "visualStyle": {
    "colorScheme": "light|dark|auto",
    "primaryColor": "#hex",
    "accentColor": "#hex",
    "typography": { "headingFont": "string", "bodyFont": "string", "monoFont": "string" },
    "designLanguage": "minimal|glassmorphism|neobrutalism|material|corporate|playful|editorial|custom",
    "referenceUrls": [],
    "extractedTokens": null
  },
  "integrations": [{ "serviceId": "string", "purpose": "string", "requiredScopes": [], "credentialStatus": "pending" }],
  "contentStrategy": "static|dynamic|real-time",
  "commercialClassification": "personal|commercial|enterprise",
  "confidenceScore": 0.0,
  "ambiguities": ["string"],
  "reasoning": "string — your chain-of-thought analysis"
}

Be thorough. The reasoning field should come FIRST in your thinking — analyze before structuring.
Infer reasonable defaults for anything not explicitly specified."""

    # Structured output via tool_use — guarantees 100% schema compliance
    # (Spec: "Use Anthropic's native tool_use with the AppIntent schema")
    app_intent_tool = {
        "name": "submit_app_intent",
        "description": "Submit the structured AppIntent parsed from the user's prompt.",
        "input_schema": {
            "type": "object",
            "required": [
                "reasoning", "description", "appType", "platform", "features",
                "visualStyle", "contentStrategy", "commercialClassification",
                "confidenceScore", "ambiguities",
            ],
            "properties": {
                "reasoning": {"type": "string", "description": "Chain-of-thought analysis — think step by step BEFORE committing to structured fields"},
                "description": {"type": "string"},
                "appType": {"type": "string", "enum": [
                    "landing-page", "saas-dashboard", "e-commerce", "portfolio",
                    "blog", "social-platform", "marketplace", "crm",
                    "project-management", "analytics-dashboard", "ai-tool",
                    "video-platform", "messaging-app", "booking-system",
                    "documentation", "admin-panel", "custom",
                ]},
                "platform": {"type": "string", "enum": ["web", "mobile-web", "desktop"]},
                "features": {"type": "array", "items": {
                    "type": "object",
                    "required": ["name", "description", "priority", "category", "inferredFrom", "acceptanceCriteria"],
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "priority": {"type": "string", "enum": ["must-have", "should-have", "nice-to-have"]},
                        "category": {"type": "string", "enum": ["frontend", "backend", "integration", "infrastructure"]},
                        "inferredFrom": {"type": "string", "enum": ["user-input", "competitive-analysis", "domain-knowledge", "security"]},
                        "acceptanceCriteria": {"type": "array", "items": {"type": "string"}},
                    },
                }},
                "visualStyle": {"type": "object", "properties": {
                    "colorScheme": {"type": "string", "enum": ["light", "dark", "auto"]},
                    "primaryColor": {"type": "string"},
                    "accentColor": {"type": "string"},
                    "typography": {"type": "object", "properties": {
                        "headingFont": {"type": "string"},
                        "bodyFont": {"type": "string"},
                        "monoFont": {"type": "string"},
                    }},
                    "designLanguage": {"type": "string", "enum": [
                        "minimal", "glassmorphism", "neobrutalism", "material",
                        "corporate", "playful", "editorial", "custom",
                    ]},
                    "referenceUrls": {"type": "array", "items": {"type": "string"}},
                    "extractedTokens": {"type": ["object", "null"]},
                }},
                "integrations": {"type": "array", "items": {
                    "type": "object",
                    "properties": {
                        "serviceId": {"type": "string"},
                        "purpose": {"type": "string"},
                        "requiredScopes": {"type": "array", "items": {"type": "string"}},
                        "credentialStatus": {"type": "string", "enum": ["connected", "pending", "missing"]},
                    },
                }},
                "contentStrategy": {"type": "string", "enum": ["static", "dynamic", "real-time"]},
                "commercialClassification": {"type": "string", "enum": ["personal", "commercial", "enterprise"]},
                "confidenceScore": {"type": "number", "minimum": 0, "maximum": 1},
                "ambiguities": {"type": "array", "items": {"type": "string"}},
            },
        },
    }

    response = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": "claude-opus-4-20250514",
            "max_tokens": 4096,
            "system": system_prompt,
            "tools": [app_intent_tool],
            "tool_choice": {"type": "tool", "name": "submit_app_intent"},
            "messages": [
                {
                    "role": "user",
                    "content": f"Build me an app: {prompt}"
                    + (f"\n\nAdditional context: {json.dumps(app_context)}" if app_context else ""),
                }
            ],
        },
        timeout=120,
    )
    response.raise_for_status()

    result = response.json()

    # Extract structured output from tool_use response
    for block in result.get("content", []):
        if block.get("type") == "tool_use" and block.get("name") == "submit_app_intent":
            return block["input"]

    # Fallback: try text extraction if tool_use didn't fire
    for block in result.get("content", []):
        if block.get("type") == "text":
            return _extract_json(block["text"])

    raise ValueError("No AppIntent produced from intent parsing")


# --- Inferred Needs Mapping ---

# Domain knowledge: common needs per app type.
# Expanded from the 20 app type dependency trees in domain-knowledge.ts.
DOMAIN_NEEDS: dict[str, list[dict]] = {
    "landing-page": [
        {"name": "SEO meta tags", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Responsive hero section", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Social proof section", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "CTA optimization", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Analytics tracking", "source": "domain-knowledge", "priority": "should-have"},
    ],
    "saas-dashboard": [
        {"name": "Authentication flow", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Sidebar navigation", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Data visualization", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "User settings page", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "Role-based access", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "API key management", "source": "domain-knowledge", "priority": "nice-to-have"},
    ],
    "e-commerce": [
        {"name": "Product catalog", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Shopping cart", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Checkout flow", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Payment processing", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Order tracking", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "Product search", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "Wishlist", "source": "domain-knowledge", "priority": "nice-to-have"},
    ],
    "portfolio": [
        {"name": "Project gallery", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Contact form", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "About section", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Resume/CV download", "source": "domain-knowledge", "priority": "should-have"},
    ],
    "blog": [
        {"name": "Article listing", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Article detail view", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Category filtering", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "Search", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "RSS feed", "source": "domain-knowledge", "priority": "nice-to-have"},
    ],
    "social-platform": [
        {"name": "User profiles", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Feed/timeline", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Post creation", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Notifications", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "Direct messaging", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "Content moderation", "source": "domain-knowledge", "priority": "should-have"},
    ],
    "marketplace": [
        {"name": "Listing creation", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Search and filters", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Seller profiles", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Transaction flow", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Reviews and ratings", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "Dispute resolution", "source": "domain-knowledge", "priority": "should-have"},
    ],
    "crm": [
        {"name": "Contact management", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Deal pipeline", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Activity timeline", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "Email integration", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "Reporting", "source": "domain-knowledge", "priority": "should-have"},
    ],
    "project-management": [
        {"name": "Task boards", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Team members", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Timeline/Gantt", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "File attachments", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "Notifications", "source": "domain-knowledge", "priority": "should-have"},
    ],
    "analytics-dashboard": [
        {"name": "Chart widgets", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Data source connections", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Date range filtering", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Export functionality", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "Custom dashboards", "source": "domain-knowledge", "priority": "should-have"},
    ],
    "ai-tool": [
        {"name": "Input interface", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Processing indicator", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Result display", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "History/saved results", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "Usage tracking", "source": "domain-knowledge", "priority": "should-have"},
    ],
    "video-platform": [
        {"name": "Video player", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Video listing/browse", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Upload flow", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Comments", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "Playlists", "source": "domain-knowledge", "priority": "nice-to-have"},
    ],
    "messaging-app": [
        {"name": "Chat interface", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Contact list", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Real-time messages", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Read receipts", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "File sharing", "source": "domain-knowledge", "priority": "should-have"},
    ],
    "booking-system": [
        {"name": "Calendar view", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Booking form", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Availability management", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Confirmation flow", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Reminders", "source": "domain-knowledge", "priority": "should-have"},
    ],
    "documentation": [
        {"name": "Navigation sidebar", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Search", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Code blocks", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Table of contents", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "Version selector", "source": "domain-knowledge", "priority": "nice-to-have"},
    ],
    "admin-panel": [
        {"name": "User management", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Data tables", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "CRUD operations", "source": "domain-knowledge", "priority": "must-have"},
        {"name": "Audit log", "source": "domain-knowledge", "priority": "should-have"},
        {"name": "Settings management", "source": "domain-knowledge", "priority": "should-have"},
    ],
    "custom": [],
}

# Security needs inferred for commercial/enterprise apps
SECURITY_NEEDS: list[dict] = [
    {"name": "Input validation", "source": "security", "priority": "must-have"},
    {"name": "CSRF protection", "source": "security", "priority": "must-have"},
    {"name": "XSS prevention", "source": "security", "priority": "must-have"},
    {"name": "Rate limiting", "source": "security", "priority": "must-have"},
    {"name": "Content Security Policy", "source": "security", "priority": "should-have"},
]


def map_inferred_needs(intent: dict) -> list[dict]:
    """Map an AppIntent to inferred needs using domain knowledge.

    Steps:
    1. Look up domain needs for the app type
    2. Add security needs if commercial/enterprise
    3. Add UX best practice needs
    4. Deduplicate against user-specified features
    5. Return as InferredNeed list

    Returns: [{ "name": str, "description": str, "source": str, "priority": str, "features": [...] }]
    """
    app_type = intent.get("appType", "custom")
    classification = intent.get("commercialClassification", "personal")
    user_features = {f["name"].lower() for f in intent.get("features", [])}

    needs: list[dict] = []

    # Domain knowledge needs
    domain_list = DOMAIN_NEEDS.get(app_type, [])
    for need in domain_list:
        if need["name"].lower() not in user_features:
            needs.append({
                "name": need["name"],
                "description": f"Standard {app_type} requirement: {need['name']}",
                "source": need["source"],
                "priority": need["priority"],
                "features": [
                    {
                        "name": need["name"],
                        "description": f"Auto-inferred from {app_type} domain knowledge",
                        "priority": need["priority"],
                        "category": "frontend",
                        "inferredFrom": "domain-knowledge",
                        "acceptanceCriteria": [f"{need['name']} is functional and accessible"],
                    }
                ],
            })

    # Security needs for commercial/enterprise
    if classification in ("commercial", "enterprise"):
        for sec_need in SECURITY_NEEDS:
            if sec_need["name"].lower() not in user_features:
                needs.append({
                    "name": sec_need["name"],
                    "description": f"Security requirement: {sec_need['name']}",
                    "source": sec_need["source"],
                    "priority": sec_need["priority"],
                    "features": [
                        {
                            "name": sec_need["name"],
                            "description": f"Security requirement for {classification} apps",
                            "priority": sec_need["priority"],
                            "category": "infrastructure",
                            "inferredFrom": "security",
                            "acceptanceCriteria": [f"{sec_need['name']} is implemented"],
                        }
                    ],
                })

    # UX best practices
    ux_needs = [
        {"name": "Loading states", "description": "Skeleton screens and loading indicators for async operations"},
        {"name": "Error handling UI", "description": "User-friendly error messages and recovery flows"},
        {"name": "Responsive layout", "description": "Mobile-friendly responsive design"},
    ]
    for ux in ux_needs:
        if ux["name"].lower() not in user_features:
            needs.append({
                "name": ux["name"],
                "description": ux["description"],
                "source": "ux-best-practice",
                "priority": "should-have",
                "features": [
                    {
                        "name": ux["name"],
                        "description": ux["description"],
                        "priority": "should-have",
                        "category": "frontend",
                        "inferredFrom": "domain-knowledge",
                        "acceptanceCriteria": [f"{ux['name']} implemented"],
                    }
                ],
            })

    return needs


# --- Plan Generation ---

def generate_plan(
    intent: dict,
    inferred_needs: list[dict],
    project_id: str,
    competitive_analysis: dict | None = None,
) -> dict:
    """Generate a complete PrismPlan from intent and inferred needs.

    Uses Claude Opus to produce:
    - PrismGraphPlan (hubs, elements, shared components, navigation)
    - BackendContract (tRPC router + Zod schemas) — INVARIANT 4: generated BEFORE code gen
    - Cost/time estimates

    Returns a PrismPlan dict.
    """
    import httpx

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is required")

    all_features = intent.get("features", [])
    for need in inferred_needs:
        all_features.extend(need.get("features", []))

    system_prompt = """You are an expert application architect for Kriptik Prism.
Given an app intent and feature list, generate a complete build plan.

CRITICAL RULES:
1. Every element caption MUST be self-contained — fully describe the element's appearance,
   behavior, dimensions, colors, typography, and interactions WITHOUT referencing other elements.
   Test: "Could an engineer who has never seen the rest of the app implement this from the caption alone?"
2. The backend contract (tRPC router + Zod schemas) MUST be included in the plan.
   This is generated BEFORE any code generation begins.
3. Shared components (nav, footer) exist ONCE canonically with per-hub overrides.
4. Hubs are pages. Elements are UI components within pages.

Respond with valid JSON matching this schema:
{
  "graph": {
    "hubs": [{
      "id": "hub_xxx",
      "name": "string",
      "route": "/path",
      "description": "string",
      "layoutTemplate": "single-column|two-column|sidebar|dashboard|fullscreen",
      "authRequired": false,
      "elements": [{
        "id": "elem_xxx",
        "type": "UIElementType",
        "caption": "SELF-CONTAINED caption — full visual + behavioral spec in text",
        "position": { "x": 0, "y": 0, "width": 100, "height": 50 },
        "textContent": [{ "text": "string", "role": "heading|body|label|placeholder|caption", "renderMethod": "sharp-svg|msdf|diffusion", "typography": { "fontFamily": "Inter", "fontSize": 16, "fontWeight": 400, "color": "#000" }, "position": { "x": 0, "y": 0, "anchor": "left" } }],
        "interactions": [{ "event": "click|hover|focus|submit|change", "action": "navigate|toggle|submit|open-modal|close-modal|api-call|state-update|animation|custom", "targetHubId": "optional", "targetNodeId": "optional", "payload": {} }],
        "isShared": false
      }]
    }],
    "sharedComponents": [{
      "id": "shared_xxx",
      "name": "string",
      "type": "UIElementType",
      "caption": "SELF-CONTAINED caption",
      "hubIds": ["hub_xxx"],
      "overridesPerHub": {}
    }],
    "dataModels": [{
      "name": "string",
      "fields": [{ "name": "string", "type": "string", "required": true, "unique": false }],
      "relations": [],
      "indexes": []
    }],
    "services": [],
    "navigationGraph": [{ "sourceHubId": "string", "targetHubId": "string", "trigger": "string" }]
  },
  "backendContract": {
    "tRPCRouter": "TypeScript tRPC router type definition as string",
    "zodSchemas": "Zod schema definitions as string",
    "dataModels": [],
    "apiEndpoints": [{ "method": "GET|POST|PUT|DELETE", "path": "/api/...", "description": "string", "auth": false, "inputSchema": "ZodSchemaName", "outputSchema": "ZodSchemaName", "implementation": "generated|template|integration" }],
    "authStrategy": { "type": "session|jwt|api-key|oauth|none", "providers": [], "sessionDuration": 86400, "refreshStrategy": "sliding" },
    "deploymentTargets": ["cloudflare-workers"]
  },
  "estimatedCost": 0.15,
  "estimatedTimeSeconds": 120
}"""

    user_message = f"""App Intent:
{json.dumps(intent, indent=2)}

All Features (user + inferred):
{json.dumps(all_features, indent=2)}

Visual Style:
{json.dumps(intent.get('visualStyle', {}), indent=2)}

{f'Competitive Analysis: {json.dumps(competitive_analysis, indent=2)}' if competitive_analysis else ''}

Generate the complete build plan. Remember: every element caption must be SELF-CONTAINED."""

    response = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": "claude-opus-4-20250514",
            "max_tokens": 16384,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_message}],
        },
        timeout=120,
    )
    response.raise_for_status()

    result = response.json()
    content = result["content"][0]["text"]
    plan_data = _extract_json(content)

    # Wrap into full PrismPlan structure
    plan: dict[str, Any] = {
        "id": f"plan_{_generate_id()}",
        "projectId": project_id,
        "prompt": intent.get("description", ""),
        "intent": intent,
        "competitiveAnalysis": competitive_analysis,
        "inferredNeeds": inferred_needs,
        "graph": plan_data.get("graph", {}),
        "backendContract": plan_data.get("backendContract", {}),
        "estimatedCost": plan_data.get("estimatedCost", 0.15),
        "estimatedTimeSeconds": plan_data.get("estimatedTimeSeconds", 120),
        "status": "pending",
    }

    return plan


def regenerate_plan_with_feedback(
    previous_plan: dict,
    feedback: str,
) -> dict:
    """Regenerate a plan incorporating user rejection feedback.

    Keeps the same intent but adjusts the graph plan based on feedback.
    """
    import httpx

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is required")

    response = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": "claude-opus-4-20250514",
            "max_tokens": 16384,
            "system": "You are an application architect. Revise the build plan based on user feedback. Respond with the complete revised plan as valid JSON.",
            "messages": [
                {
                    "role": "user",
                    "content": f"Previous plan:\n{json.dumps(previous_plan, indent=2)}\n\nUser feedback:\n{feedback}\n\nRevise the plan. Keep the same JSON schema.",
                }
            ],
        },
        timeout=120,
    )
    response.raise_for_status()

    result = response.json()
    content = result["content"][0]["text"]
    revised = _extract_json(content)

    # Preserve metadata
    revised["id"] = previous_plan["id"]
    revised["projectId"] = previous_plan["projectId"]
    revised["prompt"] = previous_plan["prompt"]
    revised["intent"] = previous_plan["intent"]
    revised["status"] = "pending"

    return revised


# --- Dependency Pre-installation ---

def analyze_dependencies(plan: dict) -> list[str]:
    """Analyze a plan and determine which npm packages need pre-installation.

    Examines:
    - Element types (chart -> chart.js, map -> maplibre-gl, etc.)
    - Integrations (stripe, auth providers, etc.)
    - Backend targets (deployment-specific packages)

    Returns list of npm package names to pre-install.
    """
    deps: set[str] = set()

    # Always needed
    deps.add("pixi.js@8")
    deps.add("gsap")

    # Scan element types across all hubs
    for hub in plan.get("graph", {}).get("hubs", []):
        for elem in hub.get("elements", []):
            elem_type = elem.get("type", "")
            if elem_type in ("chart", "graph"):
                deps.add("chart.js")
            elif elem_type == "map":
                deps.add("maplibre-gl")
            elif elem_type in ("video-player", "audio-player"):
                deps.add("hls.js")
            elif elem_type == "carousel":
                deps.add("embla-carousel")

    # Backend dependencies
    contract = plan.get("backendContract", {})
    if contract:
        deps.add("@trpc/server")
        deps.add("zod")
        deps.add("drizzle-orm")

    auth_type = contract.get("authStrategy", {}).get("type", "none")
    if auth_type == "oauth":
        deps.add("arctic")
    elif auth_type == "jwt":
        deps.add("jose")

    # Integrations
    for integration in plan.get("intent", {}).get("integrations", []):
        service_id = integration.get("serviceId", "")
        if "stripe" in service_id:
            deps.add("stripe")
        elif "resend" in service_id or "email" in service_id:
            deps.add("resend")

    return sorted(deps)


def preinstall_dependencies(plan: dict) -> dict:
    """Pre-install npm dependencies that will be needed during assembly.

    Runs npm install in the output volume so packages are cached
    for the assembly worker.

    Returns: { "installed": [str], "failed": [str], "timeMs": int }
    """
    import subprocess

    deps = analyze_dependencies(plan)
    start = time.time()

    installed: list[str] = []
    failed: list[str] = []

    if deps:
        install_dir = "/outputs/_deps"
        os.makedirs(install_dir, exist_ok=True)

        # Write a minimal package.json
        pkg = {"name": "prism-deps", "private": True, "dependencies": {}}
        for dep in deps:
            # Split name@version
            if "@" in dep and not dep.startswith("@"):
                name, version = dep.rsplit("@", 1)
            elif dep.startswith("@") and dep.count("@") > 1:
                name, version = dep.rsplit("@", 1)
            else:
                name, version = dep, "latest"
            pkg["dependencies"][name] = version

        pkg_path = os.path.join(install_dir, "package.json")
        with open(pkg_path, "w") as f:
            json.dump(pkg, f)

        try:
            result = subprocess.run(
                ["npm", "install", "--production"],
                cwd=install_dir,
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode == 0:
                installed = deps
            else:
                # Try installing one by one to find failures
                for dep in deps:
                    try:
                        subprocess.run(
                            ["npm", "install", dep, "--production"],
                            cwd=install_dir,
                            capture_output=True,
                            text=True,
                            timeout=30,
                        )
                        installed.append(dep)
                    except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
                        failed.append(dep)
        except subprocess.TimeoutExpired:
            failed = deps

    elapsed_ms = int((time.time() - start) * 1000)
    return {"installed": installed, "failed": failed, "timeMs": elapsed_ms}


# --- Utilities ---

def _extract_json(text: str) -> dict:
    """Extract JSON from a response that may contain markdown fences."""
    # Try direct parse first
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting from markdown code fence
    if "```json" in text:
        start = text.index("```json") + 7
        end = text.index("```", start)
        return json.loads(text[start:end].strip())
    elif "```" in text:
        start = text.index("```") + 3
        end = text.index("```", start)
        return json.loads(text[start:end].strip())

    # Try finding first { to last }
    first_brace = text.index("{")
    last_brace = text.rindex("}") + 1
    return json.loads(text[first_brace:last_brace])


def _generate_id() -> str:
    """Generate a short unique ID."""
    import uuid
    return uuid.uuid4().hex[:12]
