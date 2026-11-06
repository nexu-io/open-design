// Pure text-processing helpers for the clipper's HTML resource inlining,
// split out of background.js (a classic service worker loaded via
// importScripts) so they can run under a plain test runner. background.js
// does `importScripts('inline.js')` and these become worker globals.

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// HTML serialization escapes "&" as "&amp;" inside attribute values, while
// occurrences outside attributes keep the raw form. Both spellings must
// resolve to the same data URI.
function htmlEscapeAmpersands(text) {
  return text.replace(/&/g, '&amp;');
}

/**
 * Replace every resource URL in `map` (raw url → data URI) with its data URI.
 *
 * (#9265) Two defects in the previous per-URL `split(url).join(data)` pass:
 *   1. a shorter URL that is a prefix of a longer one (cache-busting variants
 *      like "…/x.png" and "…/x.png?v=2") shadowed the longer URL — the
 *      shorter replacement corrupted the longer attribute, and the longer
 *      URL's own pass then matched nothing, leaving a hybrid that renders
 *      the wrong image;
 *   2. URLs containing "&" were serialized in attributes as "&amp;" and the
 *      raw-form search never matched — those resources silently stayed live
 *      even though their bytes had been fetched and counted against the
 *      inline budget.
 *
 * The replacement is now a single pass over one alternation of every mapped
 * URL — raw and attribute-escaped forms, longest spelling first — so the
 * longest spelling wins at each position and both escape forms resolve.
 * Replacement output is never rescanned (String.replace with a /g pattern
 * continues after each substituted span).
 */
function inlineHtml(html, map) {
  if (!html || !map || map.size === 0) return html;
  const replacements = [];
  for (const [url, data] of map) {
    if (!url) continue;
    replacements.push([url, data]);
    replacements.push([htmlEscapeAmpersands(url), data]);
  }
  replacements.sort((a, b) => b[0].length - a[0].length);
  const pattern = new RegExp(
    replacements.map(([url]) => escapeRegExp(url)).join('|'),
    'g',
  );
  const lookup = new Map(replacements);
  return html.replace(pattern, (matched) => lookup.get(matched) ?? matched);
}

// Test-only escape hatch: the worker loads this file via importScripts,
// where these become globals; the test runner imports the module instead.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { inlineHtml, escapeRegExp, htmlEscapeAmpersands };
}
