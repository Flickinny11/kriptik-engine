#!/bin/bash
# ForgeLoop Post-Edit Hook
# Runs after EVERY file edit — deterministic typecheck and lint
# No AI judgment here. Pure mechanical verification.

FILE="$1"

if [ -z "$FILE" ]; then
  exit 0
fi

EXTENSION="${FILE##*.}"
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"

# TypeScript/TSX files — typecheck
if [[ "$EXTENSION" == "ts" || "$EXTENSION" == "tsx" ]]; then
  if [ -f "$PROJECT_ROOT/tsconfig.json" ]; then
    npx tsc --noEmit --pretty 2>&1 | head -20
  fi
fi

# JS/TS files — lint
if [[ "$EXTENSION" == "ts" || "$EXTENSION" == "tsx" || "$EXTENSION" == "js" || "$EXTENSION" == "jsx" ]]; then
  if [ -f "$PROJECT_ROOT/.eslintrc.json" ] || [ -f "$PROJECT_ROOT/eslint.config.js" ] || [ -f "$PROJECT_ROOT/.eslintrc.js" ]; then
    npx eslint "$FILE" --quiet 2>&1 | head -10
  fi
fi
