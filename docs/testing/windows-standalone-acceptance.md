# Windows Standalone saturation acceptance matrix

This is the release gate for the Windows Electron Shell + independently
versioned Standalone Closure architecture. It deliberately separates local
proof, packaged platform proof, and proof made from public immutable bytes.

## Fixed release policy

- A first launch requires network access. The installer must not contain an
  initial Closure archive or extracted Closure payload.
- The first online launch exposes its real Closure discovery, byte download,
  component materialization, verification, and ready state independently from
  the Shell boot-stage indicator. Indeterminate phases must not invent a
  percentage.
- Windows artifacts are unsigned for this phase. `signed=false` is expected in
  both the `win_x64` platform manifest and combined metadata when Windows is an
  enabled target.
- Every published target contribution must require and carry its target-native
  Vela and OpenCode binaries. The generation bootloader projects their exact
  committed paths without replacing an explicit operator override.
- `opendesign://` is the stable OS registration and wake-up boundary. Electron
  owns the internal `od://` proxy, which remains channel, namespace, and
  generation isolated.
- A Closure-only iteration must reuse the immutable Electron Shell and its
  registered full-smoke proof. It must not rebuild Electron and must not run a
  Shell smoke lane.
- A native NSIS overwrite is failure-atomic. It either commits the candidate or
  restores the prior install. It refuses mutation if owned namespace processes
  cannot be stopped.
- The native uninstaller removes shortcuts and cache by default, preserves the
  namespace product-data root by default, and removes that root only after an
  explicit UI choice or `/ODREMOVELOCALDATA=1` automation switch.
- Public activation is staged: immutable objects first, public Windows smoke
  second, immutable acceptance credential third, `latest/metadata.json` CAS
  fourth, blocking public readback last.

## Saturation matrix

