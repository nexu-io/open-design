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
  "locales": {
    "zh-CN": {
      "title": "设计系统同步",
      "body": "在首页导入、编辑并同步设计系统，发布亮点更清晰。",
      "linkUrl": "https://open-design.ai/zh/blog/0-13-0/"
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
- `locales` — optional per-locale overrides keyed by app locale id (`en`,
  `zh-CN`, …); each may override `title`/`body`/`linkUrl`. An exact locale wins,
  then the bare language (`zh` for `zh-TW`), then the base fields.

## Updating the card

1. Edit `docs/whats-new.json` and open a pull request.
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

Republishing the current `main` content without a code change: run the
**whats-new-publish** workflow manually (`workflow_dispatch`). Its `dry_run`
input validates the document and reports the live-vs-proposed `id` without
uploading; a dry run works from any branch, while a real publish is restricted
to `main` so what ships is always reviewed content.

Propagation takes up to ~15 minutes: the object's own `max-age=300` plus the
daemon's ~10 minute in-process cache.

### Credentials

The workflow uses bucket-scoped R2 S3 credentials held as repository secrets —
`CLOUDFLARE_R2_WHATS_NEW_AK`, `CLOUDFLARE_R2_WHATS_NEW_SK`,
`CLOUDFLARE_R2_WHATS_NEW_URL`, and `CLOUDFLARE_R2_WHATS_NEW_BUCKET` — the same
shape used for the releases and repository-assets buckets. The repository-wide
`CLOUDFLARE_API_TOKEN` is a Pages-scoped token and cannot reach R2; do not
route this publish through it.
