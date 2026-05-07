# Checklist

## P0

- `assets/template.html` exists and opens directly from disk in a browser with no console errors and no network requests.
- `example.html` exists and renders the seed via the `./assets/template.html` iframe (no build step, no JS framework, no asset CDN).
- Skill frontmatter is `od.mode: prototype`, `od.platform: desktop`, `od.scenario: operations`, `od.preview.type: html`, `od.design_system.requires: true`.
- Sidebar shows two sections (Main Menu + Management) with exactly five nav items each, and exactly one active mint pill across both groups.
- Four KPI tiles render in a single row above 1100 px; tiles A / B / D have a `caption + pattern strip` foot, tile C has a 2-row mini-list (General / Private). No tile is left empty-bottomed.
- Patient-overview chart shows 7 paired bars (mint back, blue front), exactly one month highlighted with a 2 px mint stroke. SVG-only, no canvas, no chart library.
- Mini calendar shows exactly one active day (mint circle + 4 px mint dot below). Days from the previous / next month use the `muted` color class.
- The dark Activity Detail popover is the only dark surface in the artifact. Inverse `#0F172A` is reused nowhere else.
- Status pills are pastel-only: KPI trend pills use mint (`up`) / rose (`down`); doctor-schedule pills use mint (`avail`) / rose (`unav`) / amber (`leave`).
- Mint accent (`--accent`) is restricted to five touch points: active sidebar nav row, primary CTA button, KPI glyph background, success pills (`up` / `avail`), active calendar date.
- All colors / radii / shadows / fonts inside `<style>` are `var(--…)` lookups; no raw hex codes outside `:root{}`.
- No external font / icon / image CDN. Fonts use system fallback only.

## P1

- Layout collapses gracefully on narrow viewports: at ≤ 1100 px the KPI strip becomes a 2-up grid and the bottom 3-card row stacks; at ≤ 920 px the sidebar stacks above the main column; at ≤ 600 px the KPI strip becomes 1-up.
- Tabular lining numerals on every numeric value: KPI big numbers, calendar cells, donut center number, schedule stat values, appointment times — `font-feature-settings: "tnum","lnum"` is set on `body`.
- Avatars are inline SVG / CSS-gradient initial badges; no `<img>` references to a photo URL.
- Diagonal-stripe pattern fills (135°, 8 px line + 8 px gap) on KPI footer strips and inside bar-chart bars use the `stripe-amber` / `stripe-blue` / `stripe-mint` token classes; no inline `repeating-linear-gradient(...)` outside `:root{}` / the named classes.
- The donut chart sums to 100 % visually (`stroke-dasharray` + `stroke-dashoffset` math against `2π × r ≈ 239` for r=38) and the legend numbers add up to the center number.

## P2

- Sample data feels like a real clinic: doctor names from at least three nationalities, specialties cover internal medicine + dental + cardiology + dermatology + pediatrics, appointment row "venue / mode" hints alternate between physical room numbers and "video call" / "telemedicine".
- Greeting line uses one terminal emoji (e.g. `🙌`) at most; no emoji elsewhere in the artifact.
- Active calendar day's number matches the date referenced in the popover title (e.g. day `8` ↔ "Activity Detail · Mar 8").
- Brand wordmark in the sidebar stays under 14 characters so it fits the 240 px sidebar without truncation.
