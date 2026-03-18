import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('SUPABASE_DATABASE_URL or DATABASE_URL must be set');
}

const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
