#!/bin/bash
# ForgeLoop Version Tracker
# Detects Claude Code version changes and flags when ForgeLoop may need updates.
# Called by session-start.sh.

FORGE_DIR="$(git rev-parse --show-toplevel 2>/dev/null)/.forge"
VERSION_FILE="$FORGE_DIR/memory/.claude-code-version"

# Get current Claude Code version
CURRENT_VERSION=$(claude --version 2>/dev/null || echo "unknown")

if [ "$CURRENT_VERSION" = "unknown" ]; then
  exit 0
fi

# Check if version has changed
if [ -f "$VERSION_FILE" ]; then
  LAST_VERSION=$(cat "$VERSION_FILE")
  if [ "$CURRENT_VERSION" != "$LAST_VERSION" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  ⚡ CLAUDE CODE VERSION CHANGED                      ║"
    echo "║                                                      ║"
    echo "║  Previous: $LAST_VERSION"
    echo "║  Current:  $CURRENT_VERSION"
    echo "║                                                      ║"
    echo "║  ForgeLoop may need updates to match new features.   ║"
    echo "║  Run: /forge-version-check to review what changed.   ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo ""
  fi
fi

# Save current version
echo "$CURRENT_VERSION" > "$VERSION_FILE"
