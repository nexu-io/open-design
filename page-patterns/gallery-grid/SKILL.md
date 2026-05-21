---
name: gallery-grid
description: |
  표준 갤러리 그리드 페이지. 일관된 종횡비의 미디어 타일,
  반응형 컬럼 그리드, 빈 상태, 타일 캡션. 디자인 시스템의
  card / grid / typography 토큰을 따른다.
triggers:
  - "gallery"
  - "gallery grid"
  - "image grid"
  - "갤러리"
  - "갤러리 그리드"
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern
  page_type: list.gallery
  page_inputs:
    - name: items
      kind: data
  page_outputs:
    - name: tile_click
      kind: navigation
      target_page_type: detail.post
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "갤러리 그리드 페이지를 만들어 줘. 종횡비가 일정한 이미지 타일과 캡션, 반응형 그리드, 빈 상태 포함."
---

# List · Gallery

Produce a desktop-first gallery page. Layout, in order:

1. **Page header** — page title and a short subtitle / count
   (e.g. "128 items").
2. **Optional toolbar** — filter chips or sort dropdown above the
   grid (omit if not needed).
3. **Grid** — uniform-aspect tiles (4:3 or 1:1) in a responsive
   column grid. Default to 3–4 columns at desktop width; collapse
   to 2 on tablet, 1 on phone widths.
4. **Tile** — image placeholder filling the tile, caption row below
   the image with title and optional metadata (author, date).
5. **Empty state** — when `items` is empty, replace the grid with
   an inline message.

## Output contract

Emit a single self-contained HTML document inside an `<artifact>`
tag, CSS inline, no external assets. Honor the active DESIGN.md
tokens for color / typography / card.

## Self-check

- All tiles share the same aspect ratio.
- Every image has alt text describing its content.
- Grid collapses from 3–4 columns to 1–2 on narrow viewports.
- Caption row is below the image, not overlaid.
