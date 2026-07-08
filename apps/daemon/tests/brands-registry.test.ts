import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  brandDeliverableDefaultDesignSystem,
  listBrands,
  readBrandCore,
  readBrandDeliverable,
  readBrandManifest,
} from '../src/brands.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'brands-'));
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
        blog: { file: 'deliverables/blog.md' },
        iam: { file: 'deliverables/iam.md', designSystem: 'acme-iam' },
      },
    }),
  );
  await fs.writeFile(path.join(dir, 'brand.md'), 'CORE');
  await fs.writeFile(path.join(dir, 'deliverables/blog.md'), 'BLOG');
  await fs.writeFile(path.join(dir, 'deliverables/iam.md'), 'IAM');
});
afterEach(() => fs.rm(root, { recursive: true, force: true }));

describe('brands registry', () => {
  it('lists brands with deliverable keys', async () => {
    const brands = await listBrands(root);
    expect(brands).toEqual([{ id: 'acme', title: 'Acme', deliverables: ['blog', 'iam'] }]);
  });
  it('reads core and deliverable bodies', async () => {
    expect(await readBrandCore(root, 'acme')).toBe('CORE');
    expect(await readBrandDeliverable(root, 'acme', 'blog')).toBe('BLOG');
    expect(await readBrandDeliverable(root, 'acme', 'nope')).toBeNull();
    expect(await readBrandCore(root, 'ghost')).toBeNull();
  });
  it('resolves the deliverable default design system', async () => {
    const manifest = await readBrandManifest(root, 'acme');
    expect(brandDeliverableDefaultDesignSystem(manifest, 'iam')).toBe('acme-iam');
    expect(brandDeliverableDefaultDesignSystem(manifest, 'blog')).toBeUndefined();
    expect(brandDeliverableDefaultDesignSystem(null, 'iam')).toBeUndefined();
  });
  it('rejects path-traversal brand ids', async () => {
    // 검증이 없으면 'ghost/../acme'는 root/acme로 해석되어 CORE가 읽힘 — 게이트가 실제로 막는지 확인
    expect(await readBrandCore(root, 'ghost/../acme')).toBeNull();
    expect(await readBrandManifest(root, '..')).toBeNull();
    expect(await readBrandDeliverable(root, 'ghost/../acme', 'blog')).toBeNull();
  });
  it('ignores non-brand directories and missing roots', async () => {
    await fs.mkdir(path.join(root, 'not-a-brand'));
    const brands = await listBrands(root);
    expect(brands.map((b) => b.id)).toEqual(['acme']);
    expect(await listBrands(path.join(root, 'missing'))).toEqual([]);
  });
});
