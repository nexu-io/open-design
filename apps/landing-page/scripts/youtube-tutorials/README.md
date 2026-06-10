# youtube-tutorials

Keeps `app/content/tutorials/*.md` in sync with the latest community YouTube
tutorials about Open Design, with a human in the loop.

## Flow

```
daily cron (GitHub Actions)
  notify-candidates.ts
    → YouTube Data API search (videos published since the last successful run)
    → drop already-catalogued videos
    → LLM relevance gate (reject lookalikes / roundups)
    → post a numbered digest to Feishu

maintainer reviews the digest in Feishu and replies which numbers to publish

generate-selected.ts  (run by the maintainer / agent)
    → fetch the approved video ids
    → LLM-generate summary + body + category in each video's language
    → write *.md  → open a pull request
```

The cron **never** generates entries or opens PRs on its own — selection is the
human review step, done in Feishu before any content is written.

The same daily digest also lists **user submissions** so they enter the same
review flow:

- **Submission issues** — open issues from the "Submit a tutorial" form (label
  `tutorials`). When a maintainer approves one, generate its entry from the
  video link in the issue body and open a PR with `Closes #<issue>` (the issue
  closes on merge):
  `tsx scripts/youtube-tutorials/generate-selected.ts <video-url-from-issue>`
- **Contribution PRs** — open PRs that touch `app/content/tutorials/**`. They
  are auto-labeled `tutorials` by `.github/workflows/labeler.yml` so the digest
  can list them; review/merge happens on GitHub as normal.

## Files

- `lib.ts` — shared core: relevance gate, LLM copy generation, slug rules,
  markdown writer, existing-id/slug readers.
- `youtube.ts` — YouTube Data API v3 client: key loading, candidate discovery
  (`fetchCandidates`), and id lookup (`fetchByIds`).
- `notify-candidates.ts` — daily cron entry; posts the candidate digest to
  Feishu. Run by `.github/workflows/tutorials-youtube-sync.yml`.
- `generate-selected.ts` — turns approved video ids/URLs into entries.
- `backfill-tutorials.ts` — one-off importer that reads pre-fetched `yt-dlp -j`
  JSON lines (used for the initial backfill).

## Why the relevance gate

A YouTube search for "open design" surfaces many lookalikes (OpenCode,
OpenClaude, a separate small "Open Codesign" repo, generic AI-agent roundups,
and videos that only mention "Claude Design" in passing). Titles alone are not
enough, so every candidate passes an LLM relevance gate (`isAboutOpenDesign`)
before it ever reaches the digest.

## Secrets / env

| Var | Where | Purpose |
| --- | --- | --- |
| `YOUTUBE_API_KEY` | repo secret + `~/.youtube/.env` | YouTube Data API v3 |
| `ANTHROPIC_AUTH_TOKEN` (or `ANTHROPIC_API_KEY`) + `ANTHROPIC_BASE_URL` | repo secret + local env | relevance gate + copy generation (Claude Haiku) |
| `FEISHU_TUTORIALS_WEBHOOK` | repo secret | Feishu custom-bot incoming webhook for the digest |
| `FEISHU_TUTORIALS_SECRET` | repo secret (optional) | only if the Feishu bot has signature verification on |

## Manual runs

```bash
# Reproduce the candidate digest locally (no Feishu post). Without a run-history
# watermark (i.e. locally), it uses a 2-day fallback window; pass --days N for a
# wider catch-up sweep.
npx tsx scripts/youtube-tutorials/notify-candidates.ts --days 14 --print

# Generate approved entries (ids or URLs), then open a PR with the new files
npx tsx scripts/youtube-tutorials/generate-selected.ts dQw4w9WgXcQ https://youtu.be/XXXXXXXXXXX

# Backfill from a yt-dlp dump
yt-dlp -a urls.txt --skip-download --cookies-from-browser chrome -j > videos.jsonl
npx tsx scripts/youtube-tutorials/backfill-tutorials.ts videos.jsonl [--dry-run] [--no-gate]
```
