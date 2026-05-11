/**
 * Build a fully-formed product webpage that demonstrates a design system in
 * action — not just a list of tokens, but a real-feeling marketing /
 * product page (nav, hero, social proof, feature grid, dashboard preview,
 * pricing, testimonials, FAQ, CTA, footer) styled entirely from the
 * tokens we extract from the system's DESIGN.md.
 *
 * Same parsing utilities as design-system-preview.js — kept inline rather
 * than imported so the two views can evolve independently.
 */

type ColorToken = { name: string; value: string; role: string };
type FontHints = { display?: string; heading?: string; body?: string; mono?: string };
type RowStatus = 'up' | '';

export function renderDesignSystemShowcase(id: string, raw: string): string {
  const titleMatch = /^#\s+(.+?)\s*$/m.exec(raw);
  const rawTitle = titleMatch?.[1] ?? id;
  const title = cleanTitle(rawTitle);
  const subtitle = extractSubtitle(raw) || 'A design system rendered as a real product surface.';
  const colors = extractColors(raw);
  const fonts = extractFonts(raw);

  // Hints are matched against each color's role description (the prose that
  // follows the name in DESIGN.md, e.g. "Primary background.") first, then
  // against the color name. We use word-boundary matching so descriptive
  // names like "Cardinal Red" don't accidentally satisfy a "card" hint and
  // "Gem Pink" doesn't satisfy "ink".
  // Hint ordering matters: more specific phrases come first so a system
  // with both "Primary background" and "Page background in light mode" (e.g.
  // Linear's marketing black + light-mode escape hatch) lands on the
  // dominant role rather than the light-mode subtitle. We drop 'page
  // background' from the bg hints entirely because in practice it almost
  // always belongs to a secondary, light-mode-only entry.
  const bg =
    pickColor(colors, ['primary background', 'background', 'canvas', 'paper'])
    ?? firstLightish(colors)
    ?? '#ffffff';
  // Exclude `bg` so a token whose hex matches the page background (for
  // example Warp's "Warm Parchment" doubling as primary text *and* the
  // firstLightish bg fallback) doesn't make body copy invisible.
  const fg =
    pickColor(
      colors,
      [
        'primary text',
        'body text',
        'foreground',
        'ink primary',
        'heading',
        'ink',
        'graphite',
        'navy',
      ],
      [bg],
    )
    ?? pickReadableForeground(bg)
    ?? '#0a0a0a';
  const accent =
    pickColor(colors, [
      'brand primary',
      'primary brand',
      'primary cta',
      'gradient origin',
      'brand mark',
      'brand color',
    ])
    ?? firstNonNeutral(colors, [bg, fg])
    ?? '#2f6feb';
  const accent2 =
    pickColor(colors, [
      'brand secondary',
      'secondary brand',
      'gradient terminus',
      'tertiary brand',
      'tertiary',
      'highlight',
    ])
    ?? secondNonNeutral(colors, [accent, bg, fg])
    ?? accent;
  const muted =
    pickColor(colors, ['secondary text', 'caption', 'metadata', 'placeholder', 'muted', 'subtle'])
    ?? '#666666';
  const border =
    pickColor(colors, ['border', 'divider', 'hairline', 'rule', 'stroke'])
    ?? '#e6e6e6';
  const surface =
    pickColor(colors, [
      'secondary surface',
      'section break',
      'sidebar',
      'surface subtle',
      'surface',
      'panel',
      'elevated',
      'card surface',
    ])
    ?? mixSurface(bg);

  const display = fonts.display ?? fonts.heading ?? "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const body = fonts.body ?? display;
  const mono = fonts.mono ?? "ui-monospace, 'JetBrains Mono', monospace";

  const accentFg = pickReadableForeground(accent);
  const accent2Fg = pickReadableForeground(accent2);

  const productName = title;
  const tagline = oneLine(subtitle).slice(0, 120);

  if (id === 'returning-ai' || /ReturningAI|CFD-brokerage/i.test(raw)) {
    return renderReturningAiShowcase({
      id,
      productName,
      tagline: oneLine(subtitle) || tagline,
      bg,
      fg,
      accent,
      accentFg,
      accent2,
      muted,
      border,
      surface,
    });
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(productName)} — showcase</title>
  <style>
    :root {
      --bg: ${bg};
      --fg: ${fg};
      --accent: ${accent};
      --accent-fg: ${accentFg};
      --accent-2: ${accent2};
      --accent-2-fg: ${accent2Fg};
      --muted: ${muted};
      --border: ${border};
      --surface: ${surface};
      --display: ${display};
      --body: ${body};
      --mono: ${mono};
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--body);
      line-height: 1.6;
      font-size: 16px;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; }
    img { max-width: 100%; display: block; }
    .container { max-width: 1180px; margin: 0 auto; padding: 0 28px; }

    /* Nav */
    .nav {
      position: sticky; top: 0; z-index: 30;
      background: rgba(255,255,255,0.7);
      backdrop-filter: saturate(180%) blur(14px);
      border-bottom: 1px solid var(--border);
    }
    .nav-row {
      display: flex; align-items: center; gap: 32px;
      height: 64px;
    }
    .brand { display: flex; align-items: center; gap: 10px; font-family: var(--display); font-weight: 700; font-size: 17px; letter-spacing: -0.01em; }
    .brand-mark {
      width: 26px; height: 26px; border-radius: 7px;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
    }
    .nav-links { display: flex; gap: 22px; font-size: 14px; color: var(--muted); }
    .nav-links a:hover { color: var(--fg); }
    .nav-spacer { flex: 1; }
    .nav-cta {
      display: inline-flex; align-items: center; gap: 6px;
      background: var(--fg); color: var(--bg);
      padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 500;
    }
    .nav-link-cta { color: var(--fg); font-weight: 500; font-size: 14px; }

    /* Hero */
    .hero { padding: 96px 0 72px; }
    .hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-family: var(--mono); font-size: 12px; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.08em;
      padding: 6px 12px; border: 1px solid var(--border); border-radius: 999px;
      background: var(--surface);
      margin-bottom: 24px;
    }
    .hero-eyebrow .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
    .hero h1 {
      font-family: var(--display);
      font-size: clamp(44px, 6.6vw, 84px);
      line-height: 1.02;
      letter-spacing: -0.025em;
      margin: 0 0 22px;
      max-width: 18ch;
      font-weight: 700;
    }
    .hero h1 em { font-style: normal; background: linear-gradient(120deg, var(--accent), var(--accent-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .hero p.lede {
      font-size: 19px; color: var(--muted);
      max-width: 56ch; margin: 0 0 36px;
    }
    .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .btn {
      font: inherit; cursor: pointer; border-radius: 10px;
      padding: 13px 22px; font-size: 14.5px; font-weight: 500;
      border: 1px solid transparent; display: inline-flex; align-items: center; gap: 8px;
    }
    .btn-primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    .btn-primary:hover { filter: brightness(1.06); }
    .btn-ghost { background: transparent; color: var(--fg); border-color: var(--border); }
    .btn-ghost:hover { background: var(--surface); }
    .hero-meta { display: flex; gap: 24px; margin-top: 44px; color: var(--muted); font-size: 13px; }
    .hero-meta span strong { color: var(--fg); font-weight: 600; }

    /* Logo strip */
    .logos { padding: 36px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
    .logos-label { font-size: 12px; color: var(--muted); text-align: center; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 18px; }
    .logos-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 44px; align-items: center; opacity: 0.85; }
    .logo-pill { font-family: var(--display); font-weight: 700; font-size: 17px; letter-spacing: -0.01em; color: var(--muted); }

    /* Features grid */
    .section { padding: 96px 0; }
    .section-eyebrow { font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.1em; font-size: 12px; color: var(--accent); margin-bottom: 12px; }
    .section-title { font-family: var(--display); font-size: clamp(32px, 4.2vw, 48px); letter-spacing: -0.02em; line-height: 1.1; margin: 0 0 18px; max-width: 22ch; font-weight: 700; }
    .section-lede { color: var(--muted); font-size: 17px; max-width: 56ch; margin: 0 0 48px; }
    .features {
      display: grid; gap: 18px;
      grid-template-columns: repeat(3, 1fr);
    }
    @media (max-width: 920px) { .features { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 600px) { .features { grid-template-columns: 1fr; } }
    .feature {
      background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
      padding: 26px; display: flex; flex-direction: column; gap: 12px;
    }
    .feature-icon {
      width: 36px; height: 36px; border-radius: 8px;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: var(--accent-fg);
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 18px; font-weight: 700;
    }
    .feature h3 { font-family: var(--display); font-size: 18px; margin: 0; letter-spacing: -0.01em; }
    .feature p { color: var(--muted); margin: 0; font-size: 14.5px; line-height: 1.55; }

    /* Product preview / dashboard mock */
    .preview-wrap { padding-top: 24px; padding-bottom: 96px; }
    .preview-frame {
      background: var(--surface); border: 1px solid var(--border); border-radius: 18px;
      padding: 14px;
      box-shadow: 0 30px 80px rgba(0,0,0,0.06), 0 12px 30px rgba(0,0,0,0.04);
    }
    .preview-titlebar { display: flex; gap: 6px; padding: 4px 8px 12px; }
    .preview-titlebar span { width: 10px; height: 10px; border-radius: 50%; background: var(--border); }
    .preview-app {
      background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
      display: grid; grid-template-columns: 220px 1fr; min-height: 440px; overflow: hidden;
    }
    .preview-side { background: var(--surface); border-right: 1px solid var(--border); padding: 18px 14px; display: flex; flex-direction: column; gap: 4px; }
    .side-link { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; font-size: 13.5px; color: var(--muted); }
    .side-link.active { background: var(--bg); color: var(--fg); font-weight: 500; box-shadow: inset 0 0 0 1px var(--border); }
    .side-link .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
    .side-section { font-family: var(--mono); text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; color: var(--muted); padding: 14px 10px 6px; }
    .preview-main { padding: 22px 24px; display: flex; flex-direction: column; gap: 22px; }
    .preview-head { display: flex; align-items: center; justify-content: space-between; }
    .preview-head h4 { font-family: var(--display); font-size: 22px; margin: 0; letter-spacing: -0.01em; }
    .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
    .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
    .kpi .label { font-size: 11.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .kpi .value { font-family: var(--display); font-size: 24px; font-weight: 700; margin-top: 4px; letter-spacing: -0.01em; }
    .kpi .delta { font-family: var(--mono); font-size: 11.5px; margin-top: 2px; color: var(--accent); }
    .chart-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px; }
    .chart-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
    .chart-head .title { font-weight: 600; font-size: 14px; }
    .chart-head .meta { font-family: var(--mono); font-size: 11px; color: var(--muted); }
    .chart svg { width: 100%; height: 160px; display: block; }
    .preview-row-2 { display: grid; grid-template-columns: 1.6fr 1fr; gap: 14px; }
    .list-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; }
    .list-row { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; padding: 12px 16px; border-top: 1px solid var(--border); align-items: center; }
    .list-row:first-of-type { border-top: none; }
    .list-row .name { font-weight: 500; font-size: 13.5px; }
    .list-row .meta { font-family: var(--mono); font-size: 11.5px; color: var(--muted); }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; background: var(--bg); border: 1px solid var(--border); color: var(--muted); }
    .badge.up { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
    .list-card .head { display: flex; justify-content: space-between; align-items: baseline; padding: 14px 16px; border-bottom: 1px solid var(--border); }
    .list-card .head h5 { margin: 0; font-size: 14px; }

    /* Pricing */
    .pricing { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
    @media (max-width: 920px) { .pricing { grid-template-columns: 1fr; } }
    .price-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
      padding: 28px; display: flex; flex-direction: column; gap: 18px;
    }
    .price-card.featured {
      background: var(--fg); color: var(--bg); border-color: var(--fg);
    }
    .price-card.featured .muted, .price-card.featured h3, .price-card.featured .price { color: var(--bg); }
    .price-card .tier-name { font-family: var(--display); font-size: 14px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
    .price-card .price { font-family: var(--display); font-size: 44px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
    .price-card .price small { font-size: 14px; color: var(--muted); font-weight: 400; }
    .price-card ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; font-size: 14.5px; }
    .price-card li::before { content: "✓"; color: var(--accent); margin-right: 8px; font-weight: 700; }
    .price-card.featured li::before { color: var(--accent-2); }

    /* Testimonials */
    .quotes { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    @media (max-width: 760px) { .quotes { grid-template-columns: 1fr; } }
    .quote { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 26px; display: flex; flex-direction: column; gap: 18px; }
    .quote p { font-size: 17px; line-height: 1.55; margin: 0; font-family: var(--display); letter-spacing: -0.01em; }
    .quote-author { display: flex; align-items: center; gap: 12px; }
    .quote-author .avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent-2)); }
    .quote-author .name { font-weight: 600; font-size: 13.5px; }
    .quote-author .role { font-size: 12.5px; color: var(--muted); }

    /* FAQ */
    .faq { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 32px; }
    @media (max-width: 760px) { .faq { grid-template-columns: 1fr; } }
    .faq-item { padding: 18px 0; border-top: 1px solid var(--border); }
    .faq-item h4 { margin: 0 0 6px; font-family: var(--display); font-size: 17px; letter-spacing: -0.01em; }
    .faq-item p { margin: 0; color: var(--muted); font-size: 14.5px; }

    /* CTA */
    .cta {
      margin: 48px 0 96px;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: var(--accent-fg);
      border-radius: 24px;
      padding: 64px 56px;
      display: grid;
      grid-template-columns: 1.4fr auto;
      gap: 32px;
      align-items: center;
    }
    @media (max-width: 760px) { .cta { grid-template-columns: 1fr; padding: 36px; } }
    .cta h2 { font-family: var(--display); font-size: clamp(28px, 4vw, 40px); letter-spacing: -0.02em; margin: 0 0 10px; line-height: 1.1; max-width: 22ch; }
    .cta p { margin: 0; opacity: 0.92; font-size: 16px; max-width: 50ch; }
    .cta .btn { background: var(--accent-fg); color: var(--accent); border: none; }
    .cta .btn-secondary { background: transparent; color: var(--accent-fg); border: 1px solid color-mix(in srgb, var(--accent-fg) 35%, transparent); }

    /* Footer */
    footer { border-top: 1px solid var(--border); padding: 36px 0 56px; color: var(--muted); font-size: 13.5px; }
    .footer-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 32px; margin-bottom: 32px; }
    @media (max-width: 760px) { .footer-row { grid-template-columns: 1fr 1fr; } }
    .footer-col h6 { color: var(--fg); font-family: var(--display); font-size: 13.5px; margin: 0 0 12px; font-weight: 600; }
    .footer-col a { display: block; padding: 4px 0; }
    .footer-col a:hover { color: var(--fg); }
    .footer-bottom { display: flex; justify-content: space-between; padding-top: 24px; border-top: 1px solid var(--border); }
  </style>
</head>
<body>
  <header class="nav">
    <div class="container nav-row">
      <a class="brand" href="#"><span class="brand-mark"></span>${escapeHtml(productName)}</a>
      <nav class="nav-links">
        <a href="#features">Product</a>
        <a href="#preview">Workspace</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq">Docs</a>
        <a href="#faq">Customers</a>
      </nav>
      <div class="nav-spacer"></div>
      <a class="nav-link-cta" href="#">Sign in</a>
      <a class="nav-cta" href="#">Get started →</a>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="container">
        <div class="hero-eyebrow"><span class="dot"></span>${escapeHtml(productName)} · live preview</div>
        <h1>The system that makes <em>${escapeHtml(productName)}</em> feel like ${escapeHtml(productName)}.</h1>
        <p class="lede">${escapeHtml(tagline)}</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#">Start a free trial →</a>
          <a class="btn btn-ghost" href="#preview">See it in action</a>
        </div>
        <div class="hero-meta">
          <span><strong>4.9</strong> · App Store rating</span>
          <span><strong>SOC 2</strong> · Type II compliant</span>
          <span><strong>120k+</strong> active teams</span>
        </div>
      </div>
    </section>

    <section class="logos">
      <div class="container">
        <div class="logos-label">Trusted by teams shipping serious work</div>
        <div class="logos-row">
          <span class="logo-pill">Northwind</span>
          <span class="logo-pill">Pioneer</span>
          <span class="logo-pill">Lattice</span>
          <span class="logo-pill">Atlas Co.</span>
          <span class="logo-pill">Voltage</span>
          <span class="logo-pill">Foundry</span>
        </div>
      </div>
    </section>

    <section class="section" id="features">
      <div class="container">
        <div class="section-eyebrow">What it does</div>
        <h2 class="section-title">Every primitive a fast team needs.</h2>
        <p class="section-lede">A system styled entirely from the tokens of ${escapeHtml(productName)} — palette, typography, surfaces, and motion. Drop it into any product and it stays in character.</p>
        <div class="features">
          ${featureCard('★', 'Tokens that compose', 'Color, type, spacing, and elevation defined once and reused across every surface — from a marketing hero to a row in a table.')}
          ${featureCard('◐', 'Light & dark in lockstep', 'Every component ships with both modes. The accent reads as confident in either context, and contrast meets WCAG AA out of the box.')}
          ${featureCard('⌘', 'Desktop-first, but mobile-honest', 'Layouts collapse from a 12-column desktop grid to a focused single column without losing density or rhythm.')}
          ${featureCard('▣', 'Production-grade primitives', '40+ components — from the obvious (button, input) to the load-bearing (data table, command bar, empty states).')}
          ${featureCard('↗', 'Designed for handoff', 'Every spec carries a Figma frame, a code snippet, and a "do/don’t" pair so engineers don’t have to guess.')}
          ${featureCard('∞', 'Built to evolve', 'Tokens version semver-style. A palette refresh ships through one file — no component code touches.')}
        </div>
      </div>
    </section>

    <section class="preview-wrap" id="preview">
      <div class="container">
        <div class="section-eyebrow">In production</div>
        <h2 class="section-title">A workspace, fully styled.</h2>
        <p class="section-lede">This is the same component library you'd use in your app — rendered with ${escapeHtml(productName)} tokens.</p>
        <div class="preview-frame">
          <div class="preview-titlebar"><span></span><span></span><span></span></div>
          <div class="preview-app">
            <aside class="preview-side">
              <div class="brand" style="margin-bottom: 14px;"><span class="brand-mark"></span>${escapeHtml(productName)}</div>
              <a class="side-link active"><span class="dot"></span>Overview</a>
              <a class="side-link">Customers</a>
              <a class="side-link">Pipeline</a>
              <a class="side-link">Reports</a>
              <a class="side-link">Automations</a>
              <div class="side-section">Workspaces</div>
              <a class="side-link">Growth</a>
              <a class="side-link">Lifecycle</a>
              <a class="side-link">Finance</a>
            </aside>
            <div class="preview-main">
              <div class="preview-head">
                <h4>Overview</h4>
                <span class="badge up">↑ 12.4% this week</span>
              </div>
              <div class="kpi-row">
                ${kpi('MRR', '$184,210', '+8.2%')}
                ${kpi('Active orgs', '2,914', '+121')}
                ${kpi('Conversion', '4.6%', '+0.4 pp')}
                ${kpi('Net retention', '113%', '+2 pp')}
              </div>
              <div class="chart-card">
                <div class="chart-head">
                  <span class="title">Revenue · last 12 weeks</span>
                  <span class="meta">USD · weekly</span>
                </div>
                <div class="chart">
                  ${inlineLineChart()}
                </div>
              </div>
              <div class="preview-row-2">
                <div class="list-card">
                  <div class="head">
                    <h5>Top accounts</h5>
                    <span class="badge">View all</span>
                  </div>
                  ${listRow('Northwind Trading', 'Annual · NA', '$48,200', 'up')}
                  ${listRow('Pioneer Robotics', 'Quarterly · EMEA', '$31,890', 'up')}
                  ${listRow('Atlas Cooperative', 'Annual · APAC', '$22,400', '')}
                  ${listRow('Foundry Group', 'Monthly · NA', '$14,750', 'up')}
                </div>
                <div class="list-card">
                  <div class="head">
                    <h5>Activity</h5>
                    <span class="badge">Live</span>
                  </div>
                  ${activityRow('Renewal closed', 'Lattice · 11m ago')}
                  ${activityRow('Trial started', 'Voltage · 22m ago')}
                  ${activityRow('Plan upgraded', 'Pioneer · 1h ago')}
                  ${activityRow('Invoice paid', 'Atlas · 2h ago')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="pricing" style="padding-top: 24px;">
      <div class="container">
        <div class="section-eyebrow">Pricing</div>
        <h2 class="section-title">Built for teams of one to one thousand.</h2>
        <p class="section-lede">Pick the plan that matches the way your team ships. Every tier ships the full token system.</p>
        <div class="pricing">
          ${priceCard('Starter', '$0', 'Free forever', ['Single user', 'All core tokens', 'Up to 3 projects', 'Community support'])}
          ${priceCard('Team', '$24', 'per seat / month', ['Unlimited projects', 'Real-time co-edit', 'Brand themes', 'Priority email support'], true)}
          ${priceCard('Enterprise', 'Custom', 'volume pricing', ['SSO + SCIM', 'Audit logs', 'Custom token schemas', 'Dedicated success manager'])}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-eyebrow">Customers</div>
        <h2 class="section-title">Loved by teams who care about craft.</h2>
        <div class="quotes">
          ${quote('"Our marketing site, our app, and our internal dashboards finally feel like the same product. The token system is doing all the work."', 'Mira Okafor', 'Head of Design · Pioneer')}
          ${quote('"We swapped our entire design language in an afternoon. Nothing broke. That’s the line, and we crossed it."', 'Caleb Renner', 'Engineering Lead · Northwind')}
        </div>
      </div>
    </section>

    <section class="section" id="faq" style="padding-top: 24px;">
      <div class="container">
        <div class="section-eyebrow">FAQ</div>
        <h2 class="section-title">Questions, answered.</h2>
        <div class="faq">
          ${faq('Is this a Figma library, a code library, or both?', 'Both. Tokens flow from one source of truth into Figma styles and into the codegen pipeline at the same time.')}
          ${faq('Can we ship our own brand theme?', 'Yes — fork the token file, change the palette and type stack, and every component reskins automatically.')}
          ${faq('What about accessibility?', 'Color contrast meets WCAG AA on every surface. Components ship with focus rings, ARIA roles, and keyboard handling.')}
          ${faq('How do you handle dark mode?', 'Every token has a paired dark value. The system flips at the document level — no per-component overrides needed.')}
        </div>
      </div>
    </section>

    <section>
      <div class="container">
        <div class="cta">
          <div>
            <h2>Ship a product that finally feels finished.</h2>
            <p>Drop the system into your app today. The first project is on us.</p>
          </div>
          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            <a class="btn btn-primary" href="#">Start free trial</a>
            <a class="btn btn-secondary" href="#">Talk to sales</a>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="container">
      <div class="footer-row">
        <div class="footer-col">
          <div class="brand" style="margin-bottom: 12px;"><span class="brand-mark"></span>${escapeHtml(productName)}</div>
          <p style="margin: 0; max-width: 38ch;">${escapeHtml(tagline)}</p>
        </div>
        <div class="footer-col"><h6>Product</h6><a href="#">Features</a><a href="#">Pricing</a><a href="#">Changelog</a><a href="#">Roadmap</a></div>
        <div class="footer-col"><h6>Company</h6><a href="#">About</a><a href="#">Customers</a><a href="#">Careers</a><a href="#">Press</a></div>
        <div class="footer-col"><h6>Resources</h6><a href="#">Docs</a><a href="#">Status</a><a href="#">Brand</a><a href="#">Contact</a></div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} ${escapeHtml(productName)}. All rights reserved.</span>
        <span>Showcase rendered from <code style="font-family: var(--mono);">design-systems/${escapeHtml(id)}/DESIGN.md</code></span>
      </div>
    </div>
  </footer>
</body>
</html>`;
}

function renderReturningAiShowcase(input: {
  id: string;
  productName: string;
  tagline: string;
  bg: string;
  fg: string;
  accent: string;
  accentFg: string;
  accent2: string;
  muted: string;
  border: string;
  surface: string;
}): string {
  const title = escapeHtml(input.productName);
  const tagline = escapeHtml(input.tagline || 'Dense broker product surfaces, rendered from ReturningAI tokens and component rules.');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} - component showcase</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap");

    :root {
      --bg: ${input.bg};
      --surface: ${input.surface};
      --surface-2: #252529;
      --surface-3: #2d2e34;
      --surface-4: #33343c;
      --popover: #43464f;
      --fg: ${input.fg};
      --muted: ${input.muted};
      --text-2: #e3e3e3;
      --text-3: #c4c4c4;
      --text-5: #a6a6a8;
      --border: ${input.border};
      --border-strong: #aaa9a9;
      --accent: ${input.accent};
      --accent-2: ${input.accent2};
      --accent-fg: ${input.accentFg};
      --error: #eb5757;
      --success: #50aa77;
      --warning: #f4a933;
      --info: #3ea1fd;
      --font: Roboto, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font);
      font-size: 14px;
      line-height: 1.45;
      -webkit-font-smoothing: antialiased;
      font-variant-numeric: tabular-nums;
    }
    button, input, select, textarea { font: inherit; }
    button { cursor: pointer; }
    .wrap { max-width: 1400px; margin: 0 auto; padding: 24px; }
    .topbar {
      height: 56px;
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: 8px;
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr) auto;
      align-items: center;
      overflow: hidden;
      margin-bottom: 16px;
    }
    .brand {
      height: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 16px;
      border-right: 1px solid var(--border);
      font-weight: 700;
    }
    .mark {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      background: var(--accent);
      box-shadow: inset -6px -6px 0 rgba(27, 28, 29, .22);
    }
    .nav-tabs { display: flex; align-items: center; gap: 6px; padding: 0 12px; min-width: 0; }
    .nav-tab {
      height: 36px;
      padding: 0 12px;
      border-radius: 4px;
      color: var(--muted);
      display: inline-flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
      font-size: 13px;
    }
    .nav-tab.active { background: var(--surface-2); color: var(--fg); }
    .nav-actions { display: flex; align-items: center; gap: 8px; padding: 0 12px; }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 390px;
      gap: 16px;
      align-items: stretch;
      margin-bottom: 16px;
    }
    .hero-main, .hero-aside {
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: 8px;
      padding: 18px;
      min-width: 0;
    }
    .eyebrow {
      margin: 0 0 8px;
      color: var(--accent);
      font-size: 9px;
      line-height: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: 32px;
      line-height: 38px;
      font-weight: 700;
      letter-spacing: 0;
      max-width: 920px;
    }
    .lead { margin: 10px 0 0; color: var(--muted); max-width: 820px; font-size: 14px; line-height: 21px; }
    .source-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
    .source-pill, .tag {
      border: 1px solid var(--border);
      background: var(--surface-3);
      color: var(--muted);
      border-radius: 6px;
      padding: 6px 8px;
      white-space: nowrap;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .contract {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-top: 14px;
    }
    .contract-item {
      border: 1px solid var(--border);
      background: var(--surface-2);
      border-radius: 6px;
      padding: 10px;
    }
    .contract-item strong { display: block; font-size: 18px; line-height: 25px; margin-bottom: 2px; }
    .contract-item span { color: var(--muted); font-size: 12px; }
    .theme-swatch {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      margin-top: 12px;
    }
    .swatch { min-height: 54px; border-radius: 6px; border: 1px solid var(--border); padding: 7px; display: flex; align-items: end; color: var(--fg); font-size: 10px; overflow-wrap: anywhere; min-width: 0; }
    .swatch.bg { background: #141414; }
    .swatch.surface { background: #1b1c1d; }
    .swatch.surface2 { background: #2d2e34; }
    .swatch.muted { background: #aaa9a9; color: #141414; }
    .swatch.border { background: #575757; }
    .swatch.accent { background: #e5971d; color: #1b1c1d; font-weight: 700; }
    .section { margin-top: 18px; }
    .section-head {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 18px;
      margin: 0 0 12px;
    }
    h2 { margin: 0; font-size: 20px; line-height: 28px; font-weight: 700; letter-spacing: 0; }
    h3 { margin: 0; font-size: 18px; line-height: 25px; font-weight: 600; }
    .hint { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
    .grid { display: grid; gap: 12px; }
    .grid.two { grid-template-columns: 1fr 1fr; }
    .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .panel {
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: 8px;
      overflow: hidden;
    }
    .panel-pad { padding: 16px; }
    .panel-title {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      color: var(--fg);
      font-weight: 600;
    }
    .meta { color: var(--muted); font-size: 12px; font-weight: 400; }
    .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .stack { display: grid; gap: 12px; }

    .btn {
      height: 35px;
      padding: 0 13px;
      border-radius: 4px;
      border: 1px solid var(--border);
      background: var(--surface-3);
      color: var(--fg);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-weight: 700;
      min-width: 35px;
      font-size: 14px;
      line-height: 21px;
    }
    .btn.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    .btn.secondary { background: var(--surface-4); color: var(--fg); }
    .btn.tertiary { background: transparent; color: var(--accent); border-color: var(--accent); }
    .btn.ghost { background: transparent; color: var(--fg); border-color: transparent; }
    .btn.danger { color: var(--error); border-color: color-mix(in srgb, var(--error) 70%, var(--border)); background: color-mix(in srgb, var(--error) 12%, var(--surface-3)); }
    .btn.success { color: #1b1c1d; background: var(--success); border-color: var(--success); }
    .btn.dense { height: 26px; padding: 0 10px; font-size: 12px; line-height: 16px; }
    .btn.icon { width: 30px; padding: 0; }
    .btn.icon.dense { width: 22px; padding: 0; }
    .btn:disabled { opacity: .42; cursor: not-allowed; }
    .btn:hover:not(:disabled), .field input:hover, .select:hover { background: var(--surface-2); }
    .btn.primary:hover:not(:disabled) { background: var(--accent-2); border-color: var(--accent-2); }
    .btn:focus-visible, .field input:focus-visible, .select:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .field { display: grid; gap: 6px; }
    .field label {
      color: var(--muted);
      font-size: 12px;
      letter-spacing: .04em;
      text-transform: uppercase;
      font-weight: 500;
    }
    .field input, .select {
      width: 100%;
      height: 35px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--surface-4);
      color: var(--fg);
      padding: 0 13px;
    }
    .field .help { color: var(--muted); font-size: 12px; }
    .field.error input { border-color: var(--error); }
    .field.error .help { color: var(--error); }
    .field.disabled { opacity: .48; }
    .input-shell {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      height: 35px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--surface-4);
      overflow: hidden;
    }
    .input-shell span { color: var(--muted); padding: 0 10px; font-size: 12px; }
    .input-shell input { border: 0; height: 33px; min-width: 0; background: transparent; color: var(--fg); padding: 0 4px; outline: 0; }
    .textarea-demo {
      min-height: 112px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--surface-4);
      color: var(--text-3);
      padding: 10px 13px;
      line-height: 21px;
    }

    .type-spec {
      display: grid;
      grid-template-columns: 170px minmax(0, 1fr) auto;
      gap: 12px;
      align-items: baseline;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
    }
    .type-spec:last-child { border-bottom: 0; }
    .type-name { color: var(--muted); font-size: 12px; }
    .display-title { font-size: 32px; line-height: 38px; font-weight: 700; }
    .page-title { font-size: 22px; line-height: 31px; font-weight: 700; }
    .section-title { font-size: 20px; line-height: 28px; font-weight: 700; }
    .card-title { font-size: 18px; line-height: 25px; font-weight: 600; color: var(--text-2); }
    .body-large { font-size: 16px; line-height: 24px; color: var(--text-3); }
    .body-copy { font-size: 14px; line-height: 21px; color: var(--text-3); }
    .caption-copy { font-size: 12px; color: var(--muted); }
    .overline-copy { font-size: 9px; line-height: 12px; color: var(--accent); text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }

    .filter-bar {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
    }
    .chip {
      height: 24px;
      padding: 0 10px;
      border: 1px solid var(--border);
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      background: var(--surface-3);
      font-size: 12px;
    }
    .chip.active { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 65%, var(--border)); }
    .badge {
      height: 24px;
      padding: 0 8px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      border: 1px solid var(--border);
      background: var(--surface-3);
      color: var(--text-3);
    }
    .badge.yellow { background: color-mix(in srgb, var(--warning) 18%, var(--surface-3)); color: var(--warning); border-color: color-mix(in srgb, var(--warning) 70%, var(--border)); }
    .badge.green { background: color-mix(in srgb, var(--success) 18%, var(--surface-3)); color: var(--success); border-color: color-mix(in srgb, var(--success) 70%, var(--border)); }
    .badge.red { background: color-mix(in srgb, var(--error) 18%, var(--surface-3)); color: var(--error); border-color: color-mix(in srgb, var(--error) 70%, var(--border)); }
    .badge.blue { background: color-mix(in srgb, var(--info) 18%, var(--surface-3)); color: var(--info); border-color: color-mix(in srgb, var(--info) 70%, var(--border)); }
    .dot { width: 12px; height: 12px; border-radius: 999px; display: inline-block; background: var(--muted); }
    .dot.success { background: var(--success); }
    .dot.pending { background: var(--warning); }
    .dot.error { background: var(--error); }
    .tabs { display: flex; gap: 16px; border-bottom: 1px solid var(--border); }
    .tab {
      min-height: 36px;
      display: inline-flex;
      align-items: center;
      color: var(--muted);
      border-bottom: 2px solid transparent;
      font-weight: 500;
      font-size: 13px;
    }
    .tab.active { color: var(--fg); border-bottom-color: var(--accent); }
    .pill-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
    .pill-tab {
      height: 36px;
      min-width: 96px;
      border-radius: 18px;
      border: 1px solid var(--border);
      background: var(--surface-3);
      color: var(--muted);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 500;
    }
    .pill-tab.active { color: var(--accent); border-color: var(--accent); }
    .control-line { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }
    .checkbox, .radio {
      width: 16px;
      height: 16px;
      border: 1px solid var(--border);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }
    .checkbox { border-radius: 4px; }
    .checkbox.active { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
    .radio { border-radius: 50%; }
    .radio.active::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
    .switch {
      width: 40px;
      height: 20px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--surface-4);
      position: relative;
    }
    .switch::after {
      content: "";
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--muted);
      position: absolute;
      top: 1px;
      left: 2px;
    }
    .switch.active { background: var(--accent); border-color: var(--accent); }
    .switch.active::after { left: 20px; background: var(--accent-fg); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { height: 52px; padding: 0 12px; text-align: left; border-bottom: 1px solid var(--border); }
    th {
      background: var(--surface-2);
      color: var(--muted);
      font-size: 12px;
      font-weight: 500;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    tbody tr:hover { background: var(--surface-2); }
    .check { width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--border); display: inline-block; }
    .status {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 0 9px;
      border-radius: 12px;
      border: 1px solid var(--border);
      color: var(--muted);
      background: var(--surface-3);
      font-size: 12px;
    }
    .status.success { color: var(--success); border-color: color-mix(in srgb, var(--success) 70%, var(--border)); }
    .status.warn { color: var(--warning); border-color: color-mix(in srgb, var(--warning) 70%, var(--border)); }
    .status.error { color: var(--error); border-color: color-mix(in srgb, var(--error) 70%, var(--border)); }
    .dropdown-preview {
      min-height: 236px;
      width: 322px;
      max-width: 100%;
      border: 1px solid var(--border);
      background: var(--popover);
      border-radius: 4px;
      overflow: hidden;
    }
    .dropdown-row {
      height: 33px;
      padding: 0 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-3);
      border-bottom: 1px solid rgba(255,255,255,.06);
    }
    .dropdown-row.active { background: var(--surface-3); color: var(--fg); }
    .tooltip {
      width: 221px;
      min-height: 60px;
      border-radius: 4px;
      background: var(--popover);
      border: 1px solid var(--border);
      padding: 10px 12px;
      color: var(--text-3);
      box-shadow: 0 16px 32px rgba(0,0,0,.28);
    }

    .modal-row {
      display: grid;
      grid-template-columns: 300px 600px minmax(0, 1fr);
      gap: 12px;
      align-items: start;
    }
    .modal {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      box-shadow: 0 18px 40px rgba(0,0,0,.25);
      overflow: hidden;
    }
    .modal.w400 { width: 400px; }
    .modal.w300 { width: 300px; }
    .modal.w600 { width: 600px; max-width: 100%; }
    .modal.w800 { width: 100%; min-width: 0; }
    .modal-head, .modal-foot {
      min-height: 56px;
      padding: 14px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .modal-head { border-bottom: 1px solid var(--border); }
    .modal-foot { border-top: 1px solid var(--border); justify-content: flex-end; }
    .modal-body { padding: 24px 32px; display: grid; gap: 12px; }
    .stepper { color: var(--muted); font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }

    .surface-demo {
      display: grid;
      grid-template-columns: 80px 240px minmax(0, 1fr);
      min-height: 380px;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      background: var(--bg);
    }
    .icon-rail { background: #141414; border-right: 1px solid var(--border); padding: 14px 0; display: grid; gap: 8px; align-content: start; justify-items: center; }
    .rail-icon {
      width: 40px;
      height: 48px;
      border-radius: 4px;
      color: var(--muted);
      display: grid;
      place-items: center;
      border-left: 2px solid transparent;
    }
    .rail-icon.active { background: var(--surface-2); border-left-color: var(--accent); color: var(--fg); }
    .rail { background: var(--surface); border-right: 1px solid var(--border); padding: 14px 0; }
    .rail-title { padding: 0 16px 12px; font-weight: 700; color: #e3e3e3; }
    .rail-item { padding: 9px 16px; color: var(--muted); border-left: 2px solid transparent; }
    .rail-item.active { color: var(--fg); background: var(--surface-2); border-left-color: var(--accent); }
    .workspace { padding: 16px; display: grid; gap: 12px; align-content: start; }
    .mini-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .mini-card { border: 1px solid var(--border); background: var(--surface); border-radius: 8px; padding: 12px; }
    .mini-card strong { display: block; font-size: 20px; margin-top: 4px; }
    .store-card, .social-card {
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: 8px;
      overflow: hidden;
    }
    .store-media { height: 92px; background: linear-gradient(135deg, #252529, #33343c); border-bottom: 1px solid var(--border); }
    .card-pad { padding: 14px; display: grid; gap: 10px; }
    .price-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .reward { font-size: 18px; font-weight: 700; color: var(--accent); }
    .criteria { display: grid; gap: 8px; }
    .criteria-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--text-3); font-size: 13px; }

    @media (max-width: 980px) {
      .hero, .grid.two, .grid.three, .grid.four, .modal-row, .contract { grid-template-columns: 1fr; }
      .modal.w300, .modal.w400, .modal.w600 { width: 100%; }
      .surface-demo { grid-template-columns: 1fr; }
      .rail { border-right: 0; border-bottom: 1px solid var(--border); }
      .icon-rail { display: none; }
      .topbar { grid-template-columns: 1fr; height: auto; }
      .brand { height: 48px; border-right: 0; border-bottom: 1px solid var(--border); }
      .nav-tabs, .nav-actions { padding: 8px; overflow-x: auto; }
      .source-pill { white-space: normal; overflow-wrap: anywhere; }
      table { table-layout: fixed; }
      th, td { overflow-wrap: anywhere; padding: 0 8px; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <nav class="topbar" aria-label="Showcase navigation">
      <div class="brand"><span class="mark"></span>${title}</div>
      <div class="nav-tabs">
        <span class="nav-tab active">Showcase</span>
        <span class="nav-tab">Typography</span>
        <span class="nav-tab">Controls</span>
        <span class="nav-tab">Tables</span>
        <span class="nav-tab">Modals</span>
        <span class="nav-tab">Store</span>
      </div>
      <div class="nav-actions">
        <button class="btn secondary dense">Share</button>
        <button class="btn primary dense">Export spec</button>
      </div>
    </nav>

    <header class="hero">
      <div class="hero-main">
        <p class="eyebrow">ReturningAI design system - Figma MCP grounded</p>
        <h1>Black Beauty component fidelity lab for ${title}</h1>
        <p class="lead">${tagline}. This preview shows the actual component families OpenDesign should use: buttons, fields, dropdowns, tabs, badges, navigation, DataTableV2 rows, store/social cards, and modals.</p>
        <div class="source-row">
          <span class="source-pill">Figma file VH6luJCFcoxFoOesswo7qU</span>
          <span class="source-pill">23 pages crawled</span>
          <span class="source-pill">Black Beauty only</span>
          <span class="source-pill">Roboto 400-700 loaded</span>
          <span class="source-pill">design-systems/${escapeHtml(input.id)}/DESIGN.md</span>
        </div>
        <div class="contract" aria-label="Component contract">
          <div class="contract-item"><strong>09</strong><span>Buttons, icon buttons, social actions.</span></div>
          <div class="contract-item"><strong>10/11</strong><span>Fields, dropdowns, filters, date panels.</span></div>
          <div class="contract-item"><strong>22/27</strong><span>Data tables and modal anatomy.</span></div>
        </div>
      </div>
      <aside class="hero-aside">
        <p class="eyebrow">Active theme</p>
        <h3>Black Beauty</h3>
        <p class="hint">Other Figma themes are reference history. OpenDesign generation should stay on this palette unless a broker retheme is explicitly requested.</p>
        <div class="theme-swatch" aria-label="Black Beauty token swatches">
          <span class="swatch bg">bg<br>#141414</span>
          <span class="swatch surface">surface<br>#1b1c1d</span>
          <span class="swatch surface2">field<br>#2d2e34</span>
          <span class="swatch muted">muted<br>#aaa9a9</span>
          <span class="swatch border">border<br>#575757</span>
          <span class="swatch accent">accent<br>#e5971d</span>
        </div>
      </aside>
    </header>

    <section class="section">
      <div class="section-head">
        <div><h2>Typography</h2><p class="hint">Roboto everywhere. Numerics use tabular alignment inside the same family.</p></div>
      </div>
      <div class="panel panel-pad">
        <div class="type-spec"><span class="type-name">Display</span><span class="display-title">Custom leaderboards</span><span class="meta">32 / 38 / 700</span></div>
        <div class="type-spec"><span class="type-name">Heading 1</span><span class="page-title">Leaderboard rules</span><span class="meta">22 / 31 / 700</span></div>
        <div class="type-spec"><span class="type-name">Heading 2</span><span class="section-title">Qualification preview</span><span class="meta">20 / 28 / 700</span></div>
        <div class="type-spec"><span class="type-name">Heading 3</span><span class="card-title">Trader activity window</span><span class="meta">18 / 25 / 600</span></div>
        <div class="type-spec"><span class="type-name">Body Large</span><span class="body-large">Broker ops can configure the ranking formula per community.</span><span class="meta">16 / 24</span></div>
        <div class="type-spec"><span class="type-name">Body</span><span class="body-copy">Broker ops can configure metric weights, visibility, and timeframe.</span><span class="meta">14 / 400</span></div>
        <div class="type-spec"><span class="type-name">Caption</span><span class="caption-copy">Updated 2m ago - 12,450.25 lots - rank 07</span><span class="meta">12 / 16 / tabular</span></div>
        <div class="type-spec"><span class="type-name">Overline</span><span class="overline-copy">Active ranking</span><span class="meta">9 / 12 / tracked</span></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>Buttons, Inputs, Dropdowns</h2><p class="hint">Exact heights, radius, padding, focus, disabled, error, and selected states.</p></div>
      </div>
      <div class="grid two">
        <div class="panel">
          <div class="panel-title">Button variants <span class="meta">Figma 09 - Button component set</span></div>
          <div class="panel-pad stack">
            <div class="row">
              <button class="btn primary">Save changes</button>
              <button class="btn secondary">Secondary</button>
              <button class="btn tertiary">Tertiary</button>
              <button class="btn ghost">Ghost</button>
              <button class="btn danger">Rotate key</button>
              <button class="btn success">Approve</button>
              <button class="btn primary" disabled>Disabled</button>
              <button class="btn icon" aria-label="More">...</button>
            </div>
            <div class="row">
              <button class="btn primary dense">Small</button>
              <button class="btn secondary dense">Small secondary</button>
              <button class="btn ghost dense">Small ghost</button>
              <button class="btn icon dense" aria-label="Close">x</button>
              <span class="meta">Figma S controls around 22-26px high; production dense tables can use 32px.</span>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">Field input states <span class="meta">Figma 10 - Field Input Playground</span></div>
          <div class="panel-pad grid two">
            <div class="field"><label>Leaderboard name</label><input value="VIP volume ladder" /><span class="help">Shown to traders in the community.</span></div>
            <div class="field"><label>Ranking metric</label><div class="select" tabindex="0">Lots traded + session streak</div><span class="help">Broker-configured formula.</span></div>
            <div class="field error"><label>Minimum score</label><input value="" placeholder="Required" /><span class="help">Enter a threshold before saving.</span></div>
            <div class="field disabled"><label>Community</label><input value="TR5" disabled /><span class="help">Locked by route context.</span></div>
            <div class="field" style="grid-column: 1 / -1;"><label>Weighted value</label><div class="input-shell"><span>score</span><input value="2.5 lots + 1 session" /><span>per day</span></div><span class="help">Prefix and suffix keep the same 36px field shell.</span></div>
          </div>
        </div>
      </div>
      <div class="grid three" style="margin-top: 12px;">
        <div class="panel">
          <div class="panel-title">Dropdown selector <span class="meta">Figma 11</span></div>
          <div class="panel-pad">
            <div class="dropdown-preview">
              <div class="dropdown-row active"><span class="dot success"></span> Active communities</div>
              <div class="dropdown-row"><span class="dot pending"></span> Pending review</div>
              <div class="dropdown-row"><span class="dot error"></span> Sync failed</div>
              <div class="dropdown-row">Country - Singapore</div>
              <div class="dropdown-row">Payment - Loyalty points</div>
              <div class="dropdown-row">Date range - Last 7 days</div>
              <div class="dropdown-row">Time range - Trading session</div>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">Controls <span class="meta">Figma 13 / 14</span></div>
          <div class="panel-pad stack">
            <div class="tabs"><span class="tab active">Overview</span><span class="tab">Rules</span><span class="tab">History</span></div>
            <div class="pill-tabs"><span class="pill-tab active">24h</span><span class="pill-tab">7d</span><span class="pill-tab">30d</span></div>
            <div class="control-line">
              <span class="checkbox active">✓</span><span class="meta">Selected rows</span>
              <span class="radio active"></span><span class="meta">Broker score</span>
              <span class="switch active"></span><span class="meta">Widget live</span>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">Labels and tooltips <span class="meta">Figma 12 / 16 / 17</span></div>
          <div class="panel-pad stack">
            <div class="row"><span class="badge yellow">Gold</span><span class="badge green">Active</span><span class="badge red">Failed</span><span class="badge blue">Info</span><span class="badge">12</span></div>
            <div class="tooltip"><strong>Role requirement</strong><p class="hint" style="margin-top:4px;">Only broker admins with reward approval can publish this reward.</p></div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>DataTableV2 Pattern</h2><p class="hint">Sticky header, filters, search, checkbox selection, 52px leaderboard rows, status pills, overflow actions.</p></div>
        <button class="btn primary">Create leaderboard</button>
      </div>
      <div class="panel">
        <div class="filter-bar">
          <div class="row">
            <span class="chip active">Active</span>
            <span class="chip">Draft</span>
            <span class="chip">Visibility: public</span>
            <span class="chip">+ Filter</span>
          </div>
          <div class="input-shell" style="width: 260px;"><span>Search</span><input value="VIP" aria-label="Search table" /><span>/</span></div>
        </div>
        <table>
          <thead><tr><th style="width:42px"><span class="check"></span></th><th>Name</th><th>Metric</th><th>Window</th><th>Status</th><th>Updated</th><th style="width:48px"></th></tr></thead>
          <tbody>
            <tr><td><span class="check"></span></td><td>VIP volume ladder</td><td>Lots + sessions</td><td>7d</td><td><span class="status success">Active</span></td><td>2026-05-11 10:18</td><td><button class="btn dense icon">...</button></td></tr>
            <tr><td><span class="check"></span></td><td>Gold tier sprint</td><td>Score formula</td><td>24h</td><td><span class="status warn">Draft</span></td><td>2026-05-10 18:42</td><td><button class="btn dense icon">...</button></td></tr>
            <tr><td><span class="check"></span></td><td>Monthly reset board</td><td>Broker metric</td><td>30d</td><td><span class="status">Paused</span></td><td>2026-05-09 09:12</td><td><button class="btn dense icon">...</button></td></tr>
            <tr><td><span class="check"></span></td><td>Reward redemption queue</td><td>Points + tier gate</td><td>Live</td><td><span class="status error">Needs review</span></td><td>2026-05-09 08:16</td><td><button class="btn dense icon">...</button></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>Modal Sizes</h2><p class="hint">Figma popup sizing plus production variants share header/body/footer anatomy.</p></div>
      </div>
      <div class="modal-row">
        <div class="modal w300">
          <div class="modal-head"><strong>Confirm rotation</strong><button class="btn dense icon">x</button></div>
          <div class="modal-body"><p class="body-copy">Existing embeds may need their access key updated after rotation.</p></div>
          <div class="modal-foot"><button class="btn ghost dense">Cancel</button><button class="btn danger dense">Rotate</button></div>
        </div>
        <div class="modal w600">
          <div class="modal-head"><strong>Create leaderboard</strong><span class="stepper">Step 1 / 3</span></div>
          <div class="modal-body">
            <div class="field"><label>Name</label><input value="VIP challenge" /></div>
            <div class="field"><label>Visibility</label><div class="select">Public to qualifying traders</div></div>
            <div class="textarea-demo">Describe how the broker-defined score should be shown to traders. Keep the copy operational and specific.</div>
          </div>
          <div class="modal-foot"><button class="btn ghost dense">Back</button><button class="btn primary dense">Next</button></div>
        </div>
        <div class="modal w800">
          <div class="modal-head"><strong>Badge request review</strong><span class="stepper">Large review modal</span></div>
          <div class="modal-body">
            <div class="grid two">
              <div class="mini-card"><span class="meta">Trader</span><strong>Aria L.</strong></div>
              <div class="mini-card"><span class="meta">Requested badge</span><strong>Diamond</strong></div>
            </div>
            <div class="field error"><label>Reviewer note</label><input value="" placeholder="Reason required before reject" /><span class="help">Validation state stays inside the field stack.</span></div>
          </div>
          <div class="modal-foot"><button class="btn ghost dense">Reject</button><button class="btn primary dense">Approve</button></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>Navigation and Surface Composition</h2><p class="hint">Figma nav pages define shell anatomy; artifacts should use the shell as context, not decoration.</p></div>
      </div>
      <div class="surface-demo">
        <aside class="icon-rail" aria-label="Main navigation">
          <span class="rail-icon active">H</span>
          <span class="rail-icon">A</span>
          <span class="rail-icon">S</span>
          <span class="rail-icon">L</span>
          <span class="rail-icon">M</span>
        </aside>
        <aside class="rail">
          <div class="rail-title">Settings</div>
          <div class="rail-item">Appearance</div>
          <div class="rail-item active">Custom leaderboards</div>
          <div class="rail-item">Badges</div>
          <div class="rail-item">Widget embed</div>
          <div class="rail-item">API keys</div>
        </aside>
        <div class="workspace">
          <div class="row" style="justify-content: space-between;">
            <div><h2>Custom leaderboards</h2><p class="hint">DataTableV2 first, compact forms second.</p></div>
            <button class="btn primary">Save changes</button>
          </div>
          <div class="mini-cards">
            <div class="mini-card"><span class="meta">Active boards</span><strong>12</strong></div>
            <div class="mini-card"><span class="meta">Pending edits</span><strong>3</strong></div>
            <div class="mini-card"><span class="meta">Trader views</span><strong>4,280</strong></div>
          </div>
          <div class="panel">
            <div class="panel-title">Widget preview <span class="meta">width 100% / height 600px</span></div>
            <div class="panel-pad">
              <div class="row" style="justify-content: space-between;">
                <span class="status success">Token valid</span>
                <button class="btn ghost dense">Copy SDK snippet</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>Store and Social Building Blocks</h2><p class="hint">Use only when the surface is store, redemption, social quests, or widget equivalents.</p></div>
      </div>
      <div class="grid three">
        <div class="store-card">
          <div class="store-media"></div>
          <div class="card-pad">
            <div class="price-row"><strong>Trading course access</strong><span class="badge yellow">Gold</span></div>
            <div class="price-row"><span class="meta">Cost</span><span class="reward">4,800 pts</span></div>
            <div class="price-row"><span class="status success">In stock</span><button class="btn primary dense">Redeem</button></div>
          </div>
        </div>
        <div class="store-card">
          <div class="card-pad">
            <div class="price-row"><strong>Reward settings card</strong><span class="badge">Selected</span></div>
            <p class="body-copy">Reward management uses compact settings cards, price rows, stock states, PDP sections, and redeemed rewards tables from Figma page 26.</p>
            <button class="btn secondary dense">Edit reward</button>
          </div>
        </div>
        <div class="social-card">
          <div class="card-pad">
            <div class="price-row"><strong>Social quest</strong><span class="badge green">Claimable</span></div>
            <div class="criteria">
              <div class="criteria-row"><span><span class="dot success"></span> Follow broker channel</span><span>Complete</span></div>
              <div class="criteria-row"><span><span class="dot pending"></span> Comment with account ID</span><span>Pending</span></div>
              <div class="criteria-row"><span><span class="dot"></span> Repost market update</span><span>Open</span></div>
            </div>
            <div class="row"><button class="btn primary dense">Open task</button><button class="btn ghost dense">View criteria</button></div>
          </div>
        </div>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function featureCard(icon: string, title: string, body: string): string {
  return `<div class="feature">
    <div class="feature-icon">${escapeHtml(icon)}</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(body)}</p>
  </div>`;
}

function kpi(label: string, value: string, delta: string): string {
  return `<div class="kpi">
    <div class="label">${escapeHtml(label)}</div>
    <div class="value">${escapeHtml(value)}</div>
    <div class="delta">${escapeHtml(delta)}</div>
  </div>`;
}

function listRow(name: string, meta: string, value: string, status: RowStatus): string {
  const badge = status === 'up' ? '<span class="badge up">↑</span>' : '<span class="badge">·</span>';
  return `<div class="list-row">
    <div>
      <div class="name">${escapeHtml(name)}</div>
      <div class="meta">${escapeHtml(meta)}</div>
    </div>
    <div class="meta">${escapeHtml(value)}</div>
    ${badge}
  </div>`;
}

function activityRow(name: string, meta: string): string {
  return `<div class="list-row">
    <div>
      <div class="name">${escapeHtml(name)}</div>
      <div class="meta">${escapeHtml(meta)}</div>
    </div>
    <div></div>
    <span class="badge">●</span>
  </div>`;
}

function priceCard(name: string, price: string, sub: string, features: string[], featured = false): string {
  return `<div class="price-card${featured ? ' featured' : ''}">
    <div class="tier-name">${escapeHtml(name)}</div>
    <div class="price">${escapeHtml(price)} <small>${escapeHtml(sub)}</small></div>
    <ul>${features.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
    <a class="btn ${featured ? 'btn-primary' : 'btn-ghost'}" href="#" style="${featured ? 'background: var(--accent); color: var(--accent-fg); border-color: var(--accent);' : ''}">Choose ${escapeHtml(name)}</a>
  </div>`;
}

function quote(text: string, name: string, role: string): string {
  return `<div class="quote">
    <p>${escapeHtml(text)}</p>
    <div class="quote-author">
      <div class="avatar"></div>
      <div>
        <div class="name">${escapeHtml(name)}</div>
        <div class="role">${escapeHtml(role)}</div>
      </div>
    </div>
  </div>`;
}

function faq(q: string, a: string): string {
  return `<div class="faq-item">
    <h4>${escapeHtml(q)}</h4>
    <p>${escapeHtml(a)}</p>
  </div>`;
}

function inlineLineChart(): string {
  // Deterministic numbers so the chart looks specific (12 weekly data points).
  const data = [38, 44, 41, 52, 49, 61, 58, 67, 71, 76, 82, 88];
  const max = Math.max(...data);
  const min = Math.min(...data);
  const w = 720;
  const h = 160;
  const padX = 8;
  const padY = 14;
  const stepX = (w - padX * 2) / (data.length - 1);
  const norm = (v: number) => padY + (h - padY * 2) * (1 - (v - min) / (max - min));
  const points = data.map((v, i) => `${padX + i * stepX},${norm(v).toFixed(1)}`).join(' ');
  const area = `${padX},${h} ${points} ${w - padX},${h}`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs>
      <linearGradient id="lg" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${area}" fill="url(#lg)"/>
    <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${data.map((v, i) => `<circle cx="${padX + i * stepX}" cy="${norm(v).toFixed(1)}" r="${i === data.length - 1 ? 4 : 0}" fill="var(--accent)"/>`).join('')}
  </svg>`;
}

