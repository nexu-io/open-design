# apps/daemon/AGENTS.md

Follow the root `AGENTS.md` and `apps/AGENTS.md` first. This file records daemon-specific code organization and editing rules.

## Role

`apps/daemon` is the local Express + SQLite daemon and owns:

- `/api/*` HTTP routes and SSE streams.
- The `od` CLI entrypoint in `src/cli.ts`.
- Project persistence, generated files, artifacts, media, skills, design systems, plugins, MCP, connector credentials, automation state, agent spawning, and static serving.
- The daemon sidecar entry under `sidecar/`.

The daemon is not a shared library for the web app. Do not import daemon private `src/` modules from `apps/web`; shared web/daemon contracts belong in `packages/contracts`.

## Source Layout

- `src/server.ts` is the composition root: create process-wide services, build dependency objects, install middleware, and register route modules. Keep request/domain logic out of `server.ts` unless the route is genuinely bootstrap-wide.
- `src/cli.ts` is the CLI composition root: parse top-level commands, dispatch subcommands, and format process output. Keep substantial command implementation in domain modules or focused `*-cli.ts` helpers.
- `src/server-context.ts`, `src/route-context-contract.ts`, `src/route-registration-guard.ts`, and small root constants/startup helpers may stay at the top level because they describe daemon-wide wiring.
- `src/routes/` contains domain route registrars that were split out of `server.ts`. New daemon domain endpoints should normally land here.
- Legacy route files still at `src/*-routes.ts` may remain until touched. When making meaningful changes in one, prefer moving it to `src/routes/<domain>.ts` if the move is small and mechanically safe.
- `src/http/` owns shared HTTP helpers, error/result adapters, origin checks, and route mounting utilities.
- `src/services/` owns reusable daemon services that are not tied to Express request/response objects.
- `src/runtimes/` owns agent runtime definitions, spawning, parser integration, executable discovery, and runtime environment shaping. Agent argument definitions belong in `src/runtimes/defs/`.
- `src/prompts/` owns daemon-side prompt construction. Keep mirrored BYOK/API wording in `packages/contracts/src/prompts/` when the same text is exposed outside the daemon.
- `src/plugins/`, `src/connectors/`, `src/registry/`, `src/research/`, `src/media-adapters/`, `src/live-artifacts/`, `src/storage/`, and `src/critique/` own their named domains. Prefer adding code inside the existing domain folder before creating a new top-level folder.
- `tests/` contains daemon tests. Keep test paths roughly parallel to `src/` when useful.

Do not edit generated `dist/` output.

## Top-Level `src/` Hygiene

Do not keep adding unrelated files directly under `src/`. The top level is currently crowded, so use these rules for new code and for touched legacy files:

- New domain code belongs in a domain folder, not in `src/<feature>.ts`, unless it is a daemon-wide primitive.
- New route code belongs in `src/routes/` or an existing route subfolder such as `src/routes/plugins/`.
- New runtime or stream-parser code belongs in `src/runtimes/`, with runtime definitions in `src/runtimes/defs/`.
- New provider/integration client code belongs in the existing domain folder when one exists, or under `src/integrations/<provider>.ts` for provider-specific glue.
- New persistence/storage abstractions belong in `src/storage/` unless they are tightly coupled to the legacy SQLite facade in `src/db.ts`.
- New prompt construction belongs in `src/prompts/`.
- New plugin, connector, registry, research, media adapter, live-artifact, critique, metrics, logging, QA, or GenUI code belongs in the matching existing folder.
- New general-purpose helpers should be avoided. If a helper has a real owner, put it with that owner. If it is daemon-wide infrastructure, use a focused folder such as `src/http/`, `src/services/`, `src/storage/`, or `src/runtimes/` instead of creating another top-level utility file.

When touching a legacy top-level file:

- Prefer a small, safe move into an existing domain folder when imports are straightforward and the change is already about that domain.
- Do not mix a broad mechanical move with behavior changes unless the move is required to make the behavior change understandable.
- If a file is split, keep the public function names stable at call sites where possible and move tests with the behavior they cover.
- Use temporary root-level compatibility exports only when they materially reduce churn; remove them in the same PR if the diff stays small.

