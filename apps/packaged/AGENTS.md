# apps/packaged

Follow the root `AGENTS.md` and `apps/AGENTS.md` first. This app owns only the packaged Electron runtime assembly entry.

## Owns

- Packaged Electron entry glue.
- Packaged config loading.
- Packaged process/path adapters supplied to the public Standalone lifecycle.
- Attachment of a verified local active Closure, with a one-way fallback to the legacy combined payload.
- `od://` packaged entry routing to the internal web runtime.

## Does not own

- Product/business logic.
- Web, daemon, or desktop implementation details.
- Sidecar protocol definitions or process stamp semantics.
- Closure download, extraction, release discovery, or update selection.

## Rules

- Consume `@open-design/standalone-runtime`, `@open-design/sidecar-proto`, `@open-design/sidecar`, and `@open-design/platform` primitives; do not recreate product lifecycle, hand-build stamp flags, or hand-build process matching logic.
- Keep data/log/runtime/cache paths namespace-scoped and independent from daemon/web ports.
- Keep Next.js packaged runtime as SSR/web-sidecar-owned; do not put Next output under `OD_RESOURCE_ROOT`.
- `OD_RESOURCE_ROOT` is for daemon non-Next read-only resources. Keep its bundled-tree contract aligned with the authoritative list in `tools/pack/src/resources.ts` instead of maintaining a shorter copy here.
