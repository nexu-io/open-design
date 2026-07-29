import {
  TOKEN_SCHEMA,
  type TokenLayer,
  type TokenSpec,
} from '@open-design/contracts/design-systems/token-schema';

export type DesignTokenEvidenceConfidence = 'high' | 'medium' | 'low' | 'fallback' | 'alias';

export type SourceDesignToken = {
  name: string;
  value: string;
  source: string;
  line?: number;
  usage?: string[];
};

export type DesignTokenBinding = {
  name: string;
  layer: TokenLayer;
  value: string;
  confidence: DesignTokenEvidenceConfidence;
  reason: string;
  sources: string[];
  sourceName?: string;
};

export type DesignTokenContractReport = {
  schemaVersion: 1;
  contract: 'TOKEN_SCHEMA';
  generatedAt: string;
  summary: {
    totalTokens: number;
    declaredTokens: number;
    sourceBackedTokens: number;
    sourceBackedA1: number;
    requiredA1: number;
    fallbackTokens: number;
    aliasTokens: number;
    score: number;
    grade: 'excellent' | 'usable' | 'needs-review' | 'needs-rebuild';
    recommendRebuild: boolean;
  };
  layers: Record<TokenLayer, {
    total: number;
    sourceBacked: number;
    fallback: number;
    alias: number;
  }>;
  selfCheck: {
    ok: boolean;
    errors: string[];
    warnings: string[];
  };
  tokens: DesignTokenBinding[];
};

export type DesignTokenContract = {
  bindings: DesignTokenBinding[];
  report: DesignTokenContractReport;
  tokensCss: string;
};

type TokenDefaults = Record<string, string>;

type RoleHint = {
  needles: string[];
  validator?: (value: string) => boolean;
  fallback?: string;
};

const DEFAULT_BODY_FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const DEFAULT_MONO_FONT =
  'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace';

const DEFAULT_TOKEN_VALUES: TokenDefaults = {
  '--bg': '#f8fafc',
  '--surface': '#ffffff',
  '--fg': '#111827',
  '--muted': '#6b7280',
  '--border': '#d1d5db',
  '--accent': '#2563eb',
  '--font-display': DEFAULT_BODY_FONT,
  '--font-body': DEFAULT_BODY_FONT,
  '--text-xs': '0.75rem',
  '--text-sm': '0.875rem',
  '--text-base': '1rem',
  '--text-lg': '1.125rem',
  '--text-xl': '1.375rem',
  '--text-2xl': '1.75rem',
  '--text-3xl': '2.25rem',
  '--text-4xl': '3rem',
  '--leading-body': '1.55',
  '--leading-tight': '1.15',
  '--tracking-display': '0',
  '--section-y-desktop': '96px',
  '--section-y-tablet': '68px',
  '--section-y-phone': '48px',
  '--container-max': '1120px',
  '--container-gutter-desktop': '32px',
  '--container-gutter-tablet': '24px',
  '--container-gutter-phone': '16px',
};

