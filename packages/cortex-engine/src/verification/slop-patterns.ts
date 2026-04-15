/**
 * Default slop pattern library — the built-in anti-slop rules that ship
 * with every Cortex build. The Design Pioneer can extend these with
 * project-specific patterns via its Anti-Slop Ruleset (Artifact 3).
 *
 * Patterns are organized by category as described in spec Section 7.2
 * and enforced at spec Section 7.3 Layers 4-5.
 *
 * Each pattern includes:
 * - A regex applied per-line to file contents
 * - Severity: "error" blocks merge gate, "warning" is advisory
 * - Actionable suggestion so agents can self-correct
 * - Applicable file globs (empty = all files)
 */

import type { ISlopPattern } from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Placeholder text patterns
// ---------------------------------------------------------------------------

const PLACEHOLDER_TEXT_PATTERNS: ISlopPattern[] = [
  {
    id: "placeholder-lorem-ipsum",
    category: "placeholder-text",
    pattern: "lorem\\s+ipsum",
    severity: "error",
    description: "Lorem ipsum placeholder text in output.",
    suggestion:
      "Replace with real content derived from the user's intent. " +
      "If content isn't available yet, use a descriptive placeholder " +
      "like '[Product tagline from brief]' that signals intent.",
    applicableGlobs: [],
  },
  {
    id: "placeholder-example-dot-com",
    category: "placeholder-text",
    pattern: "(?:https?://)?(?:www\\.)?example\\.(?:com|org|net)",
    severity: "warning",
    description: "example.com/org/net placeholder URL.",
    suggestion:
      "Replace with a real URL or a clearly marked placeholder " +
      "using the project's domain pattern.",
    applicableGlobs: [],
  },
  {
    id: "placeholder-foo-bar-baz",
    category: "placeholder-text",
    pattern:
      "(?:^|\\s)(?:foo|bar|baz|qux|quux)(?:Bar|Baz|Qux)?(?:\\s|$|['\"`.,;:])",
    severity: "warning",
    description: "Generic foo/bar/baz placeholder names in non-test code.",
    suggestion:
      "Use meaningful, domain-specific names that describe the " +
      "actual purpose of the variable, function, or component.",
    applicableGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  },
  {
    id: "placeholder-your-x-here",
    category: "placeholder-text",
    pattern: "(?:your|my)\\s+(?:\\w+\\s+)?here",
    severity: "error",
    description: "'Your X here' placeholder text in output.",
    suggestion:
      "Replace with actual content. Placeholders like 'Your name here' " +
      "should never ship — derive real content from the build intent.",
    applicableGlobs: [
      "**/*.tsx",
      "**/*.jsx",
      "**/*.html",
      "**/*.css",
      "**/*.md",
    ],
  },
];

// ---------------------------------------------------------------------------
// Generic comment patterns
// ---------------------------------------------------------------------------

const GENERIC_COMMENT_PATTERNS: ISlopPattern[] = [
  {
    id: "comment-this-function",
    category: "generic-comment",
    pattern:
      "//\\s*(?:This (?:function|method|class|component|module) (?:is used to|will|does|handles|takes care of))",
    severity: "warning",
    description:
      "Generic 'This function does X' comment that adds nothing beyond what the code says.",
    suggestion:
      "Remove the comment if the code is self-documenting. If context " +
      "is truly needed, explain WHY, not WHAT.",
    applicableGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  },
  {
    id: "comment-add-more-here",
    category: "generic-comment",
    pattern: "//\\s*(?:TODO|FIXME|HACK|XXX)?:?\\s*[Aa]dd\\s+(?:more|your|the rest)",
    severity: "error",
    description: "'Add more here' comment indicating incomplete implementation.",
    suggestion:
      "Implement the actual functionality. If genuinely deferred, " +
      "create a tracked goal with specific requirements, not a vague comment.",
    applicableGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  },
];

// ---------------------------------------------------------------------------
// Hardcoded credential patterns
// ---------------------------------------------------------------------------

const HARDCODED_CREDENTIAL_PATTERNS: ISlopPattern[] = [
  {
    id: "credential-api-key-inline",
    category: "hardcoded-credential",
    pattern:
      "(?:api[_-]?key|apikey|api[_-]?secret|secret[_-]?key)\\s*[:=]\\s*['\"][a-zA-Z0-9_\\-]{16,}['\"]",
    severity: "error",
    description: "Hardcoded API key or secret in source code.",
    suggestion:
      "Use environment variables via process.env or the credential " +
      "gateway. Never commit secrets to the repository.",
    applicableGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  },
  {
    id: "credential-password-inline",
    category: "hardcoded-credential",
    pattern:
      "(?:password|passwd|pwd)\\s*[:=]\\s*['\"][^'\"]{4,}['\"]",
    severity: "error",
    description: "Hardcoded password in source code.",
    suggestion:
      "Use environment variables or the credential gateway. " +
      "Never commit passwords to the repository.",
    applicableGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  },
  {
    id: "credential-bearer-token",
    category: "hardcoded-credential",
    pattern:
      "(?:Bearer|token)\\s+[a-zA-Z0-9_\\-\\.]{20,}",
    severity: "error",
    description: "Hardcoded bearer token or auth token in source code.",
    suggestion:
      "Tokens must come from environment variables or the credential " +
      "gateway at runtime. Never embed tokens in source.",
    applicableGlobs: [],
  },
];

