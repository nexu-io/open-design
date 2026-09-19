# Trio Atlas Design System

The single source of truth for **Trio** — TrioSoft's AI-powered enterprise IT platform (MDM/UEM/RMM, endpoint security, identity & access, compliance, and patch & vulnerability management) for IT administrators and MSPs. Trio manages Windows, macOS, Linux, Android, iOS, iPadOS and ChromeOS fleets across device management, policies, software, remote operations, onboarding, automation, compliance, identity, reporting and settings.

**Atlas** is a dense, information-first enterprise UI built on **shadcn/ui v3 + a Trio custom layer**, the **Geist** typeface, with full **light and dark themes**. Every screen is composed from Atlas tokens and Stable components — never from ad-hoc, feature-local UI. Page structure, region proportion, hierarchy and visualization selection are design decisions guided by `phases/p10` and `phases/p11`, not deviations.

> **Governance rule.** Reuse the Stable system by default (target 90%+ of any surface). Compose freely within it — page structure, hierarchy, scale and visualization choice are not fixed; see `phases/p09` for the Green/Yellow/Red freedom zones and `phases/p10` for page archetypes. Prototype a justified gap only in the labeled Experimental lane; never alter a token value or a protected contract locally. When a doc and a specimen disagree, **the specimen wins**.

---

## Sources this system was built from

Stored so a reader with access can go deeper. Do not assume access.

- **Interactive specimens (the behavioral truth):** `uploads/atlas-specimen-01…15-*.html` — color, typography, radius/elevation/spacing/motion, buttons, badges, inputs & forms, cards, table, drawers & dialogs, wizard, app shell, states, learning surfaces, business components, toasts & notifications. These are the tie-breaker whenever prose and a specimen disagree.
- **Token source of truth:** `Trio Atlas Design System (1)/ai-export/tokens.css` (Trio front-end `packages/ui/src/tokens/*` + the "Trio AI Ready Design System" Figma `MwhPLpCcLd0CTx66zZfeG8`).
- **Codebase (mounted, read-only):** `Trio Atlas Design System (1)/` (TableKit, adapters, hooks, docs_source, assets), `trio-atlas/`, `Product Context/`, `features specs/`.
- **Proposal / architecture:** `uploads/Trio-Atlas-Unified-DS-Proposal.md` (Registry ATLAS-OS-01, eight-tier token model, canonical patterns, governance).
- **GitHub (browse for real product code):**
  - https://github.com/triosoftinc/trio-Business-ReactAppMR — the Trio business React app.
  - https://github.com/triosoftinc/TrioV2-CoreBackEndApp — the Trio V2 core backend.
  - Explore these to build higher-fidelity designs against real product flows.
- **Brand assets:** `assets/logo/`, `assets/os/`, `assets/compliance/`, `assets/software/`, `assets/devices/` (copied from the codebase `assets/`).

---

## Content fundamentals — how Trio writes

Voice is **precise, operational, never marketing.** The reader is an IT admin or MSP operator doing consequential work; copy respects their time and never oversells.

- **Buttons are Verb + Noun** — "Create policy", "Assign device", "Enroll device", "Delete policy". Never bare *Create / Save / Submit / OK / Done*.
- **Status labels are lowercase** — `active`, `pending`, `failed`, `compliant`, `non-compliant`, `at risk`, `unknown`. Always.
- **Approved terminology only** — Device, User, Policy, Application, Threat. Use these nouns consistently.
- **No marketing language** — never *powerful, smart, intelligent, advanced, robust, seamless, effortless*.
- **Dialog titles name the action** ("Delete this policy?"), never a generic "Confirm".
- **Field descriptions explain how Trio uses the value** and never repeat the label. Labels are nouns; placeholders are examples; optional fields carry no marker.
- **Empty states educate** — they teach what the surface is for and how to fill it, never just "No data".
- **AI voice explains, recommends and prioritizes — it never commands and never hides risk, severity, compliance or decisions.** "7 devices trending toward non-compliance… reapplying the baseline resolves 6 of 7" — then the human decides.
- **Perspective:** address the operator's fleet directly ("across your fleet", "your organization"); the product is the neutral subject ("Trio alerts you when…"). No first-person "I".
- **No emoji, ever.** No unicode glyphs standing in for icons.

