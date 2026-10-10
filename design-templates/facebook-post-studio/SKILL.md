---
name: facebook-post-studio
description: |
  A dark, product-grade Facebook post studio prototype: upload or paste
  source content, generate hook-driven posts, preview a phone-framed feed
  card, save to a content library, plan a weekly cadence, and tweak brand
  gradient/settings. Use when the brief asks for a "Facebook post studio",
  "social content studio", "FB post generator", "content planner for
  Facebook", or a multi-panel social publishing tool UI.
triggers:
  - "facebook post studio"
  - "facebook posts"
  - "social content studio"
  - "fb post generator"
  - "content planner facebook"
  - "repurpose for facebook"
  - "facebook content library"
od:
  mode: prototype
  platform: desktop
  scenario: marketing
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
    sections: [color, typography, layout, components]
  craft:
    requires: [state-coverage, accessibility-baseline]
  example_prompt: "Build a Facebook Post Studio — left panel for upload/repurpose, phone preview for generated posts, library + weekly planner + brand settings tabs."
---

# Facebook Post Studio

Produce a single-file desktop prototype for planning and generating Facebook
posts — a marketing ops tool, not a marketing landing page.

## When to use

- User wants a **social content studio**, FB post generator, or content planner.
- Brief mentions uploading CSVs / pasting long-form text to repurpose into posts.
- Need a multi-view tool: Studio · Library · Planner · Brand settings.

## Workflow

1. **Lock the product frame.** One app chrome (top bar + brand mark + tabs).
   No marketing hero, no pricing page. This is an in-product tool.
2. **Four views** (tabs; only one active at a time):
   - **Post Studio** — primary. Left control panel + right phone/feed preview.
   - **Content Library** — saved posts list, viral hook chips, export JSON.
   - **Content Planner** — weekly cadence grid; schedule library posts to days.
   - **Brand Settings** — creator profile, accent gradient swatches, tone.
3. **Studio left panel must include:**
   - File dropzone (CSV / text export of past posts) *or* paste-repurpose
     textarea for articles, transcripts, URLs.
   - Generate CTA with clear loading / empty / results states.
   - Optional filters: tone, length, CTA style (keep to ≤3 controls).
4. **Studio right panel:**
   - Phone-framed Facebook-style post card (avatar, name, timestamp, body,
     media slot, engagement row).
   - Actions: save, schedule, edit, delete — icon buttons with titles.
   - Empty state when nothing has been generated yet.
5. **Visual system (default if no DESIGN.md):**
   - True-black canvas (`#000` / near-black surfaces), not warm gray.
   - One violet→pink accent gradient for brand mark + primary CTA only.
   - Dense utility type (system sans + mono for metadata). Hairline borders.
   - No purple full-page washes; accent appears at most twice per view.
6. **Interactivity (vanilla JS is fine):**
   - Tab switching, generate → populate preview cards, save to library,
     export library as JSON, planner day assignment, gradient picker.
   - Persist library/planner to `localStorage` when practical.
   - Never invent engagement metrics; use honest placeholders if needed.
7. **Write** one self-contained HTML document:
   - `<!doctype html>` through `</html>`, CSS in one `<style>`, JS inline.
   - `data-od-id` on topbar, studio panels, library, planner, brand settings.
   - Touch targets ≥ 44px for primary actions.
8. **Self-check:**
   - All four tabs work; empty + populated states both exist.
   - Phone preview never overflows its column.
   - No invented follower counts or fake "viral score" numbers.
   - Accent budget respected; dark theme is true black, not brown-gray.

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="facebook-post-studio" type="text/html" title="Facebook Post Studio">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.

## Example

See [example.html](example.html) for a complete dark-theme Post Studio with
Studio / Library / Planner / Brand Settings, CSV ingest, repurpose paste,
phone preview, and local library export. Preview still: [preview.png](preview.png).
