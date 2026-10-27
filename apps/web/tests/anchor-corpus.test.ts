import { describe, expect, it } from 'vitest';

import corpus from './fixtures/anchor-corpus.json';
import { resolveCommentAnchor } from '../src/comments';
import type { PreviewComment } from '@open-design/contracts';

type Snapshot = Parameters<typeof resolveCommentAnchor>[1] extends Map<string, infer S>
  ? S
  : never;

/**
 * 阶段 0 · Z7 —— 跨端锚点对拍语料。
 *
 * 这份语料是**分享页移植锚点算法时的唯一参照**（`B13`/`B14`）。
 * 两个仓是独立的 pnpm workspace，`import` 同一个模块做不到，所以只能
 * **两端各跑同一份 JSON，逐例对拍**。
 *
 * 本文件守的是语料这一侧：**它必须始终等于 `resolveCommentAnchor` 今天的真实输出**。
 * 语料一旦和实现脱节，分享页就会照着一份过时的参照去移植，而且**两端都是"绿"的**
 * —— 各自对着各自的期望，谁也不会红。
 *
 * ⚠️ 这条测试红了，只有两种正当处理：
 *   1. 锚点行为是**有意改的** → 重跑生成器、提交 diff，并让分享页那一侧同步采纳；
 *   2. 锚点行为是**被误改的** → 改回实现。
 * **不许手改 JSON 让它变绿。** 手改 = 语料开始描述一个不存在的算法。
 *
 * 生成命令：`pnpm exec tsx apps/web/tests/fixtures/anchor-corpus.gen.ts`
 */
describe('Z7 · 锚点对拍语料与实现一致', () => {
  it('语料非空，且覆盖全部四个锚点态', () => {
    expect(corpus.cases.length).toBeGreaterThan(0);
    const states = new Set(corpus.cases.map((c) => c.expected.state));
    // 少一个态就意味着那条分支没有参照，移植方可以任意实现它而不被发现。
    expect([...states].sort()).toEqual(['anchored', 'lost', 'reanchored', 'stale']);
  });

  it.each(corpus.cases.map((c) => [c.name, c] as const))(
    '%s',
    (_name, testCase) => {
      const snapshots = new Map<string, Snapshot>(
        (testCase.input.snapshots as Snapshot[]).map((s) => [s.elementId, s]),
      );
      const actual = resolveCommentAnchor(
        testCase.input.comment as unknown as PreviewComment,
        snapshots,
        (testCase.input as { currentVersion?: number }).currentVersion,
      );

      expect(
        {
          state: actual.state,
          snapshotElementId: actual.snapshot?.elementId ?? null,
          snapshotPosition: actual.snapshot?.position ?? null,
        },
        `${testCase.name} — ${testCase.why}`,
      ).toEqual(testCase.expected);
    },
  );
});

describe('Z7 · 语料本身的可用性（分享页那一侧要靠这些成立）', () => {
  it('每例都带一句「为什么」，不是一堆无名输入', () => {
    for (const c of corpus.cases) {
      expect(c.why, `${c.name} 缺少 why`).toBeTruthy();
      expect(c.why.length, `${c.name} 的 why 太短，说明不了这一例在守什么`).toBeGreaterThan(20);
    }
  });

  it('例名唯一 —— 对拍报告要靠它定位', () => {
    const names = corpus.cases.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('是纯数据，不含函数或 DOM 引用', () => {
    // 分享页在另一个仓、另一套构建里跑它，任何不可序列化的东西都会让对拍无法进行。
    expect(() => JSON.parse(JSON.stringify(corpus))).not.toThrow();
    expect(JSON.stringify(corpus)).not.toMatch(/\bfunction\b|\[native code\]/);
  });

  /**
   * 这一条不是形式检查，是这份语料存在的核心理由之一。
   *
   * `positionProximityScore` 上限是 1，而 fuzzy 的门槛是 2，所以
   * **「位置相近」单独永远不足以重新锚定**。移植方如果把位置权重调高，
   * 评论就会静默attach 到附近任意元素上 —— 那正是
   * `PreviewCommentAnchorState` 注释里写的「给出错误位置比不给更糟」。
   */
  it('保留「位置相近单独不足以重锚」这一例', () => {
    const c = corpus.cases.find((x) => x.name === 'fuzzy-proximity-only-below-threshold');
    expect(c, '这一例被删了 —— 它是防止移植方放大位置权重的唯一守卫').toBeDefined();
    expect(c!.expected.state).toBe('lost');
  });

  /**
   * 同理：文本匹配恰好等于门槛值 2，而判据是 `>= 2`。
   * 移植方写成 `> 2` 会让这一例从 stale 变 lost，且不会有别的用例发现。
   */
  it('保留 fuzzy 门槛的边界一例', () => {
    const c = corpus.cases.find((x) => x.name === 'fuzzy-text-only-at-threshold');
    expect(c, '门槛边界例被删了 —— `>= 2` 写成 `> 2` 将无人发现').toBeDefined();
    expect(c!.expected.state).toBe('stale');
  });
});
