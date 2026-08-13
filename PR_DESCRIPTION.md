# PR Description

## Title

Harden plugin architecture loader and lock fixed-port sidecars

## Summary

This change set turns the ad hoc add-on path into a single validated plugin contract, adds a canonical manifest schema and loader, ships one working example plugin, and wires validation so broken manifests or unsafe entries fail early.

It also fixes the daemon/web sidecar startup path so the launcher boots on fixed loopback ports by default instead of falling back to dynamic allocation.

## What changed

- Added `ARCHITECTURE_AUDIT.md`, `CORE_FREEZE.md`, `extension_contract.md`, and `SCALING_PLAN.md` to document the plugin architecture boundary and rollout path.
- Added `packages/plugin-runtime/manifest.schema.json` and `packages/plugin-runtime/src/plugin_loader.ts` to define and enforce the canonical plugin contract.
- Added `packages/plugin-runtime/tests/plugin-loader.test.ts` to cover duplicate IDs, unsafe entry points, dependency validation, and the load/disable/enable/uninstall lifecycle.
- Added `plugins/spec/examples/plugin-architecture-builder-demo/` as a working example plugin with manifest, implementation, docs, and test.
- Added `scripts/validate-plugin-loader.ts` and `package.json` validation wiring so plugin manifests are checked before smoke loading.
- Updated daemon and web sidecar startup defaults to fixed ports: `7456` and `7457`.

## Verification

- `pnpm --filter @open-design/plugin-runtime typecheck`
- `pnpm --filter @open-design/plugin-runtime test -- --runInBand packages/plugin-runtime/tests/plugin-loader.test.ts`
- `pnpm validate:plugins`

## Notes

- The repo is currently on commit `57af80991`.
- The validation script was corrected to import the TypeScript loader source directly through `tsx`.

