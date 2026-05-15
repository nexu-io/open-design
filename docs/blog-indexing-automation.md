# Blog indexing automation

The Open Design landing page automates the parts of search-engine
indexing that Google officially supports for normal blog content. It
does NOT pretend to "submit" or "request indexing" for blog posts via
unsupported APIs or browser automation.

This file is the operating manual. The skill that defines the rules
lives at `~/.codex/skills/blog-indexing-automation/SKILL.md`; this
doc is its concrete implementation in `nexu-io/open-design`.

## What is automated

| Trigger | Job | Outcome |
|---|---|---|
| `landing-page-ci` | `lint-blog-seo.ts` + `check-blog-url-changes.ts` | Changed posts are checked for frontmatter, internal/external links, rendered canonical/JSON-LD/OG metadata, and slug delete/rename redirects before they can merge. |
| `landing-page-deploy` finishes successfully on `main` | `blog-indexing-on-deploy.yml` | New blog URLs are detected, verified ready, submitted to IndexNow, the sitemap-index is re-submitted to GSC, baseline URL Inspection is captured, and baseline Search Analytics is queried. |
| Daily `cron: 0 2 * * *` | `blog-indexing-monitor.yml` | Every blog post in the T+1 / T+3 / T+7 / T+14 window is re-inspected; GSC Search Analytics is refreshed; stall and low-traffic issues are opened/refreshed when needed. |
| Manual `workflow_dispatch` | `blog-indexing-monitor.yml` | Maintainers can dry-run or explicitly publish a token-gated dev.to/Hashnode cross-post with canonical URL pointing back to Open Design. |

Both workflows commit their results back via the `open-design-bot`
GitHub App, opening or refreshing the `automation/blog-indexing-status`
PR. The human-readable view is `docs/blog-indexing-status.md`; the
canonical state is the sidecar `docs/blog-indexing-status.json`.
Before each run renders a new report, it restores the latest files from
the pending `automation/blog-indexing-status` branch when that branch
exists. That keeps inspection history continuous even if the previous
status PR has not been merged yet. If that branch exists but the status
files cannot be restored, the workflow fails and records the restore
failure in the job summary instead of silently starting from stale state.

## What is deliberately NOT automated

Per the `blog-indexing-automation` skill:

- We do not call Google's Indexing API. It officially supports only
  Job Postings and Livestreams; using it for blog posts risks policy
  flags and provides no real benefit.
- We do not automate clicks against the Search Console UI to "Request
  Indexing." The skill labels that as a brittle last resort.
- We do not ping the legacy `https://www.google.com/ping?sitemap=`
  endpoint. Google deprecated it in 2023.
- We do not attempt to inspect every URL on the site every day. We
  only inspect changed URLs after deploy and posts in the
  T+1/T+3/T+7/T+14 window.
- We do not auto-publish cross-posts. The cross-post scaffold is dry-run
  by default and requires both platform tokens and `publish_crosspost=true`.

When automation cannot solve an indexing problem (e.g. Google has the
URL but refuses to index it), the monitor opens a GitHub issue
describing the likely failure mode so a human can fix the underlying
content / SEO issue.

## Architecture

```
landing-page-deploy ──success──▶ blog-indexing-on-deploy
                                        │
                       detect-changed-urls
                                        │
                       verify-readiness (200 / canonical / sitemap)
                                        │
                       submit-indexnow
                                        │
                       submit-sitemap (one PUT)
                                        │
                       inspect-urls (baseline)
                                        │
                       query-search-analytics
                                        │
                       render-status ──▶ docs/blog-indexing-status.md
                                        │
                                   bot PR

cron 02:00 UTC ──▶ blog-indexing-monitor
                          │
            scheduled-window (T+1/T+3/T+7/T+14 today)
                          │
                  inspect-urls
                          │
                  query-search-analytics
                          │
            render-status ──▶ docs/blog-indexing-status.md
                          │
            escalate-stalls ──▶ open / refresh / close stall issue
                          │
            escalate-low-traffic ──▶ open / refresh / close traffic issue
                          │
                     bot PR
```

