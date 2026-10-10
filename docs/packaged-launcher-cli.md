# Packaged application launch contract

On macOS, the supported user entry is `open -b io.open-design.desktop` for the
stable channel. Beta and prerelease use their channel bundle identifiers,
`io.open-design.desktop.beta` and `io.open-design.desktop.prerelease`.
After successful activation, the packaged launcher refreshes the canonical
application and LaunchServices registration; the namespace's `current` alias
also provides a fixed path when the installed application cannot be updated.

For scripts and agent integrations, use the supported `od` commands instead
of constructing a versioned payload path or reading launcher journals:

```sh
od open
od path
od --version
od path --channel beta --json
od open --channel prerelease --namespace release-prerelease --json
```

These commands resolve installation metadata locally and work while both the
app and daemon are stopped. `od path` prints the stable app path on one line.
`od --version` prints the selected packaged version followed by that path.
With `--json`, all three return `version`, `generation`, `channel`, `namespace`,
`launchPath`, `executablePath`, `payloadExecutablePath`, `reason`, and `source`.
`od open --json` also returns `opened: true` after the OS accepts the launch.
This acknowledges the launch request; app readiness is a separate lifecycle
event. Errors use `{ "ok": false, "error": { "code": "…", "message": "…" } }`
on stderr and a nonzero exit code.

`od open` starts the resolved executable directly as a detached desktop
process. It supplies the selected packaged namespace and installation root
and removes the calling agent's Node/sidecar identity, so custom namespaces
work without depending on LaunchServices environment forwarding.

`od version --json` retains its existing meaning: report `/api/version` from
the running daemon. It is useful when comparing the currently running process
with the version a stopped app would launch.

## Selecting an installation

Options are `--channel <name>`, `--namespace <name>`, `--root <path>`, and
`--config <path>`. Explicit options take precedence over inherited packaged
environment and config. The config may also be selected through
`OD_PACKAGED_CONFIG_PATH`; its `appVersion`, `namespace`, and
`namespaceBaseRoot` identify the packaged installation. The root and namespace
environment inputs are `OD_INSTALLATION_DIR`, `OD_PACKAGED_NAMESPACE_BASE_ROOT`,
`OD_PACKAGED_NAMESPACE`, and inherited `OD_SIDECAR_NAMESPACE`. The inherited
release channel is `OD_SIDECAR_CHANNEL`, with packaged `OD_APP_VERSION` and
config version as the next sources. With no identity inputs, the channel is
stable and the launcher uses the packaged platform's default installation
root. These are launcher paths; daemon data-path ownership remains defined by
the root [AGENTS.md](../AGENTS.md#daemon-data-directory-contract).

When no namespace was supplied, the CLI discovers an existing namespace for
the selected channel. Several matching namespaces produce an explicit
`launcher-namespace-ambiguous` error; select one with `--namespace`.
`--root` supports custom installation roots and `--config` supports packages
whose namespace base root differs from the platform default.

## Version selection and stale entries

The commands follow the packaged launcher's runtime/attempt selection. An
unfinished attempt for the active generation selects the last successful
generation when available. A promoted canonical app is returned only when
its promotion record and packaged version match that selection. Otherwise,
the `current` entry must resolve to the selected payload. The original
installed application is eligible when no cached payload exists and its
packaged version matches the selected version, as on first boot.

Windows keeps a fixed installed outer executable that delegates to the
selected payload. Its baked version may therefore be older than the selected
app version printed by the CLI. With a validated cached payload, the CLI
accepts a regular installed executable whose own config identifies the same
release channel and a version from `0.17.0` through the selected version.
This conservative compatibility floor is based on the tagged
[0.17.0 packaged entry](https://github.com/nexu-io/open-design/blob/open-design-v0.17.0/apps/packaged/src/index.ts)
and [launcher selection](https://github.com/nexu-io/open-design/blob/open-design-v0.17.0/apps/packaged/src/launcher-runtime.ts),
which already delegate before starting sidecars and interpret the current
schema-1 pointer/attempt protocol. Unidentified, older, or cross-channel
Windows outer executables fail clearly. macOS continues to require a canonical
copy or alias that addresses the selected version directly.

If a stale canonical app or alias points at another version, the commands
fail with `launcher-stale-entry` instead of launching that copy. Start the
installed app to let the packaged launcher reconcile its entry, then retry.
Do not edit `runtime.json`, `attempt.json`, or promotion metadata in scripts.

These commands expose launcher startup and installation metadata. They do
not add a daemon business capability or require a new web action: a stopped
app must be launchable before its web/API surfaces exist. Existing product
commands continue to use the same HTTP APIs as the web UI.

The payload launcher currently supports macOS and Windows. Platform-native
acceptance of macOS launch surfaces is documented in
[macos-launch-services.md](testing/macos-launch-services.md).
