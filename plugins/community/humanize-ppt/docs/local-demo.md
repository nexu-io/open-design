# Local demo

CLI examples moved out of `SKILL.md`. The recommended stable entrypoint is `scripts/humanize_ppt.py`. Versioned scripts remain available for compatibility.

> **`--out` must be a dedicated run directory.** Brief mode (no `--preview-outline`/`--confirm-outline`/`--qa-from`/`--style-gallery` flag) wipes `--out` and rebuilds it from scratch on every run. It only does that automatically when `--out` is missing, empty, or already looks like a previous Humanize PPT run (has `run_manifest.json`, `style_gallery_plan.json`, `outline-preview.md`, or `preview-confirmed.json` at its root). Point it at anything else — a folder with unrelated files in it — and the run refuses with a clear error instead of deleting your content; pass `--force` if you really want it wiped anyway.

Brief mode (v0.6.4 default — writes a Guizang production brief, no HTML):

```bash
python3 scripts/humanize_ppt.py \
  --source examples/01-ai-tool-update/source.md \
  --out .humanize-ppt-runs/ai-tool-update-v0.6.4 \
  --title "AI 工具更新，不只是功能清单" \
  --renderer guizang \
  --guizang-style A
```

The next agent reads `guizang-production-prompt.md` and renders natively via `guizang-ppt-skill`. Once the deck is rendered, run the presentation checkup:

```bash
python3 scripts/humanize_ppt.py \
  --qa-from .humanize-ppt-runs/ai-tool-update-v0.6.4/rendered/index.html \
  --out .humanize-ppt-runs/ai-tool-update-v0.6.4 \
  --renderer guizang \
  --guizang-style A \
  --max-qa-iterations 3
```

English paths use the same shape with `--renderer beautiful-html-templates` or `--renderer frontend-slides`; both are `support_level: full` after real-deck checks and renderer-specific rules.

Native editable PowerPoint:

```bash
python3 scripts/humanize_ppt.py \
  --source examples/01-ai-tool-update/source.md \
  --out .humanize-ppt-runs/ai-tool-update-pptx \
  --title "AI 工具更新，不只是功能清单" \
  --renderer ppt-master \
  --ppt-master-transition fade
```

The downstream agent starts from `ppt-master-production-prompt.md`, follows PPT Master's mandatory confirmation and native export workflow, then feeds the deck back with `--qa-from <deck.pptx> --renderer ppt-master`. Add `--ppt-master-template <raw.pptx>` only when the user supplied a native template deck; that switches to `template-fill-pptx`.

Outline preview (audience state-transfer map from an existing `slide_plan.json`, zero-dependency single-file HTML):

```bash
python3 scripts/preview_outline_html.py \
  --slide-plan .humanize-ppt-runs/ai-tool-update-v0.6.4/slide_plan.json \
  --out .humanize-ppt-runs/ai-tool-update-v0.6.4/preview-outline.html \
  --title "AI 工具更新，不只是功能清单"
```

The legacy V0.2-compatible entrypoint remains available for compatibility with earlier agents:

```bash
python3 scripts/humanize_ppt_v2.py \
  --source examples/01-ai-tool-update/source.md \
  --out .humanize-ppt-runs/ai-tool-update-v0.2 \
  --title "AI 工具更新，不只是功能清单" \
  --renderer auto
```

Legacy V0.1 demo remains available:

```bash
python3 scripts/humanize_ppt_v1.py \
  --source examples/01-ai-tool-update/source.md \
  --out .humanize-ppt-runs/ai-tool-update \
  --title "AI 工具更新，不只是功能清单"
```
