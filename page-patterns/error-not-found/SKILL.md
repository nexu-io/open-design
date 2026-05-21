---
name: error-not-found
description: |
  404 오류 페이지. 큰 404 디스플레이 + 안내 헤드라인 + 보조 카피
  + 홈으로 가기 버튼 + 이전 페이지로 돌아가기 보조 링크. 디자인
  시스템의 color / typography / layout 토큰을 따른다.
triggers:
  - "404 page"
  - "not found"
  - "error page"
  - "오류 페이지"
  - "404 페이지"
  - "에러 페이지"
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern
  page_type: error.not-found
  page_inputs: []
  page_outputs:
    - name: home_link
      kind: navigation
      target_page_type: landing.marketing
    - name: back_link
      kind: action
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "404 페이지를 만들어 줘. 큰 404 디스플레이 + 안내 문구 + 홈으로 가기 버튼 + 이전 페이지로 돌아가기 보조 링크."
---

# Error · Not found

Produce a centered single-column 404 page. Layout, in order:

1. **Branding header** — minimal wordmark at the top (top-left or
   centered).
2. **Hero block** — vertically centered in the viewport:
   - Oversized "404" numeral as the display element (serif or display
     family from the design system; if absent, weight-700 sans
     `font-size: 120px+`).
   - Headline below: "Page not found".
   - One- or two-line supporting copy ("The page you're looking for
     doesn't exist or has been moved.").
   - Primary "Take me home" button routing to `landing.marketing`.
   - Secondary "Go back" link below the button (visual hierarchy
     less prominent than the primary CTA).
3. **Decorative motif (optional)** — subtle background grid, dotted
   pattern, or muted gradient behind the numeral. Keep purely
   decorative content `aria-hidden`.

## Output contract

Emit a single self-contained HTML document inside an `<artifact>`
tag, CSS inline, no external assets. Honor the active DESIGN.md
tokens for color / typography / button.

## Self-check

- Primary CTA targets `landing.marketing` (home).
- Secondary action is a link or ghost button, not a second primary.
- The 404 numeral is the largest typographic element on the page.
- No third-party iconography, fonts, or CDN assets.
