/**
 * Scope enforcer — verifies that an agent only modified files
 * within its scopedWritePaths.
 *
 * Spec Section 4.3, Check 1 — "Every modified file must be within the
 * agent's scope definition set by the Architect. Out-of-scope files →
 * rejected with diagnostics."
 *
 * Scope paths use glob-style matching:
 * - "src/auth/" matches any file under src/auth/
 * - "src/components/auth-*.tsx" matches specific file patterns
 * - Exact file paths match exactly
 */

import type { IScopeCheckResult } from "@kriptik/shared-interfaces";

/**
 * Check whether all modified files fall within the allowed write paths.
 *
 * A file is "in scope" if it matches at least one entry in allowedPaths.
 * Matching rules:
 * 1. If an allowedPath ends with "/", the file must start with that path (directory match).
 * 2. If an allowedPath contains "*", it's treated as a glob pattern.
 * 3. Otherwise, it's an exact file path match.
 */
export function checkScope(
  modifiedFiles: readonly string[],
  allowedPaths: readonly string[],
): IScopeCheckResult {
  const inScopeFiles: string[] = [];
  const outOfScopeFiles: string[] = [];

  for (const file of modifiedFiles) {
    if (isFileInScope(file, allowedPaths)) {
      inScopeFiles.push(file);
    } else {
      outOfScopeFiles.push(file);
    }
  }

  return {
    passed: outOfScopeFiles.length === 0,
    modifiedFiles: [...modifiedFiles],
    inScopeFiles,
    outOfScopeFiles,
    allowedPaths: [...allowedPaths],
  };
}

/**
 * Check whether a single file path matches any of the allowed paths.
 */
function isFileInScope(
  filePath: string,
  allowedPaths: readonly string[],
): boolean {
  const normalized = normalizePath(filePath);

  for (const allowedPath of allowedPaths) {
    const normalizedAllowed = normalizePath(allowedPath);

    // Directory match: allowedPath ends with "/"
    if (normalizedAllowed.endsWith("/")) {
      if (normalized.startsWith(normalizedAllowed)) {
        return true;
      }
      continue;
    }

    // Glob match: allowedPath contains "*"
    if (normalizedAllowed.includes("*")) {
      if (globMatch(normalized, normalizedAllowed)) {
        return true;
      }
      continue;
    }

    // Exact match
    if (normalized === normalizedAllowed) {
      return true;
    }

    // Also allow matching as a directory prefix without trailing slash
    // e.g. allowedPath "src/auth" should match "src/auth/login.ts"
    if (normalized.startsWith(normalizedAllowed + "/")) {
      return true;
    }
  }

  return false;
}

/**
 * Simple glob matching supporting * (any chars except /) and ** (any chars including /).
 */
function globMatch(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  let regexStr = "^";
  let i = 0;

  while (i < pattern.length) {
    if (pattern[i] === "*" && pattern[i + 1] === "*") {
      // ** matches any number of path segments
      regexStr += ".*";
      i += 2;
      // Skip trailing slash after **
      if (pattern[i] === "/") {
        i++;
      }
    } else if (pattern[i] === "*") {
      // * matches anything except /
      regexStr += "[^/]*";
      i++;
    } else if (pattern[i] === "?") {
      regexStr += "[^/]";
      i++;
    } else {
      // Escape regex special chars
      regexStr += pattern[i]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      i++;
    }
  }

  regexStr += "$";

  return new RegExp(regexStr).test(filePath);
}

/**
 * Normalize a path by removing leading ./ and trailing whitespace.
 */
function normalizePath(p: string): string {
  let result = p.trim();
  if (result.startsWith("./")) {
    result = result.slice(2);
  }
  return result;
}
