/**
 * 联系支持弹窗的**圆角档位**(PR #7170)。
 *
 * 设计源只改了一个字:
 *
 *   - .modal { width:100%; max-width:316px; border-radius: var(--radius-lg);  … }
 *   + .modal { width:100%; max-width:316px; border-radius: var(--radius-2xl); … }
 *
 * 12px → 16px。同一次改动里报错卡(`.errb`)、升级卡、记忆卡都被拉到同一档 ——
 * 稿子的原话是「common 16px radius token」,所以这不是弹窗自己的装饰,
 * 是这一屏上「大卡片」这一族的共同外形。弹窗是这一族里**最后一个**还停在
 * 12px 的(`error-card-radius.test.ts` 钉的是同一族的报错卡那一格)。
 *
 * ## 这条用例要挡两件事
 *
 * ① **写死 16px**。产品的形状是有刻度的(`styles/tokens.css` 的 Shape Consistency
 *    Lock:2 / 4 / 8 / 12 / 16),`--radius-2xlarge` 就是那一档,`--radius-2xl` 是
 *    它的别名。直接写 `border-radius: 16px` 今天和走 token 长得一模一样,像素 diff
 *    也照不出来 —— 直到某天刻度整体调整,写死的那一处会静静地留在旧档上,而它
 *    旁边那些走 token 的卡全都跟着动了。那时看到的是「有一张卡的角不对」,
 *    而不是「有人写死了一个数」。
 *
 *    chat 组件按 `components/chat/AGENTS.md` §2 只消费 `--chat-*` 接缝层,可这一档
 *    今天在 `ChatRoot.module.css` 里**还没有别名**(那个文件属于另一条工作线)。
 *    所以实现走 `var(--chat-radius-2xl, var(--radius-2xl))`:接缝层补上别名的当天
 *    它自动接管,在那之前落到产品 token 上 —— 两种写法都不是写死的数。
 *    这和 `RunErrorCard.module.css` 的 `.card` 是同一个写法,同族同写法。
 *
 * ② **注释和代码对不上**。`.modal` 上面那段注释是**逐字抄的设计源**
 *    (「稿子 `.modal { … border-radius: var(--radius-lg) … }`」)。只改代码不改注释,
 *    下一个人读到的就是一份**已经作废的稿子原文**,而且它读起来比代码更权威 ——
 *    抄稿的注释一旦过期,比没有注释更坏。所以这里把注释也当成被测对象。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAW = readFileSync(
  resolve(__dirname, '../../../src/components/chat/SupportDialog.module.css'),
  'utf8',
);
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '');

/** 取 `.modal` 那一条规则的声明块 */
function modalBody(): string {
  for (const block of CSS.split('}')) {
    const [head, body] = block.split('{');
    if (body === undefined) continue;
    const selectors = (head ?? '').split(',').map((s) => s.replace(/\s+/g, ' ').trim());
    if (selectors.some((s) => s === '.modal')) return body;
  }
  throw new Error('SupportDialog.module.css 里找不到 .modal 规则');
}

/** 取紧挨着 `.modal` 之前的那段块注释 —— 它抄的是设计源,得跟着代码一起更新 */
function commentAboveModal(): string {
  const at = RAW.search(/^\.modal\s*\{/m);
  expect(at, '找不到 .modal 规则,注释断言会空转').toBeGreaterThan(-1);
  const before = RAW.slice(0, at);
  const comments = [...before.matchAll(/\/\*[\s\S]*?\*\//g)];
  const last = comments.at(-1);
  expect(last, '.modal 上面没有抄稿注释了 —— 是被删了还是被挪走了?').toBeTruthy();
  // 中间只许隔空白,否则那段注释说的其实是别的规则
  expect(before.slice((last!.index ?? 0) + last![0].length).trim()).toBe('');
  return last![0];
}

describe('联系支持弹窗 · 16px 圆角走 token', () => {
  it('用的是 16px 那一档的 token', () => {
    expect(modalBody()).toMatch(/border-radius:[^;]*--(?:chat-)?radius-2xl(?:arge)?/);
  });

  it('不再停在 12px 那一档', () => {
    const radius = /border-radius\s*:([^;]*)/.exec(modalBody())?.[1] ?? '';
    // `--chat-radius-lg` → `--radius-lg` → `--radius-xlarge` = 12px。
    expect(radius).not.toMatch(/radius-lg\b/);
    expect(radius).not.toMatch(/radius-xlarge\b/);
  });

  it('也不许写死那个数 —— 刻度改了它会静静地掉队', () => {
    expect(modalBody()).not.toMatch(/border-radius\s*:\s*16px/);
  });

  it('接缝别名补上的当天自动接管 —— 和报错卡同一个写法', () => {
    const radius = /border-radius\s*:([^;]*)/.exec(modalBody())?.[1] ?? '';
    expect(radius.replace(/\s+/g, '')).toBe('var(--chat-radius-2xl,var(--radius-2xl))');
  });
});

describe('联系支持弹窗 · 抄稿注释跟着代码走', () => {
  it('注释里那份稿子原文不许还停在 --radius-lg', () => {
    expect(commentAboveModal()).not.toMatch(/radius-lg\b/);
  });

  it('注释里报的就是现在这一档', () => {
    expect(commentAboveModal()).toMatch(/radius-2xl\b/);
  });
});