Suggested ownership for common legacy top-level families:

- `project-routes.ts`, `import-export-routes.ts`, `mcp-routes.ts` -> `src/routes/`. (Route modules already split out, such as `routes/chat.ts`, `routes/terminal.ts`, and `routes/social-share.ts`, are done; do not list them here.)
- `copilot-stream.ts`, `acp.ts`, `agents.ts`, `run-*`, `agent-*`, `*-diagnostics.ts` -> usually `src/runtimes/` or a future `src/runs/` folder, depending on ownership. (`claude-stream.ts`, `qoder-stream.ts`, `json-event-stream.ts`, and `runs.ts` already live under `src/runtimes/`.)
- `design-systems-cli-help.ts`, `tools-design-systems-cli.ts`, `claude-design-import.ts` when used only there -> `src/design-systems/`. (Core design-system modules, design tokens, `swift-colors.ts`, and `frontmatter.ts` are already under `src/design-systems/`.)
- `inline-assets.ts`, `lint-artifact.ts`, `pdf-export.ts`, `document-preview.ts`, `static-spa.ts` -> `src/artifacts/` or the existing artifact owner. (The `artifact-*` family already moved under `src/artifacts/`.)
- `memory*.ts`, `orbit*.ts`, `automation-*.ts`, `routines.ts`, `prompt-*`, `handoff-*`, `finalize-design.ts` -> keep with their domain; introduce folders when touching multiple related files.

The `media-*` family has already moved into `src/media/`; no media modules remain at the top level.

These are migration targets, not permission to do a large cleanup PR. Move only what helps the current change or removes active ambiguity.

## Route Structure

Route modules should follow this shape:

```ts
import type { Express } from 'express';
import type { RouteDeps } from '../server-context.js';

export interface RegisterExampleRoutesDeps extends RouteDeps<'http' | 'paths'> {
  example: ExampleService;
}

export function registerExampleRoutes(app: Express, ctx: RegisterExampleRoutesDeps): void {
  // app.get/post/patch/delete(...)
}
```

Guidelines:

- Keep one exported registrar per domain, except where the existing file already has a small family of closely related registrars.
- Declare a narrow `Register*RoutesDeps` type. Pick only the `ServerContext` keys the route uses, and add explicit service interfaces for domain-specific dependencies.
- Add the registrar dependency type to `src/route-context-contract.ts` when it should be covered by the server context assertion.
- Register the route from the matching semantic section in `src/server.ts`.
- Use existing route helpers from `src/http/` when they fit. Do not invent another error envelope if a contract already exists.
- Keep parsing/validation near the route boundary and push reusable behavior into named helpers or services.
- Do not add new route handlers directly to `server.ts` unless they are bootstrap-wide process metadata such as health/version.

## Dependency Boundaries

- `src/server-context.ts` is the route dependency map. If a route needs a new cross-route dependency, add it there deliberately and keep its type narrow.
- Prefer explicit domain service interfaces in route files over `any` or `unknown`.
- Use types from the implementation module or `packages/contracts` instead of restating response shapes by hand.
- Keep `packages/contracts` pure. Do not move daemon-only Node, SQLite, Express, filesystem, or process types into contracts.
- Daemon data paths must follow the root **Daemon data directory contract**. Route all daemon-owned data through `RUNTIME_DATA_DIR` or constants derived from it.

## CLI and Surface Parity

User-facing capabilities must be reachable through both:

- Web/API routes in the daemon.
- `od` CLI subcommands in `src/cli.ts`.

When adding a user-facing capability, close the loop in one change: contract type, daemon route, web surface if applicable, and CLI command with `--json` plus `--prompt-file <path|->` for long prompts where relevant.

## Runtime and Agent Changes

- Parser changes belong beside the matching runtime stream helper and should include focused parser tests.
- Runtime definition changes belong in `src/runtimes/defs/`.
- For agent-stream/parser changes, replay a mock CLI trace from `mocks/` when practical instead of burning provider budget.
- Preserve Claude stream-json bookkeeping in `src/runtimes/claude-stream.ts` and `src/server.ts`; do not close stdin on `tool_use` stop reasons.

