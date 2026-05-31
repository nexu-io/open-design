---
name: od-contribute
description: One-click contribution flow for Open Design (nexu-io/open-design) — even for non-coders. Pick one of four cards (ship a Skill or Design System you made with OD; translate docs; fix a typo / write a blog; report a bug), the agent validates and opens a PR (or issue) for you. Trigger words contribute to open design, ship my OD skill, ship my OD design system, translate OD docs, report an OD bug, od-contribute.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - AskUserQuestion
  - TaskCreate
  - TaskUpdate
  - WebFetch
---

# od-contribute — first-contribution flow for Open Design

Locked to `nexu-io/open-design`. Branches by **contribution type**, not by issue. Replaces the dev-loop with type-specific no-code validators. Designed so a product user with zero coding background can ship a real PR.

## Language

Mirror the user's language in every user-facing message — `AskUserQuestion` labels and descriptions, status updates, error explanations. Detect from their first message; when uncertain, default to English.

**Generated artifacts (PR titles, commit messages, PR/issue body files, branch names) MUST be English** regardless of the user's chat language. GitHub conventions, maintainer review, and search all assume English. The templates under `templates/` are already English — keep them that way when rendering.

Scripts live under `scripts/`. Source the shared helpers from any script:

```bash
source "$(dirname "$0")/config.sh"
```

`SKILL_DIR` below = the directory that contains this `SKILL.md`.

---

## Step 1 — Prereq check (always first)

```bash
bash "$SKILL_DIR/scripts/check-prereqs.sh"
```

- Exit 0: capture `GH_USER=<login>` from stdout. Default `TARGET_FORK="${GH_USER}/open-design"`.
- Exit 2: surface the printed install / auth hint **verbatim** and stop. Do not attempt token workarounds.

If `gh repo view "$TARGET_FORK"` fails, ask the user (one `AskUserQuestion`) whether to fork now via `gh repo fork nexu-io/open-design --clone=false`. Default to yes.

## Step 2 — Pick contribution type

Single `AskUserQuestion` (header: "Contribution", multiSelect: false), four options. Translate option labels/descriptions into the user's chat language; the branch routing is unchanged.

1. **🎨 Ship something I made with OD** — _a Skill, Design System, HyperFrame, or template I want to contribute upstream_ → branch `3a`
2. **🌍 Translate OD docs** — _README / QUICKSTART / CONTRIBUTING into a new language_ → branch `3b`
3. **📝 Fix docs / write a blog / fix a typo** — _typo fix, dead link, use-case writeup_ → branch `3c`
4. **🐛 Report a bug** — _something broke; I'll help turn it into a high-quality issue_ → branch `3d` (issue path, no PR)

Each branch below is self-contained. Steps 7–8 (preview + push) are shared across branches `3a`/`3b`/`3c`. Branch `3d` skips them entirely.

---

### Step 3a — OD product submission (Skill / Design System)

