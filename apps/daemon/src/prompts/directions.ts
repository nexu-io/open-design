/**
 * Built-in design direction library.
 *
 * Distilled from huashu-design's "5 schools × 20 philosophies" idea: when
 * the user hasn't specified a brand and selected "Pick a direction for me"
 * in the discovery form, the agent emits a *second* `<question-form>` whose
 * radio options are these 5 schools. Each school carries a concrete spec —
 * fonts, palette in OKLch, mood keywords, real-world references — that the
 * agent then encodes into the active CSS `:root` tokens before generating.
 *
 * The library has TWO purposes:
 *
 *   1. Render-time: the prompt embeds these as choices the user picks from.
 *      One radio click → a deterministic palette + type stack, no model
 *      improvisation.
 *   2. Build-time: once chosen, the agent sees the full spec (palette
 *      values, font stacks, layout posture, mood) inline in its system
 *      prompt and binds the seed template's `:root` to those values.
 *
 * Adding a new direction: append to `DESIGN_DIRECTIONS` and it shows up in
 * the picker automatically. Keep them visually *distinct* — two near-
 * identical directions defeat the purpose.
 */

export interface DesignDirection {
  /** kebab-case id, also the form-option label after `: ` */
  id: string;
  /** Short user-facing label, shown in the radio. ≤ 56 chars including the dash list. */
  label: string;
  /** One-paragraph mood description shown to the user as `help`. */
  mood: string;
  /** References / exemplars — real magazines, products, designers. */
  references: string[];
  /** Headline (display) font stack. CSS-ready. */
  displayFont: string;
  /** Body font stack. CSS-ready. */
  bodyFont: string;
  /** Optional mono override; falls back to ui-monospace. */
  monoFont?: string;
  /** Six palette values in OKLch — bind directly to seed `:root`. */
  palette: {
    bg: string;
    surface: string;
    fg: string;
    muted: string;
    border: string;
    accent: string;
  };
  /** Layout posture cues for the agent. Concrete, not vague. */
  posture: string[];
}

