/**
 * Regression tests for Teams-safe preview document titles (issue #3918).
 *
 * When a user prints an HTML preview (Cmd+P → Save as PDF), Chromium uses
 * the iframe document's <title> as the default filename. Invoice titles
 * (and other design-template titles) can contain characters Microsoft Teams
 * rejects in filenames, making the PDF unshareable. The srcDoc build path
 * must sanitize <title> text so the resulting filename is Teams-safe.
 *
 * Teams-disallowed character set (per maintainer lefarcen, issue #3918):
 *   : # % & * { } \ < > ? / + | "
 * Plus: leading/trailing spaces, and the sequence ~$
 */
import { describe, expect, it } from 'vitest';
import {
  buildSrcdoc,
  sanitizePreviewTitle,
  sanitizeTitleInDoc,
} from '../../src/runtime/srcdoc';

// Characters that Teams rejects in filenames.
const TEAMS_DISALLOWED = /[:#%&*{}\\<>?/+|"]/;

function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m != null ? (m[1] ?? null) : null;
}

describe('sanitizePreviewTitle', () => {
  it('replaces each Teams-disallowed character with a hyphen', () => {
    // Typical invoice title with several disallowed chars
    const input = 'Invoice #INV/2025:Acme & Co';
    const result = sanitizePreviewTitle(input);

    expect(TEAMS_DISALLOWED.test(result)).toBe(false);
    expect(result).not.toMatch(/^\s|\s$/); // no leading/trailing spaces
  });

  it('handles the ~$ prefix that Teams also rejects', () => {
    const result = sanitizePreviewTitle('~$Invoice 2025');

    expect(result).not.toMatch(/^~\$/);
  });

  it('collapses consecutive replacement hyphens into one', () => {
    // "A & * B" has two consecutive disallowed chars; should not become "A---B"
    const result = sanitizePreviewTitle('A & * B');

    expect(result).not.toMatch(/--/);
  });

  it('trims leading and trailing spaces from the result', () => {
    const result = sanitizePreviewTitle('  Invoice  ');

    expect(result).toBe('Invoice');
  });

  it('leaves a title with no disallowed characters unchanged', () => {
    const clean = 'Invoice Sable Studio INV-2025-0142';

    expect(sanitizePreviewTitle(clean)).toBe(clean);
  });

  // ---------------------------------------------------------------------------
  // Defect #5 (issue #3918): leading whitespace hides the ~$ prefix from the
  // anchor-based strip, so trim must happen BEFORE the ~$ check.
  // ---------------------------------------------------------------------------

  it('strips ~$ even when leading whitespace precedes it ("  ~$Invoice #1")', () => {
    // Bug: replace(/^~\$/, '') is anchored to position 0; when the input has
    // leading spaces the anchor misses, and after .trim() the result still
    // starts with "~$".
    const result = sanitizePreviewTitle('  ~$Invoice #1');

    expect(result).not.toMatch(/^~\$/);
    expect(TEAMS_DISALLOWED.test(result)).toBe(false);
    expect(result).not.toMatch(/^\s|\s$/);
  });

  it('strips ~$ when a space follows the prefix ("~$ Invoice")', () => {
    // After stripping "~$" the remaining " Invoice" must also be trimmed so
    // no leading space survives.
    const result = sanitizePreviewTitle('~$ Invoice');

    expect(result).not.toMatch(/^~\$/);
    expect(result).not.toMatch(/^\s/);
  });

  it('strips a doubled ~$ prefix ("~$~$Doc")', () => {
    // A doubled prefix must be fully removed; a single strip leaves "~$Doc".
    const result = sanitizePreviewTitle('~$~$Doc');

    expect(result).not.toMatch(/^~\$/);
  });

  it('replaces all chars from the full disallowed set', () => {
    // Build a string that has every disallowed char
    const allDisallowed = ':#%&*{}\\<>?/+|"';
    const result = sanitizePreviewTitle('A' + allDisallowed + 'B');

    expect(TEAMS_DISALLOWED.test(result)).toBe(false);
    expect(result).toContain('A');
    expect(result).toContain('B');
  });
});

