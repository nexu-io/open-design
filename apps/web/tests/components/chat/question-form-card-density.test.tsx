// @vitest-environment jsdom
/**
 * OPEND-2402(选项标点与卡片边框重叠)与 OPEND-2401(卡片布局与操作可读性)。
 *
 * ── 用户报的是什么 ────────────────────────────────────────────
 * 2402:「选项包含较长文案并换行时,行尾标点会贴近甚至与卡片右侧边框线重叠」。
 * 2401:「『必填』标识对比度和辨识度偏低」「『下一步』按钮…文字接近边界,存在溢出感」。
 *
 * ── 2402 的机制 ──────────────────────────────────────────────
 * `.qf-chip` 是 `display: flex` 的一行,里面是不缩的选择框 + 文案列 `.qf-chip-copy`。
 * flex 项默认 `min-width: auto`,**缩不到 min-content 以下** —— 中英混排里一段
 * 不可断的长词(URL、型号、括号里的英文串)会把这一列顶出容器,文字于是压到卡边上。
 * 中文行尾的全角标点还会再悬挂出去半个字身。
 * 两条一起修:文案列允许缩(`min-width: 0`)、允许在任意位置断(`overflow-wrap`),
 * 再给右侧多留一格稿子的 11px 竖线单位,让悬挂出来的那半个标点仍落在卡里。
 * 左侧**不动** —— 那是稿子写死的 11px 竖线(6 + 5),问句、选项、底栏共用。
 *
 * ── 这一层能证明什么、不能证明什么 ────────────────────────────
 * jsdom 会**真的层叠一遍**(所以能照出「新规则被别的规则压住了」这类事故),
 * 但它**不做排版**:没有断行、没有真实宽度。所以本文件断言的是「规则确实生效、
 * 确实是最终胜出的那条」,几何观感仍需在真浏览器里量一次。
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import type { QuestionForm } from '../../../src/artifacts/question-form';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = resolve(HERE, '../../../src/styles/viewer/composio.css');
const CSS = readFileSync(CSS_PATH, 'utf-8');
/*
 * `primitives.css` 必须一起注进来,而且**顺序照 `index.css`**(它在 composio 之前)。
 *
 * 理由不是「更真实」这种笼统的好处,而是:这一族的病根就在它里面 ——
 * 裸元素选择器 `button { white-space: nowrap }`。选项行 `.qf-chip` 是个 `<button>`,
 * 于是整行连同描述文字都不许换行。少注这一份,jsdom 里 `white-space` 会读回
 * 浏览器默认的 `normal`,断言不用修就是绿的 —— 那种测试从没红过,证明不了任何事。
 */
const PRIMITIVES = readFileSync(
  resolve(HERE, '../../../src/styles/primitives.css'),
  'utf-8',
);

/** 稿子写死的竖线单位:`.opts.mod-stack` 的 6 + `.opt` 的 5。 */
const RAIL = 11;

