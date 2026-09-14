/**
 * 生图格子的圆角(PR #7170 的 `components.css`)。
 *
 * 稿子这一版把两档分开了:
 *   `.shot        { border-radius: var(--radius-lg) }`   出图那一格,和图片卡同一档
 *   `.shot.is-fail{ border-radius: var(--radius) }`      失败格,收一档
 *
 * 我们这边两档都还停在 `--chat-radius-sm`(4px)—— 一排格子里出图和失败长得一样方,
 * 而稿子靠圆角差把「这格没成」先说出来一半(红字是第二眼才读的)。
 *
 * 只钉规则文本:CSS Module 在 jsdom 里不参与层叠,值对不对只有读规则才看得出。
 * 两条都钉**具体 token**,不是「两边相等」—— 相等在两边同时错的时候永远为真。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(
  resolve(__dirname, '../../../src/components/chat/primitives/record.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function declsOf(selector: string): string {
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const one of (m[1] ?? '').split(',')) {
      if (one.replace(/\s+/g, ' ').trim() === selector) return (m[2] ?? '').replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

describe('生图格子的圆角分两档', () => {
  it('出图那一格走 `--chat-radius-lg`', () => {
    const decls = declsOf('.shot');
    expect(decls, '找不到 .shot 规则').not.toBe('');
    expect(decls).toMatch(/border-radius: var\(--chat-radius-lg\)/);
  });

  it('失败格收一档到 `--chat-radius`,而且比出图那一格更特指', () => {
    const fail = declsOf('.shot.fail');
    expect(fail, '找不到 .shot.fail 规则').not.toBe('');
    expect(fail).toMatch(/border-radius: var\(--chat-radius\)/);
    // `var(--chat-radius-lg)` 也含 `var(--chat-radius`,所以要排掉后缀那一档
    expect(fail).not.toMatch(/border-radius: var\(--chat-radius-(lg|sm)\)/);
  });
});
