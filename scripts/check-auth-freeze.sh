#!/usr/bin/env bash
# check-auth-freeze.sh — Warns if frozen auth files are modified
# These files implement the social login flow that was debugged and frozen on 2026-03-19.
# See AUTH_SPEC.md Section 8 for the full specification.
set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

WARNINGS=0

# Files that are part of the frozen social auth configuration
FROZEN_FILES=(
  "server/src/auth.ts"
  "client/src/lib/auth-client.ts"
  "client/src/lib/api-config.ts"
  "client/vercel.json"
)

# Check staged files against frozen list
STAGED=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)

if [ -z "$STAGED" ]; then
  exit 0
fi

echo "=== Auth Freeze Check ==="

for frozen in "${FROZEN_FILES[@]}"; do
  if echo "$STAGED" | grep -q "^${frozen}$"; then
    echo -e "${YELLOW}WARNING: FROZEN AUTH FILE MODIFIED: ${frozen}${NC}"
    echo -e "${YELLOW}  This file is part of the social login flow frozen on 2026-03-19.${NC}"
    echo -e "${YELLOW}  READ AUTH_SPEC.md Section 8 before proceeding.${NC}"
    echo -e "${YELLOW}  Social login (Google + GitHub) was debugged and verified working.${NC}"
    echo -e "${YELLOW}  Changes to this file may break authentication.${NC}"
    echo ""
    WARNINGS=$((WARNINGS + 1))
  fi
done

# Also check if critical env var names are being changed
for frozen in "${FROZEN_FILES[@]}"; do
  if echo "$STAGED" | grep -q "^${frozen}$"; then
    DIFF=$(git diff --cached "$frozen" 2>/dev/null || true)
    # Check for dangerous changes
    if echo "$DIFF" | grep -qE "^\+.*sameSite.*['\"]none['\"]"; then
      echo -e "${RED}DANGER: sameSite being changed to 'none' in ${frozen}${NC}"
      echo -e "${RED}  This WILL break Safari/iOS authentication. See AUTH_SPEC.md Section 2.${NC}"
      WARNINGS=$((WARNINGS + 1))
    fi
    if echo "$DIFF" | grep -qE "^\+.*FRONTEND_URL|^\+.*BETTER_AUTH_URL|^\+.*COOKIE_DOMAIN" | grep -v "process.env"; then
      echo -e "${YELLOW}WARNING: Auth env var reference changed in ${frozen}${NC}"
      WARNINGS=$((WARNINGS + 1))
    fi
  fi
done

if [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}$WARNINGS auth freeze warning(s). Proceeding, but review AUTH_SPEC.md Section 8.${NC}"
else
  echo -e "${GREEN}Auth freeze check: no frozen files modified${NC}"
fi

# Warnings don't block the commit — they're informational
exit 0
