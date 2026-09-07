// @vitest-environment jsdom
//
// Deck thumbnails render a slide as inert DOM in a shadow root instead of
// running the whole deck in an iframe, so every selector the deck wrote against
// `<html>`/`<body>` has to be re-pointed at something that exists in the shadow
// tree. `design-templates/replit-deck` ships eight themes as
// `body[data-theme="…"]` custom-property blocks and activates one with
// `<body data-theme="holm">`. When only the BARE `body` selector was rewritten,
// `.od-thumb-canvas { background: var(--bg); color: var(--fg) }` survived while
// every `--bg`/`--fg` definition stayed behind an unmatched `body[data-theme]`
// selector: the canvas fell back to a transparent background and an inherited
// foreground, i.e. white text on white paper, in a rail that is supposed to
// show what the slide looks like.
//
// These specs assert the rendered outcome (the canvas resolves the ACTIVE
// theme's paint), not the shape of the rewrite, so they stay honest if the
// rewrite is implemented differently.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseDeckThumbnails,
  type ParsedDeckThumbnails,
} from '../../src/runtime/deck-thumbnail-parser';

/** Repo-root-relative fixture path; jsdom rewrites `import.meta.url` to http. */
function repoFile(relative: string): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, relative);
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error(`fixture not found: ${relative}`);
}

function readDeck(relative: string): string {
  return readFileSync(repoFile(relative), 'utf8');
}

const HOLM_DECK = 'design-templates/replit-deck/examples/example-holm.html';
const REPLIT_TEMPLATE = 'design-templates/replit-deck/assets/template.html';
const SIMPLE_DECK = 'design-templates/simple-deck/example.html';

/**
 * Read `canvasAttributes` without assuming the field exists, so a tree without
 * the fix fails on the paint assertion below (the thing users see) rather than
 * on a TypeError while building the fixture.
 */
function canvasAttributesOf(parsed: ParsedDeckThumbnails): Array<[string, string]> {
  const raw = (parsed as { canvasAttributes?: Array<[string, string]> }).canvasAttributes;
  return Array.isArray(raw) ? raw : [];
}

interface CanvasPaint {
  background: string;
  color: string;
}

/**
 * Rebuild the thumbnail canvas exactly as `DeckSlideThumbnail` does, then work
 * out what the deck's stylesheet actually paints it with. Selector matching is
 * jsdom's own `Element.matches`, so `[data-theme="holm"]` is evaluated for real
 * rather than by re-implementing the parser's matcher.
 */
function resolveCanvasPaint(parsed: ParsedDeckThumbnails): CanvasPaint {
  const canvas = document.createElement('div');
  for (const [name, value] of canvasAttributesOf(parsed)) canvas.setAttribute(name, value);
  canvas.classList.add('od-thumb-canvas');
  document.body.appendChild(canvas);

  const variables = new Map<string, string>();
  const painted = new Map<string, string>();

  for (const match of parsed.styleText.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectorList = match[1] ?? '';
    if (!selectorListPaintsCanvas(canvas, selectorList)) continue;
    for (const declaration of (match[2] ?? '').split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0) continue;
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      if (property.startsWith('--')) variables.set(property, value);
      else if (property === 'background' || property === 'color') painted.set(property, value);
    }
  }

  canvas.remove();
  return {
    background: expandVars(painted.get('background') ?? '', variables, 0),
    color: expandVars(painted.get('color') ?? '', variables, 0),
  };
}

function selectorListPaintsCanvas(canvas: HTMLElement, selectorList: string): boolean {
  if (selectorList.trim().startsWith('@')) return false;
  for (const raw of selectorList.split(',')) {
    const selector = raw.trim();
    if (!selector) continue;
    // `:host` is the shadow host — the canvas's parent — so its inherited
    // values reach the canvas. jsdom cannot evaluate `:host`, so treat a bare
    // `:host` compound as matching and let everything else go through
    // `matches()`.
    if (/^:host(?::[\w-]+(?:\([^)]*\))?)*$/.test(selector)) return true;
    try {
      if (canvas.matches(selector)) return true;
    } catch {
      // Selector jsdom cannot parse; it is not one of ours.
    }
  }
  return false;
}

/** Substitute `var(--x)`; leaves unresolved references visible in the output. */
function expandVars(value: string, variables: Map<string, string>, depth: number): string {
  if (depth > 8 || !value.includes('var(')) return value;
  const substituted = value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (whole, name: string) => {
    const resolved = variables.get(name);
    return resolved === undefined ? whole : resolved;
  });
  return substituted === value ? value : expandVars(substituted, variables, depth + 1);
}

