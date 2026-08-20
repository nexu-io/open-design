---
name: pull-from-drive
description: Sync qualified-bank edits from Google Drive back to local git-tracked file
---

# Pull Qualified Bank from Drive

Fetches your latest browser edits from Drive and merges them into the local `qualified-bank-LIVE.html` file with a safety check.

## Usage

Type `/pull-from-drive` anytime you've made edits in the artifact browser and want to lock them into git.

## What it does

1. Fetches `qualified-bank-op-state.json` from your Drive UPDATES folder (folder ID: 0ABaeWQ9wgO65Uk9PVA)
2. Merges into local file using the artifact's own merge logic (overlay saved fields onto matching address+apt, keep new entries)
3. Shows you a one-line diff summary before writing
4. Asks for confirmation
5. Commits to git with timestamp

## Data flow

Browser artifact (localStorage) → Google Drive (Save to Drive button) → `/pull-from-drive` → Local git file

## Safety

- Manual trigger only — no automatic overwrites
- Diff summary shown before any commit
- Never overwrites silently
- Old browser tabs can't surprise you

## Workflow

1. Edit in the artifact (video tours, floor plans, highlights, confirmed dates)
2. Click "☁ Save to Drive" (one-time permission grant first)
3. Say `/pull-from-drive` when ready to commit to git
4. Review the diff summary and confirm
5. Changes committed with git auto-backup hooks
