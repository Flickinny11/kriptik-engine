/**
 * analyze_competitors tool — Real web crawling + HTML analysis.
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import { safeFetch, createLLMJSON, extractJSON } from './helpers.js';
import type { ProviderRouter } from '../../providers/router.js';
import { SERVICES, TIMEOUTS } from '../../config/services.js';
import { MODELS, THINKING, CONTEXT } from '../../config/models.js';

// --- Crawl helpers (only used by this tool) ---

function extractMarkdownHeadings(md: string): string[] {
  const headings: string[] = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^#{1,3}\s+(.+)/);
    if (m && m[1].length < 200) headings.push(m[1].trim());
    if (headings.length >= 20) break;
  }
  return headings;
}

function extractMarkdownListItems(md: string): string[] {
  const items: string[] = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^[-*]\s+(.{10,200})/);
    if (m) items.push(m[1].trim());
    if (items.length >= 30) break;
  }
  return items;
}

function extractTechSignalsFromText(text: string): string[] {
  const signals: string[] = [];
  const lower = text.toLowerCase();
  if (lower.includes('react') || lower.includes('__next')) signals.push('React/Next.js');
  if (lower.includes('vue') || lower.includes('__nuxt')) signals.push('Vue/Nuxt');
  if (lower.includes('svelte')) signals.push('Svelte');
  if (lower.includes('tailwind')) signals.push('Tailwind CSS');
  if (lower.includes('stripe')) signals.push('Stripe');
  if (lower.includes('firebase')) signals.push('Firebase');
  if (lower.includes('supabase')) signals.push('Supabase');
  if (lower.includes('clerk')) signals.push('Clerk Auth');
  if (lower.includes('intercom')) signals.push('Intercom');
  if (lower.includes('segment') || lower.includes('analytics')) signals.push('Analytics');
  return signals;
}

function extractPricingSignals(text: string): string[] {
  const signals: string[] = [];
  const priceRegex = /\$\d+(?:\.\d+)?(?:\s*\/\s*(?:mo|month|year|yr|user|seat))?/gi;
  let m;
  while ((m = priceRegex.exec(text)) !== null && signals.length < 10) {
    signals.push(m[0]);
  }
  if (/free\s*(?:plan|tier|trial)/i.test(text)) signals.push('Free tier available');
  if (/enterprise/i.test(text)) signals.push('Enterprise plan');
  return signals;
}

export function createCompetitorsTool(router: ProviderRouter): ToolDefinition {
  const llmJSON = createLLMJSON(router);

  return {
    name: 'analyze_competitors',
    description: 'Analyze competitor applications via real web crawling. Fetches competitor homepages, extracts features, navigation patterns, visual patterns, pricing models, and identifies table-stakes features that the user\'s app MUST have. Basic HTML implementation — will be enhanced with Firecrawl vision analysis later.',
    input_schema: {
      type: 'object',
      properties: {
        app_description: { type: 'string', description: 'Description of the app type (e.g., "AI image generator app")' },
        competitor_urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Direct URLs to competitor apps. If not provided, tool will try to identify competitors from the description.',
        },
        count: { type: 'number', description: 'Number of competitors to analyze (default 5)' },
      },
      required: ['app_description'],
    },
    execute: async (params) => {
      const urls = (params.competitor_urls as string[] | undefined) ?? [];
      const description = params.app_description as string;
      const firecrawlKey = process.env[SERVICES.FIRECRAWL.envKey];

      // Crawl up to 5 URLs concurrently — Firecrawl if available, basic fetch fallback
      interface CrawlResult {
        url: string;
        title: string;
        metaDescription: string;
        headings: string[];
        navItems: string[];
        features: string[];
        techSignals: string[];
        pricingSignals: string[];
        markdown?: string;
        screenshotBase64?: string;
        crawlMethod: 'firecrawl' | 'basic-fetch';
        fetchError?: string;
      }

      async function crawlSingleUrl(url: string): Promise<CrawlResult> {
        // --- Try Firecrawl first ---
        if (firecrawlKey) {
          const fcResult = await safeFetch(SERVICES.FIRECRAWL.endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlKey}`,
              'Content-Type': 'application/json',
            } as Record<string, string>,
            body: JSON.stringify({ url, formats: ['markdown', 'screenshot'] }),
            timeout: TIMEOUTS.FIRECRAWL,
          });

          if (fcResult.ok) {
            try {
              const fcData = JSON.parse(fcResult.text) as {
                data?: {
                  markdown?: string;
                  screenshot?: string;
                  metadata?: { title?: string; description?: string };
                };
              };
              const md = fcData.data?.markdown ?? '';
              return {
                url,
                title: fcData.data?.metadata?.title ?? '',
                metaDescription: fcData.data?.metadata?.description ?? '',
                headings: extractMarkdownHeadings(md),
                navItems: [],
                features: extractMarkdownListItems(md),
                techSignals: extractTechSignalsFromText(md),
                pricingSignals: extractPricingSignals(md),
                markdown: md.slice(0, 15_000),
                screenshotBase64: fcData.data?.screenshot,
                crawlMethod: 'firecrawl',
              };
            } catch {}
          }
        }

        // --- Basic fetch fallback ---
        const result = await safeFetch(url, { timeout: TIMEOUTS.COMPETITOR_FETCH });
        if (!result.ok) {
          return {
            url, title: '', metaDescription: '', headings: [], navItems: [],
            features: [], techSignals: [], pricingSignals: [],
            crawlMethod: 'basic-fetch',
            fetchError: `HTTP ${result.status}: ${result.text.slice(0, 200)}`,
          };
        }

        const html = result.text;
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);

        const headings: string[] = [];
        const headingRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
        let hMatch;
        while ((hMatch = headingRegex.exec(html)) !== null && headings.length < 20) {
          const clean = hMatch[1].replace(/<[^>]+>/g, '').trim();
          if (clean.length > 2 && clean.length < 200) headings.push(clean);
        }

        const navItems: string[] = [];
        for (const nav of (html.match(/<nav[\s\S]*?<\/nav>/gi) ?? []).slice(0, 3)) {
          const linkRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
          let lMatch;
          while ((lMatch = linkRegex.exec(nav)) !== null && navItems.length < 20) {
            const clean = lMatch[1].replace(/<[^>]+>/g, '').trim();
            if (clean.length > 1 && clean.length < 50) navItems.push(clean);
          }
        }

        const features: string[] = [];
        const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
        let liMatch;
        while ((liMatch = liRegex.exec(html)) !== null && features.length < 30) {
          const clean = liMatch[1].replace(/<[^>]+>/g, '').trim();
          if (clean.length > 10 && clean.length < 200) features.push(clean);
        }

        return {
          url,
          title: titleMatch ? titleMatch[1].trim() : '',
          metaDescription: metaMatch ? metaMatch[1].trim() : '',
          headings,
          navItems,
          features,
          techSignals: extractTechSignalsFromText(html),
          pricingSignals: extractPricingSignals(html),
          crawlMethod: 'basic-fetch',
        };
      }

      // Crawl up to 5 URLs concurrently
      const BATCH_SIZE = 5;
      const urlBatch = urls.slice(0, BATCH_SIZE);
      const crawlResults = await Promise.all(urlBatch.map(crawlSingleUrl));

      // If we got crawl results, use Claude to synthesize them
      if (crawlResults.length > 0) {
        // Strip screenshots from crawl data sent as text (they'll be sent as images)
        const crawlDataForText = crawlResults.map(({ screenshotBase64: _, ...rest }) => rest);
        const screenshots = crawlResults
          .filter((r) => r.screenshotBase64)
          .map((r) => ({ url: r.url, base64: r.screenshotBase64! }));

        const synthesisPrompt = `Analyze these competitor crawl results for an app described as: "${description}"

Crawl data:
${JSON.stringify(crawlDataForText, null, 2)}

${screenshots.length > 0 ? `Screenshots of ${screenshots.length} competitor sites are attached as images. Analyze their visual design carefully.` : ''}

For EACH competitor, provide a separate analysis object. Then synthesize across all competitors.

Return a JSON object:
{
  "competitors_analyzed": [
    {
      "url": "...",
      "name": "...",
      "summary": "...",
      "key_features": ["features this competitor offers"],
      "ux_patterns": ["navigation style, page flow, interaction patterns"],
      "visual_design": {
        "color_scheme": "...",
        "typography": "...",
        "spacing_and_layout": "...",
        "component_styles": "...",
        "distinctive_choices": "..."
      },
      "technical_signals": ["framework hints, API patterns, performance characteristics"]
    }
  ],
  "common_features": ["features EVERY competitor has — these are TABLE STAKES"],
  "differentiating_features": [
    { "feature": "...", "which_competitors": ["..."], "description": "..." }
  ],
  "common_ux_patterns": [
    { "interaction": "...", "how_competitors_handle_it": "..." }
  ],
  "visual_patterns": {
    "layout_trends": ["..."],
    "color_usage": ["..."],
    "typography_patterns": ["..."],
    "animation_usage": ["..."]
  },
  "pricing_models": [
    { "competitor": "...", "model": "...", "tiers": ["..."] }
  ],
  "table_stakes_checklist": ["features the user's app MUST have to be competitive"]
}`;

        // Build message content — text + screenshot images for vision analysis
        const messageContent: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = [
          { type: 'text', text: synthesisPrompt },
        ];
        for (const ss of screenshots) {
          messageContent.push({
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: ss.base64 },
          });
        }

        // Use router directly when we have images, llmJSON for text-only
        if (screenshots.length > 0) {
          const response = await router.complete({
            model: MODELS.ANALYSIS,
            max_tokens: CONTEXT.MAX_OUTPUT_TOKENS,
            thinking_budget: THINKING.ANALYSIS_BUDGET,
            system: 'You are a competitive analyst for web applications. Synthesize crawl data and visual screenshots into actionable intelligence. Pay special attention to visual design: layout, colors, typography, component styles, animation cues, and distinctive design choices.',
            messages: [{ role: 'user', content: messageContent as any }],
          });
          const raw = response.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join('');
          const parsed = extractJSON(raw);
          if (parsed) return { analysis: parsed, crawlResults: crawlDataForText, tokensUsed: response.usage };
          return { rawAnalysis: raw, crawlResults: crawlDataForText };
        }

        const { parsed, raw, usage } = await llmJSON(
          'You are a competitive analyst for web applications. Synthesize crawl data into actionable intelligence.',
          synthesisPrompt,
        );
        if (parsed) return { analysis: parsed, crawlResults: crawlDataForText, tokensUsed: usage };
        return { rawAnalysis: raw, crawlResults: crawlDataForText };
      }

      // No URLs provided — return guidance
      return {
        status: 'no_urls_provided',
        message: 'Provide competitor_urls for real crawling. Without URLs, use analyze_intent\'s inferred_needs for table-stakes features.',
        suggestion: `Search for "${description}" competitors and provide their URLs.`,
        crawlResults: [],
      };
    },
  };
}
