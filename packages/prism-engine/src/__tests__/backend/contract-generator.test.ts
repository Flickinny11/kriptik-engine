import { describe, it, expect } from 'vitest';
import {
  generateTRPCRouterTypes,
  generateZodSchemas,
  generateContractFiles,
  pathToProcedureName,
} from '../../backend/contract-generator.js';
import type { BackendContract } from '../../types.js';

function makeContract(): BackendContract {
  return {
    tRPCRouter: '',
    zodSchemas: '',
    dataModels: [
      {
        name: 'User',
        fields: [
          { name: 'id', type: 'uuid', required: true, unique: true },
          { name: 'email', type: 'email', required: true, unique: true },
          { name: 'name', type: 'string', required: true, unique: false },
          { name: 'role', type: 'enum', required: true, unique: false, default: 'user' },
        ],
        relations: [
          { target: 'Post', type: 'one-to-many' },
        ],
        indexes: [['email']],
      },
      {
        name: 'Post',
        fields: [
          { name: 'id', type: 'uuid', required: true, unique: true },
          { name: 'title', type: 'string', required: true, unique: false },
          { name: 'content', type: 'text', required: true, unique: false },
          { name: 'published', type: 'boolean', required: true, unique: false, default: 'false' },
          { name: 'authorId', type: 'uuid', required: true, unique: false },
        ],
        relations: [
          { target: 'User', type: 'one-to-one' },
        ],
        indexes: [['authorId'], ['published']],
      },
    ],
    apiEndpoints: [
      {
        method: 'GET',
        path: '/api/users',
        description: 'List all users',
        auth: false,
        inputSchema: 'paginationInput',
        outputSchema: '',
        implementation: 'generated',
      },
      {
        method: 'GET',
        path: '/api/users/:id',
        description: 'Get user by ID',
        auth: false,
        inputSchema: 'idInput',
        outputSchema: 'userSchema',
        implementation: 'generated',
      },
      {
        method: 'POST',
        path: '/api/users',
        description: 'Create a new user',
        auth: true,
        inputSchema: 'createUserSchema',
        outputSchema: 'userSchema',
        implementation: 'generated',
      },
      {
        method: 'DELETE',
        path: '/api/users/:id',
        description: 'Delete a user',
        auth: true,
        inputSchema: 'idInput',
        outputSchema: 'successOutput',
        implementation: 'generated',
      },
    ],
    authStrategy: {
      type: 'jwt',
      providers: [],
      sessionDuration: 86400,
      refreshStrategy: 'sliding',
    },
    deploymentTargets: ['cloudflare-workers'],
  };
}

describe('pathToProcedureName', () => {
  it('converts GET list paths', () => {
    expect(pathToProcedureName('/api/users', 'GET')).toBe('getUsers');
  });

  it('converts GET-by-id paths', () => {
    expect(pathToProcedureName('/api/users/:id', 'GET')).toBe('getUsersById');
  });

  it('converts POST paths (singularizes resource)', () => {
    expect(pathToProcedureName('/api/users', 'POST')).toBe('createUser');
  });

  it('converts DELETE paths', () => {
    expect(pathToProcedureName('/api/users/:id', 'DELETE')).toBe('deleteUsers');
  });

  it('converts nested paths', () => {
    expect(pathToProcedureName('/api/users/:id/posts', 'GET')).toBe('getUsersPostsById');
  });

  it('handles paths without /api/ prefix', () => {
    expect(pathToProcedureName('/health', 'GET')).toBe('getHealth');
  });
});

describe('generateTRPCRouterTypes', () => {
  it('generates a valid tRPC router definition', () => {
    const contract = makeContract();
    const result = generateTRPCRouterTypes(contract);

    expect(result).toContain("import { router, publicProcedure, protectedProcedure } from './trpc'");
    expect(result).toContain('export const appRouter = router({');
    expect(result).toContain('export type AppRouter = typeof appRouter;');
  });

  it('includes all procedures from endpoints', () => {
    const contract = makeContract();
    const result = generateTRPCRouterTypes(contract);

    expect(result).toContain('getUsers:');
    expect(result).toContain('getUsersById:');
    expect(result).toContain('createUser:');
    expect(result).toContain('deleteUsers:');
  });

  it('maps GET to query and POST/DELETE to mutation', () => {
    const contract = makeContract();
    const result = generateTRPCRouterTypes(contract);

    // getUsers is a GET -> query
    expect(result).toMatch(/getUsers:.*\.query/s);
    // createUser is a POST -> mutation
    expect(result).toMatch(/createUser:.*\.mutation/s);
  });

  it('uses protectedProcedure for auth-required endpoints', () => {
    const contract = makeContract();
    const result = generateTRPCRouterTypes(contract);

    // createUser requires auth
    expect(result).toMatch(/createUser: protectedProcedure/);
    // getUsers does not
    expect(result).toMatch(/getUsers: publicProcedure/);
  });

  it('imports referenced Zod schemas', () => {
    const contract = makeContract();
    const result = generateTRPCRouterTypes(contract);

    expect(result).toContain("from './schemas'");
    expect(result).toContain('paginationInput');
    expect(result).toContain('userSchema');
  });

  it('generates empty router for no endpoints', () => {
    const contract: BackendContract = {
      ...makeContract(),
      apiEndpoints: [],
    };
    const result = generateTRPCRouterTypes(contract);

    expect(result).toContain('export const appRouter = router({});');
  });
});

describe('generateZodSchemas', () => {
  it('generates Zod schemas from data models', () => {
    const contract = makeContract();
    const result = generateZodSchemas(contract);

    expect(result).toContain("import { z } from 'zod'");
    expect(result).toContain('export const userSchema = z.object({');
    expect(result).toContain('export const postSchema = z.object({');
  });

  it('generates create and update variants', () => {
    const contract = makeContract();
    const result = generateZodSchemas(contract);

    expect(result).toContain('export const createUserSchema');
    expect(result).toContain('export const updateUserSchema');
    expect(result).toContain('export const createPostSchema');
    expect(result).toContain('export const updatePostSchema');
  });

  it('maps field types to Zod validators', () => {
    const contract = makeContract();
    const result = generateZodSchemas(contract);

    expect(result).toContain('z.string().email()');
    expect(result).toContain('z.string().uuid()');
    expect(result).toContain('z.boolean()');
  });

  it('generates standard schemas for common patterns', () => {
    const contract = makeContract();
    const result = generateZodSchemas(contract);

    expect(result).toContain('export const paginationInput');
    expect(result).toContain('export const idInput');
    expect(result).toContain('export const successOutput');
  });

  it('generates type exports from schemas', () => {
    const contract = makeContract();
    const result = generateZodSchemas(contract);

    expect(result).toContain('export type User = z.infer<typeof userSchema>');
    expect(result).toContain('export type Post = z.infer<typeof postSchema>');
  });
});

describe('generateContractFiles', () => {
  it('returns both router and schemas', () => {
    const contract = makeContract();
    const result = generateContractFiles(contract);

    expect(result.tRPCRouter).toContain('appRouter');
    expect(result.zodSchemas).toContain("import { z } from 'zod'");
  });
});
