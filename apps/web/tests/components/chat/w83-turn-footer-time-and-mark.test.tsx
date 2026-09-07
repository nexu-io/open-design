// @vitest-environment jsdom
/**
 * 回合状态行的两件事:**右端的时间**(稿子 15-1 / 镜像陈列页第 34 格)与
 * **左边那枚记号**(稿子 15-6 / 第 39 格)。
 *
 * 这两条在 `docs/design/chat-mirror/README.md` 里被记成「照出来但没修」,
 * 到 2026-09-02 已经都修完了(时间两条分支都传、外层不再限宽、中断档换回灰点)。
 * 这个文件补的是**已有测试没盖到的那半边** —— 那半边全是反向对照:
 *
 *  · `footer-time.test.tsx` 只在**源码文本**上钉「`footerProps` 里有 `createdAt`」,
 *    没有任何一条从**渲染结果**上看到过那串 `14:32`。字段改名、`formatClock` 抛、
 *    `streaming` 判断写反,三种都能让它绿着过。
 *  · 那条「外层不许限宽」是**纯否定式**断言,而且规则找不到时回退成空串 ——
 *    类名一改就永远真。否定式断言必须配一条「规则确实存在」的正面守卫。
 *  · `canceled-turn-row.test.tsx` 钉住了中断档是 `<i>`,但**没有一条**说完成档是
 *    `<svg>`。只钉一半的话,把两档都改成 `<i>` 照样全绿 —— 那正是「灰点」这条
 *    修复最容易被顺手改死的方式。
 *
 * 所以这里的每一条都成对出现:中断档怎么样,**完成档必须同时被钉住不许跟着变**。
 */

import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantFooter, AssistantMessage } from '../../../src/components/AssistantMessage';
import type { ChatMessage } from '../../../src/types';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
});

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
/** 注释里正好把 `max-width` 解释了一遍,不剥掉就会把注释当成规则读。 */
const THEATER = readFileSync(
  resolve(HERE, '../../../src/styles/viewer/theater.css'),
  'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** 稿子右端写的就是 `14:32`。按**本地时间**构造,免得跨时区跑出别的数(同镜像页)。 */
const REPLY_AT = new Date(2026, 7, 20, 14, 32).getTime();

function turn(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm-1',
    role: 'assistant',
    content: '列表页复刻完了。',
    startedAt: REPLY_AT - 42_000,
    endedAt: REPLY_AT,
    createdAt: REPLY_AT,
    events: [] as ChatMessage['events'],
    producedFiles: [],
    ...over,
  } as ChatMessage;
}

function renderTurn(message: ChatMessage, streaming = false) {
  return render(
    <AssistantMessage
      message={message}
      streaming={streaming}
      isLast
      projectId="p1"
      errorCardOwnerId={null}
      onFeedback={vi.fn()}
      onForkFromMessage={vi.fn()}
    />,
  );
}

const timeOf = (root: HTMLElement) => root.querySelector('.assistant-footer .assistant-footer-time');
const hasFeedback = (root: HTMLElement) =>
  !!root.querySelector('[data-testid="assistant-feedback-positive"]');

/* ── 时间 ────────────────────────────────────────────────────────────── */

