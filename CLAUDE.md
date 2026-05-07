@AGENTS.md

# CLAUDE.md — Instructions for Claude Code

> The detailed source of truth lives in `AGENTS.md` (imported above). This file
> adds the user-facing workflow rules below.

## CRITICAL: Check Existing Branches First!

Before writing ANY code, always run:

    git fetch --all
    git branch -a

This repository may have feature branches with existing work. DO NOT assume this
is a new/empty project.

## Project Structure

This is **Open Design (OD)** — an open-source, local-first alternative to
Anthropic's Claude Design. It auto-detects coding-agent CLIs already on your
`PATH` (Claude Code, Codex, Cursor Agent, Gemini CLI, etc.) and drives them
through composable Skills + Design Systems to stream design artifacts into a
sandboxed web preview. Web layer is deployable to Vercel; desktop ships as an
Electron app for macOS and Windows.

Key files:

- `AGENTS.md` — full architecture, workspace, and workflow rules (read first)
- `package.json` — pnpm workspace root; defines `tools-dev`, `tools-pack`, `guard`, `typecheck`
- `pnpm-workspace.yaml` — workspace globs (`apps/*`, `packages/*`, `tools/*`, `e2e`)
- `apps/web` — Next.js 16 App Router web runtime
- `apps/daemon` — local privileged daemon and `od` CLI bin
- `apps/desktop` / `apps/packaged` — Electron shell + packaged runtime entry
- `vercel.json` — Vercel build config for the web layer
- `skills/`, `design-systems/`, `craft/` — content directories powering the design loop

## Before Starting Any Work

1. Fetch all branches: `git fetch --all && git branch -a`
2. Check what exists in the current branch AND others
3. Ask the user if you're unsure which branch has the latest work
4. Never recreate something that already exists on another branch

## User's GitHub

- Username: `tweakyourgeek`
- Environment: Windows PC
- Git tool: GitHub Desktop
- Communication: GitHub web interface (provide links!)

## Workflow Rules (CRITICAL — Follow These!)

### 1. Branches Are Short-Lived
Work on any branch (main, `claude/...`, etc.). The user merges to main and
deletes the branch via the GitHub web UI when work is done.

### 2. Check Main FIRST
Before troubleshooting or building features, verify the feature/fix/docs don't
already exist on main.

### 3. Explain WHY
For every technical decision: explain reasoning, document tradeoffs.

### 4. GitHub Links + PC Commands
Provide GitHub web links for PRs/branches. The user uses GitHub Desktop, not
git CLI primarily.

### 5. Always Merge & Delete (user's rule)
Provide a PR link; the user merges and deletes the branch.

### 6. Document Everything
Update `CHANGELOG.md`, `README.md`, and other docs after significant changes.

## Git Operations

For `git push`:
- Always use `git push -u origin <branch-name>`
- Retry up to 4 times with exponential backoff on network errors (2s, 4s, 8s, 16s)

For `git fetch/pull`:
- Prefer specific branches: `git fetch origin <branch-name>`
- Same retry policy

## Creating Commits

Only commit when the user explicitly asks. Format:

    Brief summary (50 chars or less)

    Detailed explanation:
    - What was changed
    - Why it was changed
    - Any side effects

## Security & Best Practices

- Never commit secrets (`.env`, credentials, API keys, `.od/media-config.json`)
- Always check `git diff` before committing
- Use `.gitignore` appropriately (`.od/`, `.tmp/`, Playwright reports stay out of git)

## When Things Go Wrong

- **Uncertainty:** ask the user; provide options with pros/cons.
- **Branch conflicts:** check main, verify unique work, report, ask.

## Tech Stack

- **Language:** TypeScript (Node `~24`)
- **Package manager:** pnpm `10.33.2` (via Corepack)
- **Frameworks:** Next.js 16 (web), Express-style daemon (apps/daemon), Electron (desktop)
- **Key dependencies:** `better-sqlite3`, `electron`, `esbuild`, `tsx`, `typescript`
- **Repo-level commands:** `pnpm guard`, `pnpm typecheck`, `pnpm tools-dev`, `pnpm tools-pack`
- **Build/test:** package-scoped only — e.g. `pnpm --filter @open-design/web build`,
  `pnpm --filter @open-design/daemon test`. Do NOT add root `pnpm build` / `pnpm test` aliases.

## Deployment

- **Web layer:** Vercel — config in `vercel.json`
  (build: `pnpm install && pnpm --filter @open-design/web build`,
  output: `apps/web/out`)
- **Desktop:** Packaged Electron app for macOS (Apple Silicon) and Windows (x64),
  built via `pnpm tools-pack mac build` / `pnpm tools-pack win build`
- **Live URL:** https://open-design.ai
- **Releases:** https://github.com/nexu-io/open-design/releases

## Project-Specific Rules

These come from `AGENTS.md` — read it for the full set. Highlights:

- **Single dev entry point:** use `pnpm tools-dev` for local lifecycle.
  Do NOT add root `pnpm dev`, `pnpm daemon`, `pnpm preview`, or `pnpm start` aliases.
- **TypeScript-first:** new entrypoints, modules, scripts, tests, and configs
  default to `.ts`. New `.js`/`.mjs`/`.cjs` files need an explicit reason and
  must pass `pnpm guard`.
- **App boundaries:** `apps/web/**` must NOT import `apps/daemon/src/**`.
  Cross-app integration goes through HTTP APIs and `packages/contracts`.
- **Tests live in `tests/` siblings of `src/`**, not inside `src/`.
  Playwright UI automation belongs in `e2e/ui/`.
- **Sidecar stamps** must have exactly 5 fields: `app`, `mode`, `namespace`, `ipc`, `source`.
- **Runtime data** is written under `.od/` (or `OD_DATA_DIR`); keep it out of git.
- **Validation before "done":** at minimum run `pnpm guard` + `pnpm typecheck`,
  plus the package-scoped tests/builds matching files changed.
- **Commits must NOT include** `Co-authored-by` trailers or any co-author metadata.

## Common Tasks

    pnpm install                                          # after manifest/workspace changes
    pnpm tools-dev                                        # start local dev (daemon + web)
    pnpm tools-dev run web --daemon-port 17456 --web-port 17573
    pnpm tools-dev status --json
    pnpm tools-dev logs --json
    pnpm tools-dev stop
    pnpm guard                                            # repo-level lint/guard
    pnpm typecheck                                        # all packages
    pnpm --filter @open-design/web typecheck              # package-scoped
    pnpm --filter @open-design/daemon test
    pnpm tools-pack mac build --to all                    # package macOS desktop

---

**Remember:** Main branch = truth. `AGENTS.md` = detailed source of truth.
Document everything. Explain why. Provide GitHub links.
