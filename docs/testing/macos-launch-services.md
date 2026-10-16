# macOS stable application launch entry

After a payload is selected, the packaged launcher maintains
`<namespaceRoot>/current -> versions/<selectedVersion>` and promotes the
selected app to the physically recorded installation path. Promotion copies
with `ditto` into a private sibling directory on the same filesystem, then
uses macOS `renamex_np(RENAME_SWAP)` to atomically exchange existing bundles.
The original installed version is first retained as a validated launcher
payload, including its manifest, so first-update rollback remains possible.

`launch-entry.json` binds the canonical path to a channel, namespace, version,
generation, and cached payload executable. A canonical process uses its own
resources only when that binding and its baked version match launcher
selection. The copy process then exits and starts a fresh process at the
fixed executable path; it cannot keep running the old mapped executable.
Delegation and historical handoff markers survive that extra launch.

The daemon also recognizes a validated canonical desktop as a modern payload
process. Its legacy migration must not re-arm a healthy canonical generation
or restore the previous version as last successful. Live recognition requires
the observed desktop owner and executable to match the installed entry; the
stopped CLI continues to follow failed-attempt rollback selection.

The old bundle stays in a marked staging directory until the new desktop is
ready. Failed descriptor publication reverses the exchange. Cleanup validates
the exact journal, ownership marker, sibling path, and unchanged version before
removing the backup. The promotion helper rejects unrelated app bundles,
renamed installations, unmanaged symlink targets, and unexpected cache entries.
The inherited stable-alias step can repoint an existing symlink at the recorded
install path before promotion; it does not modify that symlink's old destination.
An unwritable installation can continue through the validated `current` alias;
promotion failures are logged.

After readiness, LaunchServices unregisters owned cached copies and registers
the canonical main app with `lsregister -f`. Dock repair keeps the first owned
pin, points it at the canonical bundle, and removes duplicate owned pins.
Unrelated tiles, custom copies, binary plist fields, and user ordering survive.
A concurrent Dock edit aborts the preference write. No pin is added if the app
was not pinned. Rollback repairs the selected successful entry while retaining
the failed attempt as evidence, avoiding an endless retry of the bad version.

The supported CLI contract is described in
[packaged-launcher-cli.md](../packaged-launcher-cli.md). For stable macOS installs,
`open -b io.open-design.desktop` is the native bundle-ID entry; prerelease and
beta have distinct channel IDs.

## Automated coverage

- `mac-launch-entry.test.ts`: real filesystem fixtures with injected native
  commands; promotion, first-install retention, copy/exchange/publication
  failures, ownership validation, idempotence, and protected backup cleanup.
- `launcher-canonical-entry.test.ts`: canonical process recognition, stale
  binding rejection, own-resource use, and forced restart after replacement.
- `payload-desktop-launch.test.ts`: delegated attempt markers survive canonical
  relaunch; rollback continues to preserve failed-attempt evidence.
- `mac-dock-entry.test.ts`: owned pin projection, duplicate removal, unrelated
  preservation, conflict detection, and native command failures.
- `launcher-registration.test.ts` and `mac-launch-services.test.ts`: success
  persistence before registration, owned cache deregistration, exact main app,
  platform gates, and failure handling.
- `stable-launch-entry.test.ts` and desktop `stable-launch-entry.test.ts`:
  alias target verification and continued payload-update eligibility.
- Launcher-proto `launch-target.test.ts` and daemon CLI tests: daemon-independent
  commands, pointer selection, namespace discovery, and stale entry rejection.
- Daemon `payload-desktop-handoff.test.ts`: canonical recognition with an
  in-progress attempt, startup before desktop status exists, and preservation
  of legacy migration for stale bindings.

## Native acceptance

Opt-in `apps/packaged/tests/mac-native-launch-entry.test.ts` executes the actual
production helpers on macOS. It compiles ad-hoc-signed Mach-O app fixtures and
covers uncached first install, two upgrades, rollback, descriptor failure,
`open -b` selecting the expected version at the fixed physical path, and native
Dock preference repair with opaque binary data. The Dock test uses an isolated
preferences domain and does not alter the runner's actual Dock.

```sh
OD_MAC_NATIVE_ACCEPTANCE=1 pnpm --filter @open-design/packaged exec vitest run \
  -c vitest.config.ts tests/mac-native-launch-entry.test.ts
```

Set `OD_MAC_NATIVE_EVIDENCE_DIR` to save launch and preference evidence. Run on
both Apple Silicon and Intel macOS. The complete application update flow uses
`e2e/specs/mac.spec.ts` with `OD_PACKAGED_E2E_MAC_SMOKE_PROFILE=full`, a baseline
DMG, and a newer payload fixture as documented by
[`tools/pack/AGENTS.md`](../../tools/pack/AGENTS.md). That profile exercises
payload activation, cold relaunch, crash rollback, self-healing, and installer
recovery. It also launches the shipped CLI with the daemon stopped and checks
that native bundle-ID launch selects the same physical application. Finder
drag-install, Spotlight UI, and Launchpad UI remain manual
acceptance surfaces in the [coverage map](updater-lifecycle.md).
