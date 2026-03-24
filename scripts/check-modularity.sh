#!/usr/bin/env bash
# check-modularity.sh — Enforces modular architecture rules
#
# ⚠️ UPDATED 2026-03-24: Engine protection rule relaxed for ForgeLoop engine replacement.
# The [engine] commit tag requirement is now advisory, not blocking.
# Cross-layer import checks and file size checks remain enforced.
#
set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

if [ "${CHECK_ALL:-false}" = "true" ]; then
  FILES=$(find ./src ./server/src ./client/src -name '*.ts' -o -name '*.tsx' 2>/dev/null)
else
  FILES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
fi

if [ -z "$FILES" ]; then
  echo -e "${GREEN}No TypeScript files to check${NC}"
  exit 0
fi

echo "=== Modularity Check ==="

# 1. Max file size (500 lines for new files, grandfathered exceptions)
GRANDFATHERED=(
  "src/agents/runtime.ts"
  "src/brain/brain-service.ts"
  "client/src/components/ui/icons/StatusIcons.tsx"
  "client/src/components/ui/icons/GeometricIcons.tsx"
)

for file in $FILES; do
  [ -f "$file" ] || continue
  lines=$(wc -l < "$file" | tr -d ' ')
  if [ "$lines" -gt 500 ]; then
    is_grandfathered=false
    for gf in "${GRANDFATHERED[@]}"; do
      if [[ "$file" == *"$gf" ]]; then
        is_grandfathered=true
        break
      fi
    done
    if [ "$is_grandfathered" = false ]; then
      echo -e "${YELLOW}WARNING: $file has $lines lines (max 500). Consider splitting.${NC}"
      WARNINGS=$((WARNINGS + 1))
    fi
  fi
done

# 2. Engine protection — RELAXED for ForgeLoop engine replacement
# Now advisory only — warns but doesn't block
ENGINE_FILES=""
for file in $FILES; do
  if [[ "$file" == src/* ]] && [[ "$file" != src/*.test.* ]]; then
    ENGINE_FILES="$ENGINE_FILES $file"
  fi
done

if [ -n "$ENGINE_FILES" ]; then
  echo -e "${YELLOW}NOTE: Engine files modified (src/):${NC}"
  for f in $ENGINE_FILES; do
    echo "  - $f"
  done
  echo -e "${YELLOW}  Engine is being replaced via ForgeLoop. This is expected.${NC}"
fi

# 3. Import boundary check — STILL ENFORCED (cross-layer imports are always bad)
for file in $FILES; do
  [ -f "$file" ] || continue
  if [[ "$file" == server/* ]]; then
    if grep -qE "from ['\"].*client/" "$file" 2>/dev/null; then
      echo -e "${RED}ERROR: $file imports from client/ — cross-layer import forbidden${NC}"
      ERRORS=$((ERRORS + 1))
    fi
  fi
  if [[ "$file" == client/* ]]; then
    if grep -qE "from ['\"].*server/" "$file" 2>/dev/null; then
      echo -e "${RED}ERROR: $file imports from server/ — cross-layer import forbidden${NC}"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

# Summary
echo ""
if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}FAILED: $ERRORS error(s), $WARNINGS warning(s)${NC}"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}PASSED with $WARNINGS warning(s)${NC}"
else
  echo -e "${GREEN}PASSED: All modularity checks clean${NC}"
fi
