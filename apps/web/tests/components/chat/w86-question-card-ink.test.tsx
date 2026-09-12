// @vitest-environment jsdom
/**
 * W86 · 意图澄清卡与视觉方向卡的两处「墨色」对稿。
 *
 * 两条都是**量出来的**,不是从稿子的声明推的。量法:系统 Chrome(headless,CDP),
 * 一边是交付稿 `729fa43ce7` 的组件全集页,一边是同一时刻用产品组件生成的镜像陈列页,
 * 两页同一台浏览器、同一次会话、同一把 `getComputedStyle` 读。
 *
 * ── 防真空 ────────────────────────────────────────────────────────────
 * 读之前先往两页各注一颗 `font-weight:400` 和一颗 `font-weight:500` 的按钮,同一次读回
 * `400` / `500`;`aspect-ratio: 5/7` 的 150px 宽块读回 `210px` 高、`4/3` 的 198px 读回
 * `148.5px`。尺子分得出这两档,读数才算数。同一次自检还读到:**无类名裸 `<button>`
 * 在稿子那页是 400、在我们这页是 500** —— 这正是下面第一条的病根。
 *
 * ── 第一条:静息选项行的字重(第 16–20 格)─────────────────────────────
 * 逐行核过,不是一刀切:那五格一共 19 个选项行,**只有 10 个静息行**从 500 变 400;
 * 选中行(`.qf-chip-on`)和展开的「自己填」仍是 500,和稿子逐行同值。
 * 稿子的 `.opt` 是 `<button>`,自己**一条 `font-weight` 都不写**;稿子的全局复位
 * (`729fa43ce7:docs/design/chat-panel/src/components.css:170`)也只写 `font-family: inherit`。
 * 而浏览器 UA 给 `<button>` 用的是 `font` 简写,简写把 `font-weight` 一并压成 400 ——
 * 所以稿子的静息选项行**渲染出来是 400**,不是 body 那条 500。真机读数(cell 16–20):
 *
 *   稿 `.opt`            → 400        我们 `.qf-chip`        → 500
 *   稿 `.opt.is-on`      → 500        我们 `.qf-chip-on`     → 500   ← 这一档两边本来就一样
 *
 * `638596f84a` 已经按同一条理由把面板里的**裸**按钮拨回 400;`.qf-chip` 因为自己写了
 * 一条 500 而躲过那条规则,这里是同一件事的剩余部分。
 *
 * ⚠️ **面板基线 500 不动**(`ChatRoot.module.css`,`typography-baseline.test.ts` 钉着)。
 * 动的只有「按钮不继承字重」这一类元素,下面有反向对照钉住。
 *
 * ── 第二条:视觉方向卡的卡头标题(第 21 / 22 格)──────────────────────
 * 稿子 `components.css:1318` 是 `.card:has(> .cbody > .opts) > .h > b { font-weight: 500 }`,
 * 而视觉方向那张卡的容器类名是 `.opts.mod-visual` —— **它就是一个 `.opts`**,所以稿子那张
 * 卡的卡头标题跟着降到 500。我们把这条搬过来时钩子只挂了 `.qf-options`,而视觉方向卡
 * 渲染的是 `.qf-visual-picker`,于是漏网,停在通用卡头的 600。真机读数:
 *
 *   稿 cell 21 / 22 `.h > b` → 500     我们 `.question-form-title` → 600
 *   稿 cell 16–20   `.h > b` → 500     我们                        → 500  ← 带选项的卡本来就对
 *
 * ── 这一轮**没有**改的、量下来两边一样的 ──────────────────────────────
 *   ·「自己填」的 textarea:稿 `.opt .own-ta` 自己写着 `font-weight: 500`,实测两边都 500。
 *   · 重连失败那行「连接失败」:实测两边都 500。
 *   · 预览卡里的方向名(`.vt` / `.qf-visual-card-name`):实测两边都 600。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { I18nProvider } from '../../../src/i18n';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import type { QuestionForm } from '../../../src/artifacts/question-form';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(HERE, '../../../src', rel), 'utf-8');

/**
 * 照 `index.css` 的导入顺序 —— 少一张、顺序错一处,赢的就不是产线上赢的那条。
 * 末尾那张是面板基线(CSS Module,产线上带哈希),`.root` 原样注进来才有基线可继承;
 * **少了它就是「陈列页缺祖先」那类假差异**,本文件的读数会整体轻一档。
 */
