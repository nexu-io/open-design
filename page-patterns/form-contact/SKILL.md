---
name: form-contact
description: |
  연락처/문의 페이지. 좌측 회사 정보 패널(전화·이메일·주소·지도
  플레이스홀더) + 우측 문의 폼(이름·이메일·회사·메시지). 디자인
  시스템의 form / typography / layout 토큰을 따른다.
triggers:
  - "contact page"
  - "contact form"
  - "get in touch"
  - "문의 페이지"
  - "연락처"
  - "연락처 페이지"
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern
  page_type: form.contact
  page_inputs: []
  page_outputs:
    - name: submit
      kind: action
    - name: phone_link
      kind: action
    - name: email_link
      kind: action
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components, forms]
  example_prompt: "연락처 폼 페이지를 만들어 줘. 이름·이메일·문의 내용 + 회사 정보(전화·이메일·주소) 좌측 패널."
---

# Form · Contact

Produce a desktop-first contact page. Layout, in order:

1. **Page header** — centered eyebrow + headline "Get in touch" +
   one-line supporting paragraph.
2. **Two-column body** — equal-width columns aligned to the same
   card height:
   - **Left panel — Company info**:
     - Phone row: phone glyph (inline SVG or text), label, and
       `<a href="tel:…">` linking the number (`phone_link`).
     - Email row: email glyph, label, `<a href="mailto:…">` link
       (`email_link`).
     - Address row: location glyph, label, multi-line address.
     - Map placeholder card below the rows (CSS gradient or a flat
       muted block).
   - **Right panel — Form**:
     - Name input (`type=text`).
     - Email input (`type=email`).
     - Company input (`type=text`).
     - Message textarea with placeholder copy.
     - Primary submit button (full width or right-aligned).

## Output contract

Emit a single self-contained HTML document inside an `<artifact>`
tag, CSS inline, no external assets. Honor the active DESIGN.md
tokens for color / typography / form / button.

## Self-check

- Phone and email rows use `tel:` / `mailto:` anchors, not plain
  text.
- The form's submit button uses the DS accent token.
- Every input has a visible `<label>` bound by `for`.
- Map block is a placeholder — no external map embed or script.