export const DESIGN_DIRECTIONS: DesignDirection[] = [
  {
    id: 'editorial-monocle',
    label: 'Editorial — Monocle / FT magazine',
    mood:
      'Print-magazine feel. Generous whitespace, large serif headlines, restrained palette of off-white paper + ink + a single warm accent. Confident, quietly intelligent.',
    references: ['Monocle', 'The Financial Times Weekend', 'NYT Magazine', 'It\'s Nice That'],
    displayFont: "'Iowan Old Style', 'Charter', Georgia, serif",
    bodyFont:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    palette: {
      bg:      'oklch(97% 0.012 80)',     // off-white paper
      surface: 'oklch(99% 0.005 80)',
      fg:      'oklch(20% 0.02 60)',      // ink
      muted:   'oklch(48% 0.015 60)',
      border:  'oklch(89% 0.012 80)',
      accent:  'oklch(58% 0.16 35)',      // warm rust / clay
    },
    posture: [
      'serif display, sans body, mono for metadata only',
      'no shadows, no rounded cards — borders + whitespace do the work',
      'one decisive image, cropped only at the bottom',
      'kicker / eyebrow in mono uppercase, one accent color, used at most twice',
    ],
  },
  {
    id: 'modern-minimal',
    label: 'Modern minimal — Linear / Vercel',
    mood:
      'Quiet, precise, software-native. System fonts, near-greyscale palette, a single saturated accent. The chrome disappears so content is the only thing that registers.',
    references: ['Linear', 'Vercel', 'Notion 2024', 'Stripe docs'],
    displayFont:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
    bodyFont:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
    palette: {
      bg:      'oklch(99% 0.002 240)',
      surface: 'oklch(100% 0 0)',
      fg:      'oklch(18% 0.012 250)',
      muted:   'oklch(54% 0.012 250)',
      border:  'oklch(92% 0.005 250)',
      accent:  'oklch(58% 0.18 255)',     // cobalt
    },
    posture: [
      'tight letter-spacing on display sizes (-0.02em)',
      'hairline borders only, no shadows except dropdowns/modals',
      'mono numerics with `font-variant-numeric: tabular-nums`',
      'sticky frosted nav, content-led layouts (no hero illustrations)',
      'one accent: links + primary CTA, nothing else',
    ],
  },
  {
    id: 'warm-soft',
    label: 'Warm & soft — Stripe pre-2020 / Headspace',
    mood:
      'Cream backgrounds, soft accent, gentle radii. Reads like a thoughtful product magazine — friendly without being cute. Good for fintech, wellness, indie SaaS.',
    references: ['Stripe pre-2020', 'Headspace', 'Substack', 'Mercury'],
    displayFont:
      "'Tiempos Headline', 'Newsreader', 'Iowan Old Style', Georgia, serif",
    bodyFont:
      "'Söhne', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    palette: {
      bg:      'oklch(97% 0.018 70)',     // warm cream
      surface: 'oklch(99% 0.008 70)',
      fg:      'oklch(22% 0.02 50)',
      muted:   'oklch(50% 0.018 50)',
      border:  'oklch(90% 0.014 70)',
      accent:  'oklch(64% 0.13 28)',      // terracotta
    },
    posture: [
      'serif display, soft sans body',
      'gentle radii (12–16px), no hard 0px corners on content cards',
      'single accent used for primary CTA + one editorial flourish (a quote mark, a stat)',
      'soft inner glow on hero cards rather than drop shadows',
      'avoid icons; use real screenshots / photographs / illustrations',
    ],
  },
  {
    id: 'tech-utility',
    label: 'Tech / utility — Datadog / GitHub',
    mood:
      'Data-dense, monospace-friendly, dark or light + grid. Made for engineers and operators who want information per square inch, not vibes.',
    references: ['Datadog', 'GitHub', 'Cloudflare dashboard', 'Sentry'],
    displayFont:
      "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif",
    bodyFont:
      "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace",
    palette: {
      bg:      'oklch(98% 0.005 250)',
      surface: 'oklch(100% 0 0)',
      fg:      'oklch(22% 0.02 240)',
      muted:   'oklch(50% 0.018 240)',
      border:  'oklch(90% 0.008 240)',
      accent:  'oklch(58% 0.16 145)',     // signal green
    },
    posture: [
      'sans display + sans body (one family) is OK here — utility trumps editorial',
      'tabular numerics everywhere, mono for code / IDs / hashes',
      'dense tables with hairline borders, no row striping',
      'inline status pills (success / warn / danger) with restrained tinted backgrounds',
      'avoid: hero images, oversized headlines, marketing copy — show the product instead',
    ],
  },
  {
    id: 'brutalist-experimental',
    label: 'Brutalist / experimental — Are.na / Yale',
    mood:
      'Loud type. Visible grid. System sans + a single oversized serif. Deliberate ugliness as confidence. Great for art, indie, agency, manifesto pages.',
    references: ['Are.na', 'Yale Center for British Art', 'mschf', 'Read.cv'],
    displayFont:
      "'Times New Roman', 'Iowan Old Style', Georgia, serif",
    bodyFont:
      "ui-monospace, 'IBM Plex Mono', 'JetBrains Mono', Menlo, monospace",
    palette: {
      bg:      'oklch(96% 0.004 100)',    // off-white printer paper
      surface: 'oklch(100% 0 0)',
      fg:      'oklch(15% 0.02 100)',
      muted:   'oklch(40% 0.02 100)',
      border:  'oklch(15% 0.02 100)',     // borders are full-strength fg
      accent:  'oklch(60% 0.22 25)',      // hot red
    },
    posture: [
      'display = serif at extreme sizes (clamp(80px, 12vw, 200px))',
      'body = monospace — yes, monospace as body, deliberately',
      'borders are full-strength fg (1.5–2px), not muted greys',
      'asymmetric layouts: one column 70%, the other 30%',
      'almost no border-radius (0–2px). No shadows. No gradients.',
      'underline links, no hover decoration — let the typography carry it',
    ],
  },
];

