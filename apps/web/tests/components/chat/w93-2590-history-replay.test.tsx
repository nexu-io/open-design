// @vitest-environment jsdom
/**
 * W93 验证用红测 —— OPEND-2590
 * 「运行中项目从首页进入时历史对话内容重复逐行加载」
 *
 * 用户原话:「打开项目时,历史产出的内容全部走了一遍流式,预期应该是只有运行中
 * agent 新输出的才要流式,历史生成过的不要重复流式。」
 *
 * 重挂一个还在跑的 Run 时,daemon(`runtimes/runs.ts` 的 `stream`)先**同步**把
 * `run.events` 整个缓冲一条条推出来,写完才把这条连接加进 `run.clients` 收直播 ——
 * 同一条通道、同一套 id、同一种帧,客户端拿不到「缓冲到此为止」的信号。
 *
 * 所以症状有**两层**,分开钉:
 *   ① 提交次数 —— 40 段历史被一段一段推给 React,屏幕上跳 40 次
 *   ② 入场动画 —— 落地的历史还要逐字化开一遍,用户早就读过的字又「打」了一遍
 * 两层都得治:只合并提交,预算照样按字数把整段历史铺开(约 2 秒)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useRef, type ReactElement } from 'react';
import { createBufferedTextUpdates } from '../../../src/components/ProjectView';
import { useCharReveal } from '../../../src/components/chat/useCharReveal';
import type { ChatMessage } from '../../../src/types';

/** daemon 缓冲里攒着的历史:40 段,像重推那样一段接一段砸下来 */
const HISTORY_CHUNKS = Array.from({ length: 40 }, (_, i) => `历史第${i}段正文内容。`);
const HISTORY_TEXT = HISTORY_CHUNKS.join('');

let frames: Array<() => void> = [];

function runFrame(): void {
  const due = frames;
  frames = [];
  for (const cb of due) cb();
}

beforeEach(() => {
  frames = [];
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function makeBuffer(replayingHistory: boolean, onCommit?: (msg: ChatMessage) => void) {
  let msg = { content: '', events: [] } as unknown as ChatMessage;
  let commits = 0;
  const buffer = createBufferedTextUpdates({
    updateMessage: (updater) => {
      msg = updater(msg);
      commits += 1;
      onCommit?.(msg);
    },
    persistSoon: () => {},
    replayingHistory,
  } as Parameters<typeof createBufferedTextUpdates>[0] & { replayingHistory: boolean });
  return { buffer, commits: () => commits, content: () => msg.content };
}

/** 把整段历史按 daemon 重推的样子灌进去:一段、过一帧、再一段 */
function pumpHistory(buffer: ReturnType<typeof makeBuffer>['buffer']): void {
  for (const chunk of HISTORY_CHUNKS) {
    buffer.appendContent(chunk);
    runFrame();
    vi.advanceTimersByTime(8);
  }
}

/** 这条流安静下来 —— 重放窗口该在这里关掉 */
function letStreamSettle(): void {
  vi.advanceTimersByTime(2_000);
  runFrame();
}

function Prose({ text }: { text: string }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useCharReveal(ref, true);
  return <div ref={ref} data-testid="prose"><p>{text}</p></div>;
}

/** 化开时每个待显示的单位是一个 `.rv` span;一个都没有 = 没走入场动画 */
const revealSpans = (): number => document.querySelectorAll('.rv').length;

describe('OPEND-2590 · 重进一个还在跑的项目', () => {
  it('① 历史整段一次落地,不是一段一次', () => {
    const { buffer, commits, content } = makeBuffer(true);
    pumpHistory(buffer);
    // 重放窗口开着的时候,一次都不该推给 React
    expect(commits()).toBe(0);
    letStreamSettle();
    expect(commits()).toBe(1);
    expect(content()).toBe(HISTORY_TEXT);
    buffer.cancel();
  });

  it('② 落地的历史一个化开的字都没有', () => {
    const { rerender } = render(<Prose text="" />);
    let maxRevealDuringReplay = 0;
    const harness = makeBuffer(true, (msg) => {
      rerender(<Prose text={msg.content} />);
      maxRevealDuringReplay = Math.max(maxRevealDuringReplay, revealSpans());
    });
    pumpHistory(harness.buffer);
    letStreamSettle();

    // 先证量法看得见:历史确实已经在屏幕上了
    expect(document.querySelector('[data-testid="prose"]')?.textContent).toBe(HISTORY_TEXT);
    expect(maxRevealDuringReplay).toBe(0);
    harness.buffer.cancel();
  });

  it('反向对照 · agent 此刻新吐的字照旧逐块提交、照旧化开', () => {
    // 这一条不能被上面两条顺手关掉 —— 用户要的是「只有新输出才流式」,不是「都别流」
    const { rerender } = render(<Prose text="" />);
    let reveal = 0;
    const live = makeBuffer(false, (msg) => {
      rerender(<Prose text={msg.content} />);
      reveal = Math.max(reveal, revealSpans());
    });
    for (const ch of ['新', '内', '容']) {
      live.buffer.appendContent(ch);
      runFrame();
      vi.advanceTimersByTime(8);
    }
    expect(live.commits()).toBe(3);
    expect(reveal).toBeGreaterThan(0);
    live.buffer.cancel();
  });

  it('窗口没关就被收掉时,攒住的历史不会丢(屏幕不会留白)', () => {
    const canceled = makeBuffer(true);
    pumpHistory(canceled.buffer);
    canceled.buffer.cancel();
    expect(canceled.content()).toBe(HISTORY_TEXT);
  });
});
