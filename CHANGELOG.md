# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.0] - 2026-05-12

A memory-plus-UI release: **auto-memory store** carries agent context across runs and projects, **Critique Theater advances to Phase 7** (state machine + replay) with daemon-side **Phase 6.2** artifact extraction, **HyperFrames** lands **HTML-in-Canvas** end-to-end, and the web UI gets a **top-to-bottom Designs tab redesign**, **in-context preview comments**, a **unified Media tab**, and a **tweaks palette with HSL hue-shift recoloring**. Plus **responsive design handoff** outputs, **install/uninstall skills & design systems in-app**, **HTTP 206 range requests** for video/audio, **scheduled routines** for unattended agent runs, **macOS Intel (x64) builds**, an official **Nix flake**, four new design systems (hud, loom, trading-terminal, WeChat), and an `agent-browser` skill. 107 merged PRs since 0.6.0.

### Added

#### Critique Theater
- **Phase 7 — web client state machine.** Reducer plus `useCritiqueStream` / `useCritiqueReplay` hooks so the critique UI replays cleanly and reconnects mid-run. ([#1307])
- **Phase 6.2 — daemon artifact extraction + endpoint.** Critique-tagged artifacts are extracted server-side and exposed via a dedicated endpoint. ([#1085])

#### Web / UI
- **Designs tab redesign** — cards with covers, tags, overflow menu, and multi-select. ([#1161])
- **In-context comment thread for the artifact preview** — comment directly on a preview without leaving the workspace. ([#1276])
- **Unified Media tab** — Image / Video / Audio entries consolidated into a single tab. ([#1167])
- **Tweaks palette popover with HSL hue-shift recoloring** — adjust hue/saturation/lightness inline. ([#1292])
- **Responsive preview + design handoff outputs** — tablet/mobile preview auto-fit, 2025–2026 responsive viewport matrix, screen-file-first export policy, DESIGN-HANDOFF / DESIGN-MANIFEST exports for coding-tool implementation. ([#1224])
- **Thumbs-up / thumbs-down feedback widget** under completed assistant turns. ([#1308])
- **`Cmd/Ctrl+,` opens Settings** with a platform shortcut badge in the menu. ([#1173])
- **Finalize design package + Continue in CLI buttons.** ([#974])
- **Fetch models button for BYOK providers** so newly added models discover themselves on demand. ([#1034])
- Provider-model fetch results sorted alphabetically. ([#1097])
- **Collapsible MCP JSON field-mapping helper.** ([#1136])
- Question forms scroll to top of viewport instead of pinning to the bottom. ([#1044])
- Sidebar tabs flush to the workspace edge with internal scrolling. ([#1038])
- Design file rename support. ([#894])

#### Daemon, agents & runtime
- **Auto-memory store with chat-protocol-aware extraction.** Agents accumulate durable context across runs and projects. ([#999])
- **Install / uninstall for skills & design systems** directly from the desktop app. ([#1003])
- **HTTP 206 range request support for video / audio files** (closes #784). ([#1105])
- **Scheduled routines for unattended agent runs.** ([#1033])
- Guard against agent-emitted stub artifact regressions. ([#1171])
- Reject filesystem root folder imports. ([#1266])
- Split agent runtime definitions into per-runtime modules. ([#1063])
- Split route registration into focused modules. ([#1043])

#### HyperFrames
- **HTML-in-Canvas lands across web + skills.** Embedded HTML renders inside canvas-mode templates end-to-end. ([#866])

#### Skills, design systems & prompt templates
- **Generic skills + skills/design-templates split + finalize-design API.** Skill model refactor that separates code-driven skills from design-template assets. ([#955])
- **Reliable `agent-browser` skill.** ([#1284])
- **WeChat design system + `login-flow` skill** (also fixes API-mode `tool_calls` bug). ([#1083])
- **Three new design systems: `hud`, `loom`, `trading-terminal`** with locale coverage. ([#1069])
- **`release-notes-one-pager` skill** with supporting docs. ([#873])
- Improve design files grouping. ([#1082])
- Replace time-specific Orbit greetings with neutral defaults. ([#1291])

#### Design Systems infrastructure
- **`tokens.css` schema for design systems** (`default` + `kami`). ([#1231])

#### Settings & onboarding
- Install onboarding links for unavailable local CLIs. ([#985])

#### Packaging & distribution
- **macOS Intel (x64) build support** in release workflows. ([#759])
- **Official Nix flake** with home-manager and NixOS support. ([#402])
- Beta release packaging cache optimizations. ([#1095])

#### Internationalization
- **Traditional Chinese QUICKSTART** + Chinese doc links fixed. ([#753])

### Changed

- Conversation run isolation enforced — concurrent runs no longer cross-contaminate state. ([#1271])
- Default English resource i18n fallback so missing translations don't break agent prompts. ([#1270])
- `[codex]` Claude Code exit diagnostics improved. ([#1267])
- `[codex]` empty API responses handled as no output (not as errors). ([#1244])
- Codex CLI path fallback UX improvements. ([#1205])

### Fixed

#### Web
- Persist Appearance accent color selection so swatch picks survive Settings close. ([#1439])
- Load Orbit template choices from `design-templates` instead of `skills` (aligns with the skill model refactor). ([#1442])
- Restore custom dropdown chevron for the timezone selector in dark mode. ([#1368])
- Polish EntryView UI — sidebar layout, folder tabs, slim form, blue selected token. ([#1360])
- Translate Design Files refresh strings instead of hardcoding English. ([#1300])
- Pretty-print JSON file previews. ([#1206])
- Keep Tweaks selection usable without annotations. ([#1268])
- Render static previews for sketch JSON files. ([#1060])
- Ignore `<artifact>` tags inside markdown code spans and fences. ([#1132])
- Refresh home projects after deleting a conversation. ([#1219])
- Complete finished tool calls missing results. ([#1240])
- Intercept prose-as-HTML artifacts before they hit disk. ([#1144])
- Truncate entry footer pet label. ([#1150])
- Surface connector auth errors and stop silent popup close. ([#1128])
- Center close button in MCP picker dialog. ([#1137])
- Prevent chat messages overflowing into the workspace area. ([#1104])
- Prevent creating a new conversation when the current one is empty. ([#1086])
- Dispatch Examples preview on `od.preview.type`. ([#1001])
- Scroll Settings content back to top on section change. ([#997])
- Allow pod-to-chat comment text to wrap instead of truncating. ([#1156])
- Localize MCP server settings panel for Chinese UI. ([#760])
- Restore media config from daemon on startup. ([#687])
- Suppress autosave indicator for draft-only Connector key edits. ([#1232])
- Fix link handling in example preview iframe sandbox. ([#701])
- Handle popup-blocked PDF export with native Electron print dialog. ([#973])
- Translate comments panel UI to Chinese. ([#1139])
- Hide surface filter tabs with zero count in Design Systems view. ([#965])
- Prevent design system filter popover from shifting position on reopen. ([#960])

#### Desktop
- Exit fullscreen before hiding window on macOS close. ([#1249])
- Enforce minimum window size on main client. ([#1203])
- Allow `about:blank` popup for PDF export fallback. ([#1081])
- Fix daemon browser opener on Windows. ([#953])

#### Daemon, agents & contracts
- Wire finalized assistant message writes to the Langfuse report bridge so reports settle reliably. ([#1402])
- Remove OpenCode stdin dash sentinel. ([#1365])
- Use ACP config options for model selection. ([#1208])
- Persist `runStatus` / `endedAt` on chat run termination. ([#1230])
- Prefer `opencode-cli` over `opencode` binary so OpenCode Desktop installs resolve to the CLI. ([#818])
- Support OpenCode Write tool display as card. ([#1126])
- Pin API-mode override above discovery layer. ([#1207])

#### Packaging
- Close running app before silent reinstall on Windows. ([#1238])
- Build desktop before packaged typecheck. ([#1093])
- Prevent project type selector arrows from overlapping tabs. ([#1091])
- Increase top padding in modal footer for better visual balance. ([#957])

#### Misc
- Clear stale upload failure banner when previewing files. ([#797])
- Remove Trump pet from bundled community pets. ([#1103])
- Add "When NOT to emit" guardrail to artifact handoff prompt. ([#1145])
- Pending prompt clearing for templates. ([#1148])
- Set writable `OD_DATA_DIR` default for `nix run`. ([#1159])
- Landing-page SEO: correct canonical, add `robots.txt` + favicons. ([#1061])

### Documentation

- **`MAINTAINERS.md` + CONTRIBUTING entry-point** for maintainer rules. ([#1290])
- **Traditional Chinese QUICKSTART** + Chinese doc link fixes. ([#753])

### Internal

- Stabilize extended Playwright coverage. ([#1341])
- Expand nightly UI and desktop regression coverage. ([#1256])
- Harden e2e smoke and release reports. ([#1140])
- Expand entry and settings automation coverage. ([#954])
- Refreshed generated GitHub metrics SVG and contributors wall. ([#1115], [#1117], [#1183], [#1188], [#1328], [#1330])

- **Plugin & marketplace system — Phase 2A + 1 + 1.5 + 2B + 2C entry slice + 3 (full) + 4 (full incl. OD_BUNDLED_ATOM_PROMPTS default ON) + 5 (full incl. live S3 impl; postgres adapter still stubbed) + 6 (full incl. asset rasterisation) + 7 (all six code-migration atom impls landed; full pipeline e2e covered by smoke test) + 8 (full incl. GenUI \u2192 decision bridge + handoff promotion ladder bridge) + bundled scenarios + bundled-scenario fallback resolver.** Spec: [`docs/plugins-spec.md`](docs/plugins-spec.md). Living plan: [`docs/plans/plugins-implementation.md`](docs/plans/plugins-implementation.md).
  - **`od plugin events purge` admin escape hatch (Phase 4).** New `purgePluginEventBuffer()` returns pre-purge stats `{ purged, firstId, lastId, preNextId }` so an operator can audit what was discarded. Loopback-only `POST /api/plugins/events/purge` route + `od plugin events purge --confirm` CLI subcommand (refuses to run without `--confirm` so a stray invocation never drops audit data accidentally).
  - **`od plugin manifest <id>` + `od plugin sources` (Phase 4).** New CLI subcommands for plugin authors and ops: `od plugin manifest <id>` prints just the parsed manifest JSON (no wrapper, no fsPath / installedAt noise) so authors can diff against their on-disk `open-design.json`. `od plugin sources` lists every distinct `(sourceKind, source)` tuple + plugin count, sorted by descending count then alphabetically, with the per-bucket plugin list sorted by id. New `pluginSourceBuckets()` pure helper backs the CLI for byte-deterministic output.
  - **`od plugin events snapshot/stats` + tail filters (Phase 4).** Extends §3.II1 with: `GET /api/plugins/events/snapshot` for non-SSE one-shot reads (dashboards that don't want a live connection); `GET /api/plugins/events/stats` returns a `summarisePluginEvents()` rollup (counts byKind, byPluginId — skipping empty ids — plus oldest/newest at + id range); `--kind <k>` and `--plugin-id <id>` filter flags work on both `od plugin events tail` (client-side post-render) and the new `od plugin events snapshot` subcommand. CLI pretty-prints the stats rollup with sorted-key counts for byte-determinism.
  - **More plugin event producer hooks (Phase 4).** Extends §3.II1 with: `installPlugin` accepts `eventKind: 'installed' | 'upgraded'` so the upgrade route distinguishes the operation in the live tail; `POST /api/plugins/:id/trust` emits `plugin.trust-changed`; `POST /api/applied-plugins/prune` emits `plugin.snapshot-pruned` when anything was actually removed; `POST /api/marketplaces/:id/refresh` emits `plugin.marketplace-refreshed`. Each hook is best-effort and never blocks the underlying mutation if the ring buffer throws.
  - **Plugin event ring buffer + SSE tail (Phase 4).** New `apps/daemon/src/plugins/events.ts` ships an in-memory FIFO ring buffer (capped at 1000 entries, monotonic ids, fan-out subscribers) for plugin lifecycle events: `plugin.installed` / `.upgraded` / `.uninstalled` / `.trust-changed` / `.applied` / `.snapshot-pruned` / `.marketplace-refreshed`. Producer hooks landed on the installer (install + uninstall). New `GET /api/plugins/events` SSE route emits the backlog on connect (with optional `?since=<id>` trim) then forwards live events. CLI: `od plugin events tail [-f] [--since <id>] [--json]` — non-follow mode drains backlog + exits; `-f` keeps the stream open for ops dashboards.
  - **`od plugin doctor --strict` + verify strict propagation (Phase 4).** New `--strict` flag on `od plugin doctor` promotes warnings to failures (exit 4 distinguishes 'strict failed' from doctor errors at exit 1). The `verifyPlugin()` orchestrator gains a matching `strict: true` config knob that flows through `.od-verify.json` so plugins can lock 'no warnings allowed' as a one-line CI policy.
  - **`od daemon db verify` SQLite integrity check (Phase 5).** New `verifySqliteIntegrity()` pure helper wraps PRAGMA `integrity_check` (or `quick_check` with `--quick`) + PRAGMA `foreign_key_check`. Returns a structured `{ ok, mode, issues[], elapsedMs, generatedAt }` report with issues tagged `kind='integrity' | 'foreign_key'`. Loopback-only `POST /api/daemon/db/verify` route + `od daemon db verify [--quick]` CLI subcommand — exit 0 on ok=true, 4 on any issue, so CI can wire it into a pre-deploy check.
  - **`od daemon db vacuum` (Phase 5).** New loopback-only `POST /api/daemon/db/vacuum` runs SQLite VACUUM and reports before/after sizes + reclaimed bytes + elapsed ms. Useful after large delete batches (snapshot prune, plugin uninstall) shrink rows but leave space allocated to the file. CLI: `od daemon db vacuum [--json]`.
  - **`od daemon db status` SQLite inventory (Phase 5).** New `inspectSqliteDatabase()` pure helper + `GET /api/daemon/db` route returns a structured report: `kind` ('sqlite'), file location, size on disk (primary + WAL + SHM), schema version (`user_version` PRAGMA), and per-table row counts (system tables excluded, lexicographic order). CLI: `od daemon db status [--json]` lets ops sanity-check deployments at a glance + compare expected-vs-actual table rosters across daemon upgrades.
  - **`od plugin verify <id>` CI meta-command (Phase 4).** New `verifyPlugin()` pure orchestrator aggregates `doctor` + `simulate` + `canon --check` into one pass/fail report. Reads `<plugin-folder>/.od-verify.json` (or `--config <path>`) so plugin authors commit their CI checks into their repo. Each check resolves to `passed | failed | skipped | unsupported`; aggregate passes iff every enabled check is passed or skipped (`unsupported` bubbles up as a fail to keep CI honest). One-liner CI workflow: `od plugin verify my-plugin` — exit 0 on pass, 4 on fail, 2 on CLI/config error.
  - **`od plugin simulate <id>` pipeline dry-run (Phase 4).** New `simulatePipeline({ pipeline, signals, iterationCap? })` pure helper walks every stage in a plugin's pipeline against caller-supplied signals (constant snapshot OR per-iteration generator function) and reports `outcome ∈ { single | converged | cap | unparsable }` per stage plus aggregate `outcome ∈ { all-converged | all-single | mixed | cap-hit | unparsable }`. Companion `parseSignalKv()` parses repeatable `-s key=value` CLI flags into the closed `UntilSignals` vocabulary with typo guards. CLI: `od plugin simulate <pluginId> [-s key=value ...] [--cap <n>] [--json]` — exit 4 on cap-hit/unparsable so CI can hook this into a pipeline check.
  - **`od plugin stats` inventory health report (Phase 4).** New `pluginInventoryStats()` + `snapshotInventoryStats()` pure helpers aggregate installed-plugin counts (by `sourceKind` / `trust` / `taskKind`, bundled vs. third-party split, plugins with elevated capabilities — `fs:write` / `subprocess` / `bash` / `network` / `connector:*`) and snapshot health (status breakdown, project / run linkage, oldest / newest applied timestamps). New `GET /api/plugins/stats` route + `od plugin stats [--json]` CLI subcommand for at-a-glance fleet audit.
  - **`od plugin canon --check <expected-file>` byte-equality fixtures (Phase 4).** New `--check` mode on `od plugin canon` compares the canon output against an on-disk fixture and exits 4 on mismatch with a per-line diff preview. Lets plugin authors commit `renderPluginBlock()` regression fixtures into their own `tests/` without writing a fresh test harness.
  - **`od plugin canon <snapshotId>` show prompt block (Phase 4).** New `GET /api/applied-plugins/:snapshotId/canon` route renders the canonical `## Active plugin` / `## Plugin inputs` block this snapshot splices into the system prompt, byte-equal to what the agent reads via `composeSystemPrompt`. Plain-text response when the request sends `Accept: text/plain` so shell pipes work cleanly; JSON wrapper otherwise. CLI: `od plugin canon <snapshotId> [--json]`.
  - **`od plugin snapshots show / diff` debugging (Phase 4).** New `GET /api/applied-plugins/<id>`-backed `od plugin snapshots show <snapshotId>` dumps a full `AppliedPluginSnapshot` for inspection. New `diffSnapshots()` pure helper + `od plugin snapshots diff <a> <b>` compares two snapshots field-by-field with a `digestEqual` flag that surfaces the e2e-2 invariance check at-a-glance. Compares identity, inputs map, capabilities, resolvedContext, connectors, mcpServers, genuiSurfaces, pipeline (stages + per-stage atoms / until), assets. Entries sort lexicographically so output is byte-deterministic.
  - **`od plugin diff <a> <b>` author tooling (Phase 4).** New `diffPlugins({ a, b })` pure-helper compares two `InstalledPluginRecord` values and returns a structured `{ pluginId?, entries[], added, removed, changed }` report. Compares top-level fields (id, version, sourceKind, source, trust, capabilitiesGranted) plus manifest body (title / version / description / license / tags / kind / taskKind / mode / capabilities / inputs / context.skills / context.craft / context.assets / pipeline.stages + per-stage atoms / connectors.required / genui.surfaces). Collection diffs collapse to `<n> added, <m> removed` summaries; entries sort lexicographically by field path so the report is byte-deterministic across re-runs. CLI: `od plugin diff <id-a> <id-b> [--json]` renders +/-/~ glyphs.
  - **`od atoms info <id>` + atom catalog drift fix (Phase 4).** New `GET /api/atoms/:id` returns catalog metadata + the bundled SKILL.md body. Catalog promoted nine atoms (`code-import`, `design-extract`, `figma-extract`, `token-map`, `rewrite-plan`, `patch-edit`, `diff-review`, `handoff`) from `status='planned'` to `'implemented'` to reflect the daemon impls landed across §3.N–§3.S; `build-test` added as a missing catalog row. Net: zero `planned` atoms remaining.
  - **`od plugin upgrade <id>` re-install from recorded source (Phase 4).** New `POST /api/plugins/:id/upgrade` route streams the same SSE shape as `/install`, internally calling `installPlugin()` against the plugin's recorded `source` string (so the github / https / local-folder byte path replays end-to-end). 409s with `code='bundled-plugin'` when the plugin shipped bundled with the daemon (those upgrade with the daemon image), and `code='missing-source'` when the recorded source is empty. CLI: `od plugin upgrade <id>` — exit 0 on success, 1 on installer error.
  - **patch-edit atomic file writes (Phase 7 safety patch).** Every `fs.writeFile` inside `patch-edit` (file content + `plan/steps.json` + `plan/receipts/`) now routes through an `atomicWriteFile()` helper that writes to a sibling tmp file and renames into place via POSIX `rename(2)`. A daemon crash mid-write can no longer leave the source file truncated; rejection-path failures (context mismatch, etc.) leave the original byte-equal. Cleanup path unlinks the orphan tmp on failure so disk noise stays bounded.
  - **`od plugin search <query>` + filters on `od plugin list` (Phase 4).** New `searchInstalledPlugins({ plugins, query?, taskKind?, mode?, tag?, trust?, bundled? })` pure-helper ranks free-text matches across id / title / description / tags (exact wins over substring; tag-exact ranks ahead of title-substring) and AND-combines with structural filters. CLI gains `od plugin search <query>` and adds `--task-kind / --mode / --tag / --trust / --bundled / --no-bundled` knobs to `od plugin list`. Search results show `matched=[…]` per row so the user can trace which field caught the hit.
  - **`od plugin pack <folder>` distribution archive (Phase 4).** New `packPlugin({ folder, out? })` helper builds a gzip-compressed tar archive of an author's plugin folder, ready to install via the installer's HTTPS-tarball path. Default output path is `<basename>-<manifest.version>.tgz` beside the folder. Skiplist matches the installer's extract-time exclusions (`node_modules`, `.git`, `dist`, `build`, `out`, `coverage`, `.turbo`, `.cache`, `.pnpm-store`, `.DS_Store`, etc). Symlinks rejected at both walk and tar-filter passes so what authors pack matches what the installer accepts. The output archive itself is always excluded from its own contents (no spiral when `--out` lands inside the folder).
  - **`od plugin validate <folder>` author-side lint (Phase 4).** Pre-install lint pass against an unfinished plugin folder. New `validatePluginFolder({ folder, registry? })` helper reads the folder via the same `resolvePluginFolder()` the installer uses (manifest parsing is byte-equal to install time) and runs `doctorPlugin()` against the supplied registry view. Surfaces atom-id mismatches, manifest parse errors, unparseable `until` expressions, and unresolved skill / DS / craft refs without dirtying the registry table. CLI takes `--no-daemon` for fully-offline runs and `--json` for machine-readable output. Exit code `4` when `doctor.ok=false`, `2` on CLI/folder errors, `0` on clean.
  - **`OD_BUNDLED_ATOM_PROMPTS` default flipped to ON (Phase 4).** With every Phase 6/7/8 atom impl shipping its own SKILL.md fragment (build-test, code-import, design-extract, figma-extract, token-map, rewrite-plan, patch-edit, diff-review, handoff), the audit-block on flipping the default is lifted. Runs with a plugin snapshot now ALWAYS get the matching `## Active stage` blocks spliced into the system prompt without operators having to set the env var. Set `OD_BUNDLED_ATOM_PROMPTS=0` to opt out (snapshot replay against pre-flip daemons, regression bisects that need byte-equal prompts). Runs without a snapshot stay byte-equal so the change is invisible outside the plugin path.
  - **`S3ProjectStorage` live implementation via AWS SigV4 (Phase 5).** New `apps/daemon/src/storage/aws-sigv4.ts` ships a minimal AWS Signature V4 signer using only `node:crypto` (no `@aws-sdk/*` dependency \u2014 keeps the daemon shippable as a small binary). The signer is verifiably correct against the AWS-published reference vector (GetObject example). `S3ProjectStorage` now implements all five `ProjectStorage` ops (read / write / list / delete / stat) via `globalThis.fetch`, with virtual-host-style URLs by default and path-style for `OD_S3_ENDPOINT` overrides (Aliyun OSS, Tencent COS, Huawei OBS, MinIO). LIST walks `NextContinuationToken` for paginated buckets. Credentials read from `OD_S3_ACCESS_KEY_ID/SECRET/SESSION_TOKEN` first, falling back to `AWS_*` env vars so existing IAM-role / `aws configure` setups drop in unchanged.
  - **`runHandoffAtom()` pipeline-driven bridge (Phase 8 entry slice).** New helper reads the canonical state previous atoms wrote (`<cwd>/review/decision.json` from diff-review, `<cwd>/critique/build-test.json` from build-test) and returns the updated `ArtifactManifest` with the right `handoffKind` / `exportTargets[]` attached. Promotion ladder (spec §11.5.1): `reject` \u2192 `design-only`; `accept`/`partial` no-build-test \u2192 `implementation-plan`; + `build.passing`\u2228`tests.passing` \u2192 `patch`; + both signals + docker/cli export \u2192 `deployable-app`. Monotonicity enforced via `recordHandoff()`; a manifest carrying `'patch'` won't demote to `'design-only'` even when a follow-up reject arrives.
  - **`runAndPersistHandoff()` + auto-handoff from diff-review GenUI bridge (Phase 8 entry slice).** New on-disk shell round-trips `<cwd>/handoff/manifest.json`: reads existing manifest (or falls back to `manifestSeed`, then to a minimal default), calls `runHandoffAtom()`, and writes back only when something changed (`persistMode: 'created' | 'updated' | 'skipped'`). The diff-review GenUI bridge now auto-invokes this after recording the user's decision, so the Phase 8 promotion ladder closes end-to-end without an agent turn: user clicks Accept all in the web composer → daemon writes `review/decision.json` AND `handoff/manifest.json` with the right `handoffKind` set; failure surfaces on the bridge result as `handoffError` without regressing the diff-review write.
  - **figma-migration pipeline e2e smoke (Phase 6).** New `plugins-figma-migration-e2e.test.ts` walks figma-extract (stubbed REST) → token-map → diff-review → handoff end-to-end. Locks the scenario folder roster (`plugins/_official/scenarios/od-figma-migration/open-design.json` stages: extract → tokens → generate → critique).
  - **Full code-migration pipeline e2e smoke test (Phase 7-8).** First integration test that walks every code-migration atom (code-import \u2192 design-extract \u2192 token-map \u2192 rewrite-plan \u2192 patch-edit \u2192 build-test \u2192 diff-review \u2192 handoff) on a Next.js fixture repo without any agent in the loop. Locks the inter-atom file contract so a future PR can't break the chain by silently renaming `code/tokens.json` or adding a required field to `plan/steps.json` without updating every downstream reader. Ends on `handoffKind='deployable-app'` for the happy path; second case verifies the `reject` ladder rung still demotes through to `design-only`.
  - **Earlier in this changeset:**
  - **diff-review GenUI \u2192 `review/decision.json` bridge (Phase 8 entry slice).** New `apps/daemon/src/plugins/atoms/diff-review-genui-bridge.ts` owns the `__auto_diff_review_` prefix detection, strict JSON validation of the surface payload (rejects non-object payloads + unknown decisions; coerces non-string entries out of the file lists; forwards optional `reason`), and the end-to-end `applyDiffReviewDecisionToCwd({ cwd, value, reviewer })` glue. `POST /api/runs/:runId/genui/:surfaceId/respond` now bridges the choice surface response into `runDiffReview()` so the user's decision lands on `<cwd>/review/decision.json` immediately. Best-effort: failures are surfaced on the response payload as `diffReviewBridge: { ok: false, error }` without regressing the GenUI respond contract.
  - **Earlier in this changeset:**
  - **Native diff-review UI on `GenUISurfaceRenderer` (Phase 8 entry slice).** New `DiffReviewChoiceSurface` component renders the auto-derived `__auto_diff_review_<stageId>` choice surface natively: three top-level buttons (Accept all / Reject all / Partial…), an optional notes textarea forwarded as `decision.reason`, and a per-file accept/reject checklist that appears when the user picks Partial. Local validation refuses Partial submission when any touched file is left undecided (mirrors the daemon's `partial must cover every touched file` contract). New `GenericChoiceSurface` renders any schema with a primary enum property as a button group; property literally named `decision` wins so plugin-author-customised diff-review schemas keep rendering as accept/reject/partial buttons. PendingSurface gains an optional `context: { touchedFiles?: [] }` field so future runtime context (per-stage hints) can plug in without bloating `GenUISurfaceSpec`.
  - **`figma-extract` asset rasterisation second pass (Phase 6 entry slice).** `runFigmaExtract({ offlineAssets: false })` now downloads per-leaf-node assets via the Figma `GET /v1/images` endpoint. New knobs: `assetFormat` (`'svg' | 'png' | 'jpg' | 'pdf'`, default svg), `assetMaxBytes` (default 5 MiB). 50-id chunks, per-id failure isolation (a single CDN hiccup doesn't lose the batch), every issue lands in `meta.unsupportedNodes[]` with `reason='asset-too-large' | 'no download URL returned' | 'download <status>' | 'image fetch error: …' | 'figma error: …'`. `atomDigest` is recomputed after the asset pass settles so the digest reflects which assets succeeded.
  - **Earlier in this changeset:**
  - **`token-map` atom (Phase 6/7 entry slice).** New `runTokenMap({ cwd, source?, designSystem, strict? })` writes `<cwd>/token-map/{colors,typography,spacing,radius,shadow,unmatched,meta}.json`. Match strategies (deterministic, first-win): exact value match → normalised hex (#abc → #aabbcc) → fuzzy name (strips `--` / `ds-` / `odds-` / `theme-` prefixes). Unmatched lands with `'no-target-equivalent'`, `'target-collision'`, or `'invalid-source'`. `parseDesignSystemTokens(body)` heuristic helper lifts CSS custom properties + markdown table rows from a DESIGN.md body so daemon callers don't need a hand-curated bag.
  - **`figma-extract` atom (Phase 6 entry slice).** New `runFigmaExtract({ cwd, fileUrl?, fileKey?, token, fetchFn?, offlineAssets? })` walks Figma's REST `GET /v1/files/<key>` into the canonical `<cwd>/figma/{tree,tokens,meta}.json`. Token lift heuristics: SOLID fills + strokes → colours, `cornerRadius` → radius, FRAME / GROUP heights → spacing candidates. Gradient + image fills land in `meta.unsupportedNodes[]` with a reason. `fetchFn` is pluggable (tests inject stubs); offline mode keeps the assets/ directory empty. The OAuth bearer token is forwarded via the `Authorization` header and never persisted by the runner — the daemon's connector-gate stays the only place that touches the token store.
  - **Auto-derived `choice` surface for `diff-review` (Phase 8 entry slice).** Mirrors the connector-gate's auto `oauth-prompt` pattern. When a stage in the EFFECTIVE pipeline (consumer-declared OR scenario-fallback) lists `diff-review`, applyPlugin() synthesises an implicit `choice` GenUI surface (`__auto_diff_review_<stageId>`, `persist='run'`, 24h timeout, `onTimeout='abort'`) so the user can accept / reject / partial without the plugin author having to declare the surface by hand. Plugin-author-declared surfaces with the same id win.
  - **Earlier in this changeset:**
  - **Bundled-scenario pipeline fallback (spec §23.3.3).** New pure helper `resolveAppliedPipeline({ manifest, scenarios })` returns `{ pipeline, source: 'declared'|'scenario'|'none', scenarioId? }`. `applyPlugin()` now consults the bundled scenarios surfaced by `loadPluginRegistryView()` and copies the matching scenario's pipeline verbatim into both the `ApplyResult.pipeline` and `AppliedPluginSnapshot.pipeline`. Scenario plugins themselves never recurse. `manifestSourceDigest` stays unchanged across the fallback so spec §11.5 e2e-2 invariance holds. Only rows with `source_kind='bundled'` AND `od.kind='scenario'` are eligible — third-party scenarios cannot promote themselves.
  - **`design-extract` atom (Phase 6/7 entry slice).** New `runDesignExtract({ cwd, repoPath })` reads `code/index.json`, walks every scannable file (css/scss/ts/tsx/js/jsx/html/json), and writes the canonical token bag at `<cwd>/code/tokens.json`. Captures hex / rgba / hsla colours, CSS custom properties (`--*-color/-bg/-accent/-primary/-secondary/-surface/-border/-muted`), font-family declarations, px/rem/em spacing on padding/margin/gap/inset, border-radius, box-shadow, and Tailwind config quoted hex palette entries. Each token records `sources[]` (`<path>:<line>`) + `usage[]` so `token-map` has a precise audit trail.
  - **`rewrite-plan` atom (Phase 7 entry slice).** New `runRewritePlan({ cwd, intent? })` produces `<cwd>/plan/{plan.md, ownership.json, steps.json, meta.json}`. Heuristic ownership classifier maps every imported file to a tier (`leaf | shared | route | shell`); the step generator emits one `rewrite-<slug>` per leaf component, bundles sibling stylesheets, prepends a `tokens-alignment` step when design-extract surfaced literals, marks shared/route touches `medium` risk, and always closes with a `build-test` step. `meta.atomDigest` is over a canonicalised view of `code/index.json` so re-walks that don't change the file roster don't invalidate the plan.
  - **`patch-edit` atom (Phase 7 entry slice).** New `applyPatchForStep({ cwd, stepId, diff })`, `skipStep()`, and `readPlanProgress()`. The applier parses unified-diff text (plain edits, `/dev/null` creation, `/dev/null` deletion, multi-file hunks) and enforces the spec §20.3 safety contract before any byte is written: (a) path-traversal guard, (b) every touched file MUST appear in `step.files[]`, (c) `shell`-tier files require `step.risk='high'`, (d) context lines must match exactly so stale patches surface `context mismatch at line N` without mutating disk. After a successful apply, the runner updates `plan/steps.json[id].status='completed'` and writes `plan/receipts/step-<id>.json` with files / added / removed / rationale.
  - **`diff-review` atom (Phase 7-8 entry slice).** New `runDiffReview({ cwd, decision? })` reads `plan/receipts/` and emits `<cwd>/review/{diff.patch, summary.md, decision.json, meta.json}`. Decision composition rules: `accept` defaults `accepted_files` to every touched file; `reject` defaults `rejected_files` to every touched file; `partial` MUST cover every touched file via the `accepted_files ∪ rejected_files` union or the runner throws `missing <file>` so the GenUI surface can re-prompt. `decision.json` is round-trippable so a re-run without an explicit decision returns the persisted choice.
  - **Earlier in this changeset:**
  - **`build-test` atom (Phase 7 entry slice).** New `runBuildTest({ cwd, buildCommand?, testCommand? })` shells out to typecheck + test commands (overrides win; otherwise inferred from `package.json` scripts). Auto-detects pnpm / yarn / bun / npm from lockfile presence. Per-command timeout default 5 min, log budget 1 MiB. Emits `build.passing` + `tests.passing` signals (newly added to spec §22.4 vocabulary) plus the legacy `critique.score`. `writeBuildTestReport()` persists `critique/build-test.json` + `critique/build-test.log`.
  - **`code-import` atom (Phase 7 entry slice).** New `runCodeImport({ repoPath, cwd })` walks a real repo and writes a normalised `<cwd>/code/index.json` snapshot. Honours a 60 s walk budget; skips `node_modules`, `.git`, `dist`, `build`, `coverage`, etc.; rejects symlinks. Detects framework (next / vite / remix / astro / sveltekit / cra / custom), package manager, style system, and routing model.
  - **`handoff` atom + `ArtifactManifest` provenance fields (Phase 7-8 entry slice).** `ArtifactManifest` gains the spec §11.5.1 reserved fields (`sourcePluginSnapshotId`, `sourcePluginId`, `sourceTaskKind`, `parentArtifactId`, `artifactKind`, `renderKind`, `handoffKind`, `exportTargets[]`, `deployTargets[]`). New `recordHandoff()` helper enforces append-only `exportTargets` / `deployTargets` and monotonic `handoffKind` promotion (`design-only` < `implementation-plan` < `patch` < `deployable-app`). `isDeployableAppEligible()` centralises the §11.5.1 promotion rule (`build.passing` + `tests.passing` + at least one docker / cli export target). Contracts barrel `index.ts` switched to `.js`-suffixed re-exports so daemon NodeNext resolution picks every type up end-to-end.
  - **Bundled scenario plugins (spec §23.3.3).** Four `od.kind: 'scenario'` plugins under `plugins/_official/scenarios/{od-new-generation,od-figma-migration,od-code-migration,od-tune-collab}/` lock the default reference pipeline per `taskKind`. Replacing a default for an enterprise / vertical edition is now a content edit rather than a daemon code change. The bundled boot walker registers them via the existing tier layout.
- **Plugin & marketplace system — earlier landing.** Spec: [`docs/plugins-spec.md`](docs/plugins-spec.md). Living plan: [`docs/plans/plugins-implementation.md`](docs/plans/plugins-implementation.md).
  - **`OD_SNAPSHOT_RETENTION_DAYS` referenced-row TTL (PB2).** `pruneExpiredSnapshots` now retires referenced snapshot rows whose project has been deleted AND whose `applied_at` is older than the configured window. Live-project rows stay pinned forever (reproducibility wins). The GC worker reads `readPluginEnvKnobs().snapshotRetentionDays` so the env-var contract spec PB2 reserved is now end-to-end.
  - **`OD_BUNDLED_ATOM_PROMPTS=1` activates `composeDaemonSystemPrompt`'s atom-block path.** When set AND the run carries an applied snapshot with a non-empty `od.pipeline.stages[*]`, the daemon walks each stage, calls `loadAtomBodies` + `renderActiveStageBlock`, and threads the result as `composeSystemPrompt({ activeStageBlocks })`. Default behaviour (flag unset) is byte-equal to today's prompt.
  - **Phase 6 / 7 / 8 atom SKILL.md substrate.** Nine new `plugins/_official/atoms/<atom>/{SKILL.md, open-design.json}` pairs the bundled boot walker registers on startup: `figma-extract`, `token-map` (Phase 6); `code-import`, `design-extract`, `rewrite-plan`, `patch-edit`, `diff-review`, `build-test` (Phase 7); `handoff` (Phase 8). The fragments teach the agent what each (planned) atom expects so a plugin author who references one of these ids in `od.pipeline.stages[*].atoms[]` sees the canonical fragment without a doctor warning. The matching shell-out implementations stay scheduled per spec §16 Phase 6 / 7 / 8.
- **Plugin & marketplace system — earlier landing.** Spec: [`docs/plugins-spec.md`](docs/plugins-spec.md). Living plan: [`docs/plans/plugins-implementation.md`](docs/plans/plugins-implementation.md).
  - **Per-cloud Helm value overrides.** `tools/pack/helm/open-design/values-{aws,gcp,azure,aliyun,tencent,huawei,self}.yaml` ship the volume + ingress diffs spec §15.5 enumerates. Operators install with `helm install od ./tools/pack/helm/open-design -f values-aws.yaml`.
  - **`composeSystemPrompt({ activeStageBlocks })`.** Both daemon and contracts composers accept a pre-rendered list of `## Active stage` blocks (produced by `renderActiveStageBlock` + `loadAtomBodies`). Substrate slice for the §23.3.2 prompt-fragment migration; the actual call-site wiring stays gated on the next phase so default behaviour is byte-equal to today's prompt.
  - **Plugin-bundled component surface.** `GenUISurfaceRenderer` mounts a `sandbox="allow-scripts"` iframe at `/api/plugins/:id/asset/<path>` when a surface declares `od.genui.surfaces[].component`. Communication is one-way via `postMessage({ kind: 'genui:respond', surfaceId, value })`. The daemon-side asset endpoint serves files from `installed_plugins.fs_path` under the §9.2 preview CSP (`default-src 'none'; connect-src 'none'; frame-ancestors 'self'`) plus `X-Content-Type-Options: nosniff`.
  - **`ProjectStorage` + `DaemonDb` adapter substrate.** New `apps/daemon/src/storage/` module ships the Phase 5 §15.6 interface contracts. `LocalProjectStorage` (v1 default) is fully wired and tested; `S3ProjectStorage` is an interface-locked stub that throws on every op until the AWS SDK wiring lands. `resolveDaemonDbConfig({})` parses `OD_DAEMON_DB` / `OD_PG_*` env vars but the SQLite path remains the only reachable backend in v1.
- **Plugin & marketplace system — earlier landing.** Spec: [`docs/plugins-spec.md`](docs/plugins-spec.md). Living plan: [`docs/plans/plugins-implementation.md`](docs/plans/plugins-implementation.md).
  - **Phase 5 bound-API-token guard.** `startServer()` refuses to bind a non-loopback `OD_BIND_HOST` without `OD_API_TOKEN`; bearer middleware on `/api/*` rejects non-loopback peers without `Authorization: Bearer <OD_API_TOKEN>`. `/api/health`, `/api/version`, `/api/daemon/status` stay open so monitoring probes (kubelet, Compose) work without secrets.
  - **Helm chart templates.** `tools/pack/helm/open-design/templates/` ships Deployment, Service, Secret, ConfigMap, two PVCs, optional Ingress, plus _helpers.tpl + NOTES.txt. The chart installs end-to-end with `helm install od ./tools/pack/helm/open-design --set secrets.apiToken=$(openssl rand -hex 32)`.
  - **`od.genui.surfaces[].component`.** `GenUISurfaceSpecSchema` accepts a `{ path, export?, sandbox? }` field; `genui:custom-component` joins `KNOWN_TOP_LEVEL_CAPABILITIES`; `doctorPlugin()` flags the missing-capability + path-traversal cases. The component path is the v1 substrate for spec §10.3.5 alignment-roadmap row 2; the web sandbox loader stays scheduled.
  - **`.github/workflows/docker-image.yml`.** Multi-arch (linux/amd64 + linux/arm64) build + push to ghcr.io: `:edge` on main, `:<version>` + `:latest` on tag, `:sha-<short>` on every push, smoke build on PRs. Authenticates via GITHUB_TOKEN with `packages:write`.
- **Plugin & marketplace system — earlier landing.** Spec: [`docs/plugins-spec.md`](docs/plugins-spec.md). Living plan: [`docs/plans/plugins-implementation.md`](docs/plans/plugins-implementation.md).
  - **`@open-design/agui-adapter` workspace package + `GET /api/runs/:runId/agui`.** Pure-TS bidirectional bridge between OD's native `PersistedAgentEvent` / `GenUIEvent` / `PluginPipelineStageEvent` union and the [AG-UI canonical event protocol](https://github.com/CopilotKit/CopilotKit). The new SSE endpoint mirrors `/api/runs/:id/events` but pipes every record through `encodeOdEventForAgui` so a CopilotKit / AG-UI client consumes an OD run unmodified. v1 plugins need no change to be consumable inside the AG-UI ecosystem (spec §10.3.5).
  - **`renderActiveStageBlock` + `loadAtomBodies`.** Substrate slice for spec §23.3.2 patch 2: the daemon-side helper reads `<bundled-fsPath>/SKILL.md` for any registered bundled atom and the contracts-side renderer assembles a `## Active stage: <id>` block. The `composeSystemPrompt()` rewiring that consumes them is the next PR; today the helpers are reachable, tested, and the bundled atom plugins from §3.I3 already ship the matching SKILL.md bodies.
  - **Phase 5 Dockerfile + docker-compose + Helm chart entry slice.** `deploy/Dockerfile` now bundles `plugins/_official/` so `registerBundledPlugins()` finds the atom set inside the container. `tools/pack/docker-compose.yml` is the canonical hosted-mode manifest (two-volume layout, OD_API_TOKEN, /api/daemon/status healthcheck). `tools/pack/helm/open-design/` pins the Helm chart parameter surface for the per-cloud value overrides spec §15.5 enumerates; templates land in the Phase 5 follow-up PR.
- **Plugin & marketplace system — earlier landing.** Spec: [`docs/plugins-spec.md`](docs/plugins-spec.md). Living plan: [`docs/plans/plugins-implementation.md`](docs/plans/plugins-implementation.md).
  - **Pipeline runner wired into `POST /api/runs`.** Plugin runs whose snapshot carries `od.pipeline.stages[*]` now emit `pipeline_stage_started` synchronously before the agent process spawns. Subsequent stage events (`pipeline_stage_completed`, per-stage `run_devloop_iterations` audit rows, devloop convergence) fire asynchronously while the agent runs. Stage runner is a converging stub (`critique.score=4`, `preview.ok=true`) so single-pass pipelines walk through every stage in O(stages) time; loop stages still respect `OD_MAX_DEVLOOP_ITERATIONS`. Errors surface as `pipeline_stage_failed` events and never block the agent. **e2e-3** flips from entry-slice to the full §8 contract: `apps/daemon/tests/plugins-headless-run.test.ts` asserts the first SSE event on a pipeline-bearing plugin run is `pipeline_stage_started`.
  - **`od doctor`.** Repo-wide diagnostics: daemon status, installed-plugin doctor sweep, library inventory (skills / design-systems / atoms / craft). Exits 1 when any plugin doctor returns ok=false; exit 64 when the daemon is unreachable.
  - **`od config get/set/list/unset`.** Wraps `GET/PUT /api/app-config`. Top-level keys via positional or `--value`; nested values via `--value-json`.
  - **Phase 4 / §23 entry slice — bundled atom plugins.** New `plugins/_official/atoms/{discovery-question-form,todo-write,direction-picker,critique-theater}/{SKILL.md,open-design.json}` pairs, plus a daemon boot walker (`apps/daemon/src/plugins/bundled.ts`) that registers each folder under `source_kind='bundled'` / `trust='bundled'` on every startup. Idempotent (upserts), ENOENT-silent (works outside the dev tree). Lays the substrate for the §23.3.2 patch that lifts prompt fragments out of `system.ts`.
- **Plugin & marketplace system — Phase 2A + 1 + 1.5 + 2B + 2C entry slice + 3 (full) + 4 (scaffold / export / publish / atoms doc / library CLI) + early 5 (earlier landing).** Spec: [`docs/plugins-spec.md`](docs/plugins-spec.md). Living plan: [`docs/plans/plugins-implementation.md`](docs/plans/plugins-implementation.md).
  - **Phase 4 publish.** `od plugin publish <id> --to anthropics-skills|awesome-agent-skills|clawhub|skills-sh [--repo <github>] [--open]` builds the catalog submission URL + PR body and (with `--open`) auto-launches the system browser. The author still goes through the upstream review flow; OD never POSTs anywhere.
  - **CLI parity remainder.** `od atoms list/show`, `od skills list/show`, `od design-systems list/show`, `od craft list/show`, `od status`, `od version`. New HTTP routes `GET /api/craft` + `GET /api/craft/:id` walk the `craft/` directory and return `{ id, label, bytes }` summaries.
  - **`od marketplace search "<query>" [--tag <tag>]`.** Substring match over every configured marketplace's `plugins[]`; powered entirely by the catalog metadata `od marketplace add` already cached, so a code agent can discover plugins without being inside the desktop UI.
- **Plugin & marketplace system — Phase 2A + 1 + 1.5 + 2B (composer mount + marketplace deep UI) + 2C entry slice + 3 entry slice + 4 (scaffold / export / atoms doc) + early 5 (earlier landing).** Spec: [`docs/plugins-spec.md`](docs/plugins-spec.md). Living plan: [`docs/plans/plugins-implementation.md`](docs/plans/plugins-implementation.md).
  - **Phase 4 author tooling.** `od plugin scaffold --id <id>` writes a starter SKILL.md + open-design.json + README.md (optionally a `.claude-plugin/plugin.json`). `od plugin export <projectId> --as od|claude-plugin|agent-skill --out <dir>` materialises a publish-ready folder from the AppliedPluginSnapshot behind a project (or a snapshot id), so any chat that ran a plugin can be re-published to anthropics/skills, awesome-agent-skills, clawhub, or skills.sh without leaving the terminal. The output's open-design.json carries a provenance block (snapshotId + manifestSourceDigest + appliedAt) that reverse-resolves to the originating run.
  - **Phase 2B marketplace deep UI.** New routes `/marketplace` and `/marketplace/<pluginId>` rendered by `MarketplaceView` (catalog grid + trust filters + configured catalogs panel) and `PluginDetailView` (manifest, capability checklist, connector requirements, declared GenUI surfaces, "Use this plugin" → applyPlugin → Home). `/plugins/<id>` is a parsed alias so the public-site URL scheme reserved in spec §13 already works in-app.
  - **Phase 2B ChatComposer mount.** `ChatComposer` renders `<PluginsSection variant="strip" />` above the input whenever a `projectId` is known. Apply hydrates the draft only when empty so a mid-typing user is never overwritten.
  - **`docs/atoms.md`.** New canonical reference for the first-party atom catalog: implemented vs planned ids, task-kind mapping, how the daemon resolves an atom at run time, the closed `until`-signal vocabulary, and the §22.5 community-plugin → first-party-atom promotion path.
- **Plugin & marketplace system — Phase 2A finished + Phase 1 follow-up + Phase 1.5 + Phase 2B (composer mount) + Phase 2C entry slice + Phase 3 entry slice + early Phase 5 (earlier landing).** Spec: [`docs/plugins-spec.md`](docs/plugins-spec.md). Living plan: [`docs/plans/plugins-implementation.md`](docs/plans/plugins-implementation.md).
  - **CLI canonical agent-facing API (spec §11.7).** Every UI action now has a CLI equivalent: `od project create/list/info/delete`, `od run start/watch/cancel/list/info` (with `--plugin`, `--inputs`, `--grant-caps`, `--snapshot-id`, `--follow`), `od files list/read/write/upload/delete`, `od conversation list/info`. Plugin runs route through the §3.A1 snapshot resolver.
  - **Phase 1.5 headless lifecycle.** New `od daemon start [--headless] [--serve-web] [--port] [--host]`, `od daemon status [--json]`, `od daemon stop`. Backed by new HTTP routes `GET /api/daemon/status` and `POST /api/daemon/shutdown` (loopback-only). The default `od` (no subcommand) keeps its desktop behaviour for back-compat. e2e-3's headless install→project→run loop is now anchored in a daemon supertest (`apps/daemon/tests/plugins-headless-run.test.ts`).
  - **Phase 3 marketplace plugin install resolution.** `POST /api/plugins/install` with a bare plugin name walks every configured `plugin_marketplaces` row in registration order and re-routes to the canonical `github:…` / `https://…` source recorded in the matched manifest. CLI: `od plugin install <name>` works against any catalog the operator added via `od marketplace add <url>`.
  - **Web composer mount.** New `PluginsSection` widget combines `InlinePluginsRail`, `ContextChipStrip`, `PluginInputsForm`, plus `renderPluginBriefTemplate`'s `{{var}}` substitution. Mounted in `NewProjectPanel` below the project-name input as the Phase 2A discovery surface. Purely additive: the existing Send button rules are unchanged.
  - The earlier work in this changelog block remains in place (snapshot resolver, trust mutation, connector tool-token gate, fallback rejection, GitHub tarball + HTTPS install sources, pipeline runner with cross-conversation cache, marketplace registry, snapshot GC worker, web component primitives, definition-of-done suite, …).
- **Plugin & marketplace system — Phase 2A → entry slice of Phase 2B/2C/3 (earlier landing).** Spec: [`docs/plugins-spec.md`](docs/plugins-spec.md). Living plan: [`docs/plans/plugins-implementation.md`](docs/plans/plugins-implementation.md).
  - Snapshot resolver wires `applyPlugin()` into `POST /api/projects` and `POST /api/runs`. Capability gate failures map to HTTP 409 / exit 66; missing inputs map to HTTP 422 / exit 67. The in-memory run object carries `appliedPluginSnapshotId` so connector / replay paths read a frozen view.
  - Trust mutation: new `POST /api/plugins/:id/trust` endpoint plus matching `od plugin trust <id> --capabilities …` CLI. Validates the spec §5.3 capability vocabulary (rejects unknown / malformed strings); preserves the implicit `prompt:inject` floor on revoke.
  - Connector tool-token gate: tokens minted for plugin runs carry `pluginSnapshotId` / `pluginTrust` / `pluginCapabilitiesGranted`. `/api/tools/connectors/execute` re-validates the §5.3 `connector:<id>` rule per call (CONNECTOR_NOT_GRANTED 403 on miss). Trusted plugins implicitly carry `connector:*`; restricted plugins must list each id explicitly.
  - API-fallback rejection: every `/api/proxy/*` entry returns 409 PLUGIN_REQUIRES_DAEMON when a body smuggles `pluginId` / `appliedPluginSnapshotId`.
  - Snapshot GC worker enforces the PB2 `expires_at` TTL (`OD_SNAPSHOT_UNREFERENCED_TTL_DAYS` / `OD_SNAPSHOT_GC_INTERVAL_MS`) at boot + on a periodic interval. Operator escape hatch: `od plugin snapshots prune --before <ts>`.
  - Installer accepts `github:owner/repo[@ref][/subpath]` (codeload tarball) and `https://*.tar.gz` archives in addition to local folders. Hard guards: symlink / hard-link rejection, path-traversal segments, 50 MiB size cap.
  - Pipeline runner emits `pipeline_stage_*` events per stage and persists every iteration into `run_devloop_iterations`. Pre-stage GenUI surfaces auto-derived for not-yet-connected required connectors hit the cross-conversation cache (e2e-5: a second conversation in the same project never re-broadcasts an already-resolved `oauth-prompt`).
  - Marketplace registry minimum verbs: `od marketplace add/list/info/refresh/remove/trust` plus the matching HTTP routes. Default trust tier is `restricted` per spec §9; the Phase 3 follow-up wires `od plugin install <name>` resolution + the trust UI.
  - Web composer surface: `applyPlugin()` state helper, `InlinePluginsRail`, `ContextChipStrip`, `PluginInputsForm`, `GenUISurfaceRenderer` (confirmation + oauth-prompt first-class; form / choice fall back to a JSON Schema preview until Phase 2A.5), `GenUIInbox` drawer.
  - `od plugin run` apply→start shorthand. CLI structured error helper maps recoverable HTTP 4xx envelopes to the §12.4 exit codes (64–73) so code agents get a stable retry contract.
  - Plan §8 e2es covered at the daemon level: e2e-2 (pure apply across runs), e2e-4 (replay invariance after plugin upgrade via `renderPluginBlock(snapshot)`), e2e-5 (GenUI cross-conversation cache), e2e-6 (connector trust gate; re-validated independently in the token-issuance + execute routes), e2e-7 (API-fallback rejection at every proxy entry), e2e-8 (apply purity regression: 100 applies → 0 FS mutation, +100 snapshot rows). e2e-3 (headless run) stays scheduled for Phase 1.5.
- **`ib-pitch-book` skill** — investment-banking strategic-alternatives pitch book (Anthropic financial-services Pitch Agent workflow); ships `example.html` and IB layout references.
## [0.6.0] - 2026-05-09

A connectivity-and-iteration release: Open Design becomes a fully bidirectional MCP citizen (external MCP client with 39 templates), ships **Cloudflare Pages deployment** for generated artifacts (with custom domains), advances Critique Theater to **Phase 6** (interrupt + project-keyed run registry), and lands a redesigned top bar, draggable file tabs, batch delete, **vector PDF export**, **agent-callable research/search**, and **Orbit activity summaries**. Hyperframes learns the HTML-in-Canvas API. New BYOK provider (Ollama Cloud), new agent capabilities (Gemini 3 preview + GPT-5.1 codex picker + DeepSeek v4), new design systems (BMW M, Slack, Cisco, Webex, Mission Control, Urdu Modern), eight new skill bundles, and Turkish + Thai locales. 136 merged PRs since 0.5.0.

### Added

#### MCP, deployment & connectors
- **External MCP client with daemon-managed OAuth and 39 design-focused templates.** Open Design can now consume MCP servers, not just expose itself as one. ([#898])
- **Cloudflare Pages artifact deployment.** One-shot publish of generated artifacts to Pages from the desktop app. ([#729])
- **Cloudflare Pages custom domains.** Bind your own domain to deployed artifacts. ([#851])
- Preserve OAuth state and advertised tool counts when reconnecting MCP/connector providers. ([#1036])
- Optimized Composio connector previews. ([#907])

#### Critique Theater
- **Phase 6.1: critique interrupt endpoint + project-keyed run registry.** Long critiques can now be interrupted cleanly per project. ([#819])
- Shared `CritiqueRoundSummary` / `CritiqueRunStatus` types via the `@open-design/contracts` package. ([#1016])

#### Web / UI
- **Top bar redesign** — Share/Present lifted to the top bar, zoom dropdown, and an explicit focus toggle. ([#1048])
- **Draggable file tab reordering** in the workspace. ([#936])
- **Batch delete for selected design files.** ([#783])
- **Sortable Design Files table columns.** ([#804])
- **Privacy consent choices made explicit** at first launch. ([#1031])
- Differentiated "recent" vs "your designs" sorting. ([#845])
- Inspect / Picker now renders an empty-annotation state instead of a blank panel. ([#1005])
- Toggle to reveal saved media-provider API keys. ([#867])

#### Desktop & artifacts
- **Direct PDF export for artifacts.** ([#532])
- Hyperframes skill learns the **HTML-in-Canvas** API for richer in-canvas previews. ([#852])
- Consolidated Hyperframes video template updates. ([#1079])
- Inspect overlay support on Windows packaged builds. ([#944])
- Allow `od://` URLs through `setWindowOpenHandler` so live-artifact previews open in a child window. ([#933])

#### Daemon, agents & runtime
- **Import existing local folder as a project.** ([#624])
- **Agent-callable research command + `/search`.** Agents can ask the project for grounded research without leaving the chat. ([#615])
- **Orbit activity summaries.** ([#681])
- Finalized the design-package endpoint (closes #450). ([#832])
- Closed pi adapter parity gaps (`imagePaths`, `extraAllowedDirs`, error events, `sendAgentEvent` routing). ([#763])
- Language-boost support for Minimax TTS. ([#773])
- Expose Gemini 3 preview models and Gemini 2.5 Flash Lite in the picker. ([#986])
- Add GPT-5.1 entries to the Codex picker. ([#946])
- Expand Codex picker coverage. ([#757])
- Stable nightly promotion gate for `[codex]`. ([#962])
- `VP_HOME` environment variable support in agent resolution. ([#859])
- Auto-rebuild `better-sqlite3` on Node.js ABI mismatch postinstall. ([#813])
- Increase agent inactivity timeout. ([#1071])
- Reset inactivity watchdog on raw stdout bytes, not just parsed events. ([#976])

#### BYOK & integrations
- **Ollama Cloud** as a BYOK provider. ([#923])
- **Opt-in Langfuse telemetry.** ([#800])
- Make Azure API version optional. ([#941])

#### Skills, design systems & prompt templates
- **`ib-pitch-book` skill** — investment-banking strategic-alternatives pitch book (Anthropic financial-services Pitch Agent port). ([#888])
- **`github-dashboard` skill.** ([#666])
- **`clinical-case-report` skill.** ([#581])
- **`social-media-matrix-tracker` skill** — live-artifact tracker. ([#810])
- **`trading-analysis` live-artifact dashboard skill.** ([#824])
- **`otd-operations-brief` live-artifact template.** ([#794])
- **32 zhangzara HTML deck templates.** ([#704])
- **7 example dashboards + contract demo** for the live-artifact skill. ([#716])
- **`after-hours-editorial` template skill.** ([#1053])
- **`swiss-user-research-video` template skill.** ([#1054])
- **`editorial-burgundy-principles` template skill.** ([#1065])
- **`swiss-creative-mode` template skill.** ([#1068])
- **BMW M design system.** ([#579])
- **Slack design system.** ([#899])
- **Cisco and Webex design systems.** ([#991])
- **Mission Control design system.** ([#858])
- **Urdu Modern (Indus Script) design system.** ([#714])
- Craft `laws-of-ux` module so generated UIs respect working-memory limits. ([#809])
- Craft `typography-hierarchy` and `typography-hierarchy-editorial` rules. ([#975], [#979])

#### Internationalization
- **Turkish README translation.** ([#843])
- **Full Thai (`th`) UI locale.** ([#1018])
- Renamed live-artifact tab label in zh-CN and zh-TW. ([#969])
- Default `id` locale to English for keys not yet translated. ([#822])
- Trim BYOK proxy fallback line from zh-CN intro. ([#915])

#### Packaging & deployment
- **Docker Compose deployment workflow.** ([#65])
- Preserve beta e2e spec reports in R2. ([#812])
- Document the Colima build-swap helper. ([#967])

#### Community
- **Vaunt contributor recognition** (5-tier system). ([#908])

### Changed

- Hardened security scan findings and upgraded dependencies. ([#806])
- Strengthened e2e PR coverage and entry/settings automation coverage. ([#796], [#811])
- Refreshed contributors wall and GitHub metrics. ([#856], [#1004], [#853], [#998])
- Refined `typography-hierarchy` craft docs — clarify edge cases and make lint measurable. ([#979])

### Fixed

#### MCP & connectors
- MCP install snippet survives daemon port changes. ([#846])
- Pin `OD_DATA_DIR` in `/api/mcp/install-info` env so the macOS-packaged MCP server stops EPERM'ing on `.od/projects`. ([#857])
- Reserve clearance for the MCP server Copy button so it stops overlapping the snippet. ([#847])
- Give the MCP server Copy button a solid surface so it reads against the code block. ([#840])
- Stable curated tool count in the connector card badge. ([#767])
- Remove redundant "Connect GitHub" placeholder from the import menu. ([#964])
- Connector "Close window" button always gives feedback. ([#995])
- Confirm before clearing the saved Composio API key. ([#877])
- Keep saved Composio API key indicator visible while typing a replacement. ([#751])
- Confirm before clearing a saved Media provider API key. ([#875])

#### Cloudflare Pages
- Cloudflare Pages custom-domain lookup. ([#958])

#### Web UI
- Surface explicit error/retry state when example preview HTML fails to load. ([#863])
- Confirm before closing a dirty sketch so unsaved strokes are not lost. ([#988])
- Keep chat auto-scroll glued to the bottom across streaming chunks. ([#989])
- Preserve Chat scroll position across Chat/Comments tab switches. ([#841], [#886])
- Differentiate selected, hover, and focus states in the language switcher. ([#987])
- Scroll the active workspace tab into view when the strip overflows. ([#990])
- Keep the Design Files tab visible when workspace tabs scroll. ([#842])
- Wrap long note text inside picker/comment popovers. ([#830])
- Wrap comment-popover action row so the Save/Sending button can't exceed the popover edge. ([#829])
- Prevent comment popover header overflow when the label is too long. ([#833])
- Truncate long Inspect-panel labels so they cannot spill past the panel edge. ([#838])
- Keep Inspect-panel close button on a stable single-line layout. ([#839])
- Increase project meta line-height to prevent descender clipping. ([#834])
- Give the deploy modal primary action more breathing room. ([#992])
- Hide the unsupported "Save comment" button on Pods selections. ([#993])
- Clear stale upload error banner when previewing existing files. ([#994])
- Expand design file row click target. ([#1039])
- Keep entry footer pills compact. ([#1045])
- Hide stale upload error banner when previewing other files. ([#994])
- Scope settings save validation + sanitize payload to the active sidebar section. ([#827])
- Ensure the Settings close button is always clickable. ([#971])
- Correct `srcdoc` injection and deck bridge for JS strings containing closing `</script>`. ([#938])
- Unbreak the Create button on plain HTTP / LAN-IP deployments. ([#900])
- Differentiate recent vs your-designs sorting. ([#845])
- Keep examples filter counts consistent. ([#949])

#### Desktop & packaging
- Cleanly quit the macOS packaged app. ([#422])
- Keep modal controls clickable in drag regions. ([#1032])
- Improve Orbit and packaged data-dir startup errors. ([#1067])
- Fix desktop preview interactions and connector auth feedback. ([#864])
- Fix desktop preview and packaged app interactions. ([#879])
- Fix desktop prompt template close hitbox. ([#1056])
- Pack/win: close detection gaps that let `Open Design.exe` stay locked at install time. ([#823])
- Tools-pack: mark `blake3-wasm` as external in the macOS prebundle. ([#844])
- Packaged: swallow harmless `setTypeOfService EINVAL` from undici. ([#906])

#### Daemon
- Settle completed runs and clean up shutdown children. ([#924])
- Fix stuck chat runs and unintended cancels. ([#896])
- Write SSE events atomically in `createSseResponse.send`. ([#972])
- Media generation task state survives daemon restart (#648). ([#884])
- Sync Orbit last run with the selected prompt template. ([#937])
- Image template creations execute the selected prompt automatically. ([#752])
- Serve Python files as text. ([#947])
- Type-check core server paths and leaf modules. ([#943], [#952])

#### Codex / OpenCode
- OpenCode todowrite footer state. ([#1046])

#### Skills & docs
- Stale internal links across docs. ([#950])

### Documentation

- **Repository-wide code review guidelines.** ([#927])
- **Design system authoring guide.** ([#961])
- **Skills contributing guide.** ([#1035])
- Docker setup instructions in QUICKSTART, CONTRIBUTING, and README. ([#935])
- Re-add `awesome-design-md` reference to QUICKSTART. ([#940])
- Update prompts path from web to daemon in README files. ([#756])

### Internal

- Test: cover model option rendering. ([#948])
- Test: de-flake chat-scroll-preservation across tab switches. ([#886])
- Auto-generated metrics + contributors wall refreshes. ([#853], [#998], [#856], [#1004])
- Release: Open Design 0.5.0 changelog landing. ([#820])

## [0.5.0] - 2026-05-07

A minor release focused on iteration: live-data dashboards graduate to a first-class artifact category, an in-preview Inspect mode lands for per-element style tuning, the desktop launcher gets an accent color theme, Critique Theater advances to Phase 5, and Linux gains headless lifecycle support. New Qoder CLI agent, Nano Banana image provider, and Indonesian locale. 51 merged PRs since 0.4.1, accumulated across 16 beta cycles.

### Added

#### Web / UI
- **Inspect mode** — live per-element style tuning in the HTML preview. ([#362])
- **Accent color control + launcher** — a global accent persists across the desktop launcher and entry view. ([#683])
- **Connection tests for execution settings** — verify provider config without launching a chat. ([#507])
- Replaced the SketchEditor `window.prompt()` text tool with an in-app modal so long prompts stop getting clipped. ([#738])

#### Skills, design systems & prompt templates
- **`live-dashboard` skill** — generic Live Artifact dashboard template. ([#778])
- **`clinic-console` live-artifact template.** ([#795])
- **FlowAI live dashboard template skill.** ([#801])
- **Notion-style team dashboard prompt template (Live Artifact).** ([#799])
- **`waitlist-page` skill.** ([#555])
- **`social-media-dashboard` skill + Totality Festival design system.** ([#678])
- **Five Orbit briefing prompt templates.** ([#671])
- **Craft `form-validation` module** — generated forms follow modern RHF/Zod patterns instead of 2018 Formik habits. ([#625])

#### Critique Theater
- **Phase 5** — panel prompt template + system composer wiring. ([#524])

#### Daemon and agents
- **Qoder CLI** agent adapter. ([#626])
- **Project transcript export to disk** for downstream tools (replay, audit, sharing) — prereq for #450. ([#493])
- Override the Codex executable path for nvm / mise / fnm-installed toolchains. ([#755])
- Codex image projects can use built-in imagegen. ([#622])
- DeepSeek v4 models in the model catalog. ([#722])
- `OD_LEGACY_DATA_DIR` migrator for 0.3.x → 0.4.x data recovery. ([#712])

#### Media generation
- **Nano Banana image provider.** ([#631])
- HyperFrames video previews, provider badge, and source filter on the templates surface. ([#293])

#### Linux & packaging
- **Linux headless lifecycle** — `install` / `start` / `stop` from CLI without a desktop session. ([#686])
- Improved Windows beta packaging and installer flow. ([#768])
- Migrated beta release publishing to R2. ([#805])

#### Internationalization
- **Indonesian (`id`) UI locale.** ([#414])

### Changed

- Project file watcher now ignores `.venv` and other large dirs so Python projects stop overwhelming it. ([#531])
- Daemon CORS whitelist accepts portless `Origin` headers for Chrome compatibility. ([#735])
- Extended OpenAI image request timeouts so larger generations stop being killed mid-flight. ([#788])
- Surfaced the `@nexudotio` X account in README and entry sidebar. ([#696])

### Fixed

#### Daemon and agents
- Delivered Copilot prompts via stdin to avoid Windows `ENAMETOOLONG`. ([#727])
- Surfaced OpenCode error frames; treated empty-output runs as failed instead of silently succeeding. ([#700])
- Discovered toolchain paths for GUI-launched agents on minimal `PATH`. ([#614])

#### Web and desktop
- Removed Tweaks-mode element-selector tooltip noise. ([#697])
- Fixed chat pane overflow. ([#740])
- Narrowed the `ws-tabs-bar` scrollbar so filenames stop overlapping. ([#781])
- Improved settings dialog scroll behavior. ([#667])
- Widened settings subtitle so the English copy fits on one line. ([#747])
- Persisted design system selection across sessions. ([#621])
- Aligned the design system default test fixture. ([#708])
- Showed an alert when the PDF export popup is blocked. ([#664])
- Fixed the Windows link-code-folder dialog. ([#698])
- Made desktop entry chrome consistent. ([#655])

#### Packaging & runtime
- Unbroke Claude Design ZIP import on Node 24 and raised the file ceiling. ([#591])
- Diagnosed missing Next package during `tools-dev` web startup. ([#675])

#### Internationalization
- Aligned `README.es` UI references to the `es-ES.ts` locale. ([#611])
- Fixed Ukrainian prompt template translations and removed duplicate keys. ([#674], [#680])

#### Miscellaneous
- Batched small fixes for [#283], [#275], and [#390]. ([#530])

### Documentation

- Documented the Linux namespace env var in `tools-pack`. ([#670])
- Fixed broken `pi-ai` links after the package split. ([#277])

### Internal

- Added desktop settings + project flow e2e coverage. ([#306])
- CI: notify Discord `#resolved` when issues are closed by a merged PR. ([#685])
- Refreshed generated GitHub metrics SVG and contributors wall. ([#718], [#720])

## [0.4.1] - 2026-05-06

0.4.1 is the startup hotfix for the broken 0.4.0 desktop packages. It restores packaged app startup on macOS and Windows, adds release validation so the failure mode is caught before publication, and includes the small UI, agent, documentation, i18n, and craft updates that landed while the hotfix was being verified.

### Added

#### Web / UI
- **Manual edit mode** for direct artifact edits. ([#620])
- **Cmd/Ctrl+P quick file switcher** for faster project navigation. ([#556])
- Resizable chat panel. ([#563])

#### Daemon and agents
- Added model name to PI initial status and RPC abort on cancel. ([#618])

#### Craft and i18n
- Craft `accessibility-baseline` module with opt-ins for dashboard, HR onboarding, and mobile onboarding. ([#587])
- Craft `rtl-and-bidi` module so artifacts handle Arabic, Hebrew, and Persian content more reliably. ([#595])
- Added i18n structure checks. ([#608])

### Changed

- Updated README first-PR links so `help-wanted` issues are surfaced alongside `good-first-issue`. ([#605])

### Fixed

#### Packaging
- Fixed packaged desktop startup by building `@open-design/contracts` to `dist/*.mjs` + `.d.ts`, pointing its exports at compiled JavaScript, and building contracts before all packaged lanes pack workspace tarballs. ([#577])
- Added packaged runtime beta gating so release candidates install, start, inspect `/api/health`, collect logs, stop, and uninstall before promotion. ([#637])

#### Daemon and agents
- Added the required stdio MCP server env field and recover from `-32602` on `session/set_model`. ([#627])
- Normalized ACP `mcpServers` to the stdio shape for Kimi/Hermes ACP. ([#612])
- Fixed agent CLI configuration and workspace focus mode. ([#604])

#### Web and desktop
- Preserved error messages across conversation reloads. ([#623])
- Kept chat recoverable after conversation load failures. ([#637])
- Honored native macOS quit behavior in the packaged desktop shell. ([#637])

### Documentation

- Documented `OD_DATA_DIR` and migration from `.od/` to the Desktop app. ([#570])
- Added Chinese (Simplified) QUICKSTART. ([#578])
- Backported missing zh-TW README sections from the English README. ([#586])
- Synced and improved the Korean README. ([#619])

### Internal

- Refined release workflows, CI scope, e2e layout, and packaged runtime smoke coverage for beta validation. ([#637])
- Refreshed generated GitHub metrics. ([#592])

## [0.4.0] - 2026-05-05

A multi-protocol leap: Open Design now ships as an MCP server, ships Critique Theater (Design Jury) Phase 4, gains live-reload + Tweaks mode + live artifacts in the preview pane, and adds five new agent / runtime adapters. 71 merged PRs from 40+ contributors over two days. Linux AppImage packaging landed in tooling, but the stable Linux artifact is deferred from 0.4.0 while containerized release packaging is hardened.

### Added

#### MCP & agent integration
- **`od mcp` — expose Open Design as a stdio MCP server.** Coding agents in other repos (Claude Code, Codex, Cursor, VS Code, Antigravity, Zed, Windsurf) can read files from local Open Design projects directly, including the project the user has open in the Open Design app right now. ([#399])
- **Link code folder support for agent context** — point agents at any local code folder alongside the design project. ([#455])
- Kilo CLI (ACP) agent adapter. ([#480])
- DeepSeek TUI agent adapter. ([#439])

#### Critique workflow
- **Critique Theater Phase 4** — persistence, transcript, and orchestrator. The "Design Jury" multi-panelist scoring pipeline is now end-to-end. ([#481])
- Critique Theater foundation — shared contracts and streaming v1 parser (Phases 0–2). ([#387])

#### Preview pane
- **Live-reload preview iframes** when project files change on disk. ([#409])
- **Tweaks mode for HTML previews** — element picker, pod selection, batched chat attachments. ([#513])
- URL-load HTML preview iframes by default (`?forceInline=1` opt-out). ([#384])
- **Live artifacts and Composio connector catalog.** ([#381])

#### Packaging & deployment
- **Linux x64 AppImage tooling** in `tools-pack`; stable release artifact deferred from 0.4.0 while the containerized packaging lane is hardened. ([#369])
- Optimize packaged mac artifact size. ([#424])

#### Daemon
- `OD_MEDIA_CONFIG_DIR` to relocate `media-config.json` (Nix store, immutable images, sandboxes). ([#411])
- Modernized multi-provider API proxy routing (Anthropic, OpenAI-compatible, Azure OpenAI, Google Gemini). ([#385])
- Seed daemon with pre-baked decks and web prototypes. ([#457])

#### Skills, design systems & prompt templates
- **Atelier Zero** editorial collage landing-page design system. ([#366])
- `open-design-landing` rename, **kami skill bundle**, and landing OG assets. ([#428])
- Craft `animation-discipline` module + opt-ins on mobile-app, mobile-onboarding, gamified-app. ([#515])
- Craft `state-coverage` module + opt-ins on dashboard, mobile-app, kanban-board. ([#502])

#### Web / UI
- Skills & design systems management page in Settings. ([#535])

#### Design Files
- Batch ZIP download with multi-select. ([#405])

#### Internationalization
- Complete **French** localization, README, and Quickstart. ([#326], [#397], [#434])
- **Ukrainian** UI localization. ([#395])
- **Russian** UI locale refresh + README + gallery metadata. ([#393], [#396])
- Brazilian Portuguese README translation. ([#460])
- Arabic README translation. ([#458])

### Changed

- Refactor `RUNTIME_DATA_DIR` resolution logic. ([#391])
- Update Codex sandbox invocation. ([#477])

### Fixed

#### Security
- Bind daemon to localhost by default + origin validation. ([#365])
- Strip `ANTHROPIC_API_KEY` when spawning Claude Code. ([#400])
- Preserve `ANTHROPIC_API_KEY` when `ANTHROPIC_BASE_URL` is set. ([#514])
- Preserve `*_API_KEY` env vars for CLI agents in packaged builds. ([#404])
- Normalize daemon proxy origins. ([#392])

#### Daemon
- Resolve daemon `package.json` from any compiled layout so the packaged app reports the correct version. ([#537])
- Correct Claude Code `--add-dir` capability detection. ([#440])
- Handle ACP `-32603` errors gracefully in `session/set_model`. ([#492])
- Expose skill resources via cwd-relative aliases. ([#435])
- Support nested paths in project file serve route. ([#401])
- Respect baseUrl path verbatim in OpenAI-compat proxy. ([#410])

#### Web UI
- Prevent vertical scrollbar on artifact preview frame. ([#453])
- Prevent vertical scrollbar on `ws-tabs-bar`. ([#448])
- Language option button height truncation in Settings. ([#447])
- Aspect-ratio cards no longer overflow into siblings. ([#476])
- Add copy buttons for FileViewer code blocks. ([#471])
- Lowercase `todowrite` compatibility in ToolCard. ([#523])
- Cap `htmlPreviewSlideState` Map to prevent memory leak. ([#488])
- Isolate preview blob export paths. ([#429])
- Split execution-mode tabs and align active chip visuals. ([#418])
- Tighten entry-tab layout and design-system showcase color picker. ([#412])
- Lift coming-soon tip above sticky tabs and make it readable in dark theme. ([#382])
- Fix file tab wheel scrolling. ([#549])

#### Design Files
- Clear selection on project switch. ([#465])

#### Agents
- Copilot prompt processing with correct command format. ([#466])
- Codex Gemini CLI trust handling. ([#352])

#### Desktop
- Show window on macOS dock activate. ([#270])

#### Packaging
- Bundle prompt templates in packaged desktop resources. ([#417])

#### Landing page
- Deploy with `npm wrangler`. ([#421])

### Documentation

- Discord invite badge in README. ([#504])
- Surface desktop downloads in README. ([#522])
- "Running the Project" section in README. ([#468])
- First-PR link points to /contribute page. ([#494])
- Defer README template-driven generation; capture #195 discussion. ([#403])
- Fix typo in zh-TW README. ([#548])
- Auto-generated metrics SVG and contributors wall refresh. ([#406], [#407], [#489], [#490])

### Internal

- Enforce test directory conventions. ([#496])

## [0.3.0] - 2026-05-03

A fast follow-up to 0.2.0 focused on richer design workflows, packaged-agent reliability, export/deploy flows, and broader internationalization. 39 merged PRs from 25 contributors.

### Added

#### Web / UI
- Pet companion with Codex hatch-pet integration. ([#296])
- Brand design-system cards, thumbnails, and DESIGN.md side-by-side preview. ([#289])
- Per-tool renderer registry for generative UI. ([#282])
- Task completion sound and browser notification. ([#359])

#### Agents & daemon
- Persist code-agent startup state. ([#255])
- Mistral Vibe CLI agent adapter. ([#354])
- Devin for Terminal support. ([#301])
- `OD_BIND_HOST` and `--host` for interface binding. ([#328])

#### Skills & exports
- Taste-skill-derived web prototype and HTML PPT examples. ([#358])
- `pptx-html-fidelity-audit` skill wired into export prompts. ([#307])
- Broader PPTX fidelity script coverage beyond CJK. ([#308])
- Native desktop Save As dialog for `.pptx` downloads. ([#330])
- Export as Markdown from the share menu. ([#345])

#### Deployment
- `/api/projects/:id/deploy/preflight` for pre-upload inspection. ([#320])

#### Internationalization
- Arabic (`ar`) UI locale with RTL layout. ([#316])
- French (`fr`) UI locale. ([#376])

### Fixed

#### Agents, packaged runtime & Windows
- Include `nvm` / `fnm` / `mise` agent CLI bins in packaged PATH. ([#364])
- Detect Codex and Gemini CLIs from user toolchain paths. ([#346])
- Upgrade `better-sqlite3` for Node 24 Windows prebuilt support. ([#357])
- Lead Copilot spawn with `-p -` so prompt-via-stdin is consumed. ([#351])
- Drop literal `-` argv from Codex spawn so prompts deliver via stdin pipe alone. ([#342])
- Wrap `cmd.exe` shim invocations to survive `/s /c` quote stripping. ([#339])

#### Web UI & files
- Download as `.zip` now returns the actual project tree. ([#341])
- Keep Design Files view active after deleting a file. ([#329])
- Scroll workspace tabs in place instead of the window. ([#363])
- Treat inlined script content as literal in FileViewer. ([#343])
- Use response-order matching for bulk upload aggregation. ([#323])
- Serve `.jsx` / `.tsx` with JS-family MIME types so browser loaders accept them. ([#340])
- Fix macOS entry view drag region. ([#373])

#### Daemon & deployment
- Increase project upload limit from 20MB to 200MB. ([#319])
- Bundle and rewrite assets referenced from inline `<style>` blocks and `style=""` attributes. ([#314])

#### Internationalization
- Update locale coverage after main merge. ([#251])
- Add missing `designFiles.showMore` keys to `ar`, `hu`, `ko`, `pl`, and `tr`. ([#335])

### Documentation

- Japanese documentation update. ([#309])
- README contributors wall refresh. ([#360])
- Spelling fixes in CLI comments, spec, and video prompt docs. ([#300])

## [0.2.0] - 2026-05-02

A feature-heavy follow-up to 0.1.0 — dark mode, xAI Grok Imagine media generation, headless deploy mode, OpenClaude fallback, four new locales, and a much richer skill / design-system / prompt-template catalog. 45 merged PRs from 27 contributors.

### Added

#### Web / UI
- Dark mode with system / light / dark toggle. ([#259])
- Visible conversation timestamps. ([#120])
- React artifact output support. ([#121])
- Preview comment attachments. ([#284])

#### Agents & daemon
- Auto-detect OpenClaude as a fallback for Claude Code. ([#263])
- Standardize agent communication via stdin and remove Windows-specific shims. ([#258])

#### Media generation
- xAI Grok Imagine integration covering image, video, and native audio. ([#276])

#### Skills, design systems & prompt templates
- `kami` editorial paper design system with deck starter. ([#226])
- `html-ppt` skill (lewislulu/html-ppt-skill) with 15 per-template Examples cards. ([#193])
- `design-brief` skill with structured I-Lang input format. ([#184])
- Brand-agnostic craft references and Refero-derived lint rules. ([#225])
- 11 HyperFrames video prompt templates and media generation README section. ([#227])
- Three Kingdoms ARPG Seedance 2.0 video templates (3). ([#212])
- Three Kingdoms ARPG gameplay screenshot templates (3). ([#207])
- Otaku-dance choreography breakdown infographic template. ([#209])
- Anime fighting game screenshot template. ([#208])

#### Deployment & tooling
- `--prod` flag and `OD_HOST` for headless server deployment in `tools-dev`. ([#222])
- GitHub CI workflow. ([#271])
- Daemon `kindFor` / `mimeFor` file classifier tests. ([#269])

#### Internationalization
- Hungarian (`hu`) UI locale. ([#288])
- Polish (`pl`) UI locale. ([#273])
- Korean (`ko`) UI locale. ([#253])
- Turkish (`tr`) UI locale. ([#233])

### Changed

- Image / video projects now pick from prompt templates (not design systems). ([#192])
- Optimize Electron release artifact size. ([#249])

### Fixed

#### Daemon
- Restore `startServer` Promise contract — return `url` / `{ url, server }`. ([#268])
- Emit `tool_use` from `tool_execution_start` in pi-rpc. ([#186])
- Clamp Codex reasoning effort to model-supported values. ([#223])
- Deliver Claude Code prompt via stdin to avoid spawn `E2BIG` / `ENAMETOOLONG`. ([#143])
- Include `package.json` in tarball so packaged app reports correct version. ([#260])
- Treat `.py` files as previewable code in Design Files. ([#261])
- `OD_DAEMON_URL` uses port 0 instead of actual allocated port (now reports the real port). ([#240])
- Quote agent bin path when spawning with `shell:true` on Windows. ([#232])
- Make `max_tokens` configurable. ([#78])

#### Web UI
- Suppress hydration warning on `<body>`. ([#248])
- Fix language dropdown overflow in Settings modal. ([#281], [#287])
- Add scroll to Settings language menu when it overflows view. ([#247])
- Preserve deck preview pagination per file. ([#119])
- Fix deck preview pagination controls. ([#112])

#### Cross-platform
- Use junction instead of dir symlink on Windows in `tools-dev`. ([#231])

#### Internationalization
- Replace hardcoded `Claude` with `助手` in zh-TW assistant role copy. ([#262])

### Documentation

- Traditional Chinese (繁體中文) README. ([#194])

### Internal

- Auto-generated metrics SVG updates. ([#228], [#241])
- Fix metrics workflow protected branch updates. ([#219])

## [0.1.0] - 2026-05-01

First public release of Open Design — a local-first, open-source alternative to Anthropic's Claude Design. It detects your installed code-agent CLI, runs design skills against curated design systems, and streams artifacts into a sandboxed in-app preview.

### Added

#### Agent runtimes & providers
- Multi-agent runtime detection and dispatch: Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen, GitHub Copilot CLI, Hermes, Kimi CLI, Pi, and Kiro. ([#28], [#71], [#117], [#185])
- Per-CLI model picker for local agents. ([#14])
- OpenAI-compatible provider support and Anthropic-compatible stream proxy for non-native providers. ([#80], [#180])
- App version awareness shared across daemon and web. ([#204])

#### Skills, design systems & prompt templates
- 72 brand-grade design systems and 31 composable skills, including Xiaohongshu and Replit Deck (8 themes). ([#24], [#74])
- 57 DESIGN.md specs imported from awesome-design-skills. ([#92])
- Dance storyboard and ancient-China MMO HUD prompt templates. ([#187])

#### Artifacts & preview
- Artifact platform foundation with sandboxed in-app preview. ([#68])
- First-class SVG and Markdown artifact renderers / viewer. ([#73], [#177])
- HTML preview support for relative-asset references. ([#156])
- Document preview support for uploaded files and multi-file design uploads. ([#31], [#63])
- Claude Design `.zip` import. ([#46])
- Image / video / audio media surfaces with unified `od media generate` dispatcher. ([#12])

#### Packaging & deployment
- Mac arm64 packaged runtime with signed/notarized DMG + update ZIP and beta release flow. ([#170])
- Windows x64 NSIS installer (unsigned beta) and release assets. ([#191])
- Vercel self-deploy flow with `vercel.json` configuration. ([#167], [#169])

#### Internationalization
- UI locales: zh-CN, zh-TW, en, ja, de, es-ES, ru, fa, pt-BR. ([#79], [#80], [#155], [#159], [#182], [#190], [#197])
- Improved language switcher UI. ([#107])

#### Developer experience & tools
- `tools-dev` / `tools-pack` workspace tooling for development and packaging, with native addon diagnostics and improved web startup flow. ([#127], [#128], [#153])
- `dev:all` auto-switches to a free port when defaults are busy. ([#9])
- UI end-to-end automation suite and reporting under `apps/e2e`. ([#64], [#102])
- Frontend toolchain migrated from Vite to Next.js 16 App Router. ([#66])
- Project code migrated to TypeScript with shared contracts. ([#118])
- Refreshed desktop integration control plane. ([#123])
- Star-us prompt to surface GitHub repo. ([#5])

### Fixed

#### Stability & reliability
- Chat runs survive web reconnects. ([#146])
- Daemon project-root resolution when launched from src via tsx. ([#162])
- SSE keepalive behind nginx. ([#111])
- Standalone pnpm binary supported in postinstall; install toolchain pinned. ([#35], [#151])
- Surface unfinished todo runs in chat. ([#76])

#### Cross-platform / Windows
- Spawn agents via resolved absolute path on Windows. ([#13])
- Deliver prompts via stdin for non-Claude agents to avoid `spawn ENAMETOOLONG`. ([#15])
- Mitigate Windows `ENAMETOOLONG` and fix daemon crash on cleanup. ([#75])
- Fix `PROMPT_TEMP_FILE()` call and Claude Code stdin delivery on Windows. ([#97])
- Normalize web dev tsconfig paths on Windows for `tools-dev`. ([#174])
- Support Claude Code CLI <1.0.86 (avoid `--include-partial-messages`, parse assistant wrapper text). ([#34])

#### Daemon & providers
- CORS header on raw project file endpoint. ([#140])
- Preserve non-ASCII filenames on multipart upload. ([#166])
- Stop passing literal dash to `cursor-agent`. ([#160])
- Non-interactive permissions for agent CLIs in web UI. ([#26])
- Codex plugin disable env. ([#133])
- Codex assistant agent labels. ([#70])

#### Web UI
- Welcome dialog: stop overwriting user's agent pick on Save. ([#4])
- Allow Claude Code to read skill seeds and design-system specs. ([#7])
- Question form checkbox selection limits enforced. ([#81])
- SettingsDialog content overflow + scrolling, refactored layout and modal styling. ([#83], [#88])
- Duplicate `H.` heading in `discovery.ts` (→ `I.`). ([#87])
- guizang-ppt: sync host slide counter on transform-paginated decks. ([#19])
- Toolbar button text wrapping prevented for CJK languages. ([#178])
- PreviewModal exits fullscreen on first Esc. ([#168])
- Dev indicator moved to bottom-right corner. ([#108])
- Design Files: align upload picker with dropzone, neutral agent copy, remove unsupported Figma copy. ([#199], [#200], [#201])
- Web locale registry test includes Japanese. ([#202])

### Documentation

- README refresh with stats, agents, skills, and metrics workflow. ([#173])
- Korean (한국어) and Japanese README and docs translations. ([#105], [#183])
- `TRANSLATIONS.md` i18n contribution guide. ([#196])
- Refresh environment setup guidance. ([#104])
- Xiaohongshu design-system docs review feedback. ([#54])

### Internal

- Initial project structure, project rename "Open Claude Design" → "Open Design", naming optimization. ([#1], [#2])
- Initial AGENTS.md and OpenCode agent instructions. ([#114])
- Beta release workflow placeholder. ([#36])
- Git commit co-author policy. ([#131])

[Unreleased]: https://github.com/nexu-io/open-design/compare/open-design-v0.7.0...HEAD
[0.7.0]: https://github.com/nexu-io/open-design/releases/tag/open-design-v0.7.0
[0.6.0]: https://github.com/nexu-io/open-design/releases/tag/open-design-v0.6.0
[0.5.0]: https://github.com/nexu-io/open-design/releases/tag/open-design-v0.5.0
[0.4.1]: https://github.com/nexu-io/open-design/releases/tag/open-design-v0.4.1
[0.4.0]: https://github.com/nexu-io/open-design/releases/tag/open-design-v0.4.0
[0.3.0]: https://github.com/nexu-io/open-design/releases/tag/open-design-v0.3.0
[0.2.0]: https://github.com/nexu-io/open-design/releases/tag/open-design-v0.2.0
[0.1.0]: https://github.com/nexu-io/open-design/releases/tag/open-design-v0.1.0

[#1]: https://github.com/nexu-io/open-design/pull/1
[#2]: https://github.com/nexu-io/open-design/pull/2
[#4]: https://github.com/nexu-io/open-design/pull/4
[#5]: https://github.com/nexu-io/open-design/pull/5
[#7]: https://github.com/nexu-io/open-design/pull/7
[#9]: https://github.com/nexu-io/open-design/pull/9
[#12]: https://github.com/nexu-io/open-design/pull/12
[#13]: https://github.com/nexu-io/open-design/pull/13
[#14]: https://github.com/nexu-io/open-design/pull/14
[#15]: https://github.com/nexu-io/open-design/pull/15
[#19]: https://github.com/nexu-io/open-design/pull/19
[#24]: https://github.com/nexu-io/open-design/pull/24
[#26]: https://github.com/nexu-io/open-design/pull/26
[#28]: https://github.com/nexu-io/open-design/pull/28
[#31]: https://github.com/nexu-io/open-design/pull/31
[#34]: https://github.com/nexu-io/open-design/pull/34
[#35]: https://github.com/nexu-io/open-design/pull/35
[#36]: https://github.com/nexu-io/open-design/pull/36
[#46]: https://github.com/nexu-io/open-design/pull/46
[#54]: https://github.com/nexu-io/open-design/pull/54
[#63]: https://github.com/nexu-io/open-design/pull/63
[#64]: https://github.com/nexu-io/open-design/pull/64
[#66]: https://github.com/nexu-io/open-design/pull/66
[#68]: https://github.com/nexu-io/open-design/pull/68
[#70]: https://github.com/nexu-io/open-design/pull/70
[#71]: https://github.com/nexu-io/open-design/pull/71
[#73]: https://github.com/nexu-io/open-design/pull/73
[#74]: https://github.com/nexu-io/open-design/pull/74
[#75]: https://github.com/nexu-io/open-design/pull/75
[#76]: https://github.com/nexu-io/open-design/pull/76
[#79]: https://github.com/nexu-io/open-design/pull/79
[#80]: https://github.com/nexu-io/open-design/pull/80
[#81]: https://github.com/nexu-io/open-design/pull/81
[#83]: https://github.com/nexu-io/open-design/pull/83
[#87]: https://github.com/nexu-io/open-design/pull/87
[#88]: https://github.com/nexu-io/open-design/pull/88
[#92]: https://github.com/nexu-io/open-design/pull/92
[#97]: https://github.com/nexu-io/open-design/pull/97
[#102]: https://github.com/nexu-io/open-design/pull/102
[#104]: https://github.com/nexu-io/open-design/pull/104
[#105]: https://github.com/nexu-io/open-design/pull/105
[#107]: https://github.com/nexu-io/open-design/pull/107
[#108]: https://github.com/nexu-io/open-design/pull/108
[#111]: https://github.com/nexu-io/open-design/pull/111
[#114]: https://github.com/nexu-io/open-design/pull/114
[#117]: https://github.com/nexu-io/open-design/pull/117
[#118]: https://github.com/nexu-io/open-design/pull/118
[#123]: https://github.com/nexu-io/open-design/pull/123
[#127]: https://github.com/nexu-io/open-design/pull/127
[#128]: https://github.com/nexu-io/open-design/pull/128
[#131]: https://github.com/nexu-io/open-design/pull/131
[#133]: https://github.com/nexu-io/open-design/pull/133
[#140]: https://github.com/nexu-io/open-design/pull/140
[#146]: https://github.com/nexu-io/open-design/pull/146
[#151]: https://github.com/nexu-io/open-design/pull/151
[#153]: https://github.com/nexu-io/open-design/pull/153
[#155]: https://github.com/nexu-io/open-design/pull/155
[#156]: https://github.com/nexu-io/open-design/pull/156
[#159]: https://github.com/nexu-io/open-design/pull/159
[#160]: https://github.com/nexu-io/open-design/pull/160
[#162]: https://github.com/nexu-io/open-design/pull/162
[#166]: https://github.com/nexu-io/open-design/pull/166
[#167]: https://github.com/nexu-io/open-design/pull/167
[#168]: https://github.com/nexu-io/open-design/pull/168
[#169]: https://github.com/nexu-io/open-design/pull/169
[#170]: https://github.com/nexu-io/open-design/pull/170
[#173]: https://github.com/nexu-io/open-design/pull/173
[#174]: https://github.com/nexu-io/open-design/pull/174
[#177]: https://github.com/nexu-io/open-design/pull/177
[#178]: https://github.com/nexu-io/open-design/pull/178
[#180]: https://github.com/nexu-io/open-design/pull/180
[#182]: https://github.com/nexu-io/open-design/pull/182
[#183]: https://github.com/nexu-io/open-design/pull/183
[#185]: https://github.com/nexu-io/open-design/pull/185
[#187]: https://github.com/nexu-io/open-design/pull/187
[#190]: https://github.com/nexu-io/open-design/pull/190
[#191]: https://github.com/nexu-io/open-design/pull/191
[#196]: https://github.com/nexu-io/open-design/pull/196
[#197]: https://github.com/nexu-io/open-design/pull/197
[#199]: https://github.com/nexu-io/open-design/pull/199
[#200]: https://github.com/nexu-io/open-design/pull/200
[#201]: https://github.com/nexu-io/open-design/pull/201
[#202]: https://github.com/nexu-io/open-design/pull/202
[#204]: https://github.com/nexu-io/open-design/pull/204
[#78]: https://github.com/nexu-io/open-design/pull/78
[#112]: https://github.com/nexu-io/open-design/pull/112
[#119]: https://github.com/nexu-io/open-design/pull/119
[#120]: https://github.com/nexu-io/open-design/pull/120
[#121]: https://github.com/nexu-io/open-design/pull/121
[#143]: https://github.com/nexu-io/open-design/pull/143
[#184]: https://github.com/nexu-io/open-design/pull/184
[#186]: https://github.com/nexu-io/open-design/pull/186
[#192]: https://github.com/nexu-io/open-design/pull/192
[#193]: https://github.com/nexu-io/open-design/pull/193
[#194]: https://github.com/nexu-io/open-design/pull/194
[#207]: https://github.com/nexu-io/open-design/pull/207
[#208]: https://github.com/nexu-io/open-design/pull/208
[#209]: https://github.com/nexu-io/open-design/pull/209
[#212]: https://github.com/nexu-io/open-design/pull/212
[#219]: https://github.com/nexu-io/open-design/pull/219
[#222]: https://github.com/nexu-io/open-design/pull/222
[#223]: https://github.com/nexu-io/open-design/pull/223
[#225]: https://github.com/nexu-io/open-design/pull/225
[#226]: https://github.com/nexu-io/open-design/pull/226
[#227]: https://github.com/nexu-io/open-design/pull/227
[#228]: https://github.com/nexu-io/open-design/pull/228
[#231]: https://github.com/nexu-io/open-design/pull/231
[#232]: https://github.com/nexu-io/open-design/pull/232
[#233]: https://github.com/nexu-io/open-design/pull/233
[#240]: https://github.com/nexu-io/open-design/pull/240
[#241]: https://github.com/nexu-io/open-design/pull/241
[#247]: https://github.com/nexu-io/open-design/pull/247
[#248]: https://github.com/nexu-io/open-design/pull/248
[#249]: https://github.com/nexu-io/open-design/pull/249
[#253]: https://github.com/nexu-io/open-design/pull/253
[#258]: https://github.com/nexu-io/open-design/pull/258
[#259]: https://github.com/nexu-io/open-design/pull/259
[#260]: https://github.com/nexu-io/open-design/pull/260
[#261]: https://github.com/nexu-io/open-design/pull/261
[#262]: https://github.com/nexu-io/open-design/pull/262
[#263]: https://github.com/nexu-io/open-design/pull/263
[#268]: https://github.com/nexu-io/open-design/pull/268
[#269]: https://github.com/nexu-io/open-design/pull/269
[#271]: https://github.com/nexu-io/open-design/pull/271
[#273]: https://github.com/nexu-io/open-design/pull/273
[#276]: https://github.com/nexu-io/open-design/pull/276
[#281]: https://github.com/nexu-io/open-design/pull/281
[#284]: https://github.com/nexu-io/open-design/pull/284
[#287]: https://github.com/nexu-io/open-design/pull/287
[#288]: https://github.com/nexu-io/open-design/pull/288
[#250]: https://github.com/nexu-io/open-design/pull/250
[#251]: https://github.com/nexu-io/open-design/pull/251
[#255]: https://github.com/nexu-io/open-design/pull/255
[#301]: https://github.com/nexu-io/open-design/pull/301
[#307]: https://github.com/nexu-io/open-design/pull/307
[#308]: https://github.com/nexu-io/open-design/pull/308
[#314]: https://github.com/nexu-io/open-design/pull/314
[#316]: https://github.com/nexu-io/open-design/pull/316
[#319]: https://github.com/nexu-io/open-design/pull/319
[#320]: https://github.com/nexu-io/open-design/pull/320
[#323]: https://github.com/nexu-io/open-design/pull/323
[#328]: https://github.com/nexu-io/open-design/pull/328
[#329]: https://github.com/nexu-io/open-design/pull/329
[#330]: https://github.com/nexu-io/open-design/pull/330
[#335]: https://github.com/nexu-io/open-design/pull/335
[#339]: https://github.com/nexu-io/open-design/pull/339
[#340]: https://github.com/nexu-io/open-design/pull/340
[#341]: https://github.com/nexu-io/open-design/pull/341
[#342]: https://github.com/nexu-io/open-design/pull/342
[#343]: https://github.com/nexu-io/open-design/pull/343
[#345]: https://github.com/nexu-io/open-design/pull/345
[#346]: https://github.com/nexu-io/open-design/pull/346
[#351]: https://github.com/nexu-io/open-design/pull/351
[#354]: https://github.com/nexu-io/open-design/pull/354
[#357]: https://github.com/nexu-io/open-design/pull/357
[#358]: https://github.com/nexu-io/open-design/pull/358
[#359]: https://github.com/nexu-io/open-design/pull/359
[#360]: https://github.com/nexu-io/open-design/pull/360
[#363]: https://github.com/nexu-io/open-design/pull/363
[#364]: https://github.com/nexu-io/open-design/pull/364
[#373]: https://github.com/nexu-io/open-design/pull/373
[#376]: https://github.com/nexu-io/open-design/pull/376
[#282]: https://github.com/nexu-io/open-design/pull/282
[#289]: https://github.com/nexu-io/open-design/pull/289
[#296]: https://github.com/nexu-io/open-design/pull/296
[#300]: https://github.com/nexu-io/open-design/pull/300
[#309]: https://github.com/nexu-io/open-design/pull/309
[#270]: https://github.com/nexu-io/open-design/pull/270
[#326]: https://github.com/nexu-io/open-design/pull/326
[#352]: https://github.com/nexu-io/open-design/pull/352
[#365]: https://github.com/nexu-io/open-design/pull/365
[#366]: https://github.com/nexu-io/open-design/pull/366
[#369]: https://github.com/nexu-io/open-design/pull/369
[#381]: https://github.com/nexu-io/open-design/pull/381
[#382]: https://github.com/nexu-io/open-design/pull/382
[#384]: https://github.com/nexu-io/open-design/pull/384
[#385]: https://github.com/nexu-io/open-design/pull/385
[#387]: https://github.com/nexu-io/open-design/pull/387
[#391]: https://github.com/nexu-io/open-design/pull/391
[#392]: https://github.com/nexu-io/open-design/pull/392
[#393]: https://github.com/nexu-io/open-design/pull/393
[#395]: https://github.com/nexu-io/open-design/pull/395
[#396]: https://github.com/nexu-io/open-design/pull/396
[#397]: https://github.com/nexu-io/open-design/pull/397
[#399]: https://github.com/nexu-io/open-design/pull/399
[#400]: https://github.com/nexu-io/open-design/pull/400
[#401]: https://github.com/nexu-io/open-design/pull/401
[#403]: https://github.com/nexu-io/open-design/pull/403
[#404]: https://github.com/nexu-io/open-design/pull/404
[#405]: https://github.com/nexu-io/open-design/pull/405
[#406]: https://github.com/nexu-io/open-design/pull/406
[#407]: https://github.com/nexu-io/open-design/pull/407
[#409]: https://github.com/nexu-io/open-design/pull/409
[#410]: https://github.com/nexu-io/open-design/pull/410
[#411]: https://github.com/nexu-io/open-design/pull/411
[#412]: https://github.com/nexu-io/open-design/pull/412
[#417]: https://github.com/nexu-io/open-design/pull/417
[#418]: https://github.com/nexu-io/open-design/pull/418
[#421]: https://github.com/nexu-io/open-design/pull/421
[#424]: https://github.com/nexu-io/open-design/pull/424
[#428]: https://github.com/nexu-io/open-design/pull/428
[#429]: https://github.com/nexu-io/open-design/pull/429
[#434]: https://github.com/nexu-io/open-design/pull/434
[#435]: https://github.com/nexu-io/open-design/pull/435
[#439]: https://github.com/nexu-io/open-design/pull/439
[#440]: https://github.com/nexu-io/open-design/pull/440
[#447]: https://github.com/nexu-io/open-design/pull/447
[#448]: https://github.com/nexu-io/open-design/pull/448
[#453]: https://github.com/nexu-io/open-design/pull/453
[#455]: https://github.com/nexu-io/open-design/pull/455
[#457]: https://github.com/nexu-io/open-design/pull/457
[#458]: https://github.com/nexu-io/open-design/pull/458
[#460]: https://github.com/nexu-io/open-design/pull/460
[#465]: https://github.com/nexu-io/open-design/pull/465
[#466]: https://github.com/nexu-io/open-design/pull/466
[#468]: https://github.com/nexu-io/open-design/pull/468
[#471]: https://github.com/nexu-io/open-design/pull/471
[#476]: https://github.com/nexu-io/open-design/pull/476
[#477]: https://github.com/nexu-io/open-design/pull/477
[#480]: https://github.com/nexu-io/open-design/pull/480
[#481]: https://github.com/nexu-io/open-design/pull/481
[#488]: https://github.com/nexu-io/open-design/pull/488
[#489]: https://github.com/nexu-io/open-design/pull/489
[#490]: https://github.com/nexu-io/open-design/pull/490
[#492]: https://github.com/nexu-io/open-design/pull/492
[#494]: https://github.com/nexu-io/open-design/pull/494
[#496]: https://github.com/nexu-io/open-design/pull/496
[#502]: https://github.com/nexu-io/open-design/pull/502
[#504]: https://github.com/nexu-io/open-design/pull/504
[#513]: https://github.com/nexu-io/open-design/pull/513
[#514]: https://github.com/nexu-io/open-design/pull/514
[#515]: https://github.com/nexu-io/open-design/pull/515
[#522]: https://github.com/nexu-io/open-design/pull/522
[#523]: https://github.com/nexu-io/open-design/pull/523
[#537]: https://github.com/nexu-io/open-design/pull/537
[#535]: https://github.com/nexu-io/open-design/pull/535
[#548]: https://github.com/nexu-io/open-design/pull/548
[#549]: https://github.com/nexu-io/open-design/pull/549
[#556]: https://github.com/nexu-io/open-design/pull/556
[#563]: https://github.com/nexu-io/open-design/pull/563
[#570]: https://github.com/nexu-io/open-design/pull/570
[#577]: https://github.com/nexu-io/open-design/pull/577
[#578]: https://github.com/nexu-io/open-design/pull/578
[#586]: https://github.com/nexu-io/open-design/pull/586
[#587]: https://github.com/nexu-io/open-design/pull/587
[#592]: https://github.com/nexu-io/open-design/pull/592
[#595]: https://github.com/nexu-io/open-design/pull/595
[#604]: https://github.com/nexu-io/open-design/pull/604
[#605]: https://github.com/nexu-io/open-design/pull/605
[#608]: https://github.com/nexu-io/open-design/pull/608
[#612]: https://github.com/nexu-io/open-design/pull/612
[#618]: https://github.com/nexu-io/open-design/pull/618
[#619]: https://github.com/nexu-io/open-design/pull/619
[#620]: https://github.com/nexu-io/open-design/pull/620
[#623]: https://github.com/nexu-io/open-design/pull/623
[#627]: https://github.com/nexu-io/open-design/pull/627
[#637]: https://github.com/nexu-io/open-design/pull/637
[#275]: https://github.com/nexu-io/open-design/pull/275
[#277]: https://github.com/nexu-io/open-design/pull/277
[#283]: https://github.com/nexu-io/open-design/pull/283
[#293]: https://github.com/nexu-io/open-design/pull/293
[#306]: https://github.com/nexu-io/open-design/pull/306
[#362]: https://github.com/nexu-io/open-design/pull/362
[#390]: https://github.com/nexu-io/open-design/pull/390
[#414]: https://github.com/nexu-io/open-design/pull/414
[#493]: https://github.com/nexu-io/open-design/pull/493
[#507]: https://github.com/nexu-io/open-design/pull/507
[#524]: https://github.com/nexu-io/open-design/pull/524
[#530]: https://github.com/nexu-io/open-design/pull/530
[#531]: https://github.com/nexu-io/open-design/pull/531
[#555]: https://github.com/nexu-io/open-design/pull/555
[#591]: https://github.com/nexu-io/open-design/pull/591
[#611]: https://github.com/nexu-io/open-design/pull/611
[#614]: https://github.com/nexu-io/open-design/pull/614
[#621]: https://github.com/nexu-io/open-design/pull/621
[#622]: https://github.com/nexu-io/open-design/pull/622
[#625]: https://github.com/nexu-io/open-design/pull/625
[#626]: https://github.com/nexu-io/open-design/pull/626
[#631]: https://github.com/nexu-io/open-design/pull/631
[#655]: https://github.com/nexu-io/open-design/pull/655
[#664]: https://github.com/nexu-io/open-design/pull/664
[#667]: https://github.com/nexu-io/open-design/pull/667
[#670]: https://github.com/nexu-io/open-design/pull/670
[#671]: https://github.com/nexu-io/open-design/pull/671
[#674]: https://github.com/nexu-io/open-design/pull/674
[#675]: https://github.com/nexu-io/open-design/pull/675
[#678]: https://github.com/nexu-io/open-design/pull/678
[#680]: https://github.com/nexu-io/open-design/pull/680
[#683]: https://github.com/nexu-io/open-design/pull/683
[#685]: https://github.com/nexu-io/open-design/pull/685
[#686]: https://github.com/nexu-io/open-design/pull/686
[#696]: https://github.com/nexu-io/open-design/pull/696
[#697]: https://github.com/nexu-io/open-design/pull/697
[#698]: https://github.com/nexu-io/open-design/pull/698
[#700]: https://github.com/nexu-io/open-design/pull/700
[#708]: https://github.com/nexu-io/open-design/pull/708
[#712]: https://github.com/nexu-io/open-design/pull/712
[#718]: https://github.com/nexu-io/open-design/pull/718
[#720]: https://github.com/nexu-io/open-design/pull/720
[#722]: https://github.com/nexu-io/open-design/pull/722
[#727]: https://github.com/nexu-io/open-design/pull/727
[#735]: https://github.com/nexu-io/open-design/pull/735
[#738]: https://github.com/nexu-io/open-design/pull/738
[#740]: https://github.com/nexu-io/open-design/pull/740
[#747]: https://github.com/nexu-io/open-design/pull/747
[#755]: https://github.com/nexu-io/open-design/pull/755
[#768]: https://github.com/nexu-io/open-design/pull/768
[#778]: https://github.com/nexu-io/open-design/pull/778
[#781]: https://github.com/nexu-io/open-design/pull/781
[#788]: https://github.com/nexu-io/open-design/pull/788
[#795]: https://github.com/nexu-io/open-design/pull/795
[#799]: https://github.com/nexu-io/open-design/pull/799
[#801]: https://github.com/nexu-io/open-design/pull/801
[#805]: https://github.com/nexu-io/open-design/pull/805
[#65]: https://github.com/nexu-io/open-design/pull/65
[#422]: https://github.com/nexu-io/open-design/pull/422
[#532]: https://github.com/nexu-io/open-design/pull/532
[#579]: https://github.com/nexu-io/open-design/pull/579
[#581]: https://github.com/nexu-io/open-design/pull/581
[#615]: https://github.com/nexu-io/open-design/pull/615
[#624]: https://github.com/nexu-io/open-design/pull/624
[#666]: https://github.com/nexu-io/open-design/pull/666
[#681]: https://github.com/nexu-io/open-design/pull/681
[#704]: https://github.com/nexu-io/open-design/pull/704
[#714]: https://github.com/nexu-io/open-design/pull/714
[#716]: https://github.com/nexu-io/open-design/pull/716
[#729]: https://github.com/nexu-io/open-design/pull/729
[#751]: https://github.com/nexu-io/open-design/pull/751
[#752]: https://github.com/nexu-io/open-design/pull/752
[#756]: https://github.com/nexu-io/open-design/pull/756
[#757]: https://github.com/nexu-io/open-design/pull/757
[#763]: https://github.com/nexu-io/open-design/pull/763
[#767]: https://github.com/nexu-io/open-design/pull/767
[#771]: https://github.com/nexu-io/open-design/pull/771
[#773]: https://github.com/nexu-io/open-design/pull/773
[#794]: https://github.com/nexu-io/open-design/pull/794
[#796]: https://github.com/nexu-io/open-design/pull/796
[#800]: https://github.com/nexu-io/open-design/pull/800
[#804]: https://github.com/nexu-io/open-design/pull/804
[#806]: https://github.com/nexu-io/open-design/pull/806
[#809]: https://github.com/nexu-io/open-design/pull/809
[#810]: https://github.com/nexu-io/open-design/pull/810
[#811]: https://github.com/nexu-io/open-design/pull/811
[#812]: https://github.com/nexu-io/open-design/pull/812
[#813]: https://github.com/nexu-io/open-design/pull/813
[#819]: https://github.com/nexu-io/open-design/pull/819
[#820]: https://github.com/nexu-io/open-design/pull/820
[#822]: https://github.com/nexu-io/open-design/pull/822
[#823]: https://github.com/nexu-io/open-design/pull/823
[#824]: https://github.com/nexu-io/open-design/pull/824
[#827]: https://github.com/nexu-io/open-design/pull/827
[#829]: https://github.com/nexu-io/open-design/pull/829
[#830]: https://github.com/nexu-io/open-design/pull/830
[#832]: https://github.com/nexu-io/open-design/pull/832
[#833]: https://github.com/nexu-io/open-design/pull/833
[#834]: https://github.com/nexu-io/open-design/pull/834
[#838]: https://github.com/nexu-io/open-design/pull/838
[#839]: https://github.com/nexu-io/open-design/pull/839
[#840]: https://github.com/nexu-io/open-design/pull/840
[#841]: https://github.com/nexu-io/open-design/pull/841
[#842]: https://github.com/nexu-io/open-design/pull/842
[#843]: https://github.com/nexu-io/open-design/pull/843
[#844]: https://github.com/nexu-io/open-design/pull/844
[#845]: https://github.com/nexu-io/open-design/pull/845
[#846]: https://github.com/nexu-io/open-design/pull/846
[#847]: https://github.com/nexu-io/open-design/pull/847
[#851]: https://github.com/nexu-io/open-design/pull/851
[#852]: https://github.com/nexu-io/open-design/pull/852
[#853]: https://github.com/nexu-io/open-design/pull/853
[#856]: https://github.com/nexu-io/open-design/pull/856
[#857]: https://github.com/nexu-io/open-design/pull/857
[#858]: https://github.com/nexu-io/open-design/pull/858
[#859]: https://github.com/nexu-io/open-design/pull/859
[#863]: https://github.com/nexu-io/open-design/pull/863
[#864]: https://github.com/nexu-io/open-design/pull/864
[#867]: https://github.com/nexu-io/open-design/pull/867
[#875]: https://github.com/nexu-io/open-design/pull/875
[#877]: https://github.com/nexu-io/open-design/pull/877
[#879]: https://github.com/nexu-io/open-design/pull/879
[#884]: https://github.com/nexu-io/open-design/pull/884
[#886]: https://github.com/nexu-io/open-design/pull/886
[#888]: https://github.com/nexu-io/open-design/pull/888
[#896]: https://github.com/nexu-io/open-design/pull/896
[#898]: https://github.com/nexu-io/open-design/pull/898
[#899]: https://github.com/nexu-io/open-design/pull/899
[#900]: https://github.com/nexu-io/open-design/pull/900
[#906]: https://github.com/nexu-io/open-design/pull/906
[#907]: https://github.com/nexu-io/open-design/pull/907
[#908]: https://github.com/nexu-io/open-design/pull/908
[#915]: https://github.com/nexu-io/open-design/pull/915
[#923]: https://github.com/nexu-io/open-design/pull/923
[#924]: https://github.com/nexu-io/open-design/pull/924
[#927]: https://github.com/nexu-io/open-design/pull/927
[#933]: https://github.com/nexu-io/open-design/pull/933
[#935]: https://github.com/nexu-io/open-design/pull/935
[#936]: https://github.com/nexu-io/open-design/pull/936
[#937]: https://github.com/nexu-io/open-design/pull/937
[#938]: https://github.com/nexu-io/open-design/pull/938
[#940]: https://github.com/nexu-io/open-design/pull/940
[#941]: https://github.com/nexu-io/open-design/pull/941
[#943]: https://github.com/nexu-io/open-design/pull/943
[#944]: https://github.com/nexu-io/open-design/pull/944
[#946]: https://github.com/nexu-io/open-design/pull/946
[#947]: https://github.com/nexu-io/open-design/pull/947
[#948]: https://github.com/nexu-io/open-design/pull/948
[#949]: https://github.com/nexu-io/open-design/pull/949
[#950]: https://github.com/nexu-io/open-design/pull/950
[#952]: https://github.com/nexu-io/open-design/pull/952
[#958]: https://github.com/nexu-io/open-design/pull/958
[#961]: https://github.com/nexu-io/open-design/pull/961
[#962]: https://github.com/nexu-io/open-design/pull/962
[#964]: https://github.com/nexu-io/open-design/pull/964
[#967]: https://github.com/nexu-io/open-design/pull/967
[#969]: https://github.com/nexu-io/open-design/pull/969
[#971]: https://github.com/nexu-io/open-design/pull/971
[#972]: https://github.com/nexu-io/open-design/pull/972
[#975]: https://github.com/nexu-io/open-design/pull/975
[#976]: https://github.com/nexu-io/open-design/pull/976
[#979]: https://github.com/nexu-io/open-design/pull/979
[#986]: https://github.com/nexu-io/open-design/pull/986
[#987]: https://github.com/nexu-io/open-design/pull/987
[#988]: https://github.com/nexu-io/open-design/pull/988
[#989]: https://github.com/nexu-io/open-design/pull/989
[#990]: https://github.com/nexu-io/open-design/pull/990
[#991]: https://github.com/nexu-io/open-design/pull/991
[#992]: https://github.com/nexu-io/open-design/pull/992
[#993]: https://github.com/nexu-io/open-design/pull/993
[#994]: https://github.com/nexu-io/open-design/pull/994
[#995]: https://github.com/nexu-io/open-design/pull/995
[#998]: https://github.com/nexu-io/open-design/pull/998
[#1004]: https://github.com/nexu-io/open-design/pull/1004
[#1005]: https://github.com/nexu-io/open-design/pull/1005
[#1016]: https://github.com/nexu-io/open-design/pull/1016
[#1018]: https://github.com/nexu-io/open-design/pull/1018
[#1031]: https://github.com/nexu-io/open-design/pull/1031
[#1032]: https://github.com/nexu-io/open-design/pull/1032
[#1035]: https://github.com/nexu-io/open-design/pull/1035
[#1036]: https://github.com/nexu-io/open-design/pull/1036
[#1039]: https://github.com/nexu-io/open-design/pull/1039
[#1045]: https://github.com/nexu-io/open-design/pull/1045
[#1046]: https://github.com/nexu-io/open-design/pull/1046
[#1048]: https://github.com/nexu-io/open-design/pull/1048
[#1053]: https://github.com/nexu-io/open-design/pull/1053
[#1054]: https://github.com/nexu-io/open-design/pull/1054
[#1056]: https://github.com/nexu-io/open-design/pull/1056
[#1065]: https://github.com/nexu-io/open-design/pull/1065
[#1067]: https://github.com/nexu-io/open-design/pull/1067
[#1068]: https://github.com/nexu-io/open-design/pull/1068
[#1071]: https://github.com/nexu-io/open-design/pull/1071
[#1079]: https://github.com/nexu-io/open-design/pull/1079
[#402]: https://github.com/nexu-io/open-design/pull/402
[#687]: https://github.com/nexu-io/open-design/pull/687
[#701]: https://github.com/nexu-io/open-design/pull/701
[#753]: https://github.com/nexu-io/open-design/pull/753
[#759]: https://github.com/nexu-io/open-design/pull/759
[#760]: https://github.com/nexu-io/open-design/pull/760
[#797]: https://github.com/nexu-io/open-design/pull/797
[#818]: https://github.com/nexu-io/open-design/pull/818
[#866]: https://github.com/nexu-io/open-design/pull/866
[#873]: https://github.com/nexu-io/open-design/pull/873
[#894]: https://github.com/nexu-io/open-design/pull/894
[#932]: https://github.com/nexu-io/open-design/pull/932
[#953]: https://github.com/nexu-io/open-design/pull/953
[#954]: https://github.com/nexu-io/open-design/pull/954
[#955]: https://github.com/nexu-io/open-design/pull/955
[#957]: https://github.com/nexu-io/open-design/pull/957
[#960]: https://github.com/nexu-io/open-design/pull/960
[#965]: https://github.com/nexu-io/open-design/pull/965
[#973]: https://github.com/nexu-io/open-design/pull/973
[#974]: https://github.com/nexu-io/open-design/pull/974
[#985]: https://github.com/nexu-io/open-design/pull/985
[#997]: https://github.com/nexu-io/open-design/pull/997
[#999]: https://github.com/nexu-io/open-design/pull/999
[#1001]: https://github.com/nexu-io/open-design/pull/1001
[#1003]: https://github.com/nexu-io/open-design/pull/1003
[#1033]: https://github.com/nexu-io/open-design/pull/1033
[#1034]: https://github.com/nexu-io/open-design/pull/1034
[#1038]: https://github.com/nexu-io/open-design/pull/1038
[#1043]: https://github.com/nexu-io/open-design/pull/1043
[#1044]: https://github.com/nexu-io/open-design/pull/1044
[#1060]: https://github.com/nexu-io/open-design/pull/1060
[#1061]: https://github.com/nexu-io/open-design/pull/1061
[#1063]: https://github.com/nexu-io/open-design/pull/1063
[#1069]: https://github.com/nexu-io/open-design/pull/1069
[#1081]: https://github.com/nexu-io/open-design/pull/1081
[#1082]: https://github.com/nexu-io/open-design/pull/1082
[#1083]: https://github.com/nexu-io/open-design/pull/1083
[#1085]: https://github.com/nexu-io/open-design/pull/1085
[#1086]: https://github.com/nexu-io/open-design/pull/1086
[#1091]: https://github.com/nexu-io/open-design/pull/1091
[#1092]: https://github.com/nexu-io/open-design/pull/1092
[#1093]: https://github.com/nexu-io/open-design/pull/1093
[#1095]: https://github.com/nexu-io/open-design/pull/1095
[#1097]: https://github.com/nexu-io/open-design/pull/1097
[#1103]: https://github.com/nexu-io/open-design/pull/1103
[#1104]: https://github.com/nexu-io/open-design/pull/1104
[#1105]: https://github.com/nexu-io/open-design/pull/1105
[#1115]: https://github.com/nexu-io/open-design/pull/1115
[#1117]: https://github.com/nexu-io/open-design/pull/1117
[#1126]: https://github.com/nexu-io/open-design/pull/1126
[#1128]: https://github.com/nexu-io/open-design/pull/1128
[#1132]: https://github.com/nexu-io/open-design/pull/1132
[#1136]: https://github.com/nexu-io/open-design/pull/1136
[#1137]: https://github.com/nexu-io/open-design/pull/1137
[#1139]: https://github.com/nexu-io/open-design/pull/1139
[#1140]: https://github.com/nexu-io/open-design/pull/1140
[#1144]: https://github.com/nexu-io/open-design/pull/1144
[#1145]: https://github.com/nexu-io/open-design/pull/1145
[#1148]: https://github.com/nexu-io/open-design/pull/1148
[#1150]: https://github.com/nexu-io/open-design/pull/1150
[#1156]: https://github.com/nexu-io/open-design/pull/1156
[#1159]: https://github.com/nexu-io/open-design/pull/1159
[#1171]: https://github.com/nexu-io/open-design/pull/1171
[#1173]: https://github.com/nexu-io/open-design/pull/1173
[#1183]: https://github.com/nexu-io/open-design/pull/1183
[#1188]: https://github.com/nexu-io/open-design/pull/1188
[#1203]: https://github.com/nexu-io/open-design/pull/1203
[#1206]: https://github.com/nexu-io/open-design/pull/1206
[#1205]: https://github.com/nexu-io/open-design/pull/1205
[#1207]: https://github.com/nexu-io/open-design/pull/1207
[#1219]: https://github.com/nexu-io/open-design/pull/1219
[#1230]: https://github.com/nexu-io/open-design/pull/1230
[#1231]: https://github.com/nexu-io/open-design/pull/1231
[#1232]: https://github.com/nexu-io/open-design/pull/1232
[#1238]: https://github.com/nexu-io/open-design/pull/1238
[#1240]: https://github.com/nexu-io/open-design/pull/1240
[#1244]: https://github.com/nexu-io/open-design/pull/1244
[#1249]: https://github.com/nexu-io/open-design/pull/1249
[#1256]: https://github.com/nexu-io/open-design/pull/1256
[#1259]: https://github.com/nexu-io/open-design/pull/1259
[#1263]: https://github.com/nexu-io/open-design/pull/1263
[#1266]: https://github.com/nexu-io/open-design/pull/1266
[#1267]: https://github.com/nexu-io/open-design/pull/1267
[#1268]: https://github.com/nexu-io/open-design/pull/1268
[#1270]: https://github.com/nexu-io/open-design/pull/1270
[#1271]: https://github.com/nexu-io/open-design/pull/1271
[#1284]: https://github.com/nexu-io/open-design/pull/1284
[#1285]: https://github.com/nexu-io/open-design/pull/1285
[#1287]: https://github.com/nexu-io/open-design/pull/1287
[#1290]: https://github.com/nexu-io/open-design/pull/1290
[#1291]: https://github.com/nexu-io/open-design/pull/1291
[#1300]: https://github.com/nexu-io/open-design/pull/1300
[#1307]: https://github.com/nexu-io/open-design/pull/1307
[#1308]: https://github.com/nexu-io/open-design/pull/1308
[#1328]: https://github.com/nexu-io/open-design/pull/1328
[#1330]: https://github.com/nexu-io/open-design/pull/1330
[#1161]: https://github.com/nexu-io/open-design/pull/1161
[#1167]: https://github.com/nexu-io/open-design/pull/1167
[#1208]: https://github.com/nexu-io/open-design/pull/1208
[#1224]: https://github.com/nexu-io/open-design/pull/1224
[#1276]: https://github.com/nexu-io/open-design/pull/1276
[#1292]: https://github.com/nexu-io/open-design/pull/1292
[#1341]: https://github.com/nexu-io/open-design/pull/1341
[#1360]: https://github.com/nexu-io/open-design/pull/1360
[#1365]: https://github.com/nexu-io/open-design/pull/1365
[#1368]: https://github.com/nexu-io/open-design/pull/1368
[#1402]: https://github.com/nexu-io/open-design/pull/1402
[#1439]: https://github.com/nexu-io/open-design/pull/1439
[#1442]: https://github.com/nexu-io/open-design/pull/1442
