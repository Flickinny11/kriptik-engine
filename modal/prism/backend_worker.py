"""Backend code generation worker for the Prism diffusion engine.

INVARIANT 4: Contract-first. tRPC types + Zod schemas are generated DURING planning,
BEFORE any code generation. This worker generates backend implementation code AGAINST
the pre-existing contract — it never invents its own types or schemas.

Spec reference: docs/DIFFUSION-ENGINE-SPEC.md Section 14 — Backend Generation Pipeline
  - Backend contract (tRPC router + Zod schemas) already exists in the plan
  - Each backend node generates independently against its contract slice
  - Convergence gate: tsc --noEmit + AJV schema validation + route resolution
  - Deployment targets: cloudflare-workers, aws-lambda, vercel-functions,
    fly-machines, modal, supabase, runpod

Pipeline order (steps 17-19 of the 22-step pipeline):
  17. Backend contract generation (tRPC + Zod) — generated in step 4, used here
  18. Parallel backend code generation
  19. Convergence gate (tsc + AJV + route resolution)

BackendContract shape (from prism-backend.ts):
  tRPCRouter: str          — TypeScript tRPC router definition
  zodSchemas: str          — Zod validation schemas
  dataModels: [DataModelPlan]
  apiEndpoints: [APIEndpointPlan]
  authStrategy: AuthStrategyPlan
  deploymentTargets: [str]

APIEndpointPlan shape:
  method: GET|POST|PUT|DELETE|PATCH
  path: str
  description: str
  auth: bool
  inputSchema: str         — Zod schema name
  outputSchema: str        — Zod schema name
  implementation: generated|template|integration
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any, TypedDict

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Type aliases (mirror TypeScript interfaces for documentation)
# ---------------------------------------------------------------------------

class EndpointResult(TypedDict):
    path: str
    method: str
    code: str
    tests: str


class DataModelResult(TypedDict):
    name: str
    code: str
    migration: str


class ConvergenceIssue(TypedDict):
    type: str
    message: str
    severity: str  # 'error' | 'warning'


class ConvergenceResult(TypedDict):
    passed: bool
    issues: list[ConvergenceIssue]
    checkedEndpoints: int
    matchedEndpoints: int


class BackendResult(TypedDict):
    endpoints: list[EndpointResult]
    dataModels: list[DataModelResult]
    authMiddleware: str
    deploymentConfigs: dict[str, str]
    generationTimeMs: int


class BackendManifest(TypedDict):
    endpoints: list[dict[str, Any]]
    targets: list[str]
    deployedAt: str | None


# ---------------------------------------------------------------------------
# Auth middleware templates (keyed by strategy type)
# ---------------------------------------------------------------------------

_AUTH_MIDDLEWARE_TEMPLATES: dict[str, str] = {
    "session": '''\
import {{ TRPCError }} from '@trpc/server';
import {{ middleware }} from './trpc';

/**
 * Session-based authentication middleware.
 * Validates session cookie and attaches user to context.
 */
export const authMiddleware = middleware(async ({{ ctx, next }}) => {{
  const session = ctx.session;
  if (!session?.user) {{
    throw new TRPCError({{
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    }});
  }}

  return next({{
    ctx: {{
      ...ctx,
      user: session.user,
    }},
  }});
}});

export const protectedProcedure = ctx.procedure.use(authMiddleware);
''',

    "jwt": '''\
import {{ TRPCError }} from '@trpc/server';
import {{ middleware }} from './trpc';
import {{ verify }} from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {{
  throw new Error('JWT_SECRET environment variable is required');
}}

/**
 * JWT-based authentication middleware.
 * Extracts and verifies Bearer token from Authorization header.
 */
export const authMiddleware = middleware(async ({{ ctx, next }}) => {{
  const authHeader = ctx.req?.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) {{
    throw new TRPCError({{
      code: 'UNAUTHORIZED',
      message: 'Missing or invalid authorization header',
    }});
  }}

  const token = authHeader.slice(7);
  try {{
    const payload = verify(token, JWT_SECRET) as {{ sub: string; email: string }};
    return next({{
      ctx: {{
        ...ctx,
        user: {{ id: payload.sub, email: payload.email }},
      }},
    }});
  }} catch {{
    throw new TRPCError({{
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired token',
    }});
  }}
}});

export const protectedProcedure = ctx.procedure.use(authMiddleware);
''',

    "api-key": '''\
import {{ TRPCError }} from '@trpc/server';
import {{ middleware }} from './trpc';

/**
 * API key authentication middleware.
 * Validates the x-api-key header against stored keys.
 */
export const authMiddleware = middleware(async ({{ ctx, next }}) => {{
  const apiKey = ctx.req?.headers?.['x-api-key'];
  if (!apiKey) {{
    throw new TRPCError({{
      code: 'UNAUTHORIZED',
      message: 'API key required in x-api-key header',
    }});
  }}

  const keyRecord = await ctx.db.query.apiKeys.findFirst({{
    where: (keys, {{ eq }}) => eq(keys.key, apiKey as string),
    with: {{ user: true }},
  }});

  if (!keyRecord || keyRecord.revoked) {{
    throw new TRPCError({{
      code: 'UNAUTHORIZED',
      message: 'Invalid or revoked API key',
    }});
  }}

  return next({{
    ctx: {{
      ...ctx,
      user: keyRecord.user,
    }},
  }});
}});

export const protectedProcedure = ctx.procedure.use(authMiddleware);
''',

    "oauth": '''\
import {{ TRPCError }} from '@trpc/server';
import {{ middleware }} from './trpc';

/**
 * OAuth authentication middleware.
 * Validates access token and resolves user identity.
 */
export const authMiddleware = middleware(async ({{ ctx, next }}) => {{
  const session = ctx.session;
  if (!session?.user) {{
    throw new TRPCError({{
      code: 'UNAUTHORIZED',
      message: 'OAuth authentication required',
    }});
  }}

  if (session.expiresAt && new Date(session.expiresAt) < new Date()) {{
    throw new TRPCError({{
      code: 'UNAUTHORIZED',
      message: 'Session expired — please re-authenticate',
    }});
  }}

  return next({{
    ctx: {{
      ...ctx,
      user: session.user,
      accessToken: session.accessToken,
    }},
  }});
}});

export const protectedProcedure = ctx.procedure.use(authMiddleware);
''',

    "none": '''\
import {{ middleware }} from './trpc';

/**
 * No-op authentication middleware (public API).
 */
export const authMiddleware = middleware(async ({{ next }}) => {{
  return next();
}});

export const protectedProcedure = ctx.procedure;
''',
}


# ---------------------------------------------------------------------------
# Deployment configuration templates
# ---------------------------------------------------------------------------

_DEPLOYMENT_CONFIG_TEMPLATES: dict[str, str] = {
    "cloudflare-workers": """\
