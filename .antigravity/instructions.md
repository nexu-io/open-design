# Antigravity Project Instructions

This project uses dev-infra configuration.

## Standards
- Shell scripts: use `set -euo pipefail`
- No hardcoded secrets; use environment variables or 1Password
- Commits follow conventional commits format

## Tools Available
- MCP filesystem server for local file operations
- Run `init-dev-infra.sh --check` to verify configuration

## Upgrades
Run `init-dev-infra.sh --upgrade` to update to latest dev-infra config.
