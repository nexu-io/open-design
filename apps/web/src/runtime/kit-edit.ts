import type { Brand, BrandColorRole } from '@open-design/contracts';
import {
  deleteProjectFile,
  fetchProjectFileText,
  writeProjectTextFile,
} from '../providers/registry';

export type KitTextModule = 'identity' | 'voice' | 'imagery-layout' | 'design-md';

async function readBrand(projectId: string): Promise<Brand | null> {
  const raw = await fetchProjectFileText(projectId, 'brand.json', { cache: 'no-store' });
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Brand;
  } catch {
    return null;
  }
}

async function writeBrand(projectId: string, brand: Brand): Promise<boolean> {
  const file = await writeProjectTextFile(projectId, 'brand.json', JSON.stringify(brand, null, 2));
  return Boolean(file);
}

export async function patchBrand(projectId: string, mutate: (brand: Brand) => void): Promise<boolean> {
  const brand = await readBrand(projectId);
  if (!brand) return false;
  mutate(brand);
  return writeBrand(projectId, brand);
}

type EditableBrand = Brand & { seed?: Record<string, unknown> };

function normalizeHex(raw: string): string | null {
  const value = raw.trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : null;
}

function hueOf(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

function isGreenish(hex: string): boolean {
  const hue = hueOf(hex);
  return hue >= 80 && hue <= 165;
}

function syncSeedForColor(brand: EditableBrand, role: BrandColorRole, hex: string): void {
  const seed = { ...(brand.seed ?? {}) };
  if (role === 'accent') {
    seed.colorPrimary = hex;
    seed.colorInfo = hex;
  } else if (role === 'accent-secondary') {
    seed.colorLink = hex;
    if (isGreenish(hex)) seed.colorSuccess = hex;
  } else if (role === 'foreground') {
    seed.colorTextBase = hex;
  } else if (role === 'background' || role === 'surface') {
    seed.colorBgBase = hex;
  }
  brand.seed = seed;
}

export async function updateBrandColor(projectId: string, index: number, hex: string): Promise<boolean> {
  const nextHex = normalizeHex(hex);
  if (!nextHex) return false;
  const brand = await readBrand(projectId);
  const color = brand?.colors?.[index];
  if (!brand || !color) return false;
  color.hex = nextHex;
  syncSeedForColor(brand as EditableBrand, color.role, nextHex);
  return writeBrand(projectId, brand);
}

export function replaceDesignMdColorAtIndex(body: string, index: number, hex: string): string | null {
  if (index < 0 || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const matches = [...body.matchAll(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)];
  const seen = new Set<string>();
  let colorIndex = 0;
  for (const match of matches) {
    const token = match[0];
    const lower = token.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    if (colorIndex === index) {
      const start = match.index ?? -1;
      if (start < 0) return null;
      return `${body.slice(0, start)}${hex.toUpperCase()}${body.slice(start + token.length)}`;
    }
    colorIndex += 1;
  }
  return null;
}

export async function deleteBrandLogo(projectId: string, index: number): Promise<boolean> {
  let fileToDelete: string | null = null;
  const ok = await patchBrand(projectId, (brand) => {
    const logo = brand.logo;
    if (!logo) return;
    const alternates = logo.alternates ?? [];
    if (index <= 0) {
      fileToDelete = relativeProjectAssetPath(logo.primary);
      logo.primary = alternates.shift() ?? null;
      logo.alternates = alternates;
      return;
    }
    fileToDelete = relativeProjectAssetPath(alternates[index - 1]);
    logo.alternates = alternates.filter((_, i) => i !== index - 1);
  });
  if (ok && fileToDelete) await deleteProjectFile(projectId, fileToDelete);
  return ok;
}

export async function deleteBrandImage(projectId: string, index: number): Promise<boolean> {
  let fileToDelete: string | null = null;
  const ok = await patchBrand(projectId, (brand) => {
    if (!brand.imagery?.samples) return;
    fileToDelete = relativeProjectAssetPath(brand.imagery.samples[index]?.file);
    brand.imagery.samples = brand.imagery.samples.filter((_, i) => i !== index);
  });
  if (ok && fileToDelete) await deleteProjectFile(projectId, fileToDelete);
  return ok;
}

export async function readDesignMd(projectId: string): Promise<string> {
  return (await fetchProjectFileText(projectId, 'DESIGN.md', { cache: 'no-store' })) ?? '';
}

export async function writeDesignMd(projectId: string, body: string): Promise<boolean> {
  const file = await writeProjectTextFile(projectId, 'DESIGN.md', body);
  return Boolean(file);
}

export async function readTextFile(file: File): Promise<string> {
  return await file.text();
}

function relativeProjectAssetPath(raw: string | null | undefined): string | null {
  if (!raw || /^(?:[a-z]+:)?\/\//i.test(raw) || raw.startsWith('/')) return null;
  const clean = raw.replace(/^\.\/+/, '').replace(/\\/g, '/');
  if (!clean || clean.includes('\0') || clean.split('/').some((part) => part === '..')) return null;
  return clean;
}