const ROLE_HINTS: Partial<Record<string, RoleHint>> = {
  '--bg': { needles: ['background', 'bg'], validator: isColorValue },
  '--surface': { needles: ['surface', 'card', 'popover', 'panel'], validator: isColorValue },
  '--surface-warm': { needles: ['surface-warm', 'secondary', 'subtle'], validator: isColorValue },
  '--fg': { needles: ['foreground', 'text', 'fg'], validator: isColorValue },
  '--fg-2': { needles: ['text-secondary', 'secondary-foreground', 'secondary-fg', 'fg-2'], validator: isColorValue },
  '--muted': { needles: ['muted', 'placeholder', 'subtext'], validator: isColorValue },
  '--meta': { needles: ['meta', 'caption', 'tertiary'], validator: isColorValue },
  '--border': { needles: ['border'], validator: isColorValue },
  '--border-soft': { needles: ['border-soft', 'border-subtle', 'separator'], validator: isColorValue },
  '--accent': { needles: ['accent', 'primary', 'brand'], validator: isColorValue },
  '--accent-on': { needles: ['accent-on', 'primary-foreground', 'accent-foreground', 'on-primary'], validator: isColorValue },
  '--success': { needles: ['success', 'positive'], validator: isColorValue },
  '--warn': { needles: ['warning', 'warn'], validator: isColorValue },
  '--danger': { needles: ['danger', 'error', 'destructive'], validator: isColorValue },
  '--font-display': { needles: ['font-display', 'font-heading', 'font-title', 'font-sans', 'font-family'], validator: isFontValue },
  '--font-body': { needles: ['font-body', 'font-sans', 'font-family', 'font'], validator: isFontValue },
  '--font-mono': { needles: ['font-mono', 'font-code', 'font-monospace'], validator: isFontValue },
  '--radius-sm': { needles: ['radius-sm', 'radius-small'], validator: isLengthLike },
  '--radius-md': { needles: ['radius-md', 'radius-card', 'radius'], validator: isLengthLike },
  '--radius-lg': { needles: ['radius-lg', 'radius-xl', 'radius-panel'], validator: isLengthLike },
  '--radius-pill': { needles: ['radius-pill', 'radius-full'], validator: isLengthLike },
  '--elev-flat': { needles: ['elev-flat', 'shadow-none'], validator: isShadowValue },
  '--elev-ring': { needles: ['elev-ring', 'ring'], validator: isShadowValue },
  '--elev-raised': { needles: ['elev-raised', 'shadow', 'elevation'], validator: isShadowValue },
  '--focus-ring': { needles: ['focus-ring', 'focus'], validator: isShadowValue },
  '--motion-fast': { needles: ['motion-fast', 'duration-fast'], validator: isDurationValue },
  '--motion-base': { needles: ['motion-base', 'duration-base', 'duration'], validator: isDurationValue },
  '--ease-standard': { needles: ['ease-standard', 'ease', 'easing'], validator: isEasingValue },
  '--container-max': { needles: ['container-max', 'container'], validator: isLengthLike },
  '--container-gutter-desktop': { needles: ['container-gutter-desktop', 'gutter-desktop'], validator: isLengthLike },
  '--container-gutter-tablet': { needles: ['container-gutter-tablet', 'gutter-tablet'], validator: isLengthLike },
  '--container-gutter-phone': { needles: ['container-gutter-phone', 'gutter-phone'], validator: isLengthLike },
};

const SCHEMA_NAMES = new Set(TOKEN_SCHEMA.map((spec) => spec.name));

export function buildDesignTokenContract(input: {
  sourceTokens: SourceDesignToken[];
  generatedAt?: Date;
}): DesignTokenContract {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const sourceTokens = input.sourceTokens.map((token) => ({
    ...token,
    name: token.name.trim(),
    value: token.value.trim(),
  }));
  const bindings = TOKEN_SCHEMA.map((spec) => bindSchemaToken(spec, sourceTokens));
  const tokensCss = renderDesignTokenContractCss(bindings);
  const selfCheck = validateDesignTokenOutputs({ tokensCss });
  const report = buildReport(bindings, generatedAt, selfCheck);
  return { bindings, report, tokensCss };
}

export function renderDesignTokenContractCss(bindings: readonly DesignTokenBinding[]): string {
  const lines = [
    ':root {',
    '  /* OD TOKEN_SCHEMA contract. Evidence lives in source/token-contract.report.json. */',
  ];
  for (const binding of bindings) {
    lines.push(`  ${binding.name}: ${binding.value};`);
  }
  lines.push('}', '');
  return lines.join('\n');
}

