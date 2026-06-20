import { describe, expect, it } from 'vitest';
import { createDesignTokenEvidenceCollector } from '../src/design-tokens';

describe('design-tokens extractor (contracts, pure)', () => {
  it('records a Windows-path basename in usage without node:path', () => {
    const c = createDesignTokenEvidenceCollector();
    c.scanText({ text: 'a{color:#3b82f6}', file: 'C:\\proj\\src\\hero.css' });
    const report = c.toReport({ warnings: [], endedAt: '' });
    expect(report.colors[0]?.usage).toContain('hero.css');
  });

  it('records a POSIX-path basename in usage', () => {
    const c = createDesignTokenEvidenceCollector();
    c.scanText({ text: 'a{color:#3b82f6}', file: 'proj/src/hero.css' });
    const report = c.toReport({ warnings: [], endedAt: '' });
    expect(report.colors[0]?.usage).toContain('hero.css');
  });
});
