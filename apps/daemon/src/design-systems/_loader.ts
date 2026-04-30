// Spec 101 T031 + T034 — design-system loader.
// Boot-time validation: each registered key resolves to a file conforming
// to the DesignSystem interface in _types.ts.

import type { DesignSystem } from './_types.js';
import ericedmeades from './ericedmeades/index.js';
import ceremonia from './ceremonia/index.js';

// REGISTRY map. Add a new tenant here when porting their brand.
const REGISTRY: Record<string, DesignSystem> = {
  ericedmeades,
  ceremonia,
};

export class DesignSystemNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`design system not found: "${key}"`);
    this.name = 'DesignSystemNotFoundError';
  }
}

export class DesignSystemMalformedError extends Error {
  constructor(public readonly key: string, public readonly issues: string[]) {
    super(`design system "${key}" malformed: ${issues.join('; ')}`);
    this.name = 'DesignSystemMalformedError';
  }
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

function validate(ds: DesignSystem): string[] {
  const issues: string[] = [];

  for (const [field, value] of Object.entries(ds.palette ?? {})) {
    if (typeof value !== 'string' || !HEX.test(value)) {
      issues.push(`palette.${field} must be 6-digit hex (got "${value}")`);
    }
  }

  if (!ds.typography?.heading_family || !ds.typography?.body_family) {
    issues.push('typography.heading_family + body_family required');
  }
  if (!Array.isArray(ds.typography?.weights) || ds.typography.weights.length === 0) {
    issues.push('typography.weights required and non-empty');
  }
  if (!['all-caps', 'sentence', 'title'].includes(ds.typography?.case as string)) {
    issues.push('typography.case must be all-caps | sentence | title');
  }
  if (!['tight', 'normal', 'wide'].includes(ds.typography?.tracking as string)) {
    issues.push('typography.tracking must be tight | normal | wide');
  }

  if (ds.logo?.url && !ds.logo.url.startsWith('https://')) {
    issues.push('logo.url MUST be HTTPS');
  }

  if (!['dark-editorial', 'warm-organic', 'minimal-typographic', 'photo-led'].includes(ds.hero_style)) {
    issues.push(`hero_style invalid: "${ds.hero_style}"`);
  }

  if (!Array.isArray(ds.voice_tokens)) issues.push('voice_tokens must be array');
  if (!Array.isArray(ds.voice_avoid)) issues.push('voice_avoid must be array');

  return issues;
}

export function loadDesignSystem(key: string): DesignSystem {
  const ds = REGISTRY[key];
  if (!ds) throw new DesignSystemNotFoundError(key);

  const issues = validate(ds);
  if (issues.length > 0) throw new DesignSystemMalformedError(key, issues);

  return ds;
}

export function listDesignSystemKeys(): string[] {
  return Object.keys(REGISTRY);
}

// Boot-time validation: invoke once at daemon start; throws on first malformed key.
export function validateAllRegistered(): void {
  for (const key of Object.keys(REGISTRY)) {
    loadDesignSystem(key); // throws on malformed
  }
}
