// @vitest-environment jsdom
/**
 * OPEND-2745 —「记忆相关消息露出原始 XML / 标签文本」的**推理流那一条残余路径**。
 *
 * ── 工单原话 ──────────────────────────────────────────────────────
 * 预期结果:「任何阶段都不应向用户暴露原始 `od-card` 标签或 JSON。」
 * 修复建议 ④:「确保 `memory-applied` 在 streaming 与持久化回放两条路径都统一
 *              经过 `splitOnOdCards()`。」
 *
 * ── 已经修掉的那一半 ──────────────────────────────────────────────
 * QA 在 Beta `0.21.1-beta.7` 的附件里拍到的是**合法**的
 * `<od-card type="memory-applied">` 摊在执行记录壳的叙述位上。那一条已由 #7956
 * 关掉:`SayBlock` 改走 `splitShellCards`,壳内叙述和壳外正文用同一支解析器。
 * 本文件**不**重复那个用例 —— `od-card-inside-execution-shell.test.tsx` 已经钉住了。
 *
 * ── 本文件钉住的缺口 ──────────────────────────────────────────────
 * **thinking(推理)流**。`ExecutionShell` 把 `kind:'thinking'` 的文本交给
 * `ThinkingMarkdown` → `renderMarkdown`,**整条链上没有 `splitShellCards`**。
 * 系统提示词(`apps/daemon/src/prompts/system.ts:1220`)是让模型「emit one compact
 * chip」的,并没有规定它只能出现在正文而不能出现在推理里;模型一旦把这枚 chip
 * 写进推理,标签原文就原样摊给用户 —— 和 beta.7 那张截图是同一个观感。
 *
 * ⚠️ 判据只写「用户看不到 `<od-card` 原文」,**不规定**怎么做到 —— 这是行为级的,
 * 不断言某个函数被调用过。
 *
 * ── 解析失败的卡:裁决已下(2026-09-18)───────────────────────────
 * `splitOnOdCards` 原本对**解析失败**的卡保留原文(源码注释:`Malformed — keep raw
 * text so the user can still see it`)。用户裁决把它推翻了:
 *
 *   「od-card 如果 json 不对, 就不显示, 不然用户会觉得是乱码...还不如不显示」
 *
 * 于是 §② 钉住这条:JSON 尾逗号 / 缺 `summary` / `type` 拼错 —— 三种模型自己拼 chip
 * 时真会犯的手滑 —— 都**不得**把 `<od-card …>{…}</od-card>` 当成用户正文画出来。
 *
 * ⚠️ 「写坏了」和「还在写」是两回事:一张卡在流式里是一个 delta 一个 delta 长出来的,
 * 任何一帧都还没闭合,那不是畸形块。§② 边界那一节钉住这条,防止裁决顺手把流式吞掉。
 *
 * ── 反向锚点(少了它修复会退化成「见 od-card 就吞」)────────────────
 * ① 围栏代码块里引用的 od-card **必须**留着原文:那是文档/教程在讲协议本身。
 * ② 壳外正文里的合法卡照旧走 `OdCardView`(OPEND-2607 防回归)。
 */

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { SayBlock } from '../../../src/components/chat/SayBlock';
import {
  ThinkingMarkdown,
  THINKING_MARKDOWN_COMMIT_MS,
} from '../../../src/components/chat/ThinkingMarkdown';
import { memoryWrittenCardContent } from '../../../src/runtime/useMemoryWrittenCard';
import type { ChatMessage } from '../../../src/types';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** 合法记忆卡 —— 走**产线那支**生成器,形状变了这条要跟着红。 */
const VALID_CARD = memoryWrittenCardContent(
  { key: 'ext-2745', count: 1, entries: [{ id: 'user_profile', name: 'Work profile', type: 'profile' }] },
  '已记住 1 条偏好',
);

/** 解析失败的三种真实手滑,都保留了完整的开闭标签 —— 它们是**写完了的**,不是写到一半。 */
const UNPARSEABLE = {
  'JSON 尾逗号': '<od-card type="memory-applied">{"summary":"已记住 1 条偏好","used":[],}</od-card>',
  '缺 summary': '<od-card type="memory-applied">{"used":[{"type":"profile","name":"Work profile"}]}</od-card>',
  'type 拼错': '<od-card type="memory-written">{"summary":"已记住 1 条偏好","used":[]}</od-card>',
} as const;

