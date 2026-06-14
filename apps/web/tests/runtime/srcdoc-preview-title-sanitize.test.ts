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
import { buildSrcdoc, sanitizePreviewTitle } from '../../src/runtime/srcdoc';

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