const SHEETS = [
  'styles/primitives.css',
  'styles/chat.css',
  'styles/viewer/composio.css',
  'components/chat/ChatRoot.module.css',
];

const OPTIONS: QuestionForm = {
  id: 'q5-stack',
  title: '还需要确认一件事',
  questions: [{
    id: 'scope',
    label: '这次改到哪一层?',
    type: 'radio',
    allowCustom: false,
    options: [
      { label: '只改这一页', value: 'page' },
      { label: '同一族的页面一起改', value: 'family' },
    ],
  }],
};

/** 带「自己填」的同一张卡:给一个不在选项里的草稿值,那一行就地展开输入框。 */
const OPTIONS_CUSTOM: QuestionForm = {
  ...OPTIONS,
  id: 'q5-stack-own',
  questions: [{ ...OPTIONS.questions[0]!, allowCustom: true }],
};

/** 纯文本题:卡里没有 `.opts`,稿子那条 `:has()` 不命中,卡头标题留在 600。 */
const TEXT_ONLY: QuestionForm = {
  id: 'q5-text',
  title: '还需要确认一件事',
  questions: [{ id: 'topic', label: '主题', type: 'text' }],
};

/** 视觉方向:`id: 'tone'` + `visualStyleContext` 走内置风格目录,渲染 `.qf-visual-picker`。 */
const VISUAL: QuestionForm = {
  id: 'q5-visual',
  title: '先定个视觉方向',
  questions: [{
    id: 'tone',
    label: '这套电商 App 原型走哪种感觉?',
    type: 'radio',
    allowCustom: false,
    options: [{ label: '', value: '' }],
  }],
};

beforeAll(() => {
  for (const rel of SHEETS) {
    const style = document.createElement('style');
    style.textContent = read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
    document.head.append(style);
  }
});

function mount(
  form: QuestionForm,
  extra: { draft?: Record<string, string | string[]>; visual?: boolean } = {},
): HTMLElement {
  const { container } = render(
    <I18nProvider initial="zh-CN">
      {/* 产品的祖先链:`.app`(ProjectView)→ ChatPane 的接缝 */}
      <div className="app"><div className="root" data-chat-root="">
        <QuestionFormView
          form={form}
          interactive
          onSubmit={() => undefined}
          {...(extra.draft ? { draftAnswers: extra.draft } : {})}
          {...(extra.visual ? { visualStyleContext: 'prototype' as const } : {})}
        />
      </div></div>
    </I18nProvider>,
  );
  return container;
}

const weight = (el: Element | null): string => {
  expect(el, '这个元素没渲染出来,下面守的东西不存在').toBeTruthy();
  return getComputedStyle(el as HTMLElement).fontWeight;
};

