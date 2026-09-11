// Shared project-local dependency reference extraction.
//
// Used by both MCP artifact bundling and public-file publishing so the two
// surfaces agree on which local files belong to an HTML/CSS/JS artifact.
//
// This intentionally returns project-relative logical paths only. External,
// data, fragment and project-root-escaping references are not returned.

// Patterns common to HTML and CSS.
const HTML_REF_PATTERNS = [
  /<script\b[^>]*\bsrc=["']([^"']+)["']/gi,
  /<link\b[^>]*\bhref=["']([^"']+)["']/gi,
  /<img\b[^>]*\bsrc=["']([^"']+)["']/gi,
  /<source\b[^>]*\bsrc=["']([^"']+)["']/gi,
  /<video\b[^>]*\bsrc=["']([^"']+)["']/gi,
  /<audio\b[^>]*\bsrc=["']([^"']+)["']/gi,
  /<iframe\b[^>]*\bsrc=["']([^"']+)["']/gi,
];

const CSS_REF_PATTERNS = [
  /\burl\(\s*["']?([^"')]+)["']?\s*\)/gi,
  /@import\s+(?:url\()?\s*["']([^"')]+)["']/gi,
];

// JS/TS only - running these on prose creates false positives on words
// like "imported from 'X'".
const JS_REF_PATTERNS = [
  /\bimport\s+[^'"]*?['"]([^'"]+)['"]/g,
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
];

// `srcset` can list multiple comma-separated candidates.
const SRCSET_PATTERN = /\bsrcset=["']([^"']+)["']/gi;

function isJsLike(mime: string | undefined, fromPath: string): boolean {
  if (mime && /javascript|typescript/i.test(mime)) return true;
  return /\.(?:m?jsx?|tsx?|cjs)$/i.test(fromPath);
}

function isCssLike(mime: string | undefined, fromPath: string): boolean {
  if (mime && /^text\/css\b/i.test(mime)) return true;
  return /\.css$/i.test(fromPath);
}

function isHtmlLike(mime: string | undefined, fromPath: string): boolean {
  if (mime && /^text\/html\b/i.test(mime)) return true;
  return /\.html?$/i.test(fromPath);
}

export function referenceMimeForPath(filePath: string): string | null {
  if (/\.html?$/i.test(filePath)) return 'text/html';
  if (/\.css$/i.test(filePath)) return 'text/css';
  if (/\.tsx?$/i.test(filePath)) {
    return 'application/typescript';
  }
  if (/\.(?:m?jsx?|cjs)$/i.test(filePath)) return 'application/javascript';
  if (/\.svg$/i.test(filePath)) return 'image/svg+xml';
  return null;
}

export function extractRelativeRefs(
  text: string,
  fromPath: string,
  fromMime: string,
): string[] {
  if (!text) return [];

  const refs = new Set<string>();
  const runPatterns: RegExp[] = [];

  if (isHtmlLike(fromMime, fromPath)) {
    runPatterns.push(...HTML_REF_PATTERNS, ...CSS_REF_PATTERNS);
  }
  if (isCssLike(fromMime, fromPath)) {
    runPatterns.push(...CSS_REF_PATTERNS);
  }
  if (isJsLike(fromMime, fromPath)) {
    runPatterns.push(...JS_REF_PATTERNS);
  }

  // Fallback for unknown textual files: only the safest pattern,
  // url() in case it's CSS-in-something we don't recognize.
  if (runPatterns.length === 0) {
    runPatterns.push(...CSS_REF_PATTERNS);
  }

  const candidates: string[] = [];

  for (const re of runPatterns) {
    for (const match of text.matchAll(re)) {
      const ref = (match[1] || '').trim();
      if (ref) candidates.push(ref);
    }
  }

  if (isHtmlLike(fromMime, fromPath)) {
    for (const match of text.matchAll(SRCSET_PATTERN)) {
      const list = match[1] || '';
      for (const part of list.split(',')) {
        const url = part.trim().split(/\s+/)[0];
        if (url) candidates.push(url);
      }
    }
  }

  for (const raw of candidates) {
    if (/^(?:https?:|\/\/|data:|mailto:|tel:|#)/i.test(raw)) continue;

    const dir = fromPath.includes('/')
      ? fromPath.slice(0, fromPath.lastIndexOf('/') + 1)
      : '';

    const resolved = raw.startsWith('/') ? raw.slice(1) : dir + raw;
    const stripped = resolved.replace(/[?#].*$/, '');
    const segments = stripped.split('/').filter(Boolean);

    const out: string[] = [];
    let escaped = false;

    for (const segment of segments) {
      if (segment === '.') continue;

      if (segment === '..') {
        if (out.length === 0) {
          escaped = true;
          break;
        }
        out.pop();
        continue;
      }

      out.push(segment);
    }

    if (escaped || out.length === 0) continue;
    refs.add(out.join('/'));
  }

  return [...refs];
}
