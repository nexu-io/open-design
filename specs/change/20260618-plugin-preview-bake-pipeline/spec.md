# Plugin Preview Bake Pipeline — couple bakes to their source change, bound R2 growth

> Spec format follows the `spec-battle` author template (Sources is the
> anti-hallucination linchpin: a reviewer must be able to pull the real code and
> check every claim below). Ready for the arena.

## Title

Rework how the home-gallery plugin-preview clips are baked, published, and
garbage-collected so that (a) a preview refresh travels with the source change
that caused it instead of arriving as a detached bot PR, (b) the manifest can
never reference an R2 clip that has been deleted out from under a shipped client,
and (c) R2 storage stays bounded without an ever-growing stack of stale review
PRs.

## Why · Reasons to do this

- **Use case (what triggered this):** the maintainer noticed **6 open
  `chore(plugin-previews): refresh baked preview manifest` PRs** from the
  `github-actions` bot, none merged, several already `APPROVED` but stuck at
  `BLOCKED`. The process feels broken. (That initial batch has since drained —
  #4261, #4408, #4415, #4433, #4437 were closed as superseded and #4442 merged —
  but the structural defects below keep regenerating the queue: fresh
  bake-manifest PRs such as #4559 and #4571 are open as of this writing. The
  point is the *pipeline*, not any single PR.)
- **Pain being addressed (three distinct defects, not one):**
  1. **No merge automation.** The bake workflow only opens a PR and pings the
     maintainer. `main` merges through a merge queue, so even an `APPROVED`
     manifest PR sits at `BLOCKED` until a human enqueues it. Nobody does →
     everything piles up.
  2. **A fresh branch + PR every run.** Each run creates
     `chore/plugin-previews-<run_id>` and a new PR instead of reusing one rolling
     branch / updating the open PR. The 6-deep stack is the visible symptom.
  3. **`generatedAt` defeats the diff guard.** The workflow comment claims the PR
     "fires only when a plugin actually changed", but the manifest carries a
     `generatedAt` timestamp that changes every run, so
     `git diff --quiet -- data/plugin-previews/manifest.json` is never quiet. PR
     #4261 was a pure timestamp-only change with **zero plugin diffs** — proof of
     the noise.
