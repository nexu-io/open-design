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
});
