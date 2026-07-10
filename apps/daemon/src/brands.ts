/**
 * Role: brands/ 콘텐츠 레지스트리 — 브랜드 manifest·코어·채널 파일 로더 + 쓰기(CRUD)
 * Key Features: listBrands 스캔, readBrandCore/Deliverable, 채널 디폴트 DS 해석,
 *               createBrand·manifest/문서/채널/에셋 쓰기·deleteBrand (typed BrandWriteError)
 * Dependencies: node:fs/promises, @marketing-ax/contracts, ./projects.js (sanitizeName)
 * Notes: design-systems.ts의 listDesignSystems와 동형 — 경로 traversal 방지 위해
 *        deliverable 키는 manifest 등재분만 허용(파일시스템 직접 해석 금지).
 *        id 게이트(isValidBrandId)는 읽기·쓰기 모두 레지스트리 함수 내부에서 수행 —
 *        HTTP 라우트는 req.params를 그대로 넘기고 null/에러로 404·400을 판정한다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  BrandSummary,
  BrandPaletteEntry,
  BrandPresentation,
  BrandCreateInput,
  BrandUpdateInput,
  BrandDeliverableInput,
} from '@marketing-ax/contracts';

import { sanitizeName } from './projects.js';

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
      ...(p?.logo
        ? { logoUrl: `/api/brands/${manifest.id}/assets/${p.logo}` }
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

// ── 쓰기 함수 (서브프로젝트 B) ──────────────────────────────────────────────
// 라우트는 얇게 — 검증·경로 구성·파일 쓰기는 전부 여기서. DB(projectCount 검사)는 라우트 소유.

export type BrandWriteErrorCode =
  | 'id-required' // 비라틴 title + id 미지정 → 슬러그 파생 불가 (라우트 400)
  | 'invalid-id' // isValidBrandId 불합격 (라우트 400)
  | 'duplicate-id' // 명시 id가 이미 존재 (라우트 409)
  | 'invalid-key' // deliverable 키 형식 불합격 (라우트 400)
  | 'duplicate-key'; // deliverable 키 중복 (라우트 409)

// 라우트가 400/409를 구분할 typed 에러 채널 — 존재하지 않는 브랜드는 에러 대신 null/false (404 판정)
export class BrandWriteError extends Error {
  readonly code: BrandWriteErrorCode;
  constructor(code: BrandWriteErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'BrandWriteError';
    this.code = code;
  }
}

// deliverable 키 = 프롬프트 주입 키이자 파일명 조각 — 소문자 케밥만 허용
const DELIVERABLE_KEY_RE = /^[a-z0-9-]{1,32}$/;

// title → id 슬러그. DS slugify 재사용 금지 — 그쪽 '|| design-system' 폴백이
// 비라틴 title의 'id-required' 분기를 죽임. 브랜드판은 공백 슬러그를 그대로 반환.
function slugifyBrandId(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

// 파생 슬러그 충돌 시 -2, -3… suffix (DS uniqueSlug와 동형, 폴백 없음)
async function uniqueBrandId(root: string, base: string): Promise<string> {
  let candidate = base;
  let index = 2;
  for (;;) {
    try {
      await fs.stat(path.join(root, candidate));
      candidate = `${base}-${index++}`;
    } catch {
      return candidate;
    }
  }
}

// manifest.json 직렬화 — 소형 레지스트리 파일이라 temp+rename 원자성 미도입 (DS 선례)
async function writeBrandManifestFile(root: string, id: string, manifest: BrandManifestFile): Promise<void> {
  await fs.writeFile(path.join(root, id, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

// brand.md 스캐폴드 — Palette는 헤더만 (색 행을 넣으면 가짜 primaryColor가 목록에 노출됨)
function scaffoldCoreBody(title: string): string {
  return [
    `# ${title}`,
    '',
    '## Palette',
    '',
    '<!-- 정체색 정본 — 행 추가 예: | primary | `#1E86FA` | 메인 컬러 | -->',
    '',
    '| 이름 | 값 | 용도 |',
    '|---|---|---|',
    '',
  ].join('\n');
}

// 브랜드 생성 — id 미지정 시 title 슬러그 파생(+유니크 suffix), manifest.json + brand.md 스캐폴드
export async function createBrand(root: string, input: BrandCreateInput): Promise<BrandManifestFile> {
  const title = (input.title ?? '').trim();
  let id: string;
  if (input.id !== undefined) {
    if (!isValidBrandId(input.id)) throw new BrandWriteError('invalid-id', `invalid brand id: ${input.id}`);
    id = input.id;
    try {
      await fs.stat(path.join(root, id));
      throw new BrandWriteError('duplicate-id', `brand already exists: ${id}`);
    } catch (err) {
      if (err instanceof BrandWriteError) throw err;
      // stat 실패 = 미존재 — 생성 진행
    }
  } else {
    const slug = slugifyBrandId(title);
    if (!slug) throw new BrandWriteError('id-required', 'id is required for non-Latin titles');
    id = await uniqueBrandId(root, slug);
  }
  const manifest: BrandManifestFile = {
    id,
    title,
    deliverables: {},
    ...(input.presentation ? { presentation: input.presentation } : {}),
  };
  await fs.mkdir(path.join(root, id), { recursive: true });
  // schemaVersion은 파일 포맷 표식 — 인터페이스 밖 필드라 직렬화 시에만 부여
  await fs.writeFile(
    path.join(root, id, 'manifest.json'),
    `${JSON.stringify({ schemaVersion: 'od-brand/v1', ...manifest }, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(path.join(root, id, 'brand.md'), input.coreBody ?? scaffoldCoreBody(title), 'utf8');
  return manifest;
}

// manifest 패치 — title·presentation(통째 교체)만, deliverables·미지정 필드(schemaVersion·core)는 보존
export async function updateBrandManifest(
  root: string,
  id: string,
  input: BrandUpdateInput,
): Promise<BrandManifestFile | null> {
  const manifest = await readBrandManifest(root, id); // 내부 isValidBrandId 게이트 포함
  if (!manifest) return null;
  if (input.title !== undefined) manifest.title = input.title;
  if (input.presentation !== undefined) manifest.presentation = input.presentation; // 병합 아님 — 폼이 전체 상태 소유
  await writeBrandManifestFile(root, id, manifest);
  return manifest;
}

// brand.md 본문 저장 — manifest.core 파일명 오버라이드 존중 (읽기와 대칭)
export async function writeBrandCore(root: string, id: string, body: string): Promise<boolean> {
  const manifest = await readBrandManifest(root, id);
  if (!manifest) return false;
  await fs.writeFile(path.join(root, id, manifest.core ?? 'brand.md'), body, 'utf8');
  return true;
}

// 채널 문서 본문 저장 — manifest 등재 키만 (임의 경로 차단, 읽기와 동일 관례)
export async function writeBrandDeliverableDoc(
  root: string,
  id: string,
  key: string,
  body: string,
): Promise<boolean> {
  const manifest = await readBrandManifest(root, id);
  const rel = manifest?.deliverables?.[key]?.file;
  if (!rel) return false;
  await fs.writeFile(path.join(root, id, rel), body, 'utf8');
  return true;
}

// 채널 추가 — manifest 엔트리 + deliverables/<key>.md 스캐폴드(body 미지정 시 '# <label ?? key>')
export async function addBrandDeliverable(
  root: string,
  id: string,
  input: BrandDeliverableInput,
): Promise<BrandManifestFile | null> {
  const manifest = await readBrandManifest(root, id);
  if (!manifest) return null;
  if (!DELIVERABLE_KEY_RE.test(input.key)) {
    throw new BrandWriteError('invalid-key', `invalid deliverable key: ${input.key}`);
  }
  if (manifest.deliverables?.[input.key]) {
    throw new BrandWriteError('duplicate-key', `deliverable already exists: ${input.key}`);
  }
  const file = `deliverables/${input.key}.md`;
  await fs.mkdir(path.join(root, id, 'deliverables'), { recursive: true });
  await fs.writeFile(path.join(root, id, file), input.body ?? `# ${input.label ?? input.key}\n`, 'utf8');
  manifest.deliverables = {
    ...(manifest.deliverables ?? {}),
    [input.key]: {
      file,
      ...(input.designSystem ? { designSystem: input.designSystem } : {}),
      ...(input.label ? { label: input.label } : {}),
    },
  };
  await writeBrandManifestFile(root, id, manifest);
  return manifest;
}

// 채널 제거 — manifest 엔트리와 문서 파일 동시 삭제 (dangling 파일 방지)
export async function removeBrandDeliverable(
  root: string,
  id: string,
  key: string,
): Promise<BrandManifestFile | null> {
  const manifest = await readBrandManifest(root, id);
  const entry = manifest?.deliverables?.[key];
  if (!manifest || !entry) return null;
  delete manifest.deliverables![key];
  await fs.rm(path.join(root, id, entry.file), { force: true });
  await writeBrandManifestFile(root, id, manifest);
  return manifest;
}

// 에셋 저장 — 파일명은 sanitizeName으로 정규화 후 assets/ 하위 고정, role 지정 시 presentation.icon/logo 갱신(병합)
export async function writeBrandAsset(
  root: string,
  id: string,
  name: string,
  bytes: Buffer | Uint8Array,
  role?: 'icon' | 'logo',
): Promise<{ path: string } | null> {
  const manifest = await readBrandManifest(root, id);
  if (!manifest) return null;
  const safe = sanitizeName(name);
  await fs.mkdir(path.join(root, id, 'assets'), { recursive: true });
  await fs.writeFile(path.join(root, id, 'assets', safe), bytes);
  if (role === 'icon' || role === 'logo') {
    manifest.presentation = { ...(manifest.presentation ?? {}), [role]: safe };
    await writeBrandManifestFile(root, id, manifest);
  }
  return { path: `assets/${safe}` };
}

// 브랜드 삭제 — 디렉토리 통째 제거. 바인딩 프로젝트 카운트 검사는 라우트 책임(DB는 라우트 소유)
export async function deleteBrand(root: string, id: string): Promise<boolean> {
  if (!isValidBrandId(id)) return false;
  const dir = path.join(root, id);
  try {
    await fs.stat(dir);
  } catch {
    return false;
  }
  await fs.rm(dir, { recursive: true, force: true });
  return true;
}