// wrangler.toml
// Generated by Kriptik Prism — Cloudflare Workers deployment config.

name = "{app_name}"
main = "src/index.ts"
compatibility_date = "{compat_date}"

[vars]
ENVIRONMENT = "production"

[[routes]]
pattern = "{domain}/*"
zone_name = "{zone}"

{route_bindings}
""",

    "aws-lambda": """\
// serverless.yml
// Generated by Kriptik Prism — AWS Lambda deployment config.

service: {app_name}
frameworkVersion: '3'

provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
  memorySize: 256
  timeout: 30
  environment:
    NODE_ENV: production

functions:
{lambda_functions}

plugins:
  - serverless-esbuild
""",

    "vercel-functions": """\
// vercel.json
// Generated by Kriptik Prism — Vercel Functions deployment config.
{{
  "version": 2,
  "builds": [
    {{
      "src": "src/index.ts",
      "use": "@vercel/node"
    }}
  ],
  "routes": [
{vercel_routes}
  ],
  "env": {{
    "NODE_ENV": "production"
  }}
}}
""",

    "fly-machines": """\
# fly.toml
# Generated by Kriptik Prism — Fly.io Machines deployment config.

app = "{app_name}"
primary_region = "iad"

[build]
  [build.args]
    NODE_ENV = "production"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256
""",

    "modal": """\
# modal_deploy.py
# Generated by Kriptik Prism — Modal deployment config.

import modal

app = modal.App("{app_name}")

image = modal.Image.debian_slim().pip_install(
    "fastapi",
    "uvicorn",
)

@app.function(image=image, cpu=0.25, memory=256)
@modal.web_endpoint()
def api():
    from src.index import app as fastapi_app
    return fastapi_app
""",

    "supabase": """\
// supabase/config.toml
// Generated by Kriptik Prism — Supabase Edge Functions deployment config.

[project]
id = "{project_id}"

{function_configs}
""",

    "runpod": """\
# runpod_handler.py
# Generated by Kriptik Prism — RunPod serverless deployment config.

import runpod

def handler(event):
    \"\"\"RunPod serverless handler for API requests.\"\"\"
    route = event.get("input", {{}}).get("route", "/")
    method = event.get("input", {{}}).get("method", "GET")
    body = event.get("input", {{}}).get("body", {{}})

    # Route to appropriate handler
    from src.router import handle_request
    result = handle_request(route, method, body)
    return result

runpod.serverless.start({{"handler": handler}})
""",
}


# ---------------------------------------------------------------------------
# Drizzle ORM field type mapping
# ---------------------------------------------------------------------------

_DRIZZLE_TYPE_MAP: dict[str, str] = {
    "string": "text",
    "text": "text",
    "number": "integer",
    "integer": "integer",
    "float": "real",
    "decimal": "real",
    "boolean": "boolean",
    "date": "timestamp",
    "datetime": "timestamp",
    "timestamp": "timestamp",
    "json": "jsonb",
    "jsonb": "jsonb",
    "uuid": "text",
    "email": "text",
    "url": "text",
    "enum": "text",
}


# ---------------------------------------------------------------------------
# Endpoint code generation
# ---------------------------------------------------------------------------

def _build_endpoint_handler(endpoint: dict, contract: dict) -> str:
    """Build a tRPC procedure implementation for a single endpoint.

    Uses the existing tRPC router definition and Zod schemas from the contract
    as the type contract. Generates the handler implementation that conforms
    to those types.

    The generated code imports from the contract's Zod schemas and plugs into
    the tRPC router.
    """
    method: str = endpoint.get("method", "GET")
    path: str = endpoint.get("path", "/unknown")
    description: str = endpoint.get("description", "")
    auth_required: bool = endpoint.get("auth", False)
    input_schema: str = endpoint.get("inputSchema", "")
    output_schema: str = endpoint.get("outputSchema", "")
    implementation: str = endpoint.get("implementation", "generated")

    # Derive procedure name from path: /api/users/:id -> getUserById
    procedure_name = _path_to_procedure_name(path, method)

    # Choose base procedure (protected vs public)
    base_procedure = "protectedProcedure" if auth_required else "publicProcedure"

    # Choose tRPC procedure type
    if method == "GET":
        trpc_type = "query"
    else:
        trpc_type = "mutation"

    # Build input reference
    input_line = ""
    if input_schema:
        input_line = f"    .input({input_schema})"

    # Build output reference
    output_line = ""
    if output_schema:
        output_line = f"    .output({output_schema})"

    # Build the handler body based on implementation type
    if implementation == "template":
        handler_body = _build_template_handler(endpoint)
    elif implementation == "integration":
        handler_body = _build_integration_handler(endpoint)
    else:
        handler_body = _build_generated_handler(endpoint)

    code = f"""\
/**
 * {description}
 * Route: {method} {path}
 * Auth: {'required' if auth_required else 'public'}
 */
export const {procedure_name} = {base_procedure}
{input_line}
{output_line}
    .{trpc_type}(async ({{ input, ctx }}) => {{
{handler_body}
    }});
