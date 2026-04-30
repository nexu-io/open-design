# AGENTS.md

## Project shape

- pnpm workspace with packages from `pnpm-workspace.yaml`: `apps/web`, `apps/daemon`, and `e2e`.
- Runtime target is Node `~24` with `pnpm@10.33.2`; use Corepack so the pinned pnpm version from `package.json` is selected.
- `apps/web` is a Next.js 16 App Router + React 18 client. Entrypoints: `apps/web/app/`, main client shell `apps/web/src/App.tsx`.
- `apps/daemon` is the local Express + SQLite process and the `od` bin (`apps/daemon/cli.js`). It owns `/api/*`, agent spawning, skills, design systems, artifacts, and static serving.
- `e2e` contains both Playwright UI specs (`e2e/specs`) and Vitest/jsdom integration tests (`e2e/tests`).

## Commands

- Install: `corepack enable && pnpm install`
- Full local dev: `pnpm dev:all` — starts daemon and Next together. Defaults are daemon `:7456`, web `:3000`; busy ports are probed forward and exported as `OD_PORT` / `NEXT_PORT`.
- Web only: `pnpm dev` from the root starts Next; pair it with `pnpm daemon` when API routes are needed.
- Production local path: `pnpm build` writes the static Next export to `apps/web/out/`; `pnpm start` builds and serves that export through the daemon.
- Main verification: `pnpm typecheck && pnpm test && pnpm build`
- Package tests: `pnpm --filter @open-design/web test`, `pnpm --filter @open-design/daemon test`, `pnpm --filter @open-design/e2e test`
- Focused Vitest: `pnpm --dir apps/web exec vitest run -c vitest.config.ts src/providers/sse.test.ts` (adjust package dir and test path as needed).
- Playwright UI: `pnpm test:ui`; headed: `pnpm test:ui:headed`. Playwright starts `pnpm dev:all` with isolated data under `e2e/.od-data` and strict dynamic ports.
- Live adapter smoke: `pnpm test:e2e:live` runs `e2e/scripts/runtime-adapter.e2e.live.test.mjs`.

## Runtime data and ports

- The daemon auto-creates local data under `.od/` by default: SQLite at `.od/app.sqlite`, per-project agent CWDs at `.od/projects/<id>/`, saved renders at `.od/artifacts/`.
- Keep `.od/`, `e2e/.od-data`, Playwright reports, and agent scratch dirs out of git; `.gitignore` already covers them.
- `OD_DATA_DIR` relocates daemon data relative to the repo root; Playwright uses this for isolated runs.
- In development, `apps/web/next.config.ts` rewrites `/api/*`, `/artifacts/*`, and `/frames/*` to the daemon port. In production, the daemon serves `apps/web/out/` directly.

## Agent, skill, and design-system wiring

- The daemon scans `PATH` for local CLIs in `apps/daemon/agents.js` and spawns them with `cwd` pinned to `.od/projects/<id>/`.
- Agent stdout parsing is per transport: Claude stream JSON, Copilot stream JSON, ACP JSON-RPC, or plain text. Changes to CLI args belong in `apps/daemon/agents.js` and matching parser tests.
- Skills are folder bundles under `skills/` with `SKILL.md`; extended `od:` frontmatter is parsed by `apps/daemon/skills.js`. Restart the daemon after adding or changing skill folders.
- Design systems are `design-systems/*/DESIGN.md`; `scripts/sync-design-systems.mjs` re-imports upstream systems.
- Prompt composition lives in `apps/web/src/prompts/system.ts`, `discovery.ts`, and `directions.ts`; artifacts are parsed/rendered through `apps/web/src/artifacts/` and `apps/web/src/runtime/`.

## Testing notes

- Web Vitest includes `apps/web/src/**/*.test.{ts,tsx,js,mjs,cjs}` in a Node environment.
- Daemon Vitest includes `apps/daemon/**/*.test.{ts,tsx,js,mjs,cjs}` in a Node environment.
- E2E Vitest includes `e2e/tests/**/*.test.{ts,tsx}` in jsdom with automatic React JSX.
- Playwright uses Chromium only, writes reports under `e2e/reports/`, and reuses an existing server outside CI.
