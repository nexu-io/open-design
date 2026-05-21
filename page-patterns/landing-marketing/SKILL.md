---
name: landing-marketing
description: |
  제품 소개용 마케팅 랜딩 페이지. 히어로 + 주요 특징 그리드 +
  사용 사례 + 사회적 증거 + 최종 CTA + 푸터. 디자인 시스템의
  color / typography / layout 토큰과 marketing 섹션을 따른다.
triggers:
  - "landing page"
  - "marketing page"
  - "product landing"
  - "제품 소개 페이지"
  - "랜딩 페이지"
  - "마케팅 페이지"
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern
  page_type: landing.marketing
  page_inputs: []
  page_outputs:
    - name: cta_primary
      kind: action
      target_page_type: auth.signup
    - name: cta_secondary
      kind: action
      target_page_type: auth.login
    - name: pricing_link
      kind: navigation
      target_page_type: landing.pricing
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components, marketing]
  example_prompt: "제품 소개 랜딩 페이지를 만들어 줘. 큰 히어로 + 가치 제안 3개 + 사용 사례 + 기능 그리드 + CTA + 푸터."
---

# Landing · Marketing

Produce a desktop-first marketing landing page. Layout, in order:

1. **Sticky top nav** — logo on the left, primary nav links on the
   right including a "Pricing" link (routes to `landing.pricing`),
   a ghost "Sign in" link, and a primary "Get started" CTA.
2. **Hero** — single-column centered hero: eyebrow tag, oversized
   headline, supporting paragraph, primary CTA button + secondary
   ghost button. A hero visual placeholder (screenshot, illustration,
   or gradient card) sits below or beside the copy.
3. **Feature row** — three-up grid of features. Each cell has a small
   icon glyph (inline SVG or text), a feature title, and a one-line
   description.
4. **Use-case sections** — two alternating sections (image left/copy
   right, then copy left/image right) describing the top use cases.
   Each pairs a heading + 2–3 bullet points with an illustrative
   visual placeholder.
5. **Social proof / logo wall** — quiet band with a caption ("Trusted
   by teams at…") and 4–6 placeholder logos.
6. **Final CTA band** — full-width contrast band with a closing
   headline, supporting line, and the primary CTA repeated.
7. **Footer** — multi-column footer with product/company/legal link
   columns and a copyright line.

## Output contract

Emit a single self-contained HTML document inside an `<artifact>`
tag, CSS inline, no external assets. Honor the active DESIGN.md
tokens for color / typography / layout / button.

## Self-check

- Hero CTA pair (primary + secondary) maps to `cta_primary` and
  `cta_secondary` semantically.
- Top nav exposes a "Pricing" link routing to `landing.pricing`.
- Final CTA band repeats the primary action, not a third new one.
- No external scripts, fonts, or CDN icon packs.
