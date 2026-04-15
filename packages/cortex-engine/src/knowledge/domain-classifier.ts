/**
 * DomainClassifier — classifies builds into application domains based on
 * prompt analysis, feature inventory, and dependency analysis.
 *
 * Implements IDomainClassifier from shared-interfaces.
 *
 * Classification uses a weighted signal system:
 * 1. Keyword signals from the prompt (weight: 0.4)
 * 2. Feature signals from the specification (weight: 0.3)
 * 3. Dependency signals from the tech stack (weight: 0.2)
 * 4. Historical match signals from past classifications (weight: 0.1)
 *
 * Spec Section 2.2, Stage 4, Method 1 — "Domain inference — what does
 *   this domain universally require?"
 * Spec Section 2.3 — "After 1,000 builds, ICE... KNOWS what users in
 *   specific domains want."
 */

import type {
  IDomainClassifier,
  IDomainClassification,
  IDomainScore,
  IDomainSignal,
  DomainSignalType,
  IDomainTaxonomy,
  IDomainStats,
  KnownDomain,
  IBuildOutcome,
} from "@kriptik/shared-interfaces";

/** Minimum confidence to assign a primary domain. */
const MIN_PRIMARY_CONFIDENCE = 0.30;

/** Minimum confidence to include as secondary domain. */
const MIN_SECONDARY_CONFIDENCE = 0.20;

/**
 * Domain keyword mappings — the keywords that signal each domain.
 * Weights indicate how strongly each keyword indicates the domain.
 */
const DOMAIN_KEYWORDS: Record<KnownDomain, readonly [string, number][]> = {
  "saas": [
    ["subscription", 0.9], ["billing", 0.8], ["multi-tenant", 0.9],
    ["pricing plan", 0.8], ["per-seat", 0.9], ["saas", 1.0],
    ["recurring payment", 0.8], ["trial", 0.5], ["onboarding", 0.4],
    ["tenant", 0.8], ["workspace", 0.5], ["team management", 0.6],
  ],
  "e-commerce": [
    ["shopping cart", 0.95], ["checkout", 0.8], ["product catalog", 0.9],
    ["e-commerce", 1.0], ["ecommerce", 1.0], ["payment", 0.6],
    ["inventory", 0.7], ["order", 0.5], ["shipping", 0.8],
    ["storefront", 0.9], ["product listing", 0.8], ["buy", 0.4],
  ],
  "content-management": [
    ["blog", 0.7], ["cms", 1.0], ["content management", 1.0],
    ["article", 0.6], ["editor", 0.5], ["publish", 0.5],
    ["documentation", 0.7], ["wiki", 0.8], ["markdown", 0.4],
    ["post", 0.4], ["category", 0.3], ["tag", 0.3],
  ],
  "dashboard": [
    ["dashboard", 0.9], ["analytics", 0.8], ["admin panel", 0.9],
    ["chart", 0.5], ["metric", 0.6], ["visualization", 0.7],
    ["report", 0.5], ["monitoring", 0.6], ["kpi", 0.8],
    ["data table", 0.5], ["overview", 0.3], ["widget", 0.4],
  ],
  "social": [
    ["social", 0.7], ["feed", 0.6], ["profile", 0.4],
    ["follow", 0.8], ["like", 0.5], ["comment", 0.4],
    ["message", 0.4], ["chat", 0.5], ["community", 0.6],
    ["notification", 0.3], ["share", 0.3], ["timeline", 0.7],
  ],
  "marketplace": [
    ["marketplace", 1.0], ["listing", 0.5], ["buyer", 0.7],
    ["seller", 0.7], ["review", 0.4], ["rating", 0.4],
    ["transaction", 0.5], ["commission", 0.7], ["escrow", 0.8],
    ["two-sided", 0.9], ["vendor", 0.6], ["bid", 0.6],
  ],
  "developer-tools": [
    ["api", 0.5], ["sdk", 0.8], ["developer portal", 0.9],
    ["api key", 0.7], ["documentation", 0.4], ["webhook", 0.5],
    ["cli", 0.7], ["developer", 0.5], ["integration", 0.3],
    ["oauth", 0.4], ["sandbox", 0.6], ["playground", 0.7],
  ],
  "productivity": [
    ["task", 0.4], ["project management", 0.9], ["kanban", 0.8],
    ["todo", 0.6], ["workflow", 0.6], ["collaboration", 0.5],
    ["calendar", 0.5], ["reminder", 0.5], ["sprint", 0.7],
    ["assign", 0.4], ["deadline", 0.5], ["gantt", 0.9],
  ],
  "media": [
    ["video", 0.6], ["audio", 0.6], ["streaming", 0.7],
    ["player", 0.5], ["upload", 0.3], ["transcode", 0.8],
    ["playlist", 0.7], ["podcast", 0.8], ["gallery", 0.5],
    ["media library", 0.8], ["thumbnail", 0.4], ["resolution", 0.4],
  ],
  "ai-powered": [
    ["ai", 0.5], ["chatbot", 0.8], ["llm", 0.8],
    ["prompt", 0.4], ["generate", 0.4], ["machine learning", 0.8],
    ["model", 0.3], ["inference", 0.7], ["embedding", 0.7],
    ["rag", 0.9], ["fine-tune", 0.8], ["agent", 0.5],
  ],
  "portfolio": [
    ["portfolio", 0.9], ["landing page", 0.7], ["personal website", 0.9],
    ["resume", 0.7], ["showcase", 0.6], ["about me", 0.7],
    ["contact form", 0.4], ["hero section", 0.5], ["testimonial", 0.5],
    ["case study", 0.6], ["project showcase", 0.8], ["branding", 0.4],
  ],
  "internal-tools": [
    ["internal tool", 0.9], ["admin", 0.5], ["back office", 0.8],
    ["crm", 0.7], ["erp", 0.8], ["inventory management", 0.7],
    ["employee", 0.5], ["hr", 0.6], ["approval workflow", 0.7],
    ["internal dashboard", 0.8], ["operations", 0.4], ["staff", 0.4],
  ],
};

