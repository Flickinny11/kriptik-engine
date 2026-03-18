/**
 * External service configuration — endpoints, timeouts, env var keys.
 */

export const SERVICES = {
  BRAVE_SEARCH: {
    endpoint: 'https://api.search.brave.com/res/v1/web/search',
    envKey: 'BRAVE_SEARCH_API_KEY',
  },
  FIRECRAWL: {
    endpoint: 'https://api.firecrawl.dev/v1/scrape',
    envKey: 'FIRECRAWL_API_KEY',
  },
  QDRANT: {
    envKey: 'QDRANT_URL',
  },
  ANTHROPIC: {
    envKey: 'ANTHROPIC_API_KEY',
  },
  HUGGINGFACE: {
    envKey: 'HF_API_KEY',
    embeddingModel: 'sentence-transformers/all-MiniLM-L6-v2',
    vectorSize: 384,
  },
} as const;

export const TIMEOUTS = {
  COMMAND: 60_000,
  DEV_SERVER_READY: 30_000,
  SCREENSHOT_PAGE_LOAD: 15_000,
  SCREENSHOT_SELECTOR: 5_000,
  API_PROBE: 15_000,
  API_PROBE_DISCOVERY: 10_000,
  WEB_FETCH: 15_000,
  FIRECRAWL: 30_000,
  COMPETITOR_FETCH: 20_000,
  BUILD: 120_000,
  RATE_LIMIT_RETRY: 30_000,
} as const;

export const LIMITS = {
  COMMAND_BUFFER: 1024 * 1024 * 10,  // 10MB
  STDOUT_TRUNCATE: 5_000,
  STDERR_TRUNCATE: 5_000,
  TEST_STDOUT_TRUNCATE: 8_000,
  FETCH_BODY_TRUNCATE: 50_000,
  DOC_CONTENT_TRUNCATE: 30_000,
  COMPETITOR_URLS_MAX: 8,
  VERIFICATION_FILES_MAX: 100,
  PLACEHOLDER_RESULTS_MAX: 50,
  SECURITY_RESULTS_MAX: 50,
} as const;
