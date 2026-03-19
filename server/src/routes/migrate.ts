/**
 * Auto-migration: creates missing tables on first access.
 * Safe to run multiple times (uses IF NOT EXISTS / IF NOT EXISTS).
 * REMOVE THIS FILE after confirming migration is complete.
 */
import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';

const router = Router();

let migrationRan = false;

router.get('/status', async (_req, res) => {
  if (migrationRan) {
    return res.json({ status: 'already_ran' });
  }

  const results: string[] = [];

  try {
    // Check if credit_transactions exists
    const tableCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'credit_transactions'
      ) as exists
    `);
    const tableExists = (tableCheck as any)?.[0]?.exists === true;

    // Check if stripe_customer_id column exists
    const colCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'stripe_customer_id'
      ) as exists
    `);
    const colExists = (colCheck as any)?.[0]?.exists === true;

    if (tableExists && colExists) {
      migrationRan = true;
      return res.json({ status: 'up_to_date', tableExists, colExists });
    }

    // Run migrations
    if (!colExists) {
      await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`);
      results.push('Added stripe_customer_id column');
    }

    if (!tableExists) {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.credit_transactions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          amount INTEGER NOT NULL,
          balance INTEGER NOT NULL,
          description TEXT,
          project_id TEXT,
          stripe_session_id TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      results.push('Created credit_transactions table');

      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id)`);
      results.push('Created index');
    }

    migrationRan = true;
    res.json({ status: 'migrated', results });
  } catch (err: any) {
    console.error('Migration error:', err);
    res.status(500).json({ error: err.message, results });
  }
});

export default router;
