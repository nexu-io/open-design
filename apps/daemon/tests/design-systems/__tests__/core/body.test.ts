import { describe, expect, it } from 'vitest';

import {
  buildDraftDesignSystemBody,
  cleanMultiline,
  cleanText,
  cleanTitle,
  escapeHtml,
  escapeJsString,
  escapeTsxText,
  extractCategory,
  extractMarkdownSections,
  extractSurface,
  firstHeading,
  isDesignSystemArtifactMode,
  isDesignSystemRevisionStatus,
  isDesignSystemStatus,
  isDesignSystemSurface,
  normalizeBody,
  normalizeHex,
  normalizeTitle,
  parseStringList,
  pickSwatchRow,
  scriptJson,
  slugify,
  summarize,
  uniqueCleanList,
  upsertBlockquoteMeta,
  withDesignSystemHeader,
} from '../../../../src/design-systems/core/body.js';

describe('type guards', () => {
  it('isDesignSystemSurface', () => {
    expect(isDesignSystemSurface('web')).toBe(true);
    expect(isDesignSystemSurface('image')).toBe(true);
    expect(isDesignSystemSurface('video')).toBe(true);
    expect(isDesignSystemSurface('audio')).toBe(true);
    expect(isDesignSystemSurface('print')).toBe(false);
    expect(isDesignSystemSurface(undefined)).toBe(false);
    expect(isDesignSystemSurface('')).toBe(false);
  });

  it('isDesignSystemStatus', () => {
    expect(isDesignSystemStatus('draft')).toBe(true);
    expect(isDesignSystemStatus('published')).toBe(true);
    expect(isDesignSystemStatus('archived')).toBe(false);
    expect(isDesignSystemStatus(undefined)).toBe(false);
  });

  it('isDesignSystemRevisionStatus', () => {
    expect(isDesignSystemRevisionStatus('pending')).toBe(true);
    expect(isDesignSystemRevisionStatus('accepted')).toBe(true);
    expect(isDesignSystemRevisionStatus('rejected')).toBe(true);
    expect(isDesignSystemRevisionStatus('open')).toBe(false);
    expect(isDesignSystemRevisionStatus(undefined)).toBe(false);
  });

  it('isDesignSystemArtifactMode', () => {
    expect(isDesignSystemArtifactMode('generated')).toBe(true);
    expect(isDesignSystemArtifactMode('agent-managed')).toBe(true);
    expect(isDesignSystemArtifactMode('manual')).toBe(false);
    expect(isDesignSystemArtifactMode(42)).toBe(false);
    expect(isDesignSystemArtifactMode(null)).toBe(false);
  });
});

describe('text utilities', () => {
  it('cleanText collapses whitespace', () => {
    expect(cleanText('  hello   world  ')).toBe('hello world');
    expect(cleanText(undefined)).toBe('');
    expect(cleanText('')).toBe('');
  });

  it('cleanMultiline normalises line endings and collapses blank lines', () => {
    expect(cleanMultiline('a\r\nb\r\nc')).toBe('a\nb\nc');
    expect(cleanMultiline('a\n\n\n\nb')).toBe('a\n\nb');
    expect(cleanMultiline(undefined)).toBe('');
  });

  it('normalizeTitle returns fallback for blank', () => {
    expect(normalizeTitle('  Acme  ')).toBe('Acme');
    expect(normalizeTitle('')).toBe('Untitled Design System');
    expect(normalizeTitle(undefined)).toBe('Untitled Design System');
  });

  it('slugify produces lowercase dash-separated ASCII', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('Café & Bistro')).toBe('cafe-bistro');
    expect(slugify('')).toBe('design-system');
    expect(slugify('---')).toBe('design-system');
    const long = 'a'.repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(64);
  });

  it('cleanTitle strips boilerplate prefix', () => {
    expect(cleanTitle('Design System Inspired by Cohere')).toBe('Cohere');
    expect(cleanTitle('Design System for Stripe')).toBe('Stripe');
    expect(cleanTitle('Acme Design')).toBe('Acme Design');
  });

  it('parseStringList deduplicates and trims', () => {
    expect(parseStringList(['a', ' a ', 'b'])).toEqual(['a', 'b']);
    expect(parseStringList([])).toBeUndefined();
    expect(parseStringList('not-array')).toBeUndefined();
    expect(parseStringList([1, 2])).toBeUndefined();
  });

  it('uniqueCleanList deduplicates up to 100 entries', () => {
    const result = uniqueCleanList(['x', 'x', 'y', '']);
    expect(result).toEqual(['x', 'y']);
    const big = Array.from({ length: 150 }, (_, i) => `item${i}`);
    expect(uniqueCleanList(big).length).toBe(100);
  });
});