---

## Visual foundations

**Type.** Geist for all product UI; **Geist Mono** for serials, IPs, versions and code only. Compact **13/18 base** — dense enterprise, not consumer web. **Three weights only: 400 / 500 / 600.** Six roles: title 20/26·600, page/entity 15/20·600, section/card 13/18·600, body 13/18·400, label 12/16·500, caption/column-header 11/16·500. The 36/40 and 14/20 ramps are retired. Never `font-serif` or Lato (marketing only).

**Color.** Primary is neutral **`#171717`** — **no Trio orange in product UI.** Light canvas `#ffffff` on foreground `#0a0a0a`. Dark is the **softened `#1a1a1a` family** — canvas `#1a1a1a`, card `#212121`, popover `#262626`, accent `#333333` — **never pure black**, with real surface layering so panels lift instead of reading flat. Status uses one recipe across hues (bg 100 · border 200 · text 700/800 · fill 600) so badges, alerts, toasts and progress agree. Severity is an ordered ramp (critical → high → medium → low → none). Charts are 8 categorical hues spread across the wheel, tuned per mode; **red is reserved for status/alerts, never a chart category.**

**Color is never the only signal.** Status always carries an icon + text; severity carries a dot + lowercase label — meaning survives grayscale and color-blindness.

**Backgrounds.** Flat surfaces — **no gradients** in product UI, no textures, no hero imagery. Depth comes from 1px borders + surface layering + soft shadows, not decoration. Content is left-aligned within a `1280px` cap (extra space sits on the right); operational pages fill the width — no centered island, no empty right-side gap. Reading pages cap at `680px`.

**Radius.** 6 (checkbox) · 8 (button/input) · 10 (card/filter) · 14 (dialog/table) · full (badge/avatar). 4px spacing base; 24px page gutter shared by header and body.

**Elevation.** Soft shadows in light (xs → 2xl); dark leans on borders + surface layering rather than heavy shadows. Cards = 1px border + `--radius-lg`, subtle/no rest shadow; navigable cards hover-lift `translateY(-2px)` + `--shadow-md` + focus ring; display cards stay static.

**Interaction states.** Hover: primary/destructive dim to 90% opacity; secondary/outline/ghost fill to `--accent`; inputs darken the border. Focus: 2px ring offset from the surface (`--ring`). Disabled: 50% opacity + `not-allowed`. Loading: skeleton or a spinner, never a spinner where a skeleton fits. Selected rows tint with `--info` at 12%.

**Identity** is an **initials monogram** (deterministic color from the name) as the **production** mark; a `src` opts into a **photo avatar for demo/prototype only**, falling back to the monogram if the image is missing.

**Motion** confirms a state change, never decorates. Durations 75 / 150 / 220 / 320ms; nothing routine over ~400ms; ease-out for entrances, ease-in-out for size. No infinite decorative loops. Everything gated by `prefers-reduced-motion`.

---

## Iconography

Three-tier policy — the right tier for each job:

1. **Functional UI icons** — **Lucide**, rendered inline at **16px** (search, plus, check, chevron, alert, info, more, device, shield, clock…). 2px stroke, `currentColor`. In production these route through the `Icon` component + `TrioIconMap`; in these DS files and kit they are inline Lucide-style SVGs at the same spec.
2. **Navigation icons** — each nav entry keeps its **assigned icon** (never swapped to a generic Lucide glyph). See `ui_kits/trio-platform/icons.jsx`.
3. **Brand / identity** — the **real asset** (brand-mark exception): OS marks (`assets/os/`), software/SaaS logos (`assets/software/`), compliance framework badges (`assets/compliance/`), the Trio logo (`assets/logo/`). Never recolor, filter or reconstruct these; render the same file at the size you need.

**No emoji. No unicode characters as icons. No hand-drawn one-off SVGs** for functional icons — file an icon request instead.

