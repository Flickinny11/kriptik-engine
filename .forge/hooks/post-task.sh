#!/bin/bash
# ForgeLoop Post-Task Hook
# Runs when Claude stops (finishes a response)
# Reminds Claude to update progress and checks acceptance criteria

FORGE_DIR="$(git rev-parse --show-toplevel 2>/dev/null)/.forge"

if [ ! -d "$FORGE_DIR" ]; then
  exit 0
fi

echo ""
echo "┌─────────────────────────────────────────┐"
echo "│       ForgeLoop Post-Task Check          │"
echo "└─────────────────────────────────────────┘"
echo ""
echo "📝 REMINDER: Update .forge/memory/progress.md"
echo "   - Mark completed tasks"
echo "   - Note any decisions made"
echo "   - Update 'What The Next Session Needs To Know'"
echo ""
# Check if acceptance criteria file exists
if [ -f "$FORGE_DIR/drift-prevention/acceptance-criteria.md" ]; then
  echo "🔍 Running acceptance criteria checks..."
  echo ""

  # Run typecheck if tsconfig exists
  PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
  if [ -f "$PROJECT_ROOT/tsconfig.json" ]; then
    npx tsc --noEmit --pretty 2>&1 | tail -5
    TYPECHECK=$?
    if [ $TYPECHECK -ne 0 ]; then
      echo "❌ TypeCheck FAILED"
    else
      echo "✅ TypeCheck passed"
    fi
  fi

  # Run tests if test script exists
  if grep -q '"test"' "$PROJECT_ROOT/package.json" 2>/dev/null; then
    npm run test --silent 2>&1 | tail -5
    TEST=$?
    if [ $TEST -ne 0 ]; then
      echo "❌ Tests FAILED"
    else
      echo "✅ Tests passed"
    fi
  fi
else
  echo "(no acceptance criteria — no plan compiled yet)"
fi