- **The deeper structural pain (the maintainer's real concern):** the bake PR is
  **decoupled from the code change that caused it**. If a plugin change is
  reverted, the detached bake PR/manifest can linger out of sync. There is no
  strong link between "this plugin source changed" and "its preview was
  refreshed in the same atomic unit."

## Sources · Facts of record (required; reviewer checks against these)

> Everything below is on `origin/main` unless stated. Line numbers verified
> against `origin/main` at the base commit.

- **Repo:** `nexu-io/open-design` (this repo).
- **Branch / base commit:** this spec lands on a `spec/plugin-preview-bake-pipeline`
  branch off `origin/main`. The code it describes is all already on `main` (the
  bake feature shipped; this spec changes the *pipeline around it*, not the
  renderer).
- **Key code locations:**
  - `.github/workflows/bake-plugin-previews.yml` (138 lines) — the workflow.
    - Triggers (lines 10–18): `push` to `main` filtered to `plugins/_official/**`
      and `scripts/bake-plugin-previews.mjs`; `schedule` cron `0 18 * * *`;
      `workflow_dispatch`.
    - Upload to R2 gated to `main` (lines 83–105), `aws s3 cp` (not `sync
      --delete`), `--cache-control "public, max-age=31536000, immutable"`,
      `--exclude manifest.json`.
    - PR creation (lines 107–134): seeds committed manifest, diff-guards on
      `manifest.json` (line 121), branch `chore/plugin-previews-${{ github.run_id }}`
      (line 124), `gh pr create --reviewer lefarcen` (line 131).
    - Token note (lines 114–118): a `GITHUB_TOKEN`-authored PR does not trigger
      `pull_request` CI; `PREVIEW_BAKE_TOKEN` PAT/app token is preferred.
  - `scripts/bake-plugin-previews.mjs` (497 lines) — the renderer.
    - `BAKE_VERSION = 4` (line 55).
    - Content hash: `createHash('sha256').update(html).update(\` ${BAKE_VERSION}
      ${motionMap[id] || ''}\`).digest('hex').slice(0, 16)` (line 475).
    - Filename: `const slug = hash ? \`${id}.${hash}\` : id;` → `<id>.<hash>.mp4`
      and `<id>.<hash>.poster.jpg` (lines 431–447).
    - Skip/reuse: `if (hash && prev && prev.hash === hash && filesPresent)` (line
      483); under `PREVIEW_REMOTE === '1'` (CI) `filesPresent` is forced true —
      it **trusts the manifest hash and never checks R2 for object existence**
      (lines 478–484).
  - `apps/daemon/src/plugin-preview-bakes.ts` — the consumer.
    - `resolvePluginPreviewsDir` reads the **checked-in** manifest dir
      (`OD_PLUGIN_PREVIEWS_DIR` override), i.e. the manifest is **bundled into
      the build** (line 38 onward; comment lines 11, 22, 42).
    - `bakedPreviewBlock` returns `null` when the entry is missing (line 71);
      remote base from `OD_PLUGIN_PREVIEWS_BASE_URL` (comment line 22).
  - `apps/web/src/components/plugins-home/cards/MediaSurface.tsx` — the renderer
    of the card.
    - `posterLoadFailed` state (line 40) → swaps in a typographic glyph fallback
      on poster 404/decode error; the `<video>` only mounts on hover for plain
      video templates (comment lines 4, 10–13); `idlePlays` when `holdMs` is set
      (line 51).
  - `data/plugin-previews/manifest.json` — the committed manifest. Shape:
    `{ generatedAt, previews: { <slug>: { video, poster, durationMs, holdMs,
    hash } } }`. 125 entries at base.
- **How to pull:**
  ```
  gh repo clone nexu-io/open-design && cd open-design
  git checkout spec/plugin-preview-bake-pipeline   # this spec
  # the described code is on main:
  git show origin/main:.github/workflows/bake-plugin-previews.yml
  git show origin/main:scripts/bake-plugin-previews.mjs
  ```
- **Related material:**
  - Bake PRs illustrating the churn: #4442, #4490 (merged); #4261, #4408, #4415,
    #4433, #4437, #4537 (closed as superseded); #4559, #4571 (open as of writing).
    These rotate — read "the current open bake PR(s)" rather than any fixed
    number.
  - Release channel model and the no-squash release→main back-merge rule: root
    [`AGENTS.md`](../../../AGENTS.md) → "Release channel model" and PR expectations.
  - Auto-update / channel identity: `tools/pack/AGENTS.md`.
- **Access prerequisites:** R2 credentials
  (`CLOUDFLARE_R2_REPOSITORY_ASSETS_*` secrets) are needed to *run* the bake
  upload; not needed to *review* this spec. Fork PRs do **not** receive these
  secrets in `pull_request` events — this is the hard constraint that shapes the
  whole design.

## Goals / Non-goals

**Goals**

1. Make an internal (same-repo) plugin change refresh its own preview **in the
   author's PR**, so the manifest change is atomic with the code change and a
   revert reverts both.
2. Eliminate the PR pile-up: at most **one** open bake PR at any time, and only
   when a clip actually changed (ignore `generatedAt`).
3. Guarantee a shipped client never resolves a manifest entry to a deleted R2
   clip — GC must be safe by construction.
4. Bound R2 growth with a GC that protects everything any live release
   references.
5. Keep fork contributions covered (they cannot bake in-PR).

**Non-goals**

- Changing the renderer itself (`bakeOne`, frame capture, ffmpeg recipe,
  `BAKE_VERSION` semantics). The deterministic-fingerprint identity stays; only
  the *object key layout* changes (flat → `<pluginKey>/<fingerprint>/`, see
  section 0).
- Changing the consumer read path (`plugin-preview-bakes.ts`) beyond what GC
  safety strictly requires.
- Adding a second physical R2 bucket or per-channel base-URL env (explicitly
  rejected — see Alternatives).
- Committing clip binaries to git (they stay on R2; only the manifest is
  committed).

## Proposed design

A single R2 prefix, three bake entry points differentiated by *when* they run,
and a tag-union GC. The manifest stores **relative object keys**; the URL is
`OD_PLUGIN_PREVIEWS_BASE_URL + key`, identical for every client — so there is no
per-channel routing to reason about.

### 0. Preview artifact identity contract (added per PerishCode's review)

Before the pipeline mechanics, pin down *what a preview is keyed by*. This is the
contract everything else (coupling, GC safety, rollback) rests on.

- **No manually maintained plugin version.** A preview's revision is the
  **deterministic fingerprint** of the plugin's own preview source inputs plus
  the declared bake inputs (`BAKE_VERSION` / preview metadata). Plugin source
  changes invalidate that plugin's preview; broad shared changes
  (renderer/font/CSS/design-system) do **not** implicitly invalidate it — that
  needs an explicit `BAKE_VERSION` bump or a touch of the plugin source.
- **Directory-layered, immutable keys** (replacing today's flat
  `<id>.<hash>.mp4`). **One base, one authority — the manifest key is relative to
  the prefix the base URL already includes**, so it must NOT repeat
  `plugin-previews/`:
  ```
  base URL (daemon default, unchanged):
    OD_PLUGIN_PREVIEWS_BASE_URL = https://repo-assets.open-design.ai/plugin-previews
  manifest stores (prefix-relative key):
    <pluginKey>/<fingerprint>/preview.mp4
    <pluginKey>/<fingerprint>/poster.jpg
  resolved URL = base + "/" + key:
    https://repo-assets.open-design.ai/plugin-previews/<pluginKey>/<fingerprint>/preview.mp4
  bucket object path (what aws s3 cp writes):
    plugin-previews/<pluginKey>/<fingerprint>/preview.mp4
  ```
  The `plugin-previews/` segment belongs to the **bucket layout / base URL**, not
  the manifest key. Writing it into the manifest too would produce
  `.../plugin-previews/plugin-previews/...` and 404 every shipped preview (caught
  in review — thanks @PerishCode). GC compares against the same prefix-relative
  keys the manifest stores.
  - `<pluginKey>` = stable plugin id / manifest key.
  - `<fingerprint>` = deterministic over preview source inputs + bake recipe
    version.
  - Keys are **immutable**: a bake must never overwrite an existing key with
    different bytes. Same fingerprint → same keys (idempotent re-bake); changed
    fingerprint → a new directory.
- **`latest` lives only at the manifest layer, never as an R2 artifact.** The
  manifest a build ships with is the only "latest" pointer; a released client
  keeps reading the snapshot it shipped with. A mutable `latest` artifact key
  would weaken rollback, GC safety, and release reproducibility — so we do not
  introduce one.
- **GC source of truth = object keys referenced by protected manifests**, not
  filename parsing. Parsing keys is an operational aid for diagnostics, not the
  authority for what is live.

> Migration note: this changes the on-R2 layout from the current flat
> content-hashed filename to a `<pluginKey>/<fingerprint>/` directory. Existing
> flat objects stay referenced by already-shipped manifests until those manifests
> age out of the protected set, so the cutover is additive (new bakes write the
> new layout; old keys remain protected while live).

### 1. Pre-merge bake for same-repo PRs (the coupling fix)

A new `pull_request` job that runs **only when `head.repo.full_name ==
github.repository`** (same-repo branches have secrets; forks do not):

- **Bake scope follows the invalidation boundary, not just the touched plugin
  files** (raised by @mrcfps). The selection rule:
  - A PR that touches only `plugins/_official/<id>/**` bakes **those plugin ids**.
  - A PR that changes the bake recipe — `scripts/bake-plugin-previews.mjs`, a
    `BAKE_VERSION` bump, or another shared bake input — invalidates **all 125
    fingerprints**, so it forces a **full pre-merge bake** and updates the whole
    manifest **in the same author PR**. Limiting it to plugin-file changes would
    leave most entries stale until a detached post-merge PR, defeating the
    coupling goal. (A full bake here is the same cost as the release/nightly full
    bake — evaluate all, re-render only the changed fingerprints.)
- Upload clips to the single R2 prefix, and **commit the manifest update into the
  author's branch** (push back to the PR head). The manifest change now rides
  with the code change in the same PR and merges/reverts atomically.
- **Loop guard (an explicit guard is REQUIRED — the path filter does not break
  the loop).** On `pull_request`, the workflow's `paths` filter is evaluated
  against the **PR's cumulative changed files**, not just the latest commit. The
  PR still contains the original `plugins/_official/**` / script change, so the
  CI manifest commit fires a `pull_request.synchronize` event that is **still
  path-eligible** → another bake run, and a loop if any non-semantic manifest
  field changes again (caught in review — thanks @PerishCode; an earlier draft
  wrongly called this "free"). Require a real guard, at least one of:
  - **skip when the actual head *commit* was authored by the bake bot.** Note
    `github.event.pull_request.head.user.login` is the head **repository owner**,
    not the latest commit author — on a same-repo branch it stays the contributor
    even after the bot pushes the manifest commit, so it is the **wrong** field
    (caught in review — thanks @PerishCode, @mrcfps). Check the triggering head
    commit instead — but the head SHA must be present locally first: a default
    `actions/checkout` on `pull_request` checks out the **merge ref** with
    shallow history, so `head.sha` is not guaranteed to exist (raised by
    @PerishCode). Either `actions/checkout` with `ref: ${{
    github.event.pull_request.head.sha }}` (and enough `fetch-depth`), or an
    explicit `git fetch origin ${{ github.event.pull_request.head.sha }}` before
    the check, then `test "$(git log -1 --format='%ae' ${{
    github.event.pull_request.head.sha }})" != "$BAKE_BOT_EMAIL"` (the bake push
    already sets `git config user.email "bot@open-design.ai"`). `github.actor` is
    an alternative only if the bake push token carries a stable bot identity.
  - **compute the manifest diff and only commit when a `previews` entry actually
    changed** (no-op-diff guard — same helper as the `generatedAt` fix), so a
    re-run that produces an identical manifest is a no-op and commits nothing.

  Both together make the job idempotent: at most one extra no-op `synchronize`
  that commits nothing and then stops.

### 2. Post-merge / nightly demoted to "uploader + fork path + backstop"

The existing workflow stays but its role narrows:

- For internal changes, the manifest is already correct at merge time (pre-merge
  wrote it), so the `push: main` run finds the hash unchanged and **does not open
  a PR** — it only ensures the referenced clips are on R2.
- **Forks** cannot run the pre-merge job, so their manifest is still refreshed
  here, post-merge, as the only available path.
- **Two bug fixes** for the cases where it still opens a PR (forks, nightly):
  - **Ignore `generatedAt`** in the diff guard — only open a PR when a `previews`
    entry actually changed.
  - **Single rolling branch** (e.g. `chore/plugin-previews`): reuse the open PR
    (force-push / `gh pr edit`) instead of one branch per run. At most one open.
- **Nightly stays** as the backstop, but only for what it can actually catch
  given the fingerprint inputs (see "Preview artifact identity contract" below):
  - A post-merge run that **failed** (transient: daemon boot, timeout, R2
    hiccup) — retried on the next sweep.
  - A `BAKE_VERSION` bump — re-bakes all 125 because the fingerprint changed.
  - **Not** an implicit catch-all for shared-input changes. Per PerishCode's
    review, the invalidation boundary is **explicit by design**: a fingerprint
    covers a plugin's own preview source plus the declared bake inputs
    (`BAKE_VERSION` / preview metadata). Broad shared changes — `design-systems/**`,
    `craft/**`, fonts, web CSS, daemon renderer — do **not** implicitly
    invalidate a preview, and a "full sweep" would *reuse* (same fingerprint →
    same key) rather than detect them. When such a change *should* refresh
    previews, that is a deliberate `BAKE_VERSION` bump or a touch of the affected
    plugin source — not something nightly silently discovers. (This corrects an
    earlier draft that claimed nightly catches these via "hash drift"; it does
    not, because the fingerprint does not include those inputs.)

### 3. Release-cut full bake (authoritative snapshot)

A new standalone workflow, triggered on `push` to `release/**` plus
`workflow_dispatch`:

- Run a **full bake of all 125 plugins**, upload missing clips, commit the
  authoritative manifest onto the release branch, and let it flow back to `main`
  via the **non-squash** release back-merge (per root AGENTS.md). "Full" here
  means *every plugin is evaluated*, not *every plugin is re-rendered* — a plugin
  whose fingerprint is unchanged reuses its existing key. Release cut is the
  natural moment to **deliberately bump `BAKE_VERSION`** if a shared
  renderer/font/CSS/design-system change should refresh all previews; that is the
  explicit invalidation lever, not an implicit sweep.
- Standalone (not bolted onto the release build) because it needs the heavy bake
  env (ffmpeg + headless Chrome + daemon, up to 90 min) and must be
  independently re-runnable if it flakes.
- This produces the manifest that, once tagged, **protects** its clips from GC
  forever (see below).
- **Loop guard (required — this path commits back to the same branch it triggers
  on).** Unlike the pre-merge path, a `release/**` trigger + a manifest writeback
  to that release branch is a self-retrigger risk (the same shape as
  `notify-release-feishu.yml`, which fires on every `release/**` push). Break the
  loop with **both** belts: (a) a `paths-ignore: ['data/plugin-previews/**']`
  trigger filter so the bot's own manifest commit does not re-fire the workflow,
  and (b) an early `if` guard that skips when the head commit author is the bake
  bot. This is an acceptance criterion, not a footnote (see Validation).

### 4. Single bucket + tag-union GC (the storage-bound fix)

One R2 prefix `plugin-previews/`. A weekly GC workflow computes a **protected
set** and deletes only outside it:

```
protected = ⋃ over every release/prerelease tag of (object keys in that tag's manifest)
          ∪ ⋃ over every live release/** branch HEAD of (object keys in that branch's manifest)
          ∪ (object keys in the current main manifest)
delete R2 objects whose key is NOT in protected AND older than a grace window (e.g. 90d)
```

The protected set is built from **object keys the protected manifests reference**
(per section 0, manifests are the source of truth) — not from parsing key
structure.

The middle term is load-bearing: tags alone do **not** cover the long-lived
channels that publish from non-tagged refs. Per root AGENTS.md, `nightly` is
built on **every** `release/**` push (see `notify-release-feishu.yml`) and
`preview` is an independent channel published under `preview/latest` — both ship
clients carrying manifests that no git tag protects. So the GC job must discover
manifests not only from tags but from:

- every live `release/**` branch HEAD (`git for-each-ref refs/remotes/origin/release/*`),
  which feeds the current nightly and preview builds, and
- the manifests recorded in the published channel metadata (`nightly/latest`,
  `preview/latest`) if those can diverge from the branch HEAD.

A clip stays protected until **no** tag, live release branch, or published
channel references it (plus the grace window).

Two safety nets make this low-risk:

1. **Deterministic fingerprint.** The `<fingerprint>` is derived from
   `sha256(preview source + BAKE_VERSION + motion)` (today: `html`), so a
   mistakenly deleted clip is **reproducible**: re-running the bake at that
   source state regenerates the *identical* `<pluginKey>/<fingerprint>/` keys.
   Deletions are recoverable, not permanent loss.
2. **Age gate + dry-run.** GC only touches objects older than the grace window
   and runs dry-run-first.

The grace window must exceed the staleness of any client reading a non-tagged
manifest (notably `beta`, which tracks `main` and updates daily — 30d+ covers it
comfortably).

## Alternatives considered

- **Two physical R2 prefixes (A = release/append-only, B = dev/GC'd) + a
  per-channel `OD_PLUGIN_PREVIEWS_BASE_URL`.** Rejected. A `main` build's
  manifest references a *mix*: plugins unchanged since the last release (clips
  baked then) plus plugins changed since (new clips). Because the filename does
  not encode the prefix and there is one base URL per build, "read A for some
  entries, B for others" is impossible — so B would have to hold the full
  current superset anyway, which defeats the split. It also adds a copy/promote
  step and channel→prefix mapping with no safety gain over tag-union GC.
- **Don't upload from PR branches at all (manifest-only pre-merge; defer upload
  to post-merge).** Considered to keep R2 clean. Rejected as the primary design
  because, with a single GC'd bucket, uploading in-PR is harmless (abandoned-PR
  clips are just orphans the GC reaps) and lets staging/preview environments show
  real previews during review. Kept as a fallback if PR-branch R2 writes turn
  out to be a problem.