Assets copied into this project: **logo** (mark light/dark, wordmark, full lockup), **OS** (Windows, Apple, macOS, iOS, iPadOS, Android, Linux, ChromeOS, tvOS), **compliance** (SOC 2, ISO, HIPAA, NIST, PCI DSS, GDPR, CCPA, CIS, STIG, NCA, SAMA, CVE), **software** (M365, Google, Slack, Zoom, Teams, Figma, Notion, VS Code, Okta, Chrome), **connectors** (`assets/connectors/` — 215 integration-connector marks, normalized to a 64×64 transparent canvas, addressable by slug, with `manifest.json` carrying category, provider, source and verification status per logo), **devices** (macbook, iphone, ipad, surface, imac, android). The Android OS mark was replaced with the clean green robot per review feedback.

---

## Foundations (Design System tab)

Token specimen cards live in `guidelines/`:
`colors-core`, `colors-dark-surfaces`, `colors-status`, `colors-severity`, `colors-charts` · `type-families`, `type-scale`, `type-weights` · `spacing-scale`, `spacing-radius`, `spacing-elevation`, `spacing-motion` · `brand-logo`, `brand-os`, `brand-compliance`, `brand-software`, `brand-connectors`, `brand-iconography`.

Tokens are authored under `tokens/` and shipped via the root `styles.css`:
`tokens/fonts.css` · `tokens/colors.css` · `tokens/typography.css` · `tokens/spacing.css` · `tokens/semantic.css` · `tokens/base.css`. Component classes ship via `components/atlas.css`. Consumers link the single **`styles.css`**.

### Trio Platform → User Portal

The **User Portal** is the self-service experience layer for end users and managers, built on the same Atlas tokens, components and business data as the Admin Portal — **not** a separate design language. It adds one scoped layer (`tokens/user-portal.css`, shipped via `styles.css`, applied with `data-portal="user"`) that overrides only geometry/density and adds a **brand-accent set aliased to Trio orange** for hero/brand moments — never primary buttons, status, severity, charts or links. Everything else is inherited and flips with `.dark`.

- **Spec (source of truth):** `User Portal — Design Architecture.html` — the five design layers, token decisions, component map, product alignment (Endpoint / Service Hub / IAM / Insight), gap analysis and usage rules.
- **Foundation cards** (Design System tab, **User Portal** group): `user-portal-architecture`, `user-portal-tokens`, `user-portal-components`, `user-portal-patterns`, `user-portal-layouts`.
- **Templates** (`templates/user-portal-*`): `UserPortalDashboard` (hub), `UserPortalSelfEnroll` (BP-04 self-enroll wizard), `UserPortalMyDevices` (my devices & compliance).
- **Interactive kit:** `ui_kits/trio-user-portal/` — hub, my-devices + fix drawer, app catalog, requests (with manager approvals), security; light/dark + employee/manager toggles.
- **Governance:** no new components — the portal composes the existing set (target 90%+ reuse). New tokens are portal-scoped, not global.

---

## Components

React primitives (each `Name.jsx` + `Name.d.ts` + `Name.prompt.md`, with one `@dsCard` per group). Import via `const { X } = window.TrioAtlasDesignSystem_7a9120`.

**Forms & Actions** (`components/forms/`) — **Button**, **IconButton**, **Input**, **Textarea**, **Select**, **Combobox**, **MultiSelect**, **Checkbox**, **Radio**, **Switch**, **FormField**, **ChoiceCard**.

> **Combobox** and **MultiSelect** (P08-B) are the searchable/multi-value case **Select** deliberately does not cover — ARIA `combobox` + `aria-activedescendant`, popped on P08-A's shared non-modal anchored surface (`useAnchored`). Use **Select** for a small static option set; reach for these only when search or multi-value selection is the actual need.

> **ChoiceCard** is the one selection card — wizard steps, plan pickers, platform grids. `density="row"` for lists, `density="tile"` for icon grids, `multi` for checkbox semantics; wrap a set in `ChoiceGroup`. Never hand-roll a bordered div with a dot: hover / focus / selected / disabled and the dark surfaces only exist in `.atl-choicecard`.