// ---------------------------------------------------------------------------
// Commented-out code patterns
// ---------------------------------------------------------------------------

const COMMENTED_OUT_CODE_PATTERNS: ISlopPattern[] = [
  {
    id: "commented-out-import",
    category: "commented-out-code",
    pattern: "^\\s*//\\s*import\\s+",
    severity: "warning",
    description: "Commented-out import statement.",
    suggestion:
      "Remove commented-out imports. If the import is needed later, " +
      "git history preserves it. Dead code comments are noise.",
    applicableGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  },
  {
    id: "commented-out-function",
    category: "commented-out-code",
    pattern:
      "^\\s*//\\s*(?:export\\s+)?(?:async\\s+)?(?:function|const|let|var)\\s+\\w+",
    severity: "warning",
    description: "Commented-out function or variable declaration.",
    suggestion:
      "Remove commented-out code. Git history preserves deleted code. " +
      "Commented-out declarations create confusion about intent.",
    applicableGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  },
];

// ---------------------------------------------------------------------------
// Banned import patterns
// ---------------------------------------------------------------------------

const BANNED_IMPORT_PATTERNS: ISlopPattern[] = [
  {
    id: "banned-import-lucide-react",
    category: "banned-import",
    pattern:
      "(?:from|require\\()\\s*['\"]lucide-react['\"]",
    severity: "error",
    description: "Banned import: lucide-react icon library.",
    suggestion:
      "Use the project's design system icons from design-system/icons/. " +
      "Generic icon libraries produce cookie-cutter UIs.",
    applicableGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  },
  {
    id: "banned-import-heroicons",
    category: "banned-import",
    pattern:
      "(?:from|require\\()\\s*['\"]@heroicons/react['\"]",
    severity: "error",
    description: "Banned import: @heroicons/react icon library.",
    suggestion:
      "Use the project's design system icons from design-system/icons/. " +
      "Generic icon libraries produce cookie-cutter UIs.",
    applicableGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  },
  {
    id: "banned-import-react-icons",
    category: "banned-import",
    pattern:
      "(?:from|require\\()\\s*['\"]react-icons(?:/[^'\"]+)?['\"]",
    severity: "error",
    description: "Banned import: react-icons library.",
    suggestion:
      "Use the project's design system icons from design-system/icons/. " +
      "Generic icon libraries produce cookie-cutter UIs.",
    applicableGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  },
  {
    id: "banned-import-font-awesome",
    category: "banned-import",
    pattern:
      "(?:from|require\\()\\s*['\"](?:@fortawesome/|font-awesome)[^'\"]*['\"]",
    severity: "error",
    description: "Banned import: Font Awesome icon library.",
    suggestion:
      "Use the project's design system icons from design-system/icons/. " +
      "Generic icon libraries produce cookie-cutter UIs.",
    applicableGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  },
];

// ---------------------------------------------------------------------------
// Hardcoded color patterns
// ---------------------------------------------------------------------------

const HARDCODED_COLOR_PATTERNS: ISlopPattern[] = [
  {
    id: "hardcoded-hex-color",
    category: "hardcoded-color",
    pattern: "#[0-9a-fA-F]{6}\\b",
    severity: "error",
    description: "Hardcoded hex color value outside design system.",
    suggestion:
      "Use design system tokens or CSS custom properties (e.g., var(--color-primary)). " +
      "Hardcoded colors break theming and consistency.",
    applicableGlobs: [
      "**/*.tsx",
      "**/*.jsx",
      "**/*.css",
      "**/*.scss",
      "**/*.module.css",
    ],
  },
  {
    id: "hardcoded-rgb-color",
    category: "hardcoded-color",
    pattern: "(?:rgb|rgba)\\s*\\(\\s*\\d+",
    severity: "error",
    description: "Hardcoded rgb/rgba color function outside design system.",
    suggestion:
      "Use design system tokens or CSS custom properties. " +
      "Hardcoded color functions break theming and consistency.",
    applicableGlobs: [
      "**/*.tsx",
      "**/*.jsx",
      "**/*.css",
      "**/*.scss",
      "**/*.module.css",
    ],
  },
  {
    id: "hardcoded-hsl-color",
    category: "hardcoded-color",
    pattern: "(?:hsl|hsla)\\s*\\(\\s*\\d+",
    severity: "error",
    description: "Hardcoded hsl/hsla color function outside design system.",
    suggestion:
      "Use design system tokens or CSS custom properties. " +
      "Hardcoded color functions break theming and consistency.",
    applicableGlobs: [
      "**/*.tsx",
      "**/*.jsx",
      "**/*.css",
      "**/*.scss",
      "**/*.module.css",
    ],
  },
];

// ---------------------------------------------------------------------------
// Default UI pattern violations
// ---------------------------------------------------------------------------

