---
name: auth-login
description: |
  표준 로그인 페이지. 이메일/비밀번호 + 소셜 로그인(Google/Apple) +
  회원가입·비밀번호 재설정 보조 링크. 디자인 시스템의 form / button
  / typography 토큰을 따른다.
triggers:
  - "login page"
  - "sign in"
  - "로그인 페이지"
  - "로그인 화면"
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern
  page_type: auth.login
  page_inputs: []
  page_outputs:
    - name: submit
      kind: navigation
      target_page_type: dashboard.metrics
    - name: signup_link
      kind: navigation
      target_page_type: auth.signup
    - name: password_reset_link
      kind: navigation
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components, forms]
  example_prompt: "표준 로그인 페이지를 만들어 줘. 이메일·비밀번호 필드, Google·Apple 소셜 로그인 버튼, 회원가입과 비밀번호 재설정 보조 링크 포함."
---

# Auth · Login

Produce a single-screen login page. Layout, in order:

1. **Branding header** — wordmark or logomark, centered or top-left
   per the design system.
2. **Form card** — narrow centered card wrapped in a `<form>` element:
   - Email input (`type=email`, autofocus).
   - Password input (`type=password`).
   - Primary submit button (full width).
3. **Divider** — "or continue with" caption between the form and
   social providers.
4. **Social providers** — Google and Apple buttons, full width, icon
   left, label centered. Optional Microsoft / GitHub if the design
   system advertises additional connectors.
5. **Footer links** — "Forgot password?" and "Create an account"
   secondary links, centered below the form.

## Output contract

Emit a single self-contained HTML document inside an `<artifact>`
tag, CSS inline, no external assets. Honor the active DESIGN.md
tokens for color / typography / form / button.

## Self-check

- Primary submit button uses the DS accent token (not a raw color).
- Inputs are wrapped in a `<form>` with visible labels.
- Footer links route to signup and password reset.
- No third-party iconography fetched from a CDN — use inline SVG or text.
