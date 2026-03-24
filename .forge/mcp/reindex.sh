#!/bin/bash
# ForgeLoop Architecture Map Reindex (shell wrapper)
# Sources .forge/.env for credentials, then runs reindex-cli.js

FORGE_DIR="$(git rev-parse --show-toplevel 2>/dev/null)/.forge"
CLI="$FORGE_DIR/mcp/reindex-cli.js"

if [ ! -f "$CLI" ]; then
  echo "Error: reindex-cli.js not found at $CLI"
  exit 1
fi

# Load environment
if [ -f "$FORGE_DIR/.env" ]; then
  set -a
  source "$FORGE_DIR/.env"
  set +a
fi

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Check dependencies
if [ ! -d "$FORGE_DIR/mcp/node_modules" ]; then
  echo "Installing architecture map dependencies..."
  cd "$FORGE_DIR/mcp" && npm install --silent && cd - > /dev/null
fi

node "$CLI" "$@"
