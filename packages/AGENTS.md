# packages/AGENTS.md

Follow the root `AGENTS.md` first. This file only records module-level boundaries for `packages/`.

## Package responsibilities

- `packages/contracts`: web/daemon app contract layer. Keep it pure TypeScript; it must not depend on Next.js, Express, Node filesystem/process APIs, browser APIs, SQLite, daemon internals, or the sidecar control-plane protocol.
- `packages/sidecar-proto`: Open Design sidecar business protocol. Owns app/mode/source constants, namespace validation, stamp descriptor/fields/flags, IPC message schema, status shapes, error semantics, and default product path constants.
- `packages/sidecar`: generic sidecar runtime primitives. Includes bootstrap, IPC transport, path/runtime resolution, launch env, and JSON runtime file helpers; it must not hard-code Open Design app keys or IPC business messages.
- `packages/platform`: generic OS process primitives. Includes stamp serialization, command parsing, process matching/search, and well-known user-toolchain bin discovery; it must consume the `sidecar-proto` descriptor and must not hard-code `--od-stamp-*` details. The toolchain helper is the single source of truth shared by the daemon agent resolver (`apps/daemon/src/agents.ts`) and the packaged sidecar PATH builder (`apps/packaged/src/sidecars.ts`) so neither layer can drift the search list.

## Removed directories

- `packages/shared` has been removed; do not restore it.
- For new shared types, choose the boundary first: web/daemon app DTOs go in `contracts`; sidecar control-plane protocol goes in `sidecar-proto`; generic runtime code goes in `sidecar`; generic OS/process code goes in `platform`.

## Boundary checklist

- Package tests live in each package's `tests/` directory, sibling to `src/`; keep `src/` source-only and do not add new `*.test.ts` or `*.test.tsx` files under `src/`.
- Do not move runtime validation/schema enforcement into `contracts` prematurely; current contracts define the typed target shape only.
- Do not let app packages depend directly on sidecar control-plane details.
- Do not hard-code Open Design app/source/mode constants in `sidecar` or `platform`.
- Keep stamp fields limited to five: `app`, `mode`, `namespace`, `ipc`, and `source`.

## Common package commands

```bash
pnpm --filter @open-design/contracts typecheck
pnpm --filter @open-design/sidecar-proto typecheck
pnpm --filter @open-design/sidecar-proto test
pnpm --filter @open-design/sidecar typecheck
pnpm --filter @open-design/sidecar test
pnpm --filter @open-design/platform typecheck
pnpm --filter @open-design/platform test
```
