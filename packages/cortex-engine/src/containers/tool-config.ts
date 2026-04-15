/**
 * MCP tool configuration per agent role.
 *
 * Each agent role gets a specific set of tools configured for its
 * responsibilities. Builders get file I/O + CLI execution, evaluators
 * get read-only + test execution, etc.
 *
 * Spec Section 1.4 — tool use for MCP integration and CLI execution.
 * Spec Section 3.2 — Agent Taxonomy (roles determine capabilities).
 * Spec Section 4.2 — MCP access to all Tier 1 services.
 */

import type { AgentRole, IToolDefinition } from "@kriptik/shared-interfaces";

/**
 * Get the default MCP tool configuration for an agent role.
 *
 * These are the base tools every agent of this role receives.
 * The orchestrator can extend this set with build-specific tools
 * (e.g., Tier 1 service MCP endpoints).
 */
export function getToolsForRole(role: AgentRole): IToolDefinition[] {
  switch (role) {
    case "builder":
      return [
        ...FILESYSTEM_TOOLS,
        ...CLI_TOOLS,
        ...GIT_TOOLS,
        ...PEER_MESSAGE_TOOLS,
      ];

    case "architect":
      return [
        ...FILESYSTEM_TOOLS,
        ...CLI_TOOLS,
        ...GIT_TOOLS,
        ...PEER_MESSAGE_TOOLS,
        ...BLUEPRINT_TOOLS,
      ];

    case "evaluator":
      return [
        ...READ_ONLY_FILESYSTEM_TOOLS,
        ...TEST_TOOLS,
        ...GIT_TOOLS,
      ];

    case "sentinel":
      return [
        ...READ_ONLY_FILESYSTEM_TOOLS,
        ...SECURITY_TOOLS,
        ...GIT_TOOLS,
      ];

    case "design-pioneer":
      return [
        ...FILESYSTEM_TOOLS,
        ...CLI_TOOLS,
        ...PEER_MESSAGE_TOOLS,
      ];

    case "navigator":
      return [
        ...READ_ONLY_FILESYSTEM_TOOLS,
        ...BROWSER_TOOLS,
      ];

    case "inspector":
      return [
        ...READ_ONLY_FILESYSTEM_TOOLS,
        ...RUNTIME_INSPECTION_TOOLS,
      ];

    case "librarian":
      return [
        ...READ_ONLY_FILESYSTEM_TOOLS,
        ...KNOWLEDGE_TOOLS,
      ];

    case "orchestrator":
      // The orchestrator doesn't run inside a container — included
      // for completeness. Its tools are wired at the engine level.
      return [];

    case "ephemeral":
      return [
        ...FILESYSTEM_TOOLS,
        ...CLI_TOOLS,
      ];
  }
}

// ---------------------------------------------------------------------------
// Tool definitions organized by capability group
// ---------------------------------------------------------------------------

const FILESYSTEM_TOOLS: IToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file from the repository.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to repo root" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write content to a file. Only succeeds if the path is within your scoped write paths.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to repo root" },
        content: { type: "string", description: "File content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description: "List files and directories at a given path.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path relative to repo root" },
      },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description:
      "Search for files matching a pattern or containing specific text.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern or search text" },
        path: {
          type: "string",
          description: "Directory to search in (default: repo root)",
        },
      },
      required: ["pattern"],
    },
  },
];

const READ_ONLY_FILESYSTEM_TOOLS: IToolDefinition[] = [
  FILESYSTEM_TOOLS[0]!, // read_file
  FILESYSTEM_TOOLS[2]!, // list_directory
  FILESYSTEM_TOOLS[3]!, // search_files
];

const CLI_TOOLS: IToolDefinition[] = [
  {
    name: "execute_command",
    description:
      "Execute a shell command in the agent's working directory. " +
      "Write operations are restricted to scoped paths.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The command to execute" },
        args: {
          type: "array",
          items: { type: "string" },
          description: "Command arguments",
        },
        cwd: {
          type: "string",
          description: "Working directory relative to repo root",
        },
      },
      required: ["command"],
    },
  },
];

const GIT_TOOLS: IToolDefinition[] = [
  {
    name: "git_status",
    description: "Show the working tree status of the repository.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "git_diff",
    description: "Show changes between commits, the working tree, etc.",
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Branch or commit to diff against",
        },
      },
    },
  },
  {
    name: "git_commit",
    description: "Commit staged changes to your working branch.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Commit message" },
      },
      required: ["message"],
    },
  },
];

const PEER_MESSAGE_TOOLS: IToolDefinition[] = [
  {
    name: "send_peer_message",
    description:
      "Send a message to a peer agent via the graph-mesh communication channel. " +
      "Use for interface negotiations, status updates, and coordination.",
    input_schema: {
      type: "object",
      properties: {
        peerId: { type: "string", description: "ID of the peer agent" },
        messageType: {
          type: "string",
          enum: [
            "interface-proposal",
            "interface-acceptance",
            "interface-counter",
            "status-update",
            "dependency-ready",
            "help-request",
          ],
          description: "Type of peer message",
        },
        content: { type: "string", description: "Message content" },
      },
      required: ["peerId", "messageType", "content"],
    },
  },
];

