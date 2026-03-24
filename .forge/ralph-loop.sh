#!/bin/bash
# ForgeLoop Ralph Loop
# Autonomous execution wrapper for Claude Code
# Runs tasks from the active plan until all acceptance criteria pass or a blocker is hit
#
# Usage: bash .forge/ralph-loop.sh [model]
# Default model: claude-opus-4-6
#
# ⚠️  Run this in a safe environment. Uses --dangerously-skip-permissions.

set -e

MODEL="${1:-claude-opus-4-6}"
FORGE_DIR="$(git rev-parse --show-toplevel)/.forge"
LOG_DIR="$FORGE_DIR/logs"

mkdir -p "$LOG_DIR"

echo "╔══════════════════════════════════════════════════╗"
echo "║           ForgeLoop Ralph Loop                   ║"
echo "║           Model: $MODEL"
echo "╚══════════════════════════════════════════════════╝"
echo ""

ITERATION=0
MAX_ITERATIONS=50  # Safety limit

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
  ITERATION=$((ITERATION + 1))
  COMMIT=$(git rev-parse --short=6 HEAD 2>/dev/null || echo "nocommit")
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  LOGFILE="$LOG_DIR/ralph_${TIMESTAMP}_${COMMIT}.log"

  echo ""
  echo "━━━ Iteration $ITERATION ━━━ $(date) ━━━"
  echo ""

  # Check if plan is complete
  if grep -q "PLAN COMPLETE" "$FORGE_DIR/memory/progress.md" 2>/dev/null; then
    echo "✅ Plan marked COMPLETE in progress.md"
    echo "🎉 Ralph loop finished successfully after $ITERATION iterations."
    exit 0
  fi

  # Check for blockers
  if grep -q "BLOCKER:" "$FORGE_DIR/memory/progress.md" 2>/dev/null; then
    echo "🚫 Blocker detected in progress.md:"
    grep "BLOCKER:" "$FORGE_DIR/memory/progress.md"
    echo ""
    echo "Human intervention needed. Ralph loop paused."
    exit 1
  fi

  # Build the prompt from current task
  CURRENT_TASK=$(grep -o "Next task: Task [0-9]*" "$FORGE_DIR/memory/progress.md" 2>/dev/null | grep -o "[0-9]*" || echo "")

  if [ -z "$CURRENT_TASK" ]; then
    echo "⚠️  Could not determine current task from progress.md"
    echo "Falling back to general forge-implement prompt."
    PROMPT="Read .forge/skills/forge-implement/SKILL.md and follow its instructions. Start by reading .forge/memory/progress.md to determine the current task."
  elif [ -f "$FORGE_DIR/plans/prompts/task-${CURRENT_TASK}.md" ]; then
    PROMPT=$(cat "$FORGE_DIR/plans/prompts/task-${CURRENT_TASK}.md")
  else
    PROMPT="Read .forge/skills/forge-implement/SKILL.md and follow its instructions. Current task is Task $CURRENT_TASK per progress.md."
  fi

  echo "📋 Running Task $CURRENT_TASK..."
  echo "📝 Log: $LOGFILE"
  echo ""

  # Run Claude Code
  claude --dangerously-skip-permissions \
    -p "$PROMPT" \
    --model "$MODEL" \
    &> "$LOGFILE"

  EXIT_CODE=$?

  if [ $EXIT_CODE -ne 0 ]; then
    echo "⚠️  Claude Code exited with code $EXIT_CODE"
    echo "Check log: $LOGFILE"
  fi

  # Brief pause between iterations
  sleep 5
done

echo ""
echo "⚠️  Max iterations ($MAX_ITERATIONS) reached. Ralph loop stopped."
echo "Check .forge/memory/progress.md for current state."
exit 2
