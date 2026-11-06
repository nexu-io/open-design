/**
 * 视觉方向那一沓(交付稿第 21 / 22 格 `.opts.mod-visual`)【永远不许半透明】。
 *
 * 用户 2026-08-27 截图指认:「为啥这个卡片好多是透明的」—— 一道
 * 「语调(最多选 2 项)」的题,四张预览叠成一沓,整沓看着像被洗白了:
 * 后面几张淡到几乎看不见,最前面那张也是半透明的,方向名压在一张发虚的图上。
 *
 * ## 稿子怎么规定的
 *
 * 权威是 `docs/design/chat-panel-next.html`(PR #7170 head `1bbdce0b06`,
 * md5 `28ea4c65…`,即 `specs/current/chat-panel-next.md` §1.1 点名的那一版)。
 * 无头 Chrome 实测那一沓的四层:
 *
 * | 层 | opacity | background-color | filter | 压名字的兜底渐变 |
 * |---|---|---|---|---|
 * | 1(最前)| `1` | `rgb(255, 255, 255)` | `none` | 1 层 |
 * | 2 | `1` | `rgb(255, 255, 255)` | `none` | 1 层 |
 * | 3 | `1` | `rgb(255, 255, 255)` | `none` | 1 层 |
 * | 4(最后)| `1` | `rgb(255, 255, 255)` | `none` | 1 层 |
 *
 * 也就是说:**没有任何一层是淡的**。`visual-fan.css` 整份文件里一个 `opacity`
 * 都没有 —— 后面几张之所以「只露出一道边」,靠的是 `translate` + `rotate` 被
 * 前面那张【实实在在挡住】,不是靠透明度。稿子对「点不到的那几张」给的规矩恰恰
 * 相反,是**别给反馈**:
 *
 *   「hover 只放大最前面那张。不动后面几张:它们此刻不可点,给反馈等于骗一下手。」
 *   「勾选圈只在最前面那张给:后面几张的右上角本来就压在别人底下,画一个点不到的控件是骗人。」
 *
 * 而 opacity 用在**互相压着**的元素上还有一层额外破坏:半透明的卡会把它【背后
 * 那张】和面板底一起透出来,四张叠在一起就糊成一片 —— 这正是截图里那个样子。
 *
 * ## 我们错在哪(三条叠加,实测)
 *
 * 1. `.qf-visual-card-disabled { opacity: 0.52 }` —— 到了「最多选 2 项」的上限
 *    之后,所有没被选中的卡都拿到这个类。用左右箭头翻两下,**最前面那张也是
 *    disabled**,于是整沓四张全变半透明(实测 opacity 全为 `0.52`)。
 * 2. 兜底渐变画了**两层**:`.qf-visual-card-preview::after` 和
 *    `.qf-visual-preview::after` 都铺同一条 52px 的 `to top, var(--bg)` 渐变,
 *    而后者就嵌在前者里面。稿子只有 `.vpv::after` **一层**。两层叠起来,每张卡
 *    下沿 52px 被朝 `--bg` 洗了两遍 —— 就是「方向名压在一张发虚的图上」。
 * 3. 全局 `button:disabled`(`styles/primitives.css`,特异性 (0,1,1))把卡面刷成
 *    `--bg-subtle`,压过了只写一个类的 `.qf-visual-card`(0,1,0)。实测 disabled
 *    的卡底色是 `rgb(237, 237, 237)`,不是稿子的 `rgb(255, 255, 255)`。
 *
 * ## 为什么只能从层叠上钉
 *
 * 和 `next-step-cascade.test.ts` 同一个道理:规则文本一模一样、少一个祖先就够
 * 反转层叠。jsdom 不跑层叠,陈列页又会给组件套一层笼子把特异性凭空垫高。
 * 所以这一族按**规则文本 + 特异性**钉。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { specificityTuple } from '../../helpers/chat-mirror-cascade';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const COMPOSIO_CSS = strip(
  readFileSync(resolve(HERE, '../../../src/styles/viewer/composio.css'), 'utf-8'),
);
const PRIMITIVES_CSS = strip(
  readFileSync(resolve(HERE, '../../../src/styles/primitives.css'), 'utf-8'),
);

type Rule = { sel: string; body: string };

/**
 * 只按【顶层逗号】拆选择器组。
 *
 * `:is(.a, .b)` / `:has(~ :is(.a, .b))` 里面的逗号是参数分隔,不是选择器组分隔 ——
 * 一把 `split(',')` 切下去会切出 `:is(.a` 和 `.b)` 这种根本不存在的选择器,
 * 后面所有匹配都在跟垃圾数据打交道,而且是**静默**变绿。
 */
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

