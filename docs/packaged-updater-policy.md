# Packaged updater opt-out

The macOS packer can persist an explicit updater opt-out in a package. When
built with `OD_UPDATE_ENABLED=0`, `open-design-config.json` contains
`updateEnabled: false`. A normal app launch then sets `OD_UPDATE_ENABLED=0`
before desktop startup, including launches from Finder without a shell
environment.

Packages built without this opt-out omit the field and retain the existing
updater behavior. A nonempty `OD_UPDATE_ENABLED` value in the launch environment
overrides the baked boolean. The existing `OD_UPDATE_METADATA_URL` launch
override also takes precedence over packaged metadata.

## Build a macOS package with the opt-out

Use Node 24 and the repository's pinned pnpm version:

```sh
pnpm --filter @open-design/tools-pack build
OD_UPDATE_ENABLED=0 pnpm tools-pack mac build \
  --namespace local-fork --app-version 0.24.1-fork.1 --to dmg
pnpm tools-pack mac install --namespace local-fork --app-version 0.24.1-fork.1
pnpm tools-pack mac start --namespace local-fork --app-version 0.24.1-fork.1
```

Lifecycle commands must use the same namespace and app version as the build.
The opt-out is currently baked only by the macOS packer. Setting this build
environment variable does not persist a Windows or Linux package policy.

Packaged daemon storage follows the
[Daemon data directory contract](../AGENTS.md#daemon-data-directory-contract).
Packaged logs and Electron settings follow the existing namespace isolation in
[tools/pack](../tools/pack/README.md).
