/**
 * contract-generator.ts — Generates tRPC router types + Zod schemas from BackendContract.
 *
 * INVARIANT 4: Contract-First. tRPC types + Zod schemas are generated BEFORE
 * any frontend or backend code. Both sides generate against the contract.
 *
 * This module runs during planning (Phase 5) to produce the contract strings
 * that are stored in BackendContract.tRPCRouter and BackendContract.zodSchemas.
 * The backend_worker.py then generates implementation code AGAINST these contracts.
 */

import type {
  BackendContract,
  APIEndpointPlan,
  DataModelPlan,
  AuthStrategyPlan,
} from '../types.js';

/**
 * Generate a complete tRPC router type definition from the backend contract.
 *
 * Produces a TypeScript source string defining:
 * - The appRouter with all procedure signatures
 * - Input/output type references tied to Zod schemas
 * - Protected vs public procedure routing based on auth requirements
 */
export function generateTRPCRouterTypes(contract: BackendContract): string {
  const endpoints = contract.apiEndpoints;
  if (!endpoints || endpoints.length === 0) {
    return `import { router, publicProcedure } from './trpc';\n\nexport const appRouter = router({});\n\nexport type AppRouter = typeof appRouter;\n`;
  }

  const procedureLines: string[] = [];
  const schemaImports = new Set<string>();

  for (const ep of endpoints) {
    if (ep.inputSchema) schemaImports.add(ep.inputSchema);
    if (ep.outputSchema) schemaImports.add(ep.outputSchema);

    const procName = pathToProcedureName(ep.path, ep.method);
    const baseProcedure = ep.auth ? 'protectedProcedure' : 'publicProcedure';
    const trpcType = ep.method === 'GET' ? 'query' : 'mutation';

    const inputChain = ep.inputSchema ? `.input(${ep.inputSchema})` : '';
    const outputChain = ep.outputSchema ? `.output(${ep.outputSchema})` : '';

    procedureLines.push(
      `  /** ${ep.description} — ${ep.method} ${ep.path} */\n` +
      `  ${procName}: ${baseProcedure}${inputChain}${outputChain}\n` +
      `    .${trpcType}(async ({ input, ctx }) => {\n` +
      `      throw new Error('Not implemented');\n` +
      `    }),`,
    );
  }

  const sortedImports = [...schemaImports].sort();
  const schemaImportLine = sortedImports.length > 0
    ? `import { ${sortedImports.join(', ')} } from './schemas';\n`
    : '';

  const needsProtected = endpoints.some(ep => ep.auth);
  const procedureImports = needsProtected
    ? 'router, publicProcedure, protectedProcedure'
    : 'router, publicProcedure';

  return (
    `import { ${procedureImports} } from './trpc';\n` +
    schemaImportLine +
    `\nexport const appRouter = router({\n` +
    procedureLines.join('\n\n') +
    `\n});\n\nexport type AppRouter = typeof appRouter;\n`
  );
}

/**
 * Generate Zod validation schemas from the backend contract.
 *
 * Produces a TypeScript source string with all Zod schemas referenced
 * by endpoint input/output types. Schemas are derived from:
 * - API endpoint input/output schema names
 * - Data model field definitions
 */
