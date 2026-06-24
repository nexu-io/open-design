import type { Brand } from '@open-design/contracts';
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

export async function updateBrandColor(projectId: string, index: number, hex: string): Promise<boolean> {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return false;
  const brand = await readBrand(projectId);
  const color = brand?.colors?.[index];
  if (!brand || !color) return false;
  color.hex = hex.toUpperCase();
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