function renderAssistantProse(content: string): string {
  render(
    <AssistantMessage
      message={{
        id: 'assistant-turn',
        role: 'assistant',
        content,
        events: [{ kind: 'text', text: content }],
        runId: 'run-1',
        runStatus: 'succeeded',
        createdAt: 1_700_000_000_000,
        startedAt: 1_700_000_000_000,
        endedAt: 1_700_000_003_000,
      } as ChatMessage}
      streaming={false}
      projectId="project-1"
      conversationId="conversation-1"
      isLast
    />,
  );
  return document.body.textContent ?? '';
}

describe('OPEND-2745 ① 推理流里的记忆卡不得摊出标签原文', () => {
  it('合法的 memory-applied 写进 thinking —— 用户看到的是卡或一句话,不是标签', () => {
    render(<ThinkingMarkdown texts={[`先看一下用户的偏好。\n\n${VALID_CARD}`]} live={false} />);
    const text = document.body.textContent ?? '';

    // 正向锚点:推理正文**还在**。少了它,下面那条可以因为「整块没渲染」而假绿。
    expect(text, '推理正文整块没渲染 —— 夹具坏了,别改断言').toContain('先看一下用户的偏好');

    expect(text, '推理流把 od-card 标签原文摊给用户看了(OPEND-2745 预期④)')
      .not.toContain('<od-card');
  });
});

/**
 * 推理流是**流式**的:一枚 chip 是一个 delta 一个 delta 长出来的。两个都不许发生 ——
 * 半截标签闪出原文,或者「卡还没闭合」把它**前面**已经写完的推理正文一起吞掉。
 */
describe('OPEND-2745 ① 流式:半截卡既不闪原文也不吞正文', () => {
  const PROSE = '先看一下用户的偏好。';

  it('标签名只写了一半', () => {
    render(<ThinkingMarkdown texts={[`${PROSE}\n\n<od-ca`]} live />);
    const text = document.body.textContent ?? '';
    expect(text, '半截标签把它前面的推理正文一起吞了').toContain(PROSE);
    expect(text, '半截标签直接闪给用户看了').not.toContain('<od-ca');
  });

  it('开标签写完了、JSON 还在写', () => {
    render(
      <ThinkingMarkdown
        texts={[`${PROSE}\n\n<od-card type="memory-applied">{"summary":"已记住 1 条`]}
        live
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text, '卡还没闭合就把它前面的推理正文一起吞了').toContain(PROSE);
    expect(text, '没闭合的卡把标签原文闪给用户看了').not.toContain('<od-card');
  });

  it('卡闭合的那一帧渲染成卡,正文照旧在', () => {
    render(<ThinkingMarkdown texts={[`${PROSE}\n\n${VALID_CARD}`]} live />);
    const text = document.body.textContent ?? '';
    expect(text).toContain(PROSE);
    expect(text).not.toContain('<od-card');
    expect(
      document.querySelector('[data-od-card="memory-applied"]'),
      '推理流里的卡被当噪音删掉了 —— 解析口径要和正文一致,不是「见 od-card 就吞」',
    ).not.toBeNull();
  });
});

/**
 * **卡片不是正在被敲出来的字 —— 它不进逐字化开。**
 *
 * `ThinkingMarkdown` 的化开根是外层那只 `<div ref={rootRef}>`,`useCharReveal`
 * 会遍历**整棵子树**的文本节点。卡片渲染进这棵子树之后,流式期间卡片一闭合,
 * 可见文本长度会跳一大截,化开逻辑会把**卡片内部**的文本节点当成「刚到的字」
 * 去截短、往后追加 `data-char-reveal` span。
 *
 * 那正是 `useCharReveal` 文件头警告过的形状:那些节点是 React 建的、React 还要
 * 接着更新,两边打架的表现是「后面的字更新不上去」或多出来的字永久留在正文里。
 *
 * 对照组是 `SayBlock`:它给每段散文单独发一个 `SayText`(化开根在 `SayText`
 * **内部**),卡片天然落在所有化开根**之外** —— 所以壳内那条通道从来不需要处理这件事。
 */
