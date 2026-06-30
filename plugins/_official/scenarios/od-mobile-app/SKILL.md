---
name: od-mobile-app
description: Default mobile app scenario for iOS/Android app screens and mobile product flows.
triggers:
  - mobile app
  - iOS
  - Android
  - app prototype
  - 移动端
  - 手机 App
od:
  scenario: mobile-app
  mode: mobile
---

# Mobile App Scenario

Create a native-feeling mobile app prototype as a single HTML artifact. The output should feel like a working app screen set, not a desktop page squeezed into a phone.

## Workflow

1. Read `assets/template.html` and `references/patterns.md`.
2. Derive the screen list from `screenFlow`. Default to 4 screens: entry, core task, detail/confirmation, settings or empty state.
3. Use phone frames and mobile-safe density. Keep tap targets at least 44px.
4. Include status/navigation bars only when they clarify the platform.
5. Verify with `references/checklist.md`.

## Hard Rules

- No desktop sidebar layouts inside a phone frame.
- Use bottom tabs, top bars, sheets, cards, lists, segmented controls, and mobile-native gestures where appropriate.
- Include important states: loading, empty, validation, permission, or success when the flow needs them.
- Keep text short enough for mobile containers.