- **Direct commit to `main` (skip the PR).** Rejected: `main` is protected;
  data-only or not, it must go through a PR. The pre-merge path makes the PR the
  author's own, which is better than a separate bot PR anyway.
- **Auto-approve + `gh pr merge --auto` on the bot PR.** Still needed for the
  fork/nightly path; folded into "single rolling branch" — but it does not solve
  coupling, so it is a complement, not the answer.

## Risks & mitigations

- **GC deletes a load-bearing clip → old client shows a broken cover.**
  Mitigations: tag-union protection (every in-wild release is covered by
  construction); deterministic-hash recoverability; age gate; dry-run.
  *Severity if it still happens:* degraded, not broken — `MediaSurface`'s
  `posterLoadFailed` (line 40) swaps in a typographic glyph; it does **not**
  fall back to the old live iframe (the manifest entry still exists), so the rich
  preview is lost but no broken-image icon appears.
- **Pre-merge job pushes to a fork PR head it shouldn't.** Mitigation: hard gate
  on `head.repo.full_name == github.repository`; forks fall through to
  post-merge.
- **PR-branch R2 writes with secrets on semi-trusted code.** Same-repo branches
  only (no `pull_request_target`), so no untrusted-fork code runs with R2 write
  creds. Renderer runs arbitrary plugin HTML in headless Chrome — already true
  today on `main`; pre-merge does not widen the trust boundary beyond same-repo
  contributors.
