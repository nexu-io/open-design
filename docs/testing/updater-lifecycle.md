# Install + updater lifecycle coverage map

The single reference for where every install/updater lifecycle node is tested.
When an updater change touches a node, run its owning tests (plus the matrix
in `tools/pack/AGENTS.md` → "Validation matrix for updater changes") and update
this map if ownership moves. Nodes marked **manual-only** are deliberate; do
not silently automate or drop them without revisiting the rationale here.

Legend — **U**: unit/component (package `tests/`), **P**: packaged platform
spec (`e2e/specs/mac.spec.ts` / `win.spec.ts` via `release-smoke.ts`),
**F**: real-feed validated, **M**: manual-only.

## A. Acquisition and first install

| Node | Coverage | Owning tests |
| --- | --- | --- |
| Installer download + sha256 from the release feed | P, F | mac/win spec download flow; desktop `updater.test.ts` checksum trio |
| mac DMG install (ditto path) | P | mac spec install/start/inspect/stop/uninstall |
| mac DMG drag-install UI | M | human acceptance; harness uses ditto |
| win NSIS silent install + transactional log contract | P | win spec `assertTransactionalInPlaceInstallLog` |
| win NSIS interactive UI install | M | human acceptance per `tools/pack/AGENTS.md` |
| Channel identity (bundle name, registry key, install dir) | U, P | tools-pack `win-identity.test.ts`; specs |
| First-boot bootstrap (current-package, runtime.json gen0, install.json) | U, P | packaged `launcher-runtime.test.ts`; specs |
| Onboarding first run | P | mac/win onboarding smoke (`@electron-smoke`) |

## B. Steady-state check loop

| Node | Coverage | Owning tests |
| --- | --- | --- |
| Scheduler cadence / backoff / stop-after-install | U | desktop `updater.test.ts` scheduler group |
| Metadata fetch/parse/channel match, per-channel version fields | U, P, F | desktop unit; specs; real beta feed loop |
| not-available / available / downloaded-stays-visible | U, P | desktop unit; specs |
| Silent startup payload update (allowSilentUpdates) | U, P | desktop unit silent group; mac/win spec `applies a downloaded payload silently on the next cold start` |
| Artifact selection (payload vs installer, context validity) | U, P | desktop unit routing group; specs |
| Installer-reinstall floor (`control.launcher.version.min`): three reasons, same-version offer, clamp | U, P | desktop unit reseed group; spec recovery segment |
| Installed-outer version read (bundle config, env override) | U, P | desktop unit `resolveInstalledOuterVersion`; spec recovery segment reads the real outer |

## C. Download and integrity

| Node | Coverage | Owning tests |
| --- | --- | --- |
| Triple checksum verify (downloader, post-download, pre-install) | U | desktop unit |
| In-session resume; cross-session interrupted-download clearing | U | desktop unit (fixture byte ranges) |
| On-disk release adoption; store ownership/shape validation | U, P | desktop unit; specs |

## D. Payload apply chain

| Node | Coverage | Owning tests |
| --- | --- | --- |
| activate (generation++) → after-quit takeover → confirm | U, P, F | packaged + desktop unit; specs; real-feed loop |
| Delegated pre-arm (`--od-launcher-delegated-*`) | U | launcher-proto selection; packaged delegation/launch tests; desktop activation test |
| Crash rollback to lastSuccessful + self-heal on next release | P | mac/win spec `rolls back a crashing payload and self-heals on the next good update` |
| Stale relaunch freeze scrub after rollback (installResult.activeVersion > running) | U, P | desktop unit stale-freeze spec; exercised by the spec's self-heal phase |
| Exact desktop identity, cold-start reconvergence | P, F | specs; real-feed loop |
| Historical-outer handoff bridge (prepared→armed→confirmed) | U, partial P | daemon handoff unit; win spec legacy-executable path |
| Full historical-outer migration with a real legacy binary | M | needs a genuinely old installed generation |
| Obsolete outer retirement (mac/win) | U | packaged `obsolete-installed-outer.test.ts` |
| Reinstalled newer outer resets runtime (bound > active) | U | packaged `launcher-runtime.test.ts` supersede case |
| Reinstalled older outer delegates (bound < active) | P | spec recovery segment precondition |

## E. Installer (reinstall) path

| Node | Coverage | Owning tests |
| --- | --- | --- |
| win NSIS reinstall over the same registry key + transaction contract | P | win spec installer fallback acceptance |
| mac dry-run installer open | P | mac spec recovery segment |
| mac real DMG open via the deferred helper script | U, M | desktop unit fake-spawn; human acceptance |

## F. Manual clear-cache (disaster recovery)

| Node | Coverage | Owning tests |
| --- | --- | --- |
| Action chain (sidecar action → IPC → host → web) | U, P | boundary tests; web tests; spec recovery segment |
| Reset depth + retained-version protection | U, P | desktop unit clear-cache group; specs |
| Owned-but-corrupt store rebuild (sentinel = ownership proof) | U | desktop unit store-rebuild group |
| Post-clear recovery (re-check re-derives + re-downloads) | P | spec recovery segment |

## G. Publication pipeline

| Node | Coverage | Owning tests |
| --- | --- | --- |
| metadata.json composition + CAS latest publish | U | tools-serve `release-metadata-publish.test.ts` |
| Launcher version floor channel policy (vars pairs, stable fallback, validation) | U | tools-release `launcher-version-floor.test.ts`; publish integration |
| Workflow env passthrough (no YAML fallback) | U | tools-pack `release-workflows.test.ts` floor passthrough test |
| verify-metadata / summary-metadata wiring | U | publish integration test |
| Fixture bridge (control knobs, port pinning) | U | e2e `tests/updater-fixture.test.ts`; tools-serve fixture tests |

## Known deliberate gaps

- Interactive installer UIs (mac drag, NSIS wizard) stay human-verified.
- Full historical-outer migration needs a genuinely old installed build; the
  daemon bridge is unit-tested and the win spec covers the legacy-executable
  identity variant.
- Linux ships no packaged auto-update (AppImage manual) by design.
