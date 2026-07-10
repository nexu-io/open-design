/**
 * Role: brands.ts 레지스트리 쓰기 함수 유닛 테스트 (스펙 §4 — 서브프로젝트 B Task 2)
 * Key Features: createBrand 슬러그·유니크·typed 에러, manifest/문서/채널/에셋 왕복, deleteBrand, traversal id 거부
 * Dependencies: node:fs/promises(mkdtemp fixture — 실제 repo brands/ 미사용), ../src/brands.js
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BrandWriteError,
  addBrandDeliverable,
  createBrand,
  deleteBrand,
  listBrands,
  parseBrandPalette,
  readBrandCore,
  readBrandDeliverable,
  readBrandManifest,
  removeBrandDeliverable,
  updateBrandManifest,
  writeBrandAsset,
  writeBrandCore,
  writeBrandDeliverableDoc,
} from '../src/brands.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'brands-write-'));
  // 기존 브랜드 fixture — 쓰기 함수의 read-modify-write 대상
  const dir = path.join(root, 'acme');
  await fs.mkdir(path.join(dir, 'deliverables'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 'od-brand/v1',
      id: 'acme',
      title: 'Acme',
      core: 'brand.md',
      deliverables: {
        blog: { file: 'deliverables/blog.md', label: 'Blog' },
      },
      presentation: { subtitle: 'Widgets', tagline: 'Acme makes widgets.' },
    }),
  );
  await fs.writeFile(path.join(dir, 'brand.md'), '# Acme\n');
  await fs.writeFile(path.join(dir, 'deliverables/blog.md'), 'BLOG');
});
afterEach(() => fs.rm(root, { recursive: true, force: true }));

describe('createBrand', () => {
  it('derives a slug id from a Latin title and scaffolds manifest + brand.md', async () => {
    const manifest = await createBrand(root, { title: 'My Brand!' });
    expect(manifest.id).toBe('my-brand');
    expect(manifest.title).toBe('My Brand!');
    // 디스크 왕복 — readBrandManifest가 그대로 읽어야 함
    const read = await readBrandManifest(root, 'my-brand');
    expect(read?.id).toBe('my-brand');
    expect(read?.title).toBe('My Brand!');
    const raw = JSON.parse(await fs.readFile(path.join(root, 'my-brand', 'manifest.json'), 'utf8'));
    expect(raw.schemaVersion).toBe('od-brand/v1');
    const core = await readBrandCore(root, 'my-brand');
    expect(core).toContain('# My Brand!');
    expect(core).toContain('## Palette');
    // 스캐폴드 예시 테이블은 색 행 없음 — 가짜 primaryColor 방지
    expect(parseBrandPalette(core!)).toBeUndefined();
  });

  it('suffixes the slug when the derived id already exists', async () => {
    const first = await createBrand(root, { title: 'Dup Brand' });
    const second = await createBrand(root, { title: 'Dup Brand' });
    expect(first.id).toBe('dup-brand');
    expect(second.id).toBe('dup-brand-2');
  });

  it('honors explicit id, presentation, and coreBody', async () => {
    const manifest = await createBrand(root, {
      id: 'bodoc',
      title: '보닥',
      presentation: { subtitle: 'Pets' },
      coreBody: '# 보닥\n\nCUSTOM CORE\n',
    });
    expect(manifest.id).toBe('bodoc');
    expect(manifest.presentation).toEqual({ subtitle: 'Pets' });
    expect(await readBrandCore(root, 'bodoc')).toBe('# 보닥\n\nCUSTOM CORE\n');
  });

  it('throws id-required for a non-Latin title without explicit id', async () => {
    const err = await createBrand(root, { title: '테스트 브랜드' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BrandWriteError);
    expect((err as BrandWriteError).code).toBe('id-required');
  });

  it('throws duplicate-id for an explicit id that already exists', async () => {
    const err = await createBrand(root, { id: 'acme', title: 'Acme Again' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BrandWriteError);
    expect((err as BrandWriteError).code).toBe('duplicate-id');
  });

  it('throws invalid-id for malformed explicit ids', async () => {
    for (const bad of ['a/b', '..', 'a b', '']) {
      const err = await createBrand(root, { id: bad, title: 'X' }).catch((e: unknown) => e);
      expect(err, `id=${JSON.stringify(bad)}`).toBeInstanceOf(BrandWriteError);
      expect((err as BrandWriteError).code).toBe('invalid-id');
    }
  });
});

describe('updateBrandManifest', () => {
  it('replaces title and presentation wholesale while preserving deliverables', async () => {
    const updated = await updateBrandManifest(root, 'acme', {
      title: 'Acme 2.0',
      presentation: { tagline: 'New tagline.' },
    });
    expect(updated?.title).toBe('Acme 2.0');
    // 통째 교체 — 기존 subtitle은 사라져야 함
    expect(updated?.presentation).toEqual({ tagline: 'New tagline.' });
    expect(Object.keys(updated?.deliverables ?? {})).toEqual(['blog']);
    // 디스크 왕복 + 미변경 필드(schemaVersion·core) 보존
    const raw = JSON.parse(await fs.readFile(path.join(root, 'acme', 'manifest.json'), 'utf8'));
    expect(raw.schemaVersion).toBe('od-brand/v1');
    expect(raw.core).toBe('brand.md');
    expect(raw.deliverables.blog.file).toBe('deliverables/blog.md');
  });

  it('returns null for a missing brand', async () => {
    expect(await updateBrandManifest(root, 'ghost', { title: 'X' })).toBeNull();
  });
});

describe('writeBrandCore', () => {
  it('writes the core body and round-trips the Palette table', async () => {
    const body = '# Acme\n\n## Palette\n\n| 이름 | 값 | 용도 |\n|---|---|---|\n| primary | `#123456` | 메인 |\n';
    expect(await writeBrandCore(root, 'acme', body)).toBe(true);
    expect(await readBrandCore(root, 'acme')).toBe(body);
    expect(parseBrandPalette((await readBrandCore(root, 'acme'))!)).toEqual([
      { name: 'primary', value: '#123456', usage: '메인' },
    ]);
  });

  it('respects the manifest.core filename override', async () => {
    await fs.writeFile(
      path.join(root, 'acme', 'manifest.json'),
      JSON.stringify({ id: 'acme', title: 'Acme', core: 'custom.md' }),
    );
    expect(await writeBrandCore(root, 'acme', 'CUSTOM')).toBe(true);
    expect(await fs.readFile(path.join(root, 'acme', 'custom.md'), 'utf8')).toBe('CUSTOM');
  });

  it('returns false for a missing brand', async () => {
    expect(await writeBrandCore(root, 'ghost', 'X')).toBe(false);
  });
});

describe('writeBrandDeliverableDoc', () => {
  it('writes a manifest-registered deliverable doc', async () => {
    expect(await writeBrandDeliverableDoc(root, 'acme', 'blog', 'NEW BLOG')).toBe(true);
    expect(await readBrandDeliverable(root, 'acme', 'blog')).toBe('NEW BLOG');
  });

  it('rejects unregistered keys without creating files', async () => {
    expect(await writeBrandDeliverableDoc(root, 'acme', 'ghost-key', 'X')).toBe(false);
    await expect(fs.stat(path.join(root, 'acme', 'deliverables', 'ghost-key.md'))).rejects.toThrow();
  });

  it('returns false for a missing brand', async () => {
    expect(await writeBrandDeliverableDoc(root, 'ghost', 'blog', 'X')).toBe(false);
  });
});

describe('addBrandDeliverable', () => {
  it('registers the key and scaffolds the doc file', async () => {
    const manifest = await addBrandDeliverable(root, 'acme', {
      key: 'cardnews',
      label: '카드뉴스',
      designSystem: 'acme-card',
    });
    expect(manifest?.deliverables?.cardnews).toEqual({
      file: 'deliverables/cardnews.md',
      designSystem: 'acme-card',
      label: '카드뉴스',
    });
    // 스캐폴드 본문 = '# <label>' — readBrandDeliverable 왕복
    expect(await readBrandDeliverable(root, 'acme', 'cardnews')).toContain('# 카드뉴스');
  });

  it('uses the provided body verbatim when given', async () => {
    await addBrandDeliverable(root, 'acme', { key: 'iam', body: 'IAM RULES\n' });
    expect(await readBrandDeliverable(root, 'acme', 'iam')).toBe('IAM RULES\n');
  });

  it('throws duplicate-key for an already-registered key', async () => {
    const err = await addBrandDeliverable(root, 'acme', { key: 'blog' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BrandWriteError);
    expect((err as BrandWriteError).code).toBe('duplicate-key');
  });

  it('throws invalid-key for malformed keys', async () => {
    for (const bad of ['Bad Key', 'UPPER', 'a'.repeat(33), '', '../x']) {
      const err = await addBrandDeliverable(root, 'acme', { key: bad }).catch((e: unknown) => e);
      expect(err, `key=${JSON.stringify(bad)}`).toBeInstanceOf(BrandWriteError);
      expect((err as BrandWriteError).code).toBe('invalid-key');
    }
  });

  it('returns null for a missing brand', async () => {
    expect(await addBrandDeliverable(root, 'ghost', { key: 'blog' })).toBeNull();
  });
});

describe('removeBrandDeliverable', () => {
  it('removes the manifest entry and deletes the doc file', async () => {
    const manifest = await removeBrandDeliverable(root, 'acme', 'blog');
    expect(manifest?.deliverables?.blog).toBeUndefined();
    expect(await readBrandDeliverable(root, 'acme', 'blog')).toBeNull();
    await expect(fs.stat(path.join(root, 'acme', 'deliverables', 'blog.md'))).rejects.toThrow();
    // 디스크 manifest에서도 제거
    const read = await readBrandManifest(root, 'acme');
    expect(read?.deliverables?.blog).toBeUndefined();
  });

  it('returns null for an unregistered key or missing brand', async () => {
    expect(await removeBrandDeliverable(root, 'acme', 'ghost-key')).toBeNull();
    expect(await removeBrandDeliverable(root, 'ghost', 'blog')).toBeNull();
  });
});

describe('writeBrandAsset', () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  it('writes the asset and updates presentation.icon for role=icon', async () => {
    const result = await writeBrandAsset(root, 'acme', 'icon.png', bytes, 'icon');
    expect(result).toEqual({ path: 'assets/icon.png' });
    expect(await fs.readFile(path.join(root, 'acme', 'assets', 'icon.png'))).toEqual(bytes);
    const manifest = await readBrandManifest(root, 'acme');
    expect(manifest?.presentation?.icon).toBe('icon.png');
    // 기존 presentation 필드는 보존 (role 갱신은 병합)
    expect(manifest?.presentation?.subtitle).toBe('Widgets');
  });

  it('updates presentation.logo for role=logo and mirrors logoUrl in listBrands', async () => {
    await writeBrandAsset(root, 'acme', 'logo.svg', bytes, 'logo');
    const manifest = await readBrandManifest(root, 'acme');
    expect(manifest?.presentation?.logo).toBe('logo.svg');
    const brands = await listBrands(root);
    expect(brands.find((b) => b.id === 'acme')?.logoUrl).toBe('/api/brands/acme/assets/logo.svg');
  });

  it('leaves the manifest untouched without a role', async () => {
    await writeBrandAsset(root, 'acme', 'extra.png', bytes);
    const manifest = await readBrandManifest(root, 'acme');
    expect(manifest?.presentation?.icon).toBeUndefined();
    expect(manifest?.presentation?.logo).toBeUndefined();
  });

  it('sanitizes traversal-shaped filenames into the assets dir', async () => {
    const result = await writeBrandAsset(root, 'acme', '../evil logo.png', bytes, 'icon');
    expect(result).not.toBeNull();
    expect(result!.path.startsWith('assets/')).toBe(true);
    expect(result!.path).not.toContain('..');
    const stored = result!.path.slice('assets/'.length);
    expect(stored).not.toContain('/');
    // 파일이 assets/ 안에만 존재
    expect(await fs.readFile(path.join(root, 'acme', 'assets', stored))).toEqual(bytes);
    await expect(fs.stat(path.join(root, 'evil-logo.png'))).rejects.toThrow();
  });

  it('returns null for a missing brand', async () => {
    expect(await writeBrandAsset(root, 'ghost', 'icon.png', bytes, 'icon')).toBeNull();
  });
});

describe('deleteBrand', () => {
  it('removes the brand directory', async () => {
    expect(await deleteBrand(root, 'acme')).toBe(true);
    await expect(fs.stat(path.join(root, 'acme'))).rejects.toThrow();
    expect(await listBrands(root)).toEqual([]);
  });

  it('returns false for a missing brand', async () => {
    expect(await deleteBrand(root, 'ghost')).toBe(false);
  });
});

describe('traversal id rejection across all write functions', () => {
  // 게이트가 없으면 'ghost/../acme'는 root/acme로 해석돼 기존 브랜드를 오염시킴
  for (const bad of ['..', 'a/b', 'ghost/../acme']) {
    it(`rejects ${JSON.stringify(bad)}`, async () => {
      const createErr = await createBrand(root, { id: bad, title: 'X' }).catch((e: unknown) => e);
      expect(createErr).toBeInstanceOf(BrandWriteError);
      expect((createErr as BrandWriteError).code).toBe('invalid-id');
      expect(await updateBrandManifest(root, bad, { title: 'X' })).toBeNull();
      expect(await writeBrandCore(root, bad, 'X')).toBe(false);
      expect(await writeBrandDeliverableDoc(root, bad, 'blog', 'X')).toBe(false);
      expect(await addBrandDeliverable(root, bad, { key: 'newkey' })).toBeNull();
      expect(await removeBrandDeliverable(root, bad, 'blog')).toBeNull();
      expect(await writeBrandAsset(root, bad, 'a.png', Buffer.from('x'))).toBeNull();
      expect(await deleteBrand(root, bad)).toBe(false);
      // 기존 브랜드 무손상
      expect(await readBrandCore(root, 'acme')).toBe('# Acme\n');
    });
  }
});
