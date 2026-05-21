---
name: landing-pricing
description: |
  요금제 비교 페이지. 월/연 결제 토글(시각용) + 3개의 가격 카드
  (Free·Pro·Team, 중앙 강조) + 기능 비교 체크리스트 + FAQ 4문항 +
  영업 문의 밴드. 디자인 시스템의 color / typography / layout /
  pricing 토큰을 따른다.
triggers:
  - "pricing page"
  - "plans page"
  - "가격 페이지"
  - "요금제 페이지"
  - "플랜 페이지"
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern
  page_type: landing.pricing
  page_inputs: []
  page_outputs:
    - name: select_plan
      kind: action
      target_page_type: auth.signup
    - name: contact_sales
      kind: navigation
      target_page_type: form.contact
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components, pricing]
  example_prompt: "월 구독 가격 페이지를 만들어 줘. 3개의 요금제 카드(Free·Pro·Team), 기능 비교, FAQ 4개, 영업 문의 링크."
---

# Landing · Pricing

Produce a desktop-first pricing page. Layout, in order:

1. **Page header** — eyebrow tag, centered headline ("Simple,
   predictable pricing"), supporting paragraph, and a monthly /
   annual billing toggle. The toggle is visual only — no JavaScript;
   the markup shows the active state.
2. **Plan cards** — three-up grid for Free / Pro / Team. The middle
   card is visually highlighted ("Most popular" badge, accent
   border, slight elevation). Each card lists: plan name, short
   tagline, price line (currency + amount + cadence), primary
   "Select plan" CTA, then a feature checklist of 5–7 items with
   bullet glyphs.
3. **Feature comparison** — a single-table feature checklist beneath
   the cards listing the canonical capabilities and which tiers
   include them. Column headers repeat the plan names.
4. **FAQ** — 4 static accordion items, each rendered open with the
   answer visible (no JS). Questions cover refunds, plan changes,
   team seats, and invoicing.
5. **Need-more band** — quiet contrast band at the bottom: "Need
   something custom?" headline, supporting line, and a "Contact
   sales" link routing to `form.contact`.

## Output contract

Emit a single self-contained HTML document inside an `<artifact>`
tag, CSS inline, no external assets. Honor the active DESIGN.md
tokens for color / typography / layout / pricing.

## Self-check

- Middle ("Pro") plan card is the visually emphasized option.
- Each plan's primary CTA reads as the same action (sign-up).
- FAQ items render with answers visible — no client-side JS toggle.
- Contact-sales band routes to `form.contact`, not back to itself.