export function validateDesignTokenOutputs(input: {
  tokensCss: string;
  fixtureHtml?: string;
}): DesignTokenContractReport['selfCheck'] {
  const errors: string[] = [];
  const warnings: string[] = [];
  const declarations = parseTokenDeclarations(input.tokensCss);
  const declaredNames = new Set(declarations.keys());

  for (const spec of TOKEN_SCHEMA) {
    if (!declaredNames.has(spec.name)) errors.push(`tokens.css is missing ${spec.name}`);
  }
  for (const name of declaredNames) {
    if (!SCHEMA_NAMES.has(name)) errors.push(`tokens.css declares non-schema token ${name}`);
  }
  for (const [name, value] of declarations) {
    for (const ref of extractVarReferences(value)) {
      if (!declaredNames.has(ref)) errors.push(`${name} references undeclared token ${ref}`);
    }
  }
  if (input.fixtureHtml !== undefined) {
    for (const ref of extractVarReferences(input.fixtureHtml)) {
      if (!declaredNames.has(ref)) errors.push(`components.html references undeclared token ${ref}`);
    }
  }
  const fixtureCssWithoutRoot = input.fixtureHtml?.replace(/:root(?!\[)\s*\{[\s\S]*?\}/g, '') ?? '';
  const accentUses = (fixtureCssWithoutRoot.match(/var\(--accent\)/g) ?? []).length;
  if (accentUses > 2) warnings.push(`components.html references --accent ${accentUses} times; schema lint target is <=2 visible uses`);

  return { ok: errors.length === 0, errors, warnings };
}

export function buildReportWithSelfCheck(
  report: DesignTokenContractReport,
  selfCheck: DesignTokenContractReport['selfCheck'],
): DesignTokenContractReport {
  return buildReport(report.tokens, report.generatedAt, selfCheck);
}

function bindSchemaToken(spec: TokenSpec, sourceTokens: readonly SourceDesignToken[]): DesignTokenBinding {
  const exact = sourceTokens.find((token) => token.name === spec.name && valueIsUsableForSchema(token.value));
  if (exact !== undefined) {
    return binding(spec, exact.value, 'high', `Exact source token ${exact.name} matched TOKEN_SCHEMA.`, sourceRefs(exact), exact.name);
  }

  const hint = ROLE_HINTS[spec.name];
  if (hint !== undefined) {
    const candidate = bestCandidate(sourceTokens, hint);
    if (candidate !== undefined) {
      return binding(
        spec,
        candidate.value,
        'medium',
        `Mapped source token ${candidate.name} to ${spec.name} by role/name heuristic.`,
        sourceRefs(candidate),
        candidate.name,
      );
    }
  }

  if (spec.layer === 'B-slot' && spec.aliasTo !== undefined) {
    return binding(spec, spec.aliasTo, 'alias', `No richer source tier found; using schema alias ${spec.aliasTo}.`, []);
  }

  const fallback = spec.fallback ?? DEFAULT_TOKEN_VALUES[spec.name];
  if (fallback !== undefined) {
    const confidence: DesignTokenEvidenceConfidence = spec.layer === 'A2' ? 'fallback' : 'low';
    const reason =
      spec.layer === 'A2'
        ? 'No source-backed value found; using TOKEN_SCHEMA A2 fallback.'
        : 'No source-backed A1 value found; using conservative importer default.';
    return binding(spec, fallback, confidence, reason, []);
  }

  return binding(spec, 'initial', 'low', 'No source-backed value or schema fallback found.', []);
}

function bestCandidate(tokens: readonly SourceDesignToken[], hint: RoleHint): SourceDesignToken | undefined {
  const validator = hint.validator ?? (() => true);
  return tokens
    .map((token) => ({
      token,
      score: scoreTokenName(token.name, hint.needles),
    }))
    .filter(({ token, score }) => score > 0 && validator(token.value) && valueIsUsableForSchema(token.value))
    .sort((a, b) => b.score - a.score || a.token.name.localeCompare(b.token.name))[0]?.token;
}

function scoreTokenName(name: string, needles: readonly string[]): number {
  const normalized = name.toLowerCase().replace(/^--/, '');
  let best = 0;
  for (const needle of needles) {
    const normalizedNeedle = needle.toLowerCase().replace(/^--/, '');
    if (normalized === normalizedNeedle) best = Math.max(best, 100);
    else if (normalized.endsWith(`-${normalizedNeedle}`)) best = Math.max(best, 80);
    else if (normalized.includes(normalizedNeedle)) best = Math.max(best, 40);
  }
  return best;
}

function buildReport(
  bindings: readonly DesignTokenBinding[],
  generatedAt: string,
  selfCheck: DesignTokenContractReport['selfCheck'],
): DesignTokenContractReport {
  const layers = Object.fromEntries(
    (['A1-identity', 'A1-structure', 'A2', 'B-slot'] satisfies TokenLayer[]).map((layer) => {
      const layerBindings = bindings.filter((binding) => binding.layer === layer);
      return [
        layer,
        {
          total: layerBindings.length,
          sourceBacked: layerBindings.filter(isSourceBacked).length,
          fallback: layerBindings.filter((binding) => binding.confidence === 'fallback' || binding.confidence === 'low').length,
          alias: layerBindings.filter((binding) => binding.confidence === 'alias').length,
        },
      ];
    }),
  ) as DesignTokenContractReport['layers'];
  const a1Bindings = bindings.filter((binding) => binding.layer === 'A1-identity' || binding.layer === 'A1-structure');
  const sourceBackedA1 = a1Bindings.filter(isSourceBacked).length;
  const fallbackTokens = bindings.filter((binding) => binding.confidence === 'fallback' || binding.confidence === 'low').length;
  const aliasTokens = bindings.filter((binding) => binding.confidence === 'alias').length;
  const a1Coverage = a1Bindings.length === 0 ? 1 : sourceBackedA1 / a1Bindings.length;
  const nonFallbackRatio = bindings.length === 0 ? 1 : 1 - fallbackTokens / bindings.length;
  const nonAliasRatio = bindings.length === 0 ? 1 : 1 - aliasTokens / bindings.length;
  const score = Math.max(0, Math.min(100, Math.round((a1Coverage * 0.7 + nonFallbackRatio * 0.2 + nonAliasRatio * 0.1) * 100)));
  const grade = score >= 80 ? 'excellent' : score >= 60 ? 'usable' : score >= 40 ? 'needs-review' : 'needs-rebuild';

  return {
    schemaVersion: 1,
    contract: 'TOKEN_SCHEMA',
    generatedAt,
    summary: {
      totalTokens: TOKEN_SCHEMA.length,
      declaredTokens: bindings.length,
      sourceBackedTokens: bindings.filter(isSourceBacked).length,
      sourceBackedA1,
      requiredA1: a1Bindings.length,
      fallbackTokens,
      aliasTokens,
      score,
      grade,
      recommendRebuild: grade === 'needs-review' || grade === 'needs-rebuild' || !selfCheck.ok,
    },
    layers,
    selfCheck,
    tokens: [...bindings],
  };
}

function binding(
  spec: TokenSpec,
  value: string,
  confidence: DesignTokenEvidenceConfidence,
  reason: string,
  sources: string[],
  sourceName?: string,
): DesignTokenBinding {
  return {
    name: spec.name,
    layer: spec.layer,
    value,
    confidence,
    reason,
    sources,
    ...(sourceName === undefined ? {} : { sourceName }),
  };
}

function sourceRefs(token: SourceDesignToken): string[] {
  const primary = token.line === undefined ? token.source : `${token.source}:${token.line}`;
  const usage = token.usage ?? [];
  return Array.from(new Set([primary, ...usage]));
}

function isSourceBacked(binding: DesignTokenBinding): boolean {
  return binding.confidence === 'high' || binding.confidence === 'medium';
}

function parseTokenDeclarations(css: string): Map<string, string> {
  const rootBody = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/:root(?!\[)\s*\{([\s\S]*?)\}/)?.[1];
  const declarations = new Map<string, string>();
  if (rootBody === undefined) return declarations;
  for (const rawDecl of rootBody.split(';')) {
    const decl = rawDecl.trim();
    if (!decl.startsWith('--')) continue;
    const colonIndex = decl.indexOf(':');
    if (colonIndex === -1) continue;
    declarations.set(decl.slice(0, colonIndex).trim(), decl.slice(colonIndex + 1).trim().replace(/\s+/g, ' '));
  }
  return declarations;
}

function extractVarReferences(value: string): string[] {
  return Array.from(value.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)).map((match) => match[1]!).filter(Boolean);
}

function valueIsUsableForSchema(value: string): boolean {
  return extractVarReferences(value).every((ref) => SCHEMA_NAMES.has(ref));
}

function isColorValue(value: string): boolean {
  return /^(#(?:[0-9a-f]{3,8})|rgb[a]?\(|hsl[a]?\(|oklch\(|color-mix\(|var\()/i.test(value.trim());
}

function isFontValue(value: string): boolean {
  return /[A-Za-z]/.test(value) && value.length <= 180;
}

function isLengthLike(value: string): boolean {
  return /^(?:\d+(?:\.\d+)?(?:px|rem|em|ch|vw|vh|%)|clamp\(|calc\(|var\()/i.test(value.trim());
}

function isDurationValue(value: string): boolean {
  return /^(?:\d+(?:\.\d+)?m?s|var\()/i.test(value.trim());
}

function isEasingValue(value: string): boolean {
  return /^(?:cubic-bezier\(|linear|ease(?:-in|-out|-in-out)?|var\()/i.test(value.trim());
}

function isShadowValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === 'none' || /^(?:\d|0\s|var\(|color-mix\()/i.test(trimmed) || trimmed.includes(' ');
}
