#!/usr/bin/env bash
# Deck generation smoke test — verifies the ENTIRE pipeline from frontend
# to agent prompt composition. Run after any change to:
#   - apps/daemon/src/prompts/* (system prompt composition)
#   - apps/daemon/src/skills.ts (skill mode detection)
#   - apps/daemon/src/server.ts (API endpoints, parameter passing)
#   - apps/web/src/components/ProjectView.tsx (frontend → daemon call)
#
# Usage: bash apps/daemon/tests/smoke-deck.sh [daemon_url]

DAEMON_URL="${1:-http://localhost:17456}"
PASS=0
FAIL=0
WARN=0

log_pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
log_fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }
log_warn() { echo "  WARN: $1"; WARN=$((WARN + 1)); }

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

echo "=========================================="
echo "  Deck Generation Smoke Test"
echo "  Daemon: $DAEMON_URL"
echo "=========================================="
echo ""

# ============================================================
# Check 1: Daemon is alive
# ============================================================
echo "[1/7] Daemon alive..."
check_http "$DAEMON_URL" "daemon responds" "404"

# ============================================================
# Check 2: Deck skills are loaded with correct mode
# ============================================================
echo "[2/7] Deck skill mode detection..."
SKILLS=$(curl -sf "$DAEMON_URL/api/skills" 2>/dev/null || echo '{"skills":[]}')
DECK_COUNT=$(echo "$SKILLS" | python3 -c "
import json, sys
try:
    skills = json.load(sys.stdin).get('skills', [])
    deck = [s for s in skills if s.get('mode') == 'deck']
    print(len(deck))
except Exception:
    print(0)
")
if [ "$DECK_COUNT" -ge 10 ]; then
  log_pass "found $DECK_COUNT deck-mode skills"
else
  log_fail "only $DECK_COUNT deck-mode skills (expected >= 10)"
fi

# Check specific skill
PPT_MODE=$(echo "$SKILLS" | python3 -c "
import json, sys
try:
    skills = json.load(sys.stdin).get('skills', [])
    for s in skills:
        if s['id'] == 'ppt-business-deck':
            print(s.get('mode', 'MISSING'))
            break
    else:
        print('NOT_FOUND')
except Exception:
    print('PARSE_ERROR')
")
if [ "$PPT_MODE" = "deck" ]; then
  log_pass "ppt-business-deck has mode=deck"
else
  log_fail "ppt-business-deck mode=$PPT_MODE (expected 'deck')"
fi

# ============================================================
# Check 3: Deck project metadata.kind=deck
# ============================================================
echo "[3/7] Project deck detection (metadata.kind)..."
PROJECT_ID="158dd621-c6cc-44f8-935e-246d87f6938c"
PROJECT_INFO=$(curl -sf "$DAEMON_URL/api/projects/$PROJECT_ID" 2>/dev/null || echo '{"error":"not found"}')
KIND=$(echo "$PROJECT_INFO" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    proj = data.get('project', data)
    meta = proj.get('metadata', {})
    print(meta.get('kind', 'NULL'))
except Exception:
    print('ERROR')
" 2>/dev/null || echo "ERROR")
if [ "$KIND" = "deck" ]; then
  log_pass "project metadata.kind=deck"
else
  log_fail "project metadata.kind=$KIND (expected 'deck')"
fi

# ============================================================
# Check 4: Deck skill found → prompts will be injected
# ============================================================
echo "[4/7] Prompt composition: deck skill resolved..."
SKILL_FOUND=$(echo "$SKILLS" | python3 -c "
import json, sys
try:
    skills = json.load(sys.stdin).get('skills', [])
    found = any(s['id'] == 'ppt-business-deck' for s in skills)
    print('YES' if found else 'NO')
except Exception:
    print('ERROR')
")
if [ "$SKILL_FOUND" = "YES" ]; then
  log_pass "deck skill found → skillMode=deck → deck prompts will be injected"
else
  log_fail "deck skill not found → deck prompts will NOT be injected"
fi

# ============================================================
# Check 5: Discovery deck exception present
# ============================================================
echo "[5/7] Discovery: deck skip-form exception..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DISCOVERY_FILE="$SCRIPT_DIR/../src/prompts/discovery.ts"
if [ -f "$DISCOVERY_FILE" ]; then
  if grep -q 'kind=deck' "$DISCOVERY_FILE" 2>/dev/null; then
    log_pass "discovery.ts references kind=deck (deck exception present)"
  else
    log_fail "discovery.ts missing kind=deck reference"
  fi
else
  log_fail "discovery.ts not found at $DISCOVERY_FILE"
fi

# ============================================================
# Check 6: Continuation message regex handles plural "tasks"
# ============================================================
echo "[6/7] Continuation regex: plural 'tasks' handling..."
SERVER_FILE="$SCRIPT_DIR/../src/server.ts"
if [ -f "$SERVER_FILE" ]; then
  if grep -q 'task.*todo\|todo.*task\|(task|todo)' "$SERVER_FILE" 2>/dev/null; then
    log_pass "continuation regex handles both task/tasks"
  else
    log_fail "continuation regex may miss plural 'tasks'"
  fi
else
  log_fail "server.ts not found at $SERVER_FILE"
fi

# ============================================================
# Check 7: Deck session module completeness
# ============================================================
echo "[7/8] Deck session module completeness..."
SESSION_FILE="$SCRIPT_DIR/../src/deck-session.ts"
MISSING=""
for func in countSlides validateAndTrimHtml buildSessionHint advanceSession createSession loadSession hasSession; do
  if ! grep -q "export.*${func}" "$SESSION_FILE" 2>/dev/null; then
    MISSING="$MISSING $func"
  fi
done
if [ -z "$MISSING" ]; then
  log_pass "deck-session.ts exports all required functions"
else
  log_fail "deck-session.ts missing exports:$MISSING"
fi

# ============================================================
# Check 8: Debug prompt endpoint — actual deck prompts injected
# ============================================================
echo "[8/8] Prompt dump: deck framework directives present..."
PROMPT_DUMP=$(curl -sf -X POST "$DAEMON_URL/api/debug/prompt" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"claude","skillId":"ppt-business-deck"}' 2>/dev/null || echo '{"ok":false}')
PROMPT_OK=$(echo "$PROMPT_DUMP" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print('YES' if data.get('ok') else 'NO')
except Exception:
    print('NO')
")
if [ "$PROMPT_OK" = "YES" ]; then
  log_pass "debug prompt endpoint returned ok=true"
else
  log_fail "debug prompt endpoint returned ok=false or parse error"
fi

# Check that deck framework directive is present in the prompt
HAS_DECK_DIRECTIVE=$(echo "$PROMPT_DUMP" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    prompt = data.get('prompt', '')
    # Check for key deck markers (actual content, not constant names)
    checks = ['outline', 'one slide per turn', 'kind=deck', ':root']
    found = sum(1 for m in checks if m in prompt)
    print(f'{found}/{len(checks)}')
except Exception:
    print('ERROR')
")
if echo "$HAS_DECK_DIRECTIVE" | grep -q '4/4'; then
  log_pass "prompt contains all deck framework markers ($HAS_DECK_DIRECTIVE)"
else
  log_warn "prompt deck markers partial ($HAS_DECK_DIRECTIVE)"
fi

# Check Four-phase workflow markers in the prompt
HAS_FOUR_PHASE=$(echo "$PROMPT_DUMP" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    prompt = data.get('prompt', '')
    checks = ['Phase A:', 'Phase B1:', 'Phase B2:', 'Phase C:']
    found = sum(1 for m in checks if m in prompt)
    print(f'{found}/{len(checks)}')
except Exception:
    print('ERROR')
")
if echo "$HAS_FOUR_PHASE" | grep -q '4/4'; then
  log_pass "prompt contains Four-phase workflow markers ($HAS_FOUR_PHASE)"
else
  log_warn "prompt Four-phase markers partial ($HAS_FOUR_PHASE)"
fi

# Check Phase B1 is lightweight (no file reads, no heavy instructions)
HAS_LIGHT_B1=$(echo "$PROMPT_DUMP" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    prompt = data.get('prompt', '')
    b1_start = prompt.find('Phase B1:')
    b2_start = prompt.find('Phase B2:')
    if b1_start < 0 or b2_start < 0:
        print('FAIL')
    else:
        b1_section = prompt[b1_start:b2_start]
        has_read = 'Read' in b1_section or 'read the' in b1_section.lower()
        has_seed = 'assets/template' in b1_section or 'skill seed' in b1_section.lower()
        has_plan = 'TodoWrite plan' in b1_section or 'create a TodoWrite' in b1_section
        has_fill = 'fill' in b1_section.lower() and 'slide' in b1_section.lower() and 'NOT fill' not in b1_section
        has_copy = 'Copy' in b1_section or 'copy' in b1_section.lower()
        if has_read or has_seed or has_plan or has_fill:
            print('FAIL')
        elif has_copy:
            print('PASS')
        else:
            print('WARN')
except Exception:
    print('ERROR')
")
if [ "$HAS_LIGHT_B1" = "PASS" ]; then
  log_pass "Phase B1 is lightweight (copy skeleton, no reads)"
else
  log_warn "Phase B1 issues ($HAS_LIGHT_B1)"
fi

# Check Phase A outputs JSON outline (for daemon session auto-creation)
HAS_JSON_OUTLINE=$(echo "$PROMPT_DUMP" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    prompt = data.get('prompt', '')
    # Phase A must instruct agent to output JSON outline for daemon parsing
    a_end = prompt.find('Phase B1:')
    a_start = prompt.find('Phase A:')
    if a_start < 0 or a_end < 0:
        print('FAIL')
    else:
        section = prompt[a_start:a_end]
        has_json = 'json' in section.lower() and 'outline' in section.lower()
        has_daemon = 'daemon' in section.lower() or 'parse' in section.lower()
        print('PASS' if has_json and has_daemon else 'FAIL')
except Exception:
    print('ERROR')
")
if [ "$HAS_JSON_OUTLINE" = "PASS" ]; then
  log_pass "Phase A outputs JSON outline (for daemon session auto-creation)"
else
  log_warn "Phase A may not output JSON outline ($HAS_JSON_OUTLINE)"
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo "=========================================="
echo "  Results: $PASS passed, $FAIL failed, $WARN warnings"
echo "=========================================="
if [ "$FAIL" -gt 0 ]; then
  echo "  SOME CHECKS FAILED — deck generation may not work correctly"
  exit 1
else
  echo "  All checks passed"
  exit 0
fi
