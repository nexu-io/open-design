// @vitest-environment jsdom
//
// OPEND-2607 — 「记忆写入成功后未展示可展开的记忆卡片」
//
// 复现者那一轮真的写进去了:后台记忆从 22 涨到 25,三条 rule 都能按 id 查到;
// ChatPanel 里却只有一段普通助手文本 —— 没有卡、没有条数、没有展开收起。
//
// 卡本身早就有了(`<od-card type="memory-applied">` → `MemoryAppliedCard`,
// 交付稿 #26 / #27),缺的是**产出方**:唯一会吐这个标签的是模型,而且它描述的是
// 「我读了哪些记忆」,不是「我写了什么」。所以一次真实的写入永远走不到那张卡。
//
// 这条从「守护进程记下了这次提取」出发,一路走到屏幕上的 DOM,中间全用产品自己的
// 那几段:
//   提取记录(GET /api/memory/extractions)→ 条目名字(GET /api/memory)
//   → od-card 文本 → `splitOnOdCards`(AssistantMessage 用的同一个)
//   → `OdCardView` → 收起标题 + 展开三行
// 任何一段断掉,这条就红。

import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import type { MemoryExtractionRecord, OdCard } from '@open-design/contracts';
import { splitOnOdCards } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  memoryWrittenCardContent,
  useMemoryWrittenCard,
} from '../../src/runtime/useMemoryWrittenCard';
import { OdCardView } from '../../src/components/OdCard';
import { I18nProvider } from '../../src/i18n';

// The three rules the reporter's turn actually wrote, by their real slugs.
const WRITTEN_IDS = [
  'rule_product_cards_reusable_shared_component',
  'rule_product_cards_uniform_12px_corner_radius',
  'rule_no_warm_color_backgrounds',
];
const WRITTEN_NAMES = [
  '商品卡做成可复用的共享组件',
  '卡片圆角统一 12px',
  '不要暖色背景',
];

// Shaped after a real `MemoryExtractionRecord` written by the LLM extractor:
// terminal phase, provider + credential source, ids of what landed on disk.
function successRecord(startedAt: number): MemoryExtractionRecord {
  return {
    id: 'ext-1',
    kind: 'llm',
    startedAt,
    finishedAt: startedAt + 4200,
    phase: 'success',
    provider: {
      kind: 'anthropic',
      model: 'claude-haiku-4-5',
      credentialSource: 'env',
    },
    userMessagePreview: '请记住以下 3 条长期设计偏好',
    proposedCount: 3,
    writtenCount: 3,
    writtenIds: WRITTEN_IDS,
  };
}

const originalFetch = globalThis.fetch;
let extractions: MemoryExtractionRecord[] = [];
let extractionPolls = 0;

