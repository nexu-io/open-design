# packages/AGENTS.md

Follow the root `AGENTS.md` first. This file only records module-level boundaries for `packages/`.

## Package responsibilities

- `packages/agui-adapter`: pure TypeScript adapter between persisted Open Design agent/GenUI/plugin-pipeline events and the AG-UI event protocol. Keep transport and filesystem concerns out; daemon producers and web/CopilotKit consumers share this conversion boundary.
- `packages/contracts`: web/daemon app contract layer. Keep it pure TypeScript; it must not depend on Next.js, Express, Node filesystem/process APIs, browser APIs, SQLite, daemon internals, or the sidecar control-plane protocol.
- `packages/components`: shared React UI primitives and primitive CSS. It may depend on React types/runtime only; keep product workflows and app-specific layout/styling in the apps.
- `packages/standalone-proto`: pure TypeScript live Shell-to-Standalone protocol. It owns exact `<channel, namespace, generation>` identity, resolved path and Shell identity inputs, generation-bound capability/status exchanges, min-version comparison, the fixed `bootloader.mjs` entry name, and the opaque updater provider projection used across the handoff. Updater actions carry presentation plus opaque ids; restart, installer, quit, or other provider-private semantics must not enter this contract. It owns no transport, persistence, candidate selection, process orchestration, or update policy.
- `packages/closure-proto`: pure TypeScript Standalone release protocol. It owns namespace/target-neutral release identity, canonical distribution digest, content-addressed blob mapping, per-target required `launcher/runtime/native/body` components, lazy resource locks, artifact integrity/inventory/signature, and shell compatibility metadata. Resolving a target must keep lazy resource blobs out of the required cold-start set; the package must not become a second live handoff protocol.
- `packages/closure-store`: launcher-side immutable Standalone Closure materialization and commit primitives. It may consume one validated distribution target, but only one complete required set becomes visible through an atomic generation commit; lazy resources remain independently materialized. `bootloader.mjs` and the body must not inspect its candidate history or use it as a fallback selector.
- `packages/closure-update`: launcher-side Standalone Closure release selection and update orchestration. It may compose Closure storage and managed downloads, but must not update the launcher itself or create a second committed-generation authority.
- `packages/diagnostics`: shared diagnostics export primitives for log collection, redaction, manifests, crash-report discovery, and zip packaging used by daemon and desktop.
- `packages/download`: managed-download runtime. Owns resumable and checksum-verified transfers, concurrent-request deduplication, target locking, inspection/removal, copy-and-clear, and pruning; callers supply the download identity and storage base.
- `packages/host`: web/desktop host bridge contract. It models renderer-facing host capabilities and helpers while keeping `window.__od__` access out of app UI code.
- `packages/standalone-runtime`: reusable shell-neutral lifecycle primitives for the Standalone product. It coordinates injected daemon/Web adapters, product health/diagnostics, explicit paths, and reverse shutdown; deployable composition remains in `apps/standalone`.
- `packages/launcher-proto`: launcher protocol and path/state primitives. Owns channel/version/namespace validation, launcher directory derivation, runtime and cleanup descriptors, target selection, and after-quit argument parsing without owning launcher process orchestration.
- `packages/metatool`: internal metadata helpers for repo-local tool build outputs. Keep reusable hash/check/write mechanics here; each concrete tool owns its own `meta.json`.
- `packages/plugin-runtime`: pure TypeScript plugin manifest/marketplace parsers, source adapters, merge/ref resolution, validation, digesting, and pipeline-fallback selection. Daemon, web, and CI inject I/O rather than adding filesystem access here.
- `packages/registry-protocol`: pure TypeScript plugin-registry backend protocol and schemas. Owns backend list/search/resolve/manifest/doctor plus optional publish/yank interfaces, not concrete network or storage integrations.
- `packages/release`: pure release-domain primitives. Owns release channel names, version parsing/formatting, metadata field derivation, storage prefixes, release namespaces, and app identity data. It must not read/write files, call GitHub/R2, spawn build tools, or own workflow execution.
- `packages/sidecar`: sole target public sidecar control plane. It owns canonical `<channel, namespace, generation, service>` identity, caller-root validation/propagation, hidden launch metadata, connect/probe/request-stop mechanics, package-private restart incarnation, endpoint/transport adapters, and process convergence. It owns no product method catalog or caller retry/update/UX policy.
- `packages/sidecar-proto`: legacy migration surface only. Move shared product DTOs to `contracts`, Desktop host/updater DTOs to `host`, and Shell/Closure semantics to `closure-proto`, then delete this package without compatibility aliases.
- `packages/platform`: generic OS process and toolchain primitives. Sidecar-specific stamp/match protocols must be internalized by `sidecar` rather than consumed as a second public control plane. The toolchain helper remains the single source of truth shared by daemon and packaged executable resolution.

## Removed directories

- `packages/shared` has been removed; do not restore it.
- For new shared types, choose the boundary first: web/daemon product DTOs go in `contracts`; Desktop host/updater DTOs go in `host`; Shell/Closure semantics go in `closure-proto`; business-neutral sidecar mechanics go in `sidecar`; generic OS primitives go in `platform`.
- Standalone release candidate identity belongs in `closure-proto`; live Shell↔Standalone identity belongs in `standalone-proto`; Desktop payload and installed-outer state remains in `launcher-proto`.

## Boundary checklist

- Package tests live in each package's `tests/` directory, sibling to `src/`; keep `src/` source-only and do not add new `*.test.ts` or `*.test.tsx` files under `src/`.
- Keep cross-runtime DTO and plugin wire-shape validation schemas in `contracts` when callers need the same runtime parser, while keeping app-specific parsing, I/O, and enforcement in the owning app or package.
- Do not let app packages depend directly on sidecar control-plane details.
- Do not hard-code Open Design app/source/mode constants or business method names in `sidecar` or `platform`.
- New consumers must not import raw sidecar stamps, endpoints, launch env/argv, JSON IPC, transport, or process-match helpers. Public identity is only independent `channel`, `namespace`, `generation`, and opaque `service`; same-generation restart fencing remains package-private.

## Common package commands

```bash
pnpm --filter @open-design/agui-adapter typecheck
pnpm --filter @open-design/agui-adapter test
pnpm --filter @open-design/contracts typecheck
pnpm --filter @open-design/closure-proto typecheck
pnpm --filter @open-design/closure-proto test
pnpm --filter @open-design/diagnostics typecheck
pnpm --filter @open-design/diagnostics test
pnpm --filter @open-design/download typecheck
pnpm --filter @open-design/download test
pnpm --filter @open-design/host typecheck
pnpm --filter @open-design/host test
pnpm --filter @open-design/launcher-proto typecheck
pnpm --filter @open-design/launcher-proto test
pnpm --filter @open-design/metatool typecheck
pnpm --filter @open-design/metatool test
pnpm --filter @open-design/plugin-runtime typecheck
pnpm --filter @open-design/plugin-runtime test
pnpm --filter @open-design/registry-protocol typecheck
pnpm --filter @open-design/registry-protocol test
pnpm --filter @open-design/release typecheck
pnpm --filter @open-design/release test
pnpm --filter @open-design/sidecar-proto typecheck
pnpm --filter @open-design/sidecar-proto test
pnpm --filter @open-design/sidecar typecheck
pnpm --filter @open-design/sidecar test
pnpm --filter @open-design/platform typecheck
pnpm --filter @open-design/platform test
```