const DEFAULT_UI_PATTERNS: ISlopPattern[] = [
  {
    id: "ui-default-spinner",
    category: "default-ui-pattern",
    pattern: "animate-spin\\s+rounded-full",
    severity: "error",
    description:
      "Default CSS spinner pattern. Spinners are banned in the anti-slop config.",
    suggestion:
      "Use LoadingSkeleton from design-system/components/. " +
      "Spinners are banned — skeleton loading is the required pattern.",
    applicableGlobs: ["**/*.tsx", "**/*.jsx"],
  },
  {
    id: "ui-generic-card",
    category: "default-ui-pattern",
    pattern: "bg-white\\s+rounded-lg\\s+(?:p-\\d+\\s+)?shadow-(?:sm|md|lg)",
    severity: "warning",
    description:
      "Generic Tailwind card styling without design system tokens.",
    suggestion:
      "Use Card component from design-system/components/Card. " +
      "Import shadow tokens from design-system/tokens/shadows.",
    applicableGlobs: ["**/*.tsx", "**/*.jsx"],
  },
  {
    id: "ui-emoji-in-ui",
    category: "default-ui-pattern",
    pattern:
      "[\\u{1F600}-\\u{1F64F}\\u{1F300}-\\u{1F5FF}\\u{1F680}-\\u{1F6FF}\\u{1F1E0}-\\u{1F1FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}]",
    severity: "warning",
    description: "Emoji in UI component — often a sign of generic AI output.",
    suggestion:
      "Replace emoji with proper icons from the design system or " +
      "semantic SVG illustrations. Emoji rarely belongs in production UI.",
    applicableGlobs: ["**/*.tsx", "**/*.jsx"],
  },
];

// ---------------------------------------------------------------------------
// AI-slop marker patterns
// ---------------------------------------------------------------------------

const AI_SLOP_MARKER_PATTERNS: ISlopPattern[] = [
  {
    id: "ai-slop-console-log-todo",
    category: "ai-slop-marker",
    pattern: "console\\.log\\(['\"](?:TODO|FIXME|HACK|test|debug)",
    severity: "error",
    description: "Debug console.log with TODO/test marker left in code.",
    suggestion:
      "Remove debug logging before merge. If logging is needed, " +
      "use a proper logging framework with appropriate log levels.",
    applicableGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  },
  {
    id: "ai-slop-triple-dot-implementation",
    category: "ai-slop-marker",
    pattern: "(?://|/\\*)\\s*\\.{3}\\s*(?:implement|rest|more|remaining|todo)",
    severity: "error",
    description: "'... implement later' marker indicating unfinished code.",
    suggestion:
      "Complete the implementation. If the work is genuinely deferred, " +
      "create a tracked goal. Never leave '...' markers in merged code.",
    applicableGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  },
  {
    id: "ai-slop-throw-not-implemented",
    category: "ai-slop-marker",
    pattern: "throw\\s+new\\s+Error\\(['\"](?:Not implemented|TODO|FIXME)",
    severity: "error",
    description: "'Not implemented' error thrown — incomplete implementation.",
    suggestion:
      "Implement the functionality or remove the code path if it's " +
      "not needed for the current goal.",
    applicableGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  },
  {
    id: "ai-slop-any-type",
    category: "ai-slop-marker",
    pattern: ":\\s*any\\b(?!\\s*\\[\\])",
    severity: "warning",
    description: "Explicit 'any' type annotation — loss of type safety.",
    suggestion:
      "Use a specific type. If the type is truly unknown, use 'unknown' " +
      "and narrow with type guards. 'any' defeats TypeScript's purpose.",
    applicableGlobs: ["**/*.ts", "**/*.tsx"],
  },
];

// ---------------------------------------------------------------------------
// Exported default pattern set
// ---------------------------------------------------------------------------

/**
 * The complete default slop pattern library.
 * Used as the base configuration for the AntiSlopLinter.
 * The Design Pioneer's Anti-Slop Ruleset (Artifact 3) extends this set
 * with project-specific patterns.
 */
export const DEFAULT_SLOP_PATTERNS: readonly ISlopPattern[] = [
  ...PLACEHOLDER_TEXT_PATTERNS,
  ...GENERIC_COMMENT_PATTERNS,
  ...HARDCODED_CREDENTIAL_PATTERNS,
  ...COMMENTED_OUT_CODE_PATTERNS,
  ...BANNED_IMPORT_PATTERNS,
  ...HARDCODED_COLOR_PATTERNS,
  ...DEFAULT_UI_PATTERNS,
  ...AI_SLOP_MARKER_PATTERNS,
];

/**
 * Default linter configuration using the built-in pattern library.
 * Warnings do NOT block the merge gate by default — only errors do.
 * The Architect can override this per-build.
 */
export const DEFAULT_SLOP_LINTER_CONFIG: Readonly<{
  patterns: readonly ISlopPattern[];
  treatWarningsAsErrors: boolean;
  excludeGlobs: readonly string[];
}> = {
  patterns: DEFAULT_SLOP_PATTERNS,
  treatWarningsAsErrors: false,
  excludeGlobs: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx",
    "**/__tests__/**",
    "**/*.d.ts",
    "**/vendor/**",
    "**/fixtures/**",
  ],
};
