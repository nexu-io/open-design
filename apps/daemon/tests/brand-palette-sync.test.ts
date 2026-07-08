import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');

describe('brand palette canonical sync', () => {
  it('bodoc-iam tokens mirror the brand.md palette values', async () => {
    const brand = await fs.readFile(path.join(repo, 'brands/bodoc/brand.md'), 'utf8');
    const tokens = await fs.readFile(path.join(repo, 'design-systems/bodoc-iam/tokens.css'), 'utf8');
    // 정본 선언 존재
    expect(brand).toContain('#16C5FF');
    expect(brand).toContain('#0DA5E0');
    // 미러 일치
    expect(tokens).toMatch(/--primary:\s*#16C5FF/);
    expect(tokens).toMatch(/--primary-dark:\s*#0DA5E0/);
  });

  it('cardnews canon body hex matches the brand.md declaration', async () => {
    const brand = await fs.readFile(path.join(repo, 'brands/bodoc/brand.md'), 'utf8');
    const cardnews = await fs.readFile(path.join(repo, 'brands/bodoc/deliverables/cardnews.md'), 'utf8');
    expect(brand).toContain('#1E86FA');
    expect(cardnews).toContain('#1E86FA'); // 캐논 명세 병기 예외 — 값 일치 강제
  });
});