describe('OPEND-2745 ① 流式:卡片不进逐字化开', () => {
  const PROSE = '先看一下用户的偏好。';
  const HALF_CARD = '<od-card type="memory-applied">{"summary":"已记';

  /**
   * 半截卡 → 卡片闭合(`tail` 是这一帧同时新写出来的散文)。
   *
   * **必须推进到第二帧**:挂载那一帧 `useCharReveal` 按「挂载即落定」原地返回,
   * 一个 span 都不拆 —— 只看首帧的话这一组会全部假绿。
   */
  function advanceToClosedCard(tail = ''): HTMLElement | null {
    vi.useFakeTimers();
    const { rerender } = render(
      <ThinkingMarkdown texts={[`${PROSE}\n\n${HALF_CARD}`]} live />,
    );
    rerender(<ThinkingMarkdown texts={[`${PROSE}\n\n${VALID_CARD}${tail}`]} live />);
    act(() => { vi.advanceTimersByTime(THINKING_MARKDOWN_COMMIT_MS); });
    return document.querySelector<HTMLElement>('[data-testid="thinking-markdown"]');
  }

  it('卡片闭合的那一帧,化开逻辑不碰卡片内部的 DOM', () => {
    advanceToClosedCard();

    const card = document.querySelector('[data-od-card="memory-applied"]');
    // 正向锚点:卡片**确实**在这一帧上屏了。少了它,下面两条会因为「压根没渲染」而假绿。
    expect(card, '夹具坏了 —— 卡片这一帧没渲染出来,断言看不到任何东西').not.toBeNull();

    expect(
      card?.querySelector('[data-char-reveal]'),
      '逐字化开钻进卡片内部,把卡片的文本节点当成刚到的字拆了',
    ).toBeNull();
    expect(
      card?.textContent ?? '',
      '卡片正文被化开逻辑截短了',
    ).toContain('已记住 1 条偏好');
  });

  it('卡片冒出来**本身**不算新字 —— 没动过的散文不会重播一遍', () => {
    // `measure()` 和 `collect()` 走同一条子树过滤,所以卡片的字连长度都不计。
    // 少了这条豁免,卡片闭合会被当成「一大批新字到货」,把这一整帧铺成一批化开。
    const host = advanceToClosedCard();

    expect(host?.textContent ?? '', '夹具坏了 —— 推理散文没上屏').toContain(PROSE);
    expect(
      host?.querySelector('[data-char-reveal]'),
      '散文一个字都没变,却被重播了一遍化开',
    ).toBeNull();
  });

  it('同一帧里**真的新写出来**的散文照旧化开', () => {
    // 反向锚点:别把「卡片不化开」做成「整棵子树都不化开」。
    // 这一帧散文确实长出了新的字,它该有的入场不能被这条修复顺手关掉。
    const TAIL = '\n\n那就按这个偏好来。';
    const host = advanceToClosedCard(TAIL);

    expect(host?.textContent ?? '', '夹具坏了 —— 新写的散文没上屏').toContain('那就按这个偏好来');
    const revealed = host?.querySelector('[data-char-reveal]');
    expect(revealed, '整棵子树的化开被一起关掉了 —— 新写的散文也不再化开').not.toBeNull();
    expect(
      document.querySelector('[data-od-card="memory-applied"]')?.contains(revealed ?? null),
      '化开的字落在卡片里,而不是落在新写的那段散文上',
    ).toBe(false);
  });
});

/**
 * **产品裁决(用户,2026-09-18):解析失败的卡宁可不显示。**
 *
 *   「od-card 如果 json 不对, 就不显示, 不然用户会觉得是乱码...还不如不显示」
 *
 * 这一节盖住两条通道:壳外正文(`AssistantMessage`)和壳内叙述(`SayBlock`)。
 *
 * ⚠️ 判据只写「用户看不到 `<od-card` 原文」,**不规定**怎么做到 —— 隐藏、降级成
 * 一句纯文本、或者补全解析都能让它变绿。选哪种是产品裁决,不是这条测试的事。
 * 正向锚点(正文还在)每条都带着:少了它,整块没渲染也能假绿。
 */