function installDaemon() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === '/api/memory/extractions') {
      extractionPolls += 1;
      return new Response(JSON.stringify({ extractions }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/memory') {
      return new Response(JSON.stringify({
        enabled: true,
        chatExtractionEnabled: true,
        entries: WRITTEN_IDS.map((id, i) => ({
          id,
          name: WRITTEN_NAMES[i],
          description: '',
          type: 'rule',
          source: 'llm',
          updatedAt: 1,
        })),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;
}

function mountHook() {
  return renderHook(
    ({ runActive }: { runActive: boolean }) => useMemoryWrittenCard(runActive),
    { initialProps: { runActive: false } },
  );
}

/** Let every scheduled timer and the promise chain behind it finish. */
async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** Drive one turn: a run starts, then ends, then the extractor reports. */
async function runOneTurn(rerender: (props: { runActive: boolean }) => void) {
  await act(async () => { rerender({ runActive: true }); });
  await act(async () => { rerender({ runActive: false }); });
  // The poll that opens the window fires immediately; give it and the two
  // requests behind it a chance to land.
  await settle(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  extractions = [];
  extractionPolls = 0;
  installDaemon();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('OPEND-2607 a turn that wrote memory shows the memory card', () => {
  it('turns a real extraction into the batch the card is built from', async () => {
    const { result, rerender } = mountHook();
    extractions = [successRecord(Date.now())];

    await runOneTurn(rerender);

    expect(extractionPolls).toBeGreaterThan(0);
    expect(result.current.batch).not.toBeNull();
    expect(result.current.batch?.count).toBe(3);
    expect(result.current.batch?.entries.map((e) => e.name)).toEqual(WRITTEN_NAMES);
    expect(result.current.batch?.entries.map((e) => e.id)).toEqual(WRITTEN_IDS);
  });

  it('reaches the screen as the draft draws it: collapsed count, expanded contents', async () => {
    const { result, rerender } = mountHook();
    extractions = [successRecord(Date.now())];
    await runOneTurn(rerender);
    expect(result.current.batch).not.toBeNull();

    // The exact message content ProjectView posts into the conversation…
    const content = memoryWrittenCardContent(
      result.current.batch!,
      `已记住 ${result.current.batch!.count} 条偏好`,
    );

    // …split by the same splitter AssistantMessage uses on message content.
    const segments = splitOnOdCards(content);
    const cardSegment = segments.find((seg) => seg.kind === 'card');
    expect(cardSegment).toBeDefined();
    const card = (cardSegment as unknown as { card: OdCard }).card;
    expect(card.kind).toBe('memory-applied');

    vi.useRealTimers();
    const { container } = render(
      <I18nProvider initial="zh-CN"><OdCardView card={card} /></I18nProvider>,
    );
    const details = container.querySelector('details[data-od-card="memory-applied"]');
    expect(details).not.toBeNull();
    // Collapsed: one title row saying how many were remembered.
    expect(details?.querySelector('summary')?.textContent).toContain('已记住 3 条偏好');
    // Expanded: the three entries that were actually written, each prefixed 「·」.
    const expanded = container.querySelector('details > div')?.textContent ?? '';
    for (const name of WRITTEN_NAMES) expect(expanded).toContain(`· ${name}`);
  });

  it('does not appear when the turn wrote nothing', async () => {
    const { result, rerender } = mountHook();
    extractions = [{ ...successRecord(Date.now()), writtenCount: 0, writtenIds: [] }];

    await runOneTurn(rerender);

    // The poll really ran and really saw the record — it just refused to draw
    // 「已记住 0 条」, which is the draft's rule for this block.
    expect(extractionPolls).toBeGreaterThan(0);
    expect(result.current.batch).toBeNull();
  });

  it('does not appear for an extraction that failed', async () => {
    const { result, rerender } = mountHook();
    extractions = [{
      ...successRecord(Date.now()),
      phase: 'failed',
      error: 'provider refused',
    }];

    await runOneTurn(rerender);

    expect(extractionPolls).toBeGreaterThan(0);
    expect(result.current.batch).toBeNull();
  });

  it('posts one card per extraction, not one per poll', async () => {
    const { result, rerender } = mountHook();
    extractions = [successRecord(Date.now())];
    await runOneTurn(rerender);
    expect(result.current.batch).not.toBeNull();

    // ProjectView consumes the batch and dismisses it. The window is still
    // open, so the next poll sees the very same record again.
    await act(async () => { result.current.dismiss(); });
    const pollsBefore = extractionPolls;
    await settle(3000);
    expect(extractionPolls).toBeGreaterThan(pollsBefore);
    expect(result.current.batch).toBeNull();
  });

  it('ignores an extraction that finished before this turn started', async () => {
    const { result, rerender } = mountHook();
    // A record from an earlier turn (or from Settings → Memory) that predates
    // the run: it is not this turn's news and must not mint a card.
    extractions = [successRecord(Date.now() - 60_000)];

    await runOneTurn(rerender);

    expect(extractionPolls).toBeGreaterThan(0);
    expect(result.current.batch).toBeNull();
  });

  it('waits for the extractor and never polls before a turn has run', async () => {
    const { result } = mountHook();
    extractions = [successRecord(Date.now())];

    await settle(30_000);

    expect(extractionPolls).toBe(0);
    expect(result.current.batch).toBeNull();
  });
});

describe('OPEND-2607 waitFor sanity', () => {
  it('renders nothing for an empty batch', async () => {
    // A defensive check on the card payload builder: no entries means the
    // expandable body is absent (no chevron, no empty drawer).
    vi.useRealTimers();
    const content = memoryWrittenCardContent(
      { key: 'k', count: 1, entries: [] },
      '已记住 1 条偏好',
    );
    const segments = splitOnOdCards(content);
    const cardSegment = segments.find((seg) => seg.kind === 'card');
    const card = (cardSegment as unknown as { card: OdCard }).card;
    const { container } = render(
      <I18nProvider initial="zh-CN"><OdCardView card={card} /></I18nProvider>,
    );
    await waitFor(() => {
      expect(container.querySelector('details > div')).toBeNull();
    });
  });
});
