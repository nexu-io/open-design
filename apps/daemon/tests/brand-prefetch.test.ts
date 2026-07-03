import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  extractFonts,
  isChallengePage,
  prefetchFromHtml,
  previewablePrefetchHtml,
} from '../src/brands/prefetch.js';

function tmpBrandDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'od-brand-html-'));
}

// An ≥80-char header SVG so extractInlineHeaderSvg registers it as a logo,
// which keeps the harvest fully offline (no favicon-service fallback fetch).
const HEADER_SVG =
  '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M10 10 H90 V90 H10 Z M20 20 H80 V80 H20 Z"/></svg>';

describe('brand prefetch artifacts', () => {
  it('replaces head-only truncated captures with a visible diagnostic page', () => {
    const html = `<!doctype html><html><head><title>Big SSR</title><script>${'x'.repeat(80)}</script></head><body>real page</body></html>`;

    const preview = previewablePrefetchHtml(html, 64);

    expect(preview).toContain('<body>');
    expect(preview).toContain('Prefetch HTML was truncated before the page body.');
    expect(preview).toContain('Big SSR');
    expect(preview).not.toContain('real page');
  });

  it('keeps capped captures when the body is present before the cap', () => {
    const html = `<!doctype html><html><head><title>Ready</title></head><body>${'x'.repeat(80)}</body></html>`;

    const preview = previewablePrefetchHtml(html, 72);

    expect(preview).toBe(html.slice(0, 72));
    expect(preview).toContain('<body>');
  });
});

describe('prefetchFromHtml (extract from already-rendered DOM)', () => {
  it('does not let icon fonts outrank the real body/display face', () => {
    const css = [
      '.ri{font-family:"Remix Icon"}',
      '.icon{font-family:"Remix Icon"}',
      '.button .glyph{font-family:"Remix Icon"}',
      'body{font-family:"Albert Sans",system-ui,sans-serif}',
      'h1{font-family:"Albert Sans",system-ui,sans-serif}',
    ].join('');

    const { fonts, fontFaceFamilies } = extractFonts(css);

    expect(fonts[0]?.family).toBe('Albert Sans');
    expect(fonts.some((font) => font.family === 'Remix Icon')).toBe(false);
    expect(fontFaceFamilies.some((font) => font === 'Remix Icon')).toBe(false);
  });

  it('harvests colors, fonts, and copy from provided HTML + CSS without fetching the page', async () => {
    const html = [
      '<!doctype html><html><head>',
      '<title>Acme Inc</title>',
      '<meta name="description" content="We build delightful developer tools.">',
      '</head><body>',
      `<header>${HEADER_SVG}</header>`,
      '<h1>Welcome to Acme</h1><h2>Fast, friendly software</h2>',
      `<p>${'Acme builds delightful developer tools teams enjoy using every day. '.repeat(2)}</p>`,
      '</body></html>',
    ].join('');
    const css = [
      ':root{--brand:#3b5bdb}',
      'h1{color:#3b5bdb;font-family:"Inter",sans-serif}',
      'body{background:#ffffff;color:#1f2933}',
      'a{color:#e8590c}.accent{color:#0ca678}.cta{background:#3b5bdb}',
    ].join('');

    const result = await prefetchFromHtml(html, css, 'https://acme.test/', tmpBrandDir());

    expect(result).not.toBeNull();
    expect(result?.blocked).toBe(false);
    expect(result?.thin).toBe(false);
    expect(result?.title).toContain('Acme');
    expect(result?.description).toContain('developer tools');
    expect(result?.colors.length ?? 0).toBeGreaterThan(0);
    expect(result?.fonts.some((f) => /inter/i.test(f.family))).toBe(true);
    expect((result?.headings ?? []).join(' ')).toContain('Welcome to Acme');
  });

  it('flags an anti-bot challenge page as blocked and thin', async () => {
    const html =
      '<!doctype html><html><head><title>Just a moment...</title></head>' +
      '<body><h1>Checking your browser</h1></body></html>';

    const result = await prefetchFromHtml(html, '', 'https://walled.test/', tmpBrandDir());

    expect(result).not.toBeNull();
    expect(result?.blocked).toBe(true);
    expect(result?.thin).toBe(true);
  });

  it('harvests a content-rich post-wall page that still embeds a Turnstile widget', async () => {
    // The exact symptom: the user clears the Cloudflare wall in the in-app
    // browser, the real Economist homepage renders — and that real page STILL
    // references challenges.cloudflare.com (a Turnstile widget on its
    // login/subscribe surface). The harvest must treat it as the real site, not
    // throw the whole capture away as if it were the wall.
    const nav = [
      'World', 'United States', 'China', 'Business', 'Finance', 'Europe', 'Asia', 'Culture', 'Science',
    ]
      .map((label) => `<a href="/${label.toLowerCase().replace(/\s+/g, '-')}">${label}</a>`)
      .join('');
    const html = [
      '<!doctype html><html><head>',
      '<title>The Economist</title>',
      '<meta name="description" content="Authoritative analysis and global news.">',
      '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async></script>',
      '</head><body>',
      `<header>${HEADER_SVG}${nav}</header>`,
      '<h1>World in brief</h1><h2>Shipping halted on the Strait of Hormuz</h2><h3>Our cover</h3>',
      `<p>${'The Economist offers authoritative insight on international news. '.repeat(2)}</p>`,
      '<div class="cf-turnstile" data-sitekey="abc"></div>',
      '</body></html>',
    ].join('');
    const css = [
      ':root{--brand:#e3120b}',
      'h1{color:#e3120b;font-family:"Milo",Georgia,serif}',
      'body{background:#ffffff;color:#121212}',
      'a{color:#0d6efd}.accent{color:#0ca678}.cta{background:#e3120b}',
    ].join('');

    const result = await prefetchFromHtml(html, css, 'https://www.economist.com/', tmpBrandDir());

    expect(result).not.toBeNull();
    expect(result?.blocked).toBe(false);
    expect(result?.thin).toBe(false);
    expect(result?.title).toContain('Economist');
    expect((result?.colors.length ?? 0)).toBeGreaterThan(0);
    expect((result?.headings ?? []).join(' ')).toContain('World in brief');
  });

  it('returns null for empty HTML', async () => {
    expect(await prefetchFromHtml('', '', 'https://x.test/', tmpBrandDir())).toBeNull();
  });
});

