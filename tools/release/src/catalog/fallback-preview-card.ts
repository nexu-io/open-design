/**
 * Typographic fallback preview card (copied/adapted from landing-page scripts).
 * Used when a single artifact cannot be screenshot, or by the stub renderer.
 */

export type SkillCardMeta = {
  slug: string;
  displayName: string;
  description: string;
  mode?: string;
  category?: string;
  attribution?: string;
};

export const FALLBACK_CARD_VIEWPORT = { width: 1440, height: 900 } as const;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pickSlugFontSize(slug: string): number {
  const len = slug.length;
  if (len <= 14) return 128;
  if (len <= 22) return 104;
  if (len <= 30) return 88;
  return 72;
}

export function renderFallbackCard(meta: SkillCardMeta, indexInCatalog: number): string {
  const indexStr = String(indexInCatalog).padStart(3, "0");
  const chips: string[] = [];
  if (meta.mode) chips.push(meta.mode);
  if (meta.category && meta.category !== meta.mode) chips.push(meta.category);
  const slugFontSize = pickSlugFontSize(meta.slug);
  const { width, height } = FALLBACK_CARD_VIEWPORT;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(meta.slug)} preview card</title>
<style>
  :root {
    --paper-warm: #efe7d2;
    --ink: #1a1817;
    --ink-mute: #5b554b;
    --line: #c9bd9f;
    --accent: #d44b1e;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    background: var(--paper-warm);
    color: var(--ink);
    font-family: system-ui, sans-serif;
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
  }
  .card {
    width: 100%;
    height: 100%;
    padding: 80px 96px 72px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .top-bar {
    display: flex;
    justify-content: space-between;
    font-family: monospace;
    font-size: 14px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-mute);
  }
  .slug {
    font-family: Georgia, serif;
    font-weight: 700;
    font-size: ${slugFontSize}px;
    line-height: 0.95;
    margin: 0;
    word-break: break-word;
  }
  .slug .dot { color: var(--accent); }
  .desc {
    margin-top: 40px;
    max-width: 920px;
    font-family: Georgia, serif;
    font-style: italic;
    font-size: 32px;
    line-height: 1.45;
    color: var(--ink-mute);
  }
  .chip {
    font-family: monospace;
    font-size: 14px;
    padding: 8px 16px;
    border: 1px solid var(--line);
    border-radius: 999px;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="top-bar">
      <span>OpenDesign · Catalog</span>
      <span>Nº ${indexStr}</span>
    </div>
    <div>
      <h1 class="slug">${escapeHtml(meta.slug)}<span class="dot">.</span></h1>
      ${meta.description ? `<p class="desc">${escapeHtml(meta.description)}</p>` : ""}
    </div>
    <div>
      ${chips.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join(" ")}
    </div>
  </div>
</body>
</html>`;
}

export function renderCardFromExternal(
  meta: {
    slug: string;
    title: string;
    description: string;
    mode?: string;
    category?: string;
    attribution?: string;
  },
  indexInSection: number,
): string {
  return renderFallbackCard(
    {
      slug: meta.slug,
      displayName: meta.title || meta.slug,
      description: meta.description,
      mode: meta.mode,
      category: meta.category,
      attribution: meta.attribution,
    },
    indexInSection,
  );
}

/**
 * Tiny valid 1×1 lossy WebP (RIFF). Used as deterministic fallback image
 * when Playwright/sharp are unavailable or a single capture fails.
 */
export const MINIMAL_WEBP = Buffer.from(
  "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=",
  "base64",
);
