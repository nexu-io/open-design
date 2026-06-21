---
name: nimbus-grid
description: "Use this plugin when the user wants a premium dark warm-gold single-page marketing site for a secure cloud-storage capacity product: a full-viewport shader hero with a live console card and typewriter, a scroll-driven sticky platform accordion, a scroll-morphing pricing bar field, security cards with API window + binary map, a 3D tilting console showcase, and a click-to-explode operations cube. Invoke for 'Nimbus Grid', 'cloud storage landing page', 'shader hero marketing site', 'scroll accordion landing', or when the user references the Nimbus Grid template."
version: 0.1.0
od:
  mode: prototype
  surface: web
  scenario: design
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
---

# Nimbus Grid — Secure cloud storage marketing site

Produce a single-page marketing site for **Nimbus Grid**, a fictional secure cloud-storage capacity platform, with a dark warm-gold aesthetic. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data only; do not rewrite the CSS or invent a new visual language. The seed already encodes every token, section layout, scroll behavior, and animation described below.

This is the authoritative build brief. The named colors, fonts, shader URL, section structure, and JS-driven animations are **locked**.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). It already includes everything inline — no images, no frameworks; every visual is CSS / SVG / text.
- If the user explicitly asks for the Vite multi-file project from the original prompt, split into `index.html`, `styles.css`, `script.js`, `package.json` (`vite ^5.4.2`, `type:module`, scripts `dev`/`build`/`preview`), `vite.config.js` (default). Port the seed **faithfully** — same tokens, same markup, same JS. Build with `npm run build`. Do not change the design while porting.

## Fonts

Load from Google Fonts with preconnect to both `fonts.googleapis.com` and `fonts.gstatic.com`:
- **IBM Plex Sans** weights 400, 500 — body and headings.
- **IBM Plex Mono** weights 400, 500 — labels, code, nav, eyebrows, CTAs.

## CSS variables (`:root`) — locked

```
--bg: #17130d;
--ink: #fff4d5;
--muted: #dacaa1;
--line: rgba(255,240,199,0.28);
--glass: rgba(255,239,199,0.16);
--glass-strong: rgba(255,239,199,0.24);
--accent: #ead09a;
--accent-2: #ffd879;
--deep: #4d3f24;
--radius: 8px;
color-scheme: dark;
```

Body: background `radial-gradient(circle at top left, rgba(255,216,121,0.18), transparent 28rem) + var(--bg)`, ink `#fff4d5`, IBM Plex Sans, `font-size:1rem`, `line-height:1.375`, `letter-spacing:0.0175rem`, antialiased. `<meta name="theme-color" content="#17130d">`. `html { scroll-behavior: smooth }`. Universal `box-sizing:border-box`. Anchors inherit color, no underline.

## Section 1 — Hero (`.hero`, `min-height:100svh`)

- Animated shader: `<iframe class="shader-bg" src="https://fragcoord.xyz/embed/c6zisyc6?viewport=1422x800" allow="autoplay; fullscreen" referrerpolicy="no-referrer">`, absolutely centered with `transform: translate(-50%,-50%) scale(var(--shader-scale,5))`, `z-index:-3`, `pointer-events:none`. **Keep this exact shader URL.**
- `.shader-fallback` behind it (`z-index:-4`): radial + linear warm-gold gradient `#846f43 → #f0d27c → #fff2be` so the page still reads if the shader fails.
- JS: on load + debounced resize (180ms), recompute viewport so the iframe matches window aspect, capped at 1422×800; `scale = max(innerWidth/w, (innerHeight+110)/h)`.
- `.site-header` (flex row, `min-height:42px`): brand `NIMBUS GRID` in a glass pill (`padding:9px 12px`, 1px ink-translucent border, `backdrop-filter: blur(18px) saturate(1.35)`, Plex Mono 12px uppercase, inset highlight + soft shadow); right nav `Technology / Security / Capacity / Operations` (Plex Mono 12px uppercase, 0.04rem ls, ink-translucent, hover brightens); `.header-cta` "Get Started" same glass pill, hover lifts 1px + brightens.
- `.console-card` (top-left, `width:min(396px,42vw)`, `rgba(13,16,19,0.88)`, 5px radius, blurred backdrop):
  - Tabs row `grid-template-columns: repeat(3,minmax(0,77px)) 1fr auto`: `CLI`, `API`, `Console`, then window controls (small square + wide bar). Active tab = accent color + 2px accent underline.
  - Three panes, only the active shown, `min-height:153px`, Plex Mono 11px:
    - **CLI**: `<pre>` `$ nimbus storage create \ --workspace prod-web \ --tier encrypted-fast \ --region eu-central` (`$` accent), then typed output line `storage pool web-db-test queued` (accent).
    - **API**: `POST /v1/storage/pools` JSON `{name:"web-db-test", tier:"encrypted-fast", quota:"8 TiB"}`, typed output `202 accepted: provisioning policy attached`.
    - **Console**: form slots — `Instance name = web-db-test` (typed), `Image = ubuntu-24.04-noble`, two-column `Memory = 8 GiB` / `CPUs = 2`. Each `.console-input` is a 33px outlined dark slot; select-style ones append a `▾`.
  - **Typewriter**: per active pane, type each `[data-typed]` one char every 42ms with a blinking `::after` caret (1px bar, `cursor-blink` 1s `steps(2,start)`).
