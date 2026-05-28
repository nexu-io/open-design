/**
 * Fallback preview-card renderer for skills that ship a `SKILL.md`
 * but no runnable `example.html` (instruction-only skills like
 * `copywriting`, `creative-director`, `competitive-ads-extractor`).
 *
 * Without this, the catalog row falls back to a diagonal-stripe
 * placeholder for ~70% of skills — visually cheap and undifferentiated.
 * We synthesize a typographic editorial card (skill name, tagline,
 * mode/category chips, attribution) and let `generate-previews.ts`
 * screenshot it through the same pipeline that handles real demos.
 *
 * The card's visual language matches the landing-page hero: warm paper
 * background, Playfair display serif headline with red-dot accent,
 * JetBrains Mono labels — so the catalog reads as one cohesive
 * publication rather than "real screenshots + grey placeholder".
 *
 * Frontmatter parsing is hand-rolled rather than pulling in a YAML
 * dependency: the SKILL.md schema is small (we need name, description,
 * od.mode, od.category, od.featured, od.upstream, body H1 attribution
 * line) and a tiny scanner is more predictable than `yaml` quirks
 * across 132 author-edited files.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface SkillCardMeta {
  /** Folder name, e.g. `color-expert`. */
  slug: string;
  /** SKILL.md frontmatter `name` if set, else the slug. */
  displayName: string;
  /** SKILL.md frontmatter `description` (already trimmed/joined). */
  description: string;
  /** SKILL.md frontmatter `od.mode`, e.g. `design-system`. */
  mode?: string;
  /** SKILL.md frontmatter `od.category`, e.g. `marketing-creative`. */
  category?: string;
  /**
   * SKILL.md frontmatter `od.featured` — used for sort order so the
   * card's Nº matches the row's position in the catalog index.
   */
  featured?: number;
  /**
   * Author/maintainer attribution. We pull this from the body's
   * `> Curated from <X>.` line if present (most skills have it),
   * otherwise we derive a short host string from `od.upstream`.
   */
  attribution?: string;
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---/;

/**
 * Tiny YAML scanner just for the keys we need. Handles:
 *   - top-level scalars: `name: foo` / `name: "foo"` / `name: 'foo'`
 *   - block scalars with `|` or `>` (folded for description)
 *   - one-level nesting under `od:` (mode, category, featured, upstream)
 *
 * Anything fancier (anchors, multi-doc, sequences nested under
 * sequences) we don't need — SKILL.md frontmatter never goes there.
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i] ?? '';
    const line = raw.replace(/\r$/, '');
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) {
      i++;
      continue;
    }

    // Top-level only — match key followed by colon, no indent.
    const topMatch = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (topMatch) {
      const key = topMatch[1] ?? '';
      const inlineValue = (topMatch[2] ?? '').trim();

      // Block scalar: `key: |` or `key: >`.
      if (inlineValue === '|' || inlineValue === '>') {
        i++;
        const buf: string[] = [];
        while (i < lines.length) {
          const next = lines[i] ?? '';
          if (next.length === 0) {
            buf.push('');
            i++;
            continue;
          }
          if (!/^\s/.test(next)) break; // dedented = end of block
          buf.push(next.replace(/^\s{2}/, '').trimEnd());
          i++;
        }
        out[key] = buf.join(inlineValue === '>' ? ' ' : '\n').trim();
        continue;
      }

      // Object: `key:` with indented children below.
      if (inlineValue === '') {
        const child: Record<string, unknown> = {};
        i++;
        while (i < lines.length) {
          const next = lines[i] ?? '';
          if (next.length === 0) {
            i++;
            continue;
          }
          const indented = /^\s{2}([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(next);
          if (!indented) break;
          const ckey = indented[1] ?? '';
          const cval = (indented[2] ?? '').trim();
          child[ckey] = stripScalar(cval);
          i++;
        }
        out[key] = child;
        continue;
      }

      // Inline scalar.
      out[key] = stripScalar(inlineValue);
      i++;
      continue;
    }

    i++;
  }

  return out;
}

function stripScalar(value: string): string | number | boolean {
  // Comments mid-line are rare in SKILL.md frontmatter; keep simple.
  let v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

/**
 * Pull the author/maintainer name out of the body — most SKILL.md files
 * carry a `> Curated from @handle.` blockquote right under the H1, and
 * surfacing it on the card preserves attribution at a glance. Falls back
 * to deriving a short host or path segment from `od.upstream`.
 */
function deriveAttribution(body: string, upstream?: string): string | undefined {
  const blockquote = /^>\s*(?:Curated\s+from|From)\s+([^.]+?)\.?\s*$/im.exec(body);
  if (blockquote && blockquote[1]) {
    return blockquote[1].trim();
  }
  if (!upstream) return undefined;
  // GitHub URL → @org/repo (or @user)
  const gh = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)/i.exec(upstream);
  if (gh && gh[1]) return `@${gh[1]}`;
  return upstream.replace(/^https?:\/\/(?:www\.)?/, '').replace(/\/.*$/, '');
}

/**
 * Read `<root>/skills/<slug>/SKILL.md` and shape it into a SkillCardMeta.
 * Returns null when the file doesn't exist (caller decides whether
 * that's a "no fallback needed" or a hard error).
 */
