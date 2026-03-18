console.log('STEP 1: starting');
process.env.SUPABASE_DATABASE_URL = 'postgresql://postgres.rhzqkhszlcitptbvrafn:KriptikDB2026abc@aws-1-us-east-1.pooler.supabase.com:6543/postgres';
process.env.BETTER_AUTH_SECRET = 'hsBZ32qUfBRte72bOz2HJwDaHCfrpzMa';
console.log('STEP 2: env set');

try {
  const express = await import('express');
  console.log('STEP 3: express loaded');

  const cors = await import('cors');
  console.log('STEP 4: cors loaded');

  console.log('STEP 5: importing better-auth...');
  const { toNodeHandler } = await import('better-auth/node');
  console.log('STEP 6: better-auth/node loaded');

  console.log('STEP 7: importing drizzle...');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  console.log('STEP 8: drizzle loaded');

  console.log('STEP 9: importing postgres...');
  const pg = await import('postgres');
  console.log('STEP 10: postgres loaded');

  console.log('STEP 11: creating db connection...');
  const sql = pg.default(process.env.SUPABASE_DATABASE_URL, { prepare: false });
  const db = drizzle(sql);
  console.log('STEP 12: db created');

  const app = express.default();
  app.use(cors.default({ origin: true, credentials: true }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.listen(3001, () => console.log('STEP 13: SERVER LISTENING ON 3001'));
} catch(e) {
  console.error('CRASH:', e.message);
  console.error(e.stack);
}