**Data display** (`components/data-display/`) — **Badge**, **StatusText**, **SeverityBadge**, **BaseCard**, **KpiCard**, **Identity**, **IdentityStack**, **DeviceIcon**, **DeviceRender**, **StatusStripCard**, **ListCard**, **ProgressBar**, **SegmentedBar**, **Gauge**, **Sparkline**, **MiniChart**, **Timeline**, **CompareStat**, **Heatmap**, **StepDots**, **Radar**, **ResourceMeter**, **BatteryLevel**, **GradeGauge**, **GradeRing**, **KeyValueGroup**, **KeyValueRow**, **ObjectHeader**, **EvidenceRow**, **ChartFrame**.

> **Card bodies on the one BaseCard shell — when a card is the right container.** Use a card only when content has a meaningful independent boundary, state, navigation target or action context (see `phases/p10`); otherwise use section composition, whitespace or an inline figure instead of wrapping content in a card for consistency's sake. When a card **is** the right container, the system is **one shell + composable bodies + figures**, never a component per variant. **BaseCard** carries the shared chrome for every card: leading `icon`, `title`/`subtitle`, a `meta` row (scope · time range · data freshness), a context `menu` (⋯), an `accent` stripe (alert/risk framing), `footer`/`footerLink` drill-down, and the shared `state` bodies (`loading` skeleton · `empty` · `error` · `permission`). **KpiCard** covers every metric/stat tile (arrow · badge · icon+ratio · CTA-link · rich body via `children` · compact stat). **StatusStripCard** is the composed device/entity card (status strip + rows + chips + action). **ListCard** is the header + divided-rows feed/catalog (never a substitute for the Main/Drawer table). The in-body **figures** are **ProgressBar** (progress + target), **SegmentedBar** (freshness/mix or normalized workflow distribution), **Gauge** (ring / semi / arc score gauge with threshold zones + needle), **Sparkline** (trend line), **MiniChart** (`bars`/`stacked`/`hbars`/`donut` data-viz + distribution), **Timeline** (chronological event rail), **CompareStat** (this-vs-that), **Heatmap** (severity × bucket matrix), **StepDots** (discrete step progress) and **Radar** (multi-axis performance / coverage profile). **KpiCard** also has a solid-tone `fill` emphasis tile. For endpoint telemetry, **ResourceMeter** (CPU/memory/disk header + stats + area chart) and **BatteryLevel** (fill indicator); for scorecards, **GradeGauge** (letter-grade target dial) and **GradeRing** (compact grade-in-ring). The taxonomy — KPI, summary, health, risk, status, trend, comparison, progress, distribution, activity, timeline, alert, recommendation, action, entity, data-viz, mini-table, operational, empty/error/permission — maps onto this set by composition; see `components/data-display/cards.card.html`.

> **KeyValueGroup** is the one key–value recipe — a semantic `dl` for a single read-only record, with **KeyValueRow** for each pair (`label`, `meta`, `actions`; omit the value and an em dash renders). `variant="stacked"` gives the responsive label-above-value band, its column count driven by the container rather than a media query. Never hand-roll a flex row with `justify-content:space-between`, and never emit a `dt`/`dd` outside a group.

> **ObjectHeader** is the canonical tenant-scoped detail header (P04): identity, tenant name, status, freshness and an object-level data condition banner in one place. **EvidenceRow** is a KeyValueRow for one piece of evidence (00.3 E) — it adds a provenance line (source · basis · scope · expiry · audit ref) and renders exactly the evidence condition it is given; it computes and authorises nothing.

> **DeviceRender** is the canonical device visual: device type × platform × `mark`/`render` variant × status, in one component (reuses `assets/os/` marks + `assets/devices/` 3D renders). Use `mark` in tables/cells/dense selectors and `render` on detail heros, drawer headers, onboarding and device pickers. `DeviceIcon` remains the low-level OS-mark chip it composes — prefer `DeviceRender` for new work. Never fork a feature-local device renderer or add a new platform icon.