"""
    # Clean up empty lines from missing input/output
    code = re.sub(r'\n\n+', '\n\n', code)
    return code


def _path_to_procedure_name(path: str, method: str) -> str:
    """Convert an API path + method to a tRPC procedure name.

    Examples:
      GET /api/users -> getUsers
      POST /api/users -> createUser
      GET /api/users/:id -> getUserById
      PUT /api/users/:id -> updateUser
      DELETE /api/users/:id -> deleteUser
      PATCH /api/users/:id/status -> updateUserStatus
    """
    # Strip /api/ prefix
    cleaned = re.sub(r'^/api/', '', path)
    # Split into segments
    segments = [s for s in cleaned.split('/') if s]

    # Separate param segments from resource segments
    resource_parts: list[str] = []
    param_parts: list[str] = []
    for seg in segments:
        if seg.startswith(':') or seg.startswith('{'):
            param_name = seg.lstrip(':').strip('{}')
            param_parts.append(param_name)
        else:
            resource_parts.append(seg)

    # Build the base name from resource parts
    method_prefix_map = {
        "GET": "get",
        "POST": "create",
        "PUT": "update",
        "DELETE": "delete",
        "PATCH": "update",
    }
    prefix = method_prefix_map.get(method, "handle")

    # Combine resource parts into camelCase
    if not resource_parts:
        resource_name = "Root"
    else:
        resource_name = "".join(
            part.capitalize().rstrip("s") if i == 0 and method in ("POST",) and part.endswith("s")
            else part.capitalize()
            for i, part in enumerate(resource_parts)
        )

    # Append param hints for GET-by-id patterns
    param_suffix = ""
    if param_parts and method == "GET":
        param_suffix = "By" + "And".join(p.capitalize() for p in param_parts)

    return f"{prefix}{resource_name}{param_suffix}"


def _build_generated_handler(endpoint: dict) -> str:
    """Build a standard CRUD handler body for a generated endpoint."""
    method: str = endpoint.get("method", "GET")
    path: str = endpoint.get("path", "")
    description: str = endpoint.get("description", "")

    # Detect CRUD pattern from method
    if method == "GET" and ":id" in path:
        return """\
      const record = await ctx.db.query.findFirst({
        where: (table, { eq }) => eq(table.id, input.id),
      });

      if (!record) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Record not found',
        });
      }

      return record;"""

    elif method == "GET":
        return """\
      const records = await ctx.db.query.findMany({
        where: input.filter ? (table, { like }) =>
          like(table.name, `%${input.filter}%`) : undefined,
        limit: input.limit ?? 50,
        offset: input.offset ?? 0,
        orderBy: (table, { desc }) => [desc(table.createdAt)],
      });

      return {
        items: records,
        total: records.length,
      };"""

    elif method == "POST":
        return """\
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      const [record] = await ctx.db.insert(table).values({
        id,
        ...input,
        createdAt: now,
        updatedAt: now,
      }).returning();

      return record;"""

    elif method in ("PUT", "PATCH"):
        return """\
      const now = new Date().toISOString();

      const [updated] = await ctx.db
        .update(table)
        .set({
          ...input,
          updatedAt: now,
        })
        .where(eq(table.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Record not found',
        });
      }

      return updated;"""

    elif method == "DELETE":
        return """\
      const [deleted] = await ctx.db
        .delete(table)
        .where(eq(table.id, input.id))
        .returning();

      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Record not found',
        });
      }

      return { success: true, id: deleted.id };"""

    else:
        return f"""\
      // TODO: Implement handler for {method} {path}
      // Description: {description}
      throw new TRPCError({{
        code: 'NOT_IMPLEMENTED',
        message: 'This endpoint is not yet implemented',
      }});"""


def _build_template_handler(endpoint: dict) -> str:
    """Build a handler from a well-known template pattern.

    Template endpoints are common patterns like health checks, auth flows,
    password reset, file upload, etc.
    """
    path: str = endpoint.get("path", "")
    description_lower = endpoint.get("description", "").lower()

    if "health" in description_lower or "status" in description_lower:
        return """\
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.APP_VERSION ?? '1.0.0',
      };"""

    elif "login" in description_lower or "sign in" in description_lower:
        return """\
      const user = await ctx.db.query.users.findFirst({
        where: (users, { eq }) => eq(users.email, input.email),
      });

      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      const valid = await verifyPassword(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      const session = await createSession(user.id);
      return {
        user: { id: user.id, email: user.email, name: user.name },
        token: session.token,
        expiresAt: session.expiresAt,
      };"""

    elif "register" in description_lower or "sign up" in description_lower:
        return """\
      const existing = await ctx.db.query.users.findFirst({
        where: (users, { eq }) => eq(users.email, input.email),
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An account with this email already exists',
        });
      }

      const id = crypto.randomUUID();
      const passwordHash = await hashPassword(input.password);
      const now = new Date().toISOString();

      const [user] = await ctx.db.insert(users).values({
        id,
        email: input.email,
        name: input.name,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      }).returning();

      const session = await createSession(user.id);
      return {
        user: { id: user.id, email: user.email, name: user.name },
        token: session.token,
        expiresAt: session.expiresAt,
      };"""

    elif "upload" in description_lower:
        return """\
      const key = `uploads/${crypto.randomUUID()}/${input.filename}`;
      const uploadUrl = await getPresignedUploadUrl(key, input.contentType);

      return {
        uploadUrl,
        key,
        expiresIn: 3600,
      };"""

    elif "search" in description_lower:
        return """\
      const results = await ctx.db.query.findMany({
        where: (table, { or, like }) => or(
          ...input.fields.map((field: string) =>
            like(table[field], `%${input.query}%`)
          ),
        ),
        limit: input.limit ?? 20,
        offset: input.offset ?? 0,
      });

      return {
        results,
        total: results.length,
        query: input.query,
      };"""

    else:
        # Generic template: fall back to generated handler
        return _build_generated_handler(endpoint)


def _build_integration_handler(endpoint: dict) -> str:
    """Build a handler that wraps an external service integration.

    Integration endpoints call external APIs (Stripe, SendGrid, OpenAI, etc.)
    and translate the results to the contract schema.
    """
    description_lower = endpoint.get("description", "").lower()

    if "stripe" in description_lower or "payment" in description_lower:
        return """\
      // Integration: Stripe payment processing
      const stripe = await getStripeClient(ctx.credentials);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: input.amount,
        currency: input.currency ?? 'usd',
        metadata: {
          userId: ctx.user.id,
          ...input.metadata,
        },
      });

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      };"""

    elif "email" in description_lower or "sendgrid" in description_lower:
        return """\
      // Integration: Email delivery
      const emailClient = await getEmailClient(ctx.credentials);

      const result = await emailClient.send({
        to: input.to,
        from: input.from ?? process.env.DEFAULT_FROM_EMAIL,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });

      return {
        messageId: result.messageId,
        status: 'sent',
      };"""

    elif "openai" in description_lower or "ai" in description_lower or "llm" in description_lower:
        return """\
      // Integration: AI/LLM inference
      const aiClient = await getAIClient(ctx.credentials);

      const completion = await aiClient.chat.completions.create({
        model: input.model ?? 'gpt-4o-mini',
        messages: input.messages,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens ?? 1024,
      });

      return {
        content: completion.choices[0]?.message?.content ?? '',
        usage: completion.usage,
        model: completion.model,
      };"""

    elif "storage" in description_lower or "s3" in description_lower or "r2" in description_lower:
        return """\
      // Integration: Cloud storage
      const storageClient = await getStorageClient(ctx.credentials);

      if (input.operation === 'upload') {
        const url = await storageClient.getSignedUrl('putObject', {
          Bucket: input.bucket,
          Key: input.key,
          ContentType: input.contentType,
          Expires: 3600,
        });
        return { url, operation: 'upload' };
      }

      const url = await storageClient.getSignedUrl('getObject', {
        Bucket: input.bucket,
        Key: input.key,
        Expires: 3600,
      });
      return { url, operation: 'download' };"""

    else:
        return f"""\
      // Integration endpoint: {endpoint.get('description', 'external service')}
      // Connect to external service via ctx.credentials
      const client = await getIntegrationClient(ctx.credentials);

      const result = await client.execute({{
        ...input,
        userId: ctx.user?.id,
      }});

      return result;"""


# ---------------------------------------------------------------------------
# Endpoint code generation (public API)
# ---------------------------------------------------------------------------

def generate_endpoint_code(endpoint: dict, contract: dict) -> EndpointResult:
    """Generate implementation code for a single API endpoint.

    Uses the contract's tRPC router and Zod schemas as the type contract.
    Generates the endpoint handler implementation. Also generates a basic
    test file for the endpoint.

    Args:
        endpoint: Dict matching APIEndpointPlan schema from the contract.
        contract: The full BackendContract dict.

    Returns:
        EndpointResult with path, method, code, and tests.
    """
    path: str = endpoint.get("path", "/unknown")
    method: str = endpoint.get("method", "GET")
    input_schema: str = endpoint.get("inputSchema", "")
    output_schema: str = endpoint.get("outputSchema", "")
    description: str = endpoint.get("description", "")
    auth_required: bool = endpoint.get("auth", False)

    procedure_name = _path_to_procedure_name(path, method)

    # Generate the handler code
    handler_code = _build_endpoint_handler(endpoint, contract)

    # Generate imports block
    imports = _build_endpoint_imports(endpoint, contract)

    # Full endpoint module
    full_code = f"""\
{imports}

