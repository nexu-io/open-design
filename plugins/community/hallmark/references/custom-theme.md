# Custom theme — protocol

Loaded only when the user has opted into the **custom** theme route in Step 1 of the Design flow. Custom produces a **complete OKLCH palette + free-font pairing tuned to this brief** — a one-off theme written inline into the page's `:root`, not a permanent catalog entry.

**The freedom is the combination, not the rules.** Every constraint in [`color.md`](color.md), [`typography.md`](typography.md), and [`anti-patterns.md`](anti-patterns.md) still applies. The 65 slop-test gates fire unchanged. The Step 5 preview block surfaces the palette + pairing in plain text *before* any code is emitted, so the user can redirect.

## Two words, plain English

- **catalog** — the named-theme catalogue. Hallmark's 22 themes (Specimen, Atelier, Brutal, Salon, Newsprint, Linen, Studio, Manifesto, Terminal, Midnight, Almanac, Garden, Quiet, Riso, Sport, Bloom, Coral, Violet, Aurora, Halo, Plume, Editorial). Each one is a fixed combination of paper-band, display-style, and accent-hue. The rotation rule cycles through them so two consecutive runs don't read alike. **This is the default.** Most briefs use it.
- **custom** — made-to-measure. A one-off palette + font pairing constructed specifically for one brief. The skill builds the OKLCH values, picks fonts, and stamps the page — but does **not** extend the catalog with a new theme. The rules behind the catalog (paper L bands, accent chroma caps, font ban list, slop-test gates) all still apply; only the *combination* is per-brief.

## When to surface this fork — Step 1 trigger signals

Hallmark must **not** offer catalog-vs-custom on every prompt. That's friction, not discipline. Surface the fork only when the brief carries one of these signals:

1. **Explicit ask** — the user types `custom`, "custom theme", "tailored to our brand", "make it ours", "something unique", "play around with the colors and fonts", "I want my own palette".
2. **Named brand colour** — the user gives a specific anchor colour as a hex / OKLCH / brand name. Example: "use our terracotta", "the brand red is hex #c0392b", "anchor on sea-blue".
3. **Multi-attribute aesthetic the catalog can't carry** — three or more vibe words pointing at a specific, off-catalog feel. Examples: "moss, lichen, soft pink, herbal" / "sun-drenched, market-day, carbon-black" / "late-night, neon, brutalist deli". Compare against the 22 catalog themes; if no single catalog theme is within one axis-step of the vibe, fire the fork. **One adjective ("warm", "technical", "playful") is not a signal — that's a tone, the catalog already carries it.**
4. **Brand-mood reference attached** — the user attaches a colour swatch, a moodboard, a Pantone chip. (If they attach a *page* screenshot, route to `study` instead; custom is for brand colour / mood, study is for design DNA.)

If any signal fires, ask one short follow-up before picking a theme:

> *"This brief reads like a custom palette would fit better than the 22 named themes. Want me to construct a custom OKLCH palette + free-font pairing tuned to <one-line summary of the vibe>, or stay on the catalog for variety + speed?"*

Wait for the user to answer. If they say custom (or yes / go) → continue this protocol from § A. If they say catalog (or no / stay catalog) → drop the fork and proceed with the catalog route. **Default to catalog** — silence routes to catalog, not custom.

If **none** of the signals fires, do not mention the fork at all. Continue silently with the catalog flow.

---

## § A · The one follow-up question

Once the user names `custom` as the theme route, ask **one** thing in **one** message:

> *"Custom needs one input — describe the brand's vibe in 4–8 words. Examples: 'archival warmth, hand-set, no varnish' · 'industrial precision, cool, technical' · 'moss, lichen, soft pink, herbal' · 'sun-drenched, market-day, carbon black' · 'late-night, neon, brutalist deli'.*
>
> *Optional second input: an anchor colour — hex, OKLCH, or a name like 'terracotta', 'sea-blue', 'forest-green', 'dusty-pink'. If you skip it, I'll pick one from the vibe."*

**Do not ask anything else.** Audience / use / tone (Step 1) plus the brand vibe is already enough signal. The model has no business asking the user to nominate paper lightness or font weights — that's the model's job.