## Tests

- Tests belong under `apps/daemon/tests/`, not under `src/`.
- Use the cheapest layer that can observe the behavior: pure helper test, route-level Vitest with `startServer`, then broader integration only when necessary.
- For bug fixes, prefer a red spec that fails before the fix.
- If a test depends on native modules such as `better-sqlite3`, make sure local dependencies were built for the active Node version before blaming the code.

## Commands

Common daemon checks:

```bash
pnpm --filter @open-design/daemon typecheck
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/daemon build
```

Focused tests from `apps/daemon`:

```bash
pnpm exec vitest run -c vitest.config.ts tests/<file>.test.ts
```

For local runtime validation, start through the repo control plane, not daemon package lifecycle aliases:

```bash
pnpm tools-dev run web --daemon-port <port> --web-port <port>
```

## Capability Barrel Pattern

Large domain modules under `src/` use the **capability barrel pattern** to enforce internal structure without exposing implementation details.

**Reference implementation:** `src/design-systems/` (see `src/design-systems/README.md` for full rationale and history.)

**Rules:**
1. The domain root has a single `index.ts` barrel that is the **only** public API surface. External code must import via this barrel — never from a subdir directly.
2. Domain subdirectories are internal layers (e.g. `core/`, `catalog/`, `user/`). Each subdir has its own `index.ts` barrel for its internal boundary.
3. One subdir is the **foundation** (`core/`): the shared kernel of types and primitives. Every sibling may import it directly (any path); the foundation itself imports no sibling.
4. Other cross-subdir dependencies are a **declared acyclic layering**. A non-foundation subdir may depend on another non-foundation sibling only when that edge is registered in the domain's `allowedEdges`, and only through the sibling's **barrel** (`../<sibling>/index.js`), never a private file. The edge set must stay acyclic — a two-way dependency between siblings is a design smell, not an allowlist entry (relocate the shared piece to `core/` instead). Reference layering: `core` → `catalog` → `user`, `tokens` → `import`, and `jobs` depending on `user` + `catalog`.
5. A subdir must **not** import the domain root barrel (`../index.js`); it re-exports every subdir and invites a circular dependency. Reach `core/` or an allowed sibling barrel directly.
6. Every source file has an `@module` JSDoc docblock (2-3 sentences). Every function (exported and private) has a 1-3 sentence JSDoc prose docblock.

**Enforcement:** `scripts/check-barrel-imports.ts` runs as part of `pnpm guard`. Each domain declares its `foundation` and `allowedEdges`; the check validates that config is acyclic before scanning, then enforces rules 1, 4, and 5. To protect a new domain module, add it to the `CAPABILITY_BARREL_DOMAINS` registry in that file.

**Applying to a new module:**
1. Organize source files into subdirectory layers that reflect the module's domain structure, and pick the `core/` foundation (shared types + primitives with no sibling dependencies).
2. Add `index.ts` barrel to each subdir, re-exporting its public surface.
3. Update the domain root `index.ts` to re-export only from subdir barrels (not internal file paths).
4. Add `@module` docblocks to all files and per-function JSDoc to all functions.
5. Register the domain in `scripts/check-barrel-imports.ts`, declaring its `foundation` and the acyclic `allowedEdges` between non-foundation siblings.
6. Add a `README.md` at the domain root explaining the structure.

**Next candidate:** `src/media/` — currently a flat module with a 4 000-line `index.ts` god file. The pattern should be applied there once the `index.ts` is split into layers.

## Review Checklist

Before handing off daemon changes, check:

- Route logic is in a route module, not newly embedded in `server.ts`.
- New route deps are explicit and covered by `route-context-contract.ts` where appropriate.
- Shared DTOs or error shapes live in `packages/contracts` when the web or CLI consumes them.
- CLI parity is handled or explicitly not applicable.
- Daemon data paths derive from the resolved daemon data root.
- Tests are under `tests/` and relevant checks were run.
