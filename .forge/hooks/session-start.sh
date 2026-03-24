#!/bin/bash
# ForgeLoop Session Bootstrap Hook
# Runs at the start of every Claude Code session
# Forces memory loading before any work begins

echo "╔══════════════════════════════════════════════════╗"
echo "║           ForgeLoop Session Bootstrap            ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Check for Claude Code version changes
FORGE_DIR="$(git rev-parse --show-toplevel 2>/dev/null)/.forge"
if [ -f "$FORGE_DIR/hooks/version-check.sh" ]; then
  bash "$FORGE_DIR/hooks/version-check.sh"
fi


FORGE_DIR="$(git rev-parse --show-toplevel 2>/dev/null)/.forge"

if [ ! -d "$FORGE_DIR" ]; then
  echo "⚠️  .forge/ directory not found. ForgeLoop not initialized."
  exit 0
fi

echo "📋 Loading progress.md..."
echo "─────────────────────────────────────────"
cat "$FORGE_DIR/memory/progress.md" 2>/dev/null || echo "(no progress file)"
echo ""
echo "─────────────────────────────────────────"

echo "🚧 Loading active constraints..."
echo "─────────────────────────────────────────"
if [ -f "$FORGE_DIR/drift-prevention/constraints.md" ]; then
  cat "$FORGE_DIR/drift-prevention/constraints.md"
else
  echo "(no active constraints — no plan compiled yet)"
fi
echo ""
echo "─────────────────────────────────────────"

echo "✅ Loading acceptance criteria..."
echo "─────────────────────────────────────────"
if [ -f "$FORGE_DIR/drift-prevention/acceptance-criteria.md" ]; then
  cat "$FORGE_DIR/drift-prevention/acceptance-criteria.md"
else
  echo "(no acceptance criteria — no plan compiled yet)"
fi
echo ""
echo "─────────────────────────────────────────"

echo "🔀 Git state:"
git log --oneline -5 2>/dev/null
git status --short 2>/dev/null

echo ""
echo "══════════════════════════════════════════"
echo "  Bootstrap complete. Ready for work."
echo "══════════════════════════════════════════"
