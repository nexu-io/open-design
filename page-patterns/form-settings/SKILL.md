---
name: form-settings
description: |
  사용자 설정 페이지. 좌측 섹션 네비게이션(프로필·계정·알림·결제)
  + 우측 활성 섹션 폼(아바타·이름·소개 등) + 하단 고정 액션바
  (취소·저장). 디자인 시스템의 form / button / layout 토큰을 따른다.
triggers:
  - "settings page"
  - "account settings"
  - "user settings"
  - "preferences"
  - "설정 페이지"
  - "사용자 설정"
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern
  page_type: form.settings
  page_inputs:
    - name: profile
      kind: data
  page_outputs:
    - name: save
      kind: action
    - name: cancel
      kind: action
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components, forms]
  example_prompt: "사용자 설정 페이지를 만들어 줘. 좌측 섹션 nav(프로필·계정·알림·결제) + 우측에 활성 섹션 폼. 저장·취소 액션바 하단 고정."
---

# Form · Settings

Produce a desktop-first user settings page. Layout, in order:

1. **Page header** — page title "Settings" on the left with a muted
   subtitle ("Manage your profile and account preferences."). No
   primary action in this header — the action bar lives at the
   bottom.
2. **Two-column body** — fixed-width left sidebar and flexible
   right pane:
   - **Sidebar nav** — vertical list of four items: Profile (active),
     Account, Notifications, Billing. The active item is visually
     emphasized (background fill + bold).
   - **Active section pane** — Profile by default. Renders form
     groups in a card:
     - Avatar group: round preview placeholder + "Change photo"
       ghost button.
     - Name input (`type=text`) with label.
     - Bio textarea with label and a small character-count hint.
3. **Sticky action bar** — full-width bar pinned to the bottom of
   the viewport with a ghost "Cancel" button on the left of the
   pair and a primary "Save changes" button on the right.

## Output contract

Emit a single self-contained HTML document inside an `<artifact>`
tag, CSS inline, no external assets. Honor the active DESIGN.md
tokens for color / typography / form / button.

## Self-check

- Sidebar shows all four sections; the active one is visually
  distinct.
- Cancel and Save buttons live in a single sticky action bar.
- Each form field has a visible `<label>` bound by `for`.
- No external icon packs or fonts.