describe('回合状态行右端的时间 · 两条分支都要出得来', () => {
  it('有反馈按钮的那条分支出时间 —— 它才是最常见的路径', () => {
    const { container } = renderTurn(turn({ id: 'm-ok', runStatus: 'succeeded' }));
    // 前提:这一格走的**确实是**有反馈按钮那条分支。不钉住的话,
    // 哪天 `isFeedbackEligible` 改判,这条就悄悄跑去测另一条分支了。
    expect(hasFeedback(container), '这一格没走「有反馈按钮」那条分支,下面测的就不是它了').toBe(true);

    const time = timeOf(container);
    expect(time, '有反馈按钮的那条分支没出时间').toBeTruthy();
    expect(time!.textContent).toBe('14:32');
    expect(time!.getAttribute('datetime')).toBe(new Date(REPLY_AT).toISOString());
  });

  it('反向对照:没有反馈按钮的那条分支照样出时间(它本来就是对的)', () => {
    const { container } = renderTurn(turn({ id: 'm-stop', runStatus: 'canceled' }));
    expect(hasFeedback(container), '中断的一轮不该有赞 / 踩').toBe(false);

    const time = timeOf(container);
    expect(time, '没有反馈按钮的那条分支丢了时间').toBeTruthy();
    expect(time!.textContent).toBe('14:32');
  });

  /*
   * 这一条**不能走 `AssistantMessage`**:整轮还在流的时候 `showCompletionRow` 是 false,
   * 连状态行本身都不渲染,于是「找不到时间」是因为整行不在,不是因为那道 `!streaming` 守卫
   * 起了作用 —— 断言会空过(实测 `footer=false`)。所以直接摆这一行,把守卫单独逼出来。
   */
  it('防真空:整行在、`createdAt` 也给了,但还在流的时候时间不出 —— 上面两条不是「永远找得到一个 time」', () => {
    const { container } = render(
      <AssistantFooter
        streaming
        hasUnfinishedTodos={false}
        hasEmptyResponse={false}
        copyMarkdown="x"
        forceVisible
        isLast
        createdAt={REPLY_AT}
      />,
    );
    // 守卫的前提:这一行**确实渲染出来了**,否则下面那条 null 是白得的
    expect(container.querySelector('[data-testid="assistant-footer"]'), '整行都没出来,下面的断言会空过').toBeTruthy();
    expect(timeOf(container), '运行中也把时间画出来了(状态由壳头报,时间等落定再说)').toBeNull();
  });
});

describe('回合状态行要撑得满,时间才贴得到右端', () => {
  const wrapRule = /\.assistant-feedback-wrap\s*\{([^}]*)\}/.exec(THEATER)?.[1];

  it('防真空:先证明这条规则真的读到了(否则下面的否定式断言永远真)', () => {
    expect(wrapRule, '没读到 `.assistant-feedback-wrap` 规则 —— 类名改了?').toBeDefined();
    expect(wrapRule!.trim().length).toBeGreaterThan(0);
  });

  it('不限宽:限了宽,中间那根弹簧就没有空间可撑', () => {
    expect(wrapRule!, '外层还限着宽').not.toMatch(/max-width/);
  });

  it('正面钉住满宽 —— 光「没有 max-width」不够,`inline-flex` 一样会收缩成内容宽', () => {
    expect(wrapRule!, '外层没有写死满宽').toMatch(/width:\s*100%/);
    expect(wrapRule!, '外层是 inline-flex,还是会收缩成内容宽').not.toMatch(/display:\s*inline-/);
  });
});

/* ── 记号:勾 vs 点 ──────────────────────────────────────────────────── */

/** 换勾那条规则(`--tick-img`)的选择器 —— 从 CSS 里读,不手抄。 */
function tickSelector(): string {
  for (const block of THEATER.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/tick-img/.test(block[2] ?? '')) return (block[1] ?? '').trim().replace(/\s+/g, ' ');
  }
  throw new Error('找不到画完成勾那条规则');
}

const dotOf = (root: HTMLElement) => root.querySelector('.assistant-footer .dot');

