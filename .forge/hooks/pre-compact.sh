#!/bin/bash
# ForgeLoop Pre-Compact Hook
# Runs BEFORE context compaction to preserve critical state
# This prevents the "lost in the middle" problem

FORGE_DIR="$(git rev-parse --show-toplevel 2>/dev/null)/.forge"

if [ ! -d "$FORGE_DIR" ]; then
  exit 0
fi

echo "⚠️  COMPACTION INCOMING — Saving ForgeLoop state..."
echo ""
echo "CRITICAL: Before compaction completes, ensure progress.md is current."
echo "If you have uncommitted decisions or reasoning, write them NOW to:"
echo "  - .forge/memory/progress.md (current task state)"
echo "  - .forge/memory/DECISIONS.md (any new decisions)"
echo ""
echo "After compaction, re-read:"
echo "  - .forge/memory/progress.md"
echo "  - .forge/drift-prevention/constraints.md"
echo "  - .forge/drift-prevention/acceptance-criteria.md"
echo ""
echo "These files survive compaction. Your conversation history does not."
