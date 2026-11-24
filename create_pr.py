import urllib.request
import json
import re
import subprocess

# Get token
with open('/opt/data/.git-credentials') as f:
    line = f.read().strip()
m = re.search(r'https://[^:]+:([^@]+)@', line)
token = m.group(1) if m else ''

# Create PR
url = 'https://api.github.com/repos/nexu-io/open-design/pulls'
headers = {
    'Authorization': f'Bearer {token}',
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json'
}

body = '''Add `--use-mock-keychain` flag to all headless Chrome/Edge launches on macOS to prevent "Keychain Not Found" dialogs from blocking automated runs.

## Changes

### apps/daemon/src/browser-sessions.ts
- Added `--use-mock-keychain` flag for macOS headless Edge/Chromium sessions

### docs/design/chat-mirror/ (6 scripts)
- check-fonts.mjs
- diff-cells.mjs
- film.mjs
- measure.mjs
- shoot-live.mjs
- shoot.mjs

All 6 scripts now use consistent `launchArgs` array pattern and add `--use-mock-keychain` for macOS.

### skills/web-clone/scripts/lib/system-browser.mjs
- Added `--use-mock-keychain` flag for macOS headless Chrome

## Testing
- All files pass `node --check` syntax validation
- Full project typecheck passes (`pnpm run typecheck`)
- Consistent pattern across all headless browser launch points'''

data = {
    'title': 'fix(daemon, chat-mirror): add --use-mock-keychain for macOS headless Chrome',
    'body': body,
    'head': 'fix/9582-headless-mock-keychain',
    'base': 'main'
}

req = urllib.request.Request(url, data=json.dumps(data).encode(), headers=headers, method='POST')
resp = urllib.request.urlopen(req)
print(resp.status)
print(resp.read().decode())