describe('deck thumbnail theme variables', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves the active theme on a deck that scopes its tokens to body[data-theme]', () => {
    const parsed = parseDeckThumbnails(readDeck(HOLM_DECK));

    expect(parsed.renderable).toBe(true);
    const paint = resolveCanvasPaint(parsed);

    // The `holm` theme's paper and ink, from the `body[data-theme="holm"]`
    // block the source activates.
    expect(paint.background).toBe('#e4dfd7');
    expect(paint.color).toBe('#0f0f0e');
    // The regression itself: neither value may stay an unresolved reference,
    // and the slide may not end up painting its text in its background colour.
    expect(paint.background).not.toContain('var(');
    expect(paint.color).not.toContain('var(');
    expect(paint.background).not.toBe(paint.color);
  });

  it('activates only the theme the deck selected, out of the eight it defines', () => {
    const parsed = parseDeckThumbnails(readDeck(HOLM_DECK));
    const paint = resolveCanvasPaint(parsed);

    // Every sibling theme block declares its own `--bg`; if the rewrite made
    // them all match, the last one in source order would win instead.
    expect(paint.background).not.toBe('#fafafa'); // helix
    expect(paint.background).not.toBe('#0b1524'); // bluehouse, last in the file
  });

  it('carries the source body attributes onto the thumbnail canvas', () => {
    const parsed = parseDeckThumbnails(readDeck(HOLM_DECK));
    expect(canvasAttributesOf(parsed)).toContainEqual(['data-theme', 'holm']);
  });

  it('keeps the control decks renderable and correctly painted', () => {
    for (const [name, source] of [
      ['replit-deck template', readDeck(REPLIT_TEMPLATE)],
      ['simple-deck example', readDeck(SIMPLE_DECK)],
    ] as const) {
      const parsed = parseDeckThumbnails(source);
      expect(parsed.renderable, `${name} should still render statically`).toBe(true);
      const paint = resolveCanvasPaint(parsed);
      expect(paint.background, `${name} background`).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(paint.color, `${name} color`).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(paint.background).not.toBe(paint.color);
    }
  });

  it('rewrites html-scoped theme selectors onto the canvas too', () => {
    const parsed = parseDeckThumbnails(`<!doctype html><html data-theme="dusk"><head><style>
        html[data-theme="dusk"] { --bg: #101014; --fg: #f4f4f5; }
        html[data-theme="dawn"] { --bg: #ffffff; --fg: #111111; }
        body { background: var(--bg); color: var(--fg); }
        .deck-stage { width: 1920px; height: 1080px; }
      </style></head><body><div class="deck-stage">
        <section class="slide" data-screen-label="01 Cover">Cover</section>
      </div></body></html>`);

    expect(parsed.renderable).toBe(true);
    expect(resolveCanvasPaint(parsed)).toEqual({ background: '#101014', color: '#f4f4f5' });
  });

  it('collapses a root chain that names the canvas twice', () => {
    const parsed = parseDeckThumbnails(`<!doctype html><html data-theme="dusk"><head><style>
        html[data-theme="dusk"] body { --bg: #101014; --fg: #f4f4f5; }
        body { background: var(--bg); color: var(--fg); }
        .deck-stage { width: 1920px; height: 1080px; }
      </style></head><body><div class="deck-stage">
        <section class="slide" data-screen-label="01 Cover">Cover</section>
      </div></body></html>`);

    expect(parsed.renderable).toBe(true);
    expect(resolveCanvasPaint(parsed)).toEqual({ background: '#101014', color: '#f4f4f5' });
  });
});

describe('deck thumbnail unresolved-theme-variable fallback', () => {
  // A deck whose theme attribute is only applied at runtime by its own script.
  // Nothing static can put `data-theme` on the canvas, so the tokens stay out
  // of reach and the static clone would render unthemed.
  const scriptThemedDeck = `<!doctype html><html><head><style>
      :root { --font-body: system-ui, sans-serif; }
      body[data-theme="dusk"] { --bg: #101014; --fg: #f4f4f5; }
      body { background: var(--bg); color: var(--fg); font-family: var(--font-body); }
      .deck-stage { width: 1920px; height: 1080px; }
    </style></head><body><div class="deck-stage">
      <section class="slide" data-screen-label="01 Cover">Cover</section>
    </div><script>document.body.dataset.theme = 'dusk';</script></body></html>`;

  it('falls back to the iframe when canvas paint tokens stay out of reach', () => {
    const parsed = parseDeckThumbnails(scriptThemedDeck);
    expect(parsed.renderable).toBe(false);
    expect(parsed.reason).toBe('unresolved-theme-variable');
  });

  it('renders the same deck statically once the theme is on the body', () => {
    const parsed = parseDeckThumbnails(
      scriptThemedDeck.replace('<body>', '<body data-theme="dusk">'),
    );
    expect(parsed.renderable).toBe(true);
    expect(resolveCanvasPaint(parsed)).toEqual({ background: '#101014', color: '#f4f4f5' });
  });

  it('does not fall back when the deck simply never defines the variable', () => {
    // A `var()` the deck never declares anywhere is the deck's own gap: the
    // iframe would paint it exactly the same way, so falling back buys nothing.
    // This is the case that would make the guard a door that is always shut.
    const parsed = parseDeckThumbnails(`<!doctype html><html><head><style>
        body { background: var(--never-declared); color: #222; }
        .deck-stage { width: 1920px; height: 1080px; }
      </style></head><body><div class="deck-stage">
        <section class="slide" data-screen-label="01 Cover">Cover</section>
      </div></body></html>`);

    expect(parsed.renderable).toBe(true);
  });

  it('does not fall back for a deck whose tokens live on :root', () => {
    const parsed = parseDeckThumbnails(`<!doctype html><html><head><style>
        :root { --bg: #fafaf9; --fg: #1c1b1a; }
        html, body { margin: 0; height: 100%; }
        body { background: var(--bg); color: var(--fg); }
        .deck-stage { width: 1920px; height: 1080px; }
      </style></head><body><div class="deck-stage">
        <section class="slide" data-screen-label="01 Cover">Cover</section>
      </div></body></html>`);

    expect(parsed.renderable).toBe(true);
    expect(resolveCanvasPaint(parsed)).toEqual({ background: '#fafaf9', color: '#1c1b1a' });
  });
});