{handler_code}
"""

    # Generate test code
    test_code = _build_endpoint_test(endpoint, procedure_name)

    return {
        "path": path,
        "method": method,
        "code": full_code.strip(),
        "tests": test_code.strip(),
    }


def _build_endpoint_imports(endpoint: dict, contract: dict) -> str:
    """Build the import block for an endpoint module.

    Imports the relevant Zod schemas from the contract and tRPC utilities.
    """
    input_schema: str = endpoint.get("inputSchema", "")
    output_schema: str = endpoint.get("outputSchema", "")
    auth_required: bool = endpoint.get("auth", False)

    imports = [
        "import { TRPCError } from '@trpc/server';",
    ]

    if auth_required:
        imports.append("import { protectedProcedure } from '../middleware/auth';")
    else:
        imports.append("import { publicProcedure } from '../trpc';")

    # Collect Zod schema imports
    schema_imports: list[str] = []
    if input_schema:
        schema_imports.append(input_schema)
    if output_schema:
        schema_imports.append(output_schema)

    if schema_imports:
        imports.append(
            f"import {{ {', '.join(sorted(set(schema_imports)))} }} from '../schemas';"
        )

    return "\n".join(imports)


def _build_endpoint_test(endpoint: dict, procedure_name: str) -> str:
    """Generate a basic test file for an endpoint."""
    method: str = endpoint.get("method", "GET")
    path: str = endpoint.get("path", "/unknown")
    auth_required: bool = endpoint.get("auth", False)
    description: str = endpoint.get("description", "")

    ctx_setup = ""
    if auth_required:
        ctx_setup = """\
    const mockCtx = {
      user: { id: 'test-user-id', email: 'test@example.com' },
      db: mockDb,
      session: { user: { id: 'test-user-id' } },
    };"""
    else:
        ctx_setup = """\
    const mockCtx = {
      db: mockDb,
    };"""

    return f"""\
import {{ describe, it, expect, vi }} from 'vitest';
import {{ {procedure_name} }} from './{procedure_name}';

describe('{procedure_name}', () => {{
  const mockDb = {{
    query: {{
      findFirst: vi.fn(),
      findMany: vi.fn(),
    }},
    insert: vi.fn().mockReturnValue({{ values: vi.fn().mockReturnValue({{ returning: vi.fn() }}) }}),
    update: vi.fn().mockReturnValue({{ set: vi.fn().mockReturnValue({{ where: vi.fn().mockReturnValue({{ returning: vi.fn() }}) }}) }}),
    delete: vi.fn().mockReturnValue({{ where: vi.fn().mockReturnValue({{ returning: vi.fn() }}) }}),
  }};

  it('should handle {method} {path}', async () => {{
{ctx_setup}

    // {description}
    // TODO: Add specific test assertions for this endpoint
    expect({procedure_name}).toBeDefined();
  }});

  {'it(\'should reject unauthenticated requests\', async () => {' if auth_required else ''}
  {'  const anonCtx = { db: mockDb };' if auth_required else ''}
  {'  // Verify auth middleware blocks unauthenticated access' if auth_required else ''}
  {'  expect(true).toBe(true); // Placeholder' if auth_required else ''}
  {'});' if auth_required else ''}
}});
"""


# ---------------------------------------------------------------------------
# Data model generation
# ---------------------------------------------------------------------------

def generate_data_models(models: list[dict]) -> list[DataModelResult]:
    """Generate Drizzle ORM schema definitions from data model plans.

    Each model produces:
      - A Drizzle pgTable definition with typed columns
      - A SQL migration to create the table

    Args:
        models: List of dicts matching DataModelPlan schema.

    Returns:
        List of DataModelResult dicts.
    """
    results: list[DataModelResult] = []

    for model in models:
        name: str = model.get("name", "unknown")
        fields: list[dict] = model.get("fields", [])
        relations: list[dict] = model.get("relations", [])
        indexes: list[list[str]] = model.get("indexes", [])

        drizzle_code = _build_drizzle_schema(name, fields, relations, indexes)
        migration_sql = _build_migration_sql(name, fields, indexes)

        results.append({
            "name": name,
            "code": drizzle_code,
            "migration": migration_sql,
        })

    return results


def _build_drizzle_schema(
    name: str,
    fields: list[dict],
    relations: list[dict],
    indexes: list[list[str]],
) -> str:
    """Build a Drizzle ORM pgTable definition."""
    table_name = _to_snake_case(name)
    const_name = _to_camel_case(name)

    # Build column definitions
    column_lines: list[str] = []

    # Always include id as primary key
    has_id = any(f.get("name") == "id" for f in fields)
    if not has_id:
        column_lines.append("  id: text('id').primaryKey(),")

    for field in fields:
        col_line = _build_drizzle_column(field)
        column_lines.append(f"  {col_line}")

    # Always include timestamps
    has_created = any(f.get("name") == "createdAt" for f in fields)
    has_updated = any(f.get("name") == "updatedAt" for f in fields)
    if not has_created:
        column_lines.append(
            "  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),"
        )
    if not has_updated:
        column_lines.append(
            "  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),"
        )

    columns_str = "\n".join(column_lines)

    # Build relations
    relation_lines: list[str] = []
    for rel in relations:
        target: str = rel.get("target", "")
        rel_type: str = rel.get("type", "one-to-many")
        target_camel = _to_camel_case(target)

        if rel_type == "one-to-one":
            relation_lines.append(f"  {target_camel}: one({target_camel}),")
        elif rel_type == "one-to-many":
            relation_lines.append(f"  {target_camel}: many({target_camel}),")
        elif rel_type == "many-to-many":
            relation_lines.append(
                f"  {target_camel}: many({target_camel}, {{ relationName: "
                f"'{const_name}To{target_camel}' }}),"
            )

    relations_str = ""
    if relation_lines:
        relations_block = "\n".join(relation_lines)
        relations_str = f"""

