/**
 * One-time migration endpoint to create credit_transactions table and stripe_customer_id column.
 * DELETE THIS FILE after running the migration once.
 */
import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';

const router = Router();

router.post('/run', async (_req, res) => {
  const secret = _req.headers['x-migration-secret'];
  if (secret !== process.env.BETTER_AUTH_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const results: string[] = [];

  try {
    // Add stripe_customer_id column to users
    await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`);
    results.push('Added stripe_customer_id column to users');

    // Create credit_transactions table
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

    // Create index
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id)`);
    results.push('Created index idx_credit_transactions_user_id');

    res.json({ success: true, results });
  } catch (err: any) {
    console.error('Migration error:', err);
    res.status(500).json({ error: err.message, results });
  }
});

export default router;
