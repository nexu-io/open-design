---
name: social-feed
description: |
  소셜 피드 페이지. 작성자 아바타·이름·작성 시각이 있는 포스트
  카드, 텍스트/이미지 본문, 좋아요·댓글·공유 액션 바, 무한 스크롤
  플레이스홀더. 디자인 시스템의 card / avatar / icon-button 토큰을 따른다.
triggers:
  - "feed"
  - "social feed"
  - "timeline"
  - "피드"
  - "타임라인"
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern
  page_type: list.feed
  page_inputs:
    - name: posts
      kind: data
  page_outputs:
    - name: post_click
      kind: navigation
      target_page_type: detail.post
    - name: profile_click
      kind: navigation
      target_page_type: profile.user
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "소셜 피드 페이지를 만들어 줘. 아바타·작성자·시간이 있는 포스트 카드, 텍스트/이미지 본문, 좋아요·댓글·공유 액션 바 포함."
---

# List · Feed

Produce a desktop-first social feed page. Layout, in order:

1. **Sticky header** — app title on the left, profile avatar on the
   right (the avatar links to `profile.user`).
2. **Composer placeholder** — single-line "Share something..." input
   above the feed.
3. **Feed column** — vertical stack of post cards, centered with a
   max-width around 600px. Each post card contains:
   - Author row: avatar (links to `profile.user`), display name,
     post timestamp.
   - Body: text and / or an image placeholder filling the card width.
   - Action bar: like, comment, and share buttons with counts.
   The whole card is clickable and routes to `detail.post`.
4. **End-of-feed sentinel** — a muted "Loading more..." or "You're
   all caught up" row at the bottom.

## Output contract

Emit a single self-contained HTML document inside an `<artifact>`
tag, CSS inline, no external assets. Honor the active DESIGN.md
tokens for color / typography / card.

## Self-check

- Each post card has author row, body, and action bar in that order.
- Avatar in the author row links to the profile page.
- Action bar shows like / comment / share affordances with counts.
- Feed column is centered with a sensible max-width.
