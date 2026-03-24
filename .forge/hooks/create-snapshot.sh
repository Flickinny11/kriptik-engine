#!/bin/bash
# ForgeLoop State Snapshot
# Captures codebase state at key decision points, linked to git commits.
# Usage: .forge/hooks/create-snapshot.sh [description]

FORGE_DIR="$(git rev-parse --show-toplevel)/.forge"
SNAPSHOT_DIR="$FORGE_DIR/memory/state-snapshots"
COMMIT_HASH=$(git rev-parse --short=8 HEAD 2>/dev/null || echo "uncommitted")
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DESCRIPTION="${1:-Automatic snapshot}"
SNAPSHOT_FILE="$SNAPSHOT_DIR/snapshot-${TIMESTAMP}-${COMMIT_HASH}.md"

mkdir -p "$SNAPSHOT_DIR"

echo "Creating state snapshot: $SNAPSHOT_FILE"

cat > "$SNAPSHOT_FILE" << EOF
# State Snapshot
- **Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
- **Git Commit:** $COMMIT_HASH
- **Description:** $DESCRIPTION

## File Tree (src/ — engine)
$(find "$(git rev-parse --show-toplevel)/src" -name '*.ts' -not -path '*/node_modules/*' 2>/dev/null | sort | sed 's|.*/src/|src/|')

## File Tree (server/src/)
$(find "$(git rev-parse --show-toplevel)/server/src" -name '*.ts' -not -path '*/node_modules/*' 2>/dev/null | sort | head -40 | sed 's|.*/server/|server/|')

## Recent Commits
$(git log --oneline -10 2>/dev/null)

## Current Branch
$(git branch --show-current 2>/dev/null)

## Test Status
$(cd "$(git rev-parse --show-toplevel)" && npx tsc --noEmit 2>&1 | tail -3)
EOF

echo "✅ Snapshot created: $SNAPSHOT_FILE"
