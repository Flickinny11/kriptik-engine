/**
 * Provider Catalog — 150 OAuth/API-key provider definitions.
 *
 * Seeded into the `oauth_providers` DB table on first boot.
 * Each entry matches the schema in schema.ts `oauthProviders`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderAuthType = 'oauth2' | 'oauth2-pkce' | 'oauth1' | 'apikey';

export type ProviderCategory =
  | 'hosting'
  | 'version-control'
  | 'database'
  | 'auth'
  | 'payment'
  | 'communication'
  | 'analytics'
  | 'ci-cd'
  | 'cloud'
  | 'cms'
  | 'monitoring'
  | 'email'
  | 'ai-ml'
  | 'storage';

export interface DerivableCredential {
  method: 'from_token' | 'api_call' | 'from_token_response';
  endpoint?: string;
  jsonPath?: string;
  description: string;
}

export interface ProviderCatalogEntry {
  id: string;
  displayName: string;
  category: ProviderCategory;
  authType: ProviderAuthType;
  authorizationUrl: string | null;
  tokenUrl: string | null;
  revokeUrl: string | null;
  userInfoUrl: string | null;
  defaultScopes: string[];
  pkceRequired: boolean;
  logoSlug: string;
  docsUrl: string;
  derivableCredentials: Record<string, DerivableCredential> | null;
}

// ---------------------------------------------------------------------------
// Helper to build apikey-only entries concisely
// ---------------------------------------------------------------------------

function apikey(
  id: string,
  displayName: string,
  category: ProviderCategory,
  docsUrl: string,
  derivableCredentials?: Record<string, DerivableCredential> | null,
): ProviderCatalogEntry {
  return {
    id,
    displayName,
    category,
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: id,
    docsUrl,
    derivableCredentials: derivableCredentials ?? null,
  };
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [

  // =========================================================================
  // HOSTING (8)
  // =========================================================================

  {
    id: 'vercel',
    displayName: 'Vercel',
    category: 'hosting',
    authType: 'oauth2',
    authorizationUrl: 'https://vercel.com/integrations/new',
    tokenUrl: 'https://api.vercel.com/v2/oauth/access_token',
    revokeUrl: null,
    userInfoUrl: 'https://api.vercel.com/v2/user',
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'vercel',
    docsUrl: 'https://vercel.com/docs/rest-api',
    derivableCredentials: {
      VERCEL_TOKEN: { method: 'from_token', description: 'Vercel API access token' },
      VERCEL_TEAM_ID: {
        method: 'api_call',
        endpoint: 'https://api.vercel.com/v2/teams',
        jsonPath: '$.teams[0].id',
        description: 'Vercel team ID',
      },
      VERCEL_ORG_ID: {
        method: 'api_call',
        endpoint: 'https://api.vercel.com/v2/user',
        jsonPath: '$.user.id',
        description: 'Vercel org/user ID',
      },
    },
  },
  {
    id: 'netlify',
    displayName: 'Netlify',
    category: 'hosting',
    authType: 'oauth2',
    authorizationUrl: 'https://app.netlify.com/authorize',
    tokenUrl: 'https://api.netlify.com/oauth/token',
    revokeUrl: null,
    userInfoUrl: 'https://api.netlify.com/api/v1/user',
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'netlify',
    docsUrl: 'https://docs.netlify.com/api/get-started/',
    derivableCredentials: {
      NETLIFY_AUTH_TOKEN: { method: 'from_token', description: 'Netlify personal access token' },
      NETLIFY_SITE_ID: {
        method: 'api_call',
        endpoint: 'https://api.netlify.com/api/v1/sites',
        jsonPath: '$[0].id',
        description: 'Netlify site ID',
      },
    },
  },
  {
    id: 'heroku',
    displayName: 'Heroku',
    category: 'hosting',
    authType: 'oauth2',
    authorizationUrl: 'https://id.heroku.com/oauth/authorize',
    tokenUrl: 'https://id.heroku.com/oauth/token',
    revokeUrl: null,
    userInfoUrl: 'https://api.heroku.com/account',
    defaultScopes: ['global'],
    pkceRequired: false,
    logoSlug: 'heroku',
    docsUrl: 'https://devcenter.heroku.com/articles/oauth',
    derivableCredentials: {
      HEROKU_API_KEY: { method: 'from_token', description: 'Heroku API token' },
    },
  },
  {
    id: 'railway',
    displayName: 'Railway',
    category: 'hosting',
    authType: 'oauth2',
    authorizationUrl: 'https://railway.app/oauth/authorize',
    tokenUrl: 'https://railway.app/oauth/token',
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'railway',
    docsUrl: 'https://docs.railway.app/reference/public-api',
    derivableCredentials: {
      RAILWAY_TOKEN: { method: 'from_token', description: 'Railway API token' },
    },
  },
  {
    id: 'render',
    displayName: 'Render',
    category: 'hosting',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'render',
    docsUrl: 'https://docs.render.com/api',
    derivableCredentials: {
      RENDER_API_KEY: { method: 'from_token', description: 'Render API key' },
    },
  },
  {
    id: 'fly-io',
    displayName: 'Fly.io',
    category: 'hosting',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'fly-io',
    docsUrl: 'https://fly.io/docs/machines/api/',
    derivableCredentials: {
      FLY_API_TOKEN: { method: 'from_token', description: 'Fly.io auth token' },
    },
  },
  {
    id: 'cloudflare-pages',
    displayName: 'Cloudflare Pages',
    category: 'hosting',
    authType: 'oauth2',
    authorizationUrl: 'https://dash.cloudflare.com/oauth2/authorize',
    tokenUrl: 'https://dash.cloudflare.com/oauth2/token',
    revokeUrl: null,
    userInfoUrl: 'https://api.cloudflare.com/client/v4/user',
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'cloudflare-pages',
    docsUrl: 'https://developers.cloudflare.com/pages/',
    derivableCredentials: {
      CLOUDFLARE_API_TOKEN: { method: 'from_token', description: 'Cloudflare API token' },
      CLOUDFLARE_ACCOUNT_ID: {
        method: 'api_call',
        endpoint: 'https://api.cloudflare.com/client/v4/accounts',
        jsonPath: '$.result[0].id',
        description: 'Cloudflare account ID',
      },
    },
  },
  {
    id: 'digitalocean-app-platform',
    displayName: 'DigitalOcean App Platform',
    category: 'hosting',
    authType: 'oauth2',
    authorizationUrl: 'https://cloud.digitalocean.com/v1/oauth/authorize',
    tokenUrl: 'https://cloud.digitalocean.com/v1/oauth/token',
    revokeUrl: 'https://cloud.digitalocean.com/v1/oauth/revoke',
    userInfoUrl: 'https://api.digitalocean.com/v2/account',
    defaultScopes: ['read', 'write'],
    pkceRequired: false,
    logoSlug: 'digitalocean-app-platform',
    docsUrl: 'https://docs.digitalocean.com/reference/api/',
    derivableCredentials: {
      DIGITALOCEAN_TOKEN: { method: 'from_token', description: 'DigitalOcean personal access token' },
    },
  },

  // =========================================================================
  // VERSION CONTROL (4)
  // =========================================================================

  {
    id: 'github',
    displayName: 'GitHub',
    category: 'version-control',
    authType: 'oauth2',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    revokeUrl: null,
    userInfoUrl: 'https://api.github.com/user',
    defaultScopes: ['repo', 'read:user', 'user:email'],
    pkceRequired: false,
    logoSlug: 'github',
    docsUrl: 'https://docs.github.com/en/rest',
    derivableCredentials: {
      GITHUB_TOKEN: { method: 'from_token', description: 'GitHub personal access token' },
      GITHUB_USERNAME: {
        method: 'api_call',
        endpoint: 'https://api.github.com/user',
        jsonPath: '$.login',
        description: 'GitHub username',
      },
    },
  },
  {
    id: 'gitlab',
    displayName: 'GitLab',
    category: 'version-control',
    authType: 'oauth2',
    authorizationUrl: 'https://gitlab.com/oauth/authorize',
    tokenUrl: 'https://gitlab.com/oauth/token',
    revokeUrl: 'https://gitlab.com/oauth/revoke',
    userInfoUrl: 'https://gitlab.com/api/v4/user',
    defaultScopes: ['api', 'read_user', 'read_repository'],
    pkceRequired: false,
    logoSlug: 'gitlab',
    docsUrl: 'https://docs.gitlab.com/ee/api/rest/',
    derivableCredentials: {
      GITLAB_TOKEN: { method: 'from_token', description: 'GitLab access token' },
    },
  },
  {
    id: 'bitbucket',
    displayName: 'Bitbucket',
    category: 'version-control',
    authType: 'oauth2',
    authorizationUrl: 'https://bitbucket.org/site/oauth2/authorize',
    tokenUrl: 'https://bitbucket.org/site/oauth2/access_token',
    revokeUrl: null,
    userInfoUrl: 'https://api.bitbucket.org/2.0/user',
    defaultScopes: ['repository', 'account'],
    pkceRequired: false,
    logoSlug: 'bitbucket',
    docsUrl: 'https://developer.atlassian.com/cloud/bitbucket/rest/',
    derivableCredentials: {
      BITBUCKET_TOKEN: { method: 'from_token', description: 'Bitbucket access token' },
    },
  },
  {
    id: 'azure-devops',
    displayName: 'Azure DevOps',
    category: 'version-control',
    authType: 'oauth2',
    authorizationUrl: 'https://app.vssps.visualstudio.com/oauth2/authorize',
    tokenUrl: 'https://app.vssps.visualstudio.com/oauth2/token',
    revokeUrl: null,
    userInfoUrl: 'https://app.vssps.visualstudio.com/_apis/profile/profiles/me',
    defaultScopes: ['vso.code_write', 'vso.project'],
    pkceRequired: false,
    logoSlug: 'azure-devops',
    docsUrl: 'https://learn.microsoft.com/en-us/azure/devops/integrate/',
    derivableCredentials: {
      AZURE_DEVOPS_TOKEN: { method: 'from_token', description: 'Azure DevOps personal access token' },
    },
  },

  // =========================================================================
  // DATABASE (6)
  // =========================================================================

  {
    id: 'supabase',
    displayName: 'Supabase',
    category: 'database',
    authType: 'oauth2',
    authorizationUrl: 'https://api.supabase.com/v1/oauth/authorize',
    tokenUrl: 'https://api.supabase.com/v1/oauth/token',
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: true,
    logoSlug: 'supabase',
    docsUrl: 'https://supabase.com/docs/guides/api',
    derivableCredentials: {
      SUPABASE_ACCESS_TOKEN: { method: 'from_token', description: 'Supabase management API token' },
      SUPABASE_URL: {
        method: 'api_call',
        endpoint: 'https://api.supabase.com/v1/projects',
        jsonPath: '$[0].endpoint',
        description: 'Supabase project URL',
      },
      SUPABASE_ANON_KEY: {
        method: 'api_call',
        endpoint: 'https://api.supabase.com/v1/projects/{project_ref}/api-keys',
        jsonPath: '$[?(@.name=="anon")].api_key',
        description: 'Supabase anon/public key',
      },
    },
  },
  {
    id: 'planetscale',
    displayName: 'PlanetScale',
    category: 'database',
    authType: 'oauth2',
    authorizationUrl: 'https://auth.planetscale.com/oauth/authorize',
    tokenUrl: 'https://auth.planetscale.com/oauth/token',
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: ['read_organization', 'read_database', 'write_database'],
    pkceRequired: false,
    logoSlug: 'planetscale',
    docsUrl: 'https://planetscale.com/docs/concepts/planetscale-api-oauth-applications',
    derivableCredentials: {
      PLANETSCALE_TOKEN: { method: 'from_token', description: 'PlanetScale API access token' },
    },
  },
  {
    id: 'neon',
    displayName: 'Neon',
    category: 'database',
    authType: 'oauth2',
    authorizationUrl: 'https://oauth2.neon.tech/oauth2/auth',
    tokenUrl: 'https://oauth2.neon.tech/oauth2/token',
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: ['openid', 'offline_access', 'urn:neoncloud:projects:read', 'urn:neoncloud:projects:create'],
    pkceRequired: true,
    logoSlug: 'neon',
    docsUrl: 'https://neon.tech/docs/manage/integrations',
    derivableCredentials: {
      NEON_API_KEY: { method: 'from_token', description: 'Neon API token' },
      DATABASE_URL: {
        method: 'api_call',
        endpoint: 'https://console.neon.tech/api/v2/projects',
        jsonPath: '$.projects[0].connection_uris[0].connection_uri',
        description: 'Neon PostgreSQL connection string',
      },
    },
  },
  {
    id: 'mongodb-atlas',
    displayName: 'MongoDB Atlas',
    category: 'database',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'mongodb-atlas',
    docsUrl: 'https://www.mongodb.com/docs/atlas/api/',
    derivableCredentials: {
      MONGODB_URI: { method: 'from_token', description: 'MongoDB Atlas connection string' },
    },
  },
  {
    id: 'fauna',
    displayName: 'Fauna',
    category: 'database',
    authType: 'oauth2',
    authorizationUrl: 'https://auth.console.fauna.com/oauth/authorize',
    tokenUrl: 'https://auth.console.fauna.com/oauth/token',
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: true,
    logoSlug: 'fauna',
    docsUrl: 'https://docs.fauna.com/fauna/current/build/integration/oauth/',
    derivableCredentials: {
      FAUNA_SECRET: { method: 'from_token', description: 'Fauna database secret' },
    },
  },
  {
    id: 'upstash',
    displayName: 'Upstash',
    category: 'database',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'upstash',
    docsUrl: 'https://upstash.com/docs/redis/overall/getstarted',
    derivableCredentials: {
      UPSTASH_REDIS_REST_URL: { method: 'from_token', description: 'Upstash Redis REST URL' },
      UPSTASH_REDIS_REST_TOKEN: { method: 'from_token', description: 'Upstash Redis REST token' },
    },
  },

  // =========================================================================
  // AUTH (6)
  // =========================================================================

  {
    id: 'auth0',
    displayName: 'Auth0',
    category: 'auth',
    authType: 'oauth2',
    authorizationUrl: 'https://{domain}/authorize',
    tokenUrl: 'https://{domain}/oauth/token',
    revokeUrl: 'https://{domain}/oauth/revoke',
    userInfoUrl: 'https://{domain}/userinfo',
    defaultScopes: ['openid', 'profile', 'email'],
    pkceRequired: false,
    logoSlug: 'auth0',
    docsUrl: 'https://auth0.com/docs/api',
    derivableCredentials: {
      AUTH0_SECRET: { method: 'from_token', description: 'Auth0 client secret' },
      AUTH0_DOMAIN: { method: 'from_token_response', jsonPath: '$.domain', description: 'Auth0 tenant domain' },
    },
  },
  {
    id: 'clerk',
    displayName: 'Clerk',
    category: 'auth',
    authType: 'oauth2',
    authorizationUrl: 'https://clerk.com/oauth/authorize',
    tokenUrl: 'https://clerk.com/oauth/token',
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: ['profile', 'email'],
    pkceRequired: false,
    logoSlug: 'clerk',
    docsUrl: 'https://clerk.com/docs/reference/backend-api',
    derivableCredentials: {
      CLERK_SECRET_KEY: { method: 'from_token', description: 'Clerk secret key' },
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: {
        method: 'api_call',
        endpoint: 'https://api.clerk.com/v1/instance',
        jsonPath: '$.publishable_key',
        description: 'Clerk publishable key',
      },
    },
  },
  {
    id: 'firebase-auth',
    displayName: 'Firebase Auth',
    category: 'auth',
    authType: 'oauth2',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    defaultScopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/firebase'],
    pkceRequired: false,
    logoSlug: 'firebase-auth',
    docsUrl: 'https://firebase.google.com/docs/auth',
    derivableCredentials: {
      FIREBASE_API_KEY: {
        method: 'api_call',
        endpoint: 'https://firebase.googleapis.com/v1beta1/projects',
        jsonPath: '$.results[0].apiKeyId',
        description: 'Firebase web API key',
      },
    },
  },
  {
    id: 'okta',
    displayName: 'Okta',
    category: 'auth',
    authType: 'oauth2',
    authorizationUrl: 'https://{domain}/oauth2/default/v1/authorize',
    tokenUrl: 'https://{domain}/oauth2/default/v1/token',
    revokeUrl: 'https://{domain}/oauth2/default/v1/revoke',
    userInfoUrl: 'https://{domain}/oauth2/default/v1/userinfo',
    defaultScopes: ['openid', 'profile', 'email'],
    pkceRequired: true,
    logoSlug: 'okta',
    docsUrl: 'https://developer.okta.com/docs/reference/api/oidc/',
    derivableCredentials: {
      OKTA_DOMAIN: { method: 'from_token_response', jsonPath: '$.domain', description: 'Okta org domain' },
      OKTA_CLIENT_SECRET: { method: 'from_token', description: 'Okta client secret' },
    },
  },
  {
    id: 'onelogin',
    displayName: 'OneLogin',
    category: 'auth',
    authType: 'oauth2',
    authorizationUrl: 'https://{subdomain}.onelogin.com/oidc/2/auth',
    tokenUrl: 'https://{subdomain}.onelogin.com/oidc/2/token',
    revokeUrl: 'https://{subdomain}.onelogin.com/oidc/2/token/revocation',
    userInfoUrl: 'https://{subdomain}.onelogin.com/oidc/2/me',
    defaultScopes: ['openid', 'profile', 'email'],
    pkceRequired: false,
    logoSlug: 'onelogin',
    docsUrl: 'https://developers.onelogin.com/openid-connect',
    derivableCredentials: null,
  },
  {
    id: 'keycloak',
    displayName: 'Keycloak',
    category: 'auth',
    authType: 'oauth2',
    authorizationUrl: 'https://{host}/realms/{realm}/protocol/openid-connect/auth',
    tokenUrl: 'https://{host}/realms/{realm}/protocol/openid-connect/token',
    revokeUrl: 'https://{host}/realms/{realm}/protocol/openid-connect/revoke',
    userInfoUrl: 'https://{host}/realms/{realm}/protocol/openid-connect/userinfo',
    defaultScopes: ['openid', 'profile', 'email'],
    pkceRequired: false,
    logoSlug: 'keycloak',
    docsUrl: 'https://www.keycloak.org/docs/latest/securing_apps/',
    derivableCredentials: null,
  },

  // =========================================================================
  // PAYMENT (6)
  // =========================================================================

  {
    id: 'stripe',
    displayName: 'Stripe',
    category: 'payment',
    authType: 'oauth2',
    authorizationUrl: 'https://connect.stripe.com/oauth/authorize',
    tokenUrl: 'https://connect.stripe.com/oauth/token',
    revokeUrl: 'https://connect.stripe.com/oauth/deauthorize',
    userInfoUrl: null,
    defaultScopes: ['read_write'],
    pkceRequired: false,
    logoSlug: 'stripe',
    docsUrl: 'https://docs.stripe.com/api',
    derivableCredentials: {
      STRIPE_SECRET_KEY: { method: 'from_token', description: 'Stripe secret API key' },
      STRIPE_PUBLISHABLE_KEY: {
        method: 'from_token_response',
        jsonPath: '$.stripe_publishable_key',
        description: 'Stripe publishable key',
      },
      STRIPE_ACCOUNT_ID: {
        method: 'from_token_response',
        jsonPath: '$.stripe_user_id',
        description: 'Connected Stripe account ID',
      },
    },
  },
  {
    id: 'paypal',
    displayName: 'PayPal',
    category: 'payment',
    authType: 'oauth2',
    authorizationUrl: 'https://www.paypal.com/signin/authorize',
    tokenUrl: 'https://api-m.paypal.com/v1/oauth2/token',
    revokeUrl: null,
    userInfoUrl: 'https://api-m.paypal.com/v1/identity/openidconnect/userinfo?schema=openid',
    defaultScopes: ['openid', 'email'],
    pkceRequired: false,
    logoSlug: 'paypal',
    docsUrl: 'https://developer.paypal.com/docs/api/overview/',
    derivableCredentials: {
      PAYPAL_CLIENT_ID: { method: 'from_token_response', jsonPath: '$.client_id', description: 'PayPal client ID' },
      PAYPAL_CLIENT_SECRET: { method: 'from_token', description: 'PayPal client secret' },
    },
  },
  {
    id: 'square',
    displayName: 'Square',
    category: 'payment',
    authType: 'oauth2',
    authorizationUrl: 'https://connect.squareup.com/oauth2/authorize',
    tokenUrl: 'https://connect.squareup.com/oauth2/token',
    revokeUrl: 'https://connect.squareup.com/oauth2/revoke',
    userInfoUrl: null,
    defaultScopes: ['MERCHANT_PROFILE_READ', 'PAYMENTS_READ', 'PAYMENTS_WRITE'],
    pkceRequired: false,
    logoSlug: 'square',
    docsUrl: 'https://developer.squareup.com/docs/oauth-api/overview',
    derivableCredentials: {
      SQUARE_ACCESS_TOKEN: { method: 'from_token', description: 'Square access token' },
    },
  },
  {
    id: 'braintree',
    displayName: 'Braintree',
    category: 'payment',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'braintree',
    docsUrl: 'https://developer.paypal.com/braintree/docs/start/overview',
    derivableCredentials: {
      BRAINTREE_MERCHANT_ID: { method: 'from_token', description: 'Braintree merchant ID' },
    },
  },
  {
    id: 'paddle',
    displayName: 'Paddle',
    category: 'payment',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'paddle',
    docsUrl: 'https://developer.paddle.com/api-reference/overview',
    derivableCredentials: {
      PADDLE_API_KEY: { method: 'from_token', description: 'Paddle API key' },
    },
  },
  {
    id: 'lemonsqueezy',
    displayName: 'Lemon Squeezy',
    category: 'payment',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'lemonsqueezy',
    docsUrl: 'https://docs.lemonsqueezy.com/api',
    derivableCredentials: {
      LEMONSQUEEZY_API_KEY: { method: 'from_token', description: 'Lemon Squeezy API key' },
    },
  },

  // =========================================================================
  // COMMUNICATION (8)
  // =========================================================================

  {
    id: 'slack',
    displayName: 'Slack',
    category: 'communication',
    authType: 'oauth2',
    authorizationUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    revokeUrl: 'https://slack.com/api/auth.revoke',
    userInfoUrl: 'https://slack.com/api/users.identity',
    defaultScopes: ['channels:read', 'chat:write', 'users:read'],
    pkceRequired: false,
    logoSlug: 'slack',
    docsUrl: 'https://api.slack.com/docs',
    derivableCredentials: {
      SLACK_BOT_TOKEN: { method: 'from_token_response', jsonPath: '$.access_token', description: 'Slack bot token' },
      SLACK_TEAM_ID: { method: 'from_token_response', jsonPath: '$.team.id', description: 'Slack workspace ID' },
      SLACK_WEBHOOK_URL: {
        method: 'from_token_response',
        jsonPath: '$.incoming_webhook.url',
        description: 'Slack incoming webhook URL',
      },
    },
  },
  {
    id: 'discord',
    displayName: 'Discord',
    category: 'communication',
    authType: 'oauth2',
    authorizationUrl: 'https://discord.com/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    revokeUrl: 'https://discord.com/api/oauth2/token/revoke',
    userInfoUrl: 'https://discord.com/api/users/@me',
    defaultScopes: ['identify', 'email', 'guilds', 'bot'],
    pkceRequired: false,
    logoSlug: 'discord',
    docsUrl: 'https://discord.com/developers/docs',
    derivableCredentials: {
      DISCORD_BOT_TOKEN: { method: 'from_token', description: 'Discord bot token' },
    },
  },
  {
    id: 'twilio',
    displayName: 'Twilio',
    category: 'communication',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'twilio',
    docsUrl: 'https://www.twilio.com/docs/usage/api',
    derivableCredentials: {
      TWILIO_ACCOUNT_SID: { method: 'from_token', description: 'Twilio account SID' },
      TWILIO_AUTH_TOKEN: { method: 'from_token', description: 'Twilio auth token' },
    },
  },
  {
    id: 'sendgrid',
    displayName: 'SendGrid',
    category: 'communication',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'sendgrid',
    docsUrl: 'https://docs.sendgrid.com/api-reference',
    derivableCredentials: {
      SENDGRID_API_KEY: { method: 'from_token', description: 'SendGrid API key' },
    },
  },
  {
    id: 'mailgun',
    displayName: 'Mailgun',
    category: 'communication',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'mailgun',
    docsUrl: 'https://documentation.mailgun.com/docs/mailgun/api-reference/',
    derivableCredentials: {
      MAILGUN_API_KEY: { method: 'from_token', description: 'Mailgun API key' },
      MAILGUN_DOMAIN: { method: 'from_token', description: 'Mailgun sending domain' },
    },
  },
  {
    id: 'postmark',
    displayName: 'Postmark',
    category: 'communication',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'postmark',
    docsUrl: 'https://postmarkapp.com/developer',
    derivableCredentials: {
      POSTMARK_SERVER_TOKEN: { method: 'from_token', description: 'Postmark server API token' },
    },
  },
  {
    id: 'intercom',
    displayName: 'Intercom',
    category: 'communication',
    authType: 'oauth2',
    authorizationUrl: 'https://app.intercom.com/oauth',
    tokenUrl: 'https://api.intercom.io/auth/eagle/token',
    revokeUrl: null,
    userInfoUrl: 'https://api.intercom.io/me',
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'intercom',
    docsUrl: 'https://developers.intercom.com/docs/build-an-integration/',
    derivableCredentials: {
      INTERCOM_ACCESS_TOKEN: { method: 'from_token', description: 'Intercom access token' },
    },
  },
  {
    id: 'zendesk',
    displayName: 'Zendesk',
    category: 'communication',
    authType: 'oauth2',
    authorizationUrl: 'https://{subdomain}.zendesk.com/oauth/authorizations/new',
    tokenUrl: 'https://{subdomain}.zendesk.com/oauth/tokens',
    revokeUrl: null,
    userInfoUrl: 'https://{subdomain}.zendesk.com/api/v2/users/me.json',
    defaultScopes: ['read', 'write'],
    pkceRequired: false,
    logoSlug: 'zendesk',
    docsUrl: 'https://developer.zendesk.com/api-reference/',
    derivableCredentials: {
      ZENDESK_API_TOKEN: { method: 'from_token', description: 'Zendesk API token' },
    },
  },

  // =========================================================================
  // ANALYTICS (6)
  // =========================================================================

  {
    id: 'google-analytics',
    displayName: 'Google Analytics',
    category: 'analytics',
    authType: 'oauth2',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    defaultScopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    pkceRequired: false,
    logoSlug: 'google-analytics',
    docsUrl: 'https://developers.google.com/analytics/devguides/reporting/data/v1',
    derivableCredentials: {
      GA_MEASUREMENT_ID: {
        method: 'api_call',
        endpoint: 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
        jsonPath: '$.accountSummaries[0].propertySummaries[0].property',
        description: 'Google Analytics measurement ID',
      },
    },
  },
  {
    id: 'mixpanel',
    displayName: 'Mixpanel',
    category: 'analytics',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'mixpanel',
    docsUrl: 'https://developer.mixpanel.com/reference/overview',
    derivableCredentials: {
      MIXPANEL_TOKEN: { method: 'from_token', description: 'Mixpanel project token' },
    },
  },
  {
    id: 'amplitude',
    displayName: 'Amplitude',
    category: 'analytics',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'amplitude',
    docsUrl: 'https://www.docs.developers.amplitude.com/analytics/',
    derivableCredentials: {
      AMPLITUDE_API_KEY: { method: 'from_token', description: 'Amplitude API key' },
    },
  },
  {
    id: 'segment',
    displayName: 'Segment',
    category: 'analytics',
    authType: 'oauth2',
    authorizationUrl: 'https://app.segment.com/oauth2/authorize',
    tokenUrl: 'https://app.segment.com/oauth2/token',
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: ['workspace:read', 'tracking_api:write'],
    pkceRequired: false,
    logoSlug: 'segment',
    docsUrl: 'https://segment.com/docs/api/',
    derivableCredentials: {
      SEGMENT_WRITE_KEY: { method: 'from_token', description: 'Segment source write key' },
    },
  },
  {
    id: 'posthog',
    displayName: 'PostHog',
    category: 'analytics',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'posthog',
    docsUrl: 'https://posthog.com/docs/api',
    derivableCredentials: {
      POSTHOG_API_KEY: { method: 'from_token', description: 'PostHog project API key' },
      POSTHOG_HOST: { method: 'from_token', description: 'PostHog instance host URL' },
    },
  },
  {
    id: 'plausible',
    displayName: 'Plausible',
    category: 'analytics',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'plausible',
    docsUrl: 'https://plausible.io/docs/stats-api',
    derivableCredentials: {
      PLAUSIBLE_API_KEY: { method: 'from_token', description: 'Plausible API key' },
    },
  },

  // =========================================================================
  // CI/CD (4)
  // =========================================================================

  {
    id: 'github-actions',
    displayName: 'GitHub Actions',
    category: 'ci-cd',
    authType: 'oauth2',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    revokeUrl: null,
    userInfoUrl: 'https://api.github.com/user',
    defaultScopes: ['repo', 'workflow'],
    pkceRequired: false,
    logoSlug: 'github-actions',
    docsUrl: 'https://docs.github.com/en/actions',
    derivableCredentials: {
      GITHUB_TOKEN: { method: 'from_token', description: 'GitHub token with workflow scope' },
    },
  },
  {
    id: 'circleci',
    displayName: 'CircleCI',
    category: 'ci-cd',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'circleci',
    docsUrl: 'https://circleci.com/docs/api/',
    derivableCredentials: {
      CIRCLECI_TOKEN: { method: 'from_token', description: 'CircleCI personal API token' },
    },
  },
  {
    id: 'travis-ci',
    displayName: 'Travis CI',
    category: 'ci-cd',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'travis-ci',
    docsUrl: 'https://docs.travis-ci.com/api/',
    derivableCredentials: {
      TRAVIS_API_TOKEN: { method: 'from_token', description: 'Travis CI API token' },
    },
  },
  {
    id: 'jenkins',
    displayName: 'Jenkins',
    category: 'ci-cd',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'jenkins',
    docsUrl: 'https://www.jenkins.io/doc/book/using/remote-access-api/',
    derivableCredentials: {
      JENKINS_URL: { method: 'from_token', description: 'Jenkins server URL' },
      JENKINS_API_TOKEN: { method: 'from_token', description: 'Jenkins API token' },
    },
  },

  // =========================================================================
  // CLOUD (6)
  // =========================================================================

  {
    id: 'aws',
    displayName: 'Amazon Web Services',
    category: 'cloud',
    authType: 'oauth2',
    authorizationUrl: 'https://signin.aws.amazon.com/oauth',
    tokenUrl: 'https://signin.aws.amazon.com/oauth/token',
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'aws',
    docsUrl: 'https://docs.aws.amazon.com/',
    derivableCredentials: {
      AWS_ACCESS_KEY_ID: { method: 'from_token_response', jsonPath: '$.access_key_id', description: 'AWS access key ID' },
      AWS_SECRET_ACCESS_KEY: { method: 'from_token_response', jsonPath: '$.secret_access_key', description: 'AWS secret access key' },
      AWS_REGION: { method: 'from_token_response', jsonPath: '$.region', description: 'AWS default region' },
    },
  },
  {
    id: 'google-cloud',
    displayName: 'Google Cloud',
    category: 'cloud',
    authType: 'oauth2',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    defaultScopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/cloud-platform'],
    pkceRequired: false,
    logoSlug: 'google-cloud',
    docsUrl: 'https://cloud.google.com/docs',
    derivableCredentials: {
      GOOGLE_CLOUD_PROJECT: {
        method: 'api_call',
        endpoint: 'https://cloudresourcemanager.googleapis.com/v1/projects',
        jsonPath: '$.projects[0].projectId',
        description: 'GCP project ID',
      },
    },
  },
  {
    id: 'azure',
    displayName: 'Microsoft Azure',
    category: 'cloud',
    authType: 'oauth2',
    authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    revokeUrl: null,
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
    defaultScopes: ['openid', 'profile', 'email', 'https://management.azure.com/user_impersonation'],
    pkceRequired: true,
    logoSlug: 'azure',
    docsUrl: 'https://learn.microsoft.com/en-us/azure/',
    derivableCredentials: {
      AZURE_SUBSCRIPTION_ID: {
        method: 'api_call',
        endpoint: 'https://management.azure.com/subscriptions?api-version=2020-01-01',
        jsonPath: '$.value[0].subscriptionId',
        description: 'Azure subscription ID',
      },
      AZURE_TENANT_ID: {
        method: 'from_token_response',
        jsonPath: '$.tenant_id',
        description: 'Azure AD tenant ID',
      },
    },
  },
  {
    id: 'digitalocean',
    displayName: 'DigitalOcean',
    category: 'cloud',
    authType: 'oauth2',
    authorizationUrl: 'https://cloud.digitalocean.com/v1/oauth/authorize',
    tokenUrl: 'https://cloud.digitalocean.com/v1/oauth/token',
    revokeUrl: 'https://cloud.digitalocean.com/v1/oauth/revoke',
    userInfoUrl: 'https://api.digitalocean.com/v2/account',
    defaultScopes: ['read', 'write'],
    pkceRequired: false,
    logoSlug: 'digitalocean',
    docsUrl: 'https://docs.digitalocean.com/reference/api/',
    derivableCredentials: {
      DIGITALOCEAN_TOKEN: { method: 'from_token', description: 'DigitalOcean personal access token' },
    },
  },
  {
    id: 'linode',
    displayName: 'Linode (Akamai)',
    category: 'cloud',
    authType: 'oauth2',
    authorizationUrl: 'https://login.linode.com/oauth/authorize',
    tokenUrl: 'https://login.linode.com/oauth/token',
    revokeUrl: null,
    userInfoUrl: 'https://api.linode.com/v4/profile',
    defaultScopes: ['*'],
    pkceRequired: false,
    logoSlug: 'linode',
    docsUrl: 'https://techdocs.akamai.com/linode-api/reference/api',
    derivableCredentials: {
      LINODE_TOKEN: { method: 'from_token', description: 'Linode personal access token' },
    },
  },
  {
    id: 'vultr',
    displayName: 'Vultr',
    category: 'cloud',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'vultr',
    docsUrl: 'https://www.vultr.com/api/',
    derivableCredentials: {
      VULTR_API_KEY: { method: 'from_token', description: 'Vultr API key' },
    },
  },

  // =========================================================================
  // CMS (6)
  // =========================================================================

  {
    id: 'contentful',
    displayName: 'Contentful',
    category: 'cms',
    authType: 'oauth2',
    authorizationUrl: 'https://be.contentful.com/oauth/authorize',
    tokenUrl: 'https://be.contentful.com/oauth/token',
    revokeUrl: null,
    userInfoUrl: 'https://api.contentful.com/users/me',
    defaultScopes: ['content_management_manage'],
    pkceRequired: false,
    logoSlug: 'contentful',
    docsUrl: 'https://www.contentful.com/developers/docs/references/',
    derivableCredentials: {
      CONTENTFUL_MANAGEMENT_TOKEN: { method: 'from_token', description: 'Contentful CMA token' },
      CONTENTFUL_SPACE_ID: {
        method: 'api_call',
        endpoint: 'https://api.contentful.com/spaces',
        jsonPath: '$.items[0].sys.id',
        description: 'Contentful space ID',
      },
    },
  },
  {
    id: 'sanity',
    displayName: 'Sanity',
    category: 'cms',
    authType: 'oauth2',
    authorizationUrl: 'https://api.sanity.io/v1/auth/oauth/authorize',
    tokenUrl: 'https://api.sanity.io/v1/auth/oauth/token',
    revokeUrl: null,
    userInfoUrl: 'https://api.sanity.io/v1/users/me',
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'sanity',
    docsUrl: 'https://www.sanity.io/docs/http-api',
    derivableCredentials: {
      SANITY_AUTH_TOKEN: { method: 'from_token', description: 'Sanity auth token' },
      SANITY_PROJECT_ID: {
        method: 'api_call',
        endpoint: 'https://api.sanity.io/v1/projects',
        jsonPath: '$[0].id',
        description: 'Sanity project ID',
      },
    },
  },
  {
    id: 'strapi',
    displayName: 'Strapi',
    category: 'cms',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'strapi',
    docsUrl: 'https://docs.strapi.io/dev-docs/api/rest',
    derivableCredentials: {
      STRAPI_API_TOKEN: { method: 'from_token', description: 'Strapi API token' },
    },
  },
  {
    id: 'ghost',
    displayName: 'Ghost',
    category: 'cms',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'ghost',
    docsUrl: 'https://ghost.org/docs/content-api/',
    derivableCredentials: {
      GHOST_CONTENT_API_KEY: { method: 'from_token', description: 'Ghost Content API key' },
      GHOST_ADMIN_API_KEY: { method: 'from_token', description: 'Ghost Admin API key' },
    },
  },
  {
    id: 'prismic',
    displayName: 'Prismic',
    category: 'cms',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'prismic',
    docsUrl: 'https://prismic.io/docs/api',
    derivableCredentials: {
      PRISMIC_ACCESS_TOKEN: { method: 'from_token', description: 'Prismic repository token' },
    },
  },
  {
    id: 'storyblok',
    displayName: 'Storyblok',
    category: 'cms',
    authType: 'oauth2',
    authorizationUrl: 'https://app.storyblok.com/oauth/authorize',
    tokenUrl: 'https://app.storyblok.com/oauth/token',
    revokeUrl: null,
    userInfoUrl: 'https://api.storyblok.com/v1/oauth/user_info',
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'storyblok',
    docsUrl: 'https://www.storyblok.com/docs/api/management-api',
    derivableCredentials: {
      STORYBLOK_TOKEN: { method: 'from_token', description: 'Storyblok access token' },
    },
  },

  // =========================================================================
  // MONITORING (6)
  // =========================================================================

  {
    id: 'datadog',
    displayName: 'Datadog',
    category: 'monitoring',
    authType: 'oauth2',
    authorizationUrl: 'https://app.datadoghq.com/oauth2/v1/authorize',
    tokenUrl: 'https://app.datadoghq.com/oauth2/v1/token',
    revokeUrl: 'https://app.datadoghq.com/oauth2/v1/revoke',
    userInfoUrl: null,
    defaultScopes: ['dashboards_read', 'monitors_read'],
    pkceRequired: true,
    logoSlug: 'datadog',
    docsUrl: 'https://docs.datadoghq.com/api/',
    derivableCredentials: {
      DD_API_KEY: { method: 'from_token', description: 'Datadog API key' },
    },
  },
  {
    id: 'sentry',
    displayName: 'Sentry',
    category: 'monitoring',
    authType: 'oauth2',
    authorizationUrl: 'https://sentry.io/oauth/authorize/',
    tokenUrl: 'https://sentry.io/oauth/token/',
    revokeUrl: null,
    userInfoUrl: 'https://sentry.io/api/0/users/me/',
    defaultScopes: ['project:read', 'org:read', 'event:read'],
    pkceRequired: false,
    logoSlug: 'sentry',
    docsUrl: 'https://docs.sentry.io/api/',
    derivableCredentials: {
      SENTRY_DSN: {
        method: 'api_call',
        endpoint: 'https://sentry.io/api/0/projects/',
        jsonPath: '$[0].dsn.public',
        description: 'Sentry DSN for error tracking',
      },
      SENTRY_AUTH_TOKEN: { method: 'from_token', description: 'Sentry auth token' },
    },
  },
  {
    id: 'new-relic',
    displayName: 'New Relic',
    category: 'monitoring',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'new-relic',
    docsUrl: 'https://docs.newrelic.com/docs/apis/',
    derivableCredentials: {
      NEW_RELIC_API_KEY: { method: 'from_token', description: 'New Relic API key' },
      NEW_RELIC_ACCOUNT_ID: { method: 'from_token', description: 'New Relic account ID' },
    },
  },
  {
    id: 'grafana-cloud',
    displayName: 'Grafana Cloud',
    category: 'monitoring',
    authType: 'oauth2',
    authorizationUrl: 'https://grafana.com/oauth2/authorize',
    tokenUrl: 'https://grafana.com/api/oauth2/token',
    revokeUrl: null,
    userInfoUrl: 'https://grafana.com/api/oauth2/userinfo',
    defaultScopes: ['openid', 'profile', 'email'],
    pkceRequired: false,
    logoSlug: 'grafana-cloud',
    docsUrl: 'https://grafana.com/docs/grafana-cloud/developer-resources/api-reference/',
    derivableCredentials: {
      GRAFANA_API_KEY: { method: 'from_token', description: 'Grafana Cloud API key' },
    },
  },
  {
    id: 'pagerduty',
    displayName: 'PagerDuty',
    category: 'monitoring',
    authType: 'oauth2',
    authorizationUrl: 'https://app.pagerduty.com/oauth/authorize',
    tokenUrl: 'https://app.pagerduty.com/oauth/token',
    revokeUrl: 'https://app.pagerduty.com/oauth/revoke',
    userInfoUrl: 'https://api.pagerduty.com/users/me',
    defaultScopes: ['read', 'write'],
    pkceRequired: false,
    logoSlug: 'pagerduty',
    docsUrl: 'https://developer.pagerduty.com/docs/',
    derivableCredentials: {
      PAGERDUTY_TOKEN: { method: 'from_token', description: 'PagerDuty API token' },
    },
  },
  {
    id: 'opsgenie',
    displayName: 'Opsgenie',
    category: 'monitoring',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'opsgenie',
    docsUrl: 'https://docs.opsgenie.com/docs/api-overview',
    derivableCredentials: {
      OPSGENIE_API_KEY: { method: 'from_token', description: 'Opsgenie API key' },
    },
  },

  // =========================================================================
  // EMAIL (4)
  // =========================================================================

  {
    id: 'resend',
    displayName: 'Resend',
    category: 'email',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'resend',
    docsUrl: 'https://resend.com/docs/api-reference',
    derivableCredentials: {
      RESEND_API_KEY: { method: 'from_token', description: 'Resend API key' },
    },
  },
  {
    id: 'mailchimp',
    displayName: 'Mailchimp',
    category: 'email',
    authType: 'oauth2',
    authorizationUrl: 'https://login.mailchimp.com/oauth2/authorize',
    tokenUrl: 'https://login.mailchimp.com/oauth2/token',
    revokeUrl: null,
    userInfoUrl: 'https://login.mailchimp.com/oauth2/metadata',
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'mailchimp',
    docsUrl: 'https://mailchimp.com/developer/marketing/api/',
    derivableCredentials: {
      MAILCHIMP_API_KEY: { method: 'from_token', description: 'Mailchimp API key' },
      MAILCHIMP_SERVER_PREFIX: {
        method: 'from_token_response',
        jsonPath: '$.dc',
        description: 'Mailchimp data center prefix (e.g. us21)',
      },
    },
  },
  {
    id: 'convertkit',
    displayName: 'ConvertKit',
    category: 'email',
    authType: 'oauth2',
    authorizationUrl: 'https://app.convertkit.com/oauth/authorize',
    tokenUrl: 'https://app.convertkit.com/oauth/token',
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: true,
    logoSlug: 'convertkit',
    docsUrl: 'https://developers.convertkit.com/',
    derivableCredentials: {
      CONVERTKIT_API_KEY: { method: 'from_token', description: 'ConvertKit API key' },
    },
  },
  {
    id: 'customer-io',
    displayName: 'Customer.io',
    category: 'email',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'customer-io',
    docsUrl: 'https://customer.io/docs/api/',
    derivableCredentials: {
      CUSTOMERIO_SITE_ID: { method: 'from_token', description: 'Customer.io site ID' },
      CUSTOMERIO_API_KEY: { method: 'from_token', description: 'Customer.io API key' },
    },
  },

  // =========================================================================
  // AI / ML (6)
  // =========================================================================

  {
    id: 'openai',
    displayName: 'OpenAI',
    category: 'ai-ml',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'openai',
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    derivableCredentials: {
      OPENAI_API_KEY: { method: 'from_token', description: 'OpenAI API key' },
    },
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    category: 'ai-ml',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'anthropic',
    docsUrl: 'https://docs.anthropic.com/en/docs',
    derivableCredentials: {
      ANTHROPIC_API_KEY: { method: 'from_token', description: 'Anthropic API key' },
    },
  },
  {
    id: 'huggingface',
    displayName: 'Hugging Face',
    category: 'ai-ml',
    authType: 'oauth2',
    authorizationUrl: 'https://huggingface.co/oauth/authorize',
    tokenUrl: 'https://huggingface.co/oauth/token',
    revokeUrl: null,
    userInfoUrl: 'https://huggingface.co/api/whoami-v2',
    defaultScopes: ['openid', 'profile', 'email', 'read-repos'],
    pkceRequired: true,
    logoSlug: 'huggingface',
    docsUrl: 'https://huggingface.co/docs/hub/api',
    derivableCredentials: {
      HF_TOKEN: { method: 'from_token', description: 'Hugging Face access token' },
    },
  },
  {
    id: 'replicate',
    displayName: 'Replicate',
    category: 'ai-ml',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'replicate',
    docsUrl: 'https://replicate.com/docs/reference/http',
    derivableCredentials: {
      REPLICATE_API_TOKEN: { method: 'from_token', description: 'Replicate API token' },
    },
  },
  {
    id: 'cohere',
    displayName: 'Cohere',
    category: 'ai-ml',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'cohere',
    docsUrl: 'https://docs.cohere.com/reference/about',
    derivableCredentials: {
      COHERE_API_KEY: { method: 'from_token', description: 'Cohere API key' },
    },
  },
  {
    id: 'stability-ai',
    displayName: 'Stability AI',
    category: 'ai-ml',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'stability-ai',
    docsUrl: 'https://platform.stability.ai/docs/api-reference',
    derivableCredentials: {
      STABILITY_API_KEY: { method: 'from_token', description: 'Stability AI API key' },
    },
  },

  // =========================================================================
  // STORAGE (6)
  // =========================================================================

  {
    id: 'cloudinary',
    displayName: 'Cloudinary',
    category: 'storage',
    authType: 'oauth2',
    authorizationUrl: 'https://cloudinary.com/users/oauth/authorize',
    tokenUrl: 'https://cloudinary.com/users/oauth/token',
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'cloudinary',
    docsUrl: 'https://cloudinary.com/documentation/admin_api',
    derivableCredentials: {
      CLOUDINARY_URL: { method: 'from_token', description: 'Cloudinary environment variable URL' },
      CLOUDINARY_CLOUD_NAME: { method: 'from_token_response', jsonPath: '$.cloud_name', description: 'Cloudinary cloud name' },
    },
  },
  {
    id: 'uploadthing',
    displayName: 'UploadThing',
    category: 'storage',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'uploadthing',
    docsUrl: 'https://docs.uploadthing.com/',
    derivableCredentials: {
      UPLOADTHING_SECRET: { method: 'from_token', description: 'UploadThing secret key' },
    },
  },
  {
    id: 'bunny-cdn',
    displayName: 'Bunny CDN',
    category: 'storage',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'bunny-cdn',
    docsUrl: 'https://docs.bunny.net/reference/bunnynet-api-overview',
    derivableCredentials: {
      BUNNY_API_KEY: { method: 'from_token', description: 'Bunny.net API key' },
    },
  },
  {
    id: 'backblaze-b2',
    displayName: 'Backblaze B2',
    category: 'storage',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'backblaze-b2',
    docsUrl: 'https://www.backblaze.com/docs/cloud-storage',
    derivableCredentials: {
      B2_APPLICATION_KEY_ID: { method: 'from_token', description: 'Backblaze B2 application key ID' },
      B2_APPLICATION_KEY: { method: 'from_token', description: 'Backblaze B2 application key' },
    },
  },
  {
    id: 'wasabi',
    displayName: 'Wasabi',
    category: 'storage',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'wasabi',
    docsUrl: 'https://docs.wasabi.com/',
    derivableCredentials: {
      WASABI_ACCESS_KEY_ID: { method: 'from_token', description: 'Wasabi access key ID' },
      WASABI_SECRET_ACCESS_KEY: { method: 'from_token', description: 'Wasabi secret access key' },
    },
  },
  {
    id: 'minio',
    displayName: 'MinIO',
    category: 'storage',
    authType: 'apikey',
    authorizationUrl: null,
    tokenUrl: null,
    revokeUrl: null,
    userInfoUrl: null,
    defaultScopes: [],
    pkceRequired: false,
    logoSlug: 'minio',
    docsUrl: 'https://min.io/docs/minio/linux/reference/minio-mc.html',
    derivableCredentials: {
      MINIO_ACCESS_KEY: { method: 'from_token', description: 'MinIO access key' },
      MINIO_SECRET_KEY: { method: 'from_token', description: 'MinIO secret key' },
      MINIO_ENDPOINT: { method: 'from_token', description: 'MinIO server endpoint' },
    },
  },

  // =========================================================================
  // API-KEY ONLY PROVIDERS (~85 remaining to reach 150)
  // =========================================================================

  // --- Search & Data ---
  apikey('algolia', 'Algolia', 'database', 'https://www.algolia.com/doc/rest-api/search/', {
    ALGOLIA_APP_ID: { method: 'from_token', description: 'Algolia application ID' },
    ALGOLIA_API_KEY: { method: 'from_token', description: 'Algolia API key' },
  }),
  apikey('elastic', 'Elasticsearch', 'database', 'https://www.elastic.co/docs/api', {
    ELASTICSEARCH_URL: { method: 'from_token', description: 'Elasticsearch cluster URL' },
    ELASTICSEARCH_API_KEY: { method: 'from_token', description: 'Elasticsearch API key' },
  }),
  apikey('redis-cloud', 'Redis Cloud', 'database', 'https://redis.io/docs/latest/operate/rc/api/', {
    REDIS_URL: { method: 'from_token', description: 'Redis connection URL' },
  }),
  apikey('cockroachdb', 'CockroachDB', 'database', 'https://www.cockroachlabs.com/docs/api/', {
    DATABASE_URL: { method: 'from_token', description: 'CockroachDB connection string' },
  }),
  apikey('turso', 'Turso', 'database', 'https://docs.turso.tech/api-reference', {
    TURSO_DATABASE_URL: { method: 'from_token', description: 'Turso database URL' },
    TURSO_AUTH_TOKEN: { method: 'from_token', description: 'Turso auth token' },
  }),
  apikey('xata', 'Xata', 'database', 'https://xata.io/docs/api-reference', {
    XATA_API_KEY: { method: 'from_token', description: 'Xata API key' },
  }),
  apikey('convex', 'Convex', 'database', 'https://docs.convex.dev/api', {
    CONVEX_DEPLOY_KEY: { method: 'from_token', description: 'Convex deploy key' },
  }),

  // --- Productivity / Project Management ---
  apikey('airtable', 'Airtable', 'database', 'https://airtable.com/developers/web/api/', {
    AIRTABLE_API_KEY: { method: 'from_token', description: 'Airtable personal access token' },
  }),
  apikey('notion', 'Notion', 'database', 'https://developers.notion.com/reference', {
    NOTION_API_KEY: { method: 'from_token', description: 'Notion integration secret' },
  }),
  apikey('linear', 'Linear', 'ci-cd', 'https://developers.linear.app/docs', {
    LINEAR_API_KEY: { method: 'from_token', description: 'Linear API key' },
  }),
  apikey('jira', 'Jira', 'ci-cd', 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/', {
    JIRA_API_TOKEN: { method: 'from_token', description: 'Jira API token' },
    JIRA_DOMAIN: { method: 'from_token', description: 'Jira instance domain' },
  }),
  apikey('asana', 'Asana', 'ci-cd', 'https://developers.asana.com/reference/rest-api-reference', {
    ASANA_ACCESS_TOKEN: { method: 'from_token', description: 'Asana personal access token' },
  }),
  apikey('monday', 'Monday.com', 'ci-cd', 'https://developer.monday.com/api-reference/', {
    MONDAY_API_TOKEN: { method: 'from_token', description: 'Monday.com API token' },
  }),
  apikey('clickup', 'ClickUp', 'ci-cd', 'https://clickup.com/api/', {
    CLICKUP_API_TOKEN: { method: 'from_token', description: 'ClickUp personal API token' },
  }),
  apikey('trello', 'Trello', 'ci-cd', 'https://developer.atlassian.com/cloud/trello/rest/', {
    TRELLO_API_KEY: { method: 'from_token', description: 'Trello API key' },
    TRELLO_TOKEN: { method: 'from_token', description: 'Trello auth token' },
  }),
  apikey('basecamp', 'Basecamp', 'ci-cd', 'https://github.com/basecamp/bc3-api', {
    BASECAMP_ACCESS_TOKEN: { method: 'from_token', description: 'Basecamp access token' },
  }),

  // --- Design ---
  apikey('figma', 'Figma', 'ci-cd', 'https://www.figma.com/developers/api', {
    FIGMA_ACCESS_TOKEN: { method: 'from_token', description: 'Figma personal access token' },
  }),
  apikey('canva', 'Canva', 'ci-cd', 'https://www.canva.dev/docs/connect/api-reference/', {
    CANVA_API_KEY: { method: 'from_token', description: 'Canva Connect API key' },
  }),

  // --- E-commerce ---
  apikey('shopify', 'Shopify', 'payment', 'https://shopify.dev/docs/api', {
    SHOPIFY_ACCESS_TOKEN: { method: 'from_token', description: 'Shopify Admin API access token' },
    SHOPIFY_STORE_DOMAIN: { method: 'from_token', description: 'Shopify store myshopify.com domain' },
  }),
  apikey('woocommerce', 'WooCommerce', 'payment', 'https://woocommerce.github.io/woocommerce-rest-api-docs/', {
    WOO_CONSUMER_KEY: { method: 'from_token', description: 'WooCommerce consumer key' },
    WOO_CONSUMER_SECRET: { method: 'from_token', description: 'WooCommerce consumer secret' },
  }),
  apikey('bigcommerce', 'BigCommerce', 'payment', 'https://developer.bigcommerce.com/docs/rest', {
    BIGCOMMERCE_ACCESS_TOKEN: { method: 'from_token', description: 'BigCommerce API access token' },
    BIGCOMMERCE_STORE_HASH: { method: 'from_token', description: 'BigCommerce store hash' },
  }),
  apikey('gumroad', 'Gumroad', 'payment', 'https://app.gumroad.com/api', {
    GUMROAD_ACCESS_TOKEN: { method: 'from_token', description: 'Gumroad access token' },
  }),

  // --- Automation ---
  apikey('zapier', 'Zapier', 'ci-cd', 'https://platform.zapier.com/reference', {
    ZAPIER_API_KEY: { method: 'from_token', description: 'Zapier API key' },
  }),
  apikey('make', 'Make (Integromat)', 'ci-cd', 'https://www.make.com/en/api-documentation', {
    MAKE_API_TOKEN: { method: 'from_token', description: 'Make API token' },
  }),
  apikey('n8n', 'n8n', 'ci-cd', 'https://docs.n8n.io/api/', {
    N8N_API_KEY: { method: 'from_token', description: 'n8n API key' },
  }),
  apikey('pipedream', 'Pipedream', 'ci-cd', 'https://pipedream.com/docs/api/', {
    PIPEDREAM_API_KEY: { method: 'from_token', description: 'Pipedream API key' },
  }),

  // --- AI / ML (additional) ---
  apikey('groq', 'Groq', 'ai-ml', 'https://console.groq.com/docs/api-reference', {
    GROQ_API_KEY: { method: 'from_token', description: 'Groq API key' },
  }),
  apikey('together-ai', 'Together AI', 'ai-ml', 'https://docs.together.ai/reference', {
    TOGETHER_API_KEY: { method: 'from_token', description: 'Together AI API key' },
  }),
  apikey('fireworks-ai', 'Fireworks AI', 'ai-ml', 'https://docs.fireworks.ai/api-reference', {
    FIREWORKS_API_KEY: { method: 'from_token', description: 'Fireworks AI API key' },
  }),
  apikey('mistral', 'Mistral AI', 'ai-ml', 'https://docs.mistral.ai/api/', {
    MISTRAL_API_KEY: { method: 'from_token', description: 'Mistral AI API key' },
  }),
  apikey('perplexity', 'Perplexity', 'ai-ml', 'https://docs.perplexity.ai/reference', {
    PERPLEXITY_API_KEY: { method: 'from_token', description: 'Perplexity API key' },
  }),
  apikey('deepseek', 'DeepSeek', 'ai-ml', 'https://platform.deepseek.com/api-docs', {
    DEEPSEEK_API_KEY: { method: 'from_token', description: 'DeepSeek API key' },
  }),
  apikey('elevenlabs', 'ElevenLabs', 'ai-ml', 'https://elevenlabs.io/docs/api-reference', {
    ELEVENLABS_API_KEY: { method: 'from_token', description: 'ElevenLabs API key' },
  }),
  apikey('assemblyai', 'AssemblyAI', 'ai-ml', 'https://www.assemblyai.com/docs/api-reference', {
    ASSEMBLYAI_API_KEY: { method: 'from_token', description: 'AssemblyAI API key' },
  }),
  apikey('pinecone', 'Pinecone', 'ai-ml', 'https://docs.pinecone.io/reference/api', {
    PINECONE_API_KEY: { method: 'from_token', description: 'Pinecone API key' },
    PINECONE_ENVIRONMENT: { method: 'from_token', description: 'Pinecone environment name' },
  }),
  apikey('weaviate', 'Weaviate', 'ai-ml', 'https://weaviate.io/developers/weaviate/api/rest', {
    WEAVIATE_API_KEY: { method: 'from_token', description: 'Weaviate API key' },
    WEAVIATE_URL: { method: 'from_token', description: 'Weaviate cluster URL' },
  }),
  apikey('qdrant', 'Qdrant', 'ai-ml', 'https://qdrant.tech/documentation/', {
    QDRANT_API_KEY: { method: 'from_token', description: 'Qdrant API key' },
    QDRANT_URL: { method: 'from_token', description: 'Qdrant cluster URL' },
  }),
  apikey('runpod', 'RunPod', 'ai-ml', 'https://docs.runpod.io/api-reference', {
    RUNPOD_API_KEY: { method: 'from_token', description: 'RunPod API key' },
  }),
  apikey('modal', 'Modal', 'ai-ml', 'https://modal.com/docs/reference', {
    MODAL_TOKEN_ID: { method: 'from_token', description: 'Modal token ID' },
    MODAL_TOKEN_SECRET: { method: 'from_token', description: 'Modal token secret' },
  }),
  apikey('banana-dev', 'Banana.dev', 'ai-ml', 'https://docs.banana.dev/', {
    BANANA_API_KEY: { method: 'from_token', description: 'Banana.dev API key' },
  }),
  apikey('voyage-ai', 'Voyage AI', 'ai-ml', 'https://docs.voyageai.com/reference', {
    VOYAGE_API_KEY: { method: 'from_token', description: 'Voyage AI API key' },
  }),

  // --- Communication (additional) ---
  apikey('pusher', 'Pusher', 'communication', 'https://pusher.com/docs/channels/library_auth_reference/rest-api/', {
    PUSHER_APP_ID: { method: 'from_token', description: 'Pusher app ID' },
    PUSHER_KEY: { method: 'from_token', description: 'Pusher key' },
    PUSHER_SECRET: { method: 'from_token', description: 'Pusher secret' },
  }),
  apikey('ably', 'Ably', 'communication', 'https://ably.com/docs/api/rest-api', {
    ABLY_API_KEY: { method: 'from_token', description: 'Ably API key' },
  }),
  apikey('stream', 'Stream', 'communication', 'https://getstream.io/docs/', {
    STREAM_API_KEY: { method: 'from_token', description: 'Stream API key' },
    STREAM_API_SECRET: { method: 'from_token', description: 'Stream API secret' },
  }),
  apikey('telegram', 'Telegram Bot', 'communication', 'https://core.telegram.org/bots/api', {
    TELEGRAM_BOT_TOKEN: { method: 'from_token', description: 'Telegram bot token' },
  }),
  apikey('whatsapp', 'WhatsApp Business', 'communication', 'https://developers.facebook.com/docs/whatsapp/', {
    WHATSAPP_TOKEN: { method: 'from_token', description: 'WhatsApp Cloud API token' },
    WHATSAPP_PHONE_NUMBER_ID: { method: 'from_token', description: 'WhatsApp phone number ID' },
  }),
  apikey('vonage', 'Vonage (Nexmo)', 'communication', 'https://developer.vonage.com/en/api', {
    VONAGE_API_KEY: { method: 'from_token', description: 'Vonage API key' },
    VONAGE_API_SECRET: { method: 'from_token', description: 'Vonage API secret' },
  }),

  // --- Monitoring (additional) ---
  apikey('logrocket', 'LogRocket', 'monitoring', 'https://docs.logrocket.com/', {
    LOGROCKET_APP_ID: { method: 'from_token', description: 'LogRocket app ID' },
  }),
  apikey('bugsnag', 'Bugsnag', 'monitoring', 'https://bugsnagapiv2.docs.apiary.io/', {
    BUGSNAG_API_KEY: { method: 'from_token', description: 'Bugsnag notifier API key' },
  }),
  apikey('rollbar', 'Rollbar', 'monitoring', 'https://docs.rollbar.com/reference', {
    ROLLBAR_ACCESS_TOKEN: { method: 'from_token', description: 'Rollbar project access token' },
  }),
  apikey('honeybadger', 'Honeybadger', 'monitoring', 'https://docs.honeybadger.io/api/', {
    HONEYBADGER_API_KEY: { method: 'from_token', description: 'Honeybadger API key' },
  }),
  apikey('statuspage', 'Statuspage', 'monitoring', 'https://developer.statuspage.io/', {
    STATUSPAGE_API_KEY: { method: 'from_token', description: 'Statuspage API key' },
    STATUSPAGE_PAGE_ID: { method: 'from_token', description: 'Statuspage page ID' },
  }),
  apikey('betterstack', 'Better Stack', 'monitoring', 'https://betterstack.com/docs/uptime/api/', {
    BETTERSTACK_API_TOKEN: { method: 'from_token', description: 'Better Stack API token' },
  }),

  // --- Auth (additional) ---
  apikey('stytch', 'Stytch', 'auth', 'https://stytch.com/docs/api', {
    STYTCH_PROJECT_ID: { method: 'from_token', description: 'Stytch project ID' },
    STYTCH_SECRET: { method: 'from_token', description: 'Stytch secret key' },
  }),
  apikey('workos', 'WorkOS', 'auth', 'https://workos.com/docs/reference', {
    WORKOS_API_KEY: { method: 'from_token', description: 'WorkOS API key' },
    WORKOS_CLIENT_ID: { method: 'from_token', description: 'WorkOS client ID' },
  }),
  apikey('descope', 'Descope', 'auth', 'https://docs.descope.com/api/', {
    DESCOPE_PROJECT_ID: { method: 'from_token', description: 'Descope project ID' },
    DESCOPE_MANAGEMENT_KEY: { method: 'from_token', description: 'Descope management key' },
  }),
  apikey('kinde', 'Kinde', 'auth', 'https://kinde.com/docs/developer-tools/kinde-management-api/', {
    KINDE_ISSUER_URL: { method: 'from_token', description: 'Kinde issuer URL' },
    KINDE_CLIENT_ID: { method: 'from_token', description: 'Kinde client ID' },
    KINDE_CLIENT_SECRET: { method: 'from_token', description: 'Kinde client secret' },
  }),

  // --- Email (additional) ---
  apikey('sendbird', 'Sendbird', 'email', 'https://sendbird.com/docs/chat/platform-api/', {
    SENDBIRD_API_TOKEN: { method: 'from_token', description: 'Sendbird API token' },
    SENDBIRD_APP_ID: { method: 'from_token', description: 'Sendbird application ID' },
  }),
  apikey('loops', 'Loops', 'email', 'https://loops.so/docs/api-reference', {
    LOOPS_API_KEY: { method: 'from_token', description: 'Loops API key' },
  }),
  apikey('brevo', 'Brevo (Sendinblue)', 'email', 'https://developers.brevo.com/reference', {
    BREVO_API_KEY: { method: 'from_token', description: 'Brevo API key' },
  }),
  apikey('sparkpost', 'SparkPost', 'email', 'https://developers.sparkpost.com/api/', {
    SPARKPOST_API_KEY: { method: 'from_token', description: 'SparkPost API key' },
  }),

  // --- Storage (additional) ---
  apikey('imagekit', 'ImageKit', 'storage', 'https://docs.imagekit.io/api-reference', {
    IMAGEKIT_PRIVATE_KEY: { method: 'from_token', description: 'ImageKit private key' },
    IMAGEKIT_PUBLIC_KEY: { method: 'from_token', description: 'ImageKit public key' },
    IMAGEKIT_URL_ENDPOINT: { method: 'from_token', description: 'ImageKit URL endpoint' },
  }),
  apikey('imgix', 'imgix', 'storage', 'https://docs.imgix.com/apis/management', {
    IMGIX_API_KEY: { method: 'from_token', description: 'imgix API key' },
  }),
  apikey('supabase-storage', 'Supabase Storage', 'storage', 'https://supabase.com/docs/guides/storage', {
    SUPABASE_URL: { method: 'from_token', description: 'Supabase project URL' },
    SUPABASE_SERVICE_ROLE_KEY: { method: 'from_token', description: 'Supabase service role key' },
  }),
  apikey('r2', 'Cloudflare R2', 'storage', 'https://developers.cloudflare.com/r2/', {
    R2_ACCESS_KEY_ID: { method: 'from_token', description: 'R2 access key ID' },
    R2_SECRET_ACCESS_KEY: { method: 'from_token', description: 'R2 secret access key' },
    R2_BUCKET_NAME: { method: 'from_token', description: 'R2 bucket name' },
  }),

  // --- Hosting (additional) ---
  apikey('deno-deploy', 'Deno Deploy', 'hosting', 'https://docs.deno.com/deploy/api/', {
    DENO_DEPLOY_TOKEN: { method: 'from_token', description: 'Deno Deploy access token' },
  }),
  apikey('coolify', 'Coolify', 'hosting', 'https://coolify.io/docs/api', {
    COOLIFY_API_TOKEN: { method: 'from_token', description: 'Coolify API token' },
  }),
  apikey('dokku', 'Dokku', 'hosting', 'https://dokku.com/docs/deployment/', {
    DOKKU_HOST: { method: 'from_token', description: 'Dokku server hostname' },
  }),

  // --- Analytics (additional) ---
  apikey('heap', 'Heap', 'analytics', 'https://developers.heap.io/reference', {
    HEAP_APP_ID: { method: 'from_token', description: 'Heap app ID' },
  }),
  apikey('hotjar', 'Hotjar', 'analytics', 'https://developer.hotjar.com/reference', {
    HOTJAR_SITE_ID: { method: 'from_token', description: 'Hotjar site ID' },
  }),
  apikey('fullstory', 'FullStory', 'analytics', 'https://developer.fullstory.com/', {
    FULLSTORY_ORG_ID: { method: 'from_token', description: 'FullStory org ID' },
  }),
  apikey('june', 'June', 'analytics', 'https://www.june.so/docs/api', {
    JUNE_API_KEY: { method: 'from_token', description: 'June analytics API key' },
  }),

  // --- Cloud (additional) ---
  apikey('hetzner', 'Hetzner Cloud', 'cloud', 'https://docs.hetzner.cloud/', {
    HETZNER_API_TOKEN: { method: 'from_token', description: 'Hetzner Cloud API token' },
  }),
  apikey('oracle-cloud', 'Oracle Cloud', 'cloud', 'https://docs.oracle.com/en-us/iaas/api/', {
    OCI_API_KEY: { method: 'from_token', description: 'Oracle Cloud Infrastructure API key' },
  }),
  apikey('scaleway', 'Scaleway', 'cloud', 'https://www.scaleway.com/en/developers/api/', {
    SCW_SECRET_KEY: { method: 'from_token', description: 'Scaleway secret key' },
    SCW_ACCESS_KEY: { method: 'from_token', description: 'Scaleway access key' },
  }),
  apikey('upcloud', 'UpCloud', 'cloud', 'https://developers.upcloud.com/', {
    UPCLOUD_USERNAME: { method: 'from_token', description: 'UpCloud API username' },
    UPCLOUD_PASSWORD: { method: 'from_token', description: 'UpCloud API password' },
  }),

  // --- CMS (additional) ---
  apikey('directus', 'Directus', 'cms', 'https://docs.directus.io/reference/', {
    DIRECTUS_TOKEN: { method: 'from_token', description: 'Directus static access token' },
    DIRECTUS_URL: { method: 'from_token', description: 'Directus instance URL' },
  }),
  apikey('payload', 'Payload CMS', 'cms', 'https://payloadcms.com/docs/rest-api/overview', {
    PAYLOAD_SECRET: { method: 'from_token', description: 'Payload CMS secret key' },
  }),
  apikey('hygraph', 'Hygraph (GraphCMS)', 'cms', 'https://hygraph.com/docs/api-reference', {
    HYGRAPH_TOKEN: { method: 'from_token', description: 'Hygraph permanent auth token' },
    HYGRAPH_ENDPOINT: { method: 'from_token', description: 'Hygraph content API endpoint' },
  }),
  apikey('keystone', 'KeystoneJS', 'cms', 'https://keystonejs.com/docs/apis/', {
    KEYSTONE_SESSION_SECRET: { method: 'from_token', description: 'Keystone session secret' },
  }),
  apikey('wordpress', 'WordPress', 'cms', 'https://developer.wordpress.org/rest-api/', {
    WORDPRESS_API_URL: { method: 'from_token', description: 'WordPress REST API URL' },
    WORDPRESS_APP_PASSWORD: { method: 'from_token', description: 'WordPress application password' },
  }),
  apikey('builder-io', 'Builder.io', 'cms', 'https://www.builder.io/c/docs/developer-tools', {
    BUILDER_API_KEY: { method: 'from_token', description: 'Builder.io public API key' },
  }),

  // --- Payment (additional) ---
  apikey('razorpay', 'Razorpay', 'payment', 'https://razorpay.com/docs/api/', {
    RAZORPAY_KEY_ID: { method: 'from_token', description: 'Razorpay key ID' },
    RAZORPAY_KEY_SECRET: { method: 'from_token', description: 'Razorpay key secret' },
  }),
  apikey('mollie', 'Mollie', 'payment', 'https://docs.mollie.com/reference/v2', {
    MOLLIE_API_KEY: { method: 'from_token', description: 'Mollie API key' },
  }),
  apikey('adyen', 'Adyen', 'payment', 'https://docs.adyen.com/api-explorer/', {
    ADYEN_API_KEY: { method: 'from_token', description: 'Adyen API key' },
    ADYEN_MERCHANT_ACCOUNT: { method: 'from_token', description: 'Adyen merchant account name' },
  }),
  apikey('coinbase-commerce', 'Coinbase Commerce', 'payment', 'https://docs.cdp.coinbase.com/commerce-onchain/', {
    COINBASE_COMMERCE_API_KEY: { method: 'from_token', description: 'Coinbase Commerce API key' },
  }),

  // --- Misc ---
  apikey('mapbox', 'Mapbox', 'analytics', 'https://docs.mapbox.com/api/', {
    MAPBOX_ACCESS_TOKEN: { method: 'from_token', description: 'Mapbox access token' },
  }),
  apikey('google-maps', 'Google Maps', 'analytics', 'https://developers.google.com/maps/documentation', {
    GOOGLE_MAPS_API_KEY: { method: 'from_token', description: 'Google Maps API key' },
  }),
  apikey('ip-info', 'IPinfo', 'analytics', 'https://ipinfo.io/developers', {
    IPINFO_TOKEN: { method: 'from_token', description: 'IPinfo access token' },
  }),
  apikey('liveblocks', 'Liveblocks', 'communication', 'https://liveblocks.io/docs/api-reference/rest-api-endpoints', {
    LIVEBLOCKS_SECRET_KEY: { method: 'from_token', description: 'Liveblocks secret key' },
  }),
  apikey('novu', 'Novu', 'communication', 'https://docs.novu.co/api-reference', {
    NOVU_API_KEY: { method: 'from_token', description: 'Novu API key' },
  }),
  apikey('knock', 'Knock', 'communication', 'https://docs.knock.app/reference', {
    KNOCK_API_KEY: { method: 'from_token', description: 'Knock secret API key' },
  }),
  apikey('courier', 'Courier', 'communication', 'https://www.courier.com/docs/reference/', {
    COURIER_AUTH_TOKEN: { method: 'from_token', description: 'Courier auth token' },
  }),
  apikey('trigger-dev', 'Trigger.dev', 'ci-cd', 'https://trigger.dev/docs/api-reference', {
    TRIGGER_API_KEY: { method: 'from_token', description: 'Trigger.dev API key' },
  }),
  apikey('inngest', 'Inngest', 'ci-cd', 'https://www.inngest.com/docs/reference', {
    INNGEST_EVENT_KEY: { method: 'from_token', description: 'Inngest event key' },
    INNGEST_SIGNING_KEY: { method: 'from_token', description: 'Inngest signing key' },
  }),
  apikey('qstash', 'QStash', 'ci-cd', 'https://upstash.com/docs/qstash/', {
    QSTASH_TOKEN: { method: 'from_token', description: 'QStash token' },
  }),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return all catalog entries matching a given category.
 */
export function getProvidersByCategory(category: string): ProviderCatalogEntry[] {
  return PROVIDER_CATALOG.filter((p) => p.category === category);
}

/**
 * Lookup a single provider by id. Returns undefined if not found.
 */
export function getProviderById(id: string): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === id);
}
