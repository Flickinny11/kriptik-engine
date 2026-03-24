#!/bin/bash
# ForgeLoop Architecture Map Reindex (shell wrapper)
# Delegates to reindex-cli.js
#
# Usage:
#   .forge/mcp/reindex.sh              # Full reindex
#   .forge/mcp/reindex.sh --changed    # Changed files only
#   .forge/mcp/reindex.sh file1.ts     # Specific files

FORGE_DIR="$(git rev-parse --show-toplevel 2>/dev/null)/.forge"
CLI="$FORGE_DIR/mcp/reindex-cli.js"

if [ ! -f "$CLI" ]; then
  echo "Error: reindex-cli.js not found at $CLI"
  exit 1
fi

# Check if dependencies are installed
if [ ! -d "$FORGE_DIR/mcp/node_modules" ]; then
  echo "Installing architecture map dependencies..."
  cd "$FORGE_DIR/mcp" && npm install --silent && cd - > /dev/null
fi

node "$CLI" "$@"