- **Release cut bumps `BAKE_VERSION` → every plugin gets a new `<fingerprint>`
  directory only the release manifest references; `main`/staging (reading the
  same bucket) is fine because it is one bucket** — but `main`'s manifest won't
  point at the new keys until the back-merge lands. Mitigation: the release bake
  uploads to the single bucket, and the non-squash back-merge brings the manifest
  to `main`; a follow-up nightly reconciles anything missed.
- **`generatedAt` removal hides a legitimately-changed manifest.** Mitigation:
  diff only the `previews` subtree, not the whole file; add a test that a
  timestamp-only delta produces no PR but a `previews` delta does.
- **Nightly still cannot self-heal a clip that is missing on R2 but whose hash is
  unchanged** (because `PREVIEW_REMOTE=1` trusts the manifest hash, script lines
  478–484). Mitigation (optional, see Open questions): add an R2 HEAD existence
  check so "hash matches but object absent → re-render + upload".

## Rollout / migration / rollback

1. Land the **diff-guard + single-rolling-branch** fix first (smallest, stops
   the bleeding on the existing pile-up).
2. Add the **pre-merge same-repo job** with its explicit loop guard (bot-author
   skip + no-op `previews`-diff guard); verify on an internal test PR that the
   manifest is committed to the branch and the follow-up `synchronize` run
   commits nothing (no loop).