function extractSubtitle(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const h1 = lines.findIndex((l) => /^#\s+/.test(l));
  if (h1 === -1) return '';
  const after = lines.slice(h1 + 1);
  const nextHeading = after.findIndex((l) => /^#{1,6}\s+/.test(l));
  const window = (nextHeading === -1 ? after : after.slice(0, nextHeading))
    .join('\n')
    .replace(/^>\s*Category:.*$/gim, '')
    .replace(/^>\s*/gm, '')
    .trim();
  return window.split(/\n\n/)[0]?.slice(0, 240) ?? '';
}

export function extractColors(raw: string): ColorToken[] {
  const colors: ColorToken[] = [];
  const seen = new Set<string>();
  function push(name: string, value: string, role: string): void {
    const cleanName = String(name).replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim();
    if (!cleanName || cleanName.length > 60) return;
    const v = normalizeHex(value);
    const key = `${cleanName.toLowerCase()}|${v}`;
    const cleanRole = String(role || '')
      .replace(/[`*_]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.;]+$/, '');
    if (seen.has(key)) {
      // Already recorded — but if this occurrence carries a richer role
      // description, upgrade the stored entry so role-based lookups don't
      // fall back to the bare name.
      if (cleanRole) {
        const existing = colors.find(
          (c) => c.name.toLowerCase() === cleanName.toLowerCase() && c.value === v,
        );
        if (existing && (!existing.role || cleanRole.length > existing.role.length)) {
          existing.role = cleanRole;
        }
      }
      return;
    }
    seen.add(key);
    colors.push({ name: cleanName, value: v, role: cleanRole });
  }

  // Process the file line-by-line so multi-hex entries like Linear's
  // `**Marketing Black** (\`#010102\` / \`#08090a\`): role` don't confuse a
  // single global regex. We extract three pieces from each candidate line:
  //   - the bold (or list-prefixed) name
  //   - the FIRST hex on the line
  //   - everything after the first `:` that follows the hex (the role)
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // Pattern A: **Name** … #hex … : role description
    const bold = /\*\*([A-Za-z][A-Za-z0-9 /&()+_'’-]{1,40}?)\*\*([^\n]+)/.exec(line);
    if (bold) {
      const rest = bold[2] ?? '';
      const hex = /#[0-9a-fA-F]{3,8}\b/.exec(rest);
      if (hex) {
        const after = rest.slice((hex.index ?? 0) + hex[0].length);
        const colonIdx = after.search(/[:：]/);
        const role = colonIdx >= 0 ? after.slice(colonIdx + 1).trim() : '';
        push(bold[1] ?? '', hex[0], role);
        continue;
      }
    }

    // Pattern B: list-prefixed spec lines like
    //   "- Background: `#7d2ae8`" inside a ### Buttons block.
    // Also handles the `- **Name:** \`#hex\`` shape (colon inside the bold
    // wrapper) used by agentic/warm-editorial: the optional `\*{0,2}` slots
    // before the name and after the colon let us absorb the surrounding
    // `**` markers without needing a third pattern.
    // Use the name itself as the role so lookups can still see "Background"
    // and "Text" labels.
    const spec = /^[\s>*-]*\*{0,2}([A-Za-z][^:*\n]{1,40}?)\*{0,2}\s*[:：]\s*\*{0,2}\s*`?(#[0-9a-fA-F]{3,8})/.exec(line);
    if (spec) {
      push(spec[1] ?? '', spec[2] ?? '', spec[1] ?? '');
    }
  }

  return colors;
}

function extractFonts(raw: string): FontHints {
  const out: FontHints = {};
  const re = /^[\s>*-]*\**\s*([A-Za-z][A-Za-z /]{1,30}?)\s*\**\s*[:：]\s*`?([^`\n]+?)`?$/gm;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const label = (m[1] ?? '').toLowerCase();
    const value = (m[2] ?? '').trim().replace(/[*_`]+$/g, '').trim();
    if (!/[a-zA-Z]/.test(value)) continue;
    if (value.startsWith('#')) continue;
    if (/display|heading|h1|title/.test(label) && !out.display) out.display = value;
    else if (/body|text|paragraph|copy/.test(label) && !out.body) out.body = value;
    else if (/mono|code/.test(label) && !out.mono) out.mono = value;
  }
  return out;
}

function escapeRegex(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Match a hint as a whole word inside `text` (case-insensitive). We use word
// boundaries so descriptive color names like "Cardinal Red" don't satisfy a
// "card" hint, and "Gem Pink" doesn't satisfy "ink" — both real bugs the
// substring-based version produced for the Duolingo and Canva showcases.
function matchesHint(text: string, hint: string): boolean {
  if (!text) return false;
  const needle = hint.toLowerCase().trim();
  if (!needle) return false;
  const re = new RegExp(`\\b${escapeRegex(needle)}\\b`, 'i');
  return re.test(text);
}

function pickColor(colors: ColorToken[], hints: string[], exclude: string[] = []): string | null {
  // Two-pass lookup: each hint is first checked against every color's role
  // description (the prose authors use to explain how the color is used)
  // and only then against the bare name. This ensures a `**Snow** … Primary
  // background.` line is recognised as the page background even though the
  // name "Snow" doesn't contain the word "background".
  // `exclude` skips colors whose hex equals an already-chosen role (e.g.
  // pass `[bg]` when picking `fg`) so two roles can't collapse to the same
  // hex and erase contrast.
  const blocked = new Set(
    exclude
      .map((v) => (v == null ? '' : String(v).toLowerCase()))
      .filter((v) => v.length > 0),
  );
  const isAllowed = (c: ColorToken) => !blocked.has(c.value.toLowerCase());
  for (const hint of hints) {
    const byRole = colors.find((c) => isAllowed(c) && matchesHint(c.role, hint));
    if (byRole) return byRole.value;
    const byName = colors.find((c) => isAllowed(c) && matchesHint(c.name, hint));
    if (byName) return byName.value;
  }
  return null;
}

function colorSaturation(hex: string): number {
  const v = String(hex).replace('#', '').toLowerCase();
  if (v.length !== 6) return 0;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function colorLuminance(hex: string): number {
  const v = String(hex).replace('#', '').toLowerCase();
  if (v.length !== 6) return 0.5;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function firstLightish(colors: ColorToken[]): string | null {
  for (const c of colors) {
    if (colorSaturation(c.value) > 0.15) continue;
    if (colorLuminance(c.value) >= 0.92) return c.value;
  }
  return null;
}

function firstNonNeutral(colors: ColorToken[], exclude: string[] = []): string | null {
  const set = new Set(exclude.map((v) => String(v || '').toLowerCase()));
  for (const c of colors) {
    if (set.has(c.value.toLowerCase())) continue;
    if (colorSaturation(c.value) > 0.25) return c.value;
  }
  return null;
}

function secondNonNeutral(colors: ColorToken[], exclude: string[] = []): string | null {
  const set = new Set(exclude.map((v) => String(v || '').toLowerCase()));
  for (const c of colors) {
    if (set.has(c.value.toLowerCase())) continue;
    if (colorSaturation(c.value) > 0.25) return c.value;
  }
  return null;
}

function pickReadableForeground(hex: string): string {
  const n = normalizeHex(hex);
  if (n.length !== 7) return '#ffffff';
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#0a0a0a' : '#ffffff';
}

function mixSurface(bg: string): string {
  const n = normalizeHex(bg);
  if (n.length !== 7) return '#fafafa';
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  // Lift dark backgrounds; tint light backgrounds slightly cooler.
  const adjust = lum < 0.4 ? 16 : -8;
  const fix = (v: number) => Math.max(0, Math.min(255, v + adjust)).toString(16).padStart(2, '0');
  return `#${fix(r)}${fix(g)}${fix(b)}`;
}

function normalizeHex(hex: string): string {
  let h = hex.toLowerCase();
  if (h.length === 4) {
    h = '#' + h.slice(1).split('').map((c) => c + c).join('');
  }
  return h;
}

function cleanTitle(raw: string): string {
  return String(raw).replace(/^Design System (Inspired by|for)\s+/i, '').trim();
}

function oneLine(s: string): string {
  return String(s).replace(/\s+/g, ' ').trim();
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
