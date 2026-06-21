export type DerivedDesignTokenBinding = {
  name: string;
  layer: string;
  value: string;
  confidence: string;
  reason: string;
  sources: readonly string[];
  sourceName?: string;
};

export type DerivedDesignTokenReport = {
  generatedAt: string;
  summary: unknown;
};

export function renderDesignTokensJson(input: {
  bindings: readonly DerivedDesignTokenBinding[];
  report: DerivedDesignTokenReport;
}): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    format: 'od-design-tokens/v1',
    contract: 'TOKEN_SCHEMA',
    generatedAt: input.report.generatedAt,
    source: {
      tokensCss: 'tokens.css',
      tokenContractReport: 'source/token-contract.report.json',
    },
    summary: input.report.summary,
    tokens: input.bindings.map((binding) => ({
      name: binding.name,
      value: binding.value,
      type: inferDesignTokenType(binding.name),
      layer: binding.layer,
      confidence: binding.confidence,
      reason: binding.reason,
      sources: binding.sources,
      ...(binding.sourceName === undefined ? {} : { sourceName: binding.sourceName }),
    })),
  }, null, 2)}\n`;
}

export function renderTailwindV4Css(bindings: readonly Pick<DerivedDesignTokenBinding, 'name'>[]): string {
  const declared = new Set(bindings.map((binding) => binding.name));
  const lines = [
    '/* Derived from tokens.css. Keep tokens.css as the source of truth. */',
    '@import "tailwindcss";',
    '@import "./tokens.css";',
    '',
    '@theme {',
  ];
  for (const [tailwindName, odToken] of TAILWIND_V4_THEME_BINDINGS) {
    if (declared.has(odToken)) lines.push(`  ${tailwindName}: var(${odToken});`);
  }
  lines.push('}', '');
  return lines.join('\n');
}

function inferDesignTokenType(name: string): string {
  if (
    [
      '--bg',
      '--surface',
      '--surface-warm',
      '--fg',
      '--fg-2',
      '--muted',
      '--meta',
      '--border',
      '--border-soft',
      '--accent',
      '--accent-on',
      '--accent-hover',
      '--accent-active',
      '--success',
      '--warn',
      '--danger',
    ].includes(name)
  ) {
    return 'color';
  }
  if (name.startsWith('--font-')) return 'fontFamily';
  if (name.startsWith('--leading-')) return 'number';
  if (name === '--ease-standard') return 'cubicBezier';
  if (name.startsWith('--motion-')) return 'duration';
  if (name.startsWith('--elev-') || name === '--focus-ring') return 'shadow';
  if (
    name.startsWith('--text-')
    || name.startsWith('--space-')
    || name.startsWith('--section-y-')
    || name.startsWith('--radius-')
    || name.startsWith('--container-')
    || name.startsWith('--tracking-')
  ) {
    return 'dimension';
  }
  return 'other';
}

export const TAILWIND_V4_THEME_BINDINGS: ReadonlyArray<readonly [string, string]> = [
  ['--color-bg', '--bg'],
  ['--color-surface', '--surface'],
  ['--color-surface-warm', '--surface-warm'],
  ['--color-fg', '--fg'],
  ['--color-fg-2', '--fg-2'],
  ['--color-muted', '--muted'],
  ['--color-meta', '--meta'],
  ['--color-border', '--border'],
  ['--color-border-soft', '--border-soft'],
  ['--color-accent', '--accent'],
  ['--color-accent-on', '--accent-on'],
  ['--color-accent-hover', '--accent-hover'],
  ['--color-accent-active', '--accent-active'],
  ['--color-success', '--success'],
  ['--color-warn', '--warn'],
  ['--color-danger', '--danger'],
  ['--font-display', '--font-display'],
  ['--font-body', '--font-body'],
  ['--font-sans', '--font-body'],
  ['--font-mono', '--font-mono'],
  ['--text-xs', '--text-xs'],
  ['--text-sm', '--text-sm'],
  ['--text-base', '--text-base'],
  ['--text-lg', '--text-lg'],
  ['--text-xl', '--text-xl'],
  ['--text-2xl', '--text-2xl'],
  ['--text-3xl', '--text-3xl'],
  ['--text-4xl', '--text-4xl'],
  ['--leading-body', '--leading-body'],
  ['--leading-tight', '--leading-tight'],
  ['--tracking-display', '--tracking-display'],
  ['--spacing-1', '--space-1'],
  ['--spacing-2', '--space-2'],
  ['--spacing-3', '--space-3'],
  ['--spacing-4', '--space-4'],
  ['--spacing-5', '--space-5'],
  ['--spacing-6', '--space-6'],
  ['--spacing-8', '--space-8'],
  ['--spacing-12', '--space-12'],
  ['--spacing-section-desktop', '--section-y-desktop'],
  ['--spacing-section-tablet', '--section-y-tablet'],
  ['--spacing-section-phone', '--section-y-phone'],
  ['--radius-sm', '--radius-sm'],
  ['--radius-md', '--radius-md'],
  ['--radius-lg', '--radius-lg'],
  ['--radius-pill', '--radius-pill'],
  ['--shadow-flat', '--elev-flat'],
  ['--shadow-ring', '--elev-ring'],
  ['--shadow-raised', '--elev-raised'],
  ['--shadow-focus-ring', '--focus-ring'],
  ['--duration-fast', '--motion-fast'],
  ['--duration-base', '--motion-base'],
  ['--ease-standard', '--ease-standard'],
  ['--container-max', '--container-max'],
  ['--spacing-container-desktop', '--container-gutter-desktop'],
  ['--spacing-container-tablet', '--container-gutter-tablet'],
  ['--spacing-container-phone', '--container-gutter-phone'],
];