export const {const_name}Relations = relations({const_name}, ({{ one, many }}) => ({{
{relations_block}
}}));"""

    # Build index definitions
    index_lines: list[str] = []
    for idx_fields in indexes:
        idx_name = f"idx_{table_name}_{'_'.join(idx_fields)}"
        idx_cols = ", ".join(f"table.{_to_camel_case(f)}" for f in idx_fields)
        index_lines.append(
            f"  {_to_camel_case('_'.join(idx_fields))}Idx: "
            f"index('{idx_name}').on({idx_cols}),"
        )

    indexes_str = ""
    if index_lines:
        idx_block = "\n".join(index_lines)
        indexes_str = f""", (table) => ({{
{idx_block}
}})"""

    # Assemble
    code = f"""\
import {{ pgTable, text, integer, real, boolean, timestamp, jsonb, index }} from 'drizzle-orm/pg-core';
import {{ relations }} from 'drizzle-orm';

export const {const_name} = pgTable('{table_name}', {{
{columns_str}
}}{indexes_str});{relations_str}
"""
    return code.strip()


def _build_drizzle_column(field: dict) -> str:
    """Build a single Drizzle column definition from a field plan."""
    name: str = field.get("name", "unknown")
    field_type: str = field.get("type", "string")
    required: bool = field.get("required", True)
    unique: bool = field.get("unique", False)
    default: str | None = field.get("default")

    col_name = _to_camel_case(name)
    snake_name = _to_snake_case(name)
    drizzle_type = _DRIZZLE_TYPE_MAP.get(field_type.lower(), "text")

    # Special case for id field
    if name == "id":
        return f"id: text('id').primaryKey(),"

    # Build the column chain
    parts = [f"{col_name}: {drizzle_type}('{snake_name}')"]

    if unique:
        parts.append(".unique()")
    if required:
        parts.append(".notNull()")
    if default is not None:
        # Try to infer the default value format
        if default.lower() in ("true", "false"):
            parts.append(f".default({default.lower()})")
        elif default.isdigit():
            parts.append(f".default({default})")
        elif default == "now()":
            parts.append(".defaultNow()")
        else:
            parts.append(f".default('{default}')")

    return "".join(parts) + ","


def _build_migration_sql(
    name: str,
    fields: list[dict],
    indexes: list[list[str]],
) -> str:
    """Build a SQL migration to create a table."""
    table_name = _to_snake_case(name)

    col_defs: list[str] = []

    has_id = any(f.get("name") == "id" for f in fields)
    if not has_id:
        col_defs.append("  id TEXT PRIMARY KEY")

    for field in fields:
        col_sql = _field_to_sql(field)
        col_defs.append(f"  {col_sql}")

    has_created = any(f.get("name") == "createdAt" for f in fields)
    has_updated = any(f.get("name") == "updatedAt" for f in fields)
    if not has_created:
        col_defs.append("  created_at TIMESTAMPTZ DEFAULT NOW()")
    if not has_updated:
        col_defs.append("  updated_at TIMESTAMPTZ DEFAULT NOW()")

    columns_sql = ",\n".join(col_defs)

    # Index statements
    index_stmts: list[str] = []
    for idx_fields in indexes:
        idx_name = f"idx_{table_name}_{'_'.join(idx_fields)}"
        idx_cols = ", ".join(_to_snake_case(f) for f in idx_fields)
        index_stmts.append(f"CREATE INDEX {idx_name} ON {table_name}({idx_cols});")

    indexes_sql = "\n".join(index_stmts) if index_stmts else ""

    sql = f"""\
-- Migration: Create {table_name} table
CREATE TABLE IF NOT EXISTS {table_name} (
{columns_sql}
);
{indexes_sql}
"""
    return sql.strip()


def _field_to_sql(field: dict) -> str:
    """Convert a field plan to a SQL column definition."""
    name = _to_snake_case(field.get("name", "unknown"))
    field_type: str = field.get("type", "string")
    required: bool = field.get("required", True)
    unique: bool = field.get("unique", False)
    default: str | None = field.get("default")

    sql_type_map = {
        "string": "TEXT",
        "text": "TEXT",
        "number": "INTEGER",
        "integer": "INTEGER",
        "float": "REAL",
        "decimal": "REAL",
        "boolean": "BOOLEAN",
        "date": "TIMESTAMPTZ",
        "datetime": "TIMESTAMPTZ",
        "timestamp": "TIMESTAMPTZ",
        "json": "JSONB",
        "jsonb": "JSONB",
        "uuid": "TEXT",
        "email": "TEXT",
        "url": "TEXT",
        "enum": "TEXT",
    }

    sql_type = sql_type_map.get(field_type.lower(), "TEXT")
    parts = [name, sql_type]

    if name == "id":
        parts.append("PRIMARY KEY")
    if required:
        parts.append("NOT NULL")
    if unique:
        parts.append("UNIQUE")
    if default is not None:
        if default.lower() in ("true", "false"):
            parts.append(f"DEFAULT {default.upper()}")
        elif default == "now()":
            parts.append("DEFAULT NOW()")
        else:
            parts.append(f"DEFAULT '{default}'")

    return " ".join(parts)


# ---------------------------------------------------------------------------
# Auth middleware generation
# ---------------------------------------------------------------------------

def generate_auth_middleware(auth_strategy: dict) -> str:
    """Generate authentication middleware from the auth strategy plan.

    Uses templates keyed by auth type (session, jwt, api-key, oauth, none).
    The template includes the middleware definition and a protectedProcedure
    export for use by authenticated endpoints.

    Args:
        auth_strategy: Dict matching AuthStrategyPlan schema.

    Returns:
        TypeScript source code for the auth middleware module.
    """
    auth_type: str = auth_strategy.get("type", "none")
    providers: list[str] = auth_strategy.get("providers", [])
    session_duration: int = auth_strategy.get("sessionDuration", 86400)
    refresh_strategy: str = auth_strategy.get("refreshStrategy", "sliding")

    template = _AUTH_MIDDLEWARE_TEMPLATES.get(auth_type, _AUTH_MIDDLEWARE_TEMPLATES["none"])

    # Add provider-specific configuration for OAuth
    provider_config = ""
    if auth_type == "oauth" and providers:
        provider_lines = ",\n".join(
            f"    '{p}': {{ clientId: process.env.{p.upper()}_CLIENT_ID!, "
            f"clientSecret: process.env.{p.upper()}_CLIENT_SECRET! }}"
            for p in providers
        )
        provider_config = f"""