const BLUEPRINT_TOOLS: IToolDefinition[] = [
  {
    name: "update_blueprint",
    description:
      "Update the architectural blueprint. Only the Architect agent can use this tool.",
    input_schema: {
      type: "object",
      properties: {
        section: { type: "string", description: "Blueprint section to update" },
        content: { type: "string", description: "Updated content" },
      },
      required: ["section", "content"],
    },
  },
  {
    name: "define_interface_contract",
    description:
      "Define or update an interface contract between components.",
    input_schema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "Module that provides the interface" },
        consumer: { type: "string", description: "Module that consumes the interface" },
        interfacePath: { type: "string", description: "Path to the interface definition" },
        description: { type: "string", description: "What this contract covers" },
      },
      required: ["provider", "consumer", "interfacePath", "description"],
    },
  },
];

const TEST_TOOLS: IToolDefinition[] = [
  {
    name: "run_tests",
    description: "Execute tests for a specific file or directory.",
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Test file or directory to run",
        },
        filter: {
          type: "string",
          description: "Test name filter pattern",
        },
      },
    },
  },
];

const SECURITY_TOOLS: IToolDefinition[] = [
  {
    name: "scan_vulnerabilities",
    description:
      "Scan code for security vulnerabilities and OWASP top 10 issues.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or directory to scan" },
      },
      required: ["path"],
    },
  },
];

const BROWSER_TOOLS: IToolDefinition[] = [
  {
    name: "navigate_to",
    description: "Navigate to a URL in the browser for visual inspection.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
      },
      required: ["url"],
    },
  },
  {
    name: "take_screenshot",
    description: "Take a screenshot of the current browser page.",
    input_schema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector to capture (default: full page)",
        },
      },
    },
  },
];

const RUNTIME_INSPECTION_TOOLS: IToolDefinition[] = [
  {
    name: "get_console_logs",
    description: "Get browser console output (logs, warnings, errors).",
    input_schema: {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["all", "error", "warn", "log"],
          description: "Filter by log level",
        },
      },
    },
  },
  {
    name: "get_network_requests",
    description: "Get network requests made by the application.",
    input_schema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "URL pattern to filter requests",
        },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tier 1 shared service tools — injected by the orchestrator for all roles
// Spec Section 4.2 — all agents access Tier 1 services via MCP.
// Spec Section 6.1 Layer 2 — Context7 MCP for dynamic documentation.
// ---------------------------------------------------------------------------

/**
 * Documentation tools powered by Context7 MCP (Tier 1 shared service).
 * These are NOT role-specific — they're injected by the orchestrator into
 * every agent that needs external library documentation.
 *
 * Spec Section 6.1 Layer 2 — "before implementing ANY external integration:
 * check skill files, use Context7 MCP for current docs, fall back to web
 * search. NEVER rely on training knowledge for API endpoints."
 */
export const DOCUMENTATION_TOOLS: IToolDefinition[] = [
  {
    name: "resolve_library_docs",
    description:
      "Resolve and fetch current, version-specific documentation for a library " +
      "or framework. Uses the Context7 MCP service (preferred), then falls back " +
      "to platform skill files, then web search. ALWAYS use this before " +
      "implementing any external integration — never rely on training knowledge " +
      "for API endpoints or method signatures.",
    input_schema: {
      type: "object",
      properties: {
        library: {
          type: "string",
          description:
            "Library or framework name (e.g., 'next', 'stripe', 'supabase')",
        },
        topic: {
          type: "string",
          description:
            "Specific topic within the library (e.g., 'app router', 'webhooks', 'auth')",
        },
        version: {
          type: "string",
          description:
            "Specific version to fetch docs for (e.g., '14.2.0'). If omitted, fetches latest.",
        },
      },
      required: ["library"],
    },
  },
  {
    name: "search_library_docs",
    description:
      "Search for documentation across available skill files and Context7. " +
      "Use when you're unsure which library to use or need to compare approaches.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query describing what you need (e.g., 'payment processing webhooks')",
        },
        libraries: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional list of libraries to search within. If omitted, searches all.",
        },
      },
      required: ["query"],
    },
  },
];

/**
 * Get the Tier 1 shared service tools that the orchestrator should inject
 * into agent sessions. These supplement the role-specific tools from
 * getToolsForRole().
 *
 * Spec Section 4.2 — "Persistent processes that survive individual agent
 * lifecycles. All agents access these via MCP or internal API."
 */
export function getTier1ServiceTools(): IToolDefinition[] {
  return [...DOCUMENTATION_TOOLS];
}

const KNOWLEDGE_TOOLS: IToolDefinition[] = [
  {
    name: "search_trails",
    description:
      "Search experiential trails in the knowledge base for relevant patterns.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Semantic search query" },
        trailType: {
          type: "string",
          enum: ["success", "failure", "anti-pattern", "decision"],
          description: "Filter by trail type",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "record_trail",
    description: "Record a new experiential trail entry to the knowledge base.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["success", "failure", "anti-pattern", "decision"],
          description: "Trail type",
        },
        description: { type: "string", description: "What happened" },
        context: { type: "string", description: "Relevant context" },
        outcome: { type: "string", description: "What the outcome was" },
      },
      required: ["type", "description", "context", "outcome"],
    },
  },
];
