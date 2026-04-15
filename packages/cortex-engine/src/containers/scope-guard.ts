/**
 * Filesystem scope guard — enforces scoped write paths at the
 * container level so agents can only modify files within their
 * assigned scope.
 *
 * Spec Section 4.2, Tier 3 — "mounted shared repository (full read,
 * scoped write)" enforced at the filesystem level.
 *
 * This is the container-layer counterpart to the merge gate's scope
 * check (Check 1). The merge gate catches violations at merge time;
 * this guard prevents them from happening in the first place.
 */

import { resolve, relative, sep } from "node:path";

/**
 * Determines whether a given file path is writable based on the
 * agent's scoped write paths configuration.
 *
 * Match rules (same as git/scope-enforcer.ts for consistency):
 * - Directory prefix: path ending in "/" matches all files under it
 * - Glob patterns: ** matches any directory depth, * matches within a segment
 * - Exact match: full file path must match exactly
 */
export function isPathWithinScope(
  filePath: string,
  repoPath: string,
  scopedWritePaths: readonly string[],
): boolean {
  // Resolve to absolute, then get path relative to repo root
  const absolutePath = resolve(repoPath, filePath);
  const relativePath = relative(repoPath, absolutePath);

  // Don't allow paths that escape the repo (../...)
  if (relativePath.startsWith("..") || resolve(absolutePath) !== absolutePath.replace(/\/$/, "")) {
    // Only check the escape case — resolve-based traversal check
    if (relativePath.startsWith("..")) {
      return false;
    }
  }

  // Normalize separators to forward slashes for matching
  const normalizedPath = relativePath.split(sep).join("/");

  for (const scope of scopedWritePaths) {
    // Directory prefix match: scope ends with "/"
    if (scope.endsWith("/")) {
      if (normalizedPath.startsWith(scope) || normalizedPath + "/" === scope) {
        return true;
      }
      continue;
    }

    // Glob match: scope contains * or **
    if (scope.includes("*")) {
      if (globMatch(normalizedPath, scope)) {
        return true;
      }
      continue;
    }

    // Exact match
    if (normalizedPath === scope) {
      return true;
    }
  }

  return false;
}

/**
 * Simple glob matching for scope paths.
 * Supports ** (any directory depth) and * (any segment content).
 */
function globMatch(path: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<<DOUBLESTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<DOUBLESTAR>>>/g, ".*");

  return new RegExp(`^${regexStr}$`).test(path);
}