describe('W86 · 防真空:这把尺子分得出 400 和 500', () => {
  it('同一棵树、同一次读,注进去的 400 / 500 各自读回自己的值', () => {
    const root = mount(OPTIONS);
    const body = root.querySelector('.question-form-body')!;
    const light = document.createElement('button');
    light.style.fontWeight = '400';
    const heavy = document.createElement('button');
    heavy.style.fontWeight = '500';
    body.append(light, heavy);
    expect(weight(light)).toBe('400');
    expect(weight(heavy)).toBe('500');
  });

  it('面板基线这一层确实进场了(读回 500,不是全站 body 的 400)', () => {
    const root = mount(OPTIONS);
    /*
     * 这条是「陈列页缺祖先」那类假差异的正面防线:少注 `ChatRoot.module.css`
     * 或者祖先链断了,这里就读回全站 body 的 400,下面所有字重读数整体轻一档。
     */
    expect(weight(root.querySelector('[data-chat-root]'))).toBe('500');
  });

  it('面板里的裸 <button> 已经是 400 —— 病根不在全局那条', () => {
    const root = mount(OPTIONS);
    const bare = document.createElement('button');
    root.querySelector('.question-form-body')!.append(bare);
    /*
     * `primitives.css` 的全局 `button { font-weight: 500 }` 之后,`chat.css` 用
     * `:where([data-chat-root]) button { font-weight: 400 }` 把面板里的裸按钮拨回了
     * 稿子的渲染值(`638596f84a`)。这条**不是被测项**,是下面那条的对照:
     * 裸按钮已经 400 了,`.qf-chip` 只因为自己写了一条 500 才仍然重一档。
     */
    expect(weight(bare)).toBe('400');
  });
});

describe('W86 ① 静息选项行的字重要对上稿子的真实渲染值', () => {
  it('没选中的选项行是 400(稿子 `.opt` 停在 UA 的 400)', () => {
    const root = mount(OPTIONS);
    const chips = [...root.querySelectorAll('.qf-chip')];
    expect(chips.length, '这张卡没渲染出选项行').toBeGreaterThan(0);
    for (const chip of chips) expect(weight(chip)).toBe('400');
  });

  it('反向对照:选中的那一行仍然是 500(稿子 `.opt.is-on` 亲自写的)', () => {
    const root = mount(OPTIONS, { draft: { scope: 'family' } });
    const picked = root.querySelector('.qf-chip.qf-chip-on');
    expect(weight(picked)).toBe('500');
  });

  it('反向对照:「自己填」展开的输入框仍然是 500(稿子 `.opt .own-ta` 亲自写的 500)', () => {
    const root = mount(OPTIONS_CUSTOM, { draft: { scope: '我自己写一条' } });
    const ta = root.querySelector('textarea.qf-own-input') ?? root.querySelector('textarea');
    expect(ta, '「自己填」没展开,下面守的东西不存在').toBeTruthy();
    expect(weight(ta)).toBe('500');
  });

  it('反向对照:面板排版基线仍然是 500(有裁决,不许跟着降)', () => {
    const root = mount(OPTIONS);
    expect(
      weight(root.querySelector('[data-chat-root]')),
      '面板基线被动了 —— 那一档是有裁决的,typography-baseline.test.ts 钉着',
    ).toBe('500');
  });
});

describe('W86 ② 视觉方向卡的卡头标题跟带选项的卡同档', () => {
  it('视觉方向卡的卡头标题是 500', () => {
    const root = mount(VISUAL, { visual: true });
    expect(
      root.querySelector('.qf-visual-picker'),
      '这张卡没走视觉方向那一路,下面守的东西不存在',
    ).toBeTruthy();
    expect(weight(root.querySelector('.question-form-title'))).toBe('500');
  });

  it('反向对照:带选项的确认卡本来就是 500,没被这条改动影响', () => {
    const root = mount(OPTIONS);
    expect(weight(root.querySelector('.question-form-title'))).toBe('500');
  });

  it('反向对照:既没选项也没预览的纯文本卡仍然是 600(稿子 `.card > .h b`)', () => {
    const root = mount(TEXT_ONLY);
    expect(root.querySelector('.qf-options')).toBeNull();
    expect(root.querySelector('.qf-visual-picker')).toBeNull();
    expect(weight(root.querySelector('.question-form-title'))).toBe('600');
  });

  it('反向对照:「换一批」仍在预览区顶栏里(332b96a427 刚落地的位置)', () => {
    const root = mount(VISUAL, { visual: true });
    const refresh = root.querySelector('.qf-visual-refresh');
    expect(refresh, '「换一批」不见了').toBeTruthy();
    expect(refresh!.closest('.qf-visual-bar'), '「换一批」被搬出顶栏了').toBeTruthy();
  });
});

