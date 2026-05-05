---
name: mobile-onboarding
description: |
  A multi-screen mobile onboarding flow rendered as three phone frames
  side by side — splash, value-prop, sign-in. Status bar, swipe dots,
  primary CTA. Use when the brief mentions "mobile onboarding", "iOS
  onboarding", "phone signup", or "移动端引导".
triggers:
  - "mobile onboarding"
  - "ios onboarding"
  - "android onboarding"
  - "phone signup"
  - "app onboarding"
  - "移动端引导"
od:
  mode: prototype
  platform: mobile
  scenario: design
  featured: 13
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  craft:
    requires: [state-coverage, animation-discipline]
  example_prompt: "Design a 3-screen mobile onboarding flow for a meditation app — welcome, value props, sign-in."
---

# Mobile Onboarding Skill

Produce a three-screen mobile onboarding flow on a single HTML page.

## Workflow

1. Read DESIGN.md.
2. Identify the app + audience.
3. Layout: three phone frames side by side. Each phone:
   - Status bar (time, battery, signal).
   - Hero artwork or icon.
   - Headline + supporting paragraph.
   - 3-dot pagination.
   - Primary CTA (full-width pill button).
   - "Skip" or alt action top-right.
4. Last phone is the sign-in / continue-with options screen.
5. Strong typography, gentle gradients, accessible contrast.

## Output contract

```
<artifact identifier="mobile-onboarding-name" type="text/html" title="Mobile Onboarding">
<!doctype html>...</artifact>
```
