#!/usr/bin/env bash
# check-mechanical.sh — Detects mechanical/pipeline patterns forbidden by CLAUDE.md
# Scans for all 11 prohibitions from the Constitutional Rules
set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

ERRORS=0

# Files to check
if [ "${CHECK_ALL:-false}" = "true" ]; then
  FILES=$(find ./src ./server/src ./client/src \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null)
else
  FILES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
fi

if [ -z "$FILES" ]; then
  echo -e "${GREEN}No TypeScript files to check${NC}"
  exit 0
fi

echo "=== Mechanical Pattern Scanner ==="
echo "Checking against CLAUDE.md Constitutional Rules"
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
    echo -e "${RED}VIOLATION #$prohibition_num: $description${NC}"
    echo -e "$matches"
    ERRORS=$((ERRORS + 1))
  fi
}

# 1. NO SEQUENTIAL PHASE PIPELINES
check_pattern \
  "Sequential phase pipeline detected" \
  "(Phase[0-9]|phase[0-9]|PHASE_[0-9]|Wave[0-9]|wave[0-9]|Step[0-9]Step|currentPhase|phaseIndex|nextPhase)" \
  "1"

# 2. NO MECHANICAL ORCHESTRATION
check_pattern \
  "Mechanical orchestration class detected" \
  "(class\s+(Orchestrat|Coordinat|StateMachine|PipelineManager|WorkflowEngine|AgentManager|TaskDispatcher))" \
  "2"

# 3. NO PRE-POPULATED TASK LISTS
check_pattern \
  "Pre-populated task list detected" \
  "(taskQueue\s*=\s*\[|taskList\s*=\s*\[|predefinedTasks|allTasks\s*=\s*\[|taskPipeline)" \
  "3"

# 4. NO HARDCODED AGENT ROLES
check_pattern \
  "Hardcoded agent role detected" \
  "(class\s+(Frontend|Backend|Database|API|Auth|Design|Testing|DevOps|Deployment|Security)Agent\b|agentType\s*===?\s*['\"])" \
  "4"

# 5. NO SILENT AGENTS (agents that work without Brain writes)
# This is harder to detect statically — check for agent-like classes without brain references
# Skipped for static analysis — covered by code review

# 6. NO VERIFICATION AS SEPARATE PHASE
check_pattern \
  "Verification as separate phase detected" \
  "(verificationPhase|VerificationPhase|class\s+Verifier\b|runVerification\s*=\s*async|phase\s*===?\s*['\"]verify)" \
  "6"

# 7. NO ONE-SHOT GENERATION (generating entire files in single AI call)
# Hard to detect statically — skipped

# 8. NO FIRE-AND-FORGET EVENTS
check_pattern \
  "Fire-and-forget event pattern detected (emit without Brain write)" \
  "(\.emit\(['\"]agent_|\.emit\(['\"]build_).*(\/\/\s*no\s*brain|\/\/\s*skip\s*brain)" \
  "8"

# 9. NO HARDCODED REGEX FOR UI RENDERING
check_pattern \
  "Hardcoded regex for agent UI rendering detected" \
  "(agentTypeRegex|\/frontend\|backend\|database\/|switch\s*\(\s*agent\.type\s*\)|switch\s*\(\s*agentType\s*\)|agentColorMap\s*=\s*\{)" \
  "9"

# 10. NO MECHANICAL UI PATTERNS
# Note: switch(event.type) is legitimate for SSE serialization and event rendering.
# The prohibition is about hardcoded agent-type → component mapping.
check_pattern \
  "Mechanical UI pattern (hardcoded agent type to component mapping)" \
  "(agentTypeToComponent|getComponentForAgent|switch\s*\(\s*agent\.role\s*\)|renderAgentByType\s*=)" \
  "10"

# 11. NO IMPORTING FROM OLD APP
check_pattern \
  "Import from old KripTik app detected" \
  "(from\s+['\"].*KripTik|from\s+['\"].*kriptik-ai-opus|require\(['\"].*antiGravity)" \
  "11"

# Summary
echo ""
if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}FAILED: $ERRORS mechanical pattern violation(s) detected${NC}"
  echo -e "${RED}These patterns are FORBIDDEN by CLAUDE.md Constitutional Rules.${NC}"
  echo -e "${RED}The engine uses Brain-driven reasoning, NOT mechanical orchestration.${NC}"
  exit 1
else
  echo -e "${GREEN}PASSED: No mechanical patterns detected${NC}"
fi
