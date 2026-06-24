---
generated_by: Codex
generated_at: 2026-06-24T04:25:00+08:00
last_updated: 2026-06-24T06:18:00+08:00
canonical_source: tools/open-design/plugins/design-taste-libraries
source_context: YouTube video Ot582-E61ac and linked public design skills/libraries
---

# Design Library Catalog

This catalog is a routing index for Open Design agents. It keeps source links and extracted usage rules close to the design workflow without copying entire external skills into the local repo.

## Open Design Coverage Audit

Checked locally on 2026-06-24 with `opendesign plugin search`.

| Video library / need               | Local Open Design coverage                                                                                                                                        | Status  | Action                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| Hallmark anti-slop design critique | `community-hallmark`                                                                                                                                              | covered | Do not duplicate. Prefer this plugin directly.                                                                        |
| shadcn UI                          | `design-system-shadcn`                                                                                                                                            | covered | Do not create `library-shadcn`; route to the built-in design system.                                                  |
| Dashboard/data-density UI          | `design-system-dashboard`, `example-dashboard`, `example-trading-analysis-dashboard-template`, `example-flowai-live-dashboard-template`, `example-live-dashboard` | covered | Do not create `library-dashboard`; use the closest built-in.                                                          |
| Mobile app mockups/onboarding      | `example-mobile-app`, `example-mobile-onboarding`, `example-gamified-app`                                                                                         | partial | Built-in prototypes exist; keep external mobile rules for production UX checks.                                       |
| Expo / React Native                | `design-system-expo`                                                                                                                                              | partial | Built-in is visual/brand-ish; keep external Expo Native UI rules for safe area, haptics, layout, and native behavior. |
| HyperFrames / video motion         | `example-hyperframes`, `example-video-hyperframes`, `example-motion-frames`, many `video-template-frame-*` entries                                                | covered | Do not create another HyperFrames plugin; route to built-ins.                                                         |
| GSAP motion                        | `example-cinematic-landing-page`                                                                                                                                  | partial | Built-in example exists; keep external GSAP rules only for timeline/ScrollTrigger/React implementation discipline.    |
| Minimalist taste                   | `design-system-minimal`, `design-system-contemporary`, `design-system-sleek`, `example-web-prototype-taste-editorial`, `example-html-ppt-taste-editorial`         | covered | Do not create a minimalist library plugin.                                                                            |
| Industrial/brutalist taste         | `design-system-brutalism`, `design-system-neobrutalism`, `example-web-prototype-taste-brutalist`, `example-html-ppt-taste-brutalist`                              | covered | Do not create a brutalist library plugin.                                                                             |
| Premium frontend                   | `design-system-premium`, `design-system-apple`, `design-system-luxury`, many premium examples                                                                     | covered | Do not create a premium frontend plugin.                                                                              |
| Material / Material 3              | `design-system-material`                                                                                                                                          | partial | Visual grammar is covered; keep external Material 3 rules only for token/component audit detail.                      |
| SwiftUI                            | no strong local hit                                                                                                                                               | gap     | Add only if Open Design will generate native SwiftUI specs or code.                                                   |
| Anthropic Frontend Design method   | no exact local hit; `community-hallmark` covers adjacent anti-slop critique                                                                                       | partial | Keep as method inside this router or a small future `library-frontend-design-method`, not a duplicate visual system.  |
| UI UX Pro Max category explorer    | no strong local hit                                                                                                                                               | gap     | Add only if we need category-first ideation before picking a visual system.                                           |

Default: use existing Open Design ids first. Add a new local library plugin only when the missing value is procedural and not already represented by a design system, example, or video template.

## Core Libraries

### Anthropic Frontend Design

Source: https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md

Use for: high-end web visual direction, visual thesis, landing pages, portfolio/product pages, and critique before code.

Extract:

- choose a distinctive direction before implementation;
- make the subject visible immediately;
- treat typography, hierarchy, and imagery as the core composition;
- run a critique pass after generation.

Avoid when: the target is a dense operational product where utility and state grammar matter more than expressive hero composition.

### Hallmark

Source: https://github.com/Nutlope/hallmark
Local Open Design plugin: community-hallmark

Use for: anti-AI-slop critique, structure variety, project-aware tokens, responsive checks, and polishing generated UI.

Extract:

- inspect existing typography, palette, spacing, and motion dependencies before changing anything;
- vary structure instead of repeating centered cards;
- produce visual proof, not only prose.

### shadcn UI

Source: https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md
Local Open Design plugin/design system to search: design-system-shadcn

Use for: React apps, production-feeling app surfaces, forms, dialogs, controls, tables, menus, and component composition.

Extract:

- search registry components before hand-building;
- compose primitives instead of inventing new controls;
- use semantic tokens and CSS variables;
- avoid overwriting existing components without an explicit reason.

### Dashboard

