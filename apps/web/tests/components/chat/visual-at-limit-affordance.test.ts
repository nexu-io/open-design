/**
 * 「选满了」这件事,在叠放态里靠**拿掉能上手的东西**说 —— 不靠把卡刷淡。
 *
 * 产品口径(2026-08-27):「如果已经选满了的话,扇形时就禁止其他卡片选中态」。
 *
 * ## 为什么不能刷淡
 *
 * `visual-option-stack-opacity.test.ts` 已经把这条钉死了:叠着的四张互相压着,
 * 半透明会把背后那张连同面板底一起透出来,整沓糊成一片 —— 用户 2026-08-27
 * 截图指认过(「为啥这个卡片好多是透明的」)。那条修复今天刚落。
 * 所以「不可选」必须换一种说法,而且**不许**把 `opacity` 请回来。
 *
 * ## 稿子自己给了这种说法
 *
 * 交付稿(`1bbdce0b06`,md5 `28ea4c65…`)对「此刻点不到的卡」的规矩是**别给反馈**:
 *
 *   「hover 只放大最前面那张。不动后面几张:**它们此刻不可点,给反馈等于骗一下手**。」
 *   「勾选圈只在最前面那张给:后面几张的右上角本来就压在别人底下,
 *     **画一个点不到的控件是骗人**。」
 *
 * 把同一条规矩用到「选满了」上,答案是现成的:那张卡此刻点不到,于是
 *
 *   · **不画勾选圈** —— 画一个点不到的控件是骗人
 *   · **不给 hover 放大** —— 给反馈等于骗一下手
 *   · **不给 grab 光标** —— 光标是「能上手」的承诺,它此刻上不了手
 *
 * 三样一起消失,读出来就是「这张现在不归你点」。一个像素都不用淡。
 *
 * ## 为什么必须从层叠上钉
 *
 * 叠放态那三条规则的选择器都带着 `.qf-visual-picker[data-view='fan']` 和
 * `:nth-child(1)`,特异性 (0,4,0);而禁用态只写两个类,(0,2,0)。谁也不比谁的
 * 文本更「对」,只有特异性说了算 —— 光看规则文本一模一样,层叠却是反的
 * (`next-step-cascade.test.ts` / `visual-option-stack-opacity.test.ts` 同一条教训)。
 * jsdom 不跑层叠,所以这一族按**规则文本 + 特异性**钉。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { specificityTuple } from '../../helpers/chat-mirror-cascade';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const COMPOSIO = strip(
  readFileSync(resolve(HERE, '../../../src/styles/viewer/composio.css'), 'utf-8'),
);

/** 只按顶层逗号拆 —— `:is(.a, .b)` 里的逗号是参数分隔。 */
function splitTopLevel(selectorList: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of selectorList) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

type Rule = { sel: string; body: string };

function rules(css: string): Rule[] {
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = (m[2] ?? '').replace(/\s+/g, ' ').trim();
    for (const sel of splitTopLevel(m[1] ?? '')) {
      if (sel && !sel.startsWith('@')) out.push({ sel, body });
    }
  }
  return out;
}

/** (b, c) 两档 —— 这一族里没有 id。`:not()` 按里面最重的那一支算(和浏览器一致)。 */
function specificity(selector: string): [number, number] {
  const [ids, classes, types] = specificityTuple(selector);
  // 校准过的共享量尺没有的那一档:id。这几张表里没有 id 选择器,少一档不影响判决;
  // 真出现了就**当场抛**,不许悄悄按 0 处理 —— 那会让一条 id 规则凭空输掉。
  if (ids > 0) throw new Error(`两元组量尺遇到 id 选择器,请改用三元组:${selector}`);
  return [classes, types];
}

const gt = (a: [number, number], b: [number, number]) => (a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1]);

const RULES = rules(COMPOSIO);
const FAN = ".qf-visual-picker[data-view='fan']";
const DISABLED = '.qf-visual-card-disabled';

/** 一条规则会不会作用在「叠放态 + 最前面那张」上。 */
const isFrontCardRule = (sel: string) =>
  sel.startsWith(FAN) && sel.includes('.qf-visual-card') && sel.includes(':nth-child(1)');

