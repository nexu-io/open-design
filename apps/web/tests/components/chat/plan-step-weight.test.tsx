// @vitest-environment jsdom
/**
 * 计划卡里那几步的**字重**(交付稿组件 6 · 第 72 格,PR #7170 `plan-todo.css`)。
 *
 * ## 为什么这条是今天新长出来的
 *
 * 稿子写的是两档:
 *
 *     .steps li        { … font-weight: 400 … }
 *     .steps li.is-now { color: var(--plan-current-text); font-weight: 600; }
 *
 * 稿子的 `body` 基线是 500,所以那个 400 的意思是「**比基线轻一档**」——
 * 非当前的几步要往后退,当前那一步的 600 才立得住,一张卡里只有一行是深的。
 *
 * 产品这边 `.steps li` **一直没写 font-weight**。在基线还是 400 的时候,
 * 「不写」恰好等于「400」,两边碰巧一致;`0334a6599d`(排版基线落到 chat 接缝,
 * 400 → 500)之后,「不写」变成了 **500** —— 非当前的几步凭空重了一档,
 * 和当前那一步的 600 只差一档,层次被压平。
 *
 * 也就是说:这不是一条陈年偏差,是**基线落地当天新造出来的**。W3 那份盘点
 * (基准 `c5d5a9e621`)把它记成「产品没写」,当时是个无害的空缺,现在不是了。
 *
 * ## 尺子
 *
 * 必须在**接缝里**量。`font-weight: 500` 写在 `ChatRoot.module.css` 的
 * `.vars, .root` 上,只有挂了接缝的子树才继承得到 —— 把药丸裸渲染在 body 下,
 * 它会继承全站的 400,于是**坏掉的实现也会读出 400**,这条断言就成了假绿。
 * 所以夹具走 `chatSeam()`,和产线(`ChatPane.tsx` 的 `chatSeam('pane')`)同一条链;
 * 第一个 describe 先证明这把尺子确实看得见那一档继承。
 *
 * 层叠按 `index.css` 的真实导入顺序整条注入,再叠上相关的三支 CSS Module
 * (类名按 vitest 实际发下来的哈希改写,和打包器做的是同一件事)。
 * 两端都钉字面值 `400` / `600`,不写「两者不等」。
 */
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { I18nProvider } from '../../../src/i18n';
import { PlanPill } from '../../../src/components/chat/PlanPill';
import { chatSeam } from '../../../src/components/chat/ChatRoot';
import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import planStyles from '../../../src/components/chat/PlanPill.module.css';
import recordStyles from '../../../src/components/chat/primitives/record.module.css';
import { readExpandedIndexCss } from '../../helpers/read-expanded-css';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');

/** 稿子的字面值 —— 判据的锚,不从实现里读回来 */
const DESIGN_STEP_WEIGHT = '400';
const DESIGN_CURRENT_WEIGHT = '600';
/** 接缝的基线。坏掉的实现读出来的就是这个数。 */
const SEAM_BASELINE_WEIGHT = '500';

type Sheet = { path: string; styles: Record<string, string | undefined> };

const SHEETS: Sheet[] = [
  {
    // 基线本身就住在这支接缝表里 —— 不注入它,量到的永远是全站 400,
    // 于是坏掉的实现照样「对」。
    path: resolve(SRC, 'components/chat/ChatRoot.module.css'),
    styles: chatRootStyles as Record<string, string | undefined>,
  },
  {
    path: resolve(SRC, 'components/chat/PlanPill.module.css'),
    styles: planStyles as Record<string, string | undefined>,
  },
  {
    path: resolve(SRC, 'components/chat/primitives/record.module.css'),
    styles: recordStyles as Record<string, string | undefined>,
  },
];

/** 把局部名改写成 vitest 实际发下来的哈希名,和打包器做的是同一件事。 */
function scoped({ path, styles }: Sheet): string {
  return readFileSync(path, 'utf-8').replace(/\.(-?[A-Za-z_][\w-]*)/g, (whole, name: string) => {
    const hit = styles[name];
    return typeof hit === 'string' && hit.length > 0 && hit !== name ? `.${hit}` : whole;
  });
}

function injectStyles(): void {
  for (const text of [readExpandedIndexCss(), ...SHEETS.map(scoped)]) {
    const style = document.createElement('style');
    style.textContent = text;
    style.dataset.odTestSheet = '';
    document.head.appendChild(style);
  }
}

const TODOS = [
  { content: '第一步', status: 'completed' },
  { content: '第二步', status: 'in_progress' },
  { content: '第三步', status: 'pending' },
] as const;

/** 挂接缝的夹具 —— 产线里药丸就长在 `chatSeam('pane')` 的子树里 */
function mount({ seam = true }: { seam?: boolean } = {}): HTMLElement {
  const { container } = render(
    <I18nProvider initial="zh-CN">
      {seam ? (
        <div {...chatSeam()}>
          <PlanPill running todos={[...TODOS]} />
        </div>
      ) : (
        <PlanPill running todos={[...TODOS]} />
      )}
    </I18nProvider>,
  );
  const app = document.createElement('div');
  app.className = 'app';
  document.body.appendChild(app);
  app.appendChild(container);
  return container;
}

/** jsdom 把 400 / 700 算成关键字。折回数字再钉字面值。 */
const weightOf = (el: Element): string => {
  const raw = getComputedStyle(el).fontWeight;
  return raw === 'normal' ? '400' : raw === 'bold' ? '700' : raw;
};

const stepOf = (root: HTMLElement, text: string): HTMLElement =>
  [...root.querySelectorAll<HTMLElement>('li')].find((li) => li.textContent?.includes(text))!;

afterEach(() => {
  cleanup();
  document.querySelectorAll('style[data-od-test-sheet]').forEach((n) => n.remove());
  document.querySelectorAll('.app').forEach((n) => n.remove());
});

describe('这把尺子看得见缺陷', () => {
  it('哈希改写是真的在做事', () => {
    expect(planStyles.steps).toBeTruthy();
    expect(planStyles.steps).not.toBe('steps');
  });

  it('接缝真的把 500 传下来了 —— 不挂接缝就量不到,那种夹具会假绿', () => {
    injectStyles();
    const inSeam = mount();
    const seamRoot = inSeam.querySelector<HTMLElement>('[data-chat-root]')!;
    expect(weightOf(seamRoot)).toBe(SEAM_BASELINE_WEIGHT);
    cleanup();
    const bare = mount({ seam: false });
    expect(bare.querySelector('[data-chat-root]')).toBeNull();
    // 裸渲染继承全站 body 的 400 —— 正好等于稿子要的值,所以坏的实现也会「对」
    expect(weightOf(document.body)).toBe(DESIGN_STEP_WEIGHT);
  });
});

describe('计划卡:非当前的几步比基线轻一档', () => {
  it('未开始那一步是 400', () => {
    injectStyles();
    const root = mount();
    expect(weightOf(stepOf(root, '第三步'))).toBe(DESIGN_STEP_WEIGHT);
  });

  it('做完那一步也是 400 —— 划线不兼职表达轻重', () => {
    injectStyles();
    const root = mount();
    expect(weightOf(stepOf(root, '第一步'))).toBe(DESIGN_STEP_WEIGHT);
  });

  it('反向对照:当前那一步仍然是 600,唯一被强调的一行', () => {
    injectStyles();
    const root = mount();
    expect(weightOf(stepOf(root, '第二步'))).toBe(DESIGN_CURRENT_WEIGHT);
  });
});
