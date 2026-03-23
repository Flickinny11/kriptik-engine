/**
 * Service Registry — comprehensive catalog of developer services KripTik
 * can connect users to via MCP or browser-agent fallback.
 *
 * Each entry includes identity, branding, MCP status, pricing tiers,
 * and instance model so the UI and agents know how to work with it.
 */

import type { ServiceRegistryEntry, ServiceCategory } from './registry-types.js';

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

export const SERVICE_REGISTRY: ServiceRegistryEntry[] = [
  // =========================================================================
  // DATABASES
  // =========================================================================
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Open-source Firebase alternative with Postgres, auth, storage, and edge functions',
    websiteUrl: 'https://supabase.com',
    category: 'database',
    iconSlug: 'supabase',
    brandColor: '#3ECF8E',
    mcp: { url: 'https://mcp.supabase.com/mcp', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Free', price: 0, description: '500 MB database, 1 GB file storage, 50K monthly active users' },
      { name: 'Pro', price: 25, description: '8 GB database, 100 GB storage, no project pausing' },
      { name: 'Team', price: 599, description: 'SOC2, priority support, SLA' },
      { name: 'Enterprise', price: -1, description: 'Custom limits, dedicated support, BAA' },
    ],
    tags: ['postgres', 'realtime', 'auth', 'storage', 'edge-functions'],
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Serverless Postgres with branching, autoscaling, and bottomless storage',
    websiteUrl: 'https://neon.tech',
    category: 'database',
    iconSlug: 'neon',
    brandColor: '#00E599',
    mcp: { url: 'https://mcp.neon.tech/mcp', authMethod: 'oauth', sseFallbackUrl: 'https://mcp.neon.tech/sse' },
    browserFallbackAvailable: false,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Free', price: 0, description: '0.5 GiB storage, 1 project, autosuspend after 5 min' },
      { name: 'Launch', price: 19, description: '10 GiB storage, 10 projects, 300 compute hours' },
      { name: 'Scale', price: 69, description: '50 GiB storage, 50 projects, 750 compute hours, read replicas' },
      { name: 'Enterprise', price: -1, description: 'Custom limits, SLA, dedicated support' },
    ],
    tags: ['postgres', 'serverless', 'branching', 'autoscaling'],
  },
  {
    id: 'mongodb-atlas',
    name: 'MongoDB Atlas',
    description: 'Managed MongoDB with full-text search, vector search, and global clusters',
    websiteUrl: 'https://www.mongodb.com/atlas',
    category: 'database',
    iconSlug: 'mongodb',
    brandColor: '#47A248',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Free', price: 0, description: '512 MB storage, shared cluster' },
      { name: 'Serverless', price: 0, description: 'Pay per operation, auto-scales to zero' },
      { name: 'Dedicated', price: 57, description: 'Dedicated clusters, advanced security, analytics' },
    ],
    tags: ['nosql', 'document', 'search', 'vector', 'atlas'],
  },
  {
    id: 'upstash',
    name: 'Upstash',
    description: 'Serverless Redis and Kafka with per-request pricing',
    websiteUrl: 'https://upstash.com',
    category: 'database',
    iconSlug: 'upstash',
    brandColor: '#00E9A3',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Free', price: 0, description: '10K commands/day, 256 MB storage' },
      { name: 'Pay as you go', price: 0, description: '$0.2 per 100K commands, 1 GB storage included' },
      { name: 'Pro 2K', price: 280, description: '2K max commands/sec, unlimited storage' },
      { name: 'Enterprise', price: -1, description: 'Custom deployment, VPC peering, SLA' },
    ],
    tags: ['redis', 'kafka', 'serverless', 'cache', 'rate-limiting'],
  },
  {
    id: 'planetscale',
    name: 'PlanetScale',
    description: 'MySQL-compatible serverless database with branching and zero-downtime schema changes',
    websiteUrl: 'https://planetscale.com',
    category: 'database',
    iconSlug: 'planetscale',
    brandColor: '#000000',
    mcp: { url: 'https://mcp.planetscale.com/mcp', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Scaler', price: 29, description: '10 GB storage, 1 billion row reads/mo' },
      { name: 'Scaler Pro', price: 39, description: '10 GB storage, dedicated resources, read replicas' },
      { name: 'Enterprise', price: -1, description: 'Dedicated single-tenant, SLA, audit logging' },
    ],
    tags: ['mysql', 'vitess', 'branching', 'serverless'],
  },
  {
    id: 'turso',
    name: 'Turso',
    description: 'Edge-hosted SQLite built on libSQL with embedded replicas',
    websiteUrl: 'https://turso.tech',
    category: 'database',
    iconSlug: 'turso',
    brandColor: '#4FF8D2',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Starter', price: 0, description: '9 GB storage, 500 databases, 25 groups' },
      { name: 'Scaler', price: 29, description: '24 GB storage, 10K databases, 6 groups' },
      { name: 'Enterprise', price: -1, description: 'Custom limits, priority support' },
    ],
    tags: ['sqlite', 'edge', 'embedded-replicas', 'libsql'],
  },
  {
    id: 'pinecone',
    name: 'Pinecone',
    description: 'Managed vector database for AI applications with hybrid search',
    websiteUrl: 'https://www.pinecone.io',
    category: 'database',
    iconSlug: 'pinecone',
    brandColor: '#000000',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'api-key-per-project',
    pricing: [
      { name: 'Starter', price: 0, description: '2 GB storage, 100K vectors, community support' },
      { name: 'Standard', price: 0, description: 'Pay per use, unlimited namespaces, serverless index' },
      { name: 'Enterprise', price: -1, description: 'Private endpoints, HIPAA, SOC2, SSO' },
    ],
    tags: ['vector', 'embeddings', 'similarity-search', 'rag'],
  },
  {
    id: 'qdrant',
    name: 'Qdrant',
    description: 'High-performance vector search engine with filtering and payload storage',
    websiteUrl: 'https://qdrant.tech',
    category: 'database',
    iconSlug: 'qdrant',
    brandColor: '#DC244C',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'api-key-per-project',
    pricing: [
      { name: 'Free', price: 0, description: '1 GB RAM, 4 GB disk, 1 node' },
      { name: 'Hybrid Cloud', price: 0, description: 'Pay per use, your infrastructure' },
      { name: 'Enterprise', price: -1, description: 'Managed, dedicated, SLA' },
    ],
    tags: ['vector', 'search', 'filtering', 'recommendations'],
  },

  // =========================================================================
  // HOSTING & DEPLOYMENT
  // =========================================================================
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Frontend cloud for deploying web apps with edge functions and serverless',
    websiteUrl: 'https://vercel.com',
    category: 'hosting',
    iconSlug: 'vercel',
    brandColor: '#000000',
    mcp: { url: 'https://mcp.vercel.com', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Hobby', price: 0, description: 'Personal projects, 100 GB bandwidth, serverless functions' },
      { name: 'Pro', price: 20, description: '1 TB bandwidth, preview deployments, advanced analytics' },
      { name: 'Enterprise', price: -1, description: 'SLA, advanced security, dedicated support' },
    ],
    tags: ['nextjs', 'edge', 'serverless', 'cdn', 'preview-deployments'],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Global cloud network with Workers, Pages, R2 storage, and D1 database',
    websiteUrl: 'https://www.cloudflare.com',
    category: 'hosting',
    iconSlug: 'cloudflare',
    brandColor: '#F38020',
    mcp: { url: 'https://mcp.cloudflare.com/mcp', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Free', price: 0, description: '100K Worker requests/day, 1 GB R2 storage' },
      { name: 'Pro', price: 20, description: 'WAF, image optimization, 10M Worker requests/mo' },
      { name: 'Business', price: 200, description: 'Advanced DDoS, custom SSL, SLA' },
      { name: 'Enterprise', price: -1, description: 'Custom limits, dedicated support, 100% SLA' },
    ],
    tags: ['workers', 'pages', 'r2', 'd1', 'cdn', 'edge'],
  },
  {
    id: 'render',
    name: 'Render',
    description: 'Unified cloud to build and run apps with auto-deploys from Git',
    websiteUrl: 'https://render.com',
    category: 'hosting',
    iconSlug: 'render',
    brandColor: '#46E3B7',
    mcp: { url: 'https://mcp.render.com/mcp', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Free', price: 0, description: 'Static sites, 750 hours web services, auto-suspend' },
      { name: 'Individual', price: 7, description: 'Persistent disk, custom domains, SSH access' },
      { name: 'Team', price: 19, description: 'Collaboration, previews, DDoS protection' },
      { name: 'Enterprise', price: -1, description: 'Dedicated infra, VPC, compliance' },
    ],
    tags: ['docker', 'auto-deploy', 'managed', 'postgres'],
  },
  {
    id: 'railway',
    name: 'Railway',
    description: 'Infrastructure platform for deploying apps with instant provisioning',
    websiteUrl: 'https://railway.app',
    category: 'hosting',
    iconSlug: 'railway',
    brandColor: '#0B0D0E',
    mcp: null,
    browserFallbackAvailable: true,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Trial', price: 0, description: '$5 credit, no credit card required' },
      { name: 'Hobby', price: 5, description: '$5 included usage, 8 GB RAM per service' },
      { name: 'Pro', price: 20, description: '32 GB RAM, multiple environments, team members' },
      { name: 'Enterprise', price: -1, description: 'Private networking, audit logs, SSO' },
    ],
    tags: ['instant-deploy', 'postgres', 'redis', 'cron'],
  },
  {
    id: 'fly-io',
    name: 'Fly.io',
    description: 'Run full-stack apps close to users with global edge deployment',
    websiteUrl: 'https://fly.io',
    category: 'hosting',
    iconSlug: 'flydotio',
    brandColor: '#7B3BE2',
    mcp: null,
    browserFallbackAvailable: true,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Hobby', price: 0, description: '3 shared VMs, 160 GB bandwidth, 1 GB volumes' },
      { name: 'Launch', price: 0, description: 'Pay per use, dedicated IPv4, autoscaling' },
      { name: 'Scale', price: 0, description: 'Pay per use, more support, SOC2' },
      { name: 'Enterprise', price: -1, description: 'Custom SLA, dedicated support' },
    ],
    tags: ['containers', 'edge', 'global', 'gpu', 'postgres'],
  },
  {
    id: 'heroku',
    name: 'Heroku',
    description: 'Cloud platform for building, running, and operating applications',
    websiteUrl: 'https://www.heroku.com',
    category: 'hosting',
    iconSlug: 'heroku',
    brandColor: '#430098',
    mcp: { url: 'https://mcp.heroku.com/mcp', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Eco', price: 5, description: 'Shared dynos, 1K dyno hours/mo, sleep after 30 min' },
      { name: 'Basic', price: 7, description: 'Always-on, 512 MB RAM' },
      { name: 'Standard', price: 25, description: 'Horizontal scaling, preboot, metrics' },
      { name: 'Performance', price: 250, description: '14 GB RAM, dedicated compute' },
    ],
    tags: ['paas', 'heroku-postgres', 'add-ons', 'pipelines'],
  },
  {
    id: 'digitalocean',
    name: 'DigitalOcean',
    description: 'Cloud infrastructure with Droplets, Kubernetes, managed databases, and App Platform',
    websiteUrl: 'https://www.digitalocean.com',
    category: 'hosting',
    iconSlug: 'digitalocean',
    brandColor: '#0080FF',
    mcp: { url: 'https://mcp.digitalocean.com/mcp', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Basic Droplet', price: 4, description: '512 MB RAM, 10 GB SSD, 500 GB transfer' },
      { name: 'Regular Droplet', price: 6, description: '1 GB RAM, 25 GB SSD, 1 TB transfer' },
      { name: 'Premium', price: 8, description: '1 GB RAM, NVMe SSD, premium CPU' },
    ],
    tags: ['vps', 'kubernetes', 'managed-db', 'app-platform', 'spaces'],
  },

  // =========================================================================
  // AUTHENTICATION
  // =========================================================================
  {
    id: 'clerk',
    name: 'Clerk',
    description: 'Drop-in authentication and user management with embeddable UI components',
    websiteUrl: 'https://clerk.com',
    category: 'auth',
    iconSlug: 'clerk',
    brandColor: '#6C47FF',
    mcp: { url: 'https://mcp.clerk.com/mcp', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Free', price: 0, description: '10K monthly active users, pre-built components' },
      { name: 'Pro', price: 25, description: 'Unlimited MAUs at $0.02/MAU, custom branding, allowlists' },
      { name: 'Enterprise', price: -1, description: 'Enhanced SLA, custom contract, SSO enforcement' },
    ],
    tags: ['authentication', 'user-management', 'social-login', 'sso'],
  },
  {
    id: 'auth0',
    name: 'Auth0',
    description: 'Identity platform with universal login, MFA, and machine-to-machine auth',
    websiteUrl: 'https://auth0.com',
    category: 'auth',
    iconSlug: 'auth0',
    brandColor: '#EB5424',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Free', price: 0, description: '25K MAUs, social connections, universal login' },
      { name: 'Essentials', price: 35, description: 'Custom domains, MFA, user roles' },
      { name: 'Professional', price: 240, description: 'Organizations, custom DB connections, admin roles' },
      { name: 'Enterprise', price: -1, description: 'Unlimited admins, custom SLA, dedicated support' },
    ],
    tags: ['authentication', 'oauth', 'mfa', 'social-login', 'jwt'],
  },

  // =========================================================================
  // PAYMENTS
  // =========================================================================
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Payment processing, subscriptions, invoicing, and financial infrastructure',
    websiteUrl: 'https://stripe.com',
    category: 'payments',
    iconSlug: 'stripe',
    brandColor: '#635BFF',
    mcp: { url: 'https://mcp.stripe.com', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'api-key-per-project',
    pricing: [
      { name: 'Integrated', price: 0, description: '2.9% + 30c per transaction, no monthly fee' },
      { name: 'Custom', price: -1, description: 'Volume discounts, interchange-plus pricing' },
    ],
    tags: ['payments', 'subscriptions', 'invoicing', 'checkout', 'connect'],
  },

  // =========================================================================
  // AI & MACHINE LEARNING
  // =========================================================================
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4, DALL-E, Whisper, and Codex APIs for AI-powered applications',
    websiteUrl: 'https://openai.com',
    category: 'ai-ml',
    iconSlug: 'openai',
    brandColor: '#412991',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'api-key-per-project',
    pricing: [
      { name: 'Free', price: 0, description: '$5 starter credit, rate-limited' },
      { name: 'Pay as you go', price: 0, description: 'Per-token pricing, varies by model' },
      { name: 'Enterprise', price: -1, description: 'Custom rate limits, dedicated support, SOC2' },
    ],
    tags: ['llm', 'gpt', 'dall-e', 'whisper', 'embeddings', 'chat'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude AI models for analysis, coding, math, and agentic tasks',
    websiteUrl: 'https://www.anthropic.com',
    category: 'ai-ml',
    iconSlug: 'anthropic',
    brandColor: '#D4A27F',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'api-key-per-project',
    pricing: [
      { name: 'Pay as you go', price: 0, description: 'Per-token pricing, varies by model' },
      { name: 'Enterprise', price: -1, description: 'Custom rate limits, dedicated support, SSO' },
    ],
    tags: ['llm', 'claude', 'coding', 'analysis', 'agents'],
  },
  {
    id: 'fal-ai',
    name: 'fal.ai',
    description: 'Fastest inference platform for generative AI models with 1000+ models',
    websiteUrl: 'https://fal.ai',
    category: 'ai-ml',
    iconSlug: 'fal',
    brandColor: '#6366F1',
    mcp: { url: 'https://mcp.fal.ai/mcp', authMethod: 'bearer-token' },
    browserFallbackAvailable: true,
    instanceModel: 'api-key-per-project',
    pricing: [
      { name: 'Free', price: 0, description: '$10 free credit, community models' },
      { name: 'Pay as you go', price: 0, description: 'Per-request pricing, varies by model' },
      { name: 'Enterprise', price: -1, description: 'Dedicated GPUs, private models, SLA' },
    ],
    tags: ['image-generation', 'video', 'audio', 'fast-inference', 'flux'],
  },
  {
    id: 'replicate',
    name: 'Replicate',
    description: 'Run and fine-tune open-source AI models with a simple API',
    websiteUrl: 'https://replicate.com',
    category: 'ai-ml',
    iconSlug: 'replicate',
    brandColor: '#3D3D3D',
    mcp: { url: 'https://mcp.replicate.com', authMethod: 'bearer-token' },
    browserFallbackAvailable: true,
    instanceModel: 'api-key-per-project',
    pricing: [
      { name: 'Pay as you go', price: 0, description: 'Per-second GPU pricing, no minimum' },
      { name: 'Enterprise', price: -1, description: 'Private models, dedicated hardware, SLA' },
    ],
    tags: ['open-source-models', 'image-generation', 'llm', 'fine-tuning'],
  },
  {
    id: 'runpod',
    name: 'RunPod',
    description: 'GPU cloud for AI inference and training with serverless endpoints',
    websiteUrl: 'https://www.runpod.io',
    category: 'ai-ml',
    iconSlug: 'runpod',
    brandColor: '#673AB7',
    mcp: null,
    browserFallbackAvailable: true,
    instanceModel: 'api-key-per-project',
    pricing: [
      { name: 'Community', price: 0, description: 'Spot GPUs, $0.20/hr for RTX 3090' },
      { name: 'Secure', price: 0, description: 'On-demand GPUs, $0.44/hr for RTX 4090' },
      { name: 'Serverless', price: 0, description: 'Per-second billing, auto-scaling, cold-start optimization' },
    ],
    tags: ['gpu', 'training', 'inference', 'serverless', 'pods'],
  },

  // =========================================================================
  // EMAIL — User email (MCP integration for auto-verification)
  // =========================================================================
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Google email — connect for automatic verification during service signups',
    websiteUrl: 'https://mail.google.com',
    category: 'email',
    iconSlug: 'gmail',
    brandColor: '#EA4335',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'shared',
    pricing: [
      { name: 'Free', price: 0, description: 'Personal Gmail account' },
    ],
    tags: ['email', 'verification', 'google'],
  },
  {
    id: 'microsoft-outlook',
    name: 'Outlook',
    description: 'Microsoft email — connect for automatic verification during service signups',
    websiteUrl: 'https://outlook.live.com',
    category: 'email',
    iconSlug: 'microsoftoutlook',
    brandColor: '#0078D4',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'shared',
    pricing: [
      { name: 'Free', price: 0, description: 'Personal Outlook/Hotmail account' },
    ],
    tags: ['email', 'verification', 'microsoft'],
  },

  // =========================================================================
  // EMAIL — Transactional email APIs
  // =========================================================================
  {
    id: 'resend',
    name: 'Resend',
    description: 'Developer-first email API with React email templates',
    websiteUrl: 'https://resend.com',
    category: 'email',
    iconSlug: 'resend',
    brandColor: '#000000',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'api-key-per-project',
    pricing: [
      { name: 'Free', price: 0, description: '3K emails/mo, 1 domain, 100 contacts' },
      { name: 'Pro', price: 20, description: '50K emails/mo, custom domains, webhooks' },
      { name: 'Enterprise', price: 60, description: '100K emails/mo, dedicated IP, SSO' },
    ],
    tags: ['transactional', 'react-email', 'smtp', 'webhooks'],
  },
  {
    id: 'postmark',
    name: 'Postmark',
    description: 'Reliable transactional email delivery with message streams',
    websiteUrl: 'https://postmarkapp.com',
    category: 'email',
    iconSlug: 'postmark',
    brandColor: '#FFDE00',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'api-key-per-project',
    pricing: [
      { name: 'Free', price: 0, description: '100 emails/mo' },
      { name: '10K', price: 15, description: '10K emails/mo, message streams' },
      { name: '50K', price: 55, description: '50K emails/mo, dedicated IP available' },
      { name: '125K', price: 105, description: '125K emails/mo, priority support' },
    ],
    tags: ['transactional', 'inbound', 'templates', 'deliverability'],
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    description: 'Email delivery service for transactional and marketing emails',
    websiteUrl: 'https://sendgrid.com',
    category: 'email',
    iconSlug: 'sendgrid',
    brandColor: '#1A82E2',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'api-key-per-project',
    pricing: [
      { name: 'Free', price: 0, description: '100 emails/day' },
      { name: 'Essentials', price: 20, description: '50K emails/mo, APIs, webhooks' },
      { name: 'Pro', price: 90, description: '100K emails/mo, dedicated IP, sub-user management' },
    ],
    tags: ['transactional', 'marketing', 'smtp', 'templates'],
  },

  // =========================================================================
  // MONITORING & OBSERVABILITY
  // =========================================================================
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Application monitoring with error tracking, performance, and session replay',
    websiteUrl: 'https://sentry.io',
    category: 'monitoring',
    iconSlug: 'sentry',
    brandColor: '#362D59',
    mcp: { url: 'https://mcp.sentry.dev/mcp', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'shared',
    pricing: [
      { name: 'Developer', price: 0, description: '5K errors, 10K transactions, 1 user' },
      { name: 'Team', price: 26, description: '50K errors, 100K transactions, unlimited users' },
      { name: 'Business', price: 80, description: '100K errors, custom dashboards, integrations' },
      { name: 'Enterprise', price: -1, description: 'Unlimited events, SLA, SOC2, cross-project' },
    ],
    tags: ['error-tracking', 'performance', 'session-replay', 'profiling'],
  },
  {
    id: 'datadog',
    name: 'Datadog',
    description: 'Cloud-scale monitoring and security with metrics, traces, logs, and synthetics',
    websiteUrl: 'https://www.datadoghq.com',
    category: 'monitoring',
    iconSlug: 'datadog',
    brandColor: '#632CA6',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'shared',
    pricing: [
      { name: 'Free', price: 0, description: '5 hosts, 1-day retention, core metrics' },
      { name: 'Pro', price: 15, description: 'Per host/mo, 15-month retention, 350+ integrations' },
      { name: 'Enterprise', price: 23, description: 'Per host/mo, custom metrics, SLA' },
    ],
    tags: ['apm', 'logs', 'metrics', 'dashboards', 'alerting'],
  },

  // =========================================================================
  // COMMUNICATION
  // =========================================================================
  {
    id: 'twilio',
    name: 'Twilio',
    description: 'Communication APIs for SMS, voice, video, and WhatsApp',
    websiteUrl: 'https://www.twilio.com',
    category: 'communication',
    iconSlug: 'twilio',
    brandColor: '#F22F46',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'api-key-per-project',
    pricing: [
      { name: 'Pay as you go', price: 0, description: 'SMS from $0.0079/msg, voice from $0.014/min' },
      { name: 'Volume discounts', price: -1, description: 'Custom pricing for high-volume usage' },
    ],
    tags: ['sms', 'voice', 'video', 'whatsapp', 'verify'],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Business messaging platform with channels, apps, and workflow automation',
    websiteUrl: 'https://slack.com',
    category: 'communication',
    iconSlug: 'slack',
    brandColor: '#4A154B',
    mcp: { url: 'https://mcp.slack.com/mcp', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'shared',
    pricing: [
      { name: 'Free', price: 0, description: '90-day message history, 10 app integrations' },
      { name: 'Pro', price: 8, description: 'Unlimited history, group calls, app integrations' },
      { name: 'Business+', price: 13, description: 'SAML SSO, data exports, compliance' },
      { name: 'Enterprise Grid', price: -1, description: 'Org-wide deployment, custom policies' },
    ],
    tags: ['messaging', 'channels', 'bots', 'workflows', 'integrations'],
  },

  // =========================================================================
  // DEVELOPER TOOLS
  // =========================================================================
  {
    id: 'github',
    name: 'GitHub',
    description: 'Code hosting, version control, CI/CD, and developer collaboration',
    websiteUrl: 'https://github.com',
    category: 'devtools',
    iconSlug: 'github',
    brandColor: '#181717',
    mcp: { url: 'https://api.githubcopilot.com/mcp/', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'shared',
    pricing: [
      { name: 'Free', price: 0, description: 'Unlimited repos, 500 MB packages, 2K CI/CD minutes' },
      { name: 'Team', price: 4, description: '2 GB packages, 3K CI/CD minutes, code owners' },
      { name: 'Enterprise', price: 21, description: 'SAML, advanced auditing, GitHub Connect' },
    ],
    tags: ['git', 'repos', 'actions', 'packages', 'copilot', 'ci-cd'],
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Streamlined issue tracking and project management for software teams',
    websiteUrl: 'https://linear.app',
    category: 'devtools',
    iconSlug: 'linear',
    brandColor: '#5E6AD2',
    mcp: { url: 'https://mcp.linear.app/mcp', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'shared',
    pricing: [
      { name: 'Free', price: 0, description: 'Unlimited issues, 250 active issues per team' },
      { name: 'Standard', price: 8, description: 'Unlimited issues, integrations, guest access' },
      { name: 'Plus', price: 14, description: 'Advanced analytics, SLA tracking, automations' },
      { name: 'Enterprise', price: -1, description: 'SAML SSO, SCIM, audit log, priority support' },
    ],
    tags: ['issue-tracking', 'project-management', 'roadmaps', 'cycles'],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Connected workspace for docs, wikis, projects, and knowledge management',
    websiteUrl: 'https://www.notion.so',
    category: 'devtools',
    iconSlug: 'notion',
    brandColor: '#000000',
    mcp: { url: 'https://mcp.notion.so/mcp', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'shared',
    pricing: [
      { name: 'Free', price: 0, description: '10 guest collaborators, 5 MB file uploads' },
      { name: 'Plus', price: 10, description: 'Unlimited blocks, file uploads, 30-day history' },
      { name: 'Business', price: 18, description: 'SAML SSO, private spaces, bulk export' },
      { name: 'Enterprise', price: -1, description: 'Advanced security, audit log, SCIM' },
    ],
    tags: ['docs', 'wiki', 'databases', 'ai-assist', 'knowledge-base'],
  },
  {
    id: 'atlassian',
    name: 'Atlassian',
    description: 'Jira for project tracking, Confluence for documentation, and Rovo AI',
    websiteUrl: 'https://www.atlassian.com',
    category: 'devtools',
    iconSlug: 'atlassian',
    brandColor: '#0052CC',
    mcp: { url: 'https://mcp.atlassian.com/v1/mcp', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'shared',
    pricing: [
      { name: 'Free', price: 0, description: '10 users, 2 GB storage, community support' },
      { name: 'Standard', price: 8, description: '35K users, 250 GB storage, audit logs' },
      { name: 'Premium', price: 15, description: 'Advanced planning, AI, unlimited storage' },
      { name: 'Enterprise', price: -1, description: 'Org-wide admin, Atlassian Guard, SLA' },
    ],
    tags: ['jira', 'confluence', 'project-management', 'agile'],
  },

  // =========================================================================
  // DESIGN
  // =========================================================================
  {
    id: 'figma',
    name: 'Figma',
    description: 'Collaborative design tool for UI/UX with Dev Mode and variables',
    websiteUrl: 'https://www.figma.com',
    category: 'design',
    iconSlug: 'figma',
    brandColor: '#F24E1E',
    mcp: { url: 'https://mcp.figma.com/mcp', authMethod: 'oauth' },
    browserFallbackAvailable: false,
    instanceModel: 'shared',
    pricing: [
      { name: 'Starter', price: 0, description: '3 Figma and 3 FigJam files, unlimited viewers' },
      { name: 'Professional', price: 15, description: 'Unlimited files, team libraries, Dev Mode' },
      { name: 'Organization', price: 45, description: 'SSO, branching, analytics, centralized admin' },
      { name: 'Enterprise', price: 75, description: 'Advanced security, dedicated CSM' },
    ],
    tags: ['ui-design', 'prototyping', 'design-system', 'dev-mode', 'components'],
  },

  // =========================================================================
  // STORAGE
  // =========================================================================
  {
    id: 'aws',
    name: 'AWS',
    description: 'Amazon Web Services cloud platform with 200+ services',
    websiteUrl: 'https://aws.amazon.com',
    category: 'storage',
    iconSlug: 'amazonwebservices',
    brandColor: '#FF9900',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Free Tier', price: 0, description: '12-month free tier for 100+ services' },
      { name: 'Pay as you go', price: 0, description: 'Per-service pricing, no commitments' },
      { name: 'Savings Plans', price: -1, description: 'Commitment discounts, reserved capacity' },
    ],
    tags: ['s3', 'lambda', 'ec2', 'rds', 'dynamodb', 'cloudfront'],
  },
  {
    id: 'firebase',
    name: 'Firebase',
    description: 'Google app development platform with auth, database, hosting, and analytics',
    websiteUrl: 'https://firebase.google.com',
    category: 'storage',
    iconSlug: 'firebase',
    brandColor: '#DD2C00',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'project-per-project',
    pricing: [
      { name: 'Spark', price: 0, description: '1 GiB Firestore, 10 GB hosting, 2M Cloud Function invocations' },
      { name: 'Blaze', price: 0, description: 'Pay as you go, all features, no limits' },
    ],
    tags: ['firestore', 'auth', 'hosting', 'analytics', 'cloud-functions', 'storage'],
  },

  // =========================================================================
  // ANALYTICS
  // =========================================================================
  {
    id: 'amplitude',
    name: 'Amplitude',
    description: 'Product analytics platform with behavioral insights and experimentation',
    websiteUrl: 'https://amplitude.com',
    category: 'analytics',
    iconSlug: 'amplitude',
    brandColor: '#1D2A3A',
    mcp: null,
    browserFallbackAvailable: false,
    instanceModel: 'shared',
    pricing: [
      { name: 'Starter', price: 0, description: '50K MTUs, core analytics, unlimited users' },
      { name: 'Plus', price: 49, description: 'Advanced analytics, 1K MTUs base, data governance' },
      { name: 'Enterprise', price: -1, description: 'Custom events, SSO, dedicated support' },
    ],
    tags: ['product-analytics', 'events', 'cohorts', 'experimentation', 'cdp'],
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Get a service by its unique ID */
export function getServiceById(id: string): ServiceRegistryEntry | undefined {
  return SERVICE_REGISTRY.find((s) => s.id === id);
}

/** Get all services in a category */
export function getServicesByCategory(category: ServiceCategory): ServiceRegistryEntry[] {
  return SERVICE_REGISTRY.filter((s) => s.category === category);
}

/** Search services by name, description, or tags */
export function searchServices(query: string): ServiceRegistryEntry[] {
  const lower = query.toLowerCase();
  return SERVICE_REGISTRY.filter(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower) ||
      s.tags.some((t) => t.includes(lower)),
  );
}