/**
 * Render the direction-picker form body for emission as a `<question-form>`.
 * Uses the `direction-cards` question type so the UI renders each option
 * as a rich card (palette swatches + type sample + mood blurb + refs)
 * instead of a plain radio. Falls back gracefully — older clients that
 * don't recognise `direction-cards` treat it as text.
 */
export function renderDirectionFormBody(): string {
  const cards = DESIGN_DIRECTIONS.map((d) => ({
    id: d.id,
    label: d.label,
    mood: d.mood,
    references: d.references,
    palette: [
      d.palette.bg,
      d.palette.surface,
      d.palette.border,
      d.palette.muted,
      d.palette.fg,
      d.palette.accent,
    ],
    displayFont: d.displayFont,
    bodyFont: d.bodyFont,
  }));

  const form = {
    description:
      'No brand to match — pick a visual direction. Each one ships with a real palette, font stack, and layout posture. You can override the accent below.',
    questions: [
      {
        id: 'direction',
        label: 'Direction',
        type: 'direction-cards',
        required: true,
        options: DESIGN_DIRECTIONS.map((d) => d.id),
        cards,
      },
      {
        id: 'accent_override',
        label: 'Accent override (optional)',
        type: 'text',
        placeholder:
          'e.g. "use moss green instead of cobalt", "no orange — too brand-y for us"',
      },
    ],
  };

  return JSON.stringify(form, null, 2);
}

/**
 * The block we splice into the system prompt so the agent has each
 * direction's full spec inline (palette, fonts, posture). Used by the
 * discovery prompt to teach the agent *how* to bind a chosen direction
 * onto the seed template's `:root` variables.
 */
export function renderDirectionSpecBlock(): string {
  const lines: string[] = [
    '## Direction library — bind into `:root` when the user picks one',
    '',
    'Each direction below carries a CSS-ready palette (OKLch values) and font stacks. When the user selects one in the direction-form, replace the seed template\'s `:root` block with that direction\'s palette and font stacks **verbatim** — do not improvise. Posture cues describe how that direction *behaves* (border weight, radius, accent budget); honour them in the layout choices.',
    '',
  ];
  for (const d of DESIGN_DIRECTIONS) {
    lines.push(`### ${d.label}  \`(id: ${d.id})\``);
    lines.push('');
    lines.push(`**Mood:** ${d.mood}`);
    lines.push('');
    lines.push(`**References:** ${d.references.join(', ')}.`);
    lines.push('');
    lines.push('**Palette (drop into `:root`):**');
    lines.push('');
    lines.push('```css');
    lines.push(`:root {`);
    lines.push(`  --bg:      ${d.palette.bg};`);
    lines.push(`  --surface: ${d.palette.surface};`);
    lines.push(`  --fg:      ${d.palette.fg};`);
    lines.push(`  --muted:   ${d.palette.muted};`);
    lines.push(`  --border:  ${d.palette.border};`);
    lines.push(`  --accent:  ${d.palette.accent};`);
    lines.push('');
    lines.push(`  --font-display: ${d.displayFont};`);
    lines.push(`  --font-body:    ${d.bodyFont};`);
    if (d.monoFont) lines.push(`  --font-mono:    ${d.monoFont};`);
    lines.push(`}`);
    lines.push('```');
    lines.push('');
    lines.push('**Posture:**');
    for (const p of d.posture) lines.push(`- ${p}`);
    lines.push('');
  }
  return lines.join('\n');
}

/** Look up a direction by its `label` (what the user sees in the form). */
export function findDirectionByLabel(label: string): DesignDirection | undefined {
  const trimmed = label.trim();
  return DESIGN_DIRECTIONS.find((d) => d.label === trimmed || d.id === trimmed);
}
