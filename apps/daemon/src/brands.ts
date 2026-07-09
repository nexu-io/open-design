/**
 * Role: brands/ 콘텐츠 레지스트리 — 브랜드 manifest·코어·채널 파일 로더
 * Key Features: listBrands 스캔, readBrandCore/Deliverable, 채널 디폴트 DS 해석
 * Dependencies: node:fs/promises, @marketing-ax/contracts (BrandSummary)
 * Notes: design-systems.ts의 listDesignSystems와 동형 — 경로 traversal 방지 위해
 *        deliverable 키는 manifest 등재분만 허용(파일시스템 직접 해석 금지)
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import type { BrandSummary, BrandPaletteEntry, BrandPresentation } from '@marketing-ax/contracts';

export interface BrandManifestFile {
  id: string;
  title: string;
  core?: string;
  deliverables?: Record<string, { file: string; designSystem?: string; label?: string }>;
  presentation?: BrandPresentation;
}

// manifest deliverable label 맵 — 라벨 지정분만 (표시 전용)
export function deliverableLabelMap(m: BrandManifestFile): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(m.deliverables ?? {})) {
    if (v.label) out[k] = v.label;
  }
  return Object.keys(out).length ? out : undefined;
}

// 경로 traversal 차단 — HTTP 라우트가 req.params.id를 직접 전달하므로 모듈 경계에서 게이트 (design-systems.ts stripPrefixAndValidateId와 동일 관례)
function isValidBrandId(id: string): boolean {
  if (typeof id !== 'string') return false;
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) return false;
  if (id === '.' || id === '..') return false;
  return true;
}

// manifest.json 파싱 — 형식 불량 디렉토리는 조용히 스킵(레지스트리 관례)
export async function readBrandManifest(root: string, id: string): Promise<BrandManifestFile | null> {
  if (!isValidBrandId(id)) return null;
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
    const p = manifest.presentation;
    const core = await readBrandCore(root, entry.name);
    const palette = core ? parseBrandPalette(core) : undefined;
    const labels = deliverableLabelMap(manifest);
    brands.push({
      id: manifest.id,
      title: manifest.title,
      deliverables: Object.keys(manifest.deliverables ?? {}),
      ...(p?.subtitle ? { subtitle: p.subtitle } : {}),
      ...(p?.tagline ? { tagline: p.tagline } : {}),
      ...(p?.toneLabel ? { toneLabel: p.toneLabel } : {}),
      ...(palette?.[0] ? { primaryColor: palette[0].value } : {}),
      ...(p?.icon
        ? { iconUrl: `/api/brands/${manifest.id}/assets/${p.icon}` }
        : {}),
      ...(labels ? { deliverableLabels: labels } : {}),
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

// brand.md의 '## Palette' 섹션 마크다운 테이블을 파싱 — 정체색 정본 파생(manifest 미러 회피).
// 방어적: 헤딩/테이블 없으면 undefined (UI가 팔레트 카드 숨김).
export function parseBrandPalette(core: string): BrandPaletteEntry[] | undefined {
  const lines = core.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Palette\b/.test(l.trim()));
  if (start === -1) return undefined;
  const rows: BrandPaletteEntry[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (/^##\s/.test(line)) break; // 다음 섹션
    if (!line.startsWith('|')) {
      if (rows.length) break; // 테이블 종료
      continue; // 헤딩~테이블 사이 텍스트 스킵
    }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    const name = cells[0] ?? '';
    if (/^-+$/.test(name.replace(/\s/g, ''))) continue; // 구분선 |---|
    const value = (cells[1] ?? '').replace(/`/g, '').trim();
    if (!/^#[0-9a-fA-F]{3,8}$/.test(value)) continue; // 헤더행·비색 행 스킵
    const usage = cells[2];
    rows.push(usage ? { name, value, usage } : { name, value }); // exactOptionalPropertyTypes — undefined는 명시 대입 대신 키 생략
  }
  return rows.length ? rows : undefined;
}
