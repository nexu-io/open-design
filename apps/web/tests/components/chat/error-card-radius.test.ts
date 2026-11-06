/**
 * 报错卡的**圆角档位**(PR #7170)。
 *
 * 设计源只改了一个字:
 *
 *   - .errb { … border-radius: var(--radius-lg);  … }
 *   + .errb { … border-radius: var(--radius-2xl); … }
 *
 * 12px → 16px。同一次改动里,升级卡、记忆卡、弹窗都被拉到同一档 —— 稿子的原话是
 * 「common 16px radius token」,所以这不是报错卡自己的装饰,是这一屏上「大卡片」
 * 这一族的共同外形。
 *
 * ## 这条用例真正要挡的是**写死 16px**
 *
 * 产品的形状是有刻度的(`styles/tokens.css` 的 Shape Consistency Lock:
 * 2 / 4 / 8 / 12 / 16),`--radius-2xlarge` 就是那一档,`--radius-2xl` 是它的别名。
 * 直接写 `border-radius: 16px` 今天和走 token 长得一模一样,像素 diff 也照不出来 ——
 * 直到某天刻度整体调整,写死的那一处会静静地留在旧档上,而它旁边那些走 token 的卡
 * 全都跟着动了。那时看到的是「有一张卡的角不对」,而不是「有人写死了一个数」。
 *
 * chat 组件按 `components/chat/AGENTS.md` §2 只消费 `--chat-*` 接缝层,可这一档
 * 今天在 `ChatRoot.module.css` 里**还没有别名**(那个文件属于另一条工作线)。
 * 所以实现走 `var(--chat-radius-2xl, var(--radius-2xl))`:接缝层补上别名的当天
 * 它自动接管,在那之前落到产品 token 上 —— 两种写法都不是写死的数。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(
  resolve(__dirname, '../../../src/components/chat/RunErrorCard.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** 取 `.card` 那一条规则的声明块 */
function cardBody(): string {
  const blocks = CSS.split('}');
  for (const block of blocks) {
    const [head, body] = block.split('{');
    if (body === undefined) continue;
    const selectors = (head ?? '').split(',').map((s) => s.replace(/\s+/g, ' ').trim());
    if (selectors.some((s) => s === '.card')) return body;
  }
  throw new Error('RunErrorCard.module.css 里找不到 .card 规则');
}

describe('报错卡 · 16px 圆角走 token', () => {
  it('用的是 16px 那一档的 token', () => {
    expect(cardBody()).toMatch(/border-radius:[^;]*--(?:chat-)?radius-2xl(?:arge)?/);
  });

  it('不再停在 12px 那一档', () => {
    const radius = /border-radius\s*:([^;]*)/.exec(cardBody())?.[1] ?? '';
    // `--chat-radius-lg` → `--radius-lg` → `--radius-xlarge` = 12px。
    expect(radius).not.toMatch(/radius-lg\b/);
    expect(radius).not.toMatch(/radius-xlarge\b/);
  });

  it('也不许写死那个数 —— 刻度改了它会静静地掉队', () => {
    expect(cardBody()).not.toMatch(/border-radius\s*:\s*16px/);
  });
});
