# Design Systems

Each subfolder is a portable design system in [`DESIGN.md`](../docs/spec.md)
format. Pick one in the top-bar **Design system** dropdown and every skill
will read it as part of its system prompt.

## What's bundled

- **`default/`** — Neutral Modern. Hand-authored starter for the OD spec.
- **`warm-editorial/`** — Warm Editorial. Hand-authored serif starter.
- **`atelier-zero/`** — Atelier Zero. Hand-authored magazine-grade
  collage system: warm paper canvas, plaster-and-architecture imagery,
  oversized italic-mixed display type, Roman-numeral section markers,
  side rails of rotated micro-text, coordinate annotations, single
  coral accent. Pairs with [`skills/open-design-landing/`](../skills/open-design-landing/)
  and [`skills/open-design-landing-deck/`](../skills/open-design-landing-deck/)
  for the canonical landing-page and slide-deck renderings.
- **`kami/`** — 紙 / 纸. Editorial paper system distilled from
  [`tw93/kami`](https://github.com/tw93/kami) (MIT). Warm parchment canvas,
  ink-blue accent, serif at one weight, no italic, no cool grays. Pairs with
  the [`templates/kami-deck.html`](../templates/kami-deck.html) starter for
  slide work.
- **57 design skills**, sourced from
  [`bergside/awesome-design-skills`](https://github.com/bergside/awesome-design-skills)
  and added directly as normalized 9-section `DESIGN.md` files.
- **72 product systems**, including 70 imported from
  [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md)
  (the [`getdesign@latest`](https://www.npmjs.com/package/getdesign) npm
  package, MIT-licensed), plus two hand-authored additions (`cisco`,
  `webex`). This table covers that imported product-system subset only; the
  full bundled catalog is larger once you include the hand-authored starters
  and the separate design-skill systems listed above. One folder per brand:

  | Category | Systems |
  |---|---|
  | AI & LLM | claude · cohere · elevenlabs · minimax · mistral-ai · ollama · opencode-ai · replicate · runwayml · together-ai · voltagent · x-ai |
  | Developer Tools | cursor · expo · lovable · raycast · superhuman · vercel · warp |
  | Productivity & SaaS | cal · intercom · linear-app · mintlify · notion · resend · webex · zapier |
  | Backend & Data | cisco · clickhouse · composio · hashicorp · mongodb · posthog · sanity · sentry · supabase |
  | Design & Creative | airtable · clay · figma · framer · miro · webflow |
  | Fintech & Crypto | binance · coinbase · kraken · mastercard · revolut · stripe · wise |
  | E-Commerce & Retail | airbnb · meta · nike · shopify · starbucks |
  | Media & Consumer | apple · ibm · nvidia · pinterest · playstation · spacex · spotify · theverge · uber · vodafone · wired · xiaohongshu |
  | Automotive | bmw · bugatti · ferrari · lamborghini · renault · tesla |

Folders use ASCII slugs — dotted brands are normalized (`linear.app` →
`linear-app`, `x.ai` → `x-ai`, etc.).

## Design System Project Shape

The current runtime still supports legacy folders that contain only
`DESIGN.md`. New imported or packaged systems should use the project shape
below so picker, daemon, agents, validators, and future importers can all
discover the same files without guessing.

```text
design-systems/<slug>/
├── manifest.json                ← machine-readable project entry
├── USAGE.md                     ← optional agent-facing package guide
├── DESIGN.md                    ← canonical design prose for agents
├── tokens.css                   ← canonical compiled CSS custom properties
├── components.html              ← optional standalone component fixture
├── components.manifest.json     ← optional rebuildable component cache
├── assets/                      ← optional brand assets
├── fonts/                       ← optional webfont files
├── preview/                     ← optional static preview pages
└── source/                      ← optional importer evidence and snippets
```

`manifest.json` is validated by `pnpm guard` when present. PR1 does not
require every bundled system to ship a manifest; old `DESIGN.md` systems are
skipped by the manifest guard and continue to work.

Minimum v1 manifest:

```json
{
  "schemaVersion": "od-design-system-project/v1",
  "id": "default",
  "name": "Neutral Modern",
  "category": "Starter",
  "description": "A clean, product-oriented default.",
  "source": {
    "type": "bundled",
    "origin": "hand-authored"
  },
  "files": {
    "design": "DESIGN.md",
    "tokens": "tokens.css",
    "components": "components.html"
  }
}
```

For v1, file locations are intentionally fixed:

- `files.design` must be `DESIGN.md`.
- `files.tokens` must be `tokens.css`.
- `files.components` is optional and, when declared, must be
  `components.html`.
- `assetsDir` is optional and, when declared, must be `assets`.
- `previewDir` is optional and, when declared, must be `preview`.

Imported systems may also declare richer optional indexes:

```json
{
  "usage": "USAGE.md",
  "componentsManifest": "components.manifest.json",
  "importMode": "hybrid",
  "craft": { "applies": [], "suggested": [], "exemptions": [] },
  "fonts": [],
  "preview": { "dir": "preview", "pages": [] },
  "sourceFiles": {
    "scanned": "source/scanned-files.json",
    "evidence": "source/evidence.md",
    "tokens": "source/tokens.source.json",
    "snippets": "source/snippets/INDEX.json"
  }
}
```

For PR0, these richer fields are structural only: the guard validates safe
relative paths, declared file or directory existence, JSON readability for
declared JSON indexes, and optional `components.manifest.json` drift. Runtime
prompt composition and picker behavior continue to use the existing
`DESIGN.md` / `tokens.css` / `components.html` paths until later PRs consume
the richer indexes.

The schema source of truth lives in
[`_schema/manifest.schema.ts`](_schema/manifest.schema.ts). The guard lives in
[`../scripts/check-design-system-manifests.ts`](../scripts/check-design-system-manifests.ts).

## Legacy File Shape

The first H1 is the title shown in the picker. The line immediately after
the H1 is parsed for `> Category: <name>` and used to group the dropdown:

```markdown
# Design System Inspired by Cohere

> Category: AI & LLM
> Enterprise AI platform. Vibrant gradients, data-rich dashboard aesthetic.

## 1. Visual Theme & Atmosphere
...
```

Both the boilerplate prefix `Design System Inspired by ` and the
`> Category: ...` line are stripped from the dropdown label and the summary
preview at runtime — they're only metadata.

## Adding your own

Drop a new folder containing a `DESIGN.md` and it shows up on next refresh.
Add a `> Category: <Group>` line to slot it under an existing group, or use
any new label and it lands at the bottom of the dropdown.

## Refreshing the bundled set

The 70 imported product systems are pulled from the upstream npm package. To
re-sync to the latest hashes:

```bash
curl -sL $(npm view getdesign dist.tarball) -o /tmp/getdesign.tgz
tar -xzf /tmp/getdesign.tgz -C /tmp
node --experimental-strip-types scripts/sync-design-systems.ts
```

For now, the original importer lives at the top of the
[`excessive-climb` branch](../) — re-run it against a fresh tarball.

## Attribution

The 70 imported product systems are sourced from
[`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md)
(MIT, © VoltAgent contributors). They are aesthetic *inspirations* — none
of them are official assets of the brands they reference.

The `cisco/` and `webex/` systems are hand-authored additions based on the
current public Cisco and Webex / Momentum visual languages.

The `kami/` system adapts tokens, type rules, and the "ten invariants" from
[`tw93/kami`](https://github.com/tw93/kami) (MIT, © Tw93 and contributors),
a Claude skill for typesetting professional documents and slide decks.

The `tom-modern/` system adapts the design system from
[`Tom-Opencart/tom-modern-html-style-rule`](https://github.com/Tom-Opencart/tom-modern-html-style-rule)
(MIT, © Tom-Opencart). The bundled package keeps the upstream origin in
`design-systems/tom-modern/manifest.json`; use the upstream repository for the
canonical templates, live preview, and license text.

The 57 design skills are sourced from
[`bergside/awesome-design-skills`](https://github.com/bergside/awesome-design-skills).
