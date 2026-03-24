#!/bin/bash
# ForgeLoop Architecture Map MCP — Launcher
# Sources .forge/.env for credentials, then starts the MCP server.
# This keeps credentials out of .claude/settings.local.json.

FORGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Load environment
if [ -f "$FORGE_DIR/.env" ]; then
  set -a
  source "$FORGE_DIR/.env"
  set +a
fi

# Set project root
export PROJECT_ROOT="$(cd "$FORGE_DIR/.." && pwd)"

# Load nvm if available (needed for node)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

exec node "$FORGE_DIR/mcp/architecture-server.js"