export function loadSkillCardMeta(skillsRoot: string, slug: string): SkillCardMeta | null {
  const file = path.join(skillsRoot, slug, 'SKILL.md');
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const fmMatch = FRONTMATTER_RE.exec(raw);
  const body = fmMatch ? raw.slice(fmMatch[0].length) : raw;
  const fm = fmMatch ? parseSimpleYaml(fmMatch[1] ?? '') : {};
  const od = (fm.od as Record<string, unknown> | undefined) ?? {};

  return {
    slug,
    displayName: (typeof fm.name === 'string' && fm.name) || slug,
    description: typeof fm.description === 'string' ? fm.description.trim() : '',
    mode: typeof od.mode === 'string' ? od.mode : undefined,
    category: typeof od.category === 'string' ? od.category : undefined,
    featured: typeof od.featured === 'number' ? od.featured : undefined,
    attribution: deriveAttribution(body, typeof od.upstream === 'string' ? od.upstream : undefined),
  };
}

const VIEWPORT = { width: 1440, height: 900 } as const;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Slug renders at 128px by default. Long compound slugs
 * (`competitive-ads-extractor`, `weread-year-in-review-video-template`)
 * wrap to 2-3 lines. Cap aggressively so the headline never blows past
 * the description band.
 */
function pickSlugFontSize(slug: string): number {
  const len = slug.length;
  if (len <= 14) return 128;
  if (len <= 22) return 104;
  if (len <= 30) return 88;
  return 72;
}

/**
 * Render the fallback card as a self-contained HTML document. Keep all
 * fonts loaded over the wire (Playwright will await `document.fonts.ready`
 * before snapshotting) so the screenshot matches what a visitor sees on
 * the live site. No build-time font baking.
 */
export function renderFallbackCard(meta: SkillCardMeta, indexInCatalog: number): string {
  const indexStr = String(indexInCatalog).padStart(3, '0');
  const chips: string[] = [];
  if (meta.mode) chips.push(meta.mode);
  if (meta.category && meta.category !== meta.mode) chips.push(meta.category);

  const slugFontSize = pickSlugFontSize(meta.slug);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(meta.slug)} preview card</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=Inter:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
<style>
  :root {
    --paper-warm: #efe7d2;
    --paper-dark: #e6dcc1;
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
    font-family: 'Inter', system-ui, sans-serif;
    width: ${VIEWPORT.width}px;
    height: ${VIEWPORT.height}px;
    overflow: hidden;
  }
  .card {
    width: 100%;
    height: 100%;
    padding: 80px 96px 72px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    background:
      linear-gradient(var(--paper-warm), var(--paper-warm)),
      repeating-linear-gradient(
        135deg,
        transparent 0,
        transparent 22px,
        rgba(180, 165, 130, 0.08) 22px,
        rgba(180, 165, 130, 0.08) 23px
      );
    background-blend-mode: multiply;
  }
  .top-bar {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-mute);
  }
  .top-bar .label {
    color: var(--ink);
    font-weight: 700;
  }
  .top-bar .label::before {
    content: '◆ ';
    color: var(--accent);
  }
  .body {
    margin-top: 56px;
  }
  .slug {
    font-family: 'Playfair Display', 'Georgia', serif;
    font-weight: 700;
    font-size: ${slugFontSize}px;
    line-height: 0.95;
    letter-spacing: -0.02em;
    margin: 0;
    word-break: break-word;
  }
  .slug .dot { color: var(--accent); }
  .desc {
    margin-top: 40px;
    max-width: 920px;
    font-family: 'Playfair Display', serif;
    font-style: italic;
    font-weight: 500;
    font-size: 32px;
    line-height: 1.45;
    color: var(--ink-mute);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 24px;
  }
  .chips {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .chip {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    letter-spacing: 0.08em;
    padding: 8px 16px;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink);
    background: rgba(255, 255, 255, 0.3);
  }
  .attribution {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    color: var(--ink-mute);
    text-align: right;
  }
  .attribution .from {
    display: block;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-bottom: 4px;
    font-size: 11px;
  }
  .rule {
    border: 0;
    border-top: 1px solid var(--line);
    margin: 32px 0 0;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="top-bar">
      <span class="label">Open Design · Skill</span>
      <span class="index">Nº ${indexStr}</span>
    </div>
    <div class="body">
      <h1 class="slug">${escapeHtml(meta.slug)}<span class="dot">.</span></h1>
      ${meta.description ? `<p class="desc">${escapeHtml(meta.description)}</p>` : ''}
    </div>
    <div>
      <hr class="rule" />
      <div class="meta">
        <div class="chips">
          ${chips.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join('')}
        </div>
        ${
          meta.attribution
            ? `<div class="attribution"><span class="from">Curated from</span><span>${escapeHtml(meta.attribution)}</span></div>`
            : ''
        }
      </div>
    </div>
  </div>
</body>
</html>`;
}

export const FALLBACK_CARD_VIEWPORT = VIEWPORT;

/**
 * Lightweight wrapper for non-SKILL.md sources (notably the bundled
 * plugin manifests under `plugins/_official/`). Skips the YAML
 * parsing path and feeds whatever metadata the caller already has
 * straight into the same card renderer.
 *
 * The card visual is identical to the SKILL.md path so the catalog
 * reads as one publication regardless of where each entry's data
 * came from.
 */
export interface ExternalCardMeta {
  slug: string;
  title: string;
  description: string;
  mode?: string;
  category?: string;
  attribution?: string;
}

export function renderCardFromExternal(
  meta: ExternalCardMeta,
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
