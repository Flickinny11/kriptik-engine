#!/usr/bin/env bash
# check-modularity.sh — Enforces modular architecture rules
# Run on pre-commit or CI to catch violations early
set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

# Files to check (either staged files or all TS/TSX files)
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

# 2. Engine protection — src/ files should not be modified without [engine] tag
ENGINE_FILES=""
for file in $FILES; do
  if [[ "$file" == src/* ]] && [[ "$file" != src/*.test.* ]]; then
    ENGINE_FILES="$ENGINE_FILES $file"
  fi
done

if [ -n "$ENGINE_FILES" ]; then
  COMMIT_MSG=$(git log -1 --format=%s 2>/dev/null || echo "")
  if [[ "$COMMIT_MSG" != *"[engine]"* ]] && [ "${SKIP_ENGINE_CHECK:-false}" != "true" ]; then
    echo -e "${RED}ERROR: Engine files modified without [engine] tag in commit message:${NC}"
    for f in $ENGINE_FILES; do
      echo "  - $f"
    done
    echo "  Add [engine] to your commit message if this is intentional."
    ERRORS=$((ERRORS + 1))
  fi
fi

# 3. Import boundary check — no cross-layer imports
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

# 4. New tools/systems must be in their own file
for file in $FILES; do
  [ -f "$file" ] || continue
  if [[ "$file" == src/tools/* ]] && [[ "$file" != */index.ts ]]; then
    lines=$(wc -l < "$file" | tr -d ' ')
    if [ "$lines" -gt 400 ]; then
      echo -e "${YELLOW}WARNING: Tool file $file is $lines lines. Keep tools focused and single-purpose.${NC}"
      WARNINGS=$((WARNINGS + 1))
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
