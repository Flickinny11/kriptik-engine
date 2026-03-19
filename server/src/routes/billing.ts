import { Router, type Request, type Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import Stripe from 'stripe';
import { db } from '../db.js';
import { users, creditTransactions } from '../schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

// ── Stripe Client ──────────────────────────────────────────────────
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// Credit package definitions — mapped to existing Stripe topup price IDs
const CREDIT_PACKAGES: Record<string, { credits: number; label: string; envKey: string }> = {
  topup_100:  { credits: 100,  label: '100 Credits',  envKey: 'STRIPE_TOPUP_TOPUP_100_PRICE' },
  topup_300:  { credits: 300,  label: '300 Credits',  envKey: 'STRIPE_TOPUP_TOPUP_300_PRICE' },
  topup_500:  { credits: 500,  label: '500 Credits',  envKey: 'STRIPE_TOPUP_TOPUP_500_PRICE' },
  topup_1000: { credits: 1000, label: '1,000 Credits', envKey: 'STRIPE_TOPUP_TOPUP_1000_PRICE' },
  topup_2500: { credits: 2500, label: '2,500 Credits', envKey: 'STRIPE_TOPUP_TOPUP_2500_PRICE' },
};

const router = Router();

// ── GET /api/billing/packages ──────────────────────────────────────
// Returns available credit packages (no auth required — public info)
router.get('/packages', (_req, res) => {
  const packages = Object.entries(CREDIT_PACKAGES).map(([id, pkg]) => ({
    id,
    credits: pkg.credits,
    label: pkg.label,
    available: !!process.env[pkg.envKey],
  }));
  res.json({ packages });
});

// ── GET /api/billing/balance ───────────────────────────────────────
// Returns user's credit balance
router.get('/balance', requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const [user] = await db.select({ credits: users.credits, tier: users.tier })
      .from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ credits: user.credits ?? 0, tier: user.tier ?? 'free' });
  } catch (err) {
    console.error('Failed to get balance:', err);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// ── POST /api/billing/checkout ─────────────────────────────────────
// Creates a Stripe Checkout session for a credit package purchase
router.post('/checkout', requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  try {
    const { packageId } = req.body;
    const pkg = CREDIT_PACKAGES[packageId];
    if (!pkg) return res.status(400).json({ error: 'Invalid package' });

    const priceId = process.env[pkg.envKey];
    if (!priceId) return res.status(503).json({ error: 'Package price not configured' });

    const userId = req.user!.id;
    const userEmail = req.user!.email;

    // Get or create Stripe customer
    let [user] = await db.select({ stripeCustomerId: users.stripeCustomerId })
      .from(users).where(eq(users.id, userId)).limit(1);

    let customerId = user?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { kriptikUserId: userId },
      });
      customerId = customer.id;
      await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId));
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/settings?tab=billing&checkout=success`,
      cancel_url: `${frontendUrl}/settings?tab=billing&checkout=cancelled`,
      metadata: {
        kriptikUserId: userId,
        packageId,
        credits: String(pkg.credits),
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Failed to create checkout session:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ── POST /api/billing/portal ───────────────────────────────────────
// Creates a Stripe Customer Portal session for payment method management
router.post('/portal', requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  try {
    const [user] = await db.select({ stripeCustomerId: users.stripeCustomerId })
      .from(users).where(eq(users.id, req.user!.id)).limit(1);

    if (!user?.stripeCustomerId) {
      return res.status(400).json({ error: 'No billing account found. Make a purchase first.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${frontendUrl}/settings?tab=billing`,
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    console.error('Failed to create portal session:', err);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// ── GET /api/billing/history ───────────────────────────────────────
// Returns credit transaction history
router.get('/history', requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const transactions = await db.select().from(creditTransactions)
      .where(eq(creditTransactions.userId, req.user!.id))
      .orderBy(sql`${creditTransactions.createdAt} DESC`)
      .limit(100);

    res.json({ transactions });
  } catch (err) {
    console.error('Failed to get billing history:', err);
    res.status(500).json({ error: 'Failed to get billing history' });
  }
});

// ── POST /api/billing/webhook ──────────────────────────────────────
// Stripe webhook handler — NO auth middleware (verified by signature)
// NOTE: This endpoint needs raw body, registered separately in index.ts
export async function handleStripeWebhook(req: Request, res: Response) {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !webhookSecret) {
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent((req as any).rawBody || req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.kriptikUserId;
    const credits = parseInt(session.metadata?.credits || '0', 10);
    const packageId = session.metadata?.packageId || 'unknown';

    if (!userId || !credits) {
      console.error('Webhook missing metadata:', session.metadata);
      return res.status(400).json({ error: 'Missing metadata' });
    }

    try {
      // Get current balance
      const [user] = await db.select({ credits: users.credits })
        .from(users).where(eq(users.id, userId)).limit(1);
      if (!user) {
        console.error('Webhook: user not found:', userId);
        return res.status(400).json({ error: 'User not found' });
      }

      const currentBalance = user.credits ?? 0;
      const newBalance = currentBalance + credits;

      // Update credits
      await db.update(users).set({
        credits: newBalance,
        updatedAt: new Date(),
      }).where(eq(users.id, userId));

      // Record transaction
      await db.insert(creditTransactions).values({
        id: uuid(),
        userId,
        type: 'purchase',
        amount: credits,
        balance: newBalance,
        description: `Purchased ${CREDIT_PACKAGES[packageId]?.label || credits + ' credits'}`,
        stripeSessionId: session.id,
      });

      console.log(`Credited ${credits} to user ${userId}. New balance: ${newBalance}`);
    } catch (err) {
      console.error('Failed to credit user:', err);
      return res.status(500).json({ error: 'Failed to process payment' });
    }
  }

  res.json({ received: true });
}

export default router;
