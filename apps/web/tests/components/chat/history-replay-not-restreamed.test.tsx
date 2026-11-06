// @vitest-environment jsdom
/**
 * OPEND-2590:项目还在跑的时候重进,**已经生成过的**正文从头一行一行重播了一遍。
 *
 * 用户裁决:「只有运行中、agent 新输出的才会有流式,历史生成过的不要重复流式。」
 *
 * ## 这条流上没有「历史 / 直播」的分界标记
 *
 * daemon 的 `/api/runs/:id/events`(`apps/daemon/src/runtimes/runs.ts` 的 `stream`)
 * 是先 **同步** 把 `run.events` 整个缓冲一条条 `sse.send` 出去,写完才
 * `run.clients.add(sse)` 开始收直播。两段走的是同一个通道、同一套 `id` 序号,
 * 帧的形状一模一样 —— 客户端拿不到任何「缓冲到此为止」的信号。
 *
 * 唯一能把两者分开的事实是 **到货的节奏**:重放那一段是一次性灌下来的(服务端一个
 * tick 写完),直播那一段按模型出字的速度来。所以这里造的分界是「重放窗口 =
 * 从重挂开始,到这条流第一次安静下来为止」。这两条用例钉的就是这个窗口的两边。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useRef, type ReactElement } from 'react';
import { createBufferedTextUpdates } from '../../../src/components/ProjectView';
import { useCharReveal } from '../../../src/components/chat/useCharReveal';
import type { ChatMessage } from '../../../src/types';

/** 缓冲里攒着的历史:40 段,像 daemon 重推那样一段接一段砸下来 */
const HISTORY_CHUNKS = Array.from({ length: 40 }, (_, i) => `历史第${i}段正文内容。`);
const HISTORY_TEXT = HISTORY_CHUNKS.join('');

let frames: Array<() => void> = [];

/** 跑一帧:把这一帧排上的 rAF 回调都执行掉 */
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

interface Harness {
  buffer: ReturnType<typeof createBufferedTextUpdates>;
  commits: () => number;
  content: () => string;
}

function makeBuffer(replayingHistory: boolean, onCommit?: (msg: ChatMessage) => void): Harness {
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
function pumpHistory(buffer: Harness['buffer']): void {
  for (const chunk of HISTORY_CHUNKS) {
    buffer.appendContent(chunk);
    runFrame();
    vi.advanceTimersByTime(8);
  }
}

/** 让这条流安静下来,重放窗口该在这里关掉 */
function letStreamSettle(): void {
  vi.advanceTimersByTime(2_000);
  runFrame();
}

describe('OPEND-2590 · 重放的历史不再走一遍流式', () => {
  it('重放窗口里历史只落地一次(不是一段一次)', () => {
    const { buffer, commits, content } = makeBuffer(true);

    pumpHistory(buffer);
    // 窗口还开着:这一段是 daemon 从缓冲里重推的旧内容,不该被一段一段推给 React。
    expect(commits()).toBe(0);

    letStreamSettle();
    // 窗口关掉时整段一次性落地。
    expect(commits()).toBe(1);
    expect(content()).toBe(HISTORY_TEXT);

    buffer.cancel();
  });

  it('反向对照 · 追上之后新来的字仍然逐块提交', () => {
    const { buffer, commits, content } = makeBuffer(true);

    pumpHistory(buffer);
    letStreamSettle();
    const afterReplay = commits();

    // agent 此刻正在产出的字:每一块自己提交一次,流式不能被这次修改关掉。
    for (const live of ['新', '内', '容']) {
      buffer.appendContent(live);
      runFrame();
      vi.advanceTimersByTime(8);
    }
    expect(commits() - afterReplay).toBe(3);
    expect(content()).toBe(`${HISTORY_TEXT}新内容`);

    buffer.cancel();
  });

  it('窗口还没关就被收掉时,攒住的历史不会丢', () => {
    // 重挂开始时这条消息已经被清空了,攒住的队列要是跟着 buffer 一起消失,
    // 屏幕上留下的就是一片空白。`flush()` 与 `cancel()` 都得把它交出去。
    const flushed = makeBuffer(true);
    pumpHistory(flushed.buffer);
    flushed.buffer.flush();
    expect(flushed.content()).toBe(HISTORY_TEXT);
    flushed.buffer.cancel();

    const canceled = makeBuffer(true);
    pumpHistory(canceled.buffer);
    canceled.buffer.cancel();
    expect(canceled.content()).toBe(HISTORY_TEXT);
  });

  it('非重放的普通直播完全不受影响', () => {
    const { buffer, commits, content } = makeBuffer(false);

    for (const live of ['一', '二', '三']) {
      buffer.appendContent(live);
      runFrame();
      vi.advanceTimersByTime(8);
    }
    expect(commits()).toBe(3);
    expect(content()).toBe('一二三');

    buffer.cancel();
  });
});

function Prose({ text }: { text: string }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useCharReveal(ref, true);
  return <div ref={ref} data-testid="prose"><p>{text}</p></div>;
}

const revealSpans = (): number => document.querySelectorAll('.rv').length;

describe('OPEND-2590 · 重放的历史不逐字化开', () => {
  it('重放窗口内落地的历史一个化开的字都没有,追上之后的新字照常化开', () => {
    const { rerender } = render(<Prose text="" />);

    let maxRevealDuringReplay = 0;
    const harness = makeBuffer(true, (msg) => {
      rerender(<Prose text={msg.content} />);
      maxRevealDuringReplay = Math.max(maxRevealDuringReplay, revealSpans());
    });

    pumpHistory(harness.buffer);
    letStreamSettle();

    // 历史正文已经在屏幕上,但它不该有任何入场动画 —— 这段字用户早就看过了。
    expect(document.querySelector('[data-testid="prose"]')?.textContent).toBe(HISTORY_TEXT);
    expect(maxRevealDuringReplay).toBe(0);

    // 反向对照:追上之后 agent 新吐的字仍然化开。
    let liveReveal = 0;
    const live = makeBuffer(false, (msg) => {
      rerender(<Prose text={HISTORY_TEXT + msg.content} />);
      liveReveal = Math.max(liveReveal, revealSpans());
    });
    live.buffer.appendContent('新到的一句话');
    runFrame();
    expect(liveReveal).toBeGreaterThan(0);

    harness.buffer.cancel();
    live.buffer.cancel();
  });
});