**3a.1** Ask user: "What's the local path to the artifact you want to ship?" (single free-text, translated into the user's chat language). Common: a folder path (Skill) or a single `DESIGN.md` file (Design System).

**3a.2** Sniff type:

```bash
# Skill: folder containing SKILL.md with frontmatter.
# Design System: file matching DESIGN.md anatomy.
```

If ambiguous, ask the user to confirm.

**3a.3** Run setup:

```bash
bash "$SKILL_DIR/scripts/setup-workspace.sh" skill <slug>
# or
bash "$SKILL_DIR/scripts/setup-workspace.sh" design-system <slug>
```

`<slug>` is `od::slugify` of the Skill `name` frontmatter field or of the brand name. Capture `WORKDIR` from stdout.

**3a.4** Copy artifact into workspace at the right target dir:
- Skill → `$WORKDIR/skills/<slug>/`
- Design System → `$WORKDIR/design-systems/<brand-slug>/DESIGN.md` (+ any sibling assets in the same folder)

**3a.5** Validate:

```bash
bash "$SKILL_DIR/scripts/validate-skill-submission.sh" "$WORKDIR/skills/<slug>"
# or, with 1-2 reference DESIGN.md files passed in:
bash "$SKILL_DIR/scripts/validate-design-system.sh" \
  "$WORKDIR/design-systems/<slug>/DESIGN.md" \
  --reference "$WORKDIR/design-systems/airbnb/DESIGN.md" \
  --reference "$WORKDIR/design-systems/apple/DESIGN.md"
```

If validation fails, surface the FAIL lines verbatim, ask the user to fix, retry. **Never push a failing artifact.**

**3a.6** Ask 3 short questions via `AskUserQuestion` (translate the labels into the user's chat language):
- "What name should we credit you under in the PR?" — free-text
- "One-line pitch for this Skill / Design System?" — free-text
- "Path to a screenshot (optional)?" — free-text

**3a.7** Render `templates/PR-BODY-skill.md` (or `PR-BODY-design-system.md`) with substitutions:
- `{{SKILL_NAME}}`, `{{SKILL_SLUG}}` (or `{{BRAND_NAME}}`, `{{BRAND_SLUG}}`)
- `{{PITCH}}` (the one-line)
- `{{MOTIVATION}}` (free-text — agent can offer to draft this from the skill body, but user confirms)
- `{{TRY_PROMPT}}` (a prompt they recommend trying — agent suggests a default, user confirms)
- `{{SCREENSHOT_BLOCK}}` (Markdown image block if a screenshot path was given, else empty)
- `{{DISCORD_INVITE}}` from `$OD_DISCORD_INVITE`

Write to `$WORKDIR/.od-contrib/PR-BODY.md`.

→ Jump to **Step 7**.

---

### Step 3b — i18n translation

**3b.1** Setup workspace (slug = `translate-<doc>-<lang>` if known, else `translate`):

```bash
bash "$SKILL_DIR/scripts/setup-workspace.sh" i18n translate
# capture WORKDIR
```

**3b.2** Discover gaps:

```bash
bash "$SKILL_DIR/scripts/discover-i18n-gaps.sh" "$WORKDIR" > /tmp/od-i18n-gaps.json
```

Each line is JSON. Rank by:
- `status: "missing"` first (missing language is highest leverage)
- then `status: "stale"` ordered by `english_commits_since_translation` desc
- README family before QUICKSTART before CONTRIBUTING

**3b.3** Take the top 3–4 gaps and present via `AskUserQuestion` (header: "Translation target"). Each option label like: `README → 한국어 (Korean)` / `QUICKSTART (zh-CN) refresh — 12 commits behind`. Translate the header text into the user's chat language but keep the option labels descriptive (the language names belong in their native script).

**3b.4** Once user picks, **rename branch** to be specific:
```bash
git -C "$WORKDIR" branch -m "od-contrib/i18n/<doc>-<lang>-<date>"
```
(or pre-set the slug in step 3b.1 if the user confirmed earlier.)

**3b.5** Translate. Read the English source. Translate **structure-preserving**:
- Code blocks: leave untranslated
- Brand / product names: leave untranslated
- Filenames in inline code: leave untranslated
- Image / link targets: leave untranslated; if a localized version of a linked doc exists, swap the link to the localized file
- Headings: translate, keep the heading depth identical
- Tables: translate cell text only, keep alignment / pipes

Write the result to `$WORKDIR/<TRANSLATED_PATH>` (e.g. `QUICKSTART.es.md`). Show user a unified diff vs. the English source for visual sanity-check (line-count delta within ±15% is a healthy signal).

**3b.6** Validate the translated file against the English source. The `--reference` flag tells the validator to ignore relative refs that were already broken in the source — OD docs frequently link to website route slugs (e.g. `skills/blog-post/`) that aren't files on disk; we don't want a structure-preserving translation to fail because of pre-existing dead refs.

```bash
bash "$SKILL_DIR/scripts/validate-markdown.sh" \
  "$WORKDIR/<TRANSLATED_PATH>" \
  --reference "$WORKDIR/<ENGLISH_PATH>"
```

If FAIL → surface verbatim, fix, retry.

**3b.7** Render `templates/PR-BODY-i18n.md` with `{{DOC_NAME}}`, `{{LANG_DISPLAY_NAME}}`, `{{LANG_CODE}}`, `{{TRANSLATED_PATH}}`, `{{ENGLISH_PATH}}`, `{{STATUS}}`, `{{TRANSLATION_NOTES}}` (one paragraph from the agent: anything tricky, untranslated terms it kept, etc.), `{{DISCORD_INVITE}}`.

→ **Step 7**.

---

### Step 3c — Docs / blog / typo

**3c.1** Setup workspace (slug `docs`):

```bash
bash "$SKILL_DIR/scripts/setup-workspace.sh" docs <slug>
```

**3c.2** Ask user (one `AskUserQuestion`):
1. **Auto-discover small fixes** (run discover-doc-gaps, pick something)
2. **I have a specific fix in mind** (free-text)
3. **I want to write a blog / case study** (free-text — what's the use case?)

**3c.3 (Auto-discover branch)** Run:

```bash
bash "$SKILL_DIR/scripts/discover-doc-gaps.sh" "$WORKDIR" > /tmp/od-doc-gaps.json
```

Group by `kind` (typo / deadlink / todo). Show the user up to 6 candidates via `AskUserQuestion`. Once picked, apply the fix in code (typo: replace word; deadlink: ask user for the new URL; todo: that's a proper task, ask user to write the missing prose).

**3c.4 (Specific-fix branch)** Read the file, apply user's described change. Confirm via diff.

**3c.5 (Blog branch)** First check whether OD has a blog directory:

```bash
ls "$WORKDIR/docs" 2>/dev/null
```

If a `docs/blog/` or similar exists, place the new post there. If not, ask the user where it should live, defaulting to `docs/<slug>.md`. Generate an outline → user fills in user-specific bits (their use case, screenshots, the prompt they used, the rendered output) → agent stitches into a final Markdown.

**3c.6** Validate every changed/added file. For files that already exist in the repo (typo fix, dead-link fix, doc edit), pass `--reference` pointing at HEAD's version so we only fail on relative refs the user *introduced*, not on pre-existing route slugs:

```bash
# For modifications to existing files:
git -C "$WORKDIR" show "HEAD:<path>" > "/tmp/od-contrib-orig-<basename>" 2>/dev/null
bash "$SKILL_DIR/scripts/validate-markdown.sh" \
  "$WORKDIR/<changed-path>" \
  --reference "/tmp/od-contrib-orig-<basename>"

# For brand-new files (e.g. a blog post the user is creating from scratch),
# omit --reference. The validator will skip the relative-ref check entirely
# (since it can't tell route slugs from real paths in isolation).
```

**3c.7** Render `templates/PR-BODY-docs.md` with `{{ONE_LINE_SUMMARY}}`, `{{DETAILS}}`, `{{FILES_LIST}}`, `{{DISCORD_INVITE}}`.

→ **Step 7**.

---

### Step 3d — Bug report (issue path, no PR)

**3d.1** Read OD's actual schema at runtime to make sure we mirror it:

```bash
gh api "repos/${TARGET_REPO}/contents/.github/ISSUE_TEMPLATE/bug-report.yml" --jq .content | base64 -d > /tmp/od-bug-report.yml
```

If the schema has drifted from the template (`templates/ISSUE-BODY-bug.md`), regenerate the body to match.

**3d.2** Ask the user via `AskUserQuestion`, one structured prompt per critical field. Use **plain language**, not the YAML field names:

| Bug-report field | Prompt to user |
|---|---|
| `description` | "What went wrong? One sentence is fine." |
| `steps` | "How can I reproduce it? Walk me through step by step." |
| `expected` | "What did you expect to happen?" |
| `version` | "Which OD version are you running? (About menu, or `od --version`)" |
| `platform` | dropdown: macOS (Apple Silicon) / macOS (Intel) / Windows / Linux / Other |
| `logs` | "Any error logs you can paste? Skip if you don't have them." |
| `screenshots` | "Path to a screenshot? Skip if you don't have one." |

Translate every prompt above into the user's chat language at runtime.

**3d.3** Auto-collect what we can (these don't need to ask the user):
- OS family from `uname`
- Node version from `node -v` if relevant

**3d.4** Dedupe: extract 3–5 keywords from the description, run:

```bash
gh search issues "<keywords>" --repo "$TARGET_REPO" --state open --limit 5 --json number,title,url
```

If matches exist, present them to the user via `AskUserQuestion` (translate to user's language): "These existing issues look related. Do you want to: (a) comment on an existing one, (b) open a new issue anyway, (c) cancel?"

**3d.5** If proceeding with new issue, render `templates/ISSUE-BODY-bug.md` and submit:

```bash
bash "$SKILL_DIR/scripts/create-issue.sh" \
  --title "$TITLE" \
  --body-file "$WORKDIR_OR_TMP/.od-contrib/ISSUE-BODY.md" \
  --dedupe-keywords "<keywords>"
```

**3d.6** Print the issue URL on its own line. **Do not** push branches or open PRs from this branch.

---

## Step 7 — Preview + confirm (shared, PR branches only)

Show the user a clean summary:

```text
About to commit:
  Branch:  od-contrib/<type>/<slug>-<date>
  Files:
    + skills/foo/SKILL.md            (1.2 KB)
    + skills/foo/preview.png         (54 KB)
  Push to:  <fork or upstream>
  Open PR:  nexu-io/open-design:main ← <fork>:<branch>
```

Then `git -C "$WORKDIR" diff --stat` and a `head -40` of the rendered PR body for visual sanity.

Required `AskUserQuestion` confirmation (translate to user's language): **"Push this PR?"** with three options:
- **Ship it** — proceed to Step 8
- **Let me revise** — return to the relevant Step 3 sub-step
- **Cancel** — leave the workspace on disk, tell the user the path so they can return later, exit

Never push without an explicit "Ship it".

## Step 8 — Push & open PR

```bash
bash "$SKILL_DIR/scripts/create-pr.sh" \
  --workdir "$WORKDIR" \
  --type "<skill|design-system|i18n|docs>" \
  --title "<PR title from references/newcomer-tone.md>" \
  --body-file "$WORKDIR/.od-contrib/PR-BODY.md"
```

Print the PR URL on its own line. Done.

---

## Safety rails (mandatory)

- Never push to `main` / `master` / `develop`. The push scripts refuse.
- Never `--force` push. Just don't.
- All workspace activity stays under `$OD_WORK_ROOT` (default `$HOME/od-contrib-work`). `od::assert_in_workroot` enforces this.
- Bug-report path **always** runs the dedupe search before `gh issue create`.
- Honor user memory: skip GitHub user `xxiaoxiong` from any contributor lookup ([[feedback_no_outreach_xxiaoxiong]]).

## When NOT to use this skill

- The user wants to fix a daemon / web bug or add a feature with code changes → use `auto-github-contributor` instead (it has the TDD loop). This skill deliberately doesn't run lint/typecheck/tests because content paths don't need them.
- The user wants to *generate* a Skill / Design System from scratch → that's Open Design itself. Run OD first, get an artifact, then come back here to ship it.