describe('选满之后:最前面那张不再假装能上手', () => {
  /** 先钉住「能上手」那一档还在 —— 否则下面三条可以靠把规则整条删掉变绿。 */
  it('没被禁用时,最前面那张仍然给 grab 光标和 hover 放大', () => {
    const grab = RULES.find((r) => isFrontCardRule(r.sel) && /cursor:\s*grab/.test(r.body));
    expect(grab, '最前面那张的 cursor: grab 不见了').toBeTruthy();

    const hover = RULES.find(
      (r) => isFrontCardRule(r.sel) && r.sel.includes(':hover') && /transform:\s*scale\(/.test(r.body),
    );
    expect(hover, '稿子那条 hover 放大 1.05 不见了').toBeTruthy();
    expect(hover!.body).toMatch(/scale\(1\.05\)/);
  });

  it('grab 光标把禁用态排除在外 —— 否则它 (0,4,0) 压着 not-allowed (0,2,0)', () => {
    const grab = RULES.filter((r) => isFrontCardRule(r.sel) && /cursor:\s*grab/.test(r.body));
    expect(grab.length).toBeGreaterThan(0);
    for (const r of grab) {
      expect(
        r.sel.includes(`:not(${DISABLED})`),
        `${r.sel} 没排除禁用态,选满之后那张点不动的卡还是 grab 光标`,
      ).toBe(true);
    }
  });

  it('hover 放大同样把禁用态排除在外 —— 「给反馈等于骗一下手」', () => {
    const hover = RULES.filter(
      (r) => isFrontCardRule(r.sel) && r.sel.includes(':hover') && /transform:/.test(r.body),
    );
    expect(hover.length).toBeGreaterThan(0);
    for (const r of hover) {
      expect(r.sel.includes(`:not(${DISABLED})`), `${r.sel} 没排除禁用态`).toBe(true);
    }
  });

  it('not-allowed 那条还在,而且现在真的压得住', () => {
    const notAllowed = RULES.find(
      (r) => r.sel.includes(DISABLED) && /cursor:\s*not-allowed/.test(r.body),
    );
    expect(notAllowed, '禁用态的 not-allowed 不见了').toBeTruthy();

    // 排除掉禁用态之后,grab 那条根本不再匹配这张卡 —— 不是靠谁压过谁
    const grab = RULES.filter((r) => isFrontCardRule(r.sel) && /cursor:\s*grab/.test(r.body));
    expect(grab.every((r) => r.sel.includes(`:not(${DISABLED})`))).toBe(true);
  });
});

describe('选满之后:点不到的卡上不许画勾选圈', () => {
  /** 正面:能选的时候勾选圈是**画着**的(空圈在说「这几张可以选」)。 */
  it('勾选圈本身还在,而且未选中也画空圈', () => {
    const check = RULES.find((r) => r.sel === '.qf-visual-card-check');
    expect(check, '.qf-visual-card-check 整条不见了').toBeTruthy();
    expect(check!.body).toMatch(/border:/);
  });

  it('叠放态里,禁用的那张卡不画勾选圈', () => {
    const hide = RULES.filter(
      (r) =>
        r.sel.startsWith(FAN) &&
        r.sel.includes(DISABLED) &&
        r.sel.includes('.qf-visual-card-check') &&
        /display:\s*none/.test(r.body),
    );
    expect(
      hide.length,
      '选满之后,点不到的那几张卡上仍然画着勾选圈 —— 稿子:画一个点不到的控件是骗人',
    ).toBeGreaterThan(0);
  });

  /**
   * 配对的正面:**选中的那两张仍然画勾**。它们是此刻唯一还能点的卡
   * (点一下就取消),把它们的勾也藏掉,这道题就真的改不了答案了。
   */
  it('藏勾选圈只针对禁用态,选中态不受牵连', () => {
    const hide = RULES.filter(
      (r) =>
        r.sel.startsWith(FAN) &&
        r.sel.includes('.qf-visual-card-check') &&
        /display:\s*none/.test(r.body),
    );
    for (const r of hide) {
      const targetsDisabled = r.sel.includes(DISABLED);
      const targetsBackCards = r.sel.includes(':not(:nth-child(1))');
      expect(
        targetsDisabled || targetsBackCards,
        `${r.sel} 把勾选圈藏得太宽了 —— 只有【禁用的】和【压在后面的】才该没有勾`,
      ).toBe(true);
      expect(r.sel.includes('.qf-visual-card-on'), `${r.sel} 连选中态的勾也藏了`).toBe(false);
    }
  });
});

describe('这一档一个像素都不许淡', () => {
  it('新加的禁用态规则里没有 opacity', () => {
    const fanDisabled = RULES.filter(
      (r) => r.sel.includes(DISABLED) && !r.sel.includes("[data-view='grid']"),
    );
    expect(fanDisabled.length).toBeGreaterThan(0);
    for (const r of fanDisabled) {
      expect(
        /(?:^|;)\s*opacity\s*:/.test(r.body),
        `${r.sel} 把 opacity 请回来了 —— 叠着的卡半透明会透出背后那张`,
      ).toBe(false);
    }
  });

  /** 排除禁用态用的是 `:not()`,它只加特异性、不减 —— 顺手确认没有把层叠改反。 */
  it('加了 :not() 之后,那几条仍然压得过只写一个类的基线规则', () => {
    const guarded = RULES.filter(
      (r) => isFrontCardRule(r.sel) && r.sel.includes(`:not(${DISABLED})`),
    );
    expect(guarded.length).toBeGreaterThan(0);
    for (const r of guarded) {
      expect(gt(specificity(r.sel), [1, 0]), `${r.sel} 压不过 .qf-visual-card`).toBe(true);
    }
  });
});