If the user gives just two or three words ("sun-drenched"), proceed; the recipe below extracts enough. If the user gives a paragraph, accept it but compress to 4–8 words for the stamp.

---

## § B · Palette construction

Build the palette in this order. Each step cites the rule it's obeying — do not restate the rule, just apply it.

### B.1 · Anchor accent first

- Convert the user's named or hex anchor into OKLCH.
- Clamp chroma to **0.12–0.20** per [`color.md`](color.md) § "Accent — the discipline".
- If user skipped: derive hue from the vibe — *warmth* → 30–60° · *technical/industrial* → 220–250° · *botanical/moss* → 130–160° · *late-night/neon* → 280–320° · *sun-drenched/market* → 60–80° amber. Keep chroma 0.12–0.16 (mid-saturation; saturation comes from contrast against neutral, not from chroma).

### B.2 · Paper

- Derive paper L from the vibe:
  - bright/airy/breakfast/hand-set → **L 95–98 %** (warm-tinted)
  - archival/editorial/restrained → **L 92–95 %** (warm-tinted)
  - technical/clinical/spec-sheet → **L 98–100 % near-white** (cool-tinted; can equal #fff but tinted neutrals downstream)
  - dark/restless/late-night/manifesto → **L 12–18 %** (anchor-tinted)
- **Always tint paper toward the anchor hue with chroma 0.005–0.020** per [`color.md`](color.md) § "Neutral tinting". Pure-white #fff is allowed only when ink + accent + greys carry the chroma; the paper itself never carries chroma 0 in *both* directions.
- Paper-2 (one elevation step): step ±2–4 % L from paper.
- Paper-3 (optional second step): step ±5–7 % L from paper. Skip on minimal palettes.

### B.3 · Ink

- If paper L < 50: ink L **88–96 %**.
- If paper L ≥ 50: ink L **16–24 %**.
- Tint ink chroma **0.005–0.014** toward anchor (a shade darker / lighter, never neutral).
- Ink-2 (secondary text): step 4–8 % L away from ink toward paper. Same hue family.

### B.4 · Supporting greys

Step by ~6–10 % L between paper and ink, all tinted toward anchor with chroma 0.005–0.018:

- `--color-rule` — dividers · L ~70–82 % (light paper) or ~26–34 % (dark paper).
- `--color-rule-2` — secondary dividers · 4–6 % L closer to paper than rule.
- `--color-muted` — de-emphasised text · L ~38–56 %.
- `--color-neutral` — mid-grey equivalent · L ~30–56 %.

These are not arbitrary. The L-step gives the palette **typographic depth** without leaning on accent.

### B.5 · Focus

- Same hue as accent, slightly higher chroma (0.18–0.22) for visibility.
- Same L as accent ±5 %.
- Used only on `:focus-visible` — must show instantly per [`microinteractions.md`](microinteractions.md) § "Focus is a first-class state".

### B.6 · Accent-ink (overlay text colour on accent)

- If accent L > 50: use ink (text reads dark on accent fill).
- If accent L ≤ 50: use paper (text reads light on accent fill).
- Verify **APCA contrast ≥ 7:1** for body, ≥ 3:1 for large text per [`color.md`](color.md).

### B.7 · Verification

- **Gate 8** (no pure #000 / #fff base): paper and ink both have chroma > 0. Pass.
- **Gate 24** (no zero-chroma neutrals): every grey has chroma ≥ 0.005. Pass.
- **Gate 25** (accent ≤ 5 % footprint): plan the accent's role on the page (active state, one wordmark dot, one CTA fill). Don't carpet a section in accent.

---

## § C · Font pairing

Custom pulls from the seven tone-pairings in [`typography.md`](typography.md) — Editorial, Technical, Brutalist, Soft, Luxury, Playful, Austere, Workshop. Each tone has a **free baseline** and a **paid upgrade**.

### C.1 · The freedom

The catalog pairs Display-from-tone-X with Body-from-tone-X. **Custom can mix tones** — that's the whole point:

- Editorial display + Technical body (italic Fraunces wordmark + Geist body) — works for an academic-tone SaaS.
- Brutalist display + Editorial body (Anton + Newsreader italic) — works for a left-leaning manifesto magazine.
- Playful display + Austere body (Bricolage Grotesque + Inter Tight) — works for a creator-tool brand.
- Luxury display + Technical body (Cormorant Garamond + JetBrains Mono) — works for a hand-crafted dev-tool.

Pick **one display face** and **one body face** from any tone's columns. Optional mono if the page has code or tabular data.

### C.2 · The discipline

- **Free baseline only** unless the user has confirmed paid licences. Per [`typography.md`](typography.md) § "The discipline": "Never name a paid font in code without confirming the user is licensed."
- **Banned defaults still banned** per [`typography.md`](typography.md) § "Banned defaults" — Inter / Roboto / Open Sans / Poppins / Lato / Work Sans / DM Sans / Montserrat / system-ui as display all fail Gate 1.
- **Variable fonts are preferred** when available (Fraunces, Bricolage Grotesque, Newsreader, Geist, EB Garamond, Inter Tight) — they support optical-size and weight axes for tighter typographic control.

### C.3 · The pair must read

Once you have display + body, mentally render the page:

- Does the display face have enough weight contrast (200/400 next to 700/900) per [`typography.md`](typography.md) § "Commit to extremes"?
- Does the body face read at the chosen body size (≥ 14 px floor; default 1 rem) at the chosen measure (45–75 ch)?
- If display is mono and body is mono — that's only allowed when the page IS the design (Terminal-aesthetic, true single-font specimen). Per [`typography.md`](typography.md) line 7.

If any answer is no, redirect — pick a different body face or shift the display weight.

---

## § D · Custom-axis computation

A custom theme must declare its three diversification-rule axis values explicitly so [`SKILL.md`](../SKILL.md) § "Theme-diversification rule" fires the same way as it does on catalog themes.

### D.1 · Paper band

- **dark** — paper L < 30 %
- **mid** — paper L 30–85 %
- **light** — paper L > 85 %

### D.2 · Display style

Pick one based on the chosen display face:

- **italic-serif** — Fraunces italic, Newsreader italic, EB Garamond italic, Cormorant italic
- **roman-serif** — Source Serif 4, Newsreader, Crimson Pro, Bitter, Cardo
- **geometric-sans** — Geist, Bricolage Grotesque, Inter Tight, Manrope, Sora
- **mono** — Geist Mono, JetBrains Mono, IBM Plex Mono, Space Mono
- **display-condensed-italic** — Migra italic, Tobias italic
- **display-condensed-bold** — Anton, Bebas Neue, Oswald, Barlow Condensed
- **display-heavy** — Inter Tight 900, Bricolage 800, Druk-class
- **slab-serif** — Roboto Slab, Bitter heavy, Zilla Slab
- **system-native** — system-ui, Inter Tight 400 (austere)
- **risograph-bold** — bold sans with hand-crafted feel
- **handwritten** — Caveat, Sacramento, Patrick Hand (rare; only when brand demands)

### D.3 · Accent hue band

- **warm** — hue 10–60° (red, orange, amber)
- **cool** — hue 200–300° (blue, indigo, cyan)
- **neutral** — no chromatic accent (austere; chroma < 0.05)
- **chromatic-other** — anything outside warm/cool/neutral. Sub-tag the specific anchor: `chromatic-green ~145°` · `chromatic-sage ~120°` · `chromatic-phosphor ~150°` · `chromatic-terracotta ~30°` · `chromatic-dusty-pink ~350°` · `chromatic-moss ~140°` · `chromatic-amber ~75°`.

### D.4 · Where these go

Write all three into the macrostructure stamp (§ E below) and the `.hallmark/log.json` entry (§ F below). They are the durable record. The next run reads them.

---

## § E · Stamp format

The CSS comment at the top of the produced stylesheet (per [`SKILL.md`](../SKILL.md) Step 6 § "Stamp the output"):

```css
/* Hallmark · macrostructure: <name> · <hero archetype + knobs>
 * theme: custom · vibe: "<4–8 words>" · paper: oklch(<L>% <C> <H>) · accent: oklch(<L>% <C> <H>)
 * display: <font name> · body: <font name> · axes: <paper-band> / <display-style> / <accent-hue>
 * studied: no · context: <user-provided | inferred> · v0.6.x
 */
```

Concrete example:

```css
/* Hallmark · macrostructure: Long Document · H5 hero knobs: salutation=time-stamp, body=2 paragraphs, signoff=initials
 * theme: custom · vibe: "archival warmth, hand-set, no varnish" · paper: oklch(94% 0.020 65) · accent: oklch(58% 0.16 35)
 * display: Fraunces italic · body: Source Serif 4 · axes: light / italic-serif / chromatic-terracotta
 * studied: no · context: explicit · v0.8.0
 */
```

The stamp is the durable record. `audit` reads it. The next run reads it. The user reads it.

---

## § F · `.hallmark/log.json` entry shape

Custom runs extend the existing schema with a `theme_axes` field and an optional `vibe` field:

```json
{ "date": "2026-05-01",
  "macrostructure": "Stat-Led",
  "theme": "custom",
  "theme_axes": "light / italic-serif / chromatic-terracotta",
  "vibe": "archival warmth, hand-set, no varnish",
  "enrichment": "none",
  "brief": "Coffeebox · subscription" }
```

Catalog entries continue to record `theme: <name>` and skip `theme_axes` (the catalog's axes are looked up from [`tokens.css`](../../../site/css/tokens.css)). Step 2.5 logic uses the same diversification check on both — for catalog entries it reads the axes from tokens.css; for custom entries it reads them from the entry.

When rotating, **a custom run that follows another custom run must differ on at least one axis from the previous custom** — same rule as catalog-vs-catalog. A custom run that follows a catalog run must differ on at least one axis from the catalog's axes. The diversification rule is theme-route-blind.

---

## § G · Three worked examples

Concrete generations to seed model imitation. Each shows the brief, the user's vibe answer, the constructed palette, the chosen pair, and the stamp.

### G.1 · Archival café — "Coffeebox"

**Brief:** *"Build me a landing page for Coffeebox — a small-batch coffee subscription. Roast on Sunday, ship on Monday, drink Tuesday. Audience: people who already buy good coffee and want fewer trips to the shop. Tone: warm, hand-set, editorial — like a small café's chalkboard. Theme route: custom."*

**Vibe answer:** *"archival warmth, hand-set, no varnish."*  **Anchor:** *"terracotta."*

**Palette:**
- paper `oklch(94% 0.020 65)` — warm-cream, hue 65 (amber-warm)
- paper-2 `oklch(91% 0.022 65)` — one elevation step
- ink `oklch(22% 0.014 60)` — warm dark brown-black
- ink-2 `oklch(40% 0.014 60)` — warm secondary
- rule `oklch(78% 0.018 65)` — warm hairline
- muted `oklch(54% 0.014 60)` — warm grey
- accent `oklch(58% 0.16 35)` — terracotta (hue 35, chroma 0.16)
- accent-ink `oklch(96% 0.014 65)` — paper for text on accent
- focus `oklch(56% 0.20 35)` — accent at higher chroma

**Pair:** display **Fraunces italic** (Editorial, free) · body **Source Serif 4** (Editorial, free) · mono **JetBrains Mono** (Technical, free).

**Axes:** **light / italic-serif / chromatic-terracotta**.

**Stamp:**
```css
/* Hallmark · macrostructure: Long Document · H5 hero knobs: salutation=time-stamp, body=2 paragraphs, signoff=initials
 * theme: custom · vibe: "archival warmth, hand-set, no varnish" · paper: oklch(94% 0.020 65) · accent: oklch(58% 0.16 35)
 * display: Fraunces italic · body: Source Serif 4 · axes: light / italic-serif / chromatic-terracotta
 * studied: no · context: explicit · v0.8.0
 */
```

### G.2 · Industrial fintech — "Loop"

**Brief:** *"Loop is a real-time payment-rail observability platform for fintechs. Audience: platform engineers. Use case: try it / contact sales. Tone: industrial, cool, technical. Theme route: custom."*

**Vibe answer:** *"industrial precision, cool, technical."*  **Anchor:** *"sea-blue."*

**Palette:**
- paper `oklch(13% 0.012 220)` — dark cool
- paper-2 `oklch(17% 0.014 220)` — one step up
- paper-3 `oklch(22% 0.014 220)` — two steps up (panels)
- ink `oklch(94% 0.010 220)` — cool light
- ink-2 `oklch(72% 0.010 220)`
- rule `oklch(30% 0.012 220)`
- muted `oklch(58% 0.012 220)`
- accent `oklch(72% 0.16 220)` — sea-blue (cool)
- focus `oklch(78% 0.20 220)`

**Pair:** display **Geist Mono 500** (Technical, free) · body **Geist** (Technical, free) · mono **Geist Mono** (Technical, free).

Note: this *is* a single-family page (Geist + Geist Mono are the same family at different widths). [`typography.md`](typography.md) line 7 allows it: "single-font pages are allowed only when the single font IS the design choice." For an industrial-precision fintech, that's the design choice.

**Axes:** **dark / mono / cool**.

**Stamp:**
```css
/* Hallmark · macrostructure: Workbench · F2 sticky-scroll knobs: pinned=right, content=trace-panel, steps=3
 * theme: custom · vibe: "industrial precision, cool, technical" · paper: oklch(13% 0.012 220) · accent: oklch(72% 0.16 220)
 * display: Geist Mono 500 · body: Geist · axes: dark / mono / cool
 * studied: no · context: explicit · v0.8.0
 */
```

### G.3 · Botanical apothecary — "Mossroot"

**Brief:** *"Mossroot is a small herbal apothecary in Porto. We make tinctures, salves, and tea blends. Audience: locals + visitors. Use: see what we make + visit. Tone: quiet, herbal, hand-poured. Theme route: custom."*

**Vibe answer:** *"moss, lichen, soft pink, herbal."*  **Anchor:** *(skipped — pick from vibe)*.

The vibe names two hues: *moss* (greenish, ~140°) and *soft pink* (warm, ~350°). Pick **soft pink as the accent** (single anchor — custom is one-accent strict) and use the moss-green as the *paper tint* (chroma 0.018 toward 145°). This carries the dual-vibe without splitting accent.

**Palette:**
- paper `oklch(96% 0.018 145)` — moss-tinted near-white
- paper-2 `oklch(93% 0.020 145)`
- ink `oklch(22% 0.014 140)` — moss-tinted dark
- ink-2 `oklch(42% 0.014 140)`
- rule `oklch(82% 0.018 145)`
- muted `oklch(56% 0.014 140)`
- accent `oklch(72% 0.13 350)` — dusty-pink (chromatic-other)
- focus `oklch(70% 0.18 350)`

**Pair:** display **Cormorant Garamond** (Luxury, free) · body **EB Garamond** (Luxury, free) · mono **Geist Mono** (rare on this page; only for ingredient lists).

**Axes:** **light / roman-serif / chromatic-other (dusty-pink)**.

**Stamp:**
```css
/* Hallmark · macrostructure: Catalogue · F1 catalogue knobs: tiles=8, columns=2, rule=hairline-between
 * theme: custom · vibe: "moss, lichen, soft pink, herbal" · paper: oklch(96% 0.018 145) · accent: oklch(72% 0.13 350)
 * display: Cormorant Garamond · body: EB Garamond · axes: light / roman-serif / chromatic-other (dusty-pink)
 * studied: no · context: explicit · v0.8.0
 */
```

---

## What custom does **not** do (worth restating)

1. **Does not invent themes that ignore the rules.** Every paper L band, accent chroma cap, neutral-tinting requirement, font ban, and slop-test gate carries forward. The freedom is the *combination* — not the rules.
2. **Does not save themes for reuse.** A custom run is per-output. The skill does not write back to [`tokens.css`](../../../site/css/tokens.css). If the user wants a permanent theme, they paste the custom palette into tokens.css themselves and name it.
3. **Does not ask multiple follow-up questions.** One vibe answer (+ optional anchor) is enough. The audience/use/tone from Step 1 plus the brief plus the macrostructure pick already give the model 80 % of the signal.
4. **Does not relax the diversification rule.** Custom entries declare their three axes the same way catalog entries do; the rotation rule fires on both, theme-route-blind.
5. **Does not bypass the Step 5 preview.** The custom palette + pairing surface in plain text *before* any code is emitted, so the user can redirect early.

If any of those five lines is bent, the custom output is over-invented. Audit it; redirect.
