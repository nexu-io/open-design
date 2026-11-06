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
| Renderer quiescence before web/daemon retirement | U | desktop `shutdown.test.ts` P0 ordering/shared-cleanup cases; packaged `protocol.test.ts` no-forward/no-retry/abort cases |
| Delegated pre-arm (`--od-launcher-delegated-*`) | U | launcher-proto selection; packaged delegation/launch tests; desktop activation test |
| Crash rollback to lastSuccessful + self-heal on next release | P | mac/win spec `rolls back a crashing payload and self-heals on the next good update` |
| Stale relaunch freeze scrub after rollback (installResult.activeVersion > running) | U, P | desktop unit stale-freeze spec; exercised by the spec's self-heal phase |
| Exact desktop identity, cold-start reconvergence | P, F | specs; real-feed loop |
| Historical-outer handoff bridge (prepared→armed→confirmed) | U, partial P | daemon handoff unit; win spec legacy-executable path |
| Full historical-outer migration with a real legacy binary | M | needs a genuinely old installed generation |
| Obsolete outer retirement (mac/win) | U | packaged `obsolete-installed-outer.test.ts` |
| Reinstalled newer outer resets runtime (bound > active) | U | packaged `launcher-runtime.test.ts` supersede case |
| Reinstalled older outer delegates (bound < active) | P | spec recovery segment precondition |
| Physical running payload survives pointer changes, cleanup, and same-version repair | U | desktop `tests/main/updater/payload-running.test.ts` |

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

## H. macOS installed launcher host (contract 1)

The installer owns the Electron process and imports compatible payload code in
that process. Older installed launchers retain their subprocess behavior when
receiving these payloads. This migration does not change the installer version
floor or Electron version.

| Node | Coverage | Owning tests |
| --- | --- | --- |
| Namespace lock precedes state writes; same-version cover install adopts host | U | launcher `hosted-launcher.test.ts` |
| Installer adoption preserves failed newer attempts and compatible last-good code, including a missing failed payload | U | launcher `hosted-launcher.test.ts` |
| Cached-entry redirect checks LaunchServices exit status before retiring the caller | U | launcher `relaunch.test.ts` |
| Hosted selection, delegated confirm, missing/corrupt entry fallback, later release recovery | U | launcher `hosted-launcher.test.ts` |
| Manifest Electron/host compatibility and canonical path containment | U | launcher `hosted-launcher.test.ts` |
| Headless duplicate-instance restore and unchanged installed identity | U, P, M | launcher + packaged managed-headless tests; mac full spec real LaunchServices headless restore; signed Dock acceptance required |
| Adopted sidecar discovery, convergence, stop, monitor-loss exit | U (real subprocess) | sidecar `adopted-lifecycle.test.ts`, `adoption.test.ts` |
| Running hosted resources survive pointer changes and cleanup | U | desktop `hosted-payload.test.ts` |
| Persistent/recent Dock entry repair and namespace-scoped LaunchServices cleanup | U, M | launcher `platforms/macos/dock-entry.test.ts`, `platforms/macos/launch-services.test.ts`; signed macOS acceptance required |
| Installed physical executable with payload logical identity across update/cold start | P | mac full spec checks both identities |

Developer ID signing/notarization, Dock behavior across login/reboot and
Background Task Management on affected macOS versions remain release gates.
Unsigned local artifacts alone do not satisfy those gates.

### Lifecycle ownership and artifact topology

`launcher-proto` defines the main-process lifecycle interface and the portable
artifact contract. `tools-pack` describes code/resource/entry paths plus host
contract, OS, architecture and exact Electron compatibility. `launcher` validates
those descriptions and owns the next-start journal; application packages never
own a second hosted state machine.

```text
build:   tools-pack -> launcher-proto contract + launcher source -> installer / payload
runtime: installed Electron -> launcher lifecycle -> selected application entry
                                      |                     |
                                      v                     v
                               platform adapter       ready / candidate / relaunch intents
```

- `validateCandidate` checks staged or promoted bytes without changing runtime
  pointers or maintaining a second candidate-state machine. The updater owns
  download/extraction/promotion; the launcher owns compatibility and activation.
- Activating a candidate selects and pre-arms the next start; it does not replace
  the currently running code or restart the process.
- A relaunch request uses the host's own PID and selected pointer. The platform
  adapter validates and opens the installed carrier after predecessor exit.
- Readiness confirms only the running generation, is idempotent, and never
  confirms a failed successor. Confirmation remains retryable if either runtime
  persistence or attempt removal fails. Headless readiness does not require a window.
- Cold start recovers from an unconfirmed attempt using last-good or bundled
  code inside the installed host. Only explicit manual recovery resets failure
  evidence; cleanup asks the host whether resources are still in use.
- System entry repair belongs to the platform adapter and cannot block business
  readiness or cause rollback.

`launcher/tests/lifecycle.test.ts` runs this protocol with injected Windows and
Linux layouts that have no `.app`, `Contents`, or LaunchServices. These are core
contract tests, not Windows/Linux native acceptance. Only macOS packaging opts
into hosting in this delivery; Windows and historical outers retain legacy
assembly, state handling and executable handoff. An old outer receiving a new
payload remains legacy, while same-version installer replacement claims the new
host contract and retains a newer compatible payload. Adoption preserves a failed
newer generation's attempt and compatible last-successful pointer, so replacement
does not silently retry that failed update. Electron and the installer
version floor are unchanged.

Review the hosted path in this order: `tools/pack/src/mac/{app,payload,prebundle}.ts`
assembles the shared contract; `launcher/src/lifecycle.ts` resolves installation,
claims the instance, adopts the installer, selects code, and publishes lifecycle
operations; `launcher/src/platforms/macos/` implements OS actions; desktop and
packaged consume that interface. `launcherHost` in installed config and `host` in
payload manifests are the authoritative host compatibility metadata. The legacy
manifest's platform/version/channel/namespace/executable entry retains its old
meaning. Runtime and packaging resolve channels through the same release-domain
rules, including preview versions and release namespaces.
