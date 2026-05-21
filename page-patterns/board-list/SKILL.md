---
name: board-list
description: |
  표준 게시판 목록 페이지. 제목 / 작성자 / 작성일 / 댓글 수 컬럼,
  헤더의 정렬 가능 컬럼, 페이지네이션, 빈 상태, 새 글 작성 액션
  버튼. 디자인 시스템의 table / pagination / button 토큰을 따른다.
triggers:
  - "board"
  - "post list"
  - "list page"
  - "게시판"
  - "게시판 목록"
  - "리스트 페이지"
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern
  page_type: list.board
  page_inputs:
    - name: posts
      kind: data
  page_outputs:
    - name: row_click
      kind: navigation
      target_page_type: detail.post
    - name: new_post
      kind: action
      target_page_type: auth.login
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "게시판 목록 페이지를 만들어 줘. 제목·작성자·작성일·댓글 수 컬럼, 정렬 가능한 헤더, 페이지네이션, 새 글 작성 버튼 포함."
---

# List · Board

Produce a desktop-first board list page. Layout, in order:

1. **Page header** — page title on the left, primary "New post"
   button on the right. The "New post" action is auth-guarded; if
   the visitor is signed out, it should navigate to `auth.login`.
2. **Toolbar** — optional search input or filter chips above the
   table.
3. **Table** — full-width data table with columns for title,
   author, posted date, and comment count. Sortable column headers
   show a caret indicating the active sort direction. Rows are
   keyboard-focusable and full-row clickable.
4. **Pagination** — page-number cluster centered or right-aligned
   below the table, showing current/total pages.
5. **Empty state** — when `posts` is empty, replace the table with
   an inline message and a primary CTA to create the first post.

## Output contract

Emit a single self-contained HTML document inside an `<artifact>`
tag, CSS inline, no external assets. Honor the active DESIGN.md
tokens for color / typography / table.

## Self-check

- Table rows reach edge-to-edge of the table card.
- Sort caret indicates which column is currently active.
- Pagination shows the current page and the total page count.
- Empty state is present (even if hidden in the seeded HTML).
