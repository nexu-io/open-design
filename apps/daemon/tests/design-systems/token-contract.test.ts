import { describe, expect, it } from 'vitest';

import {
  buildDesignTokenContract,
  validateDesignTokenOutputs,
} from '../../src/design-systems/token-contract.js';

describe('design token contract builder', () => {
  it('maps source evidence into TOKEN_SCHEMA without emitting source aliases', () => {
    const contract = buildDesignTokenContract({
      generatedAt: new Date('2026-05-18T09:00:00.000Z'),
      sourceTokens: [
        { name: '--color-primary', value: '#ff3366', source: 'src/tokens.css', line: 2 },
        { name: '--color-background', value: '#101014', source: 'src/tokens.css', line: 3 },
        { name: '--radius-card', value: '12px', source: 'src/tokens.css', line: 4 },
        { name: '--color-broken', value: 'var(--source-only)', source: 'src/tokens.css', line: 5 },
      ],
    });

    expect(contract.tokensCss).toContain('--accent: #ff3366;');
    expect(contract.tokensCss).toContain('--bg: #101014;');
    expect(contract.tokensCss).toContain('--radius-md: 12px;');
    expect(contract.tokensCss).not.toContain('--color-primary');
    expect(contract.tokensCss).not.toContain('var(--source-only)');
    expect(contract.report.selfCheck.ok).toBe(true);
    expect(contract.report.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '--accent',
          confidence: 'medium',
          sourceName: '--color-primary',
          sources: ['src/tokens.css:2'],
        }),
        expect.objectContaining({
          name: '--surface-warm',
          confidence: 'alias',
          value: 'var(--surface)',
        }),
      ]),
    );
  });

  it('checks fixture references against the final schema declarations', () => {
    const contract = buildDesignTokenContract({ sourceTokens: [] });

    expect(validateDesignTokenOutputs({
      tokensCss: contract.tokensCss,
      fixtureHtml: '<style>.ok { color: var(--accent); }</style>',
    })).toMatchObject({ ok: true, errors: [] });

    expect(validateDesignTokenOutputs({
      tokensCss: contract.tokensCss,
      fixtureHtml: '<style>.bad { color: var(--source-accent); }</style>',
    })).toMatchObject({
      ok: false,
      errors: ['components.html references undeclared token --source-accent'],
    });
  });

  it('rejects self-referential theme tokens and prefers concrete schema declarations', () => {
    const contract = buildDesignTokenContract({
      sourceTokens: [
        { name: '--font-display', value: 'var(--font-display)', source: 'tailwind-v4.css', line: 2 },
        { name: '--radius-md', value: 'var(--radius-md)', source: 'tailwind-v4.css', line: 3 },
        { name: '--focus-ring', value: 'var(--focus-ring)', source: 'tailwind-v4.css', line: 4 },
        { name: '--font-display', value: '"Inter", sans-serif', source: 'tokens.css', line: 10 },
        { name: '--radius-md', value: '12px', source: 'tokens.css', line: 11 },
        { name: '--focus-ring', value: '0 0 0 2px #38bdf8', source: 'tokens.css', line: 12 },
      ],
    });

    expect(contract.tokensCss).toContain('--font-display: "Inter", sans-serif;');
    expect(contract.tokensCss).toContain('--radius-md: 12px;');
    expect(contract.tokensCss).toContain('--focus-ring: 0 0 0 2px #38bdf8;');
    expect(contract.tokensCss).not.toContain('--font-display: var(--font-display);');
    expect(contract.report.selfCheck.ok).toBe(true);

    const selfCycleCheck = validateDesignTokenOutputs({
      tokensCss: contract.tokensCss.replace('--radius-md: 12px;', '--radius-md: var(--radius-md);'),
    });
    expect(selfCycleCheck.ok).toBe(false);
    expect(selfCycleCheck.errors).toContain('--radius-md references itself');
  });
});
