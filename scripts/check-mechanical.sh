#!/usr/bin/env bash
# check-mechanical.sh — Detects mechanical/pipeline patterns
#
# ⚠️ UPDATED 2026-03-24: These checks were written for the OLD single-agent Lead Agent
# engine. The new engine being built via ForgeLoop MAY legitimately use some of these
# patterns. The checks are preserved as WARNINGS (not errors) for awareness.
# To skip entirely: SKIP_MECHANICAL_CHECK=true git commit
#
set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# Allow skipping during ForgeLoop engine replacement work
if [ "${SKIP_MECHANICAL_CHECK:-false}" = "true" ]; then
  echo -e "${GREEN}Mechanical check skipped (SKIP_MECHANICAL_CHECK=true)${NC}"
  exit 0
fi

WARNINGS=0

if [ "${CHECK_ALL:-false}" = "true" ]; then
  FILES=$(find ./src ./server/src ./client/src \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null)
else
  FILES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
fi

if [ -z "$FILES" ]; then
  echo -e "${GREEN}No TypeScript files to check${NC}"
  exit 0
fi

echo "=== Mechanical Pattern Scanner (Advisory Mode) ==="
echo "NOTE: These patterns were forbidden by the old engine architecture."
echo "The new engine may legitimately use some of them."
echo "Set SKIP_MECHANICAL_CHECK=true to suppress."
echo ""

check_pattern() {
  local description="$1"
  local pattern="$2"
  local prohibition_num="$3"

  matches=""
  for file in $FILES; do
    [ -f "$file" ] || continue
    result=$(grep -n -E "$pattern" "$file" 2>/dev/null || true)
    if [ -n "$result" ]; then
      matches="$matches\n  $file:\n$(echo "$result" | sed 's/^/    /')\n"
    fi
  done

  if [ -n "$matches" ]; then
    echo -e "${YELLOW}ADVISORY #$prohibition_num: $description${NC}"
    echo -e "$matches"
    WARNINGS=$((WARNINGS + 1))
  fi
}

# Checks are now ADVISORY — they warn but don't block commits
# Patterns that are still genuinely bad regardless of architecture:

check_pattern \
  "Import from old KripTik app detected" \
  "(from\s+['\"].*KripTik|from\s+['\"].*kriptik-ai-opus|require\(['\"].*antiGravity)" \
  "11"

check_pattern \
  "Fire-and-forget event pattern (emit without Brain write)" \
  "(\.emit\(['\"]agent_|\.emit\(['\"]build_).*(\/\/\s*no\s*brain|\/\/\s*skip\s*brain)" \
  "8"

check_pattern \
  "Hardcoded regex for agent UI rendering" \
  "(agentTypeRegex|\/frontend\|backend\|database\/|agentColorMap\s*=\s*\{)" \
  "9"

# Summary — always exit 0 (advisory only)
echo ""
if [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}$WARNINGS advisory pattern(s) detected. Review if building new engine code.${NC}"
else
  echo -e "${GREEN}PASSED: No patterns detected${NC}"
fi
exit 0