All scripts live in `apps/landing-page/scripts/blog-indexing/` and run
under `tsx` directly — no compile step. Most scripts depend only on
Node 24 built-ins (`crypto`, `fetch`, `child_process`). RSS uses
`@astrojs/rss`.

## One-time setup

Done once per environment by a maintainer. Repeating this is harmless
but unnecessary.

### 1. Configure Google Search Console auth

Preferred path: OAuth user refresh token. This avoids the Google Search
Console UI bug where newly-created service account emails sometimes
fail with `email not found`.

1. Go to <https://console.cloud.google.com/projectcreate> and create a
   project named `open-design-blog-indexing` (or reuse an existing
   project the team owns).
2. Enable the **Search Console API** under
   <https://console.cloud.google.com/apis/library/searchconsole.googleapis.com>.
3. Create an OAuth client under
   <https://console.cloud.google.com/apis/credentials>:
   - Application type: **Desktop app**
   - Name: `open-design-gsc-local`
4. In the OAuth consent screen, keep the app in Testing and add every
   Google account that may grant access under **Audience → Test users**.
5. Run the local helper:

   ```bash
   GSC_OAUTH_CLIENT_ID='<client-id>' \
   GSC_OAUTH_CLIENT_SECRET='<client-secret>' \
   pnpm --filter @open-design/landing-page exec tsx \
     scripts/blog-indexing/authorize-gsc-oauth.ts \
     --out /tmp/open-design-gsc-refresh-token.txt
   ```

6. Open the printed Google URL and authorize with an account that is an
   Owner of the `open-design.ai` Search Console property.

Fallback path: service account. Create `gsc-indexing-bot`, download a
JSON key, then try adding the `client_email` as an Owner in Search
Console. If Search Console shows `email not found`, use OAuth instead.

### 2. Add auth secrets to GitHub

1. Open <https://github.com/nexu-io/open-design/settings/secrets/actions>.
2. Preferred OAuth secrets:
   - `GSC_OAUTH_CLIENT_ID`
   - `GSC_OAUTH_CLIENT_SECRET`
   - `GSC_OAUTH_REFRESH_TOKEN`
3. Optional service-account fallback:
   - `GSC_SERVICE_ACCOUNT_KEY`
4. Confirm the existing `BOT_APP_ID` and `BOT_APP_PRIVATE_KEY` secrets
   already exist — they are reused from the `refresh-contributors-wall`
   automation. The bot needs `contents:write`, `pull-requests:write`,
   and `issues:write` for `nexu-io/open-design` (already configured).

If these secrets are not present yet, the workflows do not fail the
main deploy path. They record the missing configuration in the job
summary, emit a GitHub Actions warning, and skip the GSC / bot-write
steps until the secrets are added.

### 3. Optional platform secrets

These are not required for indexing.

- `DEVTO_API_KEY` — only needed if a maintainer wants
  `blog-indexing-monitor.yml` to publish a dev.to cross-post.
- `HASHNODE_TOKEN` and `HASHNODE_PUBLICATION_ID` — only needed for
  Hashnode cross-posts.
- `CLOUDFLARE_ZONE_ID` — optional future optimization if we choose to
  purge cache directly. Current automation polls the live sitemap until
  the new URLs appear, so this secret is not required.

IndexNow does not need a secret. The public verification key is committed
at `apps/landing-page/public/96b0928121e24fd7b4ef85ae0f8bf1d8.txt`.

### 4. Smoke test

Trigger `blog-indexing-on-deploy.yml` manually with the SHA of any
recent commit that added a blog post:

```bash
gh workflow run blog-indexing-on-deploy.yml \
  -R nexu-io/open-design \
  -f head_sha=<sha>
```

A successful run produces:

- a green check on the workflow
- the `automation/blog-indexing-status` PR refreshed with new rows in
  `docs/blog-indexing-status.md`
- the artifact `blog-indexing-<run-id>` containing the raw JSON
  outputs
- an `indexnow.json` artifact with the IndexNow submission result

If the run fails on the **Submit sitemap** step with a 403, the
service account is not yet an Owner on the GSC property (Step 2).

## Operating

The expected steady state:

- PR opens → `landing-page-ci` runs SEO lint and URL-change guards. A
  post cannot merge if it deletes/renames a live slug without an
  explicit redirect, or if the rendered HTML loses canonical/JSON-LD/OG
  metadata.
