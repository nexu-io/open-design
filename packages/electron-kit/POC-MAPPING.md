# Archive Electron POC behavior map

Gold snapshot: `715c0cb9d8ffdedd47d8c27a78a1d5dfdb2dc201`.

| POC source | Proven behavior retained | New owner | Deliberately not migrated |
| --- | --- | --- | --- |
| `shells/electron/src/index.ts` | preflight before `app.whenReady`, early single-instance claim, splash before Standalone bootstrap, explicit readiness before renderer reveal | `electron-kit/runtime/` | Closure selection, metadata parsing, and product sidecar glue in the Electron entry |
| `shells/electron/src/main/runtime.ts`, `splash-progress.ts` | splash overlaps cold boot; hidden main window is revealed only after renderer mount | `electron-kit/runtime/` | product-specific stages, video, Web DOM knowledge, and desktop feature IPC |
| `shells/electron/src/index.ts`, `main/runtime.ts`, `main/deeplink-focus.ts` | headless still completes lifecycle and hidden renderer mount without splash/reveal/focus; interactive focus is centralized, restores minimized windows, and only runs for enumerated launch/activation/handoff reasons | `electron-kit/runtime/presentation.ts` | test-only naming as the public contract, window-list guessing, and unconditional focus from feature handlers |
| `shells/electron/src/standalone-bootstrap.ts` | one descriptor/result boundary, official-Node execution, validated progress, terminal failure | Standalone bootstrap endpoint; phase-one fixture uses the same observable stages | direct access to Closure Store, generation layout, or private bootloader internals |
| `shells/electron/src/launch.ts` | namespace-scoped paths, single-instance focus/deep-link handoff | `electron-kit/runtime/`; product route stays in `shells/electron` | unbounded/generic argv dispatch |
| `shells/electron/src/launcher-runtime.ts`, `launcher-after-quit.ts` | activation is confirmed only after the real window is revealed; failed candidates remain recoverable | future real adapter behind bootstrap/handoff; current scene keeps the commit point explicit | the historical parallel launcher state machine |
| `shells/electron/src/main/updater/**` | Shell executes check/download/verify/install handoff; Closure observes and schedules through a provider | `electron-kit/updater/` | renderer-specific update UI and direct Closure orchestration |
| `shells/electron/tests/main/splash-stage-replay.test.ts` | early progress is not authoritative lifecycle state and the latest visible projection survives renderer timing | cold-start tests and the feedback observer seam | arbitrary progress IPC |
| `shells/electron/tests/config-cold-launch.test.ts` | a cold OS launch must derive stable namespace identity without inheriting accidental caller state | Shell manifest plus namespace-scoped runtime root | legacy config persistence and product migration paths |
| `tools/pack` mac/win builders and packaged smoke tests | `.app` + `.dmg` on macOS; deterministic receipts; best-effort Windows `dir` + `nsis` | `electron-kit/build/` | changes to `tools-pack`, signing publication, or release policy in this task |

The complete allowed Electron/Closure surface is the exported endpoint registry. Placeholder rendering and `od://` routing are Shell-internal and cannot add Closure messages.