3. Add the **release-cut full bake** workflow; dry-run via `workflow_dispatch`.
4. Add **GC** last, dry-run-only for the first 1–2 weeks; inspect the proposed
   deletion list before enabling real deletes.
- **Rollback:** each piece is an independent workflow file; reverting a workflow
  is a clean revert with no runtime/data migration. R2 objects are immutable and
  additive until GC is enabled, so steps 1–3 cannot lose data.

## Validation · Acceptance criteria (behavior-level)

- **Coupling:** open an internal PR that edits one `plugins/_official/**` preview
  → the PR's own diff gains the matching `data/plugin-previews/manifest.json`
  entry change (committed by CI), and no separate bot PR is opened. Revert that
  PR → the manifest entry reverts in the same revert.
- **Pre-merge does not loop:** after CI commits the manifest to the PR head, the
  resulting `pull_request.synchronize` run **commits nothing further** — the
  bot-author skip and the no-op `previews`-diff guard both hold, so the run is a
  single no-op and stops (no second manifest commit, no run storm). Assert the
  guard reads the **head commit author** (`git log -1 --format='%ae'` of
  `head.sha`), not `pull_request.head.user.login`: a synchronize whose head
  commit author is `bot@open-design.ai` → `shouldCommit === false`, while one
  authored by a human contributor with a real `previews` delta → `true`.