**Navigation** (`components/navigation/`) — **Tabs**, **SegmentedControl**, **Breadcrumb**, **PageHeader**, **SectionHeader**. Product shells are host-owned and must use the current canonical shell composition.

> **Tabs** owns view switching and renders its own tabpanel when given `panels`; **SegmentedControl** owns immediate reversible value selection and is a `radiogroup`, never a tablist.

> **PageHeader** is the page-shell header (breadcrumb · title · description · actions) and **SectionHeader** is the band inside a page. They are one composition at two type steps — the portal only re-densities the `--pagehead-*` / `--sechead-*` tokens — so a page title and a section title can never end up the same size again.

**Feedback** (`components/feedback/`) — **Banner**, **EmptyState**, **Toast**, **NotificationItem**, **AIInsightCard**. Use **Banner** only for governed operational feedback.

**Overlays** (`components/overlays/`) — **Drawer**, **Dialog**, **ConfirmDialog**.

**Data** (`components/data/`) — **DataTable** (the canonical Main table, sortable + `aria-sort`), **Pagination** (P08-D standalone promotion of the same mechanism DataTable uses), **Wizard** (canonical BP-04 full-page stepper), **WorkflowHost** (P05 governed-action shell: authority, targets, policy basis, preflight, state, receipt — never an execution engine).

**AI** (`components/ai/`) — **AgentWorkspace** (P06 quiet AI workspace: composer, response blocks that distinguish observation/inference/recommendation/draft-action/needs-evidence/blocked, citations bound to the evidence vocabulary, and a draft-action review that hands off to WorkflowHost only after explicit user confirmation — never an execution, approval or identity surface itself).

### Canonical patterns (non-negotiable)

- **One app shell** — L1 rail 64 + L2 panel 256/48 + header 56, full-width workspace. Operational pages fill the width; entity detail is two-column.
- **Two tables only** — a **Main table** (`DataTable`) for management/list/detail-tab/wizard-step, and a **Drawer table** for in-drawer selection; a **Widget table** (`.atl-wtable`) on dashboards. Never a third table, list or custom grid.
- **One BaseCard shell** — every KPI/stat/list/toggle card is this shell with a different body.
- **Right-side drawers** for detail/selection/config; **centered dialogs** for a focused decision; a **confirm variant that names the action** for anything destructive.
- **Wizards follow BP-04** — the **`Wizard`** component: variable/conditional steps, step-level validation, named-outcome primary button, Review only for 3+, no progress bar, leave protection, Wizard Help in the DS Drawer, Primary Table inside steps, shell hidden.

### Intentional additions

- **DeviceRender** / **DeviceIcon** and **Icon** wrappers render device assets, brand/OS marks and Lucide glyphs — thin wrappers over the asset library and icon policy, not new visual language. DeviceRender fulfils the Registry's deferred `CMP-device-icon`.
- **StatusText** is the in-cell (no-pill) variant of the status family, per the badges specimen.

---

## UI kit

**`ui_kits/trio-platform/`** — an interactive recreation of the Trio platform: L1 rail (Dashboard, Endpoint, Identity, Compliance, Patch), L2 accordion nav, header chrome (⌘K command palette, trial badge, theme toggle, notifications), a **Devices management page** (canonical Main table with search/filters/bulk/pagination + AI insight), a **device detail drawer**, and a **Dashboard** (KPI cards + device-coverage widget table + activity feed). Toggle light/dark from the header. Composes the DS components; shell layout in `shell.css`.

---

## Importing previous-Atlas projects (backward compatibility)

`tokens/compat.css` (shipped via `styles.css`) makes projects built on the previous Trio Atlas token set import cleanly, with **one canonical system + one scoped legacy layer** — no parallel system:

- **Global safe aliases** (`:root`) — every legacy/missing token name (motion `--motion-instant`, action `--action-primary-bg`, and the full table / sidebar-L1+L2 / wizard / widget / chart / logo / icon / maps / business-domain sets) resolves to the **same** canonical value. These never change a current value.
- **Scoped legacy values** (`[data-atlas-legacy]`) — only the *conflicting* legacy values (`--header-h:64`, `--row-h:40`, `--text-sm:14`, `--text-base:16`, `--tracking-tight:0`, `--badge-h:18`/`--badge-pad-x:6`/`--badge-font:11`, `--table-selection-col-w:40`). A legacy project sets `data-atlas-legacy` on its root/import subtree to restore old geometry + type ramp; the canonical DS keeps its own values everywhere else.

