---
name: login-flow
description: |
  A mobile-first login/authentication screen — email + password, social SSO
  buttons, or phone verification. Use when the brief mentions "login",
  "sign-in", "authentication", "log in", "注册登录", or "登录页面".
triggers:
  - "login"
  - "sign in"
  - "sign-in"
  - "authentication"
  - "log in"
  - "注册登录"
  - "登录页面"
  - "phone verification"
  - "sso"
od:
  mode: prototype
  platform: mobile
  scenario: design
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "Design a mobile login screen for a fintech app — phone verification with country picker and social login options."
---

# Login Flow Skill

Produce a single mobile login/authentication screen as a self-contained HTML prototype.

## Workflow

1. Read the active DESIGN.md to understand color, typography, and component tokens.
2. Identify the app type and audience (fintech needs trust signals, social app needs simplicity).
3. Layout: centered form on phone frame with:
   - App logo / wordmark at top
   - Welcome headline + subtitle
   - Primary auth input (email/phone) with country picker if phone
   - Password field with show/hide toggle
   - "Forgot password" link
   - Primary CTA (Sign In / Log In)
   - Divider: "or continue with"
   - Social SSO buttons (Apple, Google, etc.)
   - "Don't have an account? Sign up" footer
4. Status bar, input validation states, loading state for button.
5. Strong typography hierarchy, accessible contrast on all interactive elements.

## Output contract

```
<artifact identifier="login-flow-name" type="text/html" title="Login Flow">
<!doctype html>...</artifact>
```

## Hard rules

- Input fields: clear labels above, not inside (never placeholder-only)
- Password toggle: show/hide icon inside the field
- Social buttons: realistic icons, not emoji
- Loading state: button shows spinner, disabled during submission
- Error state: inline field errors in red below each field
- Accessible: 44px minimum touch targets, WCAG AA contrast
