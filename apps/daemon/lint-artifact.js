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

/**
 * @typedef {Object} LintFinding
 * @property {'P0'|'P1'|'P2'} severity
 * @property {string} id           short stable id (e.g. 'purple-gradient')
 * @property {string} message      one-line explanation
 * @property {string} fix          one-line corrective suggestion (for the agent)
 * @property {string} [snippet]    matched text (≤ 200 chars), if any
 */

const PURPLE_HEXES = [
  '#a855f7', '#9333ea', '#7c3aed', '#6d28d9', '#581c87',
  '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe',
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
export function lintArtifact(rawHtml) {
  /** @type {LintFinding[]} */
  const out = [];
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
      const isLight = (t) => t === 'L' || t === 'HL';
      const isDark = (t) => t === 'D' || t === 'HD';
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
export function renderFindingsForAgent(findings) {
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

function severity(f) {
  return f.severity === 'P0' ? 0 : f.severity === 'P1' ? 1 : 2;
}

function clip(s) {
  if (!s) return '';
  const trimmed = s.replace(/\s+/g, ' ').trim();
  return trimmed.length > 200 ? trimmed.slice(0, 197) + '…' : trimmed;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
