---
name: auth-password-reset
description: |
  비밀번호 재설정 요청 페이지. 이메일 입력 + 안내 메시지 + 재설정
  링크 발송 버튼 + 로그인으로 돌아가기 보조 링크. 디자인 시스템의
  form / button / typography 토큰을 따른다.
triggers:
  - "password reset"
  - "forgot password"
  - "reset password"
  - "비밀번호 재설정"
  - "비밀번호 찾기"
  - "비밀번호 재설정 페이지"
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern
  page_type: auth.password-reset
  page_inputs: []
  page_outputs:
    - name: submit
      kind: action
    - name: login_link
      kind: navigation
      target_page_type: auth.login
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components, forms]
  example_prompt: "비밀번호 재설정 요청 폼을 만들어 줘. 이메일 입력 + 안내 메시지 + 로그인으로 돌아가기 링크."
---

# Auth · Password reset

Produce a single-screen password-reset request page. Layout, in
order:

1. **Branding header** — wordmark or logomark, centered above the
   card.
2. **Form card** — narrow centered card wrapped in a `<form>`:
   - Title "Reset password" + a single-line subtitle: "Enter your
     email and we'll send a reset link."
   - Email input (`type=email`, autofocus) with a visible label.
   - Primary submit button (full width): "Send reset link".
   - Below the button, a muted inline placeholder line for the
     success state ("Check your inbox.") that the agent fills in
     when a reset is in flight. Keep the markup so the success
     state has somewhere to live.
3. **Footer link** — centered "Back to login" link pointing to
   `auth.login`.

## Output contract

Emit a single self-contained HTML document inside an `<artifact>`
tag, CSS inline, no external assets. Honor the active DESIGN.md
tokens for color / typography / form / button.

## Self-check

- Email input has a visible `<label>` (not just placeholder text).
- Submit button uses the DS accent token, full-width.
- Footer link routes to `auth.login`.
- Success-state slot exists in the markup even when empty.