```html
<!-- canonical current DS -->
<body> … </body>
<!-- imported previous-Atlas surface -->
<div data-atlas-legacy> …legacy markup renders with old header/row/text/badge metrics… </div>
```

**Deliberate retentions:** dark surfaces stay the specimen-accurate `#1a1a1a` family (not the previous `#0a0a0a`); the Badge component stays 24px canonical (18px available only under the legacy scope). Multi-font switching and the alternate Google Fonts are **not** imported — Geist stays the single canonical font. Breakpoint tokens exist for JS/inline use; CSS `@media` queries use the literal px (480/768/1024/1280).

## Migration — v2.1.0 "Key–value"

This release is the authoritative baseline for product migrations. The contract is in
three documents, written to be handed to another project as-is:

- **[`MIGRATION.md`](MIGRATION.md)** — release baseline, breaking changes, page patterns, the wizard standard, deprecated patterns, the replacement matrix, extension rules and the migration acceptance checklist.
- **[`migration/token-registry.md`](migration/token-registry.md)** — every token family with light and dark values, scope behaviour, deprecated equivalents and the never-hardcode list.
- **[`migration/component-registry.md`](migration/component-registry.md)** — all 54 components with variants, sizes, props, usage rules, the state matrix and accessibility requirements.

A visual summary is in the Design System tab under **Governance → v2.0 — Migration contract**.
Release history is in [`CHANGELOG.md`](CHANGELOG.md).

Two rules override everything else: a migration changes presentation only — business
logic, workflows, data relationships, API contracts and permissions come out identical —
and a product never forks the system. If something is missing, land the extension here
first, then consume it.

## Repository index

- `styles.css` — the single consumer entry point (`@import` list only).
- `tokens/` — token CSS (fonts, colors, typography, spacing, semantic, base, **user-portal**).
- `tokens/user-portal.css` — the scoped **User Portal** layer (`[data-portal="user"]`): brand accent + geometry/density; reuse-first.
- `components/atlas.css` — component class layer (shipped via `styles.css`).
- `tokens/compat.css` — backward-compatibility layer (global safe aliases + the `[data-atlas-legacy]` scope).
- `components/<group>/` — React primitives + `.d.ts` + `.prompt.md` + `@dsCard` card.
- `guidelines/` — foundation specimen cards (Design System tab).
- `ui_kits/trio-platform/` — interactive product recreation.
- `ui_kits/trio-user-portal/` — interactive **User Portal** recreation (self-service hub + flows).
- `assets/` — logo, os, compliance, software, devices.
- `fonts/` — Geist + Geist Mono TTF.
- `SKILL.md` — Agent-Skill entry point.

---

## Notes & caveats

- **Dark mode** flips on `.dark` (or `[data-theme="dark"]`) on a root ancestor. The value set follows the **softer `#1a1a1a` specimen family** (which supersedes the older `#0a0a0a` set in `ai-export/tokens.css`, per "specimen wins").
- **Fonts:** Geist Regular/Medium/SemiBold/Bold + Geist Mono Regular/Medium are bundled as TTF. The production app uses the woff2 build (`@fontsource/geist`); JetBrains Mono is the loaded mono fallback. No substitution was needed — all required Geist files were provided.
- The published Registry also defines Sidebar (as data-driven config), Command Palette and Notification Center as canonical surfaces; the shell kit demonstrates the palette + notifications, the collapsed-nav flyouts, and the two-table/drawer/card/wizard laws. **Wizard (BP-04)** is now authored as a component (`components/data/Wizard.jsx`).
- **permission-limited** is a first-class state: `Banner tone="permission"`, `StatusText tone="permission"`, and the permission pattern on `EmptyState` — it names what's restricted, why, and whether access can be requested, and never renders unauthorized actions as merely disabled.
