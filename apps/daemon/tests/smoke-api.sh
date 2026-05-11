#!/usr/bin/env bash
# Frontend → Daemon call chain smoke test.
# Verifies that every critical API endpoint is reachable and returns
# expected data shapes. This catches "改好代码后发现前端没调用" bugs.
#
# Usage: bash apps/daemon/tests/smoke-api.sh [daemon_url]

DAEMON_URL="${1:-http://localhost:17456}"
PASS=0
FAIL=0

log_pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
log_fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=========================================="
echo "  API Call Chain Smoke Test"
echo "  Daemon: $DAEMON_URL"
echo "=========================================="
echo ""

# --- Core endpoints ---
echo "[Core Endpoints]"

check_http() {
  local url="$1" label="$2" expected="$3"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null) || code="000"
  if [ "$code" = "$expected" ]; then
    log_pass "$label"
  else
    log_fail "$label (HTTP $code, expected $expected)"
  fi
}

check_http "$DAEMON_URL/api/agents" "/api/agents" "200"
check_http "$DAEMON_URL/api/skills" "/api/skills" "200"
check_http "$DAEMON_URL/api/design-systems" "/api/design-systems" "200"
check_http "$DAEMON_URL/api/projects" "/api/projects" "200"

# --- Data integrity checks ---
echo ""
echo "[Data Integrity]"

# Skills have deck mode
MODES=$(curl -sf "$DAEMON_URL/api/skills" 2>/dev/null | python3 -c "
import json, sys
try:
    skills = json.load(sys.stdin).get('skills', [])
    modes = set(s.get('mode', 'MISSING') for s in skills)
    print(','.join(sorted(modes)))
except Exception as e:
    print(f'ERROR: {e}')
" 2>/dev/null || echo "PARSE_ERROR")

if echo "$MODES" | grep -q "deck"; then
  log_pass "skill modes include 'deck' (modes: $MODES)"
else
  log_fail "no skill has mode=deck (modes: $MODES)"
fi

# Projects have metadata
META_CHECK=$(curl -sf "$DAEMON_URL/api/projects" 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    projects = data.get('projects', [])
    with_meta = sum(1 for p in projects if p.get('metadata'))
    print(f'{with_meta}/{len(projects)}')
except Exception:
    print('0/0')
" 2>/dev/null || echo "0/0")
log_pass "projects with metadata: $META_CHECK"

# --- Deck-specific endpoints ---
echo ""
echo "[Deck-Specific Endpoints]"

# Get a deck project ID
DECK_PROJECT=$(curl -sf "$DAEMON_URL/api/projects" 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    projects = data.get('projects', [])
    for p in projects:
        meta = p.get('metadata', {})
        if meta.get('kind') == 'deck':
            print(p['id'])
            break
except Exception:
    pass
" 2>/dev/null || echo "")

if [ -n "$DECK_PROJECT" ]; then
  log_pass "found deck project: $DECK_PROJECT"
  check_http "$DAEMON_URL/api/projects/$DECK_PROJECT/deck/session" "/api/projects/:id/deck/session (GET)" "200"
  check_http "$DAEMON_URL/api/projects/$DECK_PROJECT/files" "/api/projects/:id/files" "200"
else
  log_fail "no deck project found for endpoint testing"
fi

# --- Summary ---
echo ""
echo "=========================================="
echo "  Results: $PASS passed, $FAIL failed"
echo "=========================================="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