describe('回合状态行的记号 · 「过了」画勾,「停了」画点', () => {
  it('防真空:完成档用的是 `<svg>` —— 这一条是下面「中断档不是勾」的量尺', () => {
    const { container } = renderTurn(turn({ id: 'm-ok', runStatus: 'succeeded' }));
    const dot = dotOf(container);
    expect(dot, '完成档没渲染出记号').toBeTruthy();
    expect(dot!.tagName.toLowerCase(), '完成档不再是勾那一档的 <svg> 了').toBe('svg');
  });

  it('中断档用的是 `<i>`:点只说「有个状态」,勾说的是「过了」', () => {
    const { container } = renderTurn(turn({ id: 'm-stop', runStatus: 'canceled' }));
    const dot = dotOf(container);
    expect(dot, '中断档没渲染出记号').toBeTruthy();
    expect(dot!.tagName.toLowerCase(), '中断的一轮戴上了完成勾').toBe('i');
    // 点不许还在跳 —— `data-active` 那一档是「正在跑」的绿色脉冲
    expect(dot!.getAttribute('data-active')).not.toBe('true');
  });

  it('换勾那条规则命中完成档、**不**命中中断档', () => {
    const sel = tickSelector();
    // 量尺自证:这条选择器必须真的能命中点什么,否则下面的 false 是白得的
    const ok = renderTurn(turn({ id: 'm-ok', runStatus: 'succeeded' }));
    const okDot = dotOf(ok.container);
    expect(okDot!.matches(sel), `完成档没被换勾规则命中(${sel})`).toBe(true);
    cleanup();

    const stopped = renderTurn(turn({ id: 'm-stop', runStatus: 'canceled' }));
    const stoppedDot = dotOf(stopped.container);
    expect(stoppedDot!.matches(sel), '中断档被换勾规则命中了').toBe(false);
  });

  /*
   * ── 别拿陈列页的读数当产品缺陷 ────────────────────────────────────
   * 2026-09-02 有一轮逐格量尺报了两条「颜色淡一档 / 分界行五条全错」,量下来
   * **两条都是陈列页的内联缺口**,产品这边一个字都不用改:
   *
   *  · 那一排按钮的静音色是 `--chat-message-muted-ink`(#a3a3a3),声明在
   *    `chat.css` 的 `.msg, .fork-note` 上。陈列页把这一格**裸挂**、没有 `.msg` 祖先,
   *    于是 token 未定义、兜底 `--text-soft`(#848484)顶上 —— 量出来就淡一档。
   *    产线上整轮都住在 `.msg.assistant` 里(`AssistantMessage.tsx` 的根节点),
   *    真 Chrome 里补一层 `.msg` 再量就回到 #a3a3a3。产品侧的钉子是
   *    `feedback-muted-ink.test.tsx`(整条层叠链,12 条,一直是绿的)。
   *    ⚠️ 尤其别把那五处兜底改成 `--text-faint` —— 它是 **#bdbdbd**,比目标还淡,
   *    而且在产线上根本轮不到兜底生效,改了等于只把陈列页越描越黑。
   *
   *  · 分界脚注同理:`mirror-gallery.test.tsx` 的 `pick()` 没给 `.fork-sep` /
   *    `.fork-note` 配选择器,那两条规则**压根没被内联进去**,量到的是裸 div 的
   *    浏览器默认值(block / 无 gap / padding 0 / 继承来的 13px 与 #494949)。
   *    下面这条把稿子要的五个值钉在 `chat.css` 上,免得有人照着那份读数去「修」。
   */
  it('反向对照:分界脚注这五条在 chat.css 里本来就是对的(陈列页量到的是没内联)', () => {
    const chatCss = readFileSync(resolve(HERE, '../../../src/styles/chat.css'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    // 两条同名规则:一条只声明 token,一条才是真正的排版。挑**声明了 display 的**那条。
    const rules = [...chatCss.matchAll(/(^|[};])\s*\.fork-note\s*\{([^{}]*)\}/g)].map((m) => m[2] ?? '');
    expect(rules.length, '一条 `.fork-note` 规则都没读到').toBeGreaterThanOrEqual(1);
    const layout = rules.find((b) => /display\s*:/.test(b));
    expect(layout, '没有哪条 `.fork-note` 规则在排版 —— 断言会空过').toBeDefined();
    expect(layout!).toMatch(/display:\s*flex/);
    expect(layout!).toMatch(/gap:\s*6px/);
    expect(layout!).toMatch(/padding-bottom:\s*2px/);
    expect(layout!).toMatch(/font-size:\s*var\(--font-size-12\)/);
    expect(layout!).toMatch(/color:\s*var\(--chat-message-muted-ink\)/);
  });

  it('反向对照:中断档单独有一条规则把点染灰、把字压到中性档', () => {
    const bodies = [...THEATER.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => /assistant-footer\[data-canceled="true"\]/.test(m[1] ?? ''))
      .map((m) => `${m[1]}{${m[2]}}`);
    expect(bodies.length, '中断档一条专属规则都没有').toBeGreaterThanOrEqual(2);
    expect(bodies.join('\n')).toMatch(/\.dot[\s\S]*?background:\s*var\(--text-faint\)/);
    expect(bodies.join('\n')).toMatch(/\.assistant-label[\s\S]*?color:\s*var\(--text-muted\)/);
  });
});