- Hero copy (bottom-left): H1 "Cloud space that scales with your business systems." (Plex Sans 400, `clamp(29px,3.5vw,56px)`, line-height 1, max-width 18ch); paragraph "Nimbus Grid sells secure cloud storage capacity for companies that need fast onboarding, predictable throughput, encrypted collaboration, and modern data residency controls." (`clamp(12px,1.125vw,16.5px)`, max-width 720px). A blurred dark radial `::before` (filter blur 26px) keeps copy readable over the shader.

## Section 2 — Platform accordion (`#platform`, scroll-driven)

`min-height:420svh`, near-black `#050604` with subtle gold radial top-right.

- `.accordion-inner` `position:sticky; top:0`, full-viewport height, grid `0.22fr | 0.78fr`.
- `.accordion-nav`: four Plex Mono 11px uppercase pill labels each prefixed by a 7px square dot: `Programmable infra`, `Data residency`, `Elastic scaling`, `Unified visibility`. Active = accent color, shifts right 2px.
- `.accordion-stack` (height `min(80svh,820px)`): four `.accordion-card` panels `position:absolute; inset:0`, each a two-column grid (copy + visual) on black with a 1px ink top border.
  - Card 1 — Programmable infra: code window `01 storage_pool = { 02 name = "client-vault" 03 region = "eu-central" 04 quota = "24 TiB" 05 policy = encrypted_fast 06 }`.
  - Card 2 — Data residency: `Region policy / EU Central locked / US East allowed / AP Southeast review / Retention 7 years`.
  - Card 3 — Elastic scaling: `Capacity forecast / Used 18.4 TiB / Reserved 24 TiB / Burst ready / Next tier approved`.
  - Card 4 — Unified visibility: `Operations view / Sync health stable / Cold data 14% / Policy drift 0 / Audit export live`.
  - Each visual: warm gold gradient backdrop `linear-gradient(135deg, rgba(234,208,154,0.92), rgba(106,91,52,0.68))` + radial highlight, centered dark code window with 3 dot-spans, 8px radius, deep shadow.
- Scroll JS: track `getBoundingClientRect()` → progress 0..1 over `(height − viewport)`; active card index = round(progress·(n−1)). Card N translateY animates from off-bottom (`stackHeight + collapsedHeight`) up to `index * collapsedHeight` (collapsed = 84px desktop / 96px mobile), clamped per segment, written to `--card-y` (transform) and `--card-clip-bottom` (clip-path inset) so the active card reveals while previous cards stay as header strips. Clicking a tab smooth-scrolls to that card's segment.

## Section 3 — Pricing (`#pricing`)

Dark olive `#11120f` with light top wash + soft cyan radial blur `rgba(151,211,235,0.14)` from top-left.

- Top grid (max-width 1320px, `0.38 | 0.62`): left eyebrow `Pricing` (accent, Plex Mono 16px uppercase) + H2 "Only pay for cloud storage your teams actually use." (`clamp(34px,4vw,68px)`, line-height 1) + paragraph "Scale capacity up for active projects and cool it down when workspaces go quiet. Nimbus Grid keeps storage, transfer, and policy costs visible before they become invoices."
- Right `.pricing-table`: header "Storage costs" + billing toggle pill (`Per month` muted, `Per GiB` active = accent pill with `#241d0f` text). Five 1px-separated rows (`1fr | auto`), right values in Plex Mono:
  - Encrypted active storage — `$0.021 / GiB / month`
  - Warm collaboration tier — `$0.012 / GiB / month`
  - Cold retained archive — `$0.004 / GiB / month`
  - Regional accelerated transfer — `$0.018 / GiB moved`
  - Customer-managed key vault — `included`
