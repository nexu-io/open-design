---
name: post-detail
description: |
  포스트 상세 페이지. 제목, 작성자/시각 메타, 본문 마크다운,
  댓글 섹션, 목록으로 돌아가기 / 작성자 프로필 보조 링크.
  디자인 시스템의 typography / prose / button 토큰을 따른다.
triggers:
  - "post detail"
  - "article page"
  - "post page"
  - "포스트 상세"
  - "게시글 상세"
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern
  page_type: detail.post
  page_inputs:
    - name: post
      kind: data
  page_outputs:
    - name: back_link
      kind: navigation
      target_page_type: list.board
    - name: author_link
      kind: navigation
      target_page_type: profile.user
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "포스트 상세 페이지를 만들어 줘. 제목, 작성자·시각 메타, 본문, 댓글 섹션, 목록으로 돌아가기 링크 포함."
---

# Detail · Post

Produce a desktop-first post detail page. Layout, in order:

1. **Top navigation** — left-aligned "Back to board" link routing
   to `list.board`.
2. **Article header** — large title, author row (avatar +
   display-name link to `profile.user` + posted timestamp), optional
   tag chips.
3. **Article body** — readable prose column at ~640–720px width
   with paragraphs, optional headings, blockquotes, and inline
   images.
4. **Comments section** — heading "Comments (N)", followed by a
   composer textarea and a list of comment cards (avatar, author,
   timestamp, body).

## Output contract

Emit a single self-contained HTML document inside an `<artifact>`
tag, CSS inline, no external assets. Honor the active DESIGN.md
tokens for color / typography / prose.

## Self-check

- Back link is at the top and routes to the board list.
- Author display name in the article header links to the profile.
- Article body is a readable column (~640–720px wide).
- Comments section has both a composer and at least one comment card.
