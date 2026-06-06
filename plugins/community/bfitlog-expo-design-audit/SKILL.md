---
name: bfitlog-expo-design-audit
description: Audit a mobile-first Expo gym tracking app for design quality, responsive Expo Web behavior, workout-flow usability, accessibility, and reusable UI-system opportunities.
od:
  scenario: design-audit
  mode: critique
---

# BFitLog Expo Design Audit

Use this skill when the user wants a design analysis of a personal gym tracking app built with Expo, Expo Router, React Native, and Expo Web. The intended app shape is mobile-layout-first, with responsive web support for wider browser screens.

## Outcome

Produce a concise, actionable design audit grounded in the project files. Prioritize findings that affect the product experience:

- Mobile workout logging speed and cognitive load.
- Responsive Expo Web layout behavior.
- Navigation and information architecture across Home, Plan, Workout, History, Stats, Settings, Login, Setup, and Exercise detail.
- Visual-system consistency, including theme tokens, repeated style blocks, typography, spacing, cards, buttons, inputs, status states, and charts.
- Accessibility and touch ergonomics.
- Gym-domain specificity: workout progression, set entry, rest timer, substitutions, skip states, body-weight logging, partner visibility, and training media.

## Workflow

1. Inspect the project shape before making claims.
   - Read `package.json` and `apps/mobile/package.json` to confirm Expo, React Native, Expo Router, and Expo Web dependencies.
   - Read `apps/mobile/src/theme.ts` or equivalent theme files.
   - List `apps/mobile/app/**/*.{tsx,ts}` and `apps/mobile/src/**/*.{tsx,ts}` to identify screens and reusable modules.

2. Read the highest-impact screens first.
   - `apps/mobile/app/(tabs)/index.tsx`
   - `apps/mobile/app/workout.tsx`
   - `apps/mobile/app/(tabs)/plan.tsx`
   - `apps/mobile/app/(tabs)/history.tsx`
   - `apps/mobile/app/(tabs)/stats.tsx`
   - `apps/mobile/app/(tabs)/settings.tsx`
   - `apps/mobile/app/exercise.tsx`
   - Authentication and setup screens when the audit covers onboarding.

3. Search for design-system and responsive signals.
   - Theme tokens: colors, spacing, radii, max widths, typography, minimum hit targets.
   - Repeated `StyleSheet.create` definitions for cards, buttons, fields, empty states, rows, and section headers.
   - Web/responsive APIs such as `useWindowDimensions`, `Platform.select`, `maxWidth`, CSS-like layout branches, and fixed SVG/chart dimensions.
   - Accessibility props including `accessibilityRole`, `accessibilityLabel`, `accessibilityState`, live regions, and focus helpers.

4. Analyze the design in this order.
   - First, summarize what is already working.
   - Then list the main design risks ordered by user impact.
   - Anchor each concrete issue to files and line references where possible.
   - Separate source-backed findings from product-design recommendations.

5. Check for these common issues.
   - Web layout is only a centered mobile column instead of a true wider-screen adaptation.
   - Workout cards expose too many secondary controls at once.
   - Implementation details leak into UI, especially IDs, sync state, raw status labels, or admin-only concepts.
   - Shared UI primitives are missing, causing repeated local styles.
   - Charts and metrics work but lack hover/touch readouts, clear deltas, or responsive density.
   - Accessibility exists in isolated controls but not consistently across custom tab lists, segmented controls, destructive actions, or live status.

6. Recommend the next design pass.
   - Prefer one high-leverage screen first, usually Workout.
   - Specify mobile-first changes and web-specific layout adaptations separately.
   - Propose a small component system only when repeated patterns in the code justify it.
   - Avoid generic redesign advice; tie every recommendation to the gym-tracking domain.

## Output Format

Use this structure unless the user asks for something else:

```markdown
**Current Design Audit**

One short paragraph summarizing the current design maturity.

**What Works**
- ...

**Main Design Risks**
1. ...

**Recommended Next Design Pass**
- ...
```

Keep the tone direct and pragmatic. Do not rewrite code unless the user asks for implementation.
