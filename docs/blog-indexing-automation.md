# Blog indexing automation

The Open Design landing page automates the parts of search-engine
indexing that are tied to a production promotion. It does not request
indexing through unsupported Google APIs or browser automation.

This file is the operating manual for the active implementation in
`nexu-io/open-design`.

## What is automated

| Trigger | Job | Outcome |
|---|---|---|
| `landing-page-ci` | `lint-blog-seo.ts` + `check-blog-url-changes.ts` | Changed posts are checked for frontmatter, internal/external links, rendered canonical/JSON-LD/OG metadata, and slug delete/rename redirects before they can merge. |
| `landing-page-production` promotion finishes successfully | `blog-indexing-on-deploy.yml` | New blog URLs are detected, verified ready, submitted to IndexNow, the sitemap-index is re-submitted to GSC, baseline URL Inspection is captured, and baseline Search Analytics is queried. Staging deploys (`landing-page-staging`) never trigger this. |

`blog-indexing-on-deploy.yml` opens or refreshes the
`automation/blog-indexing-status` PR through the `open-design-bot`
GitHub App. The human-readable indexing view is
`docs/blog-indexing-status.md`; the canonical indexing state is the
sidecar `docs/blog-indexing-status.json`.

Before each run renders a new report, it restores the latest files from
the pending `automation/blog-indexing-status` branch when that branch
exists. That keeps inspection history continuous even if the previous
status PR has not been merged yet. If that branch exists but the status
files cannot be restored, the workflow fails and records the restore
failure in the job summary instead of silently starting from stale state.

## What is deliberately not automated

- We do not call Google's Indexing API. It officially supports only Job
  Postings and Livestreams; using it for blog posts risks policy flags
  and provides no real benefit.
- We do not automate clicks against the Search Console UI to "Request
  Indexing."
- We do not ping the legacy `https://www.google.com/ping?sitemap=`
  endpoint. Google deprecated it in 2023.
- We do not run daily Search Console monitoring or traffic digests from
  this repository. Previous zero-run scheduled workflows for those jobs
  were removed; restore them only with a current owner and run-history
  acceptance plan.

## Architecture

Because production is a manual promotion that can bundle several merged
posts, `detect-changed-urls` diffs from the `blog-indexed-prod` git tag
(the last commit this workflow successfully indexed) rather than
`HEAD^`. The tag is force-advanced to the deployed commit at the end of
a successful run, so the next promotion picks up exactly the posts
merged in between. On the very first run the tag does not exist yet and
the workflow bootstraps from `HEAD^`.

```text
landing-page-production --success--> blog-indexing-on-deploy
                                        |
                       detect-changed-urls (base = blog-indexed-prod tag)
                                        |
                       verify-readiness (200 / canonical / sitemap)
                                        |
                       submit-indexnow
                                        |
                       submit-sitemap (one PUT)
                                        |
                       inspect-urls (baseline)
                                        |
                       query-search-analytics
                                        |
                       render-status --> docs/blog-indexing-status.md
                                        |
                                   bot PR
```

All scripts live in `apps/landing-page/scripts/blog-indexing/` and run
under `tsx` directly. Most scripts depend only on Node 24 built-ins
(`crypto`, `fetch`, `child_process`). RSS uses `@astrojs/rss`.

## One-time setup

### 1. Configure Google Search Console auth

Preferred path: OAuth user refresh token. This avoids the Google Search
Console UI bug where newly-created service account emails sometimes
fail with `email not found`.

1. Go to <https://console.cloud.google.com/projectcreate> and create a
   project named `open-design-blog-indexing` or reuse an existing
   project the team owns.
2. Enable the Search Console API under
   <https://console.cloud.google.com/apis/library/searchconsole.googleapis.com>.
3. Create an OAuth desktop client under
   <https://console.cloud.google.com/apis/credentials>.
4. In the OAuth consent screen, keep the app in Testing and add every
   Google account that may grant access under Audience -> Test users.
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
4. Confirm the existing `BOT_APP_CLIENT_ID` and `BOT_APP_PRIVATE_KEY` secrets
   already exist. The bot needs `contents:write`,
   `pull-requests:write`, and `issues:write` for
   `nexu-io/open-design`.

If these secrets are not present yet, the workflow does not fail the
main deploy path. It records the missing configuration in the job
summary, emits a GitHub Actions warning, and skips the GSC / bot-write
steps until the secrets are added.

IndexNow does not need a secret. The public verification key is
committed at
`apps/landing-page/public/96b0928121e24fd7b4ef85ae0f8bf1d8.txt`.

## Smoke test

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
- the artifact `blog-indexing-<run-id>` containing the raw JSON outputs
- an `indexnow.json` artifact with the IndexNow submission result

If the run fails on the Submit sitemap step with a 403, the service
account is not yet an Owner on the GSC property.

## Files

- `apps/landing-page/scripts/blog-indexing/lib.ts` - GSC auth, URL
  Inspection helper, Search Analytics helper, sitemap helper, retry
  wrapper, type defs.
- `apps/landing-page/scripts/blog-indexing/detect-changed-urls.ts` -
  diff a deploy commit against the last indexed production pointer for
  added / modified blog files.
- `apps/landing-page/scripts/blog-indexing/verify-readiness.ts` - HTTP,
  canonical, noindex, and sitemap presence checks; polls until
  Cloudflare propagation completes.
- `apps/landing-page/scripts/blog-indexing/lint-blog-seo.ts` -
  source/rendered SEO lint for changed posts in CI.
- `apps/landing-page/scripts/blog-indexing/check-blog-url-changes.ts` -
  prevents slug deletes/renames without redirects.
- `apps/landing-page/scripts/blog-indexing/submit-indexnow.ts` -
  submits changed blog URLs to IndexNow-compatible engines.
- `apps/landing-page/scripts/blog-indexing/submit-sitemap.ts` - PUT the
  sitemap to Search Console once per deploy.
- `apps/landing-page/scripts/blog-indexing/inspect-urls.ts` - call URL
  Inspection API per URL; emit `InspectionRecord[]`.
- `apps/landing-page/scripts/blog-indexing/query-search-analytics.ts` -
  query URL-level 7d/28d impressions, clicks, CTR, and position.
- `apps/landing-page/scripts/blog-indexing/render-status.ts` - rewrite
  `docs/blog-indexing-status.md` from the JSON sidecar.
- `.github/workflows/blog-indexing-on-deploy.yml`
- `docs/blog-indexing-status.md` - human view
- `docs/blog-indexing-status.json` - canonical state

The JSON state records `firstInspectedAt` as the first time automation
successfully captured an inspection for a URL. It is not Google's
first-discovery time.
