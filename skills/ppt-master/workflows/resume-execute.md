---
description: Phase B entry — resume PPT execution in a fresh chat after Phase A (SKILL.md Step 1-5) completed in a previous session. Reads project state from disk and runs Step 6 + Step 7 with no Phase-A context carry-over.
---

# Resume Execute Workflow

> Standalone Phase-B entry. Run when Phase A (SKILL.md Step 1–5) completed in a previous session and the user wants to continue with SVG generation + export. Loads project state from disk and runs Step 6 + Step 7 in a clean session.

This workflow is **independent**: it owns Phase B starting from a fresh chat — no upstream conversation context required. By isolating SVG generation in its own session, the model gains 20–40K context headroom by not carrying Phase A's eight-confirmation dialogue, image search/fetch results, or Strategist references.

## When to Run

The user opens a new chat and gives a phrase that names a project path and signals continuation. Recognize any of:

| Pattern | Example |
|---|---|
| "继续生成 projects/<project_name>" | "继续生成 projects/ppt169_joe_hisaishi" |
| "resume execution projects/<project_name>" | "resume execution projects/ppt169_joe_hisaishi" |
| Project path + any "继续 / 恢复 / 继续做 / 接着做" semantic | "把 projects/ppt169_joe_hisaishi 继续做完" |

**Prerequisite**: Phase A must have completed in the named project. Verified by file presence in Step 1; do NOT auto-trigger Phase A on missing state.

---

## Step 1: Sanity check

Verify the project's Phase-A artifacts before doing anything else:

| File / Directory | Required when | Reason |
|---|---|---|
| `<project_path>/spec_lock.md` | Always | Strategist's execution contract; Executor reads it per page |
| `<project_path>/design_spec.md` | Always | Section IX page outline; Executor cross-references it |
| `<project_path>/images/` | `spec_lock images` references any image | Images must exist for embedding |
| `<project_path>/templates/` | `spec_lock page_layouts` / `page_charts` references any | Layout / chart SVGs needed for batch read |

If any required artifact is missing → report which one(s) and stop. Do NOT auto-fall-back into Phase A; the user must either complete Phase A in the original session or explicitly restart.

---

## Step 2: Load SKILL.md, proceed from Step 6

```
Read skills/ppt-master/SKILL.md
```

Then jump to `### Step 6: Executor Phase` and run the documented pipeline:

- Read references (executor-base + shared-standards + chosen style file + image-layout-spec + svg-image-embedding)
- Design Parameter Confirmation
- Pre-generation Batch Read (every layout / chart SVG referenced in `spec_lock`)
- Per-page `spec_lock` re-read + sequential page generation
- Quality Check Gate
- Speaker notes generation
- Step 7: Post-processing & Export (`total_md_split` → `finalize_svg` → `svg_to_pptx`)

The fresh session pays the cost of re-reading references (~14K tokens) but earns back substantially more headroom by dropping Phase A's accumulated context. Net win in both window pressure and reasoning budget per page.

**Source materials**: Phase B is a fresh session; `<project_path>/sources/<file>.md` is NOT in context. The Executor SHOULD read the relevant `sources/` files when crafting per-page content — they hold the concrete facts, quotes, names, and details that turn skeleton outlines into substantive slides. `design_spec.md §IX` only carries the per-page intent; the source materials carry the texture. The Phase A → Phase B split is designed to free context budget precisely for this kind of high-quality enrichment.

> Note: this workflow does NOT duplicate Step 6 / Step 7 content. SKILL.md is the authoritative procedure; resume-execute only adds the resumption entry (When to Run + Step 1 sanity check above) and the source-materials guidance above.

---

## Step 3: Hand-back

When Step 7 completes and `exports/<project_name>_<timestamp>.pptx` is produced, the workflow ends. Report the export path to the user.

If the deck contains data charts, the [`verify-charts`](verify-charts.md) workflow runs between Step 6 and Step 7 as documented in SKILL.md — resume mode handles it the same way the continuous mode does.
