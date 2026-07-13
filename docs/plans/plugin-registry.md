# Open Design Plugin Registry — Plan (living)

> **One sentence:** Turn the existing `open-design-marketplace.json` federation
> into a real npm-/clawhub-/skills.sh-style **registry**: GitHub repo as the v1
> storage backend, `od` CLI as the canonical client, official site as one
> rendered consumer, and the whole thing pluggable so a third party can stand
> up their own Open Design plugin source with one config line.

Source spec: [`docs/plugins-spec.md`](../plugins-spec.md) · zh-CN
[`docs/plugins-spec.zh-CN.md`](../plugins-spec.zh-CN.md).
Sibling plan: [`plugins-implementation.md`](./plugins-implementation.md) —
that file owns the per-plugin runtime/apply/snapshot pipeline. **This file
owns the registry / distribution / website / multi-source story.**

References (shape, not API):

- [Clawhub](https://documentation.openclaw.ai/clawhub) — agent-era plugin
  catalog with GitHub-PR submission and a single rendered index site.
- [skills.sh](https://skills.sh) — community skill registry with `id:vendor/name`
  addressing and copy-to-clipboard install commands.
- [npm registry](https://docs.npmjs.com/cli) — versioned packages, scoped names,
  publish/yank lifecycle, lockfiles, integrity hashes.

---

## 0. Invariants (lock first; never violate without a spec patch)

- [ ] **R1. CLI is the canonical client.** Every UI action and every website
  feature must be expressible as one `od` subcommand. UI / site are renderers.
- [x] **R2. Storage backend is swappable.** GitHub repo is the v1 backend, but
  daemon code talks to a `RegistryBackend` interface. Replacing GitHub with a
  managed DB later must be a one-file swap, not a refactor.
- [ ] **R3. `SKILL.md` floor stays portable.** A plugin published to OD's
  registry must still install cleanly as a plain agent skill in Claude
  Code / Cursor / Codex / Gemini CLI / OpenClaw / Hermes. `open-design.json`
  remains an additive sidecar (per spec §1).
- [x] **R4. Trust vocabulary is one set, everywhere.** Contracts, daemon, CLI,
  UI, and website all use **`official` / `trusted` / `restricted`**. (Today
  `marketplace.ts` ships `official|trusted|untrusted` and the runtime ships
  `bundled|trusted|restricted` — P0 unifies these and normalizes legacy
  `untrusted` rows to `restricted`.)
- [x] **R5. Federation is the default, not the exception.** OD's own registry
  is one source among many. Adding a third-party registry URL is symmetric
  to adding ours; no special-casing in code paths.
- [x] **R6. Provenance is preserved end-to-end.** Every installed plugin
  carries `sourceMarketplaceId` + `marketplaceTrust` + resolved transport
  (`github` / `url` / `local` / `bundled`), so UI and audit can answer
  "where did this come from?" without re-resolving.

---

## 1. Target architecture

### 1.0 Product surface map

The registry architecture has three stable layers:

```text
Registry supply network
  GitHub repo in v1, database backend later.
  Owns package identity, versions, trust, integrity, yanking, provenance.

od CLI
  Canonical client and automation API.
  Owns login/whoami, publish, pack, doctor, search, install, upgrade.

Product UI
  Human operating console.
  Owns fast use, discovery, source management, provenance/risk display.
```

Concrete relationship:

```text
Plugin source repo
  open-design.json includes plugin.repo
        |
        | od plugin validate / pack / publish
        v
Plugin artifact
  GitHub ref, GitHub Release .tgz, HTTPS archive, or local folder
        |
        v
Registry index
  v1: open-design/plugin-registry or this repo
      community/**/open-design.json
      generated open-design-marketplace.json
  future: DatabaseRegistryBackend
        |
        | od marketplace search / od plugin install
        v
Installed plugin
  local runnable record with sourceMarketplaceId, trust, integrity, resolved ref
```

Product surface semantics:

- **Home / Official starters** is not a separate registry. It is a curated
  shortcut shelf for already-installed bundled/official workflows so users can
  immediately click `Use`. Bundled official plugins are the preinstalled cache
  of the `official` registry source, not a separate distribution model.
- **Plugins / Installed** is the full local runnable inventory: bundled
  official plugins, user-created plugins, direct GitHub/URL/local installs, and
  marketplace-installed plugins.
- **Plugins / Available** is the registry discovery layer: entries from
  configured Sources that are not installed yet or have upgrades available.
- **Plugins / Sources** is the registry source manager: official, community,
  self-hosted, and enterprise catalogs; trust tier; refresh; remove; auth/cache
  status later.
- **Plugins / Team** is the enterprise governance layer: private catalogs,
  organization allowlists, approvals, audit, and policy.
- **open-design.ai/plugins** is the public renderer of the official and
  community registry sources, not a separate source of truth.

Agent consumption boundary:

```text
User-added registry
  Sources -> Available -> Install -> Installed -> agent context/runtime

Packaged official plugins
  official registry -> bundled preinstall cache -> Installed/bundled
  -> Home Official starters -> agent

Default community registry
  community source -> Available by default -> user installs intentionally
  -> ~/.open-design/plugins/<plugin-id> -> Installed -> agent
```

`Available` is not directly consumable by the agent. It is a supply pool. The
agent consumes the installed set: bundled official plugins, user-created
plugins, direct GitHub/URL/local installs, and marketplace-installed plugins. A
future "Use from Available" convenience action may auto-install first, but it
must still create an installed record before execution.

User-created and user-installed plugins are persisted under the user plugin
root (`~/.open-design/plugins/<plugin-id>` by default). Daemon startup reloads
installed records from SQLite and resolves those user-state plugin folders; a
packaged runtime upgrade should not overwrite them. Bundled official plugins
stay inside the runtime image and are re-registered on boot as official-source
preinstalls.

Authoring and publishing mirror the consumption loop:

```text
Create plugin
  -> agent-assisted authoring
  -> od plugin scaffold / validate / local install / pack
  -> od plugin login/whoami through gh
  -> od plugin publish
  -> GitHub registry PR
  -> generated open-design-marketplace.json
  -> Available for downstream users after refresh
```

The `Create plugin` button should therefore launch an agent workflow that helps
the user describe the plugin, writes `SKILL.md` and `open-design.json`, adds
examples/preview metadata, validates locally, installs a test copy, packs it,
and then drives the GitHub-backed publish PR. The CLI remains canonical; the
agent is the product wrapper around the CLI workflow.

v1 registry scope is intentionally simple: a GitHub repo with reviewable source
entries plus a generated `open-design-marketplace.json`. The JSON is what
daemon/CLI/UI fetch; the source entries are what humans review in PRs. This can
start in the main Open Design repo, but the code path must still be expressed as
`RegistryBackend` so moving to `open-design/plugin-registry` or a database later
does not change the product model.

### 1.1 Storage abstraction

```text
packages/registry-protocol/              ← NEW pure TS, schema + interface
  ├── backend.ts                         ← RegistryBackend interface
  ├── types.ts                           ← RegistryEntry, RegistryVersion,
  │                                        PublishRequest, SearchResult, …
  └── tests/

apps/daemon/src/registry/                ← side-effect zone
  ├── github-backend.ts                  ← v1: PR-based publish, raw.git read
  ├── http-backend.ts                    ← already-exists shape (marketplace.json)
  ├── local-backend.ts                   ← dev/test fixture
  ├── cache.ts                           ← on-disk cache + ETag refresh
  ├── lockfile.ts                        ← od-plugin-lock.json writer/reader
  └── publish.ts                         ← orchestrates pack → fork → PR
```

`RegistryBackend` (sketch — exact shape lands in P0):

```ts
interface RegistryBackend {
  id:        string;          // e.g. "official" | "acme-private"
  kind:      'github' | 'http' | 'local' | 'db';
  trust:     MarketplaceTrust;
  // read
  list(filter?: ListFilter):    Promise<RegistryEntry[]>;
  search(q: string):            Promise<SearchResult[]>;
  resolve(name: string, range?: string): Promise<ResolvedEntry>;
  manifest(name: string, version: string): Promise<PluginManifest>;
  // write (optional — http/db may be read-only from CLI perspective)
  publish?(req: PublishRequest):    Promise<PublishOutcome>;
  yank?(name: string, version: string, reason: string): Promise<void>;
  // health
  doctor(): Promise<DoctorReport>;
}
```

### 1.2 GitHub-backed v1 layout

A dedicated public repo — proposed **`open-design/plugin-registry`** — owns the
canonical official catalog. Third parties fork the same shape and point their
own `marketplace.json` URL at it.

```text
open-design/plugin-registry/
├── plugins/
│   └── <vendor>/<plugin-name>/
│       ├── manifest.json              ← latest copy of open-design.json
│       ├── versions/
│       │   ├── 0.1.0.json             ← frozen manifest snapshot per version
│       │   └── 0.2.0.json
│       ├── README.md                  ← rendered on the website
│       ├── OWNERS                     ← GitHub usernames with publish rights
│       └── tarball.txt                ← canonical archive URL (GitHub release)
├── marketplace.json                   ← generated index; what daemons fetch
├── schema/
│   └── open-design.marketplace.v1.json
├── .github/workflows/
│   ├── validate-pr.yml                ← schema + manifest + license + a11y
│   └── publish-index.yml              ← rebuild + commit marketplace.json
└── docs/                              ← "how to publish" guide
```

**Why a separate repo:** keeps the main monorepo green, gives publishers a
clear contribution target, lets us mirror the same shape for third-party
registries verbatim.

**Tarball storage:** plugins ship as `.tgz` (per existing `od plugin pack`).
v1 uses **GitHub Releases** of the plugin's own source repo as the canonical
archive host; the registry only stores a URL + integrity hash, never the bytes.
This keeps the registry repo small and makes the storage layer trivially
swappable.

**Namespace policy:** published package ids are always `vendor/plugin-name`.
The vendor is the GitHub org/user or enterprise org namespace. The full id is
stable after publish; rename means new id plus alias/deprecation metadata.

**Source repo policy:** accept "anything that packs". The source repo does not
need a special layout if `od plugin validate` and `od plugin pack` pass. The
manifest must include `plugin.repo` in `open-design.json`, pointing to the
canonical source repository or subdirectory.

**Tarball fallback:** GitHub Releases are the default archive host, but raw
HTTPS/object-storage archive URLs are accepted when Releases are unavailable.
Fallback archives require integrity hashes.

### 1.3 Publish flow (PR-based)

`od plugin publish` end-to-end:

1. Run `od plugin pack` → produces `<vendor>-<name>-<version>.tgz` + manifest digest.
2. Read or create a GitHub release on the plugin's **own** source repo,
   upload the tarball, capture release asset URL + SHA-256.
3. `gh auth status` to confirm login (no token persisted by `od`).
4. Fork (or reuse fork of) `open-design/plugin-registry` via `gh repo fork`.
5. Check out a branch `publish/<vendor>-<name>-<version>`.
6. Write/refresh `plugins/<vendor>/<name>/manifest.json` and
   `versions/<version>.json`, append entry to a per-plugin index, run
   `pnpm run validate` locally.
7. `gh pr create` with a templated body containing manifest summary,
   capability/permission list, tarball URL, integrity hash, changelog link.
8. CI in the registry repo runs `validate-pr.yml` — schema, license header,
   tarball download + checksum, manifest replay, optional preview render.
9. On merge, `publish-index.yml` regenerates `marketplace.json` and pushes
   it to `main`. GitHub Pages / CDN serves it as the fetchable marketplace
   JSON, while `https://open-design.ai/plugins/` renders the public browser
   and detail pages over that same source data.

**Yanking** uses the same PR shape with a `yanked: true, reason: "..."` patch
to the version JSON. Daemons treat yanked versions as unresolvable but
preserve them for `od plugin info <name>@<v>`.

Yanking never hard-deletes bytes or metadata. New installs refuse yanked
versions; exact lockfile replay may still install with a warning as long as
the archive remains reachable and integrity matches.

### 1.4 Install / resolve flow

```
od plugin install <name>[@<range>]
  → daemon iterates configured backends in trust order
  → first match: download tarball, verify SHA-256, extract to
    .od/plugins/<name>/<version>/, write InstalledPluginRecord with
    full provenance (sourceMarketplaceId, marketplaceTrust, source URL,
    sourceDigest, resolved ref)
  → record into .od/od-plugin-lock.json for reproducibility
```

`od plugin upgrade [--policy latest|pinned]` re-resolves against lockfile and
applies new versions atomically (no in-place mutation; new version directory,
swap symlink, rollback on failure).

### 1.5 Login model

- `gh` is a first-class dependency of `od` registry workflows. Installing
  `od` should ensure `gh` is present when the platform channel can bootstrap
  it; otherwise the installer fails with exact remediation.
- `od plugin login` wraps `gh auth login` with Open Design copy, scopes, and
  host guidance. `od plugin whoami` wraps `gh auth status` plus `gh api user`.
- `od plugin logout` may wrap `gh auth logout`, but only after explicit
  confirmation because it affects the user's global GitHub CLI session.
- The daemon never stores GitHub tokens. GitHub.com and GitHub Enterprise auth
  stay in `gh`; daemon code goes through a narrow `GhClient` abstraction.
- Generic bearer/header/basic/mTLS auth profiles are reserved for future
  non-GitHub HTTPS or database backends. They must not leak into
  `marketplace.json`.
- Database backend (future) defines its own auth in `RegistryBackend.kind=db`;
  CLI surface stays unchanged.

### 1.6 Website renderers

Two consumers of the same `marketplace.json`:

- **Official site (open-design.ai/plugins)** — static, SSG against
  repo-owned `plugins/registry/*/open-design-marketplace.json` sources. Browse,
  search, copy install command, render plugin details, preview asset,
  capability & permission summary, version history, publisher links, and
  canonical SEO pages. `open-design.ai/marketplace` can be kept as an alias
  once routes are finalized.
- **Self-hosted third-party site** — out of the box, anyone running the
  same registry repo template gets the static site as a copy-paste
  GitHub Pages action. They publish their own catalog URL, users add it
  with `od marketplace add <url>`.

UI never special-cases the official catalog beyond the trust tier; the
website is one rendering of a generic data source.

### 1.7 Web app surface (apps/web)

Update `apps/web/src/components/PluginsView.tsx` from "installed list"
into a multi-source registry browser:

- **Tabs:** Installed · Available · Sources · Team
- **Available:** cards grouped by `sourceMarketplaceId` and trust tier.
  Filter by capability, tag, publisher. Each card: title, version, publisher,
  trust badge, install button.
- **Sources:** Add URL · Refresh · Remove · Trust toggle · auth status
  for private catalogs · "view manifest" drawer.
- **Plugin detail drawer:** provenance line ("from official · trusted ·
  github.com/foo/bar@v0.2.0 · sha256:abcd…"), permissions, README, install
  command, available versions, yanked-version warning.

The first UI slice has already unlocked `Available` and `Sources` using cached
marketplace manifests and existing `/api/marketplaces` endpoints. Follow-up
work should move large-catalog browsing to typed paginated APIs and add
provenance-aware `--from <marketplace-id>` install semantics.

### 1.8 Current implementation slice (2026-05-13 / 2026-05-14)

This repo now has the first registry closure in place:

- Contracts and JSON schema use `official / trusted / restricted` marketplace
  trust, and marketplace entries can carry `versions`, `dist`, `distTags`,
  `integrity`, `manifestDigest`, `publisher`, `homepage`, `license`,
  `capabilitiesSummary`, `deprecated`, and yanking metadata while staying
  passthrough-friendly.
- Daemon install and upgrade flows preserve marketplace provenance:
  `sourceMarketplaceId`, entry name/version, marketplace trust, resolved
  source/ref, manifest digest, and archive integrity. Snapshot records carry
  the same audit trail for agent/runtime replay.
- The packaged daemon seeds built-in `official` and `community` registry
  sources from `plugins/registry/*/open-design-marketplace.json`. `official` is
  verified and can also hydrate bundled preinstalls; `community` is restricted
  by default and feeds Available entries for user-initiated installs.
- Bundled official plugins now carry `sourceMarketplaceId=official` and
  `sourceMarketplaceEntryName=open-design/<plugin-id>`, so they are modeled as
  preinstalled official registry entries while keeping offline first-run bytes
  in the runtime image.
- `od plugin login` and `od plugin whoami` now delegate to `gh`, and
  registry publishing now has three paths: `--to open-design` produces the
  human review target/link, `--to marketplace-json --catalog <path>` upserts a
  self-hosted static catalog entry, and `GithubRegistryBackend.publish/yank`
  produces deterministic PR mutation payloads for a real GitHub mutator.
- `packages/registry-protocol` defines the backend interface and schemas;
  daemon now has static, GitHub, and SQLite database-backed implementations
  sharing the same list/search/resolve/publish/yank/doctor contract.
- Version resolution supports exact versions, dist-tags, `^`/`~` ranges, and
  yanking behavior. Archive downloads verify/store SHA-256 integrity, and a
  lockfile helper records resolved marketplace provenance for reproducible
  installs.
- `od marketplace plugins`, `od marketplace doctor`, `od marketplace login`,
  versioned `od plugin install`, policy-aware `od plugin upgrade`, marketplace
  `od plugin info`, and `od plugin yank` are implemented as headless surfaces
  with JSON output where automation needs it.
- Home now presents official plugins as `Official starters` with a
  `Browse registry` path into `/plugins`; `/plugins` remains the registry
  console (`Installed / Available / Sources / Team`).
- `apps/landing-page` now exposes the public SEO renderer at `/plugins/` plus
  static per-plugin detail pages. It reads `plugins/registry/official`,
  `plugins/registry/community`, and bundled official manifests at build time,
  so open-design.ai can show the ecosystem without calling daemon APIs.
- The `Create plugin` product prompt is agent-assisted and explicitly drives
  scaffold/validate/local install/pack/login/whoami/publish expectations.
- Registry evaluation cases now live in
  [`docs/testing/plugin-registry-eval-cases.md`](../testing/plugin-registry-eval-cases.md).
  The first covered set locks raw `open-design-marketplace.json` source input,
  populated official seed loading, default community seed loading,
  provenance/trust inheritance, bundled official `Use` behavior in Available,
  direct GitHub imports, the Create/Publish agent handoff surfaces, version
  resolution/yanking, backend parity, registry doctor, archive integrity,
  lockfiles, and static marketplace-json publishing.

---

## 2. Phased plan

### P0 — Contract closure (unblocks everything else)

Goal: every later phase can assume one trust vocabulary, full provenance,
and a versioned marketplace entry.

- [x] **P0.1 Unify trust tier vocabulary.** In `packages/contracts/src/plugins/marketplace.ts`,
  rename `MarketplaceTrust` from `official|trusted|untrusted` →
  `official|trusted|restricted`. Migrate daemon, CLI, UI, fixtures.
- [x] **P0.2 Marketplace entry v1.1 fields.** Extend `MarketplacePluginEntrySchema`
  with optional `versions[]`, `integrity` (sha256), `publisher`, `homepage`,
  `license`, `capabilitiesSummary`, `yanked`. Stay `.passthrough()` for
  community extensions (clawhub tags etc.).
- [x] **P0.3 Install provenance.** Plumb `sourceMarketplaceId`,
  `marketplaceTrust`, `marketplacePluginName`, and the resolved transport
  source through `apps/daemon/src/server.ts` install path (currently around
  line 3880). The `InstalledPluginRecord` already has these fields — make
  sure they actually get populated when install comes via marketplace.
- [x] **P0.4 Default trust inheritance.** Installs from `official`/`trusted`
  catalogs default to `trusted`; installs from `restricted` catalogs stay
  `restricted`. Document in spec §6 patch.
- [x] **P0.5 Registry protocol package.** New
  `packages/registry-protocol/` with the `RegistryBackend` interface,
  shared zod schemas, and pure tests. No runtime deps.

### P1 — Headless / CLI completeness

Goal: every registry action you'd want from the website works on the CLI
first, headless, JSON-emitting.

- [x] **P1.1 New CLI subcommands.**
  - `od marketplace plugins <id> [--json]`
  - `od marketplace search <query> [--json]`
  - `od marketplace doctor [<id>]`
  - `od plugin install <name>@<version|range>`
  - `od plugin upgrade [--policy latest|pinned]`
  - `od plugin yank <name>@<version> --reason "..."`
  - `od plugin info <name> [--version <v>] [--json]`
  - `od plugin login` -> wraps `gh auth login` with OD-specific host/scope guidance.
  - `od plugin whoami` -> wraps `gh auth status` plus `gh api user`.
  These now cover marketplace plugins/search/doctor/login, versioned install,
  policy-aware upgrade, marketplace info, yanking, and gh-backed login/whoami.
- [x] **P1.2 GitHub backend module.** `apps/daemon/src/registry/github-backend.ts`
  implements `RegistryBackend` against `open-design/plugin-registry`. Uses
  raw HTTPS/static reads and a narrow mutation client for PR creation, keeping
  `gh`/GitHub auth outside daemon persistence.
- [x] **P1.3 Publish orchestrator, first mutation-capable slice.**
  `GithubRegistryBackend.publish/yank` builds deterministic registry files and
  PR payloads; `od plugin publish --to marketplace-json --catalog <path>`
  covers self-hosted static catalogs. The release-upload/fork/branch executor
  remains an adapter on top of the tested mutation contract.
- [x] **P1.4 Lockfile.** `.od/od-plugin-lock.json` records resolved
  `name@version` + integrity + `sourceMarketplaceId`. `od plugin install`
  honors lock on second run; `od plugin upgrade` rewrites it.
- [x] **P1.5 Private GitHub catalog auth.** `od marketplace login <id>`
  delegates to `gh auth login` for the catalog host. GitHub credentials stay
  in `gh`, never in `marketplace.json` or `installed_plugins`. Generic token
  profiles are reserved for future non-GitHub HTTPS or database backends.
- [x] **P1.6 Integrity verification.** Verify SHA-256 of downloaded tarball
  against the marketplace entry's `integrity` field before extracting. Fail
  closed if mismatch. Store digest on the install record.
- [x] **P1.7 Headless e2e tests** under `apps/daemon/tests/`:
  - add marketplace → search → install by name → run → provenance asserted
    in `installed_plugins` row.
  - lockfile reproduces same install on a fresh daemon data dir.
  - integrity-mismatch tarball is rejected.

### P2 — Web app: from "installed page" to "registry browser"

- [x] **P2.1 Unlock source management.** `/plugins` now has `Installed /
  Available / Sources / Team` tabs. Sources can add URL, refresh, remove, and
  change trust tier through existing `/api/marketplaces` endpoints.
- [x] **P2.2 Available tab entry slice.** Available cards are built from
  configured marketplace manifests and show Install / Use / Upgrade states.
  The bare-name install path now persists marketplace provenance; explicit
  `--from <marketplace-id>` remains follow-up work.
- [x] **P2.3 Home official shelf semantics.** Rename the Home page `Official`
  plugin shelf copy to `Official starters` or `Official installed`, and add a
  lightweight `Browse registry` path into `/plugins`. Home remains fast-use;
  `/plugins` remains registry discovery/management.
- [x] **P2.4 Agent-assisted Create plugin flow.** The `Create plugin` action
  should start an agent workflow that gathers intent, scaffolds the plugin,
  writes `SKILL.md`/`open-design.json`, validates, installs a local test copy,
  packs, checks `gh` login/whoami, and publishes by opening a GitHub registry
  PR through `od plugin publish`. Current slice upgrades the product prompt,
  CLI wrapper, marketplace-json self-host publish, and tested GitHub PR
  mutation payload contract.
- [ ] **P2.5 Plugin detail drawer.** Provenance line, permissions, capability
  summary, version dropdown, install command (copy-to-clipboard, matches
  `od plugin install <name>@<version>`).
- [ ] **P2.6 Team / Private marketplace UI.** Private URL field, auth status
  pill, default trust, org allowlist, refresh schedule, audit log link.
  Wired to `/api/marketplaces/:id/auth` (new).
- [ ] **P2.7 Trust badge consistency.** Same `official / trusted / restricted`
  visual language across cards, drawer, Sources tab, install confirm
  modal.

### P3 — Official website + ecosystem

- [x] **P3.1 Stand up `open-design/plugin-registry` repo shape.** Schema, validation
  workflow, index-publishing workflow, OWNERS, contribution guide. Seed with
  the bundled plugins currently shipped in `plugins/_official/`. The local repo
  now carries the source shape and generated registry inputs; creating the
  external GitHub repo is an operational launch step, not a code blocker.
- [x] **P3.2 Static site renderer.** `apps/landing-page` now
  statically generates `open-design.ai/plugins` and per-plugin detail routes
  from `plugins/registry/*/open-design-marketplace.json` plus bundled official
  manifests, with SEO metadata, search JSON, and `od://` detail links.
- [x] **P3.3 Submission guide.** `docs/publishing-a-plugin.md` + zh-CN. The
  guide must be runnable end-to-end with `od plugin init` →
  `od plugin pack` → `od plugin publish`, no manual JSON editing.
- [x] **P3.4 Self-host kit.** `docs/self-hosting-a-registry.md` — copy the
  `plugin-registry` repo template, point `od marketplace add` at it, done.
  Also documents the future DB-backend swap path so enterprises know the
  exit option exists.
- [x] **P3.5 `od plugin publish --to marketplace-json`.** Lets third-party
  catalog owners accept submissions from their own users using the same CLI by
  writing/upserting their own static `open-design-marketplace.json`.
- [x] **P3.6 Registry doctor.** `od marketplace doctor` validates every entry
  is downloadable, manifest parseable, checksum match, permissions present.
  Surface in web Sources tab too.
- [x] **P3.7 Publisher verification hooks.** Lightweight GitHub-org publisher
  metadata is generated for marketplace-json entries and protocol schemas now
  support verified publishers/signatures. Heavier sigstore/cosign enforcement
  remains deferred — open question §4.

### P4 — Future / non-blocking

- [x] **P4.1 DB-backed RegistryBackend.** Same interface, SQLite or Postgres.
  Validates R2.
- [x] **P4.2 Search index.** Static `open-design.ai/plugins/search.json`
  exposes the website search index; CLI still works against
  `marketplace.json` directly. Typesense/Meilisearch can replace the static
  file later without changing registry semantics.
- [x] **P4.3 Web-of-trust badges data hooks.** Protocol schemas include
  optional metrics for downloads, installs, stars, and activity timestamps.
  Real collection/display stays opt-in per spec privacy stance.
- [x] **P4.4 Marketplace signing data hooks.** Protocol schemas include
  optional signature records for GitHub OIDC/cosign/minisign/custom signing.
  Client-side enforcement is intentionally deferred until the registry service
  starts emitting signed catalogs.

---

## 3. Resolved decisions

1. **Namespace policy.** Registry package ids are `vendor/plugin-name`.
   Flat ids remain a compatibility path for existing local/bundled plugins,
   but public publish requires the namespaced id.
2. **Plugin source-of-truth repo.** The source repo can be any shape that
   survives `od plugin validate` and `od plugin pack`. Registry publish
   requires a `plugin.repo` field in `open-design.json` pointing to source.
3. **Tarball hosting fallback.** If GitHub Releases are unavailable
   (enterprise / mirror), raw HTTPS or object-storage archive URLs are
   accepted with mandatory integrity hash.
4. **Signing.** sigstore/cosign is deferred to P4. Start with PR-author
   identity + SHA-256, escalate if ecosystem grows.
5. **Yanking vs deletion.** Never hard-delete a version. Only mark it
   `yanked: true` with reason; new installs refuse, exact existing locks can
   still replay with warning when integrity matches.
6. **Plugin ID stability.** A published package id is immutable. A renamed
   plugin gets a new id plus alias/deprecation metadata; old id stays
   traceable for historical installs and lockfiles.

---

## 4. Definition of done (registry v1)

- [ ] `R1`–`R6` invariants each have a regression test that fails when
  violated.
- [ ] A third party can fork `open-design/plugin-registry`, change two
  config values, run one workflow, and have a working OD plugin source at
  their own URL — verified with an e2e fixture catalog.
- [ ] Every UI action in `PluginsView.tsx` Sources/Available tabs is
  expressible as one `od` CLI invocation, verified by a script that drives
  both surfaces against the same fixture.
- [ ] One real third-party publisher (target: a Claude-skills-community
  contributor) has published a plugin via `od plugin publish` end-to-end
  without writing JSON by hand.

---

## 5. Cross-references

- Trust tier rename touches `packages/contracts/src/plugins/marketplace.ts`,
  `apps/daemon/src/cli.ts` (marketplace subcommands), `apps/daemon/src/server.ts`
  (install path), `apps/web/src/components/PluginsView.tsx`.
- Provenance plumbing touches `apps/daemon/src/server.ts` (~line 3880) and
  `apps/daemon/src/cli.ts` (~line 1183).
- Existing per-plugin runtime work (apply, snapshot, pipeline) is owned by
  [`plugins-implementation.md`](./plugins-implementation.md); this plan does
  not modify any of those modules.