/**
 * Dependency-to-domain mappings.
 */
const DEPENDENCY_SIGNALS: readonly [string, KnownDomain, number][] = [
  ["stripe", "e-commerce", 0.7],
  ["stripe", "saas", 0.5],
  ["shopify", "e-commerce", 0.9],
  ["snipcart", "e-commerce", 0.9],
  ["sanity", "content-management", 0.7],
  ["contentful", "content-management", 0.8],
  ["strapi", "content-management", 0.8],
  ["recharts", "dashboard", 0.7],
  ["chart.js", "dashboard", 0.6],
  ["d3", "dashboard", 0.6],
  ["socket.io", "social", 0.4],
  ["pusher", "social", 0.4],
  ["openai", "ai-powered", 0.7],
  ["langchain", "ai-powered", 0.8],
  ["ffmpeg", "media", 0.7],
  ["mux", "media", 0.8],
  ["cloudinary", "media", 0.5],
];

export class DomainClassifier implements IDomainClassifier {
  /** Accumulated domain statistics from classified builds. */
  private domainBuilds = new Map<string, {
    buildCount: number;
    taskTypes: Map<string, number>;
    dependencies: Map<string, number>;
    scores: number[];
    playbookCount: number;
  }>();

  private totalClassified = 0;
  private unclassifiedCount = 0;

  classify(
    prompt: string,
    features: readonly string[],
    dependencies: readonly string[],
  ): IDomainClassification {
    const signals: IDomainSignal[] = [];
    const domainScores = new Map<string, number>();

    // 1. Keyword signals from prompt (weight: 0.4)
    const promptLower = prompt.toLowerCase();
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      for (const [keyword, strength] of keywords) {
        if (promptLower.includes(keyword.toLowerCase())) {
          const weight = strength * 0.4;
          signals.push({
            signalType: "keyword",
            evidence: keyword,
            supportsDomain: domain,
            weight,
          });
          domainScores.set(
            domain,
            (domainScores.get(domain) ?? 0) + weight,
          );
        }
      }
    }

