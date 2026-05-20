# SEO Daily Report

`seo-daily-report` posts a daily Google Search Console summary for
`sc-domain:open-design.ai` to a Feishu group bot.

## Workflow

- Workflow: `.github/workflows/seo-daily-report.yml`
- Script: `apps/landing-page/scripts/seo-daily-report.ts`
- Schedule: every day at 09:00 Asia/Shanghai (`cron: 0 1 * * *`)

The report uses T-2 Search Analytics data and compares it with T-9, the same
weekday one week earlier. GSC backfills recent dates, so T-2 is the stable daily
reporting window. The workflow explicitly requests Search Analytics
`dataState: all` so recently collected data is included even before Google marks
it final.

## Card contents

- Site totals: clicks, impressions, CTR, average position
- Week-over-week deltas
- Top 5 page risers by click delta
- Top 5 page fallers by click delta
- Top 5 query risers by click delta

## Required GitHub Secrets

GSC auth reuses the same secrets as the existing blog indexing workflows. One of
these auth modes must be configured:

| Secret | Required | Notes |
| --- | --- | --- |
| `GSC_SERVICE_ACCOUNT_KEY` | Yes, unless OAuth is configured | Full service-account JSON key. The service-account email must have access to the `open-design.ai` Search Console property. |
| `GSC_OAUTH_CLIENT_ID` | Yes, for OAuth mode | Existing OAuth mode used by blog indexing workflows. |
| `GSC_OAUTH_CLIENT_SECRET` | Yes, for OAuth mode | Existing OAuth mode used by blog indexing workflows. |
| `GSC_OAUTH_REFRESH_TOKEN` | Yes, for OAuth mode | Existing OAuth mode used by blog indexing workflows. |

Feishu posting requires:

| Secret | Required | Notes |
| --- | --- | --- |
| `FEISHU_WEBHOOK_URL` | Yes | Custom bot webhook URL from the target Feishu group. |
| `FEISHU_WEBHOOK_SECRET` | No | Required only if signing verification is enabled for the custom bot. |

## Manual test

From GitHub Actions:

1. Open **Actions -> seo-daily-report**.
2. Click **Run workflow**.
3. Optional: set `dry_run` to `true` to build the card and print JSON without
   posting to Feishu.
4. Optional: set `today` to a `YYYY-MM-DD` value to test a fixed reporting date.

From a local checkout with secrets exported:

```bash
pnpm --filter @open-design/landing-page exec tsx scripts/seo-daily-report.ts --dry-run
```

Remove `--dry-run` to post to Feishu.
