/**
 * Anti-slop linter for generated HTML artifacts.
 *
 * Runs grep-style checks against an artifact body and returns a list of
 * structured findings. P0 findings indicate the artifact is regressing
 * to AI-slop tropes (purple gradients, emoji feature icons, sans-serif
 * display, invented metrics, lorem-style filler) and are surfaced back
 * to the agent as a system message so it can self-correct on the next
 * turn. P1/P2 findings are advisories.
 *
 * The linter is deliberately greppy: cheap, deterministic, and trivial
 * to extend. It does NOT parse HTML — false positives are tolerable
 * because each finding includes a snippet so the agent can verify.
 *
 * Wired into the artifact save flow (POST /api/artifacts/save) and
 * exposed standalone at POST /api/artifacts/lint for the chat UI to
 * surface badges next to each saved artifact.
 */

type LintSeverity = 'P0' | 'P1' | 'P2';

export type LintFinding = {
  severity: LintSeverity;
  id: string;
  message: string;
  fix: string;
  snippet?: string;
};

type CssDeclaration = { prop: string; value: string };
type CssTokenScope = {
  selectors: string[];
  tokens: Map<string, string>;
  isDefault: boolean;
  themeKeys: Set<string>;
};

const PURPLE_HEXES = [
  // Tailwind violet / purple — the original AI-slop palette.
  '#a855f7', '#9333ea', '#7c3aed', '#6d28d9', '#581c87',
  '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe',
  // Tailwind indigo — Refero's #1 reported AI tell. Common solid uses
  // (button fill, accent badge), not just gradients, are flagged
  // separately by `ai-default-indigo` below.
  '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81',
  '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff', '#eef2ff',
];

// Blue / cyan stops used in the documented "blue→cyan two-stop trust
// gradient" cardinal sin. The purple-gradient rule above only catches
// gradients that contain a violet/indigo hex or the literal
// `purple`/`violet` keyword, so an artifact emitting
// `linear-gradient(90deg, #3b82f6, #06b6d4)` (or the keyword form
// `linear-gradient(90deg, blue, cyan)`) slipped past P0 even though
// `craft/anti-ai-slop.md` explicitly flags it. The `trust-gradient`
// rule below pairs these against each other to close the gap.
const TRUST_GRADIENT_BLUE_HEXES = [
  // Tailwind blue 500–900 + 400/300/200.
  '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a',
  '#60a5fa', '#93c5fd', '#bfdbfe',
  // Tailwind sky 400–700 — the same blue→cyan ramp under a different name.
  '#0ea5e9', '#0284c7', '#0369a1', '#38bdf8', '#7dd3fc',
];
const TRUST_GRADIENT_CYAN_HEXES = [
  // Tailwind cyan 500–900 + 400/300/200.
  '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63',
  '#22d3ee', '#67e8f9', '#a5f3fc',
];

// Subset of PURPLE_HEXES that constitute the canonical "default LLM
// accent" — even a single solid use is a tell. The DESIGN.md provides
// `var(--accent)`; if a brief truly needs indigo, the design system
// should encode it explicitly so we know it's intentional.
//
// Keep this in sync with the explicit list in `craft/anti-ai-slop.md`'s
// "Default Tailwind indigo as accent" cardinal-sin entry — the prompt
// contract documents the exact set the lint enforces.
const AI_DEFAULT_INDIGO = [
  '#6366f1', '#4f46e5', '#4338ca', '#3730a3',
  '#8b5cf6', '#7c3aed', '#a855f7',
];

const SLOP_EMOJI = [
  '✨', '🚀', '🎯', '⚡', '🔥', '💡', '📈', '🎨', '🛡️', '🌟',
  '💪', '🎉', '👋', '🙌', '✅', '⭐', '🏆',
];

// Simple sentinel words for invented-metric copy. Catching every claim is
// hopeless; we look for the canonical AI-startup phrasings.
const INVENTED_METRIC_PATTERNS = [
  /\b10×\s+(faster|better|easier)\b/i,
  /\b100×\s+(faster|better)\b/i,
  /\b99\.\d+%\s+uptime\b/i,
  /\bzero[- ]downtime\b/i,
  /\b3×\s+more\s+(productive|efficient)\b/i,
];

const FILLER_PATTERNS = [
  /\bfeature\s+(one|two|three|1|2|3)\b/i,
  /\blorem\s+ipsum\b/i,
  /\bdolor\s+sit\s+amet\b/i,
  /\bplaceholder\s+text\b/i,
  /\bsample\s+content\b/i,
];

