# tools-pack build cache contract

This file is the source of truth for the `tools-pack` build-graph cache: the
cache under `--cache-dir` that stores packaged build artifacts as
content-addressed nodes. Read it before changing any node key, adding a node,
or changing what a node writes.

It records **current state only**, not change history — same convention as
`specs/current/ci.md`.

Out of scope: the GitHub Actions cache that wraps this store. That layer is
owned by `.github/`; it restores and saves the store as an opaque directory and
carries no correctness obligation (see **Why coarse restore is safe** below).

## Cache model

A node is `{ id, key, outputs, build, invalidate }`, acquired through
`ToolPackCache` (`src/cache.ts`).

- `keyHash = hash(node.id + "\n" + node.key)`; the entry lives at
  `entries/<node.id>/<keyHash>/` with a `manifest.json`.
- An entry is accepted only when `manifest.key === node.key` exactly. A
  mismatch is reported as `key mismatch` and the node rebuilds
  (`cache.ts:270-282`). There is no fuzzy or prefix matching inside the store.
- `invalidate` is an additional per-node veto applied to an otherwise-valid
  entry (for example `win.packaged-app` re-validates its native rebuild
  output).
- `materialize` copies entry outputs to their workspace locations. Steps that
  run on the materialization path execute on **both** the hit and the miss
  path.

### Why coarse restore is safe

Because acceptance is an exact `node.key` comparison, a restored store is a
*pool of candidates*, not an authority. Entries that do not match are ignored.
An outer layer may therefore restore a broader or older store than strictly
requested without risking a wrong build — it only affects how much work is
skipped, never what is produced.

This property is what the surrounding CI caching depends on. Do not weaken it
by introducing prefix or best-effort matching inside the store.

## Node inventory

The build-graph cache is almost entirely Windows-specific.

| Node | Platform |
| --- | --- |
| `<platform>.workspace-build` | all |
| `win.resource-tree` | win |
| `win.workspace-tarballs` | win |
| `win.packaged-app` | win |
| `win.electron-builder-dir` | win |
| `win.nsis-payload-base` | win |
| `win.nsis-payload-overlay` | win |
| `win.nsis-installer` | win |
| `win.portable-zip` | win |
| `win.launcher-payload-base` | win |
| `win.launcher-payload` | win |

`mac` and `linux` have `<platform>.workspace-build` only.

## Determinant rules

**R1 — A node key must cover every input that determines the node's output.**
Inputs include file content, configuration values, tool versions, and process
environment. An input that is read by `build` but absent from `key` is a
defect, not an optimization.

**R2 — A node key must carry the key of every upstream node it consumes.**
Re-deriving an upstream node's own inputs is not a substitute: upstream keys
carry inputs that are not file content (see R3), so re-derivation silently
drops them.

Existing links: `win.workspace-tarballs` carries `workspaceBuildKey`;
`win.packaged-app` carries `tarballsKey`; `win.electron-builder-dir` carries
`packagedAppKey` and `resourceTreeKey`; `win.nsis-installer` carries
`basePayloadKey` and `overlayPayloadKey`; `win.launcher-payload` carries
`sourceKey`.

**R3 — Build outputs are never direct key inputs.** `hashPackageSourcePath`
excludes `dist`, `.next`, `out`, `node_modules`, and `.od`. A node that
consumes another node's build output must obtain that output's identity
through R2, not by hashing the output tree.

**R4 — A node key must not restate a list that already exists as a
constant.** Derive key inputs from the constant instead. Two independent
restatements of the same list drift silently and produce stale entries with no
signal.

**R5 — Every declared input needs a witness.** See **Changing a cache node**.

## Materialization-time parameters

Some values deliberately do **not** enter node keys. They are stamped onto the
output every time the node is materialized, so cached content stays
parameter-agnostic and is specialized on the way out.

Current materialization-time parameters:

- **App version.** `win.packaged-app` omits it. It is applied through
  electron-builder `extraMetadata.version`, then rewritten on materialization
  by `rewriteUnpackedAppPackageVersion` and `rewriteWinExecutableVersion`, then
  verified by `assertMaterializedUnpackedVersionConsistency` — a fail-closed
  check over the app `package.json` version, the `open-design-config.json`
  `appVersion`, and the Windows executable fixed file version.
- **Namespace / channel and runtime endpoints.**
  `win.electron-builder-dir` omits them. `open-design-config.json` — which
  carries `namespace`, `amrProfile`, `telemetryRelayUrl`, `updateMetadataUrl`,
  `posthogKey`/`posthogHost`, `webOutputMode`, and `namespaceBaseRoot` — is
  regenerated on the materialization path by `writePackagedConfig`.

The downstream `win.nsis-payload-overlay`, `win.nsis-installer`,
`win.portable-zip`, and `win.launcher-payload` nodes carry `namespace` and the
full `packagedVersion` in their keys, because their content includes the
already-stamped payload. `win.nsis-payload-base` instead carries only
`versionCore`: its content excludes `Open Design.exe`,
`resources/app/package.json`, and `resources/open-design-config.json`, which
are assigned to the version-bearing overlay.
`win.launcher-payload-base` is the exception: its key carries `namespace`, but
version identity reaches it only indirectly through the upstream `sourceKey`;
the final `win.launcher-payload` archive explicitly carries the
version-bearing `manifest` and `configBody`.

**Requirement.** A value may be a materialization-time parameter only when
both hold:

1. it is re-applied unconditionally on the materialization path, so the hit
   and miss paths converge; and
2. the applied value is verified by a fail-closed assertion.

Adding a materialization-time parameter without (2) is not permitted.

> Known asymmetry: app version satisfies (2). The other regenerated config
> fields — `namespace`, `amrProfile`, `telemetryRelayUrl`,
> `updateMetadataUrl`, `posthogKey`, `posthogHost`, `webOutputMode`,
> `namespaceBaseRoot`, and the packaged entrypoint fields — currently satisfy
> only (1): they are rewritten but not asserted.

## Signing boundary

Signing material never enters cache content. `resolveWinSigningCacheKey`
(`src/win/sign.ts`) contributes only the certificate SHA-1, digest algorithm,
timestamp algorithm, and timestamp URL, and appears in the keys of
`win.nsis-payload-overlay`, `win.nsis-installer`, and `win.portable-zip`.

`win.nsis-payload-base` correctly omits signing: it is built before
`ensureSignedUnpacked()`, while the overlay is built after. Keep that ordering
when changing the payload split.

## Confidence tiers

Borrowed from `specs/current/ci.md`.

- **`certain`** — the key provably covers the node's full input closure, and a
  witness test demonstrates it (see below). Only `certain` nodes may
  participate in cross-run cache reuse policies built on top of this store.
- **low confidence** — anything else.

**Grading is fail-closed: a node is low confidence until a witness proves
otherwise.** A newly added node is low confidence by default.

## Declared low-confidence points

Recorded so that grading stays checkable. These are known and accepted; do not
extend them.

- `<platform>.workspace-build` — file mode (executable bit) is not hashed by
  `hashPackageSourcePath`.
- `win.launcher-payload` — the `seed: "nsis-base"` branch takes content from
  the NSIS base payload but carries only the literal `"nsis-base"`, not
  `WIN_ARCHIVE_CACHE_VERSION`. Bumping that constant without bumping the
  launcher payload cache versions mismatches.

## Changing a cache node

1. Read this file and `AGENTS.md` in this directory.
2. If the change alters what `build` reads or writes, update the key in the
   same commit.
3. Bump the node's `schemaVersion` / cache-version constant whenever key
   semantics change.
4. Add or update the node's witness test in `tests/`. A witness proves both
   halves:
   - mutating **each declared input** changes the key;
   - mutating a **known non-input** (for example a package's `dist` tree)
     leaves the key unchanged.
5. Never introduce prefix or best-effort matching inside the store.
