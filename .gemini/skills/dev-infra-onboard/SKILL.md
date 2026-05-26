---
name: dev-infra-onboard
description: Onboard the current project to the dev-infra ecosystem (adds configs/tools).
---

# dev-infra-onboard

Adopt an existing repo into dev-infra. Installs configs, hooks, MCP, and 1Password integration without overwriting user customizations.

> Scaffolding a brand-new project? Use `dev-infra-scaffold` instead — it runs `git init` and copies a template tree. This skill is for repos that already exist.

## Decision tree

| State | Command |
|---|---|
| Brand-new project, no git history yet | `dev-infra init <name> [default\|api\|cli\|library]` (or `/dev-infra-scaffold`) |
| Existing repo, never onboarded | `dev-infra onboard` (this skill) |
| Existing repo, version stamp older than `VERSION` file | `dev-infra update` |
| Want to preview without writing | `dev-infra onboard --check` |
| Verifying what's installed | Read `config/adoption-manifest.json` (SSOT) |

## Pre-flight (always run first)

```bash
dev-infra onboard --check
```

Reports detected tool stack (Codex / Antigravity / Verdent), existing configs, and the version delta. Writes nothing. **If output looks wrong, stop and resolve before running without `--check`.**

Common reasons to stop:
- Existing `.envrc` with vault references — onboard preserves it, but verify the references match this project's secrets
- Existing `BACKLOG.md` / `TODO.md` — migrate open items to GitHub Issues *before* onboarding (see `docs/guides/dev-infra-onboarding.md` migration section)
- Existing `AGENTS.md` without a `<!-- DEV-INFRA-VERDENT-START -->` sentinel — onboard will append a managed block; confirm that's desired

## Run

```bash
# Default — interactive, current directory
dev-infra onboard

# Specific path
dev-infra onboard /abs/path/to/project

# Non-interactive (CI / scripted / agent)
dev-infra onboard --quiet

# Tag with an organization
dev-infra onboard --org <name>
```

## Verify

After running, confirm the install:

```bash
# 1. Version stamp written
cat .antigravity/.dev-infra-version          # "<version> <git-hash> <iso-timestamp>"
cat .antigravity/dev-infra.json              # JSON with dev_infra_version

# 2. Project registered
dev-infra projects list | grep "$(basename "$PWD")"

# 3. MCP servers reachable
dev-infra mcp doctor

# 4. Secrets load (requires direnv allow)
direnv allow && [[ -n "$GITHUB_TOKEN" ]] && echo "ok"

# 5. Health
dev-infra status
```

## What gets installed

The authoritative inventory lives in `config/adoption-manifest.json` — query it programmatically rather than re-reading docs:

```bash
jq '.features | to_entries[] | select(.value.scope == "adopter") | .key' \
  ~/Development/Projects/dev-infra/config/adoption-manifest.json
```

Summary (subject to manifest, not this doc):
- `.codex/` — `config.toml`, `hooks.json`, `mcp.json`
- `.antigravity/` — `dev-infra.json`, `mcp_config.json`, `instructions.md`, `.dev-infra-version`
- `.verdent/config.json` + root `AGENTS.md` (sentinel-wrapped block)
- `.envrc` — only written if missing (preserves user vault references)
- `.claude/hooks/worktree-bootstrap.sh` + `scripts/hooks/check-secrets.sh` + `scripts/hooks/check-file-sizes.sh`
- `.pre-commit-config.yaml`
- `.github/workflows/{secret-scan.yml, test.yml, dependabot-auto-merge.yml}`

## Failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `init-dev-infra.sh not found` | Stale dev-infra checkout | `dev-infra update` from dev-infra repo itself |
| `.envrc exists, skipping` | Project already has `.envrc` | Expected — manually merge `op://` refs from `templates/envrc-template` |
| `direnv: command not found` | Missing global setup | `bash ~/Development/Projects/dev-infra/mcp/scripts/global-setup.sh` |
| MCP server probe fails | Auth / disabled server | `dev-infra mcp status`, then `dev-infra mcp enable <id>` |
| Version mismatch after install | Two checkouts of dev-infra on PATH | `which dev-infra` and resolve |

## Underlying call

`dev-infra onboard` → `scripts/dev-infra:cmd_onboard` → `scripts/init-dev-infra.sh` (file installer with sync-policy guards).

## Related

- `dev-infra-scaffold` — for brand-new projects (wraps `dev-infra init`)
- `dev-infra-update` — for upgrading already-onboarded projects
- `docs/guides/dev-infra-onboarding.md` — long-form guide with migration playbook
- `config/adoption-manifest.json` — SSOT for installed surfaces
