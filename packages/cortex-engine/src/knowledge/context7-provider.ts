/**
 * Context7 MCP provider — fetches version-specific library documentation
 * via the Context7 MCP server protocol.
 *
 * Context7 is integrated as a Tier 1 shared service (Spec Section 4.2).
 * It provides CURRENT documentation — not training data versions — so agents
 * get accurate API references for any library they need to implement against.
 *
 * Spec Section 6.1 Layer 2 — "Context7 MCP Server — integrated as a Tier 1
 * shared service, fetches version-specific documentation for any library."
 */

import type {
  IContext7Provider,
  IDocumentationFragment,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// MCP transport abstraction
// ---------------------------------------------------------------------------

/**
 * Minimal MCP client interface for calling tools on an MCP server.
 * This avoids coupling to a specific MCP SDK — the caller provides
 * the transport (stdio, SSE, HTTP) via dependency injection.
 */
export interface MCPClient {
  /**
   * Call a tool on the connected MCP server.
   * @param toolName — the tool to invoke
   * @param args — tool arguments as a plain object
   * @returns The tool result content (typically a string or structured data)
   */
  callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult>;
}

/** Result from an MCP tool call. */
export interface MCPToolResult {
  /** Whether the tool call succeeded. */
  readonly isError: boolean;
  /** The result content — array of content blocks from MCP protocol. */
  readonly content: readonly MCPContentBlock[];
}

/** A single content block in an MCP tool result. */
export interface MCPContentBlock {
  readonly type: "text" | "image" | "resource";
  readonly text?: string;
}

// ---------------------------------------------------------------------------
// Context7Provider configuration
// ---------------------------------------------------------------------------

export interface Context7ProviderConfig {
  /** The MCP client connected to the Context7 server. */
  readonly mcpClient: MCPClient;
  /** Default maximum tokens per documentation fetch. Default: 5000. */
  readonly defaultMaxTokens?: number;
  /** Timeout for MCP calls in milliseconds. Default: 30000. */
  readonly timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Context7Provider implementation
// ---------------------------------------------------------------------------

/**
 * Fetches version-specific documentation for libraries via Context7 MCP.
 *
 * Context7 exposes two primary tools:
 * - `resolve-library-id` — maps a library name to its Context7 identifier
 * - `get-library-docs` — fetches documentation for a resolved library ID
 *
 * This provider wraps those MCP tool calls into the IContext7Provider interface
 * that the DocumentationResolver consumes.
 */
export class Context7Provider implements IContext7Provider {
  private readonly mcpClient: MCPClient;
  private readonly defaultMaxTokens: number;
  private readonly timeoutMs: number;

  /** Cache resolved library IDs to avoid redundant MCP lookups. */
  private readonly libraryIdCache = new Map<string, string | null>();

  constructor(config: Context7ProviderConfig) {
    this.mcpClient = config.mcpClient;
    this.defaultMaxTokens = config.defaultMaxTokens ?? 5000;
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  async resolveLibraryId(libraryName: string): Promise<string | null> {
    const normalized = libraryName.toLowerCase().trim();

    // Check cache first
    if (this.libraryIdCache.has(normalized)) {
      return this.libraryIdCache.get(normalized)!;
    }

    try {
      const result = await this.callWithTimeout(
        "resolve-library-id",
        { libraryName: normalized },
      );

      if (result.isError) {
        this.libraryIdCache.set(normalized, null);
        return null;
      }

      const text = this.extractText(result);
      if (!text) {
        this.libraryIdCache.set(normalized, null);
        return null;
      }

      // Context7 returns the library ID as plain text or JSON.
      // Try to parse as JSON first (may contain { id: "...", name: "..." }).
      const libraryId = this.parseLibraryId(text);
      this.libraryIdCache.set(normalized, libraryId);
      return libraryId;
    } catch {
      this.libraryIdCache.set(normalized, null);
      return null;
    }
  }

  async getDocumentation(
    libraryId: string,
    topic?: string,
    maxTokens?: number,
  ): Promise<IDocumentationFragment | null> {
    const tokens = maxTokens ?? this.defaultMaxTokens;

    try {
      const args: Record<string, unknown> = {
        libraryId,
        tokens: tokens,
      };
      if (topic) {
        args.topic = topic;
      }

      const result = await this.callWithTimeout("get-library-docs", args);

      if (result.isError) {
        return null;
      }

      const content = this.extractText(result);
      if (!content || content.trim().length === 0) {
        return null;
      }

      return {
        library: libraryId,
        version: this.extractVersionFromContent(content),
        content,
        source: "context7",
        fetchedAt: new Date(),
      };
    } catch {
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // A lightweight probe — resolve a well-known library to test connectivity.
      const result = await this.callWithTimeout(
        "resolve-library-id",
        { libraryName: "react" },
      );
      return !result.isError;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Call an MCP tool with a timeout guard.
   */
  private callWithTimeout(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    return new Promise<MCPToolResult>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Context7 MCP call "${toolName}" timed out after ${this.timeoutMs}ms`)),
        this.timeoutMs,
      );

      this.mcpClient
        .callTool(toolName, args)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Extract the text content from an MCP tool result.
   */
  private extractText(result: MCPToolResult): string | null {
    for (const block of result.content) {
      if (block.type === "text" && block.text) {
        return block.text;
      }
    }
    return null;
  }

  /**
   * Parse a library ID from Context7's resolve response.
   * The response may be plain text (just the ID) or JSON with an id field.
   */
  private parseLibraryId(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    // Try JSON parse first
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (typeof parsed.id === "string") return parsed.id;
        if (typeof parsed.libraryId === "string") return parsed.libraryId;
      } catch {
        // Not valid JSON — fall through to plain text
      }
    }

    // Plain text — the entire response is the library ID
    // Only accept if it looks like a reasonable identifier (no HTML, no errors)
    if (trimmed.length < 200 && !trimmed.includes("<") && !trimmed.includes("error")) {
      return trimmed;
    }

    return null;
  }

  /**
   * Attempt to extract a version number from documentation content.
   * Context7 docs often mention the version in headers or metadata.
   */
  private extractVersionFromContent(content: string): string | null {
    // Look for common version patterns in the first 500 chars
    const header = content.slice(0, 500);
    const versionMatch = header.match(/(?:version|v)[\s:]*(\d+\.\d+(?:\.\d+)?)/i);
    return versionMatch ? versionMatch[1]! : null;
  }
}