- Pricing bars — full-bleed (`width:100vw; margin-left:calc(50% - 50vw)`), 12-column grid, `height:480px`, bars bottom-aligned. Each bar `height: var(--bar-height) + var(--bar-morph,0px)`, `min-height:120px`, gold gradient (alternating muted variant). Base heights `66/58/50/62/45/54/48/64/72/70/78/82%`. Top edge fades into the section via a gradient overlay.
- JS: `progress = (viewport − rect.top) / (viewport + rect.height)`; per-bar `morph = sin(progress*2π + i*0.72)*34 + cos(progress*π + i*0.34)*14` px → `--bar-morph`; `transition: height 80ms linear`.
- Plan row — 3 cards (max 300px each): Starter "For small teams consolidating shared project files." CTA `Start small`; Team "For departments scaling collaboration and regional transfer." CTA `Build team plan`; Enterprise "For organizations prioritizing governance, residency, and support." CTA `Talk to sales`. CTAs: 42px pill, Plex Mono 12px uppercase, 1px ink border, glass bg, hover brightens.

## Section 4 — Security (`#security`)

`#120f0a` with two soft radials (gold top-right, warm orange bottom-left), max-width 1320px.

- Heading row (`0.58 | 0.42`): left eyebrow `Security` + H2 "Modern encryption and compliance controls without slowing the team down."; right paragraph "Role-based access, customer-managed keys, immutable retention, and regional storage policies give business clients a cloud layer that can satisfy procurement, IT, and legal from the first deployment."
- Three cards (`repeat(3,1fr)`, gap `clamp(16px,2vw,22px)`, `min-height:464px`, square corners, 1px ink border, `#0f0c08` + subtle top wash):
  - **API** — "Full policy control" + copy. Black `.api-window` (bottom-left ~58%, 184px) with three dots and `-> nimbus auth login / Enter code / VAULT-9AMP / -> policy attach / workspace/client-vault`; overlapping `.api-spec` (top-right, `rgba(64,52,30,0.86)`, accent border) showing `openapi: 3.0.0 / info: title: Nimbus API / paths: /storage/pools: /keys: /regions: /retention:`.
  - **Compliance** — "Full compliance" + copy. Three rows, each a 24px circular accent badge with a CSS checkmark (`::before`, rotated bottom+left borders) + label + accent-strong sub; rows `rgba(48,39,23,0.84)` with accent-translucent borders: SOC 2 — Type II controls; ISO 27001 — Security management; GDPR — Regional data policy.
  - **Economics** — "Ownership and predictable economics" + copy. `<pre class="binary-map">` of 1s/0s (10 rows × 28 cols carving a small lock/icon shape). Below, 3-row asset table: `Reserved tier | 24 TiB`, `Transfer lane | EU Central`, `Revision | Q603` (Mono 11px uppercase keys, mixed-case values).

## Section 5 — Console showcase (`#plans`)

Dark teal-leaning `#070a0b` with cyan radial accent + a faint repeating-stripe decoration (`::after`, top-right).

- Heading row: H2 "The biggest forward leap in business cloud storage operations." (`clamp(25px,4vw,52px)`, color `#dff5ff`) + right paragraph "A single control plane for provisioning storage pools, reviewing policy, watching growth, and shipping audit-ready reports without asking teams to change how they work."
- Figure label pill (Plex Mono): `Fig. 2  Nimbus Grid web console`.
- `.dashboard-shell`: full-width, 8px radius, cyan-translucent border, `rgba(5,8,10,0.9)` bg, deep shadow, perspective transform. Topbar = 3 dots + placeholder title bar. Body grid `240px | 1fr`:
  - Sidebar "Client Vault" + nav: Workspaces, Storage Pools (active, cyan tint), Retention, Access, Transfers, Reports.
  - Main: title "Storage Pools" (cyan `#97d3eb`) + `New pool` cyan-outlined button; 5-column table (headers Plex Mono uppercase, States cyan Plex Mono uppercase): finance-vault / EU Central / 18.4 TiB / 7 years / Healthy; design-assets / US East / 9.8 TiB / Versioned / Syncing; legal-archive / EU Central / 42.1 TiB / Immutable / Healthy; migration-lane / AP South / 6.2 TiB / Temporary / Queued.
  - Toast bottom-right: "Pool created / finance-vault ready" (cyan on dark).