| ID | Boundary | Required proof | Automated owner | Release gate |
| --- | --- | --- | --- | --- |
| WIN-ARC-01 | Shell/Closure split | Installer inventory has no Closure; Shell resolves Closure only through channel metadata | tools-pack builder/identity tests; packaged spec | local |
| WIN-ARC-02 | Closure-only iteration | Same Shell version/source digest/build bytes and registered Shell proof are reused; selected smoke lane is only `standalone` | tools-release shell-build tests; release workflow topology tests | local + release-beta |
| WIN-ARC-03 | sidecar contract | Daemon and Web sidecars start through the committed Closure and expose the expected health/IPC contract | Closure/store unit tests; packaged shell and standalone lanes | local |
| WIN-ARC-04 | long Windows paths | A deeply nested Store generation launches Daemon and in-process Next through a verified generation/digest-bound junction | tools-pack Closure test; packaged historical migration | local + release-beta full |
| WIN-ARC-05 | target-native agent tools | Strict `win32-x64` Closure construction contains only the approved native-addon tree plus Vela/OpenCode executables; the packaged daemon detects both from the committed generation | tools-pack component tests; strict target build; packaged `/api/agents` probe | local + release-beta |
| WIN-COLD-01 | first online boot | A clean install downloads, verifies, commits, and starts the public Closure without a seeded fixture | public `core + shell` acceptance job | release-beta publish=true |
| WIN-COLD-02 | first offline boot | With no committed Closure and no network, startup fails closed and does not synthesize a payload | Closure update/store tests; standalone packaged lane | local |
| WIN-COLD-03 | integrity | Wrong archive digest, size, inventory, identity, platform, channel, or Shell floor never becomes committed | closure-proto/store/update/tools-pack tests | local |
| WIN-COLD-04 | restart | Cold protocol launch reuses the exact committed generation, reaches a healthy renderer or Cloud identity gate, and preserves the persisted onboarding state | packaged shell lane | local + public smoke |
| WIN-COLD-05 | first-load feedback | A clean Store reports checking/discovery, aggregate real download bytes, component materialization, verification, and ready; the splash replays progress received before it loads | standalone/protocol/Electron tests; local v2 online cold start | local + public smoke |
| WIN-INS-01 | unsigned NSIS | Installer builds and installs successfully with no signing step; manifests truthfully report unsigned | tools-pack identity/builder tests; workflow topology | local + release-beta |
| WIN-INS-02 | install identity | Install directory, display name, uninstall entry, namespace token, and executable identity agree | tools-pack identity tests; packaged shell lane | local |
| WIN-INS-03 | shortcuts | Fresh silent install creates desktop and Start Menu shortcuts; update/repair preserves the prior desktop shortcut presence/absence | custom NSIS tests; `win-native-install-boundaries` | local + release-beta full |
| WIN-INS-04 | registry | Uninstall keys and stable `opendesign://` command point to the installed outer executable, never a generation payload | custom NSIS/identity tests; packaged shell lane | local + public smoke |
| WIN-INS-05 | overwrite transaction | Candidate is staged, prior install is backed up, commit is logged, and a fault immediately after tree commit restores the prior bytes and registry version | custom NSIS tests; `win-native-install-boundaries` | local + release-beta full |
| WIN-INS-06 | process guard | Install/uninstall stops only owned namespace processes and refuses filesystem/registry mutation if any remain | lifecycle/custom NSIS tests; packaged full lane | local + release-beta full |
| WIN-INS-07 | long-path cleanup | Transaction backup/staging and uninstall remove owned long paths without broad deletion | custom NSIS tests; packaged migration/uninstall | local + release-beta full |
| WIN-INS-08 | post-commit repair | A failure after the healthy candidate commits but before registry/shortcut integration leaves the candidate intact; rerunning the same installer reconciles every integration point | `win-native-install-boundaries` | local + release-beta full |
| WIN-INS-09 | embedded 7zip | Installed `7z.exe` and `7z.dll` exist under the product resource root and the executable runs successfully | tools-pack resource tests; `win-native-install-boundaries` | local + release-beta full |
| WIN-RUN-01 | installed lifecycle | install → start → health/eval → PTY → screenshot → stop/uninstall succeeds | packaged shell lane | local + public smoke |
| WIN-RUN-02 | protocol delivery | Hot delivery keeps the process; cold delivery starts a new process; continuation reaches the daemon | packaged shell lane | local + public smoke |
| WIN-RUN-03 | `od://` isolation | Electron proxy resolves only the selected channel/namespace/generation runtime | Electron boundary tests; packaged lanes | local |
| WIN-RUN-04 | data ownership | Product data persists across update/repair; remove-data uninstall clears only exact Open Design product state | packaged migration/shell lanes | local + release-beta full |
| WIN-RUN-05 | background process UX | Standalone bootstrap, generation launcher, daemon, and Web children never expose a visible `cmd`/console window; a hidden console host is acceptable only with no visible window handle | sidecar/Electron tests; installed process/window observation | local + public smoke |
| WIN-UPD-01 | Closure successor | Valid successor commits without rebuilding Shell; damaged successor rolls back/fails closed | standalone packaged lane | local + release-beta |
| WIN-UPD-02 | silent payload | Shell IPC downloads the payload independently of renderer sign-in state; the payload applies on next cold start when allowed | packaged full shell lane | local + release-beta full |
| WIN-UPD-03 | Shell/outer floor | An outer below the published minimum routes through installer reinstall, including running-process and same-version repair | updater unit tests; packaged full/migration lanes | local + release-beta full |
| WIN-UPD-04 | historical migration | Public `0.16.2-beta.155` installs, preserves seeded project/PPTX data, transitions to the standalone architecture, cold-starts, and uninstalls cleanly | packaged migration lane | local + release-beta full |
| WIN-UPD-05 | crash recovery | Crashing payload rolls back to last-successful and a later valid update self-heals | packaged rollback lane | local + release-beta full |
| WIN-UN-01 | native uninstall | Native uninstaller removes executable, uninstaller, shortcuts, protocol and uninstall registry entries | packaged shell lane | local + public smoke |
| WIN-UN-02 | residue observation | No owned process, registry residue, shortcut, executable, uninstaller, or selected product-data root remains | tools-pack uninstall result assertions | local + public smoke |
| WIN-UN-03 | data defaults | Silent/default native uninstall removes cache but preserves namespace product data; explicit `/ODREMOVELOCALDATA=1` removes the exact namespace root | `win-native-install-boundaries` | local + release-beta full |
| WIN-UN-04 | protocol ownership | Uninstall removes `opendesign://` only while its executable prefix still owns the handler; a different current owner is preserved | custom NSIS tests; `win-native-install-boundaries` | local + release-beta full |
| WIN-PUB-01 | immutable stage | Platform assets/manifests and combined version metadata publish without changing latest when Windows is enabled | tools-release publication tests; workflow topology | release-beta publish=true |
| WIN-PUB-02 | public re-download | Acceptance runner downloads the installer from its immutable public URL and rechecks exact digest/size | tools-release public-acceptance tests/job | release-beta publish=true |
| WIN-PUB-03 | public Closure feedback | Public installer performs a real online first boot; smoke summary records the committed Closure digest/version/platform/namespace | packaged shell lane + credential issuer | release-beta publish=true |
| WIN-PUB-04 | credential | Credential binds full commit, release version, metadata, platform manifest, installer, Closure, and smoke summary digests | tools-release public-acceptance tests | release-beta publish=true |
| WIN-PUB-05 | least privilege | Windows acceptance job has no storage write credential; only activation job can publish credential/latest objects | workflow topology test | local |
| WIN-PUB-06 | activation | Support objects are prepared and counted beta latest moves through an ETag CAS that refuses rollback | latest-publication tests/integration | release-beta publish=true |
| WIN-PUB-07 | readback | Latest metadata is byte-equivalent to immutable version metadata and every public file URL responds successfully | blocking `observe-public-feed` | release-beta publish=true |

## Execution order

1. Run typechecks and unit/integration suites for closure-store,
   closure-update, tools-pack, tools-release, Electron and e2e topology.
2. Build the Windows Shell/NSIS once with `tools-pack`. Assemble a strict v2
   Closure target, serve its real manifest and CAS blobs through `tools-serve`,
   then prove one unseeded online install/start against that local feed. Record
   the committed digest, packaged Vela/OpenCode detection, and process/window
   observation before cleaning the Store.
3. Reuse those artifacts for the full shell, standalone, rollback, migration,
   protocol, data and uninstall lanes. `win-shell-v2` additionally requires
   `win-native-install-boundaries`. Preserve the Shell build and its full-smoke
   proof.
4. Rebuild only Closure and prove the Shell build and every Shell smoke lane are
   skipped. Run the standalone-bound proof against the new Closure.
5. Dispatch `release-beta` with `publish=true`, `enable_win_x64=true`,
   `win_x64_sign_mode=off`, `win_x64_target=all`, and full local build smoke.
6. The workflow stages immutable objects, re-downloads the public installer,
   runs the online cold-start smoke, issues the acceptance credential, performs
   CAS activation, and blocks on public readback.

Any failed row keeps `beta/latest/metadata.json` unchanged. Immutable staged
objects and workflow evidence remain available for diagnosis; they are not a
successful release until WIN-PUB-07 passes.