// Display-face check: an h1 / h2 / h3 element whose `font-family` lands on
// Inter / Roboto / Arial / -apple-system without an actual serif before it.
// We check the `<style>` block specifically; inline styles are checked too.
const DISPLAY_SANS_RE =
  /(?:h1|h2|h3|\.h-?(?:hero|xl|lg|md))[^{}]*\{[^}]*font-family\s*:\s*["']?(?:Inter|Roboto|Arial|-apple-system|system-ui|SF\s+Pro)/i;

/**
 * Run all checks against an HTML artifact body. Returns an array of
 * findings. The checks are intentionally independent so adding a new
 * one only means appending to this function.
 *
 * @param {string} html
 * @returns {LintFinding[]}
 */
export function lintArtifact(rawHtml: unknown): LintFinding[] {
  const out: LintFinding[] = [];
  if (typeof rawHtml !== 'string' || rawHtml.length === 0) return out;

  // Strip HTML comments before any pattern matching — comments often contain
  // pedagogical examples ("paste a `<section class="slide">` here") that
  // would otherwise fire false positives for the section / slide checks.
  const html = rawHtml.replace(/<!--[\s\S]*?-->/g, '');
  const lower = html.toLowerCase();

  // ── P0-1: purple gradient backgrounds ─────────────────────────────
  for (const hex of PURPLE_HEXES) {
    const re = new RegExp(
      `linear-gradient\\([^)]*${escapeRe(hex)}[^)]*\\)`,
      'i',
    );
    const m = re.exec(html);
    if (m) {
      out.push({
        severity: 'P0',
        id: 'purple-gradient',
        message: `Found a violet/purple gradient using ${hex} — anti-slop list says no.`,
        fix: 'Replace the gradient with a flat surface (var(--bg) or var(--surface)) or use the active accent at a single intensity, not in a gradient.',
        snippet: clip(m[0]),
      });
      break;
    }
  }
  // Also catch the literal "purple"/"violet" keyword in a linear-gradient.
  if (out.find((f) => f.id === 'purple-gradient') === undefined) {
    const m = /linear-gradient\([^)]*\b(purple|violet)\b[^)]*\)/i.exec(html);
    if (m) {
      out.push({
        severity: 'P0',
        id: 'purple-gradient',
        message: `Found a "${m[1]}" keyword inside a gradient — anti-slop.`,
        fix: 'Remove the gradient or swap to a single solid color from the active design tokens.',
        snippet: clip(m[0]),
      });
    }
  }

  // ── P0-1c: blue→cyan "trust" two-stop gradient ─────────────────────
  // craft/anti-ai-slop.md documents three flavours of the two-stop
  // "trust" gradient — purple→blue, blue→cyan, indigo→pink. The first
  // and third are caught by `purple-gradient` above because the
  // relevant indigo/violet hex appears in PURPLE_HEXES, but a pure
  // blue→cyan gradient has no overlap with that list and slipped
  // past unflagged. Detect a `linear-gradient(...)` whose stop list
  // contains both a blue token (hex or keyword) and a cyan token
  // (hex or keyword). Skip if the purple-gradient rule already fired
  // so we emit a single corrective signal per artifact.
  if (out.find((f) => f.id === 'purple-gradient') === undefined) {
    const tg = detectBlueCyanTrustGradient(html);
    if (tg) {
      out.push({
        severity: 'P0',
        id: 'trust-gradient',
        message: `Found a blue→cyan two-stop "trust" gradient — anti-slop list says no.`,
        fix: 'Replace the gradient with a flat surface (var(--bg) or var(--surface)) or use a single design-token color. Two-stop blue→cyan trust gradients are a SaaS hero cliché.',
        snippet: clip(tg),
      });
    }
  }

  // ── P0-1b: solid AI-default indigo as accent ──────────────────────
  // Even outside a gradient, a single use of #6366f1 et al. is the
  // textbook LLM tell. We only fire if the existing purple-gradient
  // check didn't already, since they overlap in spirit. Strip
  // token-definition blocks first: a brief whose accent is
  // intentionally indigo declares it as `--accent: #6366f1` inside
  // a selector list containing `:root` (or another known global
  // theme scope like `html` / bare `[data-theme="..."]`) and uses
  // var(--accent) downstream. That is the design system speaking,
  // not the model defaulting, and must not fire. Component-local
  // variables (e.g. `.cta { --cta-bg: #6366f1; }`) stay in scope so
  // the lint still catches indigo laundered through a local var.
  if (out.find((f) => f.id === 'purple-gradient') === undefined) {
    const htmlForIndigo = stripTokenBlocks(html);
    for (const hex of AI_DEFAULT_INDIGO) {
      const re = new RegExp(escapeRe(hex), 'i');
      const m = re.exec(htmlForIndigo);
      if (m) {
        out.push({
          severity: 'P0',
          id: 'ai-default-indigo',
          message: `Found a default LLM accent color (${hex}) — this is the most-reported AI design tell.`,
          fix: 'Replace with var(--accent) from the active DESIGN.md. If the brief truly requires indigo, encode it as the design system\'s accent so it reads as intentional, not default.',
          snippet: clip(m[0]),
        });
        break;
      }
    }
  }

  // ── P0-2: emoji used as feature/UI icons ──────────────────────────
  for (const e of SLOP_EMOJI) {
    if (html.includes(e)) {
      // Only flag if it appears in a structural context — heading,
      // button, list item — not in body prose.
      const re = new RegExp(
        `<(?:h[1-6]|button|li|span class="[^"]*icon[^"]*")[^>]*>[^<]*${escapeRe(e)}`,
        'i',
      );
      const m = re.exec(html);
      if (m) {
        out.push({
          severity: 'P0',
          id: 'emoji-icon',
          message: `Emoji "${e}" used as a UI icon — anti-slop list says SVG monoline only.`,
          fix: 'Replace with a small inline SVG icon (1.6–1.8px stroke, currentColor) or remove the icon entirely.',
          snippet: clip(m[0]),
        });
        break;
      }
    }
  }

  // ── P0-3: rounded card with left-border accent ────────────────────
  const leftAccentRe =
    /\.[a-z-]+\s*\{[^}]*border-left\s*:\s*\d+px\s+solid\s+[^;]+;[^}]*border-radius\s*:\s*[1-9]/i;
  const lam = leftAccentRe.exec(html);
  if (lam) {
    out.push({
      severity: 'P0',
      id: 'left-accent-card',
      message: 'Rounded card with a coloured left border — the canonical AI-slop card pattern.',
      fix: 'Drop either the border-radius (set 0px) or the border-left. Cards in the OD seed use hairline borders all-round, no left accent.',
      snippet: clip(lam[0]),
    });
  }

  // ── P0-4: sans-serif display face ─────────────────────────────────
  // Skill seeds bind --font-display to a serif. Catch the case where a
  // generated artifact reverts this on h1/h2/h3 to system-sans.
  const dm = DISPLAY_SANS_RE.exec(html);
  if (dm) {
    out.push({
      severity: 'P0',
      id: 'sans-display',
      message: 'A heading rule uses Inter / Roboto / system-sans as the display face — not the serif the seed binds.',
      fix: 'Use `font-family: var(--font-display)` on h1/h2/h3 and let the active design system pick the serif. Override only if the active direction is "tech / utility" or "modern minimal".',
      snippet: clip(dm[0]),
    });
  }

  // ── P0-5: invented metric phrasing ────────────────────────────────
  for (const re of INVENTED_METRIC_PATTERNS) {
    const m = re.exec(html);
    if (m) {
      out.push({
        severity: 'P0',
        id: 'invented-metric',
        message: `Suspected invented metric: "${m[0]}". Anti-slop list says: no numbers without a real source.`,
        fix: 'Either remove the claim or replace with a placeholder (— or a labelled stub) until the user supplies a real number.',
        snippet: clip(m[0]),
      });
      break;
    }
  }

  // ── P0-6: filler / lorem text ─────────────────────────────────────
  for (const re of FILLER_PATTERNS) {
    const m = re.exec(html);
    if (m) {
      out.push({
        severity: 'P0',
        id: 'filler-copy',
        message: `Filler copy detected: "${m[0]}". Pages should ship with real, brief-derived copy.`,
        fix: 'Replace with copy specific to the brief or delete the section entirely. An empty section is a design problem to solve with composition, not by inventing words.',
        snippet: clip(m[0]),
      });
      break;
    }
  }

  // ── P0-7: scrollIntoView (breaks iframe preview) ──────────────────
  if (/\.scrollIntoView\s*\(/.test(html)) {
    out.push({
      severity: 'P0',
      id: 'scroll-into-view',
      message: 'Element.scrollIntoView() detected — yanks the host page when an iframe boundary is crossed.',
      fix: 'Use `scrollTo({ left, top, behavior: "smooth" })` on the actual scroller (see simple-deck seed for the proven pattern).',
    });
  }

  // ── P1-0: ALL-CAPS without letter-spacing ─────────────────────────
  // Refero's typography rules: any `text-transform: uppercase` rule
  // must pair with `letter-spacing: >= 0.06em` (or an absolute px
  // equivalent). Iterate every <style> block (artifacts often emit
  // a reset block followed by a tokens/components block) and scan
  // each CSS body for an uppercase declaration whose selector body
  // is missing letter-spacing or sets it visibly too low.
  // Token-aware tracking: collect per-scope `--name: value` declarations
  // from global theme scopes once, then pass them to the tracking helper
  // so a rule like `letter-spacing: var(--caps-tracking)` is judged by
  // the token's literal value in every applicable theme instead of being
  // treated as missing.
  const tokenScopes = extractCssTokens(html);
  outer: for (const styleBlock of html.matchAll(
    /<style[^>]*>([\s\S]*?)<\/style>/gi,
  )) {
    // Strip CSS comments before structural matching: a `<style>` body
    // such as `/* .eyebrow { text-transform: uppercase; } */` is
    // commented-out by the browser but the rule-shaped regex below
    // would otherwise match it and emit a P1 finding for CSS that has
    // no rendered effect.
    const css = (styleBlock[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    // Match a CSS rule body containing text-transform: uppercase.
    // Capture the selector + body so we can inspect tracking. The body
    // alternation is `[^{}]*` (not `[^}]*`) so the regex matches only
    // innermost `selector { body }` rules. With `[^}]*`, an outer
    // `@media (...) { .display { font-size: 48px; text-transform:
    // uppercase; … } }` matches as a single rule whose selector is the
    // `@media (...)` wrapper and whose body begins with `.display {
    // font-size: …` — so `parseDeclarations()` sees the first property
    // as `.display { font-size`, not `font-size`, the same-rule
    // font-size is lost, and `hasAdequateUppercaseTracking()` falls
    // back to the lenient inherited-size path that accepts 1px
    // tracking on a 48px heading. Restricting the body to `[^{}]*`
    // makes the regex skip the wrapper and match the inner rule
    // directly.
    const upperRe = /([^{}]*)\{([^{}]*text-transform\s*:\s*uppercase[^{}]*)\}/gi;
    let m;
    while ((m = upperRe.exec(css)) !== null) {
      const selector = (m[1] ?? '').trim();
      const body = m[2] ?? '';
      if (!hasAdequateUppercaseTracking(body, tokenScopes)) {
        out.push({
          severity: 'P1',
          id: 'all-caps-no-tracking',
          message: `Selector \`${selector.slice(0, 60)}\` sets text-transform: uppercase without sufficient letter-spacing (≥0.06em).`,
          fix: 'Add `letter-spacing: 0.08em` (typical) to the same rule. ALL CAPS without tracking looks cramped — Refero\'s typography rules call this out as a top-tier amateur tell.',
          snippet: clip(`${selector} { ${body.trim()} }`),
        });
        break outer;
      }
    }
  }

  // ── P1-0b: ALL-CAPS in inline style attributes ────────────────────
  // The <style>-block scan above misses inline declarations such as
  // `<span style="text-transform: uppercase">NEW</span>`, which the
  // browser still renders ALL CAPS. craft/typography.md treats the
  // tracking floor as having no exceptions, so the inline form runs
  // through the same `hasAdequateUppercaseTracking` check used by the
  // <style>-block branch — no separate threshold. Only fire if the
  // <style>-block scan above didn't already produce this id, so the
  // agent gets a single corrective signal per artifact.
  if (out.find((f) => f.id === 'all-caps-no-tracking') === undefined) {
    const inlineStyleRe = /(?:^|\s)style\s*=\s*(["'])([\s\S]*?)\1/gi;
    let im;
    while ((im = inlineStyleRe.exec(html)) !== null) {
      const decl = im[2] ?? '';
      if (!/text-transform\s*:\s*uppercase/i.test(decl)) continue;
      if (!hasAdequateUppercaseTracking(decl, tokenScopes)) {
        out.push({
          severity: 'P1',
          id: 'all-caps-no-tracking',
          message:
            'Inline style sets text-transform: uppercase without sufficient letter-spacing (≥0.06em).',
          fix: 'Add `letter-spacing: 0.08em` (typical) to the same inline style. ALL CAPS without tracking looks cramped — Refero\'s typography rules call this out as a top-tier amateur tell.',
          snippet: clip(decl.trim()),
        });
        break;
      }
    }
  }

  // ── P1-1: external image URLs (CDN / unsplash / placehold.co) ─────
  // Allow data: urls and same-origin paths.
  const extImg =
    /<img[^>]+src=["']https?:\/\/(?:images\.unsplash\.com|placehold\.co|placekitten\.com|via\.placeholder\.com|picsum\.photos|loremflickr\.com)/i.exec(
      html,
    );
  if (extImg) {
    out.push({
      severity: 'P1',
      id: 'external-image',
      message: 'External placeholder image CDN detected — fragile, looks fake when it 404s.',
      fix: 'Use the .ph-img placeholder class shipped in the seed templates instead.',
      snippet: clip(extImg[0]),
    });
  }

  // ── P1-2: raw hex outside :root ───────────────────────────────────
  // Heuristic: count `#xxxxxx` occurrences inside the first <style> block,
  // outside the `:root{...}` declaration. Many is suspicious.
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/i;
  const styleMatch = styleRe.exec(html);
  if (styleMatch) {
    const css = styleMatch[1] ?? '';
    const rootRe = /:root\s*\{[^}]*\}/g;
    const cssWithoutRoot = css.replace(rootRe, '');
    const hexes = cssWithoutRoot.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    // Allow up to ~12 raw hex values outside :root. Device chrome
    // (mobile-app frame: bezel gradient, side rails, status icons) has
    // legitimate hardware-specific values in the 8–10 range; raise the
    // threshold so seed templates pass without ceremony. More than ~12
    // signals tokens weren't honoured by the agent's generation.
    if (hexes.length > 12) {
      out.push({
        severity: 'P1',
        id: 'raw-hex',
        message: `${hexes.length} raw hex values found outside :root — design tokens probably not honoured.`,
        fix: 'Move every color into the :root token block (--bg / --surface / --fg / --muted / --border / --accent) and reference via var(). Use color-mix() for derived tones.',
        snippet: hexes.slice(0, 6).join(' '),
      });
    }
  }

  // ── P1-3: too many accent uses in the rendered body ───────────────
  // Approximation: count `var(--accent)` references that appear OUTSIDE
  // the <style> block — i.e. inline styles in the rendered DOM, not the
  // class system definitions. The seed's <style> block defines the
  // accent on many class selectors that won't all render on one page;
  // the body is what the user actually sees.
  const styleStripped = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  const accentUsesInBody = (styleStripped.match(/var\(--accent\)/g) ?? []).length;
  if (accentUsesInBody > 6) {
    out.push({
      severity: 'P1',
      id: 'accent-overuse',
      message: `var(--accent) used ${accentUsesInBody} times inline in the body — likely overused per screen.`,
      fix: 'Cap accent usage at 2 visible uses per screen (one eyebrow + one CTA, OR one accent card + one tab). Demote the rest to var(--fg) or var(--muted).',
    });
  }

  // ── P2-1: missing comment-mode anchor on <section> ────────────────
  // Either `data-od-id` (web/mobile prototypes) or `data-screen-label`
  // (decks) counts. Whichever the artifact uses, every <section> should
  // carry one so the chat layer can target it.
  const sections = html.match(/<section\b[^>]*>/gi) ?? [];
  const tagged = sections.filter(
    (s) => /data-od-id\s*=/.test(s) || /data-screen-label\s*=/.test(s),
  ).length;
  if (sections.length > 0 && tagged < sections.length) {
    out.push({
      severity: 'P2',
      id: 'missing-section-anchor',
      message: `${sections.length - tagged} of ${sections.length} <section>s lack data-od-id (or data-screen-label).`,
      fix: 'Add data-od-id="kebab-slug" (or data-screen-label="01 Cover" for slides) to every top-level <section> so comment mode can target it.',
    });
  }

  // ── P2-2: missing slide theme classes (deck specifically) ──────────
  // Triggered only if the artifact looks deck-shaped (has .slide).
  if (/class\s*=\s*["'][^"']*\bslide\b/.test(html)) {
    const slideMatches = html.match(/<section\s+class\s*=\s*["'][^"']*\bslide\b[^"']*["']/gi) ?? [];
    const themed = slideMatches.filter((s) =>
      /\b(light|dark|hero\s+light|hero\s+dark)\b/.test(s),
    ).length;
    if (slideMatches.length > 0 && themed < slideMatches.length) {
      out.push({
        severity: 'P0',
        id: 'slide-theme-missing',
        message: `${slideMatches.length - themed} of ${slideMatches.length} slides lack a theme class (light / dark / hero light / hero dark).`,
        fix: 'Every <section class="slide"> must include exactly one theme class. Audit your slide list and add light/dark/hero modifiers.',
      });
    }
    // Theme rhythm: no 3+ same-theme in a row.
    const themeSeq = slideMatches
      .map((s) => {
        if (/hero\s+dark/.test(s)) return 'HD';
        if (/hero\s+light/.test(s)) return 'HL';
        if (/\bdark\b/.test(s)) return 'D';
        if (/\blight\b/.test(s)) return 'L';
        return '?';
      })
      .filter((t) => t !== '?');
    for (let i = 0; i < themeSeq.length - 2; i++) {
      const a = themeSeq[i];
      const isLight = (t: string | undefined) => t === 'L' || t === 'HL';
      const isDark = (t: string | undefined) => t === 'D' || t === 'HD';
      if (
        (isLight(a) && isLight(themeSeq[i + 1]) && isLight(themeSeq[i + 2])) ||
        (isDark(a) && isDark(themeSeq[i + 1]) && isDark(themeSeq[i + 2]))
      ) {
        out.push({
          severity: 'P1',
          id: 'slide-rhythm',
          message: `Three same-theme slides in a row at position ${i + 1}–${i + 3} — visual fatigue.`,
          fix: 'Swap the middle slide to the opposite theme (light → dark, or dark → light). For 8+ slides, mix in at least one hero light AND one hero dark.',
        });
        break;
      }
    }
  }

  return out;
}

/**
 * Format findings as a Markdown block ready to splice into a system
 * reminder back to the agent. P0 findings appear first.
 *
 * @param {LintFinding[]} findings
 * @returns {string}
 */
export function renderFindingsForAgent(findings: LintFinding[]): string {
  if (findings.length === 0) return '';
  const sorted = [...findings].sort((a, b) => severity(a) - severity(b));
  const lines = [
    '<artifact-lint>',
    'The artifact you just produced has the following anti-slop / design-token issues.',
    `${findings.filter((f) => f.severity === 'P0').length} P0 (must fix), ${findings.filter((f) => f.severity === 'P1').length} P1 (should fix), ${findings.filter((f) => f.severity === 'P2').length} P2 (nice to have).`,
    'Re-emit a corrected `<artifact>` in your next turn — do not write a separate explanation; the user has the previous version already.',
    '',
  ];
  for (const f of sorted) {
    lines.push(`**[${f.severity}] ${f.id}** — ${f.message}`);
    lines.push(`  Fix: ${f.fix}`);
    if (f.snippet) lines.push(`  Snippet: \`${f.snippet}\``);
    lines.push('');
  }
  lines.push('</artifact-lint>');
  return lines.join('\n');
}

function severity(f: LintFinding): number {
  return f.severity === 'P0' ? 0 : f.severity === 'P1' ? 1 : 2;
}

function clip(s: string): string {
  if (!s) return '';
  const trimmed = s.replace(/\s+/g, ' ').trim();
  return trimmed.length > 200 ? trimmed.slice(0, 197) + '…' : trimmed;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Scan every `linear-gradient(...)` body for a blue→cyan two-stop
// trust gradient. Returns the first matching gradient text or `null`.
// The check accepts either Tailwind blue/sky/cyan hex stops or the
// literal `blue`/`cyan` keywords, so both
// `linear-gradient(90deg, #3b82f6, #06b6d4)` and
// `linear-gradient(90deg, blue, cyan)` fire P0.
function detectBlueCyanTrustGradient(html: string): string | null {
  const re = /linear-gradient\([^)]*\)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const grad = m[0].toLowerCase();
    const hasBlue =
      TRUST_GRADIENT_BLUE_HEXES.some((h) => grad.includes(h.toLowerCase())) ||
      /\bblue\b/.test(grad);
    const hasCyan =
      TRUST_GRADIENT_CYAN_HEXES.some((h) => grad.includes(h.toLowerCase())) ||
      /\bcyan\b/.test(grad);
    if (hasBlue && hasCyan) return m[0];
  }
  return null;
}

// True when the declaration body has letter-spacing satisfying the
// craft rule: `letter-spacing >= 0.06em` of the element's own font.
//
// `em` maps directly to the 0.06 floor — it is relative to the
// element's own font-size, which is what the rule measures against.
//
// `rem` and `px` are absolute relative to the element: `rem` resolves
// against the root font-size (assumed 16px — the browser default and
// the value all OD seed templates use), so `0.06rem` on a 48px heading
// is `0.96px`, only `0.02em` of the element. Treating `rem` like `em`
// (the previous behaviour) accepts that as compliant when the rule
// it enforces is the per-element em floor; convert `rem` to absolute
// px and reuse the same px-vs-element-font-size resolution.
//
// px (and the converted-rem path) resolve in three steps:
//   1. If the same rule body declares `font-size` in `px` or `rem`
//      (after `var()` resolution), convert it to absolute px and
//      compare px tracking against `fs * 0.06` — exact translation
//      of the em rule. `rem` font sizes resolve via the same root
//      assumption used for tracking, so a `font-size: 3rem` heading
//      enforces a 2.88px floor instead of the lenient body fallback.
//   2. If the rule explicitly declares a `font-size` in a unit we
//      can't resolve (`em`, `%`, `calc(...)`, an unresolved var,
//      etc.), refuse the lenient fallback: the heading might be
//      arbitrarily large, in which case 1px tracking is well below
//      0.06em. Treat as missing tracking — the agent can either
//      switch to `em` letter-spacing or declare an explicit px/rem
//      font-size we can verify.
//   3. Otherwise (no font-size declared at all, font-size inherited),
//      use a conservative `>= 1px` absolute fallback. That stays
//      correct for the typical body-text default of 16px (1px / 16px
//      ≈ 0.0625em, just over the floor) and for any smaller label
//      (1px / 14px ≈ 0.071em, 1px / 12px ≈ 0.083em).
//
// `scopes` (optional) is the array of per-scope token records
// harvested from global theme scopes elsewhere in the artifact (see
// `extractCssTokens`). Each record carries the scope's per-scope
// last-write-wins token map plus enough metadata to identify which
// themes the scope applies to. Per-theme effective maps are built
// here via `buildResolvedThemes` so simple `var(--name)` (and
// `var(--name, fallback)`) references in the body resolve to the
// value the browser would render in that theme — keeping values
// declared in the same scope paired together. References without a
// matching token but with an inline fallback (`var(--x, 0.08em)`)
// resolve to the fallback; unresolved references with no fallback
// stay in place so the existing "no numeric value" path returns
// false.
//
// When a token resolves to different values in different themes
// (e.g. `:root { --caps-tracking: 0.02em }` overridden by
// `[data-theme="dark"] { --caps-tracking: 0.08em }`), the helper is
// conservative: it walks every per-theme map produced by
// `buildResolvedThemes` and returns true only if EVERY theme satisfies
// the 0.06em floor. A theme-scoped override that lifts the value
// above the floor must not silently rescue a default value that
// renders below it. Crucially, theme maps preserve the scope-internal
// relationship between tokens, so a paired declaration such as
// `:root { --display-size: 16px; --caps-tracking: 1px }` is judged
// against (16px, 1px) — never against the impossible cross-theme
// pairing (48px, 1px) that an independent per-token cartesian would
// emit.
const ROOT_FONT_PX = 16;
function hasAdequateUppercaseTracking(body: string, scopes?: CssTokenScope[]): boolean {
  const themes = buildResolvedThemes(scopes ?? []);
  for (const themeMap of themes) {
    const resolved = resolveCssVars(body, themeMap);
    if (!isResolvedTrackingAdequate(resolved)) return false;
  }
  return true;
}

// Single-resolution tracking check. Parses the declaration list with
// exact property names (so token-name declarations such as
// `--letter-spacing: 0.08em` cannot satisfy the rule) and selects the
// LAST matching `letter-spacing` and `font-size` declarations to model
// CSS source-order cascade — `.eyebrow { letter-spacing: 0.08em;
// letter-spacing: 0.02em }` renders the noncompliant `0.02em` value,
// so the lint must judge against the last declaration, not the first.
function isResolvedTrackingAdequate(body: string): boolean {
  const decls = parseDeclarations(body);
  const ls = findLastDecl(decls, 'letter-spacing');
  if (!ls) return false;
  const lsMatch = /^(-?\d*\.?\d+)\s*(em|px|rem)\b/i.exec(ls.value);
  if (!lsMatch) return false;
  const valueText = lsMatch[1];
  const unitText = lsMatch[2];
  if (valueText == null || unitText == null) return false;
  const v = parseFloat(valueText);
  const unit = unitText.toLowerCase();
  if (unit === 'em') return v >= 0.06;
  const trackingPx = unit === 'rem' ? v * ROOT_FONT_PX : v;
  const fsPx = resolveFontSizePx(decls);
  if (fsPx != null) {
    return fsPx > 0 && trackingPx >= fsPx * 0.06;
  }
  if (decls.some((d) => d.prop === 'font-size')) return false;
  return trackingPx >= 1;
}

// Build per-theme effective token maps from the per-scope records
// produced by `extractCssTokens`. A "theme" is the default rendering
// (no theme attribute set) plus one entry per distinct theme-attribute
// selector seen across scopes. Default-applying scopes (whose selector
// list contains a bare `:root` / `html` / `body`) apply to every theme
// as a baseline; variant scopes apply only to the themes their
// selector targets. Within a single theme, scopes are applied in
// source order so the final value reflects the cascade the browser
// would render.
//
// Returned as an array — one map per theme. The lint passes only when
// every theme map satisfies the rule, so a default-theme value below
// the floor flags even if a variant overrides it above the floor (and
// vice versa). Building per-theme maps preserves the scope-internal
// relationship between tokens, so values declared together in the
// same scope (e.g. `--display-size` and `--caps-tracking` both on
// `:root`) stay paired during evaluation. The previous design merged
// values by token name across scopes and then took an independent
// per-token cartesian product, which generated impossible cross-theme
// pairings such as `(default-size, dark-track)` and emitted false
// positives on legitimate light/dark theme variants.
function buildResolvedThemes(scopes: CssTokenScope[]): Map<string, string>[] {
  const themeKeys = new Set(['default']);
  for (const scope of scopes) {
    for (const k of scope.themeKeys) themeKeys.add(k);
  }
  const themes = new Map<string, Map<string, string>>();
  for (const k of themeKeys) themes.set(k, new Map());
  for (const scope of scopes) {
    if (scope.isDefault) {
      for (const map of themes.values()) {
        for (const [k, v] of scope.tokens) map.set(k, v);
      }
    } else {
      for (const themeKey of scope.themeKeys) {
        const map = themes.get(themeKey);
        if (map) {
          for (const [k, v] of scope.tokens) map.set(k, v);
        }
      }
    }
  }
  return Array.from(themes.values());
}

function isBareGlobalSelector(s: string): boolean {
  return /^(?::root|html|body)$/.test(s);
}

function findLastDecl(decls: CssDeclaration[], prop: string): CssDeclaration | undefined {
  for (let i = decls.length - 1; i >= 0; i--) {
    const decl = decls[i];
    if (decl && decl.prop === prop) return decl;
  }
  return undefined;
}

// Split a CSS declaration body into `{ prop, value }` entries, lowercasing
// the property name and skipping custom properties (`--name`). Used by
// the uppercase-tracking lint so substring matches on `letter-spacing`
// or `font-size` cannot collide with token-name declarations.
function parseDeclarations(body: string): CssDeclaration[] {
  const out: CssDeclaration[] = [];
  for (const raw of body.split(';')) {
    const idx = raw.indexOf(':');
    if (idx < 0) continue;
    const prop = raw.slice(0, idx).trim().toLowerCase();
    if (!prop || prop.startsWith('--')) continue;
    const value = raw.slice(idx + 1).trim();
    if (!value) continue;
    out.push({ prop, value });
  }
  return out;
}

// Resolve a same-rule `font-size` declaration to absolute px. Returns
// the px value when font-size is declared in `px` or `rem` (rem maps
// via the root font-size assumption shared with tracking); returns
// `null` when font-size is absent OR present in an unresolvable unit
// (`em`, `%`, `calc(...)`, an unresolved `var(--...)`). The caller
// distinguishes those two `null` cases by re-checking the parsed
// declarations for an exact `font-size` property.
//
// Selects the LAST `font-size` declaration in source order so that a
// rule like `.display { font-size: 48px; font-size: 1em }` is judged
// against the noncompliant `1em` the browser actually renders, not the
// stale earlier `48px`. CSS cascade is last-write-wins on conflicting
// declarations within a single rule body.
function resolveFontSizePx(decls: CssDeclaration[]): number | null {
  const fs = findLastDecl(decls, 'font-size');
  if (!fs) return null;
  const m = /^(-?\d*\.?\d+)\s*(px|rem)\b/i.exec(fs.value);
  if (!m) return null;
  const valueText = m[1];
  const unitText = m[2];
  if (valueText == null || unitText == null) return null;
  const v = parseFloat(valueText);
  const unit = unitText.toLowerCase();
  return unit === 'rem' ? v * ROOT_FONT_PX : v;
}

// Collect CSS custom properties (`--name: value`) declared in global
// theme scopes (`:root`, `html`, theme-attribute selectors) from every
// `<style>` block in the artifact. Tokens declared on component
// selectors are intentionally ignored: the lint must still catch
// indigo / under-tracking laundered through a local var, and the
// tracking helper resolves only the global-scope tokens artifacts use
// to express design intent.
//
// Returns an array of per-scope records:
//   `{ selectors, tokens, isDefault, themeKeys }`
// where `tokens` is the per-scope last-write-wins map of CSS custom
// properties, `selectors` lists the parsed selectors from the rule,
// `isDefault` is true if any selector is a bare global
// (`:root` / `html` / `body` without an attribute suffix), and
// `themeKeys` is the set of theme-attribute selector strings the rule
// targets. Per-theme effective maps are derived downstream from these
// records by `buildResolvedThemes`, which preserves the scope-internal
// relationship between values so a paired declaration like
// `:root { --display-size: 16px; --caps-tracking: 1px }` is judged
// as `(16px, 1px)` together, not against the impossible cross-theme
// pairing `(48px, 1px)` that an independent per-token cartesian over
// distinct values would emit.
//
// Within a single rule body, CSS cascade is last-write-wins: a block
// like `:root { --caps-tracking: 0.02em; --caps-tracking: 0.08em; }`
// renders the second value, and the first never reaches any element.
// Per-scope, we keep only the LAST value declared for each token
// name; cross-scope merging happens later in `buildResolvedThemes`,
// where the same source-order cascade is applied between scopes that
// target the same theme.
function extractCssTokens(html: string): CssTokenScope[] {
  const scopes: CssTokenScope[] = [];
  for (const styleBlock of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = (styleBlock[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    const ruleRe = /([^{}]*)\{([^{}]*)\}/g;
    let m;
    while ((m = ruleRe.exec(css)) !== null) {
      const sel = (m[1] ?? '').trim();
      if (!selectorListIsGlobalThemeScope(sel)) continue;
      const selectors = sel.split(',').map((s) => s.trim()).filter(Boolean);
      const isDefault = selectors.some(isBareGlobalSelector);
      const themeKeys = new Set(
        selectors.filter((s) => !isBareGlobalSelector(s)),
      );
      const body = m[2] ?? '';
      const tokens = new Map();
      for (const decl of body.split(';').map((d) => d.trim()).filter(Boolean)) {
        const dm = /^(--[\w-]+)\s*:\s*(.+)$/.exec(decl);
        if (dm) {
          const tokenName = dm[1];
          const tokenValue = dm[2];
          if (tokenName != null && tokenValue != null) tokens.set(tokenName, tokenValue.trim());
        }
      }
      if (tokens.size === 0) continue;
      scopes.push({ selectors, tokens, isDefault, themeKeys });
    }
  }
  return scopes;
}

// Replace simple `var(--name)` (and `var(--name, fallback)`) references
// in a CSS declaration body with the literal token value. Iterates a
// few times so a token whose value is itself another `var(--...)`
// resolves through one or two hops; bounded depth so a cyclic
// definition (`--a: var(--b); --b: var(--a)`) terminates instead of
// looping forever. Only one-level fallbacks are recognised — enough
// for the typography pattern this lint cares about, and keeps the
// regex linear-time on artifact-sized inputs.
const VAR_RESOLVE_MAX_DEPTH = 4;
function resolveCssVars(body: string, tokens: Map<string, string>): string {
  let out = body;
  for (let i = 0; i < VAR_RESOLVE_MAX_DEPTH; i++) {
    const next = out.replace(
      /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g,
      (full: string, name: string, fallback: string | undefined) => {
        const v = tokens.get(name);
        if (v != null) return v;
        if (fallback != null) return fallback.trim();
        return full;
      },
    );
    if (next === out) break;
    out = next;
  }
  return out;
}

// Remove CSS rule blocks that look like design-token definitions.
// Operates only on CSS extracted from <style> blocks — running the
// rule-shaped regex against the full HTML string makes the first
// selector capture include leading text like `<style>`, which then
// fails the `:root` selector test.
//
// A rule is treated as a token block only when ALL THREE conditions hold:
//   1. every selector in the list is a global theme-scope selector
//      (`:root`, `:root[data-theme="..."]`, `html`, `body`, or a bare
//      attribute selector for a known global-theme switch —
//      `data-theme`, `data-color-scheme`, `data-mode`). Selector lists
//      that mix in a component selector — e.g.
//      `:root, .cta { --cta-bg: #6366f1 }` — or that target an
//      arbitrary component/state attribute like `[data-variant="primary"]`
//      or `[aria-current="page"]` fail this test, so indigo laundered
//      through a local var or rule still trips the lint.
//   2. its body is token-shaped: only CSS custom properties
//      (`--name: value`), with a small allowlist for global-theme
//      metadata such as `color-scheme` that legitimately accompanies
//      tokens in `:root` and cannot smuggle a visible color.
//      A non-token declaration on `:root` (e.g.
//      `:root { background: #6366f1 }`) keeps the rule in scope so
//      the indigo check fires.
//   3. no token in the body launders an indigo hex through a
//      non-`--accent` name. The craft contract's escape hatch is to
//      encode indigo as the active design system's `--accent` token;
//      anything else (`:root { --primary: #6366f1 }`,
//      `:root { --button-bg: #4f46e5 }`) is still the LLM-default
//      color hidden behind an arbitrary token name and must stay in
//      scope of the indigo scan.
function stripTokenBlocks(input: string): string {
  return input.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_m: string, open: string, css: string, close: string) => `${open}${stripTokenBlocksFromCss(css)}${close}`,
  );
}

function stripTokenBlocksFromCss(css: string): string {
  // Strip CSS comments before any structural matching: a block like
  // `:root { /* brand accent */ --accent: #6366f1; }` would otherwise
  // produce a declaration fragment that begins with the comment,
  // fail `isTokenShapedDeclaration`, and leave a legitimate token
  // definition in scope of the indigo scan.
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // The body alternation is `[^{}]*` (not `[^}]*`) so the regex matches
  // only innermost `selector { body }` rules. That lets us recognize
  // global token blocks nested inside at-rule wrappers — e.g.
  // `@media (prefers-color-scheme: dark) { :root { --accent: #6366f1 } }`
  // — by matching the inner `:root { ... }` directly. The outer
  // `@media` wrapper is preserved with the inner token block stripped,
  // so the indigo scan no longer fires on legitimate responsive theme
  // declarations.
  return cleaned.replace(/([^{}]*)\{([^{}]*)\}/g, (full: string, selector: string, body: string) => {
    const sel = (selector || '').trim();
    if (!selectorListIsGlobalThemeScope(sel)) return full;
    const decls = (body || '')
      .split(';')
      .map((d: string) => d.trim())
      .filter(Boolean);
    if (decls.length === 0) return full;
    const tokenShaped = decls.every(isTokenShapedDeclaration);
    if (!tokenShaped) return full;
    // The `--accent` escape hatch is for `--accent` only. Any other
    // global token whose value carries an AI-default indigo hex is
    // still laundering the LLM-default color through an arbitrary
    // name (`--primary: #6366f1`, `--button-bg: #4f46e5`, …). Keep
    // the rule in scope so the indigo lint fires on the literal hex.
    if (decls.some(declarationLaundersIndigo)) return full;
    return '';
  });
}

function declarationLaundersIndigo(decl: string): boolean {
  const m = /^(--[\w-]+)\s*:\s*(.+)$/.exec(decl);
  if (!m) return false;
  const tokenName = m[1];
  const tokenValue = m[2];
  if (tokenName == null || tokenValue == null) return false;
  if (tokenName.toLowerCase() === '--accent') return false;
  const value = tokenValue.toLowerCase();
  for (const hex of AI_DEFAULT_INDIGO) {
    if (value.includes(hex.toLowerCase())) return true;
  }
  return false;
}

function isTokenShapedDeclaration(decl: string): boolean {
  // CSS custom property — the canonical token shape.
  if (/^--[\w-]+\s*:/.test(decl)) return true;
  // Global-theme metadata that legitimately accompanies tokens in
  // `:root` / `html` / `[data-theme="..."]` and whose values are
  // keywords, so they cannot smuggle a hardcoded color.
  if (/^color-scheme\s*:/i.test(decl)) return true;
  return false;
}

function selectorListIsGlobalThemeScope(selector: string): boolean {
  const parts = selector.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(isGlobalThemeScopeSelector);
}

// Attribute selectors — bare or attached to `:root`/`html`/`body` —
// are exempted only when the attribute is one of the known
// global-theme switches. A broader exemption would also strip
// arbitrary component/state attribute rules
// (e.g. `[data-variant="primary"] { --button-bg: #6366f1; }`,
// `:root[data-variant="primary"] { --button-bg: #6366f1; }`, or
// `html[aria-current="page"] { --nav-accent: #6366f1; }`), which
// is the exact component-local indigo laundering this lint is
// meant to catch.
const GLOBAL_THEME_ATTRIBUTES = new Set([
  'data-theme',
  'data-color-scheme',
  'data-mode',
]);

function isGlobalThemeScopeSelector(s: string): boolean {
  // :root / html / body, optionally suffixed with a single attribute
  // selector. The bare form (no attribute) is always a global theme
  // scope; the prefixed form is only a theme scope when the attribute
  // names one of GLOBAL_THEME_ATTRIBUTES. A component/state attribute
  // suffix (`:root[data-variant="primary"]`, `html[aria-current="page"]`)
  // must keep the rule in scope of the indigo lint.
  const tagAttr = /^(?::root|html|body)(?:\[([a-zA-Z-]+)(?:[*^$|~]?=[^\]]*)?\])?$/.exec(s);
  if (tagAttr) {
    const attrName = tagAttr[1];
    if (!attrName) return true;
    return GLOBAL_THEME_ATTRIBUTES.has(attrName.toLowerCase());
  }
  // Bare attribute selector restricted to known global-theme switches.
  const bareAttr = /^\[([a-zA-Z-]+)(?:[*^$|~]?=[^\]]*)?\]$/.exec(s);
  const bareAttrName = bareAttr?.[1];
  if (bareAttrName && GLOBAL_THEME_ATTRIBUTES.has(bareAttrName.toLowerCase())) {
    return true;
  }
  return false;
}