- Renames are handled as both a redirect requirement for the old slug
  and a newly deployed URL for the destination slug, so the new page is
  included in the post-deploy readiness and baseline inspection flow.
- New post ships → `landing-page-deploy` runs → `blog-indexing-on-deploy`
  runs → IndexNow is called, GSC sitemap is submitted, and the bot PR
  opens with the baseline verdict plus any available 7d/28d traffic
  metrics.
- Daily monitor runs → at T+1 the post usually moves to
  `Crawled - currently not indexed`. By T+3–T+7 a healthy post is
  `Submitted and indexed`. The status table reflects this.
- If T+7 passes and the post is still not indexed, the monitor opens
  a `Blog indexing — URLs stalled in Search Console` issue listing the
  affected URLs, re-submits them to IndexNow, and records a history
  comment on every refresh. Triage manually using the URL Inspection
  live test if the issue stays open.
- If T+14 passes, a post is indexed, and GSC still reports zero
  impressions, the monitor opens `Blog traffic — indexed posts with zero
  impressions`. Treat that as a distribution/query-fit issue, not an
  indexing issue.

The status PR is intentionally **not** auto-merged. A maintainer
reviews each refresh so the daily diff is part of the team's
awareness of search-side health.

## Files

- `apps/landing-page/scripts/blog-indexing/lib.ts` — GSC auth, URL
  Inspection helper, Search Analytics helper, sitemap helper, retry
  wrapper, type defs.
- `apps/landing-page/scripts/blog-indexing/detect-changed-urls.ts` —
  diff a deploy commit against its parent for added / modified blog
  files.
- `apps/landing-page/scripts/blog-indexing/verify-readiness.ts` —
  HTTP, canonical, noindex, and sitemap presence checks; polls until
  Cloudflare propagation completes.
- `apps/landing-page/scripts/blog-indexing/lint-blog-seo.ts` —
  source/rendered SEO lint for changed posts in CI.
- `apps/landing-page/scripts/blog-indexing/check-blog-url-changes.ts` —
  prevents slug deletes/renames without redirects.
- `apps/landing-page/scripts/blog-indexing/submit-indexnow.ts` —
  submits changed/stalled blog URLs to IndexNow-compatible engines.
- `apps/landing-page/scripts/blog-indexing/submit-sitemap.ts` — PUT
  the sitemap to Search Console (one call per deploy).
- `apps/landing-page/scripts/blog-indexing/inspect-urls.ts` — call
  URL Inspection API per URL; emit `InspectionRecord[]`.
- `apps/landing-page/scripts/blog-indexing/query-search-analytics.ts` —
  query URL-level 7d/28d impressions, clicks, CTR, and position.
- `apps/landing-page/scripts/blog-indexing/render-status.ts` —
  rewrite `docs/blog-indexing-status.md` from the JSON sidecar.
- `apps/landing-page/scripts/blog-indexing/scheduled-window.ts` —
  emit URLs in today's T+1 / T+3 / T+7 / T+14 buckets.
- `apps/landing-page/scripts/blog-indexing/escalate-stalls.ts` —
  decide whether the stall issue needs to open / refresh / close.
- `apps/landing-page/scripts/blog-indexing/escalate-low-traffic.ts` —
  decide whether indexed-but-zero-impression posts need a traffic issue.
- `apps/landing-page/scripts/blog-indexing/crosspost.ts` —
  dry-run/token-gated dev.to or Hashnode cross-post scaffold.
- `apps/landing-page/app/pages/rss.xml.ts`
- `apps/landing-page/public/llms.txt`
- `apps/landing-page/public/_redirects`
- `.github/workflows/blog-indexing-on-deploy.yml`
- `.github/workflows/blog-indexing-monitor.yml`
- `docs/blog-indexing-status.md` — human view (auto-generated)
- `docs/blog-indexing-status.json` — canonical state (auto-generated)

The JSON state records `firstInspectedAt` as the first time automation
successfully captured an inspection for a URL. It is not Google's
first-discovery time; escalation scripts prefer the post frontmatter date
for age windows and only use this inspection timestamp as a fallback.