describe('isChallengePage (interstitial vs. real page that embeds a widget)', () => {
  const richNav = Array.from(
    { length: 10 },
    (_, i) => `<a href="/section-${i}">Section ${i}</a>`,
  ).join('');

  it('flags a sparse Cloudflare interstitial by its title and copy', () => {
    const html =
      '<!doctype html><html><head><title>Just a moment...</title></head>' +
      '<body><h1>Verifying you are human.</h1>' +
      '<p>This website uses a security service to protect against malicious bots.</p>' +
      '<a href="https://www.cloudflare.com">Cloudflare</a><a href="/privacy">Privacy</a>' +
      '</body></html>';
    expect(isChallengePage(html)).toBe(true);
  });

  it('flags a sparse page whose only signal is an embedded Turnstile widget', () => {
    const html =
      '<!doctype html><html><head><title>Checking</title></head>' +
      '<body><div class="cf-turnstile"></div>' +
      '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>' +
      '</body></html>';
    expect(isChallengePage(html)).toBe(true);
  });

  it('does NOT flag a content-rich page that merely embeds a Turnstile widget', () => {
    const html =
      '<!doctype html><html><head><title>The Economist</title>' +
      '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async></script>' +
      `</head><body><header>${richNav}</header>` +
      '<h1>World in brief</h1><h2>Today\'s top stories</h2><h3>Our cover</h3>' +
      '<div class="cf-turnstile" data-sitekey="x"></div>' +
      '</body></html>';
    expect(isChallengePage(html)).toBe(false);
  });

  it('does NOT flag a content-rich page that embeds a DataDome tag', () => {
    const html =
      '<!doctype html><html><head><title>Shop</title>' +
      '<script src="https://js.datadome.co/tags.js"></script>' +
      `</head><body><header>${richNav}</header>` +
      '<h1>New arrivals</h1><h2>Best sellers</h2><h3>On sale</h3>' +
      '</body></html>';
    expect(isChallengePage(html)).toBe(false);
  });

  it('still flags a definitive challenge marker even on an otherwise rich page', () => {
    const html =
      '<!doctype html><html><head><title>Site</title></head>' +
      `<body><header>${richNav}</header><h1>a</h1><h2>b</h2><h3>c</h3>` +
      '<script>window._cf_chl_opt={cvId:"3"};</script>' +
      '</body></html>';
    expect(isChallengePage(html)).toBe(true);
  });
});
