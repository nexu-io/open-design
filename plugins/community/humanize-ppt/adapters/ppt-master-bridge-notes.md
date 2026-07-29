# PPT Master bridge contract

## Boundary

Humanize owns the audience-state-transfer story and writes `ppt-master-source.md` plus `ppt-master-production-prompt.md`. PPT Master owns project creation, mandatory Strategist confirmation, `design_spec.md`, `spec_lock.md`, sequential SVG authoring, notes packaging, native DrawingML export, animations, and template-fill.

Humanize never imports PPT Master's templates and never patches the exported OOXML.

The production brief resolves a real Python 3.10+ interpreter (`--ppt-master-python` overrides auto-detection) and uses `PPT_MASTER_PYTHON` for every downstream script. A binary merely named `python3` is not assumed compatible.

## Routes

| Humanize input | PPT Master route | Gate |
|---|---|---|
| Markdown/document/text plus `--renderer ppt-master` | Main SVG pipeline | PPT Master's three-stage Strategist confirmation |
| `--ppt-master-template <raw.pptx>` plus content | `workflows/template-fill-pptx.md` | Fill-plan page sequence remains `draft` until user review |
| `--style-gallery --renderer ppt-master` | PPT Master native Confirm UI | No speculative Humanize cover projects |

A raw `.pptx` template is never treated as a PPT Master SVG template directory. Creating a reusable SVG template remains PPT Master's `create-template` workflow and requires an explicit resulting directory path.

## Semantic mapping

- `slide_plan.json` page order/count/message → `ppt-master-source.md`; preserve unless the user changes it at PPT Master's confirmation gate.
- `speaker_intent.md` → `notes/total.md` in the main route or `fill_plan.json slides[].notes` in template-fill.
- `gpt-photo` → PPT Master `Acquire Via: ai` unless the asset already exists.
- `screenshot` → user/web factual asset; never synthesize UI evidence.
- `svg-html` / `html-table` → deterministic SVG or a native table/chart marker.
- Humanize video slots → explicit native-motion/static-keyframe/narrated-export fallback; PPT Master does not promise arbitrary MP4 embedding.
- `--presenter` stays native: embedded notes feed PowerPoint Presenter View; Humanize does not append an `html-ppt` renderer.
- `--export-adapter` delegates to PPT Master's native PPTX export and render manifest instead of producing Humanize's HTML/PDF package.
- In `template-fill-pptx`, native tables/charts and existing object animation XML are preserved from selected template slides. The route uses `apply --transition`; it does not accept the main SVG route's `-a` or `--native-objects` flags.
- `template-fill-pptx` v1 cannot replace images or add/retime object animations. Those requests must keep the template asset, choose another layout, become a separately approved direct-PPTX task, or be reported as `Needs-Manual`.

## Output and checkup

PPT Master keeps its project export as the source of truth and places a byte-identical copy at `outputs/ppt-master-rendered/deck.pptx`. Humanize then runs:

```bash
python3 scripts/humanize_ppt.py \
  --qa-from outputs/ppt-master-rendered/deck.pptx \
  --out <humanize-run> \
  --renderer ppt-master \
  --ppt-master-transition fade \
  --max-qa-iterations 3
```

The checkup reads OOXML and verifies package integrity, slide count, placeholder residue, non-empty editable slides, speaker notes, AST/notes drift, relationships, requested transitions, and requested native table/chart objects. Visual collision/overflow remains downstream browser review.