- **No noise:** a nightly run where no plugin content changed opens **no** PR
  (red test today: #4261 was a timestamp-only PR). Encode as a unit test over
  the diff-guard helper: timestamp-only delta → `shouldOpenPr === false`;
  `previews` delta → `true`.
- **At most one:** after two consecutive content-changing runs on the
  fork/nightly path, there is exactly one open bake PR (the rolling branch was
  reused).
- **Release-cut does not self-retrigger:** simulate the bot's manifest commit
  on a `release/**` branch → the release-bake workflow does **not** fire again
  (the `paths-ignore` filter and the bot-author `if` guard both hold). Encode as
  a workflow-trigger test: a commit touching only `data/plugin-previews/**` by
  the bake bot produces zero new runs.
- **GC safety (tags + live release branches):** given a fixture where clip `X` is
  referenced by (a) a release tag, or (b) a live `release/**` branch HEAD feeding
  nightly/preview, but **not** by the current `main` manifest, GC's computed
  delete set **excludes** `X`. Conversely a clip referenced by none of {tag, live
  release branch, main} and older than the grace window **is** in the delete set.
  (Falsifiable test against the GC set-computation function with fixture
  tags/branches + manifests.)

## Implementation slices

1. **Diff-guard + rolling branch** (workflow-only): ignore `generatedAt`, reuse
   one branch/PR. Independently verifiable via the diff-guard unit test.
2. **Pre-merge same-repo bake job** (new `pull_request` job + same-repo gate +
   commit-to-branch). Verifiable end-to-end on an internal test PR.
3. **Release-cut full bake** (new standalone workflow). Verifiable via
   `workflow_dispatch` dry run + checking the produced manifest.
4. **Tag-union GC** (new weekly workflow + set-computation helper with tests).
   Dry-run gated.

## Open questions

1. **Sequencing against the live queue:** there is always a rotating set of open
   bake-manifest PRs (e.g. #4559, #4571 right now). Before slice 1 lands, do we
   drain whatever is open at that moment, or close them and let the fixed
   pipeline regenerate one clean rolling PR? Recommendation: land the newest open
   bake PR so `main`'s manifest is current, close the rest, then ship slice 1 —
   stated in terms of "the current open bake PR at merge time" so this guidance
   does not rot.
2. **Optional R2-existence self-heal:** add a HEAD check so nightly can re-upload
   a clip whose hash matches but whose object is missing on R2 (script lines
   478–484)? Worth it, or rely on deterministic re-bake recoverability?
3. **GC grace window:** 90d proposed. Confirm it comfortably exceeds the slowest
   in-wild update cadence for any channel reading a non-tagged (`main`/`beta`)
   manifest.
4. **Pre-merge upload vs manifest-only:** upload clips from PR branches (shown in
   staging, GC'd if abandoned) — accept the orphan churn, or defer upload to
   post-merge to keep the bucket cleaner? Recommendation: upload (simpler; GC
   handles it).