Source: https://github.com/bergside/awesome-design-skills/tree/main/skills/dashboard

Use for: analytics, admin, CRM, operations, monitoring, finance, product dashboards, and any dense decision surface.

Extract:

- prioritize information hierarchy and scan paths;
- use grids, tables, filters, and compact cards only where they support comparison;
- keep visual style restrained enough for repeated use;
- prove with realistic data states, empty states, and overflow.

### UI UX Pro Max

Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

Use for: broad ideation and category-first exploration when the product type is unclear.

Extract:

- search a design category database before choosing palette/layout;
- decide the product genre before choosing visual treatment.

Avoid when: the brief already names a precise product and existing design system.

## Motion Libraries

### GSAP Skills

Source: https://github.com/greensock/gsap-skills

Use for: scroll choreography, timeline-based motion, cinematic reveals, SVG motion, complex gesture sequences, and motion prototypes.

Extract:

- use timelines for coordinated motion;
- prefer official plugin patterns for ScrollTrigger and React integration;
- keep performance in view;
- motion must clarify state or create a memorable product moment.

Avoid when: a small CSS transition or platform-native animation is enough.

### HyperFrames

Source: local OpenAI curated plugin `hyperframes`

Use for: video-grade web motion, interactive product films, and reusable motion components.

Extract:

- use when the deliverable is motion-led;
- keep source UI and rendered motion tied together;
- do not replace functional app UI with cinematic wrappers.

## Taste Presets

### Minimalist UI

Source: https://www.skills.sh/leonxlnx/taste-skill/minimalist-ui

Use for: sparse, quiet, editorial, luxury, or high-clarity interfaces.

Extract:

- remove decoration before adding detail;
- make spacing, type scale, and content quality carry the design.

Avoid when: the product needs rich discovery, play, high energy, or operational density.

### Industrial Brutalist UI

Source: https://www.skills.sh/leonxlnx/taste-skill/industrial-brutalist-ui

Use for: bold, raw, grid-heavy, tool-like, editorial, music, creative, or fashion-adjacent work.

Extract:

- use strong contrast, hard edges, visible structure, and assertive typography;
- do not soften it into generic SaaS cards.

Avoid when: the product needs trust, care, calm, finance, health, or broad consumer warmth.

### Premium Frontend UI

Source: https://www.skills.sh/github/awesome-copilot/premium-frontend-ui

Use for: elevated product sites, polished marketing surfaces, and high-end web prototypes.

Extract:

- use premium spacing, purposeful imagery, and precise component polish;
- avoid one-note gradients and stock-layout tropes.

## Mobile And Platform Libraries

### Mobile App UI Design

Source: https://github.com/ceorkm/mobile-app-ui-design

Use for: mobile app screens, onboarding, tab flows, app home surfaces, detail sheets, and one-handed workflows.

Extract:

- mobile is not a small website;
- check thumb zones, safe areas, navigation, spacing, and content hierarchy;
- use platform-appropriate density and gestures.

### Expo Native UI

Source: https://github.com/expo/skills/blob/main/plugins/expo/skills/building-native-ui/SKILL.md

Use for: Expo/React Native screens and native-feeling mobile prototypes.

Extract:

- respect safe areas and scroll containers;
- use haptics and platform motion when they improve feedback;
- keep responsive layout and text overflow explicit.

### SwiftUI

Source: https://github.com/ameyalambat128/swiftui-skills

Use for: native iOS/macOS SwiftUI designs, platform-native component grammar, and Apple ecosystem screens.

Extract:

- follow platform conventions;
- prefer native controls and layout behavior before custom visuals.

### Material 3

Source: https://github.com/hamen/material-3-skill

Use for: Android/Google-style surfaces, Compose/Flutter material systems, and products intentionally using Material grammar.

Extract:

- use tokens and component roles;
- check color roles, elevation, shape, and state layers.

Avoid when: the product is not Material-led; forced Material can flatten brand taste.

## Open Design Local Libraries To Prefer

Search/install these in Open Design before hand-writing equivalents:

- `community-hallmark`
- `design-system-shadcn`
- `design-system-dashboard`
- `example-dashboard`
- `example-mobile-app`
- `example-mobile-onboarding`
- `example-cinematic-landing-page`

## Selection Matrix

- Web app: Anthropic Frontend Design + Hallmark + shadcn.
- Mobile app: Mobile App UI Design + Expo Native UI + shadcn if the implementation is React-based.
- Dashboard: Dashboard + shadcn + Hallmark.
- Landing page: Anthropic Frontend Design + Premium Frontend UI or one taste preset.
- Motion prototype: GSAP Skills + HyperFrames + the surface-specific library.

## Anti-Stacking Rule

Use one primary library. Add a secondary library only for a missing dimension: components, dashboard density, mobile grammar, or motion. If two libraries disagree, the product surface wins.
