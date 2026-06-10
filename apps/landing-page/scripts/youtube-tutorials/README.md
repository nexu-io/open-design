# youtube-tutorials

Keeps `app/content/tutorials/*.md` in sync with the latest community YouTube
tutorials about Open Design.

## Files

- `lib.ts` — shared core: relevance gate, LLM copy generation, slug rules,
  markdown writer, existing-id/slug readers.
- `fetch-youtube-tutorials.ts` — daily cron entry. Queries the YouTube Data API
  v3, filters out videos already in the catalogue and lookalike products, and
  writes new entries. Run by `.github/workflows/tutorials-youtube-sync.yml`.
- `backfill-tutorials.ts` — one-off importer that reads pre-fetched `yt-dlp -j`
  JSON lines instead of the API (used for the initial backfill).

## How it stays accurate

A YouTube search for "open design" surfaces many lookalikes (OpenCode,
OpenClaude, a separate small "Open Codesign" repo, generic AI-agent roundups,
and unrelated tools whose title merely mentions "Claude Design"). Titles alone
are not enough, so every candidate passes an **LLM relevance gate**
(`isAboutOpenDesign`) that confirms the video is specifically about nexu-io's
Open Design before any entry is generated. The same model then writes the
summary, body, and category in the video's own language.

## Secrets / env

| Var | Where | Purpose |
| --- | --- | --- |
| `YOUTUBE_API_KEY` | repo secret + `~/.youtube/.env` locally | YouTube Data API v3 search/videos |
| `ANTHROPIC_AUTH_TOKEN` (or `ANTHROPIC_API_KEY`) + `ANTHROPIC_BASE_URL` | repo secret + local env | LLM relevance gate + copy generation (Claude Haiku) |
| `BOT_APP_ID` + `BOT_APP_PRIVATE_KEY` | existing repo secrets | open-design-bot token used to open the PR |

The workflow opens a pull request for maintainer review; it never pushes to
`main`.

## Manual runs

```bash
# Daily-style sweep via the API (needs YOUTUBE_API_KEY + ANTHROPIC_*)
npx tsx scripts/youtube-tutorials/fetch-youtube-tutorials.ts --days 14 [--dry-run]

# Backfill from a yt-dlp dump (needs ANTHROPIC_* only)
yt-dlp -a urls.txt --skip-download --cookies-from-browser chrome -j > videos.jsonl
npx tsx scripts/youtube-tutorials/backfill-tutorials.ts videos.jsonl [--dry-run] [--no-gate]
```
