# Post-update "What's New" card

After the app comes back on a new version (a desktop update + restart, or a web
reload), the Home surface can show a one-time bottom-right card: a title, short
copy, an optional image, and a "See what's new" link. It is best-effort chrome —
if the source is unreachable or empty, no card shows and Home is unaffected.

## Where the content lives

The card content is a single hand-curated JSON document, kept in this
repository at:

```
docs/whats-new.json
```

`.github/workflows/whats-new-publish.yml` publishes that file to the object the
daemon reads:

```
https://whatsnew.open-design.ai/whats-new.json
```

Changing the card is therefore an ordinary pull request — no local Cloudflare
credentials, no wrangler, no per-person bottleneck. The content is **not**
carried in release `metadata.json`, and there is no per-release publish
tooling: one file, edited when the copy should change.

- The daemon proxies it at `GET /api/whats-new` (also `od whats-new [--json]`),
  so the web UI and CLI read the exact same payload.
- The card is a **release feature**: the daemon only fetches the document on
  real release channels (`beta`, `prerelease`, `preview`, `stable`). Development
  and CI builds resolve to no card and never hit the network, so the card never
  intrudes on tests or unreleased builds.
- `OD_WHATS_NEW_URL` overrides the source for local development and tests (for
  example a `tools-serve` fixture endpoint), and opts any channel in — set it to
  preview the card on a dev build.

## Show-once behavior

The card is driven by **content identity**, not the app version. The document
carries an `id`; the client remembers the last `id` it showed and only opens the
card when the current `id` differs. So:

- Change `id` whenever you want the card to re-appear (e.g. set it to the new
  release version).
- Leaving `id` unchanged means users who already saw it will not see it again.
- A fresh profile that has never seen the current `id` shows the card once — the
  document is deliberately curated, so surfacing the current highlight to a new
  user once is intended.

To retire the card entirely, publish an empty object (`{}`); the daemon then
resolves to "no highlight". Any *other* incomplete document also resolves to
"no highlight", but that is the accident case, not the intended one — the guard
accepts only a complete highlight or the empty document, so taking the card
down is an explicit act rather than something a typo can do for you.

## Document schema

```json
{
  "id": "0.13.0",
  "title": "Design system sync",
  "body": "Import, edit and sync design systems with cleaner release highlights on Home.",
  "imageUrl": "https://whatsnew.open-design.ai/0.13.0.png",
  "linkUrl": "https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0",
  "ctaLabel": "View release notes",
  "locales": {
    "zh-CN": {
      "title": "设计系统同步",
      "body": "在首页导入、编辑并同步设计系统，发布亮点更清晰。",
      "linkUrl": "https://open-design.ai/zh/blog/0-13-0/",
      "ctaLabel": "查看更新说明"
    }
  }
}
```

Field rules — anything missing or malformed makes the card silently not show,
which is why `pnpm guard` checks the repository document against the shipping
parser rather than trusting review:

- `id` — **required**, non-empty string. The show-once key.
- `title`, `body` — **required**, non-empty strings.
- `imageUrl` — optional, must be `https:`. Omitted → text-only card.
- `linkUrl` — optional, must be `https:`. Omitted → the CTA falls back to the
  GitHub releases index.
- `ctaLabel` — optional, non-empty plain-text button label. Omitted → the
  client's localized release-notes label. Clients predating this field ignore
  it and keep their built-in label; they need a client update to support it.
- `locales` — optional per-locale overrides keyed by app locale id (`en`,
  `zh-CN`, …); each may override `title`/`body`/`linkUrl`/`ctaLabel`. An exact locale wins,
  then the bare language (`zh` for `zh-TW`), then the base fields.

## Updating the card

1. Edit `docs/whats-new.json` on the corresponding `release/vX.Y.Z` branch
   and have the release maintainer review and land the copy there. A `main`
   pull request remains supported for the main copy.
2. `pnpm guard` validates the document on every PR
   (`scripts/check-whats-new-document.ts`). It runs the document through the
   daemon's own parser and fails if the card would not show, if an optional
   field would be silently dropped, or if a field name is misspelled. This
   matters because the runtime is fail-safe: a malformed document does not
   error, it just makes the card disappear.
