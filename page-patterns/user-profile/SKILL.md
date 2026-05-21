---
name: user-profile
description: |
  사용자 프로필 페이지. 커버 영역 위 아바타, 이름·핸들·소개,
  팔로워/팔로잉 통계, 편집/설정 액션, 활동 또는 게시물 탭.
  디자인 시스템의 avatar / button / typography 토큰을 따른다.
triggers:
  - "profile"
  - "user profile"
  - "account page"
  - "프로필"
  - "사용자 프로필"
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern
  page_type: profile.user
  page_inputs:
    - name: user
      kind: data
  page_outputs:
    - name: edit
      kind: navigation
      target_page_type: profile.user
    - name: settings
      kind: navigation
      target_page_type: profile.user
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "사용자 프로필 페이지를 만들어 줘. 커버 위 아바타, 이름·핸들·소개, 팔로워 통계, 편집·설정 버튼, 게시물 탭 포함."
---

# Profile · User

Produce a desktop-first user profile page. Layout, in order:

1. **Cover band** — a wide hero band at the top (solid color or
   neutral gradient is fine).
2. **Identity card** — overlapping the cover band:
   - Avatar (large, circular).
   - Display name, handle, single-line bio.
   - Stat row: posts, followers, following counts.
   - Action row on the right: "Edit profile" and "Settings" buttons.
3. **Tabs** — Posts / Activity / Saved tab strip below the identity
   card. Active tab is visually emphasized.
4. **Tab content** — list of post cards (or activity items) under
   the active tab.

## Output contract

Emit a single self-contained HTML document inside an `<artifact>`
tag, CSS inline, no external assets. Honor the active DESIGN.md
tokens for color / typography / avatar.

## Self-check

- Avatar overlaps the cover band (negative top margin or absolute).
- Stat row shows posts / followers / following counts.
- Action row has both "Edit profile" and "Settings" buttons.
- Tabs strip is present with one tab visually active.