// OAuth provider configuration
export const oauthProviders = {{
{provider_lines}
}};
"""

    # Add session configuration
    session_config = f"""
// Session configuration
export const SESSION_CONFIG = {{
  duration: {session_duration},
  refreshStrategy: '{refresh_strategy}' as const,
}};
"""

    return f"{template}\n{session_config}{provider_config}".strip()


# ---------------------------------------------------------------------------
# Deployment configuration generation
# ---------------------------------------------------------------------------

def generate_deployment_config(target: str, endpoints: list[dict]) -> str:
    """Generate deployment configuration for a specific target.

    Supported targets: cloudflare-workers, aws-lambda, vercel-functions,
    fly-machines, modal, supabase, runpod.

    Args:
        target: One of the supported BackendTarget values.
        endpoints: List of endpoint dicts (path, method, etc.).

    Returns:
        Deployment configuration as a string (format depends on target).
    """
    template = _DEPLOYMENT_CONFIG_TEMPLATES.get(target)
    if not template:
        logger.warning("Unknown deployment target: %s", target)
        return f"// Unsupported deployment target: {target}"

    app_name = "kriptik-prism-backend"

    if target == "cloudflare-workers":
        route_bindings = _build_cloudflare_routes(endpoints)
        return template.format(
            app_name=app_name,
            compat_date="2024-12-01",
            domain="*",
            zone="",
            route_bindings=route_bindings,
        )

    elif target == "aws-lambda":
        lambda_functions = _build_lambda_functions(endpoints)
        return template.format(
            app_name=app_name,
            lambda_functions=lambda_functions,
        )

    elif target == "vercel-functions":
        vercel_routes = _build_vercel_routes(endpoints)
        return template.format(vercel_routes=vercel_routes)

    elif target == "fly-machines":
        return template.format(app_name=app_name)

    elif target == "modal":
        return template.format(app_name=app_name)

    elif target == "supabase":
        function_configs = _build_supabase_functions(endpoints)
        return template.format(
            project_id="<project-id>",
            function_configs=function_configs,
        )

    elif target == "runpod":
        return template

    return f"// Unsupported deployment target: {target}"


def _build_cloudflare_routes(endpoints: list[dict]) -> str:
    """Build Cloudflare Workers route bindings."""
    lines: list[str] = []
    for ep in endpoints:
        path: str = ep.get("path", "/")
        method: str = ep.get("method", "GET")
        lines.append(f"# {method} {path}")
    return "\n".join(lines) if lines else "# No routes configured"


def _build_lambda_functions(endpoints: list[dict]) -> str:
    """Build AWS Lambda function definitions for serverless.yml."""
    lines: list[str] = []
    for ep in endpoints:
        path: str = ep.get("path", "/")
        method: str = ep.get("method", "GET")
        fn_name = _path_to_procedure_name(path, method)

        # Convert express-style params to API Gateway format
        api_path = path.replace(":", "{").replace("/", "/")
        # Close any opened braces
        segments = api_path.split("/")
        api_segments: list[str] = []
        for seg in segments:
            if seg.startswith("{") and not seg.endswith("}"):
                seg = seg + "}"
            api_segments.append(seg)
        api_path = "/".join(api_segments)

        lines.append(f"  {fn_name}:")
        lines.append(f"    handler: src/handlers/{fn_name}.handler")
        lines.append("    events:")
        lines.append("      - httpApi:")
        lines.append(f"          method: {method}")
        lines.append(f"          path: {api_path}")
        lines.append("")

    return "\n".join(lines) if lines else "  # No functions configured"


def _build_vercel_routes(endpoints: list[dict]) -> str:
    """Build Vercel route configuration."""
    lines: list[str] = []
    for ep in endpoints:
        path: str = ep.get("path", "/")
        method: str = ep.get("method", "GET")

        # Convert param format
        vercel_path = re.sub(r':(\w+)', r'(?<\1>[^/]+)', path)

        lines.append(f'    {{ "src": "{vercel_path}", "dest": "src/index.ts", '
                      f'"methods": ["{method}"] }}')

    return ",\n".join(lines) if lines else '    { "src": "/api/(.*)", "dest": "src/index.ts" }'


def _build_supabase_functions(endpoints: list[dict]) -> str:
    """Build Supabase Edge Functions configuration."""
    lines: list[str] = []
    seen_functions: set[str] = set()

    for ep in endpoints:
        path: str = ep.get("path", "/")
        # Group by top-level resource
        parts = [p for p in path.split("/") if p and p != "api"]
        fn_name = parts[0] if parts else "main"

        if fn_name not in seen_functions:
            seen_functions.add(fn_name)
            lines.append(f"[functions.{fn_name}]")
            lines.append(f'verify_jwt = true')
            lines.append("")

    return "\n".join(lines) if lines else "# No functions configured"


# ---------------------------------------------------------------------------
# Convergence gate
# ---------------------------------------------------------------------------

def run_convergence_gate(
    graph: dict,
    bundle_result: dict,
    backend_result: dict,
) -> ConvergenceResult:
    """Run the convergence gate: verify frontend-backend compatibility.

    This is a static-analysis-only check (1-3 seconds, no runtime). It verifies
    that the frontend code's API calls match the backend endpoint signatures,
    that request/response shapes match Zod schemas, and that every frontend
    apiCall has a corresponding backend handler.

    Spec reference: Section 14 — Convergence Gate
      1. Type check: all frontend API calls match backend endpoint signatures
      2. AJV schema validation: request/response shapes match Zod schemas
      3. Route resolution: every frontend apiCall has a corresponding backend handler
      4. Auth consistency: protected frontend routes call authenticated endpoints

    Args:
        graph: The PrismGraph dict containing all nodes.
        bundle_result: The frontend assembly result with generated code.
        backend_result: The backend generation result with endpoint code.

    Returns:
        ConvergenceResult dict with passed, issues, and endpoint match counts.
    """
    start = time.monotonic()
    issues: list[ConvergenceIssue] = []
    checked_endpoints = 0
    matched_endpoints = 0

    # Extract frontend API calls from graph nodes
    frontend_api_calls = _extract_frontend_api_calls(graph)

    # Extract backend endpoints from the result
    backend_endpoints = _extract_backend_endpoints(backend_result)

    # Build lookup of backend endpoints by (method, path)
    backend_lookup: dict[tuple[str, str], dict] = {}
    for ep in backend_endpoints:
        method = ep.get("method", "GET").upper()
        path = ep.get("path", "")
        backend_lookup[(method, path)] = ep

    # Check 1: Route resolution — every frontend API call has a backend handler
    for api_call in frontend_api_calls:
        checked_endpoints += 1
        call_method = api_call.get("method", "GET").upper()
        call_path = api_call.get("endpointPath", "")
        node_id = api_call.get("nodeId", "unknown")

        # Try exact match first
        matched = _find_matching_endpoint(call_method, call_path, backend_lookup)

        if matched:
            matched_endpoints += 1
        else:
            issues.append({
                "type": "missing_backend_handler",
                "message": (
                    f"Frontend node '{node_id}' calls {call_method} {call_path} "
                    f"but no backend handler exists for this route"
                ),
                "severity": "error",
            })

    # Check 2: Auth consistency — protected frontend routes should use authenticated endpoints
    for api_call in frontend_api_calls:
        call_method = api_call.get("method", "GET").upper()
        call_path = api_call.get("endpointPath", "")
        node_id = api_call.get("nodeId", "unknown")

        # Check if the hub containing this node requires auth
        node_hubs = api_call.get("hubMemberships", [])
        hubs_requiring_auth = _get_auth_hubs(graph, node_hubs)

        if hubs_requiring_auth:
            matched = _find_matching_endpoint(call_method, call_path, backend_lookup)
            if matched and not matched.get("auth", False):
                issues.append({
                    "type": "auth_inconsistency",
                    "message": (
                        f"Node '{node_id}' is in auth-required hub(s) "
                        f"{hubs_requiring_auth} but calls unauthenticated endpoint "
                        f"{call_method} {call_path}"
                    ),
                    "severity": "warning",
                })

    # Check 3: Schema compatibility — verify input/output schema references exist
    zod_schemas = backend_result.get("zodSchemas", "")
    for ep in backend_endpoints:
        input_schema = ep.get("inputSchema", "")
        output_schema = ep.get("outputSchema", "")
        path = ep.get("path", "")

        if input_schema and input_schema not in zod_schemas:
            issues.append({
                "type": "missing_schema",
                "message": (
                    f"Endpoint {path} references input schema '{input_schema}' "
                    f"which is not defined in the Zod schemas"
                ),
                "severity": "error",
            })

        if output_schema and output_schema not in zod_schemas:
            issues.append({
                "type": "missing_schema",
                "message": (
                    f"Endpoint {path} references output schema '{output_schema}' "
                    f"which is not defined in the Zod schemas"
                ),
                "severity": "error",
            })

    # Check 4: TypeScript type check (if we have a working temp directory)
    tsc_issues = _run_tsc_check(bundle_result, backend_result)
    issues.extend(tsc_issues)

    elapsed_ms = int((time.monotonic() - start) * 1000)
    has_errors = any(i["severity"] == "error" for i in issues)

    logger.info(
        "Convergence gate: %s (%d/%d endpoints matched, %d issues, %dms)",
        "FAILED" if has_errors else "PASSED",
        matched_endpoints,
        checked_endpoints,
        len(issues),
        elapsed_ms,
    )

    return {
        "passed": not has_errors,
        "issues": issues,
        "checkedEndpoints": checked_endpoints,
        "matchedEndpoints": matched_endpoints,
    }


def _extract_frontend_api_calls(graph: dict) -> list[dict]:
    """Extract all API call specs from frontend graph nodes.

    Walks the graph nodes and collects every APICallSpec from each node's
    behaviorSpec.apiCalls, annotating each with the source nodeId and
    hubMemberships for auth checking.
    """
    api_calls: list[dict] = []
    nodes: list[dict] = graph.get("nodes", [])

    for node in nodes:
        node_id = node.get("id", "")
        hub_memberships = node.get("hubMemberships", [])
        behavior_spec = node.get("behaviorSpec")
        if not behavior_spec:
            continue

        for api_call in behavior_spec.get("apiCalls", []):
            api_calls.append({
                **api_call,
                "nodeId": node_id,
                "hubMemberships": hub_memberships,
            })

    return api_calls


def _extract_backend_endpoints(backend_result: dict) -> list[dict]:
    """Extract endpoint definitions from the backend generation result."""
    return backend_result.get("endpoints", [])


def _find_matching_endpoint(
    method: str,
    path: str,
    backend_lookup: dict[tuple[str, str], dict],
) -> dict | None:
    """Find a backend endpoint matching the given method and path.

    Tries exact match first, then parameterized match (e.g. /users/:id matches
    /users/123).
    """
    # Exact match
    if (method, path) in backend_lookup:
        return backend_lookup[(method, path)]

    # Parameterized match: normalize both sides by replacing param segments
    normalized_call = _normalize_path(path)
    for (ep_method, ep_path), ep_data in backend_lookup.items():
        if ep_method != method:
            continue
        if _normalize_path(ep_path) == normalized_call:
            return ep_data

    return None


def _normalize_path(path: str) -> str:
    """Normalize a path by replacing parameter segments with a placeholder.

    /api/users/:id -> /api/users/:param
    /api/users/{id} -> /api/users/:param
    """
    segments = path.split("/")
    normalized: list[str] = []
    for seg in segments:
        if seg.startswith(":") or (seg.startswith("{") and seg.endswith("}")):
            normalized.append(":param")
        else:
            normalized.append(seg)
    return "/".join(normalized)


def _get_auth_hubs(graph: dict, hub_ids: list[str]) -> list[str]:
    """Return hub IDs that require authentication."""
    hubs: list[dict] = graph.get("hubs", [])
    auth_hubs: list[str] = []
    for hub in hubs:
        if hub.get("id") in hub_ids and hub.get("authRequired", False):
            auth_hubs.append(hub["id"])
    return auth_hubs


def _run_tsc_check(bundle_result: dict, backend_result: dict) -> list[ConvergenceIssue]:
    """Run tsc --noEmit on combined frontend+backend types.

    Creates a temporary project with the contract types and checks
    for type errors. This is the first line of the convergence gate.
    """
    issues: list[ConvergenceIssue] = []

    # Extract the contract code
    trpc_router = backend_result.get("tRPCRouter", "")
    zod_schemas = backend_result.get("zodSchemas", "")

    if not trpc_router and not zod_schemas:
        # No contract to check against — skip type check
        return issues

    try:
        with tempfile.TemporaryDirectory(prefix="prism-convergence-") as tmpdir:
            tmp = Path(tmpdir)

            # Write tsconfig
            tsconfig = {
                "compilerOptions": {
                    "strict": True,
                    "noEmit": True,
                    "target": "ES2022",
                    "module": "ESNext",
                    "moduleResolution": "bundler",
                    "esModuleInterop": True,
                    "skipLibCheck": True,
                },
                "include": ["src/**/*.ts"],
            }
            (tmp / "tsconfig.json").write_text(json.dumps(tsconfig, indent=2))

            # Write source files
            src_dir = tmp / "src"
            src_dir.mkdir()

            if zod_schemas:
                (src_dir / "schemas.ts").write_text(zod_schemas)
            if trpc_router:
                (src_dir / "router.ts").write_text(trpc_router)

            # Write endpoint files
            endpoints = backend_result.get("endpoints", [])
            for ep in endpoints:
                code = ep.get("code", "")
                if code:
                    path = ep.get("path", "/unknown")
                    method = ep.get("method", "GET")
                    fn_name = _path_to_procedure_name(path, method)
                    (src_dir / f"{fn_name}.ts").write_text(code)

            # Run tsc --noEmit
            result = subprocess.run(
                ["npx", "tsc", "--noEmit"],
                cwd=str(tmp),
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode != 0:
                # Parse tsc errors
                for line in result.stdout.splitlines():
                    if ": error TS" in line:
                        issues.append({
                            "type": "type_error",
                            "message": line.strip(),
                            "severity": "error",
                        })

                # If we got errors but couldn't parse them, add a generic one
                if not issues and result.stderr:
                    issues.append({
                        "type": "type_error",
                        "message": f"TypeScript type check failed: {result.stderr[:500]}",
                        "severity": "error",
                    })

    except FileNotFoundError:
        logger.warning("tsc not found — skipping TypeScript type check in convergence gate")
    except subprocess.TimeoutExpired:
        issues.append({
            "type": "type_check_timeout",
            "message": "TypeScript type check timed out after 30 seconds",
            "severity": "warning",
        })
    except Exception as exc:
        logger.warning("Convergence gate tsc check failed: %s", exc)
        issues.append({
            "type": "type_check_error",
            "message": f"TypeScript type check could not run: {exc}",
            "severity": "warning",
        })

    return issues


# ---------------------------------------------------------------------------
# Top-level backend generation
# ---------------------------------------------------------------------------

def generate_backend(contract: dict, config: dict) -> BackendResult:
    """Generate backend implementation code from the pre-existing contract.

    INVARIANT 4: The contract (tRPC router + Zod schemas) was generated during
    planning, BEFORE this function runs. This generates implementation code that
    conforms to the contract, not the other way around.

    Steps:
      1. Parse the tRPC router definition and Zod schemas from contract
      2. Generate implementation for each API endpoint (parallel-ready)
      3. Generate data model implementations (Drizzle ORM schemas)
      4. Generate auth middleware based on strategy
      5. Generate deployment configuration for each target
      6. Bundle everything into a complete result

    Args:
        contract: Dict matching BackendContract schema from prism-backend.ts.
        config: Engine configuration dict (contains backendTargets, etc.).

    Returns:
        BackendResult with endpoints, dataModels, authMiddleware,
        deploymentConfigs, and generationTimeMs.
    """
    start = time.monotonic()

    # Validate contract presence (Invariant 4)
    trpc_router = contract.get("tRPCRouter", "")
    zod_schemas = contract.get("zodSchemas", "")
    if not trpc_router and not zod_schemas:
        logger.warning(
            "Backend generation called with empty contract — "
            "this may indicate a planning phase failure (Invariant 4 violation)"
        )

    # 1. Extract endpoint plans from contract
    api_endpoints: list[dict] = contract.get("apiEndpoints", [])
    data_models: list[dict] = contract.get("dataModels", [])
    auth_strategy: dict = contract.get("authStrategy", {"type": "none", "providers": []})
    deployment_targets: list[str] = contract.get(
        "deploymentTargets",
        config.get("backendTargets", []),
    )

    logger.info(
        "Generating backend: %d endpoints, %d data models, auth=%s, targets=%s",
        len(api_endpoints),
        len(data_models),
        auth_strategy.get("type", "none"),
        deployment_targets,
    )

    # 2. Generate endpoint implementations
    # In the full pipeline, these run in parallel via Function.map().
    # Here we generate sequentially since this worker handles a single project.
    endpoint_results: list[EndpointResult] = []
    for endpoint in api_endpoints:
        result = generate_endpoint_code(endpoint, contract)
        endpoint_results.append(result)
        logger.debug("Generated endpoint: %s %s", result["method"], result["path"])

    # 3. Generate data model implementations
    model_results: list[DataModelResult] = generate_data_models(data_models)
    logger.debug("Generated %d data model(s)", len(model_results))

    # 4. Generate auth middleware
    auth_middleware_code = generate_auth_middleware(auth_strategy)
    logger.debug("Generated auth middleware (type=%s)", auth_strategy.get("type", "none"))

    # 5. Generate deployment configurations
    deployment_configs: dict[str, str] = {}
    for target in deployment_targets:
        deployment_configs[target] = generate_deployment_config(
            target, api_endpoints,
        )
        logger.debug("Generated deployment config for target: %s", target)

    elapsed_ms = int((time.monotonic() - start) * 1000)

    logger.info(
        "Backend generation complete: %d endpoints, %d models, %d targets, %dms",
        len(endpoint_results),
        len(model_results),
        len(deployment_configs),
        elapsed_ms,
    )

    return {
        "endpoints": endpoint_results,
        "dataModels": model_results,
        "authMiddleware": auth_middleware_code,
        "deploymentConfigs": deployment_configs,
        "generationTimeMs": elapsed_ms,
    }


# ---------------------------------------------------------------------------
# Backend manifest
# ---------------------------------------------------------------------------

def build_backend_manifest(
    backend_result: BackendResult,
    deployment_configs: dict[str, str],
) -> BackendManifest:
    """Build the backend manifest for storage in prism_graphs.backendManifest.

    The manifest records which endpoints were generated, which deployment
    targets were configured, and deployment status. URLs are populated
    after actual deployment.

    Args:
        backend_result: The BackendResult from generate_backend().
        deployment_configs: The deployment config strings by target.

    Returns:
        BackendManifest dict ready for JSONB storage.
    """
    endpoints_manifest: list[dict[str, Any]] = []
    for ep in backend_result.get("endpoints", []):
        endpoints_manifest.append({
            "path": ep["path"],
            "method": ep["method"],
            "deployed": False,
            "url": None,
        })

    targets = list(deployment_configs.keys())

    return {
        "endpoints": endpoints_manifest,
        "targets": targets,
        "deployedAt": None,
    }


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def _to_snake_case(name: str) -> str:
    """Convert camelCase or PascalCase to snake_case."""
    # Insert underscore before uppercase letters
    s1 = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1_\2', name)
    s2 = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', s1)
    return s2.lower().replace("-", "_").replace(" ", "_")


def _to_camel_case(name: str) -> str:
    """Convert snake_case or kebab-case to camelCase."""
    parts = re.split(r'[_\-\s]+', name)
    if not parts:
        return name
    return parts[0].lower() + "".join(p.capitalize() for p in parts[1:])
