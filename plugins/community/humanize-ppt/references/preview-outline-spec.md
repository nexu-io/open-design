# v0.6.6 Spec: `--preview-outline` Flag (v0.6.5 → v0.6.6 Design)

Date: 2026-06-03
Status: Spec, not implemented. Will land in v0.6.6.

## Motivation

In v0.6.5, `python3 scripts/humanize_ppt.py --research-md <path> --renderer guizang` writes a `<renderer>-production-prompt.md` and stops. The next agent (the user's downstream-skill runner) reads the brief and renders. This works, but the human in the loop has no chance to review the deck structure before commit.

The 9-style showcase on "10 分钟入门 Agent 7 概念" exposed this gap concretely:
- The HV research doc had clean content but a methodology footer that leaked Khazix attribution into the deck.
- Slide titles from subsection H2s were too long for layout slots.
- Three takeaway pages had almost-empty visible_content, producing visually empty slides.

These three problems would have been caught in 5 minutes by a human reading a deck outline before the render subagent was spawned. The fix is an explicit **review checkpoint** between the AST slice and the brief write.

## Design

### New flag

```
--preview-outline           (boolean, default off)
```

When passed, the brief writer:

1. Runs the AST slice (current behavior)
2. Writes `outline-preview.md` to the output directory
3. **Stops** — does not write the production prompt
4. Prints to stdout:

   ```json
   {
     "ok": true,
     "stopped_at": "preview-outline",
     "outline_path": "<out>/outline-preview.md",
     "next_step": "Review the outline. Re-run with --confirm-outline to write the production prompt."
   }
   ```

When `--preview-outline` is **not** passed (current default), behavior is unchanged: brief is written, the next agent can run.

### `--confirm-outline` flag

```
--confirm-outline           (boolean, default off)
```

After the human reviews `outline-preview.md`, re-running with `--confirm-outline` resumes the brief write. Implementation:

1. Read `outline-preview.md` from the output directory (must exist, must have been written within the last N minutes — TBD: N = 60?).
2. Run the same AST slice, verify it matches the saved outline (catch the case where the user re-ran with a different source mid-review).
3. Write the production prompt as normal.
4. Write a `preview-confirmed.json` next to the outline recording the confirmation timestamp.

If `--confirm-outline` is passed but `outline-preview.md` does not exist, exit 2 with a stderr hint to re-run with `--preview-outline` first.

### `--edit-outline` flag (future, not in v0.6.6)

A future flag would let the user edit `outline-preview.md` directly and have Humanize honor the edits instead of regenerating from the source. Not in v0.6.6 — would require a reverse-parse step.

## Output format: `outline-preview.md`

A human-readable markdown file with:

```markdown
# Outline preview

> AST slice: 1 cover + 1 hook + 1 context + 1 tension + 2 method + 1 proof + 2 takeaway
> Source: <research-md path>
> Renderer: guizang · Style: A · Theme: ink-classic
> Slides: 8

## S01 · cover
Title: 10 分钟入门 Agent 的 7 个核心概念
Body (kicker line only)

## S02 · hook · 38 字
Title: Agent 圈 7 个名词你能分清几个
Body:
  7 个词都在同事嘴里蹦过：Agent、Tool、MCP、Skill、Rules、Hook、Subagent。
  但问起来，没人能说全它们各自是什么、彼此什么关系。

## S03 · context · 45 字
Title: LLM 怎么从说话变成做事
Body:
  2020 GPT-3 只能写文本...

## S04 · tension · 58 字
...

## S05 · method · 73 字
Title: 7 概念对比：谁触发 / 在哪层 / 干什么
Body: (table-style content)
Layout hint: table (4 col × 7 row)

## S06 · method · 42 字
...

## S07 · proof · 22 字
...

## S08 · takeaway · 46 字
...

## S09 · takeaway · 42 字
...

---

## Per-page media decisions (Humanize-owned)

- S01 cover  | image=gpt-photo (cover hero photo)
- S02 hook   | diagram=svg-html
- S03 context | image=svg-html
- S04 method | diagram=svg-html, video=remotion-clip 10s
- S05 method | image=screenshot, diagram=svg-html, video=remotion-clip 8s
- S06 method | image=svg-html
- S07 proof  | image=svg-html
- S08 takeaway | image=svg-html
- S09 takeaway | image=svg-html

---

## Review checklist

- [ ] Title counts fit the layout slot (≤ 15 中文字 for cover/headline, ≤ 25 ASCII for body)
- [ ] All visible_content ≥ 30 中文字 (no empty pages)
- [ ] No banned substrings (Khazix, methodology, attribution) in any body
- [ ] 7 concepts (Agent / Tool / Function calling / MCP / Skill / Rules / Hook / Subagent) all present
- [ ] Per-page media decisions make sense for the page role

When reviewed, re-run with `--confirm-outline` to write the production prompt.
```

## CLI surface

```bash
# v0.6.5 behavior (unchanged)
python3 scripts/humanize_ppt.py \
  --research-md source.md \
  --out <dir> \
  --renderer guizang \
  --guizang-style A --guizang-theme ink-classic

# v0.6.6: review checkpoint
python3 scripts/humanize_ppt.py \
  --research-md source.md \
  --out <dir> \
  --renderer guizang \
  --guizang-style A --guizang-theme ink-classic \
  --preview-outline
# → writes outline-preview.md, stops
# → human reads outline-preview.md
python3 scripts/humanize_ppt.py \
  --research-md source.md \
  --out <dir> \
  --renderer guizang \
  --guizang-style A --guizang-theme ink-classic \
  --confirm-outline
# → reads outline-preview.md, writes production-prompt.md
```

## Edge cases

| Case | Behavior |
| --- | --- |
| `--preview-outline` passed but `--out` dir already has production prompt | Refuse, stderr "outline-preview mode requires fresh out dir, or use --force" |
| `--confirm-outline` passed but outline missing | Exit 2, hint to run `--preview-outline` first |
| `--confirm-outline` passed, source-md mtime newer than outline | Refuse, "source changed since outline, re-run --preview-outline" |
| `--preview-outline` + `--qa-from` together | `--qa-from` wins (qa mode is its own thing, no brief written) |
| `--preview-outline` + `--skip-install-check` | OK, install check is warn-only, doesn't block outline |

## Tests

`tests/test_v066_preview_outline.py`:

1. `--preview-outline` writes `outline-preview.md`, exits 0 with `stopped_at: preview-outline`
2. No `guizang-production-prompt.md` is written
3. `--confirm-outline` then writes `guizang-production-prompt.md`, exits 0 normally
4. `--confirm-outline` without prior `--preview-outline` exits 2
5. Source mtime check: `--confirm-outline` after editing source.md refuses
6. Outline contains the per-page media decisions section
7. Outline contains the review checklist section
8. 8-slide deck outline has 8 H2 sections in the markdown

## Acceptance

- The Khazix-leak problem from v0.6.5 would be caught by the "No banned substrings" review item.
- The title overflow problem from v0.6.5 would be caught by the "Title counts fit" review item.
- The empty takeaway problem from v0.6.5 would be caught by the "All visible_content ≥ 30 中文字" review item.

All three problems surface in the 5-minute human review window between `--preview-outline` and `--confirm-outline`.

## Out of scope (v0.6.6)

- `--edit-outline` (human edits the outline, Humanize honors it)
- Multi-source concatenation (multiple `--research-md` files merged into one outline)
- Auto-validate outline against downstream skill's known layout constraints (e.g., warn if a B-style outline has > 22 Sxx-marked slides)
- Visual diff between consecutive outline versions

These are all candidate v0.6.7 features.
