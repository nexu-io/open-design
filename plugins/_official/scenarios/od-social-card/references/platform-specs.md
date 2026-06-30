# Platform Specs

Use high-resolution exports. The user can downsample later.

## Xiaohongshu / Rednote

Default size:

- `1080 x 1440`
- Ratio: `3:4`
- Export: PNG for text-heavy images, JPEG only when photo-only and file size matters.

Safe area:

- Side margin: 72-96px.
- Top margin: 72-112px.
- Bottom margin: 80-120px.
- Keep all text and key objects inside the safe area.

Recommended set:

- 1 cover.
- 4-8 content pages.
- 1 summary or checklist page if the article benefits from it.

Naming:

```text
output/xhs-01-cover.png
output/xhs-02-<topic>.png
output/xhs-03-<topic>.png
...
```

Cover structure:

- Big title with a sharp hook.
- One strong visual: supplied image, screenshot, generated photo, or product object.
- Bottom line with 3-5 key points or a compact issue strip.
- Avoid long subtitles. Put nuance in later pages.

Content page structure:

- One idea per page.
- 12-30 Chinese characters for the title when possible.
- 2-4 short bullet fragments or one concise paragraph.
- If a page has a screenshot, reduce the text and give the screenshot enough area.
- If lower space is empty across pages, combine pages or add a functional element such as checklist, comparison row, quote, or image evidence.

## WeChat Official Account Cover Pair

Generate a pair: one `21:9` main cover and one `1:1` square cover. Build both in the same HTML file, and include a combined preview section that places them together for visual checking.

### 21:9 Main Cover

Default size:

- `2100 x 900`
- Ratio: `21:9`

Use:

- Main article cover.
- Full or near-full headline, subtitle, and visual evidence.
- Keep title readable near center-left or within a clear safe band.
- Avoid an empty middle. Increase title scale, image scale, or spacing if the center feels hollow.

### 1:1 Cover

Default size:

- `1080 x 1080`
- Ratio: `1:1`

Default style:

- Short title only, simplified from the long title.
- Big type, center aligned.
- No image unless the user explicitly asks for one.
- No subtitle by default.
- Strong contrast and enough breathing room.

Short-title rule:

- Extract the core object and action from the long title.
- Keep it to roughly 4-10 Chinese characters, or 2 short lines when needed.
- Do not squeeze the full `21:9` title into the square.

Example:

```text
Long: 开源了一个 Skill，让 AI 接管你屏幕边那张便签纸
Square: AI 接管便签纸
```

Naming:

```text
output/wechat-21x9-cover.png
output/wechat-1x1-cover.png
output/wechat-cover-pair-preview.png
```

## Screenshot And Photo Placement

For supplied screenshots/photos:

- Put originals in `assets/`.
- Use CSS `object-fit:cover` only when cropping is safe.
- Use CSS `object-fit:contain` for UI screenshots, dense text, code, tables, or app windows.
- Set `object-position` deliberately: top for long UI when top matters, center for objects, 35%-45% vertical for portraits.
- Do not pin images to the canvas edge unless the design intentionally uses bleed.

## Final Response Media

In Codex desktop, local media can be shown with absolute paths:

```markdown
![cover](/absolute/path/to/output/xhs-01-cover.png)
```

Do this for the most important images, especially the cover and any pages the user asked to inspect.
