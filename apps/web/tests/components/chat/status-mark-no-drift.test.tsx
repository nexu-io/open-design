// @vitest-environment jsdom
/**
 * 行首那枚状态标记**贴行首摆,不随行高漂移**。
 *
 * ## 这条从哪来(OPEND-2417)
 *
 * 用户原话:「2417 这个好像主要问题是我们的竖的灰线,有时候会覆盖到绿色带勾号的
 * icon 上,发生重叠了」。绿色带勾的那枚就是 `StatusMark status="ok"`(`.mark.ok`)。
 *
 * 当时的病根是**两条**,少修一条都还会撞:
 *  ① 标记靠父级的 `align-items: center` 居中 → 它的位置是**行高的函数**。
 *     一行的行:标记底 = 5 + (19.5 − 15) / 2 + 15 = 22.25
 *     两行的行:标记底 = 5 + (39 − 15) / 2 + 15 = 32   ← 掉下去 10px
 *  ② 串起各步骤那条竖线的起点写死 `top: 25px`(照抄稿子)。
 *     25 > 22.25 时看着没事,25 < 32 时线就压进标记 7px —— 用户看到的就是这一下。
 *
 * ## 2026-09-02:病根 ② 随线一起消失了
 *
 * 设计裁决把那条竖线整个撤掉(用户原话「这个灰色竖线不要了,设计同学说」),
 * 于是「线的起点算得对不对」「两行的行会不会撞线」这两组断言**没有对象可断**,
 * 连同它们依赖的 `--row-slot` / `--row-pad-block` / `--chain-gap` 一起删掉了。
 * 「样式表里一段链都不许再有」收在 `record-chain-scope.test.tsx` 里,从规则那头封死。
 *
 * **病根 ① 留着,而且和线无关**:标记不跟着行高走,是它自己该有的性质 ——
 * 一行里挂了更高的东西(标题折行、耗时换行、行内塞了别的块)时,行首那枚记号
 * 仍然对着标题的第一行,而不是滑到这一行的垂直中点。所以这份文件保留这一条,
 * 并从 `rail-clears-status-mark.test.tsx` 改名到现在这个名字 —— 它钉的本来就是标记,
 * 只是当初是被线逼出来的。
 *
 * ⚠️ jsdom 不做布局,量不到真实像素。这里做的是**对声明值做算术** ——
 *    比「规则存在」强,比真机量弱。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(
  resolve(__dirname, '../../../src/components/chat/primitives/record.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** 只切顶层逗号:`:is(.fold, .tool)` 里的逗号是参数分隔 */
function splitTopLevel(head: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of head) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf);
  return out;
}

function declsOf(selector: string): string {
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const one of splitTopLevel(m[1] ?? '')) {
      if (one.replace(/\s+/g, ' ').trim() === selector) return (m[2] ?? '').replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

const MARK = declsOf('.mark');

describe('OPEND-2417 状态标记贴行首,不随行高漂移', () => {
  it('标记贴行首摆,盒子不再是行高的函数', () => {
    /*
     * 反向对照的靶子就是「居中」:`align-items: center` 会让标记随行高下移。
     * 稿子的计划卡本来就不是居中的:`.steps li .tk { margin-top: 1.5px }`,
     * 1.5 正好等于 12/1.5 那一行的居中偏移 `(18 − 15) / 2`,但它是**常量**。
     */
    expect(MARK, '找不到 .mark 规则').not.toBe('');
    expect(MARK).toMatch(/align-self: flex-start/);
    expect(MARK).toMatch(/margin-top:\s*1\.5px/);
  });

  it('算术:两行的行里,居中摆法会把标记推下去 —— 贴行首摆不会', () => {
    const nudge = Number.parseFloat(/margin-top:\s*([0-9.]+)px/.exec(MARK)?.[1] ?? 'NaN');
    const slot = Number.parseFloat(/width:\s*([0-9.]+)px/.exec(MARK)?.[1] ?? 'NaN');
    expect(Number.isFinite(nudge) && Number.isFinite(slot), '.mark 的微调 / 边长读不到').toBe(true);

    // 行内边距:壳里每一行都是这一档
    const padBlock = Number.parseFloat(
      /padding:\s*([0-9.]+)px/.exec(declsOf('.fold.flat > .body.stack > .fold > summary'))?.[1] ?? 'NaN',
    );
    expect(Number.isFinite(padBlock), '读不到行的上下内边距').toBe(true);

    // 贴行首:标记的位置和行高无关,永远是这一个数
    const pinnedTop = padBlock + nudge;
    // 居中:一行 19.5、两行 39,标记顶跟着行高走
    const centeredOneLine = padBlock + (19.5 - slot) / 2;
    const centeredTwoLines = padBlock + (2 * 19.5 - slot) / 2;

    /*
     * 单行时两种摆法几乎重合 —— 差 0.75px,肉眼看不出。
     * 为什么不是**正好**重合:1.5 这个常量是照稿子的计划卡抄的
     * (`.steps li .tk { margin-top: 1.5px }`),而稿子那一行是 12px/1.5 = 18px 行盒,
     * 居中偏移 `(18 − 15) / 2 = 1.5`;我们后来把步骤标题提到 13px(行盒 19.5),
     * 居中偏移变成 2.25。常量没跟着动**是对的** —— 它的价值正是「不跟着动」。
     * 这里钉住的是「残差小到看不见」,而不是假装它等于 0。
     */
    expect(Math.abs(pinnedTop - centeredOneLine)).toBeLessThan(1);
    // 两行时旧摆法确实掉下去(这才是 OPEND-2417 那次重叠的来源)
    expect(centeredTwoLines).toBeGreaterThan(pinnedTop + 5);
  });

  it('反向对照:`.mark` 没有把居中写回来', () => {
    expect(MARK).not.toMatch(/align-self:\s*center/);
  });
});