/** (b, c) 两档 —— 这一族里没有 id。 */
function specificity(selector: string): [number, number] {
  const [ids, classes, types] = specificityTuple(selector);
  // 校准过的共享量尺没有的那一档:id。这几张表里没有 id 选择器,少一档不影响判决;
  // 真出现了就**当场抛**,不许悄悄按 0 处理 —— 那会让一条 id 规则凭空输掉。
  if (ids > 0) throw new Error(`两元组量尺遇到 id 选择器,请改用三元组:${selector}`);
  return [classes, types];
}

const gte = (a: [number, number], b: [number, number]) =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] >= b[1];

const COMPOSIO = rules(COMPOSIO_CSS);
const PRIMITIVES = rules(PRIMITIVES_CSS);

/** 声明里那个 opacity 的数值(没写就返回 null)。 */
function declaredOpacity(body: string): number | null {
  const m = /(?:^|;)\s*opacity\s*:\s*([0-9.]+)/.exec(body);
  return m ? Number(m[1]) : null;
}

/** 这条规则是不是只在【铺开成网格】那一档生效。网格里四张不重叠,淡一点无害。 */
const isGridScoped = (sel: string) => sel.includes("[data-view='grid']");

/**
 * 取选择器的【主体】—— 也就是最后那一节复合选择器,它才是这条规则真正作用的元素。
 * 按顶层的后代 / 子 / 兄弟连接符切,括号里的不算(`:has(> .a)` 里那个 `>` 不是连接符)。
 */
function subjectOf(selector: string): string {
  let depth = 0;
  let last = '';
  for (const ch of selector) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) {
      last = '';
      continue;
    }
    last += ch;
  }
  return last;
}

/**
 * 卡【本身】就这三个类。`-preview` / `-meta` / `-name` / `-check` 都是卡里面的孩子,
 * 它们身上的 opacity 是另一回事 —— 比如 `.qf-visual-card-check svg { opacity: 0 }`
 * 就是稿子 `.vpv .pick svg` 原样搬过来的(勾由背景图画,这个 svg 本来就该藏),
 * 不能把它算成「把卡刷成半透明」。
 */
const CARD_CLASSES = new Set([
  'qf-visual-card',
  'qf-visual-card-on',
  'qf-visual-card-disabled',
]);

/** 这条规则作用的是不是卡本身(而不是卡里面的某个孩子)。 */
function targetsCardItself(selector: string): boolean {
  const subject = subjectOf(selector);
  return [...subject.matchAll(/\.([A-Za-z0-9_-]+)/g)].some((m) => CARD_CLASSES.has(m[1]!));
}

describe('拆选择器只切顶层逗号', () => {
  it(':is() / :has() 里的逗号不算选择器组分隔', () => {
    expect(splitTopLevel('.a, .b')).toEqual(['.a', '.b']);
    expect(splitTopLevel(':is(.a, .b)')).toEqual([':is(.a, .b)']);
    expect(splitTopLevel('.x:has(~ :is(.a, .b)), .y')).toEqual([
      '.x:has(~ :is(.a, .b))',
      '.y',
    ]);
    expect(splitTopLevel("a[href='x,y'], b")).toEqual(["a[href='x,y']", 'b']);
  });
});

