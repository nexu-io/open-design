# NotebookLM: export issues/PRs from Open Design

Open Design gets a lot of feedback via GitHub Issues + PRs. If you want NotebookLM to help with:

- support answers (with citations)
- clustering + taxonomy of user scenarios
- backlog extraction
- evaluation datasets / benchmark prompts

…start by exporting a repo snapshot into a single Markdown file and upload it as a source in NotebookLM.

## Export issues + PRs to Markdown

Prereqs:
- `gh` (GitHub CLI) installed + authenticated
- Node + pnpm (for `tsx`)

From the repo root:

```bash
pnpm exec tsx scripts/notebooklm-export-github.ts \
  --repo nexu-io/open-design \
  --issues open \
  --prs open \
  --limit 50
```

By default, output goes to:

```
notebooklm/<owner>__<repo>.md
```

You can override the output path:

```bash
pnpm exec tsx scripts/notebooklm-export-github.ts \
  --repo nexu-io/open-design \
  --out notebooklm/open-design-snapshot.md
```

### Flags

- `--repo owner/name` (required)
- `--out <path>` (optional)
- `--issues open|closed|all|none` (default: `open`)
- `--prs open|closed|merged|all` (default: `open`)
- `--limit <n>` (default: `50`) — **total item budget across issues + PRs**. If you select multiple states (e.g. `--issues all --prs all`), the exporter will stop once it has written `n` total items.

## Upload to NotebookLM

1) Open NotebookLM
2) Create a new notebook
3) Add a source → upload the generated `.md`
4) Ask questions like:
   - “Summarize the top recurring user problems this week, with links.”
   - “Group issues into a taxonomy (installation, provider auth, UI bugs, exports).”
   - “Suggest 10 high-confidence ‘good first issues’ with rationale.”

## Notes

- The exporter truncates long bodies to keep the file manageable.
- It’s intentionally read-only: it doesn’t change issues or PRs.
