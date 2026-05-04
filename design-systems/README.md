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
  coral accent. Pairs with [`skills/editorial-collage/`](../skills/editorial-collage/)
  for the canonical landing-page rendering.
- **`kami/`** — 紙 / 纸. Editorial paper system distilled from
  [`tw93/kami`](https://github.com/tw93/kami) (MIT). Warm parchment canvas,
  ink-blue accent, serif at one weight, no italic, no cool grays. Pairs with
  the [`templates/kami-deck.html`](../templates/kami-deck.html) starter for
  slide work.
- **57 design skills**, sourced from
  [`bergside/awesome-design-skills`](https://github.com/bergside/awesome-design-skills)
  and added directly as normalized 9-section `DESIGN.md` files.
- **70 product systems**, imported from
  [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md)
  (the [`getdesign@latest`](https://www.npmjs.com/package/getdesign) npm
  package, MIT-licensed). One folder per brand:

  | Category | Systems |
  |---|---|
  | AI & LLM | claude · cohere · elevenlabs · minimax · mistral-ai · ollama · opencode-ai · replicate · runwayml · together-ai · voltagent · x-ai |
  | Developer Tools | cursor · expo · lovable · raycast · superhuman · vercel · warp |
  | Productivity & SaaS | cal · intercom · linear-app · mintlify · notion · resend · zapier |
  | Backend & Data | clickhouse · composio · hashicorp · mongodb · posthog · sanity · sentry · supabase |
  | Design & Creative | airtable · clay · figma · framer · miro · webflow |
  | Fintech & Crypto | binance · coinbase · kraken · mastercard · revolut · stripe · wise |
  | E-Commerce & Retail | airbnb · meta · nike · shopify · starbucks |
  | Media & Consumer | apple · ibm · nvidia · pinterest · playstation · spacex · spotify · theverge · uber · vodafone · wired · xiaohongshu |
  | Automotive | bmw · bugatti · ferrari · lamborghini · renault · tesla |

Folders use ASCII slugs — dotted brands are normalized (`linear.app` →
`linear-app`, `x.ai` → `x-ai`, etc.).

## File shape

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

The 70 product systems are pulled from the upstream npm package. To re-sync
to the latest hashes:

```bash
curl -sL $(npm view getdesign dist.tarball) -o /tmp/getdesign.tgz
tar -xzf /tmp/getdesign.tgz -C /tmp
node --experimental-strip-types scripts/sync-design-systems.ts
```

For now, the original importer lives at the top of the
[`excessive-climb` branch](../) — re-run it against a fresh tarball.

## Attribution

The 70 product systems are sourced from
[`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md)
(MIT, © VoltAgent contributors). They are aesthetic *inspirations* — none
of them are official assets of the brands they reference.

The `kami/` system adapts tokens, type rules, and the "ten invariants" from
[`tw93/kami`](https://github.com/tw93/kami) (MIT, © Tw93 and contributors),
a Claude skill for typesetting professional documents and slide decks.

The 57 design skills are sourced from
[`bergside/awesome-design-skills`](https://github.com/bergside/awesome-design-skills).
