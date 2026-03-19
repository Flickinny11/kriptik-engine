import { pgTable, text, boolean, integer, timestamp, jsonb, serial, uniqueIndex, index } from 'drizzle-orm/pg-core';

// ── Better Auth managed tables ──────────────────────────────────────

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  emailVerified: boolean('email_verified').default(false),
  image: text('image'),
  slug: text('slug').unique(),               // user's namespace for app URLs
  credits: integer('credits').default(500),
  tier: text('tier').default('free'),
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  scope: text('scope'),
  password: text('password'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Better Auth with usePlural expects: users, sessions, accounts, verifications
export const sessions = session;
export const accounts = account;

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const verifications = verification;

// ── App tables ──────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').default('idle'), // idle | building | complete | failed
  engineSessionId: text('engine_session_id'),
  brainDbPath: text('brain_db_path'),       // path to this project's brain.db
  sandboxPath: text('sandbox_path'),         // path to this project's sandbox directory
  // App hosting — {appSlug}.kriptik.app
  appSlug: text('app_slug'),                 // user-customizable subdomain
  isPublished: boolean('is_published').default(false),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishedVersion: integer('published_version').default(0),
  customDomain: text('custom_domain'),       // future: user's own domain
  previewUrl: text('preview_url'),           // Modal tunnel or dev server URL
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('projects_app_slug_unique').on(table.appSlug),
]);

// Encrypted credential storage — per user, per project, per service
export const credentials = pgTable('credentials', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  encryptedTokens: jsonb('encrypted_tokens').notNull(), // AES-256-GCM envelope
  providerUserId: text('provider_user_id'),
  providerEmail: text('provider_email'),
  status: text('status').default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('credentials_user_project_provider').on(table.userId, table.projectId, table.providerId),
]);

// Short-lived OAuth state tokens for PKCE flow
export const oauthStates = pgTable('oauth_states', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  providerId: text('provider_id').notNull(),
  projectId: text('project_id'),
  codeVerifier: text('code_verifier').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Credit transaction ledger — tracks all credit movements
export const creditTransactions = pgTable('credit_transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),             // 'purchase' | 'build_deduction' | 'bonus' | 'refund'
  amount: integer('amount').notNull(),       // positive = credits in, negative = credits out
  balance: integer('balance').notNull(),     // balance after this transaction
  description: text('description'),
  projectId: text('project_id'),
  stripeSessionId: text('stripe_session_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_credit_transactions_user_id').on(table.userId),
]);

// Append-only log of engine SSE events — for chat replay when user returns
export const buildEvents = pgTable('build_events', {
  id: serial('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  eventData: jsonb('event_data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_build_events_project_id').on(table.projectId),
]);
