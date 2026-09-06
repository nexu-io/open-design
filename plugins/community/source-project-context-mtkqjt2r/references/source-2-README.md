# FlowMax Pros — Complete Opendesign Design System

A reusable design-system package reconstructed from the **FlowMax Pros** marketing CRM (flowmaxpros.com), an 11-section React + Tailwind + GSAP landing site mirrored 1:1 in this workspace under `site/`.

**Design DNA in one sentence:** a premium ink-and-paper marketing narrative — deep navy (`ink`) fields, warm paper surfaces, one restrained gold accent, one electric-blue action color — carried by a *Playfair Display serif / Geist grotesk / Geist Mono label* type system.

## Product overview

- **Product**: FlowMax Pros — CRM and marketing automation for agencies, dental practices, med spas and coaches (marketing site + `/enterprise`, `/pricing`, `/app`, localized `/fr`, `/es`, `/de`, `/ar`).
- **Primary surface**: a long, scannable marketing scroll: nav + hero with a live product-demo card → 6-stat band → revenue-leakage → 6-workflow templates → industry tabs with chat simulator → 6 features → comparison table → closing CTA → footer.
- **Core capabilities highlighted**: template-first automation engine (50+ ready workflows), multi-channel campaigns (email/SMS/voice/web), AI lead & deal insights, flat-rate pricing ($0 per-seat fees), 14-day no-card trial.
- **Verified**: 11 sections with headings identical to source; 0 console errors; 0.000585 pixel diff vs original; no horizontal scroll 1366→360px; weakest contrast pair 4.68:1; double-ring focus; reduced-motion fallbacks (evidence: `RECON/`, `NOTES.md`).

## Layout

```
DESIGN.md                  Rules: task scope, context, fundamentals, components, motion, voice, anti-patterns
brand.json                 Machine-readable brand manifest: token roles, voice, typography, surfaces, provenance
SKILL.md                   Agent-facing usage instructions (YAML frontmatter + reuse sections)
colors_and_type.css        Reusable token foundation (light/dark semantic + premium-landing DNA + role tokens)
context/provenance.md      Source attribution, asset origins, licensing + redeployment caveats
assets/                    Preserved source brand assets
  brand/                   flowmaxpros-logo.png, mailchimp-mark.svg
  imagery/                 Enterprise boardroom, platform-video poster, og/twitter share images
build/                     Runtime icons: favicon.ico, icon-192/512, apple-touch-icon, manifest.json
fonts/                     Self-hosted Geist, Geist Mono, Playfair Display (source woff2 + fonts.css)
examples/site/             Preserved high-signal source HTML pair (index.html + index-original.html)
site/                      The untouched 1:1 asset mirror used as primary evidence
preview/                   Focused review cards (see Preview manifest)
ui_kits/app/               Applied interface kit: index, V1 flows + v2.css, Veyra redesign screens (landing + Stripe pricing)
RECON/                     Recon evidence: JSON, screenshots, interaction probes
NOTES.md, CLONE_AUDIT.md, CLONE_REPORT.md    Clone/polish/director audit trail
context/source-context.md  Source project handoff manifest
```

## What's inside

A complete Claude-Design-style package: token foundation (`colors_and_type.css`), rules (`DESIGN.md`), machine-readable brand manifest (`brand.json`), agent-facing skill (`SKILL.md`), provenance (`context/provenance.md`), preserved brand assets (`assets/`), runtime icons (`build/`), self-hosted fonts (`fonts/`), preserved source HTML (`examples/site/`), focused preview cards (`preview/`), and an applied interface kit (`ui_kits/app/`). The untouched source mirror lives under `site/` and the recon evidence under `RECON/`.

### Refinement round (v2)

Re-measured against the production bundle and corrected to the bundle truth:
- Runtime motion object `Xe`: interact hover `.14s`, strike delay `.6s`, stagger `.07s` (was `.12s`), easings confirmed.
- Button hover/press `#1D4ED8` (`bg-blue-700`), captured as `--action-hover` / `--action-press`.
- New role-coded tokens (surfaces, text ramps, tint/hover, focus rings) and a spacing/layout scale in `colors_and_type.css`; dual-theme (marketing vs `.dark` app shell) contract documented in `DESIGN.md` §10.
- Brand voice deepened with the source scenario-hero variants and terminology rules (§9).

