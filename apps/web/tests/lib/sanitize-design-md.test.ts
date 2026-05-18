import { describe, expect, it } from 'vitest';

import { isDesignMdFileName, sanitizeDesignMdImport } from '../../src/lib/sanitize-design-md';

describe('sanitizeDesignMdImport', () => {
  it('accepts plain markdown', () => {
    const result = sanitizeDesignMdImport('# Brand\n\nUse blue.');
    expect(result.content).toContain('Brand');
    expect(result.warnings).toEqual([]);
  });

  it('strips script tags and reports a warning', () => {
    const result = sanitizeDesignMdImport('# Safe\n<script>alert(1)</script>\n## Tokens');
    expect(result.content).not.toContain('<script');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('rejects binary content', () => {
    expect(() => sanitizeDesignMdImport('hello\0world')).toThrow(/binary/i);
  });
});

describe('isDesignMdFileName', () => {
  it('matches markdown extensions', () => {
    expect(isDesignMdFileName('DESIGN.md')).toBe(true);
    expect(isDesignMdFileName('notes.txt')).toBe(false);
  });
});