    // 2. Feature signals (weight: 0.3)
    for (const feature of features) {
      const featureLower = feature.toLowerCase();
      for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
        for (const [keyword, strength] of keywords) {
          if (featureLower.includes(keyword.toLowerCase())) {
            const weight = strength * 0.3;
            signals.push({
              signalType: "feature",
              evidence: feature,
              supportsDomain: domain,
              weight,
            });
            domainScores.set(
              domain,
              (domainScores.get(domain) ?? 0) + weight,
            );
          }
        }
      }
    }

    // 3. Dependency signals (weight: 0.2)
    for (const dep of dependencies) {
      const depLower = dep.toLowerCase().split("@")[0]; // strip version
      for (const [depName, domain, strength] of DEPENDENCY_SIGNALS) {
        if (depLower.includes(depName.toLowerCase())) {
          const weight = strength * 0.2;
          signals.push({
            signalType: "dependency",
            evidence: dep,
            supportsDomain: domain,
            weight,
          });
          domainScores.set(
            domain,
            (domainScores.get(domain) ?? 0) + weight,
          );
        }
      }
    }

    // Normalize scores to 0-1 range
    const maxScore = Math.max(...domainScores.values(), 0.01);
    const normalized = new Map<string, number>();
    for (const [domain, score] of domainScores) {
      normalized.set(domain, Math.min(score / maxScore, 1.0));
    }

    // Sort by score
    const ranked = Array.from(normalized.entries())
      .sort((a, b) => b[1] - a[1]);

    // Determine primary domain
    const [topDomain, topScore] = ranked[0] ?? [null, 0];
    const primaryDomain =
      topDomain && topScore >= MIN_PRIMARY_CONFIDENCE
        ? (topDomain as KnownDomain)
        : null;
    const primaryConfidence = topScore;

    // Secondary domains (above threshold, excluding primary)
    const secondaryDomains: IDomainScore[] = ranked
      .slice(1)
      .filter(([, score]) => score >= MIN_SECONDARY_CONFIDENCE)
      .map(([domain, confidence]) => ({
        domain: domain as KnownDomain,
        confidence,
      }));

    // Custom domain for unclassifiable builds
    const customDomain =
      primaryDomain === null
        ? this.inferCustomDomain(prompt, features)
        : null;

    const effectiveDomain = primaryDomain ?? customDomain ?? null;

    return {
      primaryDomain,
      primaryConfidence,
      secondaryDomains,
      customDomain,
      signals,
      effectiveDomain,
    };
  }

  refine(
    initial: IDomainClassification,
    buildOutcome: IBuildOutcome,
  ): IDomainClassification {
    // Use the build outcome's actual trails to refine classification.
    // Extract task types and dependencies from actual implementation.
    const actualDeps = buildOutcome.dependencies;
    const actualTaskTypes = [
      ...new Set(buildOutcome.trails.map((t) => t.taskType)),
    ];

    // Re-classify with the actual data supplementing the initial signals
    const refined = this.classify(
      // Use the initial effective domain as additional prompt context
      `${initial.effectiveDomain ?? ""} ${actualTaskTypes.join(" ")}`,
      actualTaskTypes,
      actualDeps,
    );

    // If the refined classification is more confident, use it
    if (refined.primaryConfidence > initial.primaryConfidence) {
      // Track domain stats
      this.recordClassification(refined, buildOutcome);
      return refined;
    }

    // Otherwise keep the initial classification but record it
    this.recordClassification(initial, buildOutcome);
    return initial;
  }

  getTaxonomy(): IDomainTaxonomy {
    const domains = new Map<string, IDomainStats>();

    for (const [domain, data] of this.domainBuilds) {
      const topTaskTypes = Array.from(data.taskTypes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([t]) => t);

      const topDependencies = Array.from(data.dependencies.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([d]) => d);

      const averageScore =
        data.scores.length > 0
          ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
          : null;

      domains.set(domain, {
        buildCount: data.buildCount,
        topTaskTypes,
        topDependencies,
        averageScore,
        playbookCount: data.playbookCount,
      });
    }

    return {
      domains,
      totalClassified: this.totalClassified,
      unclassifiedCount: this.unclassifiedCount,
    };
  }

  /**
   * Update playbook count for a domain (called externally when domain
   * playbooks are promoted).
   */
  updatePlaybookCount(domain: string, count: number): void {
    const data = this.domainBuilds.get(domain);
    if (data) {
      data.playbookCount = count;
    }
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  private recordClassification(
    classification: IDomainClassification,
    buildOutcome: IBuildOutcome,
  ): void {
    this.totalClassified++;

    const domain = classification.effectiveDomain;
    if (!domain) {
      this.unclassifiedCount++;
      return;
    }

    let data = this.domainBuilds.get(domain);
    if (!data) {
      data = {
        buildCount: 0,
        taskTypes: new Map(),
        dependencies: new Map(),
        scores: [],
        playbookCount: 0,
      };
      this.domainBuilds.set(domain, data);
    }

    data.buildCount++;

    // Record task types
    for (const trail of buildOutcome.trails) {
      data.taskTypes.set(
        trail.taskType,
        (data.taskTypes.get(trail.taskType) ?? 0) + 1,
      );
    }

    // Record dependencies
    for (const dep of buildOutcome.dependencies) {
      data.dependencies.set(dep, (data.dependencies.get(dep) ?? 0) + 1);
    }

    // Record score
    if (buildOutcome.evaluatorScore !== null) {
      data.scores.push(buildOutcome.evaluatorScore);
    }
  }

  private inferCustomDomain(
    prompt: string,
    features: readonly string[],
  ): string | null {
    // Attempt to infer a custom domain from the prompt.
    // Look for patterns like "X platform", "X app", "X system"
    const promptLower = prompt.toLowerCase();
    const patterns = [
      /(\w[\w\s-]+?)\s+(?:platform|app|application|system|tool|portal|site)/i,
    ];

    for (const pattern of patterns) {
      const match = promptLower.match(pattern);
      if (match && match[1] && match[1].length >= 3 && match[1].length <= 40) {
        return match[1].trim().replace(/\s+/g, "-");
      }
    }

    return null;
  }
}