describe('视觉方向那一沓 · 叠着的卡永远不透明', () => {
  /** 先证明筛子确实能筛到东西 —— 否则下面那条「没有违规」就是空过。 */
  it('筛子有效:叠放态那四条按深度排位的规则都在', () => {
    const fanDepth = COMPOSIO.filter(
      (r) => r.sel.includes('.qf-visual-card') && /:nth-child\((?:[1-4])\)$/.test(r.sel),
    );
    expect(fanDepth.length).toBe(4);
    // 位置全靠 transform 说话,不靠透明度
    expect(fanDepth.filter((r) => /transform:/.test(r.body)).length).toBe(4);
  });

  it('叠放态下没有任何一条规则把卡刷成半透明', () => {
    const offenders = COMPOSIO.filter((r) => {
      if (!targetsCardItself(r.sel)) return false;
      if (isGridScoped(r.sel)) return false;
      const o = declaredOpacity(r.body);
      return o !== null && o < 1;
    }).map((r) => `${r.sel} { ${r.body} }`);

    expect(
      offenders,
      '叠着的卡是互相压着的 —— 半透明会把背后那张和面板底一起透出来,整沓糊成一片',
    ).toEqual([]);
  });

  /**
   * 这条守的是【别把筛子收得太紧】:上面那条曾经误伤过 `.qf-visual-card-check svg`
   * (稿子 `.vpv .pick svg { opacity: 0 }` 原样搬来的,勾由背景图画)。
   * 把它钉在这里,既证明筛子确实放过了卡里的孩子,也保证那条稿子规则没被顺手删掉。
   */
  it('卡里孩子身上的 opacity 不算违规 —— 勾选圈那枚 svg 仍旧是稿子那条', () => {
    const checkSvg = COMPOSIO.find(
      (r) => r.sel === '.qf-visual-card-check svg' && declaredOpacity(r.body) === 0,
    );
    expect(checkSvg, '稿子 .vpv .pick svg { opacity: 0 } 对应的那条不见了').toBeTruthy();
    expect(targetsCardItself('.qf-visual-card-check svg')).toBe(false);
    expect(targetsCardItself('.qf-visual-card-disabled')).toBe(true);
    expect(targetsCardItself(".qf-visual-picker[data-view='fan'] .qf-visual-card")).toBe(true);
  });

  /**
   * 正面那半:限选上限的提示【本身没有被整条删掉】,只是挪进了不重叠的网格档。
   * 少了这一条,上面那条「没有违规」可以靠「把整个 disabled 规则删光」变绿。
   */
  it('限选上限的淡化仍然保留 —— 但只在铺开成网格时', () => {
    const gridFade = COMPOSIO.filter(
      (r) => r.sel.includes('.qf-visual-card-disabled') && isGridScoped(r.sel),
    );
    expect(gridFade.length).toBeGreaterThan(0);
    expect(gridFade.some((r) => (declaredOpacity(r.body) ?? 1) < 1)).toBe(true);
  });
});

describe('视觉方向那一沓 · 压名字的兜底渐变只许一层', () => {
  /** 稿子 `.vpv::after`:52px,`to top` 由 `--bg` 化开。这是【要保留】的那一层。 */
  it('外层预览区那一层在,而且逐值对得上稿子', () => {
    const keep = COMPOSIO.find((r) => r.sel === '.qf-visual-card-preview::after');
    expect(keep, '稿子 .vpv::after 对应的那一层不见了').toBeTruthy();
    expect(keep!.body).toMatch(/height:\s*52px/);
    expect(keep!.body).toMatch(/linear-gradient\(\s*to top,\s*var\(--bg\)\s*0%/);
    expect(keep!.body).toMatch(/pointer-events:\s*none/);
  });

  it('卡里再没有第二层同样的渐变', () => {
    const bottomGradient = COMPOSIO.filter(
      (r) =>
        r.sel.startsWith('.qf-visual') &&
        r.sel.endsWith('::after') &&
        /linear-gradient\(\s*to top,\s*var\(--bg\)/.test(r.body),
    ).map((r) => r.sel);

    expect(
      bottomGradient,
      '`.qf-visual-preview` 就嵌在 `.qf-visual-card-preview` 里,两层同样的渐变会把卡下沿洗两遍',
    ).toEqual(['.qf-visual-card-preview::after']);
  });
});

describe('视觉方向那一沓 · 禁用态不许被全局 button:disabled 夺走卡面', () => {
  /** 先钉住对手确实还在 —— 它要是哪天没了,下面那条就是空过。 */
  it('全局 button:disabled 确实会刷底色,且特异性是 (0,1,1)', () => {
    const global = PRIMITIVES.find((r) => r.sel === 'button:disabled');
    expect(global, 'primitives.css 里的 button:disabled 不见了').toBeTruthy();
    expect(global!.body).toMatch(/background:\s*var\(--bg-subtle\)/);
    expect(specificity('button:disabled')).toEqual([1, 1]);
  });

  it('我们的禁用态把卡面按稿子还原,并且压得过全局那条', () => {
    const ours = COMPOSIO.filter(
      (r) => r.sel.includes('.qf-visual-card-disabled') && /background:/.test(r.body),
    );
    expect(ours.length, '没有任何一条规则把 disabled 卡的底色抢回来').toBeGreaterThan(0);

    const restores = ours.find((r) => /background:\s*var\(--bg\)/.test(r.body));
    expect(restores, '稿子四层底色实测都是 var(--bg) / rgb(255,255,255)').toBeTruthy();
    expect(
      gte(specificity(restores!.sel), [1, 1]),
      `${restores!.sel} 的特异性是 ${specificity(restores!.sel)},压不过 button:disabled 的 (0,1,1)`,
    ).toBe(true);
    // 边框同理:全局那条把它抹成 transparent
    expect(restores!.body).toMatch(/border-color:\s*var\(--border\)/);
  });
});
