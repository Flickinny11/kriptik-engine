#!/usr/bin/env bash
# test-auth-flow.sh — Comprehensive auth and pipeline smoke tests
# Usage: BACKEND_URL=https://... bash scripts/test-auth-flow.sh
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
ORIGIN="${ORIGIN:-https://kriptik.app}"
COOKIES_A="/tmp/kriptik-test-user-a.txt"
COOKIES_B="/tmp/kriptik-test-user-b.txt"
PASS=0
FAIL=0
TIMESTAMP=$(date +%s)

log_pass() { echo -e "${GREEN}  PASS: $1${NC}"; PASS=$((PASS + 1)); }
log_fail() { echo -e "${RED}  FAIL: $1${NC}"; FAIL=$((FAIL + 1)); }

# Clean up old cookies
rm -f "$COOKIES_A" "$COOKIES_B"

echo "=== KripTik Auth & Pipeline Tests ==="
echo "Backend: $BACKEND_URL"
echo ""

# 1. Health check
echo "--- 1. Health Check ---"
HEALTH=$(curl -s "${BACKEND_URL}/api/health")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  log_pass "Health endpoint returns ok"
else
  log_fail "Health check failed: $HEALTH"
fi

# 2. OAuth catalog
echo "--- 2. OAuth Catalog ---"
CATALOG=$(curl -s "${BACKEND_URL}/api/oauth/catalog")
COUNT=$(echo "$CATALOG" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('providers', d.get('catalog', []))))" 2>/dev/null || echo "0")
if [ "$COUNT" -gt 100 ]; then
  log_pass "OAuth catalog has $COUNT providers"
else
  log_fail "OAuth catalog returned $COUNT providers (expected 150+)"
fi

