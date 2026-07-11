# Post-update "What's New" card

After the app comes back on a new version (a desktop update + restart, or a web
reload), the Home surface can show a one-time bottom-right card: a title, short
copy, an optional image, and a "See what's new" link. It is best-effort chrome —
if the source is unreachable or empty, no card shows and Home is unaffected.

## Where the content lives

The card content is a single hand-curated JSON document on a dedicated R2
bucket:

```
https://whatsnew.open-design.ai/whats-new.json
```

There is **no per-release publish tooling** and the content is **not** carried
in release `metadata.json`. To change what users see, edit that one file.

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

To retire the card entirely, publish an empty object (`{}`) or a document
without a valid `id`/`title`/`body`; the daemon then resolves to "no highlight".

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

Field rules (anything missing or malformed makes the card silently not show, so
validate before uploading):

- `id` — **required**, non-empty string. The show-once key.
- `title`, `body` — **required**, non-empty strings.
- `imageUrl` — optional, must be `https:`. Omitted → text-only card.
- `linkUrl` — optional, must be `https:`. Omitted → the CTA falls back to the
  GitHub releases index.
- `locales` — optional per-locale overrides keyed by app locale id (`en`,
  `zh-CN`, …); each may override `title`/`body`/`linkUrl`. An exact locale wins,
  then the bare language (`zh` for `zh-TW`), then the base fields.

## Updating the file (S3 API)

The bucket is S3-compatible. With an R2 token scoped to the bucket:

```bash
AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… \
aws s3 cp whats-new.json s3://<bucket>/whats-new.json \
  --endpoint-url https://<account>.r2.cloudflarestorage.com \
  --content-type application/json --cache-control 'public, max-age=300'
```

Keep `Cache-Control` modest so an edit reaches users promptly; the daemon also
caches the document for ~10 minutes.