export function generateZodSchemas(contract: BackendContract): string {
  const lines: string[] = [
    "import { z } from 'zod';",
    '',
  ];

  // Collect all referenced schema names
  const schemaNames = new Set<string>();
  for (const ep of contract.apiEndpoints) {
    if (ep.inputSchema) schemaNames.add(ep.inputSchema);
    if (ep.outputSchema) schemaNames.add(ep.outputSchema);
  }

  // Generate schemas from data models
  for (const model of contract.dataModels) {
    const modelSchemaName = toCamelCase(model.name) + 'Schema';
    const createSchemaName = 'create' + toPascalCase(model.name) + 'Schema';
    const updateSchemaName = 'update' + toPascalCase(model.name) + 'Schema';

    lines.push(`// ${model.name} model schemas`);
    lines.push(`export const ${modelSchemaName} = z.object({`);
    lines.push(`  id: z.string(),`);
    for (const field of model.fields) {
      if (field.name === 'id') continue;
      lines.push(`  ${toCamelCase(field.name)}: ${zodTypeForField(field)},`);
    }
    lines.push(`  createdAt: z.string().datetime(),`);
    lines.push(`  updatedAt: z.string().datetime(),`);
    lines.push(`});\n`);

    // Create schema (omits id, timestamps)
    lines.push(`export const ${createSchemaName} = ${modelSchemaName}.omit({`);
    lines.push(`  id: true,`);
    lines.push(`  createdAt: true,`);
    lines.push(`  updatedAt: true,`);
    lines.push(`});\n`);

    // Update schema (partial, omits id)
    lines.push(`export const ${updateSchemaName} = ${modelSchemaName}.partial().required({ id: true });\n`);

    // Remove from unresolved set
    schemaNames.delete(modelSchemaName);
    schemaNames.delete(createSchemaName);
    schemaNames.delete(updateSchemaName);
  }

  // Generate standard schemas for common patterns
  const standardSchemas = generateStandardSchemas();
  for (const name of [...schemaNames]) {
    if (standardSchemas.has(name)) {
      lines.push(standardSchemas.get(name)!);
      schemaNames.delete(name);
    }
  }

  // Generate placeholder schemas for any remaining unresolved references
  for (const name of schemaNames) {
    lines.push(`export const ${name} = z.object({});`);
    lines.push(`// TODO: Define schema for ${name}`);
    lines.push('');
  }

  // Add inferred type exports
  lines.push('// Inferred TypeScript types from Zod schemas');
  for (const model of contract.dataModels) {
    const modelName = toPascalCase(model.name);
    const schemaName = toCamelCase(model.name) + 'Schema';
    lines.push(`export type ${modelName} = z.infer<typeof ${schemaName}>;`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate complete contract files (router + schemas) from a BackendContract.
 * Returns both as strings ready for file writing or storage.
 */
export function generateContractFiles(contract: BackendContract): {
  tRPCRouter: string;
  zodSchemas: string;
} {
  return {
    tRPCRouter: generateTRPCRouterTypes(contract),
    zodSchemas: generateZodSchemas(contract),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert an API path + method to a tRPC procedure name.
 * Mirrors the Python _path_to_procedure_name in backend_worker.py.
 */
export function pathToProcedureName(path: string, method: string): string {
  const cleaned = path.replace(/^\/api\//, '');
  const segments = cleaned.split('/').filter(Boolean);

  const resourceParts: string[] = [];
  const paramParts: string[] = [];

  for (const seg of segments) {
    if (seg.startsWith(':') || seg.startsWith('{')) {
      paramParts.push(seg.replace(/^[:{]/, '').replace(/}$/, ''));
    } else {
      resourceParts.push(seg);
    }
  }

  const prefixMap: Record<string, string> = {
    GET: 'get',
    POST: 'create',
    PUT: 'update',
    DELETE: 'delete',
    PATCH: 'update',
  };
  const prefix = prefixMap[method] ?? 'handle';

  const resourceName = resourceParts.length === 0
    ? 'Root'
    : resourceParts.map((p, i) => {
        if (i === 0 && method === 'POST' && p.endsWith('s')) {
          return capitalize(p.slice(0, -1));
        }
        return capitalize(p);
      }).join('');

  const paramSuffix = paramParts.length > 0 && method === 'GET'
    ? 'By' + paramParts.map(capitalize).join('And')
    : '';

  return `${prefix}${resourceName}${paramSuffix}`;
}

function zodTypeForField(field: { type: string; required: boolean }): string {
  const typeMap: Record<string, string> = {
    string: 'z.string()',
    text: 'z.string()',
    number: 'z.number()',
    integer: 'z.number().int()',
    float: 'z.number()',
    decimal: 'z.number()',
    boolean: 'z.boolean()',
    date: 'z.string().datetime()',
    datetime: 'z.string().datetime()',
    timestamp: 'z.string().datetime()',
    json: 'z.record(z.unknown())',
    jsonb: 'z.record(z.unknown())',
    uuid: 'z.string().uuid()',
    email: 'z.string().email()',
    url: 'z.string().url()',
    enum: 'z.string()',
  };

  const base = typeMap[field.type.toLowerCase()] ?? 'z.string()';
  return field.required ? base : `${base}.optional()`;
}

function generateStandardSchemas(): Map<string, string> {
  const schemas = new Map<string, string>();

  schemas.set('paginationInput', [
    'export const paginationInput = z.object({',
    '  limit: z.number().int().min(1).max(100).default(50),',
    '  offset: z.number().int().min(0).default(0),',
    '  filter: z.string().optional(),',
    '});\n',
  ].join('\n'));

  schemas.set('idInput', [
    'export const idInput = z.object({',
    '  id: z.string(),',
    '});\n',
  ].join('\n'));

  schemas.set('searchInput', [
    'export const searchInput = z.object({',
    '  query: z.string().min(1),',
    '  fields: z.array(z.string()).optional(),',
    '  limit: z.number().int().min(1).max(100).default(20),',
    '  offset: z.number().int().min(0).default(0),',
    '});\n',
  ].join('\n'));

  schemas.set('successOutput', [
    'export const successOutput = z.object({',
    '  success: z.boolean(),',
    '  id: z.string().optional(),',
    '});\n',
  ].join('\n'));

  return schemas;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toCamelCase(s: string): string {
  return s.replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toLowerCase());
}

function toPascalCase(s: string): string {
  return s.replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}
