/**
 * Regression tests for daemon-side Teams-safe URL-load preview title sanitization
 * (issue #3918).
 *
 * The daemon's /api/projects/:id/raw/:file handler serves static HTML previews
 * (e.g. design-templates/invoice/example.html) to the URL-load iframe. Because
 * that iframe uses sandbox="allow-scripts allow-downloads" without allow-same-origin,
 * the host page cannot access contentDocument.title after load. The daemon therefore
 * must rewrite <title> in the HTTP response body before the browser parses it.
 *
 * daemonSanitizeTitleInDoc (exported from routes/project/index.ts) is the function
 * that does this. It mirrors sanitizeTitleInDoc in apps/web/src/runtime/srcdoc.ts.
 *
 * Teams-disallowed character set (per maintainer lefarcen, issue #3918):
 *   : # % & * { } \ < > ? / + | "
 * Plus: leading/trailing spaces, and the sequence ~$
 */
import { describe, expect, it } from 'vitest';
import { daemonSanitizeTitleInDoc } from '../src/routes/project/index.js';

// Characters that Microsoft Teams rejects in filenames.
const TEAMS_DISALLOWED = /[:#%&*{}\\<>?/+|"]/;

/** Extract the text content of the first <title> tag in an HTML string. */
function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m != null ? (m[1] ?? null) : null;
}