- Hover: shell tilts `rotateX(1deg) rotateY(-1.2deg) translateY(-8px)`, border brightens, sheen pseudo-element sweeps left→right (`translateX(-34%) → 34%`, opacity 0→1), 220ms ease / 520ms sheen.

## Section 6 — Operations cube (`#operations`)

`#0c0d0a` with cyan + gold radials + a left-to-right dark gradient overlay so copy reads cleanly.

- Two columns `0.44 | 0.56`. Left: eyebrow `Operations`, H2 "A control layer for every storage move your business makes." (`clamp(34px,4.4vw,72px)`, line-height 0.98), paragraph "Route migrations, active workspaces, archives, and compliance exports through one operational grid. Nimbus Grid keeps capacity, policy, and transfer status visible before teams hit a limit." CTA `Plan operations` — solid accent gold pill, `#1b160d` text, hover swaps to `--accent-2` + lifts 2px.
- Right: 3D cube with explode-on-click.
  - `.modal-cube-shell` button, `perspective:1000px`, `transform-style:preserve-3d`.
  - `.operations-core-cube` size `clamp(142px,18vw,250px)` with 6 `.cube-face` (front/back/right/left/top/bottom), 18px radius, gold-blue radial+linear gradient, inset highlights + shadows.
  - Idle: `core-cube-float` 6s ease-in-out infinite (small Y bob + rotation drift).
  - On click (toggle `is-exploded`): core scales to 0.72; ~14 `.cube-particle` shards (10 fragments + 4 small `.dot` spheres) translate to randomized `--tx/--ty/--tz` with `--s`, `--r`, staggered `--d`. Particles `cubic-bezier(0.17,0.78,0.18,1)` 760ms transform + 420ms opacity, start blurred + dim → end sharp. Keep the 14 particle definitions (tx −330..330, ty −250..225, tz 30..210, s 0.09..0.58). A `--spread` multiplier scales the explosion per breakpoint.
  - JS: click (also Enter/Space when focused) toggles `is-exploded`. Focus outline 1px ink-translucent, offset 10px.

## Animations summary

- `cursor-blink` — 1s `steps(2,start)` console caret.
- `core-cube-float` — 6s gentle Y bob + rotation drift on idle cube.
- Pricing bars — JS `--bar-morph` on scroll, `transition: height 80ms linear`.
- Accordion cards — JS `--card-y` translate + `--card-clip-bottom` clip-path follow scroll.
- Dashboard shell hover — 220ms 3D tilt + 520ms sheen sweep.
- Operations CTA hover — 160ms color/transform; cube explode — core 620ms cubic-bezier, shards 760ms cubic-bezier + 420ms opacity, staggered.
- Header CTA / accordion tabs / nav links — 160–200ms hover transitions. Smooth scroll on tab → section navigation.

## Responsive

`@media (max-width:820px)`: header → single column, nav wraps full-width, CTA full-width; hero stacks, console card full width, diagonal console decoration hides; console tabs → 3 equal 48px columns, window controls hide, pane `min-height:200px`; pricing top + plan row + security grid → single column; accordion nav → 2-column grid above the stack, stack height 78svh, cards → 1-column; console showcase heading stacks, dashboard body single column, sidebar nav 2-cols, table drops Policy + State columns, toast inline at bottom; operations stacks, cube `--spread:0.72`.

`@media (max-width:520px)`: hero padding `22px 18px 0`, H1 `clamp(28px,10vw,48px)`, copy 15px; accordion nav 1-column; operations cube `--spread:0.48`, visual `min-height:360px`; dashboard title row stacks vertically.

## Color rules — hard

Palette is warm gold/cream on near-black, with cyan accents reserved for the console showcase (`#97d3eb`, `#dff5ff`) and an orange/red highlight reserved for radial washes. **Accent gold `--accent: #ead09a` / `--accent-2: #ffd879` is locked** — do not substitute purple, teal, or green for the gold. No images: every visual is CSS, SVG, or text.
