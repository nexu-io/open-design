# BFitLog Design Audit Example

BFitLog is a personal gym tracking app built as an Expo app with mobile-first layouts and Expo Web support. The current product surface is functionally strong: Home, Plan, Workout, History, Stats, Settings, setup, login, body-weight logging, partner visibility, training media, substitutions, and rest timer concepts are all represented in the codebase.

## What Works

- The app has a real gym-tracking product model rather than generic fitness placeholders.
- Expo Router gives the information architecture a clear tab structure: Home, Plan, History, Stats, and Settings.
- `apps/mobile/src/theme.ts` centralizes the base dark palette, spacing scale, max content width, and Android minimum touch target.
- The Home and Stats screens expose practical domain modules: next workout, day override, latest body weight, range tabs, body-weight chart, exercise progress, and consistency summaries.
- Many controls include accessibility roles, labels, and touch-target intent.

## Main Design Risks

1. Responsive web currently reads as a centered mobile or tablet column. The `layout.maxContentWidth` value keeps content controlled, but desktop web needs deliberate two-pane and dashboard-style adaptations for Workout, Plan, and Stats.

2. The Workout screen carries the highest cognitive load. Set inputs, status, notes, substitutions, skip controls, save actions, rest timer, and completion actions compete inside one vertical flow. The workout moment should prioritize the active set, previous set context, primary save action, and rest state.

3. Some implementation details leak into the user experience. Substitute exercise IDs should become a searchable exercise picker or a suggested substitution list.

4. The visual system is coherent but thin. Cards, buttons, fields, status labels, empty states, segmented controls, and metric rows are mostly screen-local styles. Extracting primitives would make consistency and responsive tuning easier.

5. Charts and metrics are useful but basic. Body-weight and exercise progress views would benefit from clearer deltas, touch or hover readouts, and denser desktop layouts.

## Recommended Next Design Pass

Start with the Workout screen. Redesign it around a sticky workout header, one active exercise editor, a compact queued/completed exercise list, and a persistent rest timer panel. On desktop web, split the layout into an exercise list pane and an active set editor pane instead of only widening the mobile column.

Then extract a small UI kit: `Screen`, `Card`, `Button`, `TextField`, `SegmentedControl`, `StatusBadge`, `MetricCard`, and `EmptyState`. Use those primitives to tune Home, Plan, History, Stats, and Settings without repeating local styles.
