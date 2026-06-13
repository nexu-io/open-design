# Open Design Plugin Registry Strategy Plan

**Date:** 2026-05-13
**Related:** [docs/plugins-spec.zh-CN.md](../../docs/plugins-spec.zh-CN.md), [docs/plans/plugins-implementation.md](../../docs/plans/plugins-implementation.md), [specs/current/plugin-authoring-flow-plan.md](plugin-authoring-flow-plan.md), [specs/current/plugin-driven-flow-plan.md](plugin-driven-flow-plan.md)

## Purpose

Turn Open Design plugins from "installed local workflows plus a light marketplace index" into a registry-shaped ecosystem:

- Open Design hosts the official catalog on the main site and ships first-party plugins there.
- Community authors publish by opening GitHub PRs into the Open Design registry repository.
- `od` remains the canonical headless API for CRUD, search, install, update, trust, pack, doctor, and publish.
- Third parties can self-host the same `open-design-marketplace.json` shape as their own plugin source.
- The initial backend is GitHub repository state driven through `gh`; the daemon and CLI speak through a registry interface that can later be backed by a database.
- Enterprise deployments can run the same registry contract on a real database backend for private catalogs, policy, audit, approvals, SSO, and commercial entitlements.

The intended product posture is closer to "ClawHub plus npm registry discipline" than a static plugin gallery: discoverable, versioned, auditable, automatable, and portable across official, community, and private sources.

## External Reference Takeaways

ClawHub establishes a useful split:

- Runtime installs stay native to the host product: OpenClaw exposes skill/plugin search, install, and update through `openclaw` commands.
- Registry-authenticated flows live in a separate CLI surface: `clawhub login`, publish, delete/undelete, sync, inspect, and package publish.
- Public detail pages show enough state before install: semver versions, tags, changelogs, files, downloads, stars, and security scan summaries.
- Install/update persists source metadata so later updates keep resolving through the same registry source.
- Package installs verify compatibility metadata and archive digest when an uploaded package artifact exists.

skills.sh contributes the low-friction public directory pattern:

- One-command install is the core CTA.
- GitHub repo identity is the common authoring/distribution primitive.
- The public site is primarily a searchable directory and leaderboard, not a heavy authoring UI.

npm contributes the package-management discipline we should selectively borrow:

- `name@version` and `name@tag` resolution, with `latest` as the default tag.
- lockfile entries with resolved source and integrity for reproducible installs.
- `doctor`, `view/info`, `outdated`, `update`, `publish --tag`, and policy-aware install/update flows.

References checked:

