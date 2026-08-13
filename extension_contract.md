## Interface

The host and plugin share exactly one contract:

- `register(host)`
- `unregister(host)`

The `host` object is the only shared reference. It exposes registration hooks, logging, and any allowed host services. Plugin code must not reach around the host contract.

## Manifest

Required fields:

- `id`
- `name`
- `version` — semver
- `entry_point`
- `permissions` — values must come from this allowlist: `filesystem`, `network`, `ui`, `assets`, `design-system`, `skills`, `integrations`, `automations`, `background-service`
- `dependencies` — map of plugin id to semver range; `core` is allowed as a dependency key

## Discovery

The host scans `plugins/<id>/manifest.json` and resolves the entry point from that manifest. Discovery runs on startup and on explicit reload.

## Failure handling

If a plugin manifest is invalid, a dependency is unmet, or the plugin import fails, the host skips that plugin, logs the error, and keeps running. A bad plugin must never crash the host process.
