---
name: auth-signup
description: |
  표준 회원가입 페이지. 이메일/비밀번호/비밀번호 확인 + 약관 동의 +
  소셜 가입(Google/Apple) + 로그인 화면 보조 링크. 디자인 시스템의
  form / button / typography 토큰을 따른다.
triggers:
  - "signup page"
  - "sign up"
  - "register"
  - "회원가입"
  - "가입 페이지"
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern
  page_type: auth.signup
  page_inputs: []
  page_outputs:
    - name: submit
      kind: navigation
      target_page_type: dashboard.metrics
    - name: login_link
      kind: navigation
      target_page_type: auth.login
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components, forms]
  example_prompt: "회원가입 페이지를 만들어 줘. 이메일·비밀번호·비밀번호 확인 필드, 약관 동의 체크박스, 로그인 화면으로 이동하는 보조 링크 포함."
---

# Auth · Signup

Produce a single-screen signup page. Layout, in order:

1. **Branding header** — wordmark or logomark.
2. **Form card** — narrow centered card wrapped in a `<form>` element:
   - Email input (`type=email`, autofocus).
   - Password input (`type=password`).
   - Confirm-password input (`type=password`).
   - Terms-of-service consent checkbox with inline label and link.
   - Primary submit button (full width).
3. **Divider** — "or sign up with" caption.
4. **Social providers** — Google and Apple buttons, full width.
5. **Footer link** — "Already have an account? Sign in" pointing to
   the login pattern.

## Output contract

Emit a single self-contained HTML document inside an `<artifact>`
tag, CSS inline, no external assets. Honor the active DESIGN.md
tokens for color / typography / form / button.

## Self-check

- Confirm-password field is present alongside the password field.
- Terms checkbox sits inside the `<form>` and is not optional copy.
- Submit button uses the DS accent token.
- Footer link routes back to the login pattern.