- [ClawHub docs](https://documentation.openclaw.ai/clawhub)
- [openclaw/clawhub README](https://github.com/openclaw/clawhub)
- [skills.sh CLI docs](https://skills.sh/docs/cli)
- [npm dist-tag docs](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/)
- [npm package-lock docs](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/)

## Current State

The repo already has the right substrate:

- `docs/plugins-spec.zh-CN.md` names CLI as the canonical API, supports headless OD, and reserves federated `open-design-marketplace.json`.
- `packages/contracts/src/plugins/marketplace.ts` has a permissive catalog schema that can carry community-specific fields.
- `apps/daemon/src/plugins/marketplaces.ts` supports add/list/info/refresh/remove/trust and bare-name resolution through configured marketplaces.
- `apps/daemon/src/cli.ts` already exposes `od marketplace add/list/info/search/refresh/remove/trust`.
- `apps/web/src/components/MarketplaceView.tsx` and `PluginDetailView.tsx` exist for `/marketplace` and `/marketplace/:id`.
- `apps/landing-page` now has a static public `/plugins/` registry renderer and per-plugin detail routes generated from `plugins/registry/*/open-design-marketplace.json` plus bundled official manifests.
- `apps/web/src/components/PluginsView.tsx` now has the first `Installed / Available / Sources / Team` UI slice: source management is enabled and Available entries are built from cached marketplace manifests.
- `apps/daemon/src/plugins/pack.ts` can produce `.tgz` plugin archives.
- `apps/daemon/src/plugins/publish.ts` now builds submission links for external catalogs and the Open Design registry target. Full GitHub fork/branch/PR mutation is still future backend work.

Main gaps:

- Marketplace provenance was the first closure gap and is now plumbed through install, upgrade, installed records, and applied snapshots. Remaining work is exact version/tag resolution and lockfiles.
- Trust vocabulary has been unified to `official | trusted | restricted`; legacy `untrusted` marketplace rows normalize to `restricted`.
- Marketplace catalog entries now carry registry-grade optional fields: `versions`, `dist`, `integrity`, `manifestDigest`, `publisher`, `homepage`, `license`, `capabilitiesSummary`, `distTags`, deprecated state, and yanking metadata.
- UI discovery has a first slice but still needs backend closure. The Plugins page can show Available entries from cached manifests and manage Sources, but large-catalog browsing, provenance-aware `--from`, and richer detail pages are still pending.
- Private marketplace support is public-HTTPS-only. There is no `gh`-backed private GitHub/GitHub Enterprise source flow, refresh policy, allowlist, TLS/private-network guidance, or offline cache mode.
- npm-grade update semantics are not implemented. There is no version range resolver, dist-tag support, lockfile/update policy, publisher verification, or archive checksum enforcement.

## Product Model

There are three product surfaces, all backed by the same registry contract:

1. **Official web registry**
   - Hosted on the main Open Design site.
   - Renders official and community-approved plugins from the Open Design registry repo.
   - Provides SEO pages, preview screenshots, install commands, `od://` deep links, provenance, trust/risk metadata, and publish/contribute guidance.

2. **In-app marketplace**
   - Runs against the local daemon.
   - Shows installed plugins and available catalog entries from configured sources.
   - Lets users add, refresh, trust, restrict, remove, search, inspect, install, upgrade, and use plugins without leaving OD.

3. **Headless CLI registry**
   - The canonical API for humans, agents, CI, and self-hosted deployments.
   - Must be feature-complete before or at the same time as UI surfaces.
   - Uses `gh` as the v1 backend driver and auth provider, without inventing an OD account system.

The registry is deliberately source-index-first, not binary-store-first. A catalog entry points at `github:owner/repo[@ref][/subpath]`, an HTTPS archive, or another transport source. The registry records metadata, trust, version selection, and integrity. It does not need to own all bytes in v1.

### Surface Relationships And Product Mental Model

Use one mental model across product copy, CLI help, docs, and website:

```text
Plugin source repo
  Author-owned GitHub repo or enterprise source repo.
  open-design.json must include plugin.repo.
        |
        | od plugin validate / pack / publish
        v
Plugin artifact
  GitHub ref, GitHub Release .tgz, HTTPS archive, or local folder.
        |
        | registry entry generated by publish/CI
        v
Registry backend
  v1: GitHub repo + generated open-design-marketplace.json.
  Later: DatabaseRegistryBackend with the same contract.
        |
        | od marketplace search/install/upgrade
        v
Installed plugin
  Local runnable record with trust, provenance, integrity, and resolved ref.
```

The UI layers are not additional backends; they are different views over this same lifecycle:

- **Home / Official starters** is a usage shelf, not a registry. It should show a curated subset of already-installed bundled/official workflows so a user can immediately click `Use`. Bundled official plugins are the preinstalled cache of the `official` registry source, not a separate distribution model. Product copy should say `Official starters` or `Official installed`, not imply this is the registry itself.
- **Plugins / Installed** is the complete local inventory: bundled official plugins, user-created plugins, local imports, GitHub/URL installs, and marketplace-installed plugins.
- **Plugins / Available** is the discovery layer: registry entries from configured Sources that are not installed yet or have a newer version available.
- **Plugins / Sources** is the registry management layer: official, community, self-hosted, and enterprise catalog sources; trust tier; refresh; removal; auth/cache status later.
- **Plugins / Team** is the future enterprise governance layer: private catalogs, organization policy, allowlists, review, audit, and refresh policy.
- **open-design.ai/plugins** is the public presentation of the official and community registry sources. It is equivalent to a polished static renderer over repo-owned catalog data, not a separate source of truth. `open-design.ai/marketplace` can remain an alias later if needed.
- **`od` CLI** remains the canonical client. Every UI action must map to a CLI operation or daemon API that the CLI can also drive.
- **Open Design GitHub registry repo** is the v1 storage backend. It can later be swapped for a database backend without changing user-facing nouns.

The agent consumption boundary is explicit:

```text
User adds registry source
  -> Sources stores URL/trust and refreshes catalog
  -> Available shows installable or upgradeable entries
  -> Install writes local installed record
  -> Installed becomes part of agent context/runtime consumption

Open Design packaged runtime
  -> official registry entries are bundled as a preinstall cache
  -> startup records them as Installed/bundled with sourceMarketplaceId=official
  -> Home / Official starters exposes a curated quick-use shelf
  -> agent can consume them immediately

Default community registry
  -> community source is configured by default
  -> Available shows restricted community entries
  -> user explicitly installs one
  -> plugin is copied to ~/.open-design/plugins/<plugin-id>
  -> Installed becomes part of agent context/runtime consumption
```

`Available` entries are supply candidates, not runnable capabilities. The agent should consume the installed set: bundled official plugins, user-created plugins, direct GitHub/URL/local installs, and marketplace-installed plugins. A future "Use from Available" shortcut can auto-install first, but it must still produce an installed record before the agent runs it.

User-created and user-installed plugins live in the user-state plugin root,
`~/.open-design/plugins/<plugin-id>` by default. The daemon reloads those
installed records and folders on later boots. Runtime-bundled official plugins
stay inside the app/repo image and are re-registered on boot as official-source
preinstalls; updating them can later happen by refreshing/installing from the
official registry source instead of waiting for an app release.

The production-side loop is the mirror image:

```text
Create plugin
  -> agent-assisted authoring flow
  -> od plugin scaffold / validate / local install / pack
  -> od plugin login/whoami through gh
  -> od plugin publish opens GitHub registry PR
  -> merge regenerates open-design-marketplace.json
  -> users refresh Sources, see Available, install into Installed
```

The `Create plugin` product entry should therefore start an agent workflow, not a bare JSON form. The agent can gather intent, generate `SKILL.md`, `open-design.json`, examples, previews, and capability metadata, run local validation, install a local test copy, pack it, and drive the `gh`-backed publish flow.

High-level architecture relationship:

```text
                    open-design.ai/plugins
                 public registry pages and docs
                               |
                               v
+--------------------------------------------------+
| Open Design GitHub registry repo                 |
|                                                  |
| plugins/registry/official/open-design-marketplace.json |
| plugins/registry/community/open-design-marketplace.json |
| plugins/community/<vendor>/<plugin-name>/open-design.json |
| generated open-design-marketplace.json           |
+-----------------------------+--------------------+
                              |
                              | GitHub PR, gh auth, CI validation
                              v
+--------------------------------------------------+
| od CLI                                           |
|                                                  |
| plugin login/whoami -> gh                        |
| plugin publish -> PR to registry repo            |
| marketplace search/add/refresh/remove/trust      |
| plugin install/upgrade/doctor/lock               |
+-----------------------------+--------------------+
                              |
                              v
+--------------------------------------------------+
| Local daemon                                     |
|                                                  |
| RegistryBackend resolver                         |
| source cache and trust policy                    |
| provenance/integrity/lock persistence            |
| installed plugin runtime                         |
+-----------------------------+--------------------+
                              |
                              v
+--------------------------------------------------+
| Product UI                                       |
|                                                  |
| Home: Official starters                          |
| Plugins: Installed / Available / Sources / Team  |
| Plugin detail: provenance, risk, commands        |
+--------------------------------------------------+
```

First-phase registry scope:

- In v1, "registry" can be understood as **a GitHub repo containing source entries plus a generated marketplace index JSON**.
- The generated `open-design-marketplace.json` is the machine-readable artifact fetched by daemon/CLI/UI.
- The per-plugin `community/**/open-design.json` or `entry.json` files are the human-reviewable source data used for GitHub PR governance.
- The file can initially live in the main Open Design repo if that lowers setup cost, but the product abstraction should still be `RegistryBackend`, not "read this monorepo path". Moving to `open-design/plugin-registry` later should be a data relocation, not a product rewrite.

## Registry Repository Shape

Recommended official repository shape:

```text
open-design-plugin-registry/
├── open-design-marketplace.json
├── community/
│   └── official/
│       ├── open-design-marketplace.json
│       └── plugins/
│           └── <vendor>/<plugin-name>/entry.json
├── plugins/
│   └── <vendor>/<plugin-name>/
│       ├── entry.json
│       ├── README.md
│       ├── screenshots/
│       └── examples/
├── publishers/
│   └── <publisher>.json
├── policies/
│   ├── accepted-capabilities.json
│   └── blocked-sources.json
└── tools/
    └── doctor.ts
```

`open-design-marketplace.json` remains the portable file that third-party hosts can copy. The per-plugin `entry.json` files make PRs reviewable, reduce merge conflicts, and let the build step generate the final marketplace index deterministically.

Current repo-friendly data placement:

- First-party runtime plugins that ship inside OD still live under `plugins/_official/**` and are installed as `bundled`, but they carry official marketplace provenance so product/audit treat them as preinstalled official registry entries.
- Registry presentation data can start as static catalog data under `plugins/registry/official` and `plugins/registry/community`, or mirror that shape in the registry repo until it exists.
- The main site should render official plugins from generated catalog artifacts, not by importing daemon internals or walking `plugins/_official` directly.
- Community submissions can land as plugin source folders under `plugins/community/<vendor-or-plugin>` and be referenced by `plugins/registry/community/open-design-marketplace.json`; trust tier stays encoded per source/entry.

Namespace and source policy:

- Published registry package ids are always `vendor/plugin-name`.
- `vendor` is the publisher namespace: GitHub org/user for GitHub-backed publish, or enterprise/org namespace for database-backed registries.
- `plugin-name` is a stable lowercase slug. Once a package is published, the full id is immutable.
- Existing flat local/bundled ids remain readable for compatibility, but registry publish must require the namespaced form.
- A rename creates a new package id plus an alias/deprecation entry on the old id; it must not rewrite historical installs or lockfiles.
- The source-of-truth repo is declared in `open-design.json` as `plugin.repo`. Published plugins can be "anything that packs": no special repo layout is required beyond passing `od plugin validate` and `od plugin pack`, shipping a runnable skill anchor, and declaring `plugin.repo`.
- `plugin.repo` points at the canonical source repository or subdirectory, for example `https://github.com/open-design/plugins/tree/main/make-a-deck`. Registry entries may mirror it as `sourceRepository` for search and review without replacing the manifest field.

Minimum entry shape:

```json
{
  "name": "open-design/make-a-deck",
  "title": "Make a Deck",
  "version": "1.2.0",
  "distTags": {
    "latest": "1.2.0",
    "beta": "1.3.0-beta.1"
  },
  "source": "github:open-design/plugins@3f4c2d1/make-a-deck",
  "ref": "3f4c2d1",
  "dist": {
    "type": "github",
    "archive": "https://github.com/open-design/plugins/archive/3f4c2d1.tar.gz",
    "integrity": "sha512-...",
    "manifestDigest": "sha256-..."
  },
  "publisher": {
    "id": "open-design",
    "github": "open-design"
  },
  "sourceRepository": "https://github.com/open-design/plugins/tree/main/make-a-deck",
  "homepage": "https://open-design.ai/plugins/open-design/make-a-deck/",
  "license": "MIT",
  "capabilitiesSummary": ["prompt:inject", "fs:read"],
  "tags": ["deck", "presentation", "investor"],
  "trust": "official",
  "yanked": false
}
```

`plugins[]` in the generated marketplace file can stay permissive, but the official registry repo should validate this stricter shape before publishing.

Required `open-design.json` fields for registry publish:

```json
{
  "specVersion": "1.0.0",
  "name": "open-design/make-a-deck",
  "version": "1.2.0",
  "plugin": {
    "repo": "https://github.com/open-design/plugins/tree/main/make-a-deck"
  }
}
```

The current manifest parser is passthrough, so `plugin.repo` can land before a strict schema bump. The formal schema update should still happen before the public publish flow is considered stable.

## Backend Architecture

Introduce a small registry backend interface so "GitHub today, database later" is not just a slogan:

```ts
interface PluginRegistryBackend {
  listSources(): Promise<RegistrySource[]>;
  refreshSource(sourceId: string): Promise<RegistryRefreshResult>;
  search(query: RegistrySearchQuery): Promise<RegistrySearchResult[]>;
  resolve(spec: PluginSpec, options?: ResolveOptions): Promise<ResolvedPlugin>;
  publish(request: PublishRequest): Promise<PublishPlan | PublishResult>;
  doctor(sourceId?: string): Promise<RegistryDoctorReport>;
}
```

Initial implementations:

- `LocalMarketplaceJsonBackend`: reads cached `open-design-marketplace.json` rows from SQLite.
- `GitHubRegistryBackend`: shells through a narrow `GhClient` adapter for `gh auth`, `gh api`, `gh repo`, and `gh pr` operations. It creates PRs against the official registry repo, reads entries from GitHub contents/raw URLs, and never persists a GitHub token itself.
- `StaticHttpsRegistryBackend`: supports public self-hosted JSON over HTTPS. Private authenticated catalogs in v1 should be GitHub/GitHub Enterprise sources reached through `gh`; bearer/header/basic auth profiles are future work.

Future implementation:

- `DatabaseRegistryBackend`: same interface backed by a database, object storage, and first-party auth.

Implementation boundary:

- Contracts define request/response DTOs.
- Daemon owns cache, integrity verification, install side effects, and `gh` invocation. GitHub credentials remain owned by `gh`.
- CLI is the stable external surface.
- Web calls daemon APIs only, never GitHub directly.

## Enterprise And Commercial Backend Path

The registry contract must support a future enterprise deployment where the storage backend is a real database instead of GitHub/JSON. This is a product requirement for toB, not an optional refactor.

The same `PluginRegistryBackend` interface should map cleanly to a database-backed service:

- `organizations`: tenant, plan, billing/entitlement status, SSO config.
- `registry_sources`: official, community, team, private, mirrored GitHub, external HTTPS.
- `plugin_packages`: stable package identity, publisher, owner org, visibility.
- `plugin_versions`: semver, dist-tags, changelog, yanked/deprecated state, compatibility.
- `release_artifacts`: archive URL/object key, manifest digest, archive integrity, size, scan status.
- `publishers`: GitHub owner, verified domain, org membership, signing/verifier state.
- `reviews`: approval workflow, policy exceptions, reviewer notes, security scan result.
- `installs`: org/project/user install records, resolved version, lock provenance.
- `policies`: allowlists, blocked capabilities, required approval, source restrictions.
- `audit_events`: publish, approve, yank, install, upgrade, trust, policy decision.

Enterprise self-hosting model:

- A company can deploy OD plus `DatabaseRegistryBackend` inside its own VPC.
- The enterprise registry exposes the same daemon-facing and CLI-facing contract as the GitHub/static backend.
- `od marketplace add <enterprise-url>` and in-app Sources continue to work; only the source backend changes.
- GitHub Enterprise can remain the identity/source-of-code layer through `gh`, while the database stores registry state, approvals, scans, and policy decisions.
- Fully managed commercial OD can use the same database backend with multi-tenant org boundaries, billing entitlements, SSO/SAML/OIDC, SCIM later, audit exports, and private object storage.

Commercial invariant:

- v1 data can be static files in `plugins/registry/official`, but contracts must not assume "registry equals GitHub repo".
- UI must ask the daemon for registry/search/resolve/publish data; it must never assume the catalog is a local directory.
- CLI commands must not expose GitHub-specific nouns except where the source explicitly is GitHub. `od plugin publish --to open-design` may use `gh` internally, but the command contract should survive a later database backend.
- Trust, provenance, versioning, integrity, and audit fields are mandatory because those become enterprise policy inputs later.

## GitHub CLI Dependency And Auth

`gh` is a first-class runtime dependency for registry-backed publishing and private GitHub sources.

- Installing the `od` CLI should ensure `gh` is available. If the host has no `gh`, the installer bootstraps it using the platform package path available to that distribution channel, or fails with a precise remediation when auto-install is impossible.
- `od plugin login` wraps `gh auth login` with Open Design copy and required scopes/host guidance.
- `od plugin whoami` wraps `gh auth status` plus `gh api user` and prints the active account, host, scopes, and whether it can publish to the configured registry repo.
- `od plugin logout` can wrap `gh auth logout` only after an explicit confirmation, because it affects the user's global GitHub CLI session.
- Daemon code must never read or store GitHub tokens directly. When it needs GitHub data, it calls a `GhClient` abstraction that shells out to `gh` or consumes `gh auth token` only in-memory for one request.
- GitHub Enterprise is modeled as a `gh` host, not a separate auth backend.

## CLI Plan

Keep existing `od marketplace` and `od plugin` naming. Avoid adding a second `registry` noun until there is a real non-marketplace backend exposed to users.

### Marketplace Source Commands

- [ ] `od marketplace add <url> [--trust official|trusted|restricted] [--github-host <host>] [--refresh daily|manual|startup]`
- [x] `od marketplace list [--json]`
- [x] `od marketplace info <id> [--json]`
- [ ] `od marketplace plugins <id> [--query <q>] [--tag <tag>] [--json]`
- [x] `od marketplace search "<query>" [--tag <tag>] [--json]`
- [x] `od marketplace refresh <id>`
- [x] `od marketplace remove <id>`
- [x] `od marketplace trust <id> --trust official|trusted|restricted`
- [ ] `od marketplace login <id>` (delegates to `gh auth login` for the marketplace host)
- [ ] `od marketplace whoami <id>` (delegates to `gh auth status` / `gh api user`)
- [ ] `od marketplace doctor [id] [--strict] [--json]`

### Plugin Consumer Commands

- [x] `od plugin install <source-or-name>`
- [ ] `od plugin install <name>@<version-or-tag> [--from <marketplace-id>] [--save-lock]`
- [ ] `od plugin upgrade [id] [--policy latest|pinned|range] [--dry-run]`
- [ ] `od plugin outdated [--json]`
- [x] `od plugin list/info/search/apply/run/trust/uninstall/doctor`
- [ ] `od plugin view <name> [--from <marketplace-id>] [--versions] [--json]`
- [ ] `od plugin lock write|verify|diff`

### Plugin Author Commands

- [x] `od plugin login [--host <github-host>]`
- [x] `od plugin whoami [--host <github-host>] [--json]`
- [x] `od plugin scaffold`
- [x] `od plugin validate`
- [x] `od plugin pack`
- [ ] `od plugin publish --to open-design [--dry-run]`
- [ ] `od plugin publish --to marketplace-json --catalog <path-or-url> [--branch <name>]`
- [ ] `od plugin publish --to github --repo <owner/repo> [--public|--private]`
- [ ] `od plugin deprecate <name>@<version> --reason <text>`
- [ ] `od plugin yank <name>@<version> --reason <text>`

Publish v1 should use `gh`:

- `od plugin login` wraps `gh auth login`; `od plugin whoami` wraps `gh auth status` and `gh api user`.
- `od plugin publish --to open-design` validates, packs if needed, renders the registry entry, creates a branch, opens a PR, and prints the PR URL.
- `od plugin publish` uses `gh api`, `gh repo fork`, and `gh pr create` through a testable `GhClient`; it does not implement a parallel GitHub OAuth flow.
- The CLI must have `--dry-run --json` for CI and agent workflows.

## Web And Presentation Plan

### Public Site

Main navigation:

- Plugins
- Official
- Community
- Sources
- Publish
- Docs

Listing page:

- Search by name, description, tags, task kind, capabilities, publisher, and trust.
- Filters: Official, Trusted community, Restricted community, Works headless, Has preview, Has examples, Requires connectors.
- Cards show title, publisher, version/tag, task kind, trust tier, capability badges, install count or stars if available, and preview thumbnail.
- Primary CTA: copy install command.
- Secondary CTA: open in desktop through `od://plugins/<name>?source=<source>`.

Detail page:

- Hero should be the plugin output or preview, not generic marketing art.
- Show install command, `od plugin view`, `od plugin run` example, version selector, dist-tags, changelog, source repo, publisher, license, integrity, capabilities, connector requirements, examples, and security notes.
- Show provenance in plain language: "Indexed from GitHub repo X at commit Y via marketplace Z".
- Show review state: official, trusted, restricted, yanked, deprecated, scan status.

Publish page:

- "Contribute to Open Design registry" flow with required files, checklist, CLI command, and GitHub PR path.
- "Self-host your own source" flow with static JSON instructions and `od marketplace add`.

### In-App UI

Replace the current Plugins tab model:

- `Installed`: installed plugins, upgrade/outdated state, use/uninstall/trust.
- `Available`: entries from configured marketplaces, install/use, filters, source badges.
- `Sources`: add URL, refresh, remove, trust tier, GitHub host/auth status, cache status.
- `Team`: private catalogs, org allowlist, default trust, audit and refresh policy.

Use the current `Installed / Available / Sources / Team` model as the product baseline. `Available` is discovery, `Sources` is registry source management, and `Team` is future enterprise governance.

Available plugin card states:

- Not installed: `Install`
- Installed same version: `Use`
- Installed older version: `Upgrade`
- Restricted capabilities: `Review`
- Yanked/deprecated: disabled install with reason

Detail page additions:

- Marketplace provenance: source marketplace id/name, resolved source, marketplace trust, plugin entry name/version.
- Publisher block: GitHub owner, verified status, homepage, license.
- Version block: selected version/tag, resolved ref, manifest digest, archive digest.
- Risk block: capabilities, connector requirements, install source, trust tier, yanked/deprecated state.
- Commands block: install, run, view, trust, lock.

## Trust And Provenance Rules

Use one vocabulary everywhere:

- Marketplace trust: `official | trusted | restricted`
- Installed plugin trust: `bundled | trusted | restricted`

Mapping:

- `official` marketplace installs as `trusted` by default, with provenance indicating official source.
- `trusted` marketplace installs as `trusted` by default.
- `restricted` marketplace installs as `restricted` by default.
- direct GitHub, URL, and local installs remain `restricted` unless the user explicitly grants trust/capabilities.
- bundled first-party plugins remain `bundled`.

Installed record semantics:

- Keep `sourceKind` as transport: `github | url | local | marketplace | bundled | user | project`.
- Add/keep `sourceMarketplaceId` for discovery provenance.
- Add `sourceMarketplaceEntryName`, `sourceMarketplaceEntryVersion`, `marketplaceTrust`, `resolvedSource`, `resolvedRef`, `manifestDigest`, and `archiveIntegrity`.
- UI grouping should use provenance first, transport second.

Install flow for bare marketplace names:

1. Resolve `name[@version-or-tag]` across configured marketplaces.
2. Select marketplace by priority or explicit `--from`.
3. Resolve dist-tag/range to an exact version.
4. Resolve transport source and ref.
5. Fetch bytes.
6. Verify manifest digest and archive integrity when present.
7. Persist installed record with marketplace provenance.
8. Write/update lock entry when requested.

Artifact hosting and yanking:

- Primary tarball hosting for GitHub-backed v1 is GitHub Releases on the source repo.
- Tarball hosting fallback is allowed: any HTTPS archive URL can be used when GitHub Releases are unavailable, including enterprise mirrors and object storage, but `integrity` is mandatory.
- Database-backed enterprise registries can store tarballs in private object storage and expose signed/download URLs through the same `dist.archive` field.
- Versions are never hard-deleted from the registry. Yanking marks a version with `yanked: true`, `yankedAt`, and `yankReason`.
- New installs and upgrades refuse yanked versions unless the user explicitly installs an already-locked exact version with a warning.
- Existing lockfiles remain reproducible as long as the archive is still retrievable and integrity matches.
- Package-level deprecation is separate from version yanking: deprecation warns and can point to a replacement package id; yanking blocks new resolution for that version.

## Private And Enterprise Sources

Private marketplace support in v1 should reuse GitHub auth instead of introducing token profiles:

- Auth is `gh` auth for GitHub.com or GitHub Enterprise hosts.
- Credentials live in `gh`, never inside `open-design-marketplace.json` and never inside the daemon database.
- `od marketplace add` stores URL, trust tier, GitHub host, refresh policy, and cache policy.
- Enterprise policy can restrict install sources to an allowlist of marketplace ids, GitHub orgs, or publisher ids.
- Offline cache should keep the last valid marketplace JSON, entry digests, and downloaded archives when enabled.
- Audit events should record add/remove/refresh/trust/install/upgrade/yank/deprecate decisions.
- Non-GitHub auth forms such as bearer/header/basic/mTLS are reserved for the future database or generic HTTPS backend, not the first GitHub-backed registry pass.

## Phased Plan

### P0: Close The Contract Loop

Goal: make the current federated marketplace implementation trustworthy and auditable.

- [x] Change `MarketplaceTrustSchema` to `official | trusted | restricted`.
- [x] Migrate/accept old `untrusted` rows as `restricted` during read or migration.
- [x] Extend install options with marketplace provenance fields.
- [x] When `/api/plugins/install` resolves a bare marketplace name, pass the full `ResolvedPluginEntry` into `installPlugin()`.
- [x] Persist `sourceMarketplaceId`, entry name/version, marketplace trust, and resolved source/ref on `installed_plugins`.
- [x] Map marketplace trust into installed plugin default trust.
- [x] Extend `AppliedPluginSnapshot` with marketplace entry name/version and resolved source metadata.
- [x] Add tests: marketplace add -> install by name -> installed record contains source marketplace id and inherited trust.
- [x] Add tests: restricted marketplace install stays restricted even when transport is GitHub.

### P1: Registry Entry And Version Semantics

Goal: move from "catalog index" to "registry entry".

- [ ] Update plugin manifest schema to allow published namespaced ids `vendor/plugin-name` while keeping flat ids readable for legacy local/bundled plugins.
- [ ] Add formal `plugin.repo` schema field to `open-design.json` and require it for registry publish.
- [x] Extend marketplace entry contract and JSON schema with `versions`, `dist`, `integrity`, `manifestDigest`, `publisher`, `homepage`, `license`, `capabilitiesSummary`, `distTags`, `deprecated`, and `yanked`.
- [x] Keep `.passthrough()` for community extensions.
- [x] Add `od marketplace plugins <id>` with pagination/search/filter.
- [x] Add `od plugin install <name>@<version-or-tag>`.
- [x] Add resolver support for exact version, dist-tag, and conservative `^`/`~` ranges.
- [x] Add initial `.od/od-plugin-lock.json` shape with name, version, source, marketplace id, resolved ref, manifest digest, archive integrity.
- [ ] Add `od plugin lock verify`.
- [ ] Add `od plugin outdated`.
- [x] Add yanking metadata and resolver behavior: yanked versions are visible for audit and refused for new resolution. Exact locked replay warning remains a route-level follow-up once lock verify lands.

### P2: GitHub-Backed Publish Flow

Goal: make Open Design contributions feel like npm publish, while actually opening a GitHub PR.

- [ ] Define official registry repo layout and generated index build step.
- [ ] Make `gh` an explicit `od` CLI dependency and installer prerequisite/bootstrap step.
- [x] Add `od plugin login` and `od plugin whoami` as wrappers over `gh auth login/status` and `gh api user`.
- [ ] Add `od plugin publish --to open-design --dry-run --json`.
- [ ] Use `gh auth status`, `gh api`, `gh repo fork`, and `gh pr create` through a narrow `GhClient` adapter.
- [ ] Generate a registry entry from local plugin metadata, `plugin.repo`, current ref, digest, publisher, license, and capability summary.
- [ ] Enforce "anything that packs": publish requires successful `validate` and `pack`, not a special source repository layout.
- [ ] Upload the `.tgz` to GitHub Releases when available, or accept a fallback HTTPS tarball URL with mandatory integrity.
- [ ] Run `od plugin validate`, `pack`, `doctor`, and integrity calculation before PR creation.
- [ ] Add PR template with source, version, capability risk, preview, screenshots, and validation output.
- [ ] Add CI in registry repo: schema validate, source fetch, plugin manifest parse, checksum verify, preview smoke, blocked source scan.
- [x] Add `od plugin publish --to marketplace-json --catalog <path>` for self-hosted static catalogs.

### P3: Product UI And Public Site

Goal: upgrade from "installed plugin gallery" to "multi-source plugin registry".

- [x] Replace the Plugins page tabs with `Installed / Available / Sources / Team`.
- [x] Enable source management in-app: add URL, refresh, remove, and trust tier using the existing `/api/marketplaces` endpoints.
- [x] Add an `Available` view from configured marketplace manifests. Current implementation reads cached manifests returned by `/api/marketplaces`; a follow-up should move this to a typed paginated `/api/marketplaces/:id/plugins` response for large catalogs.
- [x] Add install/use/upgrade card states for available entries. Current install uses the existing bare-name `od plugin install <name>` path and now preserves provenance; explicit `--from <marketplace-id>` remains a P1 follow-up.
- [x] Rename the Home page official shelf copy to `Official starters` or `Official installed`, and add a lightweight `Browse registry` path to `/plugins` so Home stays a fast-use surface while `/plugins` remains the registry console.
- [x] Make `Create plugin` launch an agent-assisted authoring flow backed by `od plugin scaffold/validate/pack/publish`, including local install/run validation before publish and `gh` login/whoami checks before opening a registry PR. Current slice updates the agent prompt and CLI wrapper; full GitHub PR mutation remains in P2.
- [x] Add public `/plugins/` route on `apps/landing-page` for open-design.ai: searchable official/community registry listing, static plugin detail pages, canonical/OG/Twitter metadata, JSON-LD item/detail data, and homepage/header entry points.
- [ ] Add source filters: Official, Community, My plugins, Team, specific source.
- [x] Add detail provenance, publisher, version, integrity, command, and risk sections to the public website detail route; in-app drawer polish remains tracked separately.
- [ ] Add GitHub host/auth status, cached status, and refresh policy to the source manager.
- [x] Add public plugin detail `od://` deep links and static search JSON. README rendering and preview galleries remain content-quality follow-ups.
- [ ] Decide whether `/marketplace` should redirect to `/plugins/` or remain an alias for compatibility.

### P4: Private, Enterprise, And Offline

Goal: make third-party/self-hosted registries first-class while staying compatible with a future database backend.

- [x] Add private GitHub/GitHub Enterprise marketplace auth entry through `od marketplace login <id|url> --host <host>`, delegated to `gh`.
- [x] Keep source management behind `RegistryBackend`, not GitHub-specific API calls.
- [ ] Add enterprise allowlist policy: source ids, publishers, GitHub orgs, capabilities.
- [ ] Add refresh policy and last-known-good cache.
- [ ] Add offline install from cache when enabled.
- [ ] Add audit log/events for source and install decisions.
- [ ] Add Team page for private catalog status, trust defaults, org policy, and audit.
- [x] Document static hosting options: GitHub Pages, private GitHub repos, GitHub Enterprise, S3/R2 public HTTPS, internal HTTPS, and private network caveats.

### P5: Database Backend And Commercial ToB

Goal: make the registry deployable as an enterprise service with real database state.

- [ ] Define database-backed registry schema for orgs, sources, packages, versions, artifacts, publishers, reviews, policies, installs, and audit events.
- [x] Add `DatabaseRegistryBackend` behind the same resolve/search/publish/doctor interface.
- [ ] Add object-storage abstraction for plugin archives and preview assets.
- [ ] Add org-scoped auth/identity boundary; hosted can use first-party auth, self-host can use enterprise IdP integration later.
- [ ] Add policy engine hooks: source allowlist, capability denylist, required review, yanked/deprecated enforcement, approval exceptions.
- [ ] Add admin APIs and UI for Team/Enterprise registry governance.
- [ ] Add migration/import from static `open-design-marketplace.json` and GitHub registry repo into database rows.
- [ ] Add export back to `open-design-marketplace.json` so enterprises can mirror or air-gap catalogs.
- [x] Add backend parity tests for static/GitHub/database list/search/resolve/publish. Full CLI/UI parity against DB remains an enterprise API follow-up.

### P6: npm-Grade Hardening

Goal: make updates reproducible and safe enough for CI/enterprise use.

- [x] Add range resolution only after exact/tag resolution is solid.
- [ ] Add update policies: `pinned`, `patch`, `minor`, `latest`.
- [x] Add yanked/deprecated handling in resolver; UI surfacing remains part of detail drawer polish.
- [x] Add publisher verification hooks against GitHub org/user metadata.
- [x] Add signed provenance schema hooks, without blocking v1 on PKI.
- [x] Add `od marketplace doctor` checks: entry naming/source/yank/capability/license/integrity basics, with strict mode for warnings.
- [x] Add daemon smoke coverage: add marketplace -> resolve/search -> install by name -> installed row and lockfile preserve provenance.

## Suggested First PR Split

1. **Provenance fix**
   - Files: `packages/contracts/src/plugins/*`, `apps/daemon/src/plugins/marketplaces.ts`, `apps/daemon/src/plugins/installer.ts`, `apps/daemon/src/plugins/registry.ts`, `apps/daemon/src/server.ts`, daemon tests.
   - Outcome: marketplace installs are auditable.

2. **Trust vocabulary cleanup**
   - Files: contracts, daemon marketplace persistence/read path, CLI help, web types.
   - Outcome: no more `untrusted` vs `restricted` drift.

3. **Available marketplace API**
   - Files: daemon `/api/marketplaces/:id/plugins`, CLI `od marketplace plugins`, contracts response shape.
   - Outcome: UI can browse not-yet-installed entries without scraping cached manifests client-side.

4. **Plugins UI source management**
   - Files: `PluginsView`, marketplace state helpers, CSS, web tests.
   - Outcome: add/refresh/remove/trust source operations in-app.

5. **GitHub publish dry run**
   - Files: `publish.ts`, CLI publish route, tests, docs.
   - Outcome: authors can see the exact registry PR body/entry before mutation.

6. **GitHub CLI auth wrapper**
   - Files: CLI install/bootstrap docs, `apps/daemon/src/cli.ts`, new `GhClient` adapter, tests.
   - Outcome: `od plugin login/whoami` provide the product auth surface while reusing the user's `gh` session.

## Validation Bar

Minimum validation for regular registry work:

```bash
pnpm guard
pnpm typecheck
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/web test
```

Additional validation by area:

- Contract/schema changes: add parser/schema fixtures in `packages/plugin-runtime/tests` and contracts tests where appropriate.
- CLI changes: add daemon CLI tests or command-level tests matching the existing harness.
- UI changes: add web component/state tests; use Browser/Playwright screenshots for larger visual route changes.
- Publish/GitHub changes: tests must run without real network by injecting a fake `GhClient` or dry-run backend.
- Enterprise/private source changes: tests must assert GitHub credentials stay in `gh` and are never serialized into marketplace manifests or daemon SQLite.
- Registry product evaluation cases are tracked in `docs/testing/plugin-registry-eval-cases.md`; keep it updated whenever Sources, Available, Installed, GitHub publish, or enterprise backend behavior changes.

## Open Questions

- Should the official registry live in this monorepo or a separate `open-design/plugin-registry` repo? Separate is cleaner for community PR review and static-site generation.
- Should `official` marketplace trust be allowed for user-added URLs, or only for built-in source ids shipped by Open Design? Recommendation: only built-in sources can be `official`; user-added sources can be `trusted` or `restricted`.
- Should lockfile be project-local (`.od/plugins-lock.json`) or user-global? Recommendation: project-local for reproducible runs, with user-global cache as an implementation detail.
- Should `od plugin publish --to marketplace-json` mutate a local catalog file directly or create a branch/PR when the catalog URL maps to GitHub? Recommendation: support both, but default to PR when a GitHub remote is detectable.
- How much popularity/ranking data should the official site show before telemetry policy is settled? Recommendation: show stars/downloads only when sourced from public GitHub or explicit registry events; keep install telemetry opt-in.

## Resolved Decisions

- Namespace policy: registry package ids are `vendor/plugin-name`.
- Source repo shape: accept anything that passes `od plugin validate` and `od plugin pack`.
- Source pointer: registry-published `open-design.json` must include `plugin.repo`.
- Tarball hosting fallback: yes, with mandatory integrity.
- Yanking: yes; mark versions yanked instead of deleting them.
- Plugin ID stability: yes; ids are immutable after publish, and renames create new ids plus aliases/deprecations.

## Product Judgment

The architecture is already pointed in the right direction: Open Design can become a "multi-source plugin registry" without giving up local-first/headless operation. The next move should not be a bigger gallery. It should be provenance, trust vocabulary, and exact resolution first; then the UI can safely graduate from "official plugins plus import" to "installed and available plugins across sources."
