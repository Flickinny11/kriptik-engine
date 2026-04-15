/**
 * Documentation resolver — resolves documentation needs for goal assignments
 * using the spec-defined priority chain.
 *
 * Priority chain (Spec Section 6.1 Layer 2):
 * 1. Context7 MCP — current, version-specific API documentation
 * 2. Platform skill files — curated SKILL.md files for complex integrations
 * 3. Web search fallback — for libraries not covered by Context7 or skill files
 *
 * ICE Stage 3 technical constraint maps are already in the goal assignment
 * (Layer 1 baked-in context) and are NOT fetched by this resolver.
 *
 * Spec Section 6.1 Layer 2 — Dynamic Documentation
 * Spec Section 4.2 — Tier 1 Shared Services
 */

import type {
  IContext7Provider,
  IDocumentationFragment,
  IDocumentationNeed,
  IDocumentationResolver,
  IDocumentationResult,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Skill file reader abstraction
// ---------------------------------------------------------------------------

/**
 * Interface for reading platform skill files from disk.
 * Skill files are curated SKILL.md files for complex multi-step integrations
 * (Stripe, Supabase, RunPod, etc.). Loaded on-demand, not preloaded.
 *
 * Spec Section 6.1 Layer 2 — "Platform-specific skill files — stored as
 * SKILL.md files for complex multi-step integrations. Loaded on-demand
 * when needed, not preloaded into context."
 */
export interface SkillFileReader {
  /**
   * Read a skill file for a library, if one exists.
   * @param library — the library name (e.g., "stripe", "supabase")
   * @returns The skill file content, or null if no skill file exists
   */
  readSkillFile(library: string): Promise<string | null>;

  /**
   * List all available skill file library names.
   * Used to quickly check if a skill file exists before attempting to read.
   */
  listAvailableSkills(): Promise<readonly string[]>;
}

// ---------------------------------------------------------------------------
// Web search fallback abstraction
// ---------------------------------------------------------------------------

/**
 * Interface for web search as a documentation fallback.
 * Used when neither Context7 nor skill files cover a library.
 *
 * Spec Section 6.1 Layer 2 — "Web search as fallback — for libraries not
 * covered by Context7 or ICE Stage 3."
 */
export interface WebSearchProvider {
  /**
   * Search the web for documentation on a library and topic.
   * @param library — the library name
   * @param topic — optional topic focus
   * @param maxResults — maximum number of results to synthesize (default: 3)
   * @returns Synthesized documentation content, or null if nothing useful found
   */
  searchDocumentation(
    library: string,
    topic?: string,
    maxResults?: number,
  ): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// DocumentationResolver configuration
// ---------------------------------------------------------------------------

export interface DocumentationResolverConfig {
  /** Context7 MCP provider (Tier 1 shared service). */
  readonly context7: IContext7Provider;
  /** Skill file reader for platform SKILL.md files. */
  readonly skillFiles: SkillFileReader;
  /** Web search fallback provider. */
  readonly webSearch: WebSearchProvider;
  /** Default max total tokens across all fragments. Default: 15000. */
  readonly defaultMaxTotalTokens?: number;
  /** Max tokens per individual fragment. Default: 5000. */
  readonly maxTokensPerFragment?: number;
}

// ---------------------------------------------------------------------------
// DocumentationResolver implementation
// ---------------------------------------------------------------------------

/**
 * Resolves documentation for goal assignments using the priority chain:
 * Context7 MCP → skill files → web search.
 *
 * Each library is resolved independently. The resolver stops at the first
 * source that provides documentation for a given library. Total token budget
 * is enforced across all fragments — later fragments may be truncated or
 * skipped if the budget is exhausted.
 */
export class DocumentationResolver implements IDocumentationResolver {
  private readonly context7: IContext7Provider;
  private readonly skillFiles: SkillFileReader;
  private readonly webSearch: WebSearchProvider;
  private readonly defaultMaxTotalTokens: number;
  private readonly maxTokensPerFragment: number;

  constructor(config: DocumentationResolverConfig) {
    this.context7 = config.context7;
    this.skillFiles = config.skillFiles;
    this.webSearch = config.webSearch;
    this.defaultMaxTotalTokens = config.defaultMaxTotalTokens ?? 15000;
    this.maxTokensPerFragment = config.maxTokensPerFragment ?? 5000;
  }

  async resolve(
    needs: readonly IDocumentationNeed[],
    maxTotalTokens?: number,
  ): Promise<IDocumentationResult> {
    const budget = maxTotalTokens ?? this.defaultMaxTotalTokens;
    const fragments: IDocumentationFragment[] = [];
    const unresolved: string[] = [];
    let tokensUsed = 0;

    // Check Context7 availability once upfront — if it's down, skip it
    // for all needs rather than timing out on each one.
    const context7Available = await this.context7.isAvailable();

    for (const need of needs) {
      if (tokensUsed >= budget) {
        // Budget exhausted — remaining needs go to unresolved
        unresolved.push(need.library);
        continue;
      }

      const remainingBudget = budget - tokensUsed;
      const perFragmentBudget = Math.min(this.maxTokensPerFragment, remainingBudget);

      const fragment = await this.resolveOne(need, context7Available, perFragmentBudget);

      if (fragment) {
        const tokenEstimate = this.estimateTokens(fragment.content);

        if (tokensUsed + tokenEstimate <= budget) {
          fragments.push(fragment);
          tokensUsed += tokenEstimate;
        } else if (tokensUsed < budget) {
          // Partial fit — truncate content to fit remaining budget
          const allowedTokens = budget - tokensUsed;
          const truncated = this.truncateToTokens(fragment.content, allowedTokens);
          fragments.push({ ...fragment, content: truncated });
          tokensUsed = budget;
        } else {
          unresolved.push(need.library);
        }
      } else {
        unresolved.push(need.library);
      }
    }

    return {
      fragments,
      unresolved,
      totalTokenEstimate: tokensUsed,
    };
  }

  extractNeeds(
    dependencies: readonly string[],
    constraints: Record<string, unknown>,
  ): IDocumentationNeed[] {
    const needs: IDocumentationNeed[] = [];
    const seen = new Set<string>();

    // Extract from dependency list (e.g., "next@14.2.0", "@stripe/stripe-js@2.0.0")
    for (const dep of dependencies) {
      const parsed = this.parseDependency(dep);
      if (parsed && !seen.has(parsed.library)) {
        seen.add(parsed.library);
        needs.push(parsed);
      }
    }

    // Extract from constraint map — look for integration-related keys
    // that suggest external services needing documentation.
    const constraintLibraries = this.extractLibrariesFromConstraints(constraints);
    for (const lib of constraintLibraries) {
      if (!seen.has(lib)) {
        seen.add(lib);
        needs.push({ library: lib });
      }
    }

    return needs;
  }

  // -------------------------------------------------------------------------
  // Priority chain resolution (private)
  // -------------------------------------------------------------------------

  /**
   * Resolve documentation for a single need using the priority chain.
   */
  private async resolveOne(
    need: IDocumentationNeed,
    context7Available: boolean,
    maxTokens: number,
  ): Promise<IDocumentationFragment | null> {
    // Priority 1: Context7 MCP
    if (context7Available) {
      const fragment = await this.tryContext7(need, maxTokens);
      if (fragment) return fragment;
    }

    // Priority 2: Platform skill files
    const skillFragment = await this.trySkillFile(need);
    if (skillFragment) return skillFragment;

    // Priority 3: Web search fallback
    const webFragment = await this.tryWebSearch(need);
    if (webFragment) return webFragment;

    return null;
  }

  /**
   * Try Context7 MCP for documentation.
   */
  private async tryContext7(
    need: IDocumentationNeed,
    maxTokens: number,
  ): Promise<IDocumentationFragment | null> {
    try {
      const libraryId = await this.context7.resolveLibraryId(need.library);
      if (!libraryId) return null;

      return await this.context7.getDocumentation(libraryId, need.topic, maxTokens);
    } catch {
      return null;
    }
  }

  /**
   * Try platform skill files.
   */
  private async trySkillFile(
    need: IDocumentationNeed,
  ): Promise<IDocumentationFragment | null> {
    try {
      const content = await this.skillFiles.readSkillFile(need.library);
      if (!content) return null;

      return {
        library: need.library,
        version: need.version ?? null,
        content,
        source: "skill-file",
        fetchedAt: new Date(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Try web search fallback.
   */
  private async tryWebSearch(
    need: IDocumentationNeed,
  ): Promise<IDocumentationFragment | null> {
    try {
      const content = await this.webSearch.searchDocumentation(
        need.library,
        need.topic,
      );
      if (!content) return null;

      return {
        library: need.library,
        version: need.version ?? null,
        content,
        source: "web-search",
        fetchedAt: new Date(),
      };
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Parsing helpers
  // -------------------------------------------------------------------------

  /**
   * Parse a dependency string into a documentation need.
   * Handles formats: "next@14.2.0", "@stripe/stripe-js@2.0.0", "react"
   */
  private parseDependency(dep: string): IDocumentationNeed | null {
    const trimmed = dep.trim();
    if (!trimmed) return null;

    // Handle scoped packages: @scope/name@version
    let library: string;
    let version: string | undefined;

    if (trimmed.startsWith("@")) {
      // Scoped package — find the second @ (version separator)
      const secondAt = trimmed.indexOf("@", 1);
      if (secondAt === -1) {
        library = trimmed;
      } else {
        library = trimmed.slice(0, secondAt);
        version = trimmed.slice(secondAt + 1);
      }
    } else {
      const atIndex = trimmed.indexOf("@");
      if (atIndex === -1) {
        library = trimmed;
      } else {
        library = trimmed.slice(0, atIndex);
        version = trimmed.slice(atIndex + 1);
      }
    }

    // Skip Node.js built-ins and internal packages that don't need docs
    if (this.isBuiltinOrInternal(library)) {
      return null;
    }

    return { library, version };
  }

  /**
   * Extract library names from a constraint map.
   * Looks for keys that suggest external integrations.
   */
  private extractLibrariesFromConstraints(
    constraints: Record<string, unknown>,
  ): string[] {
    const libraries: string[] = [];

    for (const [key, value] of Object.entries(constraints)) {
      // Keys like "stripe", "supabase", "vercel" are direct library names
      const normalizedKey = key.toLowerCase();

      // Skip generic constraint keys
      if (GENERIC_CONSTRAINT_KEYS.has(normalizedKey)) continue;

      // If the value is an object (nested constraints), the key might be a service name
      if (value && typeof value === "object" && !Array.isArray(value)) {
        libraries.push(normalizedKey);
      }

      // If the value is a string containing API/SDK/endpoint references
      if (typeof value === "string" && /(?:api|sdk|endpoint|webhook)/i.test(value)) {
        libraries.push(normalizedKey);
      }
    }

    return libraries;
  }

  /**
   * Check if a package is a Node.js built-in or internal package
   * that doesn't need external documentation.
   */
  private isBuiltinOrInternal(library: string): boolean {
    return NODE_BUILTINS.has(library) || library.startsWith("node:");
  }

  // -------------------------------------------------------------------------
  // Token estimation
  // -------------------------------------------------------------------------

  /**
   * Rough token estimate: ~4 chars per token for English text.
   * This is a heuristic — exact counts would require a tokenizer.
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate text to approximately the given number of tokens.
   * Truncates at the last complete line boundary within the limit.
   */
  private truncateToTokens(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;

    const truncated = text.slice(0, maxChars);
    const lastNewline = truncated.lastIndexOf("\n");
    if (lastNewline > maxChars * 0.8) {
      return truncated.slice(0, lastNewline) + "\n\n[truncated]";
    }
    return truncated + "\n\n[truncated]";
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Node.js built-in module names — don't need documentation fetching. */
const NODE_BUILTINS = new Set([
  "assert", "buffer", "child_process", "cluster", "console", "constants",
  "crypto", "dgram", "dns", "domain", "events", "fs", "http", "http2",
  "https", "module", "net", "os", "path", "perf_hooks", "process",
  "punycode", "querystring", "readline", "repl", "stream", "string_decoder",
  "sys", "timers", "tls", "tty", "url", "util", "v8", "vm", "worker_threads",
  "zlib",
]);

/** Generic constraint map keys that don't represent libraries. */
const GENERIC_CONSTRAINT_KEYS = new Set([
  "authentication", "authorization", "caching", "database", "deployment",
  "environment", "hosting", "logging", "monitoring", "performance",
  "routing", "security", "storage", "testing", "typescript", "validation",
]);
