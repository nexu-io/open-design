import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// OPEND-4605 — 并发已满卡片（UpgradeCard 的 .concurrency 变体）在长文案语言下
// 被明显拉高。reviewer 指出 ChatPane 对带升级按钮的并发提示渲染的是 UpgradeCard，
// RunErrorCard 的钳制不会生效；因此钳制必须落在 .whyBody 上。
const css = readFileSync(
  new URL('../../src/components/chat/UpgradeCard.module.css', import.meta.url),
  'utf8',
);

describe('OPEND-4605 — concurrency upgrade card description must be clamped', () => {
  it('clamps .whyBody to a bounded number of lines', () => {
    const block = css.match(/\.whyBody\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(block).toBeDefined();
    expect(block).toMatch(/display:\s*-webkit-box\s*;/);
    expect(block).toMatch(/-webkit-box-orient:\s*vertical\s*;/);
    expect(block).toMatch(/-webkit-line-clamp:\s*\d+\s*;/);
    expect(block).toMatch(/overflow:\s*hidden\s*;/);
  });

  it('prevents horizontal overflow for long-copy languages', () => {
    const block = css.match(/\.whyBody\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(block).toBeDefined();
    expect(block).toMatch(/overflow-wrap:\s*anywhere|word-break:\s*break-word/);
  });

  it('does not change the card\'s fixed concurrency width', () => {
    const conc = css.match(/\.concurrency\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(conc).toBeDefined();
    expect(conc).toMatch(/width:\s*min\(100%,\s*480px\)\s*;/);
    expect(conc).toMatch(/min-height:\s*118px\s*;/);
  });
});
