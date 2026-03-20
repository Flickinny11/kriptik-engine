#!/bin/bash
# Session Continuity Script — Ralph Wiggum equivalent
# Run this before ending a Claude Code session to preserve context
# Usage: bash scripts/session-continuity.sh "Phase X" "Summary of what was done"

set -e

PHASE="${1:-Unknown}"
SUMMARY="${2:-No summary provided}"
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
LOCAL_TIME=$(date '+%Y-%m-%d %I:%M %p %Z')

echo "=== Session Continuity: Saving state ==="
echo "Phase: $PHASE"
echo "Time: $LOCAL_TIME"

# Step 1: Update CLAUDE.md with session continuity log
if grep -q "## Session Continuity Log" CLAUDE.md; then
  # Replace existing log section (everything from ## Session Continuity Log to next ## or EOF)
  python3 -c "
import re, sys
with open('CLAUDE.md', 'r') as f:
    content = f.read()
# Find the section and replace it
pattern = r'## Session Continuity Log.*?(?=\n## |\Z)'
replacement = '''## Session Continuity Log

**Last Updated**: $LOCAL_TIME
**Phase In Progress**: $PHASE
**Summary**: $SUMMARY

### Handoff Notes
_Update this section with specific next steps before ending session._
'''
content = re.sub(pattern, replacement, content, flags=re.DOTALL)
with open('CLAUDE.md', 'w') as f:
    f.write(content)
"
else
  cat >> CLAUDE.md << 'CONTINUITY_EOF'

---

## Session Continuity Log

**Last Updated**: TIMESTAMP_PLACEHOLDER
**Phase In Progress**: PHASE_PLACEHOLDER
**Summary**: SUMMARY_PLACEHOLDER

### Handoff Notes
_Update this section with specific next steps before ending session._
CONTINUITY_EOF
  sed -i '' "s|TIMESTAMP_PLACEHOLDER|$LOCAL_TIME|g" CLAUDE.md
  sed -i '' "s|PHASE_PLACEHOLDER|$PHASE|g" CLAUDE.md
  sed -i '' "s|SUMMARY_PLACEHOLDER|$SUMMARY|g" CLAUDE.md
fi

# Step 2: Create/update handoff file
cat > /tmp/kriptik-session-handoff.md << HANDOFF_EOF
# KripTik Session Handoff
**Created**: $LOCAL_TIME
**Phase**: $PHASE
**Summary**: $SUMMARY

## To Resume
1. Read CLAUDE.md (session continuity log at the bottom)
2. Read docs/INTEGRATION_MAP.md for file changes
3. Continue from the phase noted above
HANDOFF_EOF

echo "=== Session state saved ==="
echo "  - CLAUDE.md updated"
echo "  - /tmp/kriptik-session-handoff.md created"
echo ""
echo "Ready to commit and push? Run:"
echo "  git add -A && git commit -m 'session-continuity: $PHASE' && git push"