## Source & context references

- Source site: https://flowmaxpros.com · Source OpenDesign project `b83194cc-c9bf-4319-80b1-95d74beb67be` · this project `cd95a210-2f9d-4213-a8ec-d75bfbcb23e9`.
- Tokens measured from `site/assets/index-B9b6BLNK.css`; copy/components from `site/assets/index-Du2xdisQ.js`; layout/headings/palette from `RECON/*-recon.json`; interactions from `RECON/interactions-clone/clone-interactions.md`.
- Full provenance and redeployment caveats: `context/provenance.md`.

## Preview manifest

Review cards — start with `preview/index.html`:

| Card | File | Focus |
|---|---|---|
| Colors | `preview/colors-primary.html` | Brand DNA + semantic light/dark + chart ramp + alpha ramps |
| Typography | `preview/typography-specimens.html` | Playfair / Geist / Geist Mono, scale + pairing |
| Spacing | `preview/spacing-tokens.html` | Band rhythm 96/160/240 + density + page rhythm |
| Radius & shadows | `preview/radius-shadows.html` | Radius scale, message radii, elevation, motion tokens |
| Components | `preview/components-buttons.html` | Buttons, tabs, workflow cards, comparison, chat, stats, nav, closing CTA |
| Brand assets | `preview/brand-assets.html` | Preserved logo/icons/share cards/imagery/font files (loaded from assets/, build/, fonts/) |
| Applied surfaces | `preview/applied-surfaces.html` | Rendered proof (1440/768/390 + 1366→360), hover/tab probes, links into the site + kit |

Applied interface kit: `ui_kits/app/index.html` (V1 marketing landing, hero product demo, components) + **V2 redesign** `ui_kits/app/screens/marketing-landing-v2.html` and `pricing-v2.html` (Veyra rebrand, new jade/topaz identity, Stripe pricing).

## Fast start (reuse workflow)

1. Read `DESIGN.md` for every rule; the tokens are fixed — do not invent colors.
2. Paste `colors_and_type.css` verbatim into the artifact's first `<style>` (it self-loads `fonts/fonts.css`). Wrap marketing surfaces in a `.premium-landing` root.
3. Apply components from `preview/components-buttons.html` and `ui_kits/app/components.html`.
4. For pixel-true source behavior reuse the preserved mirror under `site/`; use `RECON/` screenshots as rendered proof.
5. Keep this README, `SKILL.md`, `DESIGN.md`, the preview manifest and `ui_kits/app/README.md` synchronized with the file structure.

## How to use (agent workflow)

1. Bind `colors_and_type.css` + `.premium-landing` wrapper (see `SKILL.md` for the full procedure).
2. Copy component shapes, not designs — reference `preview/components-buttons.html` and `ui_kits/app/components.html`.
3. Keep gold = emphasis, action blue = interaction, one primary CTA per viewport.
4. Verify contrast, hover states, focus rings, and 360px behavior before delivery.

## Review workflow for reviewers

1. Open `preview/index.html` → inspect `colors-primary`, `typography-specimens`, `components-buttons`.
2. Open `ui_kits/app/index.html` → walk the marketing landing screen and the hero product demo.
3. Compare applied surfaces against `RECON/screenshots/clone-1440.png` and the preserved `examples/site/index.html`.
4. Check hover/focus states and contrast against the rules in `DESIGN.md` §3.3 and §8.

## Verified facts the system relies on

- 11 sections, headings identical to source; `0` console errors; pixel diff `0.000585`; no horizontal overflow 1366→360 (`RECON/clone-wide-recon.json`).
- Contrast pairs all ≥ 4.5:1 (weakest `4.68:1`); focus rings double-ring on light and dark.
- All stats (`50+`, `4`, `2hrs`, `$0 Per-Seat Fees`, `14days`) are real source copy.
- Fonts (Geist, Geist Mono, Playfair Display) are open SIL OFL — safe to self-host.

## Legal note for redeployment

Brand, logo and copy © FlowMax Pros. The source declares no license; obtaining the original site's authorization (or replacing brand + copy) is required before any public redeployment. Payment/email endpoints were not cloned. See `context/provenance.md`.