/* ══ ③ 查完是「本来就对」的那几处 —— 钉住,免得下一轮再被当差异派一遍 ══════
 *
 * 下面三条都不是这一轮改的东西。它们各自被当成「差异」派过,查下来产品是对的。
 * 每条钉一个断言,理由和实测写在用例里。
 */
describe('W86 ③ 这几处产品本来就对 —— 钉住', () => {
  it('预览卡上的方向名是 600 —— 稿子 `.vt` 实测也是 600,两边同值', () => {
    /*
     * 派单里写的是「卡标题字重:稿 500 / 我们 600」。查下来这句话指的**不是**这个元素:
     * 实测(系统 Chrome headless,交付稿 `729fa43ce7`)`.vt` = 600,我们
     * `.qf-visual-card-name` = 600,**两边一样**。真正差一档的是**卡头那只 `<b>`**
     * (上面那组用例),两者是卡上两个不同的元素,别再混成一条。
     */
    const root = mount(VISUAL, { visual: true });
    const name = root.querySelector('.qf-visual-card-name');
    expect(name, '方向名没渲染出来').toBeTruthy();
    expect(weight(name)).toBe('600');
  });

  it('选项行左 5 右 11 的**不对称**是有出处的,不许顺手并回对称简写', () => {
    /*
     * 稿子是**对称的** `.opts.mod-stack .opt { padding-inline: 5px }` ——
     * 实测(交付稿 `729fa43ce7`)左右都是 5px,12 处无例外。
     * 我们右边多留一格是 **OPEND-2402**(用户截图:中文行尾的标点压到卡的描边上)
     * 落的,写成两条 longhand 就是为了防止有人并回 `padding-inline: 5px` 简写。
     *
     * ⚠️ 这一格**还没有裁决说要不要收回 11**。2026-09-02 在跑着的产品里量过:
     * 把右内距临时压到 5px,选项文案的最右一笔离卡的内边界仍有 19px,没有溢出
     * (`.qf-chip-copy` 的宽度两档都是 325px —— 13px 的中文字身比这 6px 差值还宽,
     *  断行点根本不变)。也就是说 OPEND-2402 当时的溢出已经由同一次修复里的
     * `white-space: normal` / `min-width: 0` 治住了,这 6px 现在只是余量。
     * **要不要跟稿子收回 5px 是产品裁决,不是对稿动作** —— 在拿到裁决之前,
     * 这条钉住现状,免得对稿的下一轮把它当差异又派一遍。
     */
    /*
     * ⚠️ 这条读的是**规则原文**,不是 `getComputedStyle`。jsdom 不做逻辑属性映射:
     * `.qf-chip` 先写了物理简写 `padding: 8px 11px`,再写 `padding-inline-start: 5px`,
     * jsdom 的 `paddingLeft` 仍然读回简写留下的 11px。左右两个数是在**真实 Chrome**
     * 上量的(交付稿 5/5,产品 5/11),这里守的是「两条 longhand 还在、没被并回简写」。
     */
    const root = mount(OPTIONS);
    expect(root.querySelector('.qf-chip'), '选项行没渲染出来').toBeTruthy();
    const css = readFileSync(
      resolve(HERE, '../../../src/styles/viewer/composio.css'),
      'utf-8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /\.qf-options\s+\.qf-chip\s*\{([^}]*)\}/.exec(css);
    expect(rule, '`.qf-options .qf-chip` 那条规则不见了').toBeTruthy();
    const body = rule?.[1] ?? '';
    expect(
      body,
      '左内距动了 —— 它和问句、底栏共用那条 11px 竖线(6 + 5)',
    ).toMatch(/padding-inline-start:\s*5px/);
    expect(
      body,
      '右内距被并回稿子的 5px 了 —— 那是 OPEND-2402 的落点,要动得先拿裁决',
    ).toMatch(/padding-inline-end:\s*11px/);
    expect(
      body,
      '两条 longhand 被并回 `padding-inline` 简写了 —— 简写会把右边那格一起刷掉',
    ).not.toMatch(/padding-inline:\s/);
  });

  it('叠放那一沓仍然是**整沓居中**,补偿量跟着卡宽走', () => {
    /*
     * 派单里写的是「叠放负外距:稿 -38px / 我们 -68px」。这两个数不是各自拍的,
     * 都是同一条式子 `calc(--fan-w / -2 + c)` 算出来的:居中的是**整沓的外接框**
     * (后面三张转出去的角实打实占地方),所以要往右补「左侧多支出那一截的一半」。
     *   稿子:卡 152 宽 → 连角横跨 227,超出 75,补 38 → margin-left = -38
     *   我们:卡 200 宽 → 连角横跨 263,超出 63,补 32 → margin-left = -68
     * 卡宽从 152 变成 200 是 `visual-card-aspect.test.ts` 钉着的 2026-08-27 产品裁决
     * (素材 96 张全是 1600×1200 的 4:3 横图,竖卡会切掉近一半构图)。
     * -68 是那条裁决的**导出量**,不是独立的一处走样。
     * 真机复核(跑着的产品,注入真实标记):这一沓左留白 47.1 / 右留白 46,基本相等。
     *
     * 这条钉的是**式子还在**:谁把 `-68px` 写死、或者改了 `--qf-fan-w` 却没动补偿量,
     * 整沓就会偏到一边去,而那是眼睛才看得出、单测看不见的那类走样。
     */
    const css = readFileSync(
      resolve(HERE, '../../../src/styles/viewer/composio.css'),
      'utf-8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    const decl = /margin-left:\s*calc\(\s*var\(--qf-fan-w\)\s*\/\s*-2\s*\+\s*(\d+)px\s*\)/.exec(css);
    expect(decl, '叠放卡的居中补偿不再是「跟着 --qf-fan-w 算」了').toBeTruthy();
    const fanW = /--qf-fan-w:\s*(\d+)px/.exec(css);
    expect(fanW, '--qf-fan-w 的定义处不见了').toBeTruthy();

    const w = Number(fanW?.[1] ?? NaN);
    const c = Number(decl?.[1] ?? NaN);
    expect(Number.isFinite(w) && Number.isFinite(c), '卡宽或补偿量读不出来').toBe(true);
    /*
     * 几何自洽:四张卡绕**底边中点**旋转 0 / -5 / -8 / -11 度,再各自平移 i×(-12, -8)。
     * 算出整沓外接框相对最前面那张的左右支出,补偿量应当 ≈ 左支出的一半。
     */
    const h = (w * 3) / 4; // 4/3 横卡
    const deg = [0, -5, -8, -11];
    let minX = Infinity;
    let maxX = -Infinity;
    deg.forEach((d, i) => {
      const rad = (d * Math.PI) / 180;
      const cx = i * -12;
      const cy = i * -8;
      // 支点 = 底边中点(相对卡左上角是 (w/2, h))
      const corners: [number, number][] = [[0, 0], [w, 0], [0, h], [w, h]];
      for (const [px, py] of corners) {
        const dx = px - w / 2;
        const dy = py - h;
        const rx = dx * Math.cos(rad) - dy * Math.sin(rad) + w / 2 + cx;
        minX = Math.min(minX, rx);
        maxX = Math.max(maxX, rx);
      }
    });
    const leftOverhang = -minX; // 前排卡左边界之外多支出的一截
    expect(
      Math.abs(c - leftOverhang / 2),
      `补偿量 ${c}px 和卡宽 ${w}px 对不上:整沓外接框左支出 ${leftOverhang.toFixed(1)}px,应当补一半`,
    ).toBeLessThan(3);
    expect(maxX, '整沓右边界不该超出前排卡').toBeLessThanOrEqual(w + 0.5);
  });
});