describe('OPEND-2745 ② 解析失败的卡不得当成用户正文', () => {
  for (const [label, raw] of Object.entries(UNPARSEABLE)) {
    it(`壳外正文 · ${label}`, () => {
      const text = renderAssistantProse(`偏好已经读过了。\n\n${raw}`);
      expect(text, '这条消息整块没渲染 —— 夹具坏了').toContain('偏好已经读过了');
      expect(text, '解析失败的 od-card 原文被当成正文画出来了(用户裁决:宁可不显示)')
        .not.toContain('<od-card');
    });

    it(`壳内叙述 · ${label}`, () => {
      render(<SayBlock text={`偏好已经读过了。\n\n${raw}`} live={false} />);
      const text = document.body.textContent ?? '';
      expect(text, '这一段整块没渲染 —— 夹具坏了').toContain('偏好已经读过了');
      expect(text, '解析失败的 od-card 原文被当成壳内叙述画出来了(用户裁决:宁可不显示)')
        .not.toContain('<od-card');
    });
  }

  /**
   * 丢掉一张卡**不能**顺手把它后面那张好卡顶成原文。
   *
   * 畸形载荷里藏一个独占一行、没闭合的 ``` 围栏:只要 markdown 上下文还是按**含
   * 被丢弃载荷的原文**算的,这个围栏就把它之后的一切标成代码 —— 后面那张完全合法
   * 的卡因此不会被解码,最后从兜底的 `appendText` 里原样吐给用户。
   *
   * 即:一个本来为了消灭标签泄漏的改动,自己开了一条新的泄漏路径。
   */
  it('畸形载荷里的围栏不得把它后面的合法卡顶成原文', () => {
    const malformedWithFence =
      '<od-card type="memory-applied">{"summary":"坏掉的那张",\n```\n"used":[],}</od-card>';
    const text = renderAssistantProse(`${malformedWithFence}\n\n${VALID_CARD}`);

    expect(
      document.querySelector('[data-od-card="memory-applied"]'),
      '畸形卡后面那张合法卡没渲染成卡 —— 被丢弃载荷里的围栏把它标成代码了',
    ).not.toBeNull();
    expect(text, '合法卡的标签原文被兜底路径原样吐出来了 —— 修复自己开了新的泄漏口')
      .not.toContain('<od-card');
    expect(text, '夹具坏了 —— 合法卡的正文没上屏').toContain('已记住 1 条偏好');
  });
});

/**
 * ⚠️ **边界:「还在写」不是「写坏了」。**
 *
 * 上面那条裁决只管**已经闭合、但解析失败**的块。流式期间一张卡是一个 delta 一个
 * delta 长出来的,任何一帧都还没闭合 —— 它既不能被裁决提前当成畸形块吞掉(那样卡
 * 永远上不了屏),也不能因为「反正最后要丢」就把半截标签闪出来。
 *
 * 逐帧走完一整条流式轨迹:半个标签名 → 开标签写完 → JSON 写到一半 → 闭合。
 */
describe('OPEND-2745 ② 边界:流式未闭合的卡不是解析失败', () => {
  it('半截卡逐帧推进到闭合:全程不露原文,最终照旧渲染成卡', () => {
    const PROSE = '先看一下用户的偏好。';
    const frames = [
      `${PROSE}\n\n<od-ca`,
      `${PROSE}\n\n<od-card type="memory-applied">`,
      `${PROSE}\n\n<od-card type="memory-applied">{"summary":"已记`,
      `${PROSE}\n\n${VALID_CARD}`,
    ];

    const { rerender } = render(<SayBlock text={frames[0] as string} live />);
    for (const frame of frames) {
      rerender(<SayBlock text={frame} live />);
      const text = document.body.textContent ?? '';
      expect(text, '还没闭合的卡把它前面已经写完的叙述一起吞了').toContain(PROSE);
      expect(text, '还在写的卡把标签原文闪给用户看了').not.toContain('<od-card');
    }

    expect(
      document.querySelector('[data-od-card="memory-applied"]'),
      '卡闭合之后没渲染成卡 —— 流式未闭合被当成解析失败一起吞掉了',
    ).not.toBeNull();
    expect(document.body.textContent ?? '').toContain('已记住 1 条偏好');
  });
});

/**
 * ⚠️ **反向锚点** —— 少了这一节,修复可以退化成「扫到 `<od-card` 就抹掉」,
 * 而那会把**讲协议的文档正文**一起吞掉,且只看正向用例的套件全绿。
 */
describe('OPEND-2745 代码块里引用的 od-card 仍然是正文', () => {
  it('围栏代码块里的卡原样保留', () => {
    const text = renderAssistantProse(
      ['协议长这样:', '', '```html', VALID_CARD, '```'].join('\n'),
    );
    expect(text, '代码块里引用的协议示例被吞了 —— 修复收得太狠')
      .toContain('<od-card type="memory-applied"');
  });

  it('推理流里围栏代码块中的卡同样原样保留', () => {
    render(
      <ThinkingMarkdown
        texts={[['协议长这样:', '', '```html', VALID_CARD, '```'].join('\n')]}
        live={false}
      />,
    );
    expect(
      document.body.textContent ?? '',
      '推理里引用的协议示例被吞了 —— 推理流的解析口径也收得太狠',
    ).toContain('<od-card type="memory-applied"');
  });
});

describe('OPEND-2745 合法记忆卡照旧渲染成卡(OPEND-2607 反向锚点)', () => {
  it('壳外正文里的合法卡走 OdCardView', () => {
    const text = renderAssistantProse(VALID_CARD);
    expect(document.querySelector('[data-od-card="memory-applied"]')).not.toBeNull();
    expect(text).toContain('已记住 1 条偏好');
    expect(text).not.toContain('<od-card');
  });
});