beforeAll(() => {
  // 整表原样注进去,不切片 —— 切片等于自己挑对手
  const style = document.createElement('style');
  style.textContent = [PRIMITIVES, CSS]
    .map((sheet) => sheet.replace(/\/\*[\s\S]*?\*\//g, ''))
    .join('\n');
  document.head.append(style);
});

afterEach(cleanup);

const form: QuestionForm = {
  id: 'scope',
  title: '设置页要不要沿用列表页的商品卡组件',
  lang: 'zh-CN',
  questions: [
    {
      id: 'scope',
      label: '除了设置页,还有哪几页要一起换成新的商品卡?',
      type: 'radio',
      required: true,
      options: [
        {
          label: '商品详情页',
          value: 'pdp',
          description:
            '沿用列表页那张卡的结构(image / title / price / badge),只把外框换成新的圆角。',
        },
        { label: '搜索结果页 —— 里面那张卡是列表页的窄版', value: 'search' },
      ],
    },
  ],
};

function mount(): HTMLElement {
  const { container } = render(
    <div className="app">
      <div className="root" data-chat-root="">
        <QuestionFormView form={form} interactive onSubmit={() => undefined} />
      </div>
    </div>,
  );
  return container;
}

/** 把整表拍平成 { 选择器, 声明 } 的列表,用来验「最终胜出的是哪条」。 */
function rules(): { sel: string; body: string }[] {
  const stripped = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: { sel: string; body: string }[] = [];
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = (m[2] ?? '').replace(/\s+/g, ' ').trim();
    for (const one of (m[1] ?? '').split(',')) {
      const sel = one.split(/\s+/).join(' ').trim();
      if (sel && !sel.startsWith('@')) out.push({ sel, body });
    }
  }
  return out;
}

describe('OPEND-2402 · 选项文案不许压到卡的右边框上', () => {
  it('文案列缩得下去(min-width: 0),不再把自己顶出容器', () => {
    const root = mount();
    const copy = root.querySelector<HTMLElement>('.qf-chip-copy');
    expect(copy, '选项里找不到 `.qf-chip-copy`').toBeTruthy();
    expect(
      getComputedStyle(copy!).minWidth,
      'flex 项默认 min-width:auto,缩不到 min-content 以下 —— 长词会顶出卡外',
    ).toBe('0px');
  });

  it('长到断不开的词允许在任意位置断行', () => {
    const root = mount();
    const copy = root.querySelector<HTMLElement>('.qf-chip-copy')!;
    expect(['anywhere', 'break-word']).toContain(getComputedStyle(copy).overflowWrap);
  });

  /*
   * 这一条才是用户看到的那个缺陷的真正病根,`min-width` / `overflow-wrap` 都是
   * 在它下面空转:`primitives.css` 的裸 `button { white-space: nowrap }` 命中了
   * 选项行(`.qf-chip` 就是个 `<button>`),并**继承**给里面的标题和描述。
   * 不许换行的时候,「能缩到多窄」和「能不能在词中间断」都不会被用到 ——
   * 无头 Chrome 量出来的是描述行 scrollWidth 373 / clientWidth 327,溢出 46px,
   * 被卡片的 `overflow: hidden` 裁掉。
   */
  it('选项行不继承全局 button 的 nowrap —— 描述文字必须能换行', () => {
    const root = mount();
    const chip = root.querySelector<HTMLElement>('.qf-chip')!;
    expect(chip.tagName, '前提变了:选项行不再是 <button>,这条守的东西就不存在了').toBe(
      'BUTTON',
    );
    expect(
      getComputedStyle(chip).whiteSpace,
      '选项行还在吃 primitives.css 的 `button { white-space: nowrap }`',
    ).toBe('normal');
  });

  /*
   * 描述行靠**继承**拿到可换行,而 jsdom 不做继承计算:`.qf-chip-desc` 上
   * `getComputedStyle().whiteSpace` 读回空串,修不修都一样。所以这一层只守
   * 两件 jsdom 真能看见的事 ——(1)描述行确实长在选项行里面(继承的前提),
   * (2)没有任何一条规则在这棵子树上把 `nowrap` 又写回来。
   * 真实换行与溢出由无头 Chrome 量:修复前描述行 scrollWidth 373 / clientWidth 327
   * (溢出 46px),修复后 scrollWidth === clientWidth。
   */
  it('描述行长在选项行里面 —— 可换行是继承来的', () => {
    const root = mount();
    const desc = root.querySelector<HTMLElement>('.qf-chip-desc');
    expect(desc, '这一格没渲染出描述行,下面守的东西不存在').toBeTruthy();
    expect(desc!.closest('.qf-chip'), '描述行不在选项行里,继承链断了').toBeTruthy();
  });

  it('没有任何一条规则把 nowrap 写回选项行子树', () => {
    const offenders = rules().filter(
      (r) => /\.qf-chip/.test(r.sel) && /white-space:\s*nowrap/.test(r.body),
    );
    expect(offenders.map((r) => r.sel)).toEqual([]);
  });

  /*
   * 左右内距只能用**逻辑属性**(`padding-inline-*`):这张卡要在 ar / fa 下镜像,
   * 写死 `padding-left/right` 会把「靠问句那一侧」钉在物理左边。
   * 代价是 jsdom 的 cssstyle **不实现逻辑属性**(实测:写了 `padding-inline: 5px`,
   * `getComputedStyle().paddingLeft` 仍是上一条物理简写留下的 11px)。
   * 所以这两条改走「把整表拍平、看最终胜出的是哪条」,不走 getComputedStyle。
   */
  it('左边仍落在稿子那条 11px 竖线上,右边多留一格', () => {
    const chipRules = rules().filter(
      (r) => r.sel === '.qf-options .qf-chip' && /padding-inline/.test(r.body),
    );
    expect(chipRules.length, '找不到 `.qf-options .qf-chip` 的左右内距规则').toBe(1);
    const body = chipRules[0]!.body;
    // 左边不动 —— 列表自己出 6,选项出 5,合起来正是 11
    expect(body).toMatch(/padding-inline-start:\s*5px/);
    const end = /padding-inline-end:\s*(\d+)px/.exec(body);
    expect(end, '右侧内距没有单独写出来').toBeTruthy();
    expect(Number(end![1]), '右侧没有比左侧多留出余量').toBeGreaterThan(5);

    const list = rules().find((r) => r.sel === '.qf-options' && /padding:/.test(r.body));
    expect(list!.body).toMatch(/padding:\s*0 6px 8px/);
    expect(6 + 5).toBe(RAIL);
  });

  it('右侧内距不会被后面某条 `.qf-chip` 的简写又刷回去', () => {
    const chipRules = rules().filter(
      (r) => /(^|\s)\.qf-chip$/.test(r.sel) && /padding(-inline)?:/.test(r.body),
    );
    expect(chipRules.length, '找不到任何给选项设内距的规则').toBeGreaterThan(0);
    // `padding-inline: <一个值>` 的简写会把左右一起刷掉 —— 这一族的事故形态
    for (const rule of chipRules) {
      expect(
        rule.body,
        `\`${rule.sel}\` 用了单值 padding-inline 简写,会把右侧那格余量刷掉`,
      ).not.toMatch(/padding-inline:\s*[^;]+;?\s*$/);
    }
  });
});

describe('OPEND-2401 · 必填角标与「下一步」的可读性', () => {
  it('「必填」角标不再是 10px 的浅灰', () => {
    const root = mount();
    const badge = root.querySelector<HTMLElement>('.qf-required');
    expect(badge, '找不到 `.qf-required`').toBeTruthy();
    const cs = getComputedStyle(badge!);
    // 两边都钉死具体值 —— `not.toBe('var(--text-muted)')` 在属性压根没落下来
    // (空串)时会永真,那种断言从没红过,也就证明不了任何事
    expect(cs.fontSize, '10px 太小,用户反馈「不容易看清」').toBe('11px');
    expect(cs.color, '还停在 --text-muted 这一档').toBe('var(--text)');
    // 细圈也要跟着抬一档。这条只能看规则原文:jsdom 会把 `border` 简写拆开,
    // 而它不认 `var()`,`borderTopColor` 一律读回 `rgba(0, 0, 0, 0)` —— 拿它断言
    // 等于断言一个常量。
    const rule = rules().find((r) => r.sel === '.qf-required' && /border:/.test(r.body));
    expect(rule!.body).toMatch(/border:\s*1px solid var\(--border-strong\)/);
  });

  /*
   * 这一条原来断言的是 `min-width: 76px` + `padding-inline: ≥14px`。两个数在
   * 交付稿(`8015870095:docs/design/chat-panel/src/components.css`)里**零命中** ——
   * 稿子的底栏主按钮是 `.btn.mod-primary.mod-sm`,内距来自
   * `.btn.mod-sm { padding: 4px 11px }`,而 `.btn` 一族一条 `min-width` 都没有。
   * 那 14px 属于**非 sm 档**的基底 `.btn { padding: 6px 14px }`,写到这颗按钮上
   * 等于把档位改回去,用户看到的就是「又宽又肥」。
   * 稿子只写死高度,理由写在它自己的注释里(字号一动,靠内距撑出来的尺寸就漂),
   * 而 W8 把 chat 基线字号 14 → 13 之后正好漂了。
   * 尺寸的完整判据挪到 `question-form-next-button-size.test.tsx`(带层叠解析器,
   * 能量到共享 `Button` 的 `.sm` 真的给了 11px);这里只留稿子那一个指定值。
   */
  it('「下一步」只钉稿子指定的 32px 高,宽度和内距都交给共享 `Button` 的 sm 档', () => {
    const root = mount();
    const next = root.querySelector<HTMLElement>('.qf-primary-action');
    expect(next, '找不到 `.qf-primary-action`').toBeTruthy();
    // 高度这一条是稿子定的,不许被顺手改掉
    expect(getComputedStyle(next!).height).toBe('32px');

    // 宽度地板:稿子没有,我们也不许有(jsdom 的初值就是 auto)
    expect(
      getComputedStyle(next!).minWidth,
      '稿子的 `.btn` 一族零 min-width —— 给地板值会把短文案的按钮撑开',
    ).toBe('auto');

    // 水平内距走逻辑属性(jsdom 看不见),改用拍平后的规则:这里不该再有覆盖
    expect(
      rules()
        .filter((r) => /\.qf-primary-action/.test(r.sel) && /padding-inline|min-width/.test(r.body))
        .map((r) => r.sel),
      '又有人给「下一步」加内距 / 宽度地板了 —— 稿子把这两件事交给 `.mod-sm`',
    ).toEqual([]);
  });
});
