#!/bin/bash
# ForgeLoop Architecture Map Reindex
# Re-indexes changed files in Qdrant after each completed task
#
# SCAFFOLD — The actual reindex logic will be built in Sprint 3
# alongside the architecture-server.js MCP.
#
# Usage: .forge/mcp/reindex.sh [--changed-since=COMMIT] [--full]
#
# --changed-since: Only reindex files changed since this commit (default: HEAD~1)
# --full: Reindex the entire codebase

FORGE_DIR="$(git rev-parse --show-toplevel)/.forge"
CHANGED_SINCE="${1:-HEAD~1}"

echo "ForgeLoop Architecture Map Reindex"
echo "==================================="

if [ "$1" = "--full" ]; then
  echo "Mode: Full reindex"
  # TODO: Sprint 3 — call architecture-server.js update_map tool
  echo "⚠️  Full reindex not yet implemented (Sprint 3)"
else
  echo "Mode: Changed files since $CHANGED_SINCE"
  echo "Changed files:"
  git diff --name-only "$CHANGED_SINCE" -- '*.ts' '*.tsx' 2>/dev/null | head -20
  # TODO: Sprint 3 — feed changed files to architecture-server.js update_map
  echo "⚠️  Incremental reindex not yet implemented (Sprint 3)"
fi
