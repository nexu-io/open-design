import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// OPEND-4605 — 法语等长文案语言下，并发已满提示卡片被明显拉高。
// 修复策略：description 限最多 3 行（-webkit-line-clamp），杜绝卡片随文案长度无限增高；
// 允许任意断词避免横向溢出；CTA 的 container query 行为保持不变。
const css = readFileSync(
  new URL('../../src/components/chat/RunErrorCard.module.css', import.meta.url),
  'utf8',
);

describe('OPEND-4605 — long-copy languages must not stretch the run error card', () => {
  it('clamps the description to a bounded number of lines', () => {
    const block = css.match(/\.description\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(block).toBeDefined();
    expect(block).toMatch(/display:\s*-webkit-box\s*;/);
    expect(block).toMatch(/-webkit-box-orient:\s*vertical\s*;/);
    expect(block).toMatch(/-webkit-line-clamp:\s*\d+\s*;/);
    expect(block).toMatch(/overflow:\s*hidden\s*;/);
  });

  it('prevents horizontal overflow with anywhere word-breaking', () => {
    const block = css.match(/\.description\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(block).toBeDefined();
    expect(block).toMatch(/overflow-wrap:\s*anywhere|word-break:\s*break-word/);
    expect(block).toMatch(/min-width:\s*0\s*;/);
  });

  it('keeps the CTA container-query behaviour intact', () => {
    expect(css).toMatch(/@container\s+run-error-card\s*\(max-width:\s*20rem\)/);
  });
});
