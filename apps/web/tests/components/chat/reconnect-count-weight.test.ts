/**
 * 重连行里那个「第几次 / 共几次」的**字重**(PR #7170)。
 *
 * 设计源改了一个数,但它上面那段注释一个字没动 —— 注释原话:
 * 「字重跟前面那句话一样是 400 —— 这一行整句(正在重新连接 2/5)是一条状态,
 *  不是一条要你读重点的通知,把次数单独加粗等于在里面挑一个词喊出来。」
 *
 *   - .tool .cnt { … font-weight: 400; … }
 *   + .tool .cnt { … font-weight: 500; … }
 *
 * 注释和数字对不上,是因为**同一次改动里稿子把 `body` 的基准字重从 400 提到了 500**
 * (`components.css` 的 `body { font-weight: 500 }`)。所以 400 → 500 不是「把次数
 * 加粗」,恰恰相反 —— 那是为了让它**继续**跟那句话一样重。规则没变,基准变了。
 *
 * ## 于是这里要钉的不是 500,是「不许自己钉一个数」
 *
 * 产品的基准今天还是 400(`styles/base.css`)。照抄 500 会得到设计稿明令禁止的
 * 结果:一句 400 的话里嵌着一个 500 的数字 —— 正是「在里面挑一个词喊出来」。
 * 而照抄 400 也不对:那是把一条「跟着基准走」的规则再一次写死成一个字面量,
 * 下次基准挪动时它又会静静地掉队,并且**没有任何测试会红**——
 * 这次设计稿必须成对修改 `body` 和 `.cnt`,证据就在这个 diff 里。
 *
 * 唯一能同时满足两个世界的写法是 `inherit`:它在 400 的产品里读作 400,
 * 在 500 的设计稿里读作 500,而「次数不比它那句话重」这条不变量任何时候都成立。
 *
 * 判据只能落在 CSS 源码上:jsdom 不跑层叠、不解析 `var()`,
 * `getComputedStyle` 在这里永远是空串(见 `queue-strip-border.test.tsx` 的同款说明)。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(
  resolve(__dirname, '../../../src/components/chat/Reconnect.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** 取 `.count` 那一条规则的声明块 */
function countBody(): string {
  for (const block of CSS.split('}')) {
    const [head, body] = block.split('{');
    if (body === undefined) continue;
    const selectors = (head ?? '').split(',').map((s) => s.replace(/\s+/g, ' ').trim());
    if (selectors.some((s) => s === '.count')) return body;
  }
  throw new Error('Reconnect.module.css 里找不到 .count 规则');
}

describe('重连计数 · 字重跟着那句话走', () => {
  it('声明了 font-weight —— 不声明就等于交给别处偶然决定', () => {
    expect(countBody()).toMatch(/font-weight\s*:/);
  });

  it('跟随继承,而不是自己钉一个数', () => {
    const weight = /font-weight\s*:([^;]*)/.exec(countBody())?.[1]?.trim() ?? '';
    expect(weight).toBe('inherit');
  });

  it('等宽数字保留 —— 数字跳动时这一行不该跟着抖', () => {
    expect(countBody()).toMatch(/font-variant-numeric\s*:\s*tabular-nums/);
  });

  it('颜色仍然继承 —— 好让它跟着父级一起透出扫光的渐变', () => {
    expect(countBody()).toMatch(/(^|;)\s*color\s*:\s*inherit/m);
  });
});
