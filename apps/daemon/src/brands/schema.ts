import type { Brand as ContractBrand, BrandColor as ContractBrandColor } from '@open-design/contracts';
import type { SeedToken } from './engine/types.js';

export const ASSET_KINDS = ['landing', 'deck', 'poster', 'email', 'newsletter', 'form'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export type BrandColor = ContractBrandColor;

export type Brand = ContractBrand & {
  seed?: Partial<SeedToken>;
};

const SEED_FIELD_TYPES: Record<keyof SeedToken, 'string' | 'number' | 'boolean'> = {
  colorPrimary: 'string',
  colorSuccess: 'string',
  colorWarning: 'string',
  colorError: 'string',
  colorInfo: 'string',
  colorLink: 'string',
  colorTextBase: 'string',
  colorBgBase: 'string',
  fontFamily: 'string',
  fontFamilyCode: 'string',
  fontSize: 'number',
  borderRadius: 'number',
  sizeUnit: 'number',
  sizeStep: 'number',
  controlHeight: 'number',
  lineWidth: 'number',
  motionUnit: 'number',
  motionBase: 'number',
  wireframe: 'boolean',
  motion: 'boolean',
};

export function sanitizeSeedOverrides(raw: unknown): Partial<SeedToken> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const input = raw as Record<string, unknown>;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, expected] of Object.entries(SEED_FIELD_TYPES)) {
    const value = input[key];
    if (value === undefined || typeof value !== expected) continue;
    if (expected === 'number' && !Number.isFinite(value as number)) continue;
    out[key] = value as string | number | boolean;
  }
  return Object.keys(out).length > 0 ? (out as Partial<SeedToken>) : undefined;
}