// ---------------------------------------------------------------------------
// Core sanitization: Teams-disallowed characters are replaced in <title>
// ---------------------------------------------------------------------------
describe('daemonSanitizeTitleInDoc – Teams-disallowed characters', () => {
  it('replaces Teams-disallowed chars in a typical invoice title', () => {
    // Covers the reported repro: "Invoice #INV/2025:Acme & Co"
    const html = `<!doctype html>
<html>
  <head>
    <title>Invoice #INV/2025:Acme &amp; Co</title>
  </head>
  <body>
    <h1>Invoice</h1>
    <p>Client: Acme &amp; Co</p>
    <p>Invoice: INV/2025</p>
  </body>
</html>`;

    const result = daemonSanitizeTitleInDoc(html);
    const title = extractTitle(result);

    expect(title).not.toBeNull();
    // No Teams-disallowed character may appear in the rewritten title.
    expect(TEAMS_DISALLOWED.test(title!)).toBe(false);
    // No leading or trailing space.
    expect(title).not.toMatch(/^\s|\s$/);
    // Body content outside <title> must be left exactly as-is.
    expect(result).toContain('Acme &amp; Co');
    expect(result).toContain('INV/2025');
  });

  it('replaces every character from the full Teams-disallowed set', () => {
    const allDisallowed = ':#%&*{}\\<>?/+|"';
    const html = `<!doctype html>
<html>
  <head><title>A${allDisallowed}B</title></head>
  <body></body>
</html>`;

    const result = daemonSanitizeTitleInDoc(html);
    const title = extractTitle(result);

    expect(title).not.toBeNull();
    expect(TEAMS_DISALLOWED.test(title!)).toBe(false);
    expect(title).toContain('A');
    expect(title).toContain('B');
  });

  it('leaves an already-safe title unchanged', () => {
    const html = `<!doctype html>
<html>
  <head><title>Invoice Sable Studio INV-2025-0142</title></head>
  <body><p>Content</p></body>
</html>`;

    const result = daemonSanitizeTitleInDoc(html);
    const title = extractTitle(result);

    expect(title).toBe('Invoice Sable Studio INV-2025-0142');
  });

  // ---------------------------------------------------------------------------
  // Defect #5 (issue #3918): leading whitespace hides the ~$ prefix from the
  // anchor-based strip, so trim must happen BEFORE the ~$ check.
  // ---------------------------------------------------------------------------

  it('strips ~$ even when leading whitespace precedes it ("  ~$Invoice #1")', () => {
    // Bug: replace(/^~\$/, '') is anchored to position 0; when the title has
    // leading spaces the anchor misses, and after .trim() the result still
    // starts with "~$".
    const html = `<!doctype html>
<html>
  <head><title>  ~$Invoice #1</title></head>
  <body></body>
</html>`;

    const result = daemonSanitizeTitleInDoc(html);
    const title = extractTitle(result);

    expect(title).not.toBeNull();
    expect(title).not.toMatch(/^~\$/);
    expect(TEAMS_DISALLOWED.test(title!)).toBe(false);
    expect(title).not.toMatch(/^\s|\s$/);
  });

  it('strips ~$ when a space follows the prefix ("~$ Invoice")', () => {
    // After stripping "~$" the remaining " Invoice" must also be trimmed so
    // no leading space survives.
    const html = `<!doctype html>
<html>
  <head><title>~$ Invoice</title></head>
  <body></body>
</html>`;

    const result = daemonSanitizeTitleInDoc(html);
    const title = extractTitle(result);

    expect(title).not.toBeNull();
    expect(title).not.toMatch(/^~\$/);
    expect(title).not.toMatch(/^\s/);
  });

  it('strips a doubled ~$ prefix ("~$~$Doc")', () => {
    // A doubled prefix must be fully removed; a single strip would leave "~$Doc".
    const html = `<!doctype html>
<html>
  <head><title>~$~$Doc</title></head>
  <body></body>
</html>`;

    const result = daemonSanitizeTitleInDoc(html);
    const title = extractTitle(result);

    expect(title).not.toBeNull();
    expect(title).not.toMatch(/^~\$/);
  });

  it('leaves body content outside <title> completely unchanged', () => {
    const html = `<!doctype html>
<html>
  <head><title>Safe Title</title></head>
  <body>
    <p>Invoice #INV/2025:Acme &amp; Co</p>
  </body>
</html>`;

    const result = daemonSanitizeTitleInDoc(html);
    // Body paragraph must not have been touched.
    expect(result).toContain('<p>Invoice #INV/2025:Acme &amp; Co</p>');
    // Title is safe.
    expect(TEAMS_DISALLOWED.test(extractTitle(result)!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Defect #2: out-of-range numeric entities must not throw
// ---------------------------------------------------------------------------
describe('daemonSanitizeTitleInDoc – out-of-range numeric entities', () => {
  it('does not throw on a decimal numeric entity beyond the Unicode range (&#9999999999;)', () => {
    // String.fromCodePoint throws RangeError for values > 0x10FFFF without the
    // safeFromCodePoint guard. This test would crash before the fix.
    const html = `<!doctype html>
<html>
  <head><title>Invoice &#9999999999; Report</title></head>
  <body></body>
</html>`;

    expect(() => daemonSanitizeTitleInDoc(html)).not.toThrow();
    const result = daemonSanitizeTitleInDoc(html);
    const title = extractTitle(result);
    expect(title).not.toBeNull();
    expect(TEAMS_DISALLOWED.test(title!)).toBe(false);
  });

  it('does not throw on a hex numeric entity beyond the Unicode range (&#x110000;)', () => {
    const html = `<!doctype html>
<html>
  <head><title>Doc &#x110000; End</title></head>
  <body></body>
</html>`;

    expect(() => daemonSanitizeTitleInDoc(html)).not.toThrow();
    const result = daemonSanitizeTitleInDoc(html);
    const title = extractTitle(result);
    expect(title).not.toBeNull();
    expect(TEAMS_DISALLOWED.test(title!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Defect #3: named non-ASCII entities must not leave orphaned `name;` remnants
// ---------------------------------------------------------------------------
describe('daemonSanitizeTitleInDoc – named non-ASCII entities', () => {
  it('does not leave orphaned entity text when &ccedil; appears in the title', () => {
    // Before the fix: "&" is stripped first, leaving the literal string "ccedil;"
    // in the title. After the fix: &ccedil; is decoded to ç before sanitizing.
    const html = `<!doctype html>
<html>
  <head><title>Fran&ccedil;ois Invoice</title></head>
  <body></body>
</html>`;

    const result = daemonSanitizeTitleInDoc(html);
    const title = extractTitle(result);

    expect(title).not.toBeNull();
    // The literal "ccedil;" must not appear in the output title.
    expect(title).not.toContain('ccedil;');
    // The non-entity parts of the title must still be present.
    expect(title).toContain('ois Invoice');
  });

  it('does not leave orphaned entity text for &eacute;', () => {
    const html = `<!doctype html>
<html>
  <head><title>R&eacute;sum&eacute; 2025</title></head>
  <body></body>
</html>`;

    const result = daemonSanitizeTitleInDoc(html);
    const title = extractTitle(result);

    expect(title).not.toBeNull();
    expect(title).not.toContain('eacute;');
  });
});

// ---------------------------------------------------------------------------
// Defect #4: only the real <head> title must be rewritten; not imposters in
// comments or <script> blocks
// ---------------------------------------------------------------------------
describe('daemonSanitizeTitleInDoc – only rewrites the real <head> title', () => {
  it('does not treat a <title> inside an HTML comment as the document title', () => {
    // The comment appears before the real <title>. Without the fix the comment's
    // <title> would be matched first and the real title would be left unsanitized.
    const html = `<!doctype html>
<html>
  <head>
    <!-- <title>Fake Title &amp; Bad</title> -->
    <title>Real Invoice Title</title>
  </head>
  <body></body>
</html>`;

    const result = daemonSanitizeTitleInDoc(html);

    // The real title must still be present and unaltered (it is already safe).
    expect(result).toContain('<title>Real Invoice Title</title>');
    // The comment content must be untouched.
    expect(result).toContain('<!-- <title>Fake Title &amp; Bad</title> -->');
  });

  it('does not treat a <title> inside a <script> string as the document title', () => {
    const html = `<!doctype html>
<html>
  <head>
    <script>var x = '<title>Script Title &amp; Broken</title>';</script>
    <title>Real Safe Title</title>
  </head>
  <body></body>
</html>`;

    const result = daemonSanitizeTitleInDoc(html);

    // Real title must still be there (already safe, so unchanged).
    expect(result).toContain('<title>Real Safe Title</title>');
    // Script content must not have been mutated.
    expect(result).toContain("var x = '<title>Script Title &amp; Broken</title>';");
  });

  it('returns html unchanged when there is no <title> element', () => {
    const html = `<!doctype html>
<html>
  <head></head>
  <body><p>No title here</p></body>
</html>`;

    const result = daemonSanitizeTitleInDoc(html);
    expect(result).toBe(html);
  });
});