# 3. Sign up User A
echo "--- 3. Sign Up User A ---"
SIGNUP_A=$(curl -s -X POST "${BACKEND_URL}/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -c "$COOKIES_A" \
  -d "{\"email\":\"test-a-${TIMESTAMP}@kriptik.test\",\"password\":\"TestPass123!\",\"name\":\"User A\"}")
USER_A_ID=$(echo "$SIGNUP_A" | python3 -c "import json,sys; print(json.load(sys.stdin).get('user',{}).get('id',''))" 2>/dev/null || echo "")
if [ -n "$USER_A_ID" ]; then
  log_pass "User A created: $USER_A_ID"
else
  log_fail "User A signup failed: $SIGNUP_A"
fi

# 4. Sign in User A
echo "--- 4. Sign In User A ---"
SIGNIN_A=$(curl -s -X POST "${BACKEND_URL}/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -c "$COOKIES_A" -b "$COOKIES_A" \
  -d "{\"email\":\"test-a-${TIMESTAMP}@kriptik.test\",\"password\":\"TestPass123!\"}")
SESSION_A=$(echo "$SIGNIN_A" | python3 -c "import json,sys; print(json.load(sys.stdin).get('session',{}).get('id',''))" 2>/dev/null || echo "")
if [ -n "$SESSION_A" ]; then
  log_pass "User A signed in, session: ${SESSION_A:0:16}..."
else
  log_fail "User A sign-in failed: $SIGNIN_A"
fi

# 5. Projects (unauthenticated → 401)
echo "--- 5. Unauthenticated Access ---"
UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/api/projects")
if [ "$UNAUTH" = "401" ]; then
  log_pass "Projects returns 401 without auth"
else
  log_fail "Projects returned $UNAUTH without auth (expected 401)"
fi

# 6. List projects (authenticated, empty)
echo "--- 6. List Projects (Empty) ---"
PROJECTS=$(curl -s -b "$COOKIES_A" "${BACKEND_URL}/api/projects")
PROJ_COUNT=$(echo "$PROJECTS" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('projects',[])))" 2>/dev/null || echo "-1")
if [ "$PROJ_COUNT" = "0" ]; then
  log_pass "User A has 0 projects initially"
else
  log_fail "User A has $PROJ_COUNT projects (expected 0): $PROJECTS"
fi

# 7. Create project
echo "--- 7. Create Project ---"
CREATE=$(curl -s -X POST -b "$COOKIES_A" "${BACKEND_URL}/api/projects" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Project ${TIMESTAMP}\",\"description\":\"Auth test\"}")
PROJECT_ID=$(echo "$CREATE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('project',{}).get('id',''))" 2>/dev/null || echo "")
if [ -n "$PROJECT_ID" ]; then
  log_pass "Project created: $PROJECT_ID"
else
  log_fail "Project creation failed: $CREATE"
fi

# 8. Get project
echo "--- 8. Get Project ---"
GET=$(curl -s -b "$COOKIES_A" "${BACKEND_URL}/api/projects/${PROJECT_ID}")
GOT_NAME=$(echo "$GET" | python3 -c "import json,sys; print(json.load(sys.stdin).get('project',{}).get('name',''))" 2>/dev/null || echo "")
if echo "$GOT_NAME" | grep -q "Test Project"; then
  log_pass "Get project returns correct name"
else
  log_fail "Get project failed: $GET"
fi

# 9. Cross-user isolation — Sign up User B
echo "--- 9. Cross-User Isolation ---"
curl -s -X POST "${BACKEND_URL}/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -c "$COOKIES_B" \
  -d "{\"email\":\"test-b-${TIMESTAMP}@kriptik.test\",\"password\":\"TestPass123!\",\"name\":\"User B\"}" > /dev/null 2>&1

curl -s -X POST "${BACKEND_URL}/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -c "$COOKIES_B" -b "$COOKIES_B" \
  -d "{\"email\":\"test-b-${TIMESTAMP}@kriptik.test\",\"password\":\"TestPass123!\"}" > /dev/null 2>&1

# User B tries to access User A's project
CROSS=$(curl -s -b "$COOKIES_B" "${BACKEND_URL}/api/projects/${PROJECT_ID}")
CROSS_CODE=$(echo "$CROSS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error','ok'))" 2>/dev/null || echo "")
if echo "$CROSS_CODE" | grep -qi "not found"; then
  log_pass "User B cannot access User A's project (isolation verified)"
else
  log_fail "Cross-user isolation BROKEN — User B saw: $CROSS"
fi

# User B sees 0 projects
B_PROJECTS=$(curl -s -b "$COOKIES_B" "${BACKEND_URL}/api/projects")
B_COUNT=$(echo "$B_PROJECTS" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('projects',[])))" 2>/dev/null || echo "-1")
if [ "$B_COUNT" = "0" ]; then
  log_pass "User B has 0 projects (sees only own data)"
else
  log_fail "User B sees $B_COUNT projects (expected 0)"
fi

# 10. Delete project
echo "--- 10. Delete Project ---"
DEL=$(curl -s -X DELETE -b "$COOKIES_A" "${BACKEND_URL}/api/projects/${PROJECT_ID}")
if echo "$DEL" | grep -q "success"; then
  log_pass "Project deleted by owner"
else
  log_fail "Project deletion failed: $DEL"
fi

# 11. Execute route (auth required)
echo "--- 11. Execute Route Auth ---"
EXEC_UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BACKEND_URL}/api/execute" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"test","prompt":"hello"}')
if [ "$EXEC_UNAUTH" = "401" ]; then
  log_pass "Execute route returns 401 without auth"
else
  log_fail "Execute route returned $EXEC_UNAUTH without auth"
fi

EXEC_BAD=$(curl -s -X POST -b "$COOKIES_A" "${BACKEND_URL}/api/execute" \
  -H "Content-Type: application/json" \
  -d '{}')
EXEC_STATUS=$(echo "$EXEC_BAD" | python3 -c "import json,sys; print(json.load(sys.stdin).get('error',''))" 2>/dev/null || echo "")
if echo "$EXEC_STATUS" | grep -qi "required"; then
  log_pass "Execute route validates required fields"
else
  log_fail "Execute route didn't validate: $EXEC_BAD"
fi

# Summary
echo ""
echo "=== Results ==="
echo -e "${GREEN}Passed: $PASS${NC}"
echo -e "${RED}Failed: $FAIL${NC}"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}SOME TESTS FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}ALL TESTS PASSED${NC}"
fi

# Cleanup
rm -f "$COOKIES_A" "$COOKIES_B"