describe('buildSrcdoc – Teams-safe title', () => {
  it('sanitizes <title> in the srcDoc output so printed PDFs have Teams-safe filenames', () => {
    // Simulate an invoice template title that contains Teams-disallowed chars.
    // This is the real-world shape from design-templates/invoice/example.html.
    const invoiceHtml = `<!doctype html>
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

    const result = buildSrcdoc(invoiceHtml);

    const title = extractTitle(result);
    expect(title).not.toBeNull();
    // The title must not contain any Teams-disallowed characters.
    expect(TEAMS_DISALLOWED.test(title!)).toBe(false);
    // The visible page body content must be unchanged.
    expect(result).toContain('Acme &amp; Co');
    expect(result).toContain('INV/2025');
  });

  it('does not alter titles that are already Teams-safe', () => {
    const html = `<!doctype html>
<html>
  <head><title>Invoice Sable Studio INV-2025-0142</title></head>
  <body><p>Content</p></body>
</html>`;

    const result = buildSrcdoc(html);
    const title = extractTitle(result);

    expect(title).toBe('Invoice Sable Studio INV-2025-0142');
  });

  it('handles HTML entities in title text (decodes before sanitizing)', () => {
    // &amp; is "&" which is disallowed. The sanitizer must decode then sanitize.
    const html = `<!doctype html>
<html>
  <head><title>Invoice &amp; Receipt</title></head>
  <body><p>Content</p></body>
</html>`;

    const result = buildSrcdoc(html);
    const title = extractTitle(result);

    expect(title).not.toBeNull();
    expect(TEAMS_DISALLOWED.test(title!)).toBe(false);
    // Must not expose the literal &amp; or & in the title
    expect(title).not.toContain('&');
  });
});

// ---------------------------------------------------------------------------
// Defect #2: decodeHtmlEntitiesForTitle must not throw on out-of-range entities
// ---------------------------------------------------------------------------
describe('decodeHtmlEntitiesForTitle – out-of-range numeric entities', () => {
  it('does not throw on a decimal numeric entity beyond Unicode range (&#9999999999;)', () => {
    // Out-of-range code point — String.fromCodePoint throws RangeError without
    // the fix. buildSrcdoc must succeed and produce a Teams-safe title.
    const html = `<!doctype html>
<html>
  <head><title>Invoice &#9999999999; Report</title></head>
  <body><p>Content</p></body>
</html>`;

    expect(() => buildSrcdoc(html)).not.toThrow();
    const result = buildSrcdoc(html);
    const title = extractTitle(result);
    expect(title).not.toBeNull();
    // The entity itself should have been replaced by a fallback (original text or U+FFFD),
    // not left as a raw code-point that would crash the filename logic.
    expect(TEAMS_DISALLOWED.test(title!)).toBe(false);
  });

  it('does not throw on a hex numeric entity beyond Unicode range (&#x110000;)', () => {
    const html = `<!doctype html>
<html>
  <head><title>Doc &#x110000; End</title></head>
  <body></body>
</html>`;

    expect(() => buildSrcdoc(html)).not.toThrow();
    const result = buildSrcdoc(html);
    const title = extractTitle(result);
    expect(title).not.toBeNull();
    expect(TEAMS_DISALLOWED.test(title!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Defect #3: named non-ASCII entities must not leave orphaned `name;` remnants
// ---------------------------------------------------------------------------
describe('sanitizeTitleInDoc – named non-ASCII entities', () => {
  it('does not leave orphaned entity text when a named non-ASCII entity is in the title', () => {
    // &ccedil; is ç. Before the fix: "&" is stripped, leaving literal "ccedil;"
    // in the title. After the fix: ç should appear (or be decoded then sanitized).
    const html = `<!doctype html>
<html>
  <head><title>Fran&ccedil;ois Invoice</title></head>
  <body></body>
</html>`;

    const result = sanitizeTitleInDoc(html);
    const title = extractTitle(result);
    expect(title).not.toBeNull();
    // The word "ccedil;" must not appear literally in the title
    expect(title).not.toContain('ccedil;');
    // The title should still contain "ois Invoice" (the non-entity parts)
    expect(title).toContain('ois Invoice');
  });

  it('handles &eacute; without leaving orphaned entity text', () => {
    const html = `<!doctype html>
<html>
  <head><title>R&eacute;sum&eacute; 2025</title></head>
  <body></body>
</html>`;

    const result = sanitizeTitleInDoc(html);
    const title = extractTitle(result);
    expect(title).not.toBeNull();
    expect(title).not.toContain('eacute;');
  });
});

// ---------------------------------------------------------------------------
// Defect #4: sanitizeTitleInDoc must not match <title> inside comments or scripts
// ---------------------------------------------------------------------------
describe('sanitizeTitleInDoc – only rewrites the real <head> title', () => {
  it('does not treat a <title> inside an HTML comment as the document title', () => {
    // The comment's <title> must not be matched; only the real <head><title> is changed.
    const html = `<!doctype html>
<html>
  <head>
    <!-- <title>Fake Title &amp; Bad</title> -->
    <title>Real Invoice Title</title>
  </head>
  <body></body>
</html>`;

    const result = sanitizeTitleInDoc(html);
    // The real title must still be present and unchanged (it's already safe)
    expect(result).toContain('<title>Real Invoice Title</title>');
    // The comment content must be unchanged
    expect(result).toContain('<!-- <title>Fake Title &amp; Bad</title> -->');
  });

  it('does not treat a <title> inside a <script> string as the document title', () => {
    const html = `<!doctype html>
<html>
  <head>
    <script>var x = '<title>Script Title & Broken</title>';</script>
    <title>Real Safe Title</title>
  </head>
  <body></body>
</html>`;

    const result = sanitizeTitleInDoc(html);
    // Real title must still be there (already safe, so unchanged)
    expect(result).toContain('<title>Real Safe Title</title>');
    // Script content must not have been mutated
    expect(result).toContain("var x = '<title>Script Title & Broken</title>';");
  });
});