describe('body utilities', () => {
  it('normalizeBody trims and appends newline', () => {
    expect(normalizeBody('  hello  ')).toBe('hello\n');
    expect(normalizeBody('')).toBeNull();
    expect(normalizeBody('   ')).toBeNull();
    expect(normalizeBody(undefined)).toBeNull();
  });

  it('firstHeading extracts # heading text', () => {
    expect(firstHeading('# Acme\n\nParagraph')).toBe('Acme');
    expect(firstHeading('No heading here')).toBeNull();
    expect(firstHeading('## Subheading')).toBeNull();
  });

  it('upsertBlockquoteMeta updates existing key', () => {
    const body = '# Title\n> Category: Old\n\nBody';
    expect(upsertBlockquoteMeta(body, 'Category', 'New')).toContain('> Category: New');
    expect(upsertBlockquoteMeta(body, 'Category', 'New')).not.toContain('> Category: Old');
  });

  it('upsertBlockquoteMeta inserts after H1 when absent', () => {
    const body = '# Title\n\nBody text';
    const result = upsertBlockquoteMeta(body, 'Surface', 'web');
    expect(result).toContain('> Surface: web');
    expect(result.indexOf('# Title')).toBeLessThan(result.indexOf('> Surface: web'));
  });

  it('withDesignSystemHeader upserts title, category, and surface', () => {
    const body = '# Old Title\n\nContent';
    const result = withDesignSystemHeader(body, { title: 'New', category: 'Custom', surface: 'image' });
    expect(result).toContain('# New');
    expect(result).toContain('> Category: Custom');
    expect(result).toContain('> Surface: image');
    expect(result.endsWith('\n')).toBe(true);
  });

  it('buildDraftDesignSystemBody produces 9 sections', () => {
    const body = buildDraftDesignSystemBody({ title: 'Test', category: 'Custom', surface: 'web' });
    expect(body).toContain('# Test');
    expect(body).toContain('## 9. Anti-patterns');
    expect(body).toContain('> Category: Custom');
    expect(body).toContain('> Surface: web');
  });
});

describe('markdown analysis', () => {
  it('summarize returns first paragraph after H1', () => {
    const body = '# Title\n\n> Category: X\n\nThis is the summary.\n\n## Section\n\nMore content.';
    expect(summarize(body)).toBe('This is the summary.');
  });

  it('summarize returns empty string when no H1', () => {
    expect(summarize('No heading')).toBe('');
  });

  it('extractCategory parses blockquote field', () => {
    expect(extractCategory('> Category: Custom\n\nBody')).toBe('Custom');
    expect(extractCategory('No category')).toBeUndefined();
  });

  it('extractSurface validates against known values', () => {
    expect(extractSurface('> Surface: image')).toBe('image');
    expect(extractSurface('> Surface: unknown')).toBeUndefined();
    expect(extractSurface('No surface')).toBeUndefined();
  });

  it('extractMarkdownSections splits on ## headings', () => {
    const body = '# Title\n\n## Color\n\nColor body.\n\n## Typography\n\nType body.';
    const sections = extractMarkdownSections(body);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.title).toBe('Color');
    expect(sections[0]?.body).toBe('Color body.');
    expect(sections[1]?.title).toBe('Typography');
  });

  it('extractMarkdownSections strips leading numeric prefix from titles', () => {
    const body = '## 1. Color\n\nBody.';
    const sections = extractMarkdownSections(body);
    expect(sections[0]?.title).toBe('Color');
  });
});

describe('color / swatch extraction', () => {
  it('normalizeHex expands 3-digit hex', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('#AABBCC')).toBe('#aabbcc');
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex('#xyz')).toBeNull();
    expect(normalizeHex('')).toBeNull();
  });

  it('pickSwatchRow fills all 4 slots from semantic names', () => {
    const colors = [
      { name: 'page background', value: '#ffffff' },
      { name: 'border', value: '#e0e0e0' },
      { name: 'foreground', value: '#111111' },
      { name: 'accent', value: '#0070f3' },
    ];
    const result = pickSwatchRow(colors);
    expect(result.values).toHaveLength(4);
    expect(result.filledAllSlots).toBe(true);
    expect(result.values[0]).toBe('#ffffff'); // background
    expect(result.values[3]).toBe('#0070f3'); // accent
  });

  it('pickSwatchRow applies fallbacks when semantic hints miss', () => {
    const colors = [{ name: 'mystery', value: '#ff6600' }];
    const result = pickSwatchRow(colors);
    expect(result.filledAllSlots).toBe(false);
    expect(result.values[3]).toBe('#ff6600'); // accent fallback to non-neutral
  });
});

describe('HTML escape helpers', () => {
  it('escapeHtml escapes the five special characters', () => {
    expect(escapeHtml('<script>&"\'</script>')).toBe('&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;');
  });

  it('scriptJson Unicode-escapes <, >, and &', () => {
    const result = scriptJson('<hello> & "world"');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('&');
    expect(result).toContain('\\u003c');
  });

  it('escapeTsxText strips JSX-unsafe characters', () => {
    expect(escapeTsxText('{title} <name>')).toBe('title name');
  });

  it('escapeJsString escapes backslashes and single quotes', () => {
    expect(escapeJsString("it's")).toBe("it\\'s");
    expect(escapeJsString('a\\b')).toBe('a\\\\b');
    expect(escapeJsString("no specials")).toBe('no specials');
  });
});
