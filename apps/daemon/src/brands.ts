/**
 * Role: brands/ 콘텐츠 레지스트리 — 브랜드 manifest·코어·채널 파일 로더
 * Key Features: listBrands 스캔, readBrandCore/Deliverable, 채널 디폴트 DS 해석
 * Dependencies: node:fs/promises, @marketing-ax/contracts (BrandSummary)
 * Notes: design-systems.ts의 listDesignSystems와 동형 — 경로 traversal 방지 위해
 *        deliverable 키는 manifest 등재분만 허용(파일시스템 직접 해석 금지)
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import type { BrandSummary } from '@marketing-ax/contracts';

export interface BrandManifestFile {
  id: string;
  title: string;
  core?: string;
  deliverables?: Record<string, { file: string; designSystem?: string }>;
}

// manifest.json 파싱 — 형식 불량 디렉토리는 조용히 스킵(레지스트리 관례)
export async function readBrandManifest(root: string, id: string): Promise<BrandManifestFile | null> {
  try {
    const raw = await fs.readFile(path.join(root, id, 'manifest.json'), 'utf8');
    const parsed = JSON.parse(raw) as BrandManifestFile;
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.title !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

// brands/<id>/ 디렉토리 스캔 — manifest.json 있는 항목만 브랜드로 인정
export async function listBrands(root: string): Promise<BrandSummary[]> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const brands: BrandSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifest = await readBrandManifest(root, entry.name);
    if (!manifest) continue;
    brands.push({
      id: manifest.id,
      title: manifest.title,
      deliverables: Object.keys(manifest.deliverables ?? {}),
    });
  }
  return brands.sort((a, b) => a.id.localeCompare(b.id));
}

// brand.md 본문 — manifest.core로 파일명 오버라이드 가능
export async function readBrandCore(root: string, id: string): Promise<string | null> {
  const manifest = await readBrandManifest(root, id);
  if (!manifest) return null;
  try {
    return await fs.readFile(path.join(root, id, manifest.core ?? 'brand.md'), 'utf8');
  } catch {
    return null;
  }
}

// 채널 파일 본문 — manifest 등재 키만 (임의 경로 차단)
export async function readBrandDeliverable(root: string, id: string, key: string): Promise<string | null> {
  const manifest = await readBrandManifest(root, id);
  const rel = manifest?.deliverables?.[key]?.file;
  if (!rel) return null;
  try {
    return await fs.readFile(path.join(root, id, rel), 'utf8');
  } catch {
    return null;
  }
}

// 채널의 디폴트 DS — IAM만 bodoc-iam 지정, 나머지 채널은 undefined(DS 미주입)
export function brandDeliverableDefaultDesignSystem(
  manifest: BrandManifestFile | null,
  key: string | undefined,
): string | undefined {
  if (!manifest || !key) return undefined;
  return manifest.deliverables?.[key]?.designSystem;
}