3. On merge to `main`, `whats-new-publish.yml` uploads the file
   (`application/json`, `cache-control: public, max-age=300`) and then reads it
   back from `https://whatsnew.open-design.ai/whats-new.json` with the edge
   cache bypassed. The job fails unless the bytes served match the bytes
   uploaded — an exit code from the upload alone is not treated as proof.

To publish release copy, run **whats-new-publish** manually
(`workflow_dispatch`) against the corresponding `release/vX.Y.Z` branch:

```bash
gh workflow run whats-new-publish.yml --repo nexu-io/open-design \
  --ref release/v0.22.0 -f dry_run=true
# After reviewing the proposed document and id:
gh workflow run whats-new-publish.yml --repo nexu-io/open-design \
  --ref release/v0.22.0 -f dry_run=false
```

The selected branch must contain this workflow, its publisher and validation
scripts, and `docs/whats-new.json`. Both jobs check out the run's fixed
`github.sha`, so validation and upload use the same commit even if the branch
moves. A new dispatch takes the branch's current commit; check the commit and
copy again if it changed after the dry run. Only `main` and exact
`release/vX.Y.Z` branches can publish; tags and arbitrary feature branches
cannot. A dry run needs no credentials and still works from any branch that
contains the workflow. Manual publication against `main` remains supported.

Release-branch pushes do not trigger this publisher automatically. This
workflow only uploads the hosted JSON and does not build the application.
Landing a commit on `release/**` may independently trigger the repository's
prerelease workflow. The object is shared by all release channels: review the
live-vs-proposed `id` before publishing, because publishing an older branch
replaces the same card for every client rather than creating a versioned copy.

Propagation takes up to ~15 minutes: the object's own `max-age=300` plus the
daemon's ~10 minute in-process cache.

### Credentials and the trust boundary

The card is visible to every installed client as soon as it lands, so
"published" has to imply "reviewed". The control that guarantees it is the
**`whats-new-publish` GitHub environment**:

- its deployment-branch policy allows **`main` and `release/v*` branches**,
  so a job that declares the environment cannot start outside those branches;
  keep workflow and source changes on these trusted branches reviewed. The
  workflow also requires an exact `release/vX.Y.Z` name (no suffix or leading
  zero in a version component), since the environment uses a broader glob;
- the R2 credentials are **environment secrets on that environment** —
  `CLOUDFLARE_R2_WHATS_NEW_AK`, `CLOUDFLARE_R2_WHATS_NEW_SK`,
  `CLOUDFLARE_R2_WHATS_NEW_URL`, `CLOUDFLARE_R2_WHATS_NEW_BUCKET`.

Both halves are load-bearing. `workflow_dispatch` runs the workflow file from
the ref it is dispatched against, so every check written inside the workflow is
editable by whoever triggers it — including the branch-name assertion. What is
not editable is where the secrets live: dropping the `environment:` declaration
to escape the branch policy also drops access to the secrets, and the publisher
then fails naming the variables it is missing.

**Do not add these as repository secrets.** Repository secrets are readable
from any job on any branch, which would let anyone with write access publish
unreviewed content by dispatching a modified workflow from their own branch.

That shape is pinned by the `what's new publish workflow` check in `pnpm guard`
(`scripts/check-whats-new-publish-workflow.ts`): the credential-bearing job is
the one that declares the environment, it cannot start without a green
`validate`, and no other job may hold an environment or read a secret. The
check runs from CI's unconditional preflight job rather than a path-routed
test lane, because an edit to the workflow alone selects no test workload —
a lane-routed assertion would be skipped for exactly the edit it guards.

It reads the workflow through a YAML parser rather than matching text, and
looks for the `secrets` **context identifier** inside any `${{ … }}`
expression rather than for particular access shapes. Both choices are
load-bearing: `secrets['NAME']`, `toJSON(secrets)` and a bare `secrets` are all
secret reads, and a double-quoted YAML scalar can hide `secrets` from raw text
entirely by splitting it across a backslash line continuation.

The repository-wide `CLOUDFLARE_API_TOKEN` is a Pages-scoped token and cannot
reach R2 at all; do not route this publish through it.
