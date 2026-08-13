# packages/AGENTS.md

Follow the root `AGENTS.md` first. This file only records module-level boundaries for `packages/`.

## Package responsibilities

- `packages/agui-adapter`: pure TypeScript adapter between persisted Open Design agent/GenUI/plugin-pipeline events and the AG-UI event protocol. Keep transport and filesystem concerns out; daemon producers and web/CopilotKit consumers share this conversion boundary.
- `packages/contracts`: web/daemon app contract layer. Keep it pure TypeScript; it must not depend on Next.js, Express, Node filesystem/process APIs, browser APIs, SQLite, daemon internals, or the sidecar control-plane protocol.
- `packages/components`: shared React UI primitives and primitive CSS. It may depend on React types/runtime only; keep product workflows and app-specific layout/styling in the apps.
- `packages/closure`: one package with strict `./protocol`, `./store`, and `./update` subpaths. Protocol owns namespace/target-neutral identity, canonical digests, required `launcher/native/body`, lazy resources, integrity, and compatibility. Store owns immutable materialization plus one active binding. Update composes Store and managed download without updating the Shell or creating a second activation authority.
- `packages/diagnostics`: shared diagnostics export primitives for log collection, redaction, manifests, crash-report discovery, and zip packaging used by daemon and desktop.
- `packages/download`: managed-download runtime. Owns resumable and checksum-verified transfers, concurrent-request deduplication, target locking, inspection/removal, copy-and-clear, and pruning; callers supply the download identity and storage base.
- `packages/host`: renderer-facing web/desktop host bridge contract. Its `./protocol`, `./client`, and `./testing` surfaces model host capabilities and UI-facing updater projection while keeping `window.__od__` access out of app UI code. It must not own Shell payload persistence or depend on Sidecar mechanics.
- `packages/shell`: Shell-owned contracts shared across build-time producers and runtime consumers. Its `./update` subpath owns persisted payload pointer/attempt/handoff/cleanup descriptors, validation, and deterministic layout—not Electron argv, selection, fallback execution, IPC, or UI policy.
- `apps/standalone/runtime`: reusable shell-neutral lifecycle primitives for the Standalone product. It coordinates injected daemon/Web adapters, product health/diagnostics, explicit paths, and reverse shutdown; deployable composition remains in the package root.
- `packages/metatool`: internal metadata helpers for repo-local tool build outputs. Keep reusable hash/check/write mechanics here; each concrete tool owns its own `meta.json`.
- `packages/plugin-runtime`: pure TypeScript plugin manifest/marketplace parsers, source adapters, merge/ref resolution, validation, digesting, and pipeline-fallback selection. Daemon, web, and CI inject I/O rather than adding filesystem access here.
- `packages/registry-protocol`: pure TypeScript plugin-registry backend protocol and schemas. Owns backend list/search/resolve/manifest/doctor plus optional publish/yank interfaces, not concrete network or storage integrations.
- `packages/release`: pure release-domain primitives. Owns release channel names, version parsing/formatting, metadata field derivation, storage prefixes, release namespaces, and app identity data. It must not read/write files, call GitHub/R2, spawn build tools, or own workflow execution.
- `packages/sidecar`: sole target public sidecar control plane. It owns canonical `<channel, namespace, generation, service>` identity, caller-root validation/propagation, hidden launch metadata, connect/probe/request-stop mechanics, package-private restart incarnation, endpoint/transport adapters, and process convergence. It owns no product method catalog or caller retry/update/UX policy.
- `packages/platform`: generic OS process and toolchain primitives. Sidecar-specific stamp/match protocols must be internalized by `sidecar` rather than consumed as a second public control plane. The toolchain helper remains the single source of truth shared by daemon and packaged executable resolution.

## Removed directories

- `packages/shared` has been removed; do not restore it.
- For new shared types, choose the boundary first: web/daemon product DTOs go in `contracts`; renderer-facing Desktop host/updater DTOs go in `host`; Shell payload persistence goes in `shell/update`; Shell/Closure semantics go in `closure/protocol`; business-neutral sidecar mechanics go in `sidecar`; generic OS primitives go in `platform`.
- Standalone release candidate identity belongs in `closure/protocol`; live Shell↔Standalone identity belongs in `standalone/protocol`; Electron-private launcher policy remains in `shells/electron`.

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
pnpm --filter @open-design/closure typecheck
pnpm --filter @open-design/closure test
pnpm --filter @open-design/diagnostics typecheck
pnpm --filter @open-design/diagnostics test
pnpm --filter @open-design/download typecheck
pnpm --filter @open-design/download test
pnpm --filter @open-design/host typecheck
pnpm --filter @open-design/host test
pnpm --filter @open-design/shell typecheck
pnpm --filter @open-design/shell test
pnpm --filter @open-design/metatool typecheck
pnpm --filter @open-design/metatool test
pnpm --filter @open-design/plugin-runtime typecheck
pnpm --filter @open-design/plugin-runtime test
pnpm --filter @open-design/registry-protocol typecheck
pnpm --filter @open-design/registry-protocol test
pnpm --filter @open-design/release typecheck
pnpm --filter @open-design/release test
pnpm --filter @open-design/sidecar typecheck
pnpm --filter @open-design/sidecar test
pnpm --filter @open-design/sidecar typecheck
pnpm --filter @open-design/sidecar test
pnpm --filter @open-design/platform typecheck
pnpm --filter @open-design/platform test
```
