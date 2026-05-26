#!/usr/bin/env bash
# Portable secret scanning hook — detect hardcoded credentials before commit
# Distributed by dev-infra (https://github.com/STEALTHTEMP1/dev-infra)
#
# Usage as pre-commit hook:
#   Add to .pre-commit-config.yaml:
#     - repo: local
#       hooks:
#         - id: check-secrets
#           name: Check for secrets
#           entry: scripts/hooks/check-secrets.sh
#           language: script
#           pass_filenames: false
#
# Usage standalone:
#   ./scripts/hooks/check-secrets.sh
set -euo pipefail

FOUND=0

# 1Password service account tokens
if grep -rE "ops_[a-zA-Z0-9_-]{50,}" \
  --include="*.sh" --include="*.js" --include="*.mjs" --include="*.json" \
  --include="*.yml" --include="*.yaml" --include="*.env" --include="*.md" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=vendor \
  . 2>/dev/null | grep -v 'pragma: allowlist'; then
  echo "ERROR: 1Password service account token found!" >&2
  FOUND=1
fi

# Hardcoded API keys (skip op:// references and examples)
if grep -rE '(api_key|apikey|api-key)\s*[=:]\s*["'"'"'][a-zA-Z0-9_-]{20,}["'"'"']' \
  --include="*.sh" --include="*.js" --include="*.mjs" --include="*.json" \
  --include="*.yml" --include="*.yaml" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=vendor \
  . 2>/dev/null | grep -vE 'op://|example|test|placeholder|pragma: allowlist'; then
  echo "ERROR: Hardcoded API key found!" >&2
  FOUND=1
fi

# AWS credentials
if grep -rE "(AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}" \
  --include="*.sh" --include="*.js" --include="*.mjs" --include="*.json" \
  --include="*.yml" --include="*.yaml" --include="*.env" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=vendor \
  . 2>/dev/null | grep -v 'pragma: allowlist'; then
  echo "ERROR: AWS access key found!" >&2
  FOUND=1
fi

# Private keys
if grep -rl "-----BEGIN.*PRIVATE KEY-----" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=vendor \
  . 2>/dev/null; then
  echo "ERROR: Private key found in repository!" >&2
  FOUND=1
fi

exit $FOUND
