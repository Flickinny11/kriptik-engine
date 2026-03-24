#!/bin/bash
# ForgeLoop Acceptance Criteria Checker
# Parses acceptance-criteria.md and runs all checkable commands
# Returns 0 if all pass, 1 if any fail

FORGE_DIR="$(git rev-parse --show-toplevel)/.forge"
CRITERIA_FILE="$FORGE_DIR/drift-prevention/acceptance-criteria.md"

if [ ! -f "$CRITERIA_FILE" ]; then
  echo "No acceptance criteria file found."
  exit 1
fi

PASS=0
FAIL=0
PROJECT_ROOT="$(git rev-parse --show-toplevel)"

echo "Running acceptance criteria checks..."
echo ""

# TypeCheck
if [ -f "$PROJECT_ROOT/tsconfig.json" ]; then
  npx tsc --noEmit --pretty 2>&1 | tail -3
  if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "✅ TypeCheck"
    PASS=$((PASS + 1))
  else
    echo "❌ TypeCheck"
    FAIL=$((FAIL + 1))
  fi
fi

# Tests
if grep -q '"test"' "$PROJECT_ROOT/package.json" 2>/dev/null; then
  npm run test --silent 2>&1 | tail -3
  if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "✅ Tests"
    PASS=$((PASS + 1))
  else
    echo "❌ Tests"
    FAIL=$((FAIL + 1))
  fi
fi

# Lint
if grep -q '"lint"' "$PROJECT_ROOT/package.json" 2>/dev/null; then
  npm run lint --silent 2>&1 | tail -3
  if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "✅ Lint"
    PASS=$((PASS + 1))
  else
    echo "❌ Lint"
    FAIL=$((FAIL + 1))
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: $PASS passed, $FAIL failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAIL -gt 0 ]; then
  exit 1
else
  exit 0
fi
