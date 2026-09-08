/**
 * 组件 21 · 待发送附件(第 60–64 格)的纯数据规则。
 *
 * 这里钉住的是**合并与排序**:托盘里同时躺着已经传上去的和还在传 / 传失败的,
 * 稿子把它们画成同一排卡,而这一排的顺序必须是「用户挑文件的顺序」——
 * 不是「谁先传完谁在前」。并发上传时这两者会分叉,一分叉就能看见一排卡在几秒内
 * 自己重排一遍。
 */
import { describe, expect, it } from 'vitest';
import {
  buildStagedAttachmentCards,
  looksLikeImageName,
  runWithConcurrency,
  type PendingUpload,
} from '../../../src/runtime/chat/staged-attachment';

const ready = (name: string, order: number, kind: 'image' | 'file' = 'image') => ({
  path: `uploads/${name}`,
  name,
  kind,
  order,
});

const pending = (
  id: string,
  name: string,
  order: number,
  state: 'uploading' | 'failed' = 'uploading',
): PendingUpload => ({ id, name, kind: 'image', order, state });

describe('待发送托盘 · 卡片合并', () => {
  it('两条列表按 order 交错,不是「传完的排前面」', () => {
    const cards = buildStagedAttachmentCards(
      [ready('首页.png', 1), ready('会员中心.png', 4)],
      [pending('pu-1', '设置页.png', 2), pending('pu-2', '列表页.png', 3)],
    );
    expect(cards.map((c) => c.name)).toEqual([
      '首页.png',
      '设置页.png',
      '列表页.png',
      '会员中心.png',
    ]);
  });

  it('已上传的卡带 path(能跟着发出去),在传 / 失败的只带 pendingId', () => {
    const cards = buildStagedAttachmentCards(
      [ready('首页.png', 1)],
      [pending('pu-1', '规范.pdf', 2, 'failed')],
    );
    expect(cards[0]).toMatchObject({ state: 'ready', path: 'uploads/首页.png' });
    expect(cards[0]?.pendingId).toBeUndefined();
    expect(cards[1]).toMatchObject({ state: 'failed', pendingId: 'pu-1' });
    expect(cards[1]?.path).toBeUndefined();
  });

  it('order 撞车时排序仍是稳定的 —— 不稳的话卡片会在原地互换', () => {
    const first = buildStagedAttachmentCards(
      [ready('a.png', 1), ready('b.png', 1), ready('c.png', 1)],
      [],
    );
    const second = buildStagedAttachmentCards(
      [ready('a.png', 1), ready('b.png', 1), ready('c.png', 1)],
      [],
    );
    expect(first.map((c) => c.name)).toEqual(['a.png', 'b.png', 'c.png']);
    expect(second.map((c) => c.name)).toEqual(first.map((c) => c.name));
  });

  it('老数据没有 order 时退回数组位置,和 ChatAttachment.order 的约定一致', () => {
    const cards = buildStagedAttachmentCards(
      [
        { path: 'uploads/x.png', name: 'x.png', kind: 'image' },
        { path: 'uploads/y.png', name: 'y.png', kind: 'image' },
      ],
      [],
    );
    expect(cards.map((c) => c.name)).toEqual(['x.png', 'y.png']);
  });

  it('key 按来源分段 —— 同名的待传卡和已传卡不会撞成同一个 React key', () => {
    const cards = buildStagedAttachmentCards(
      [ready('首页.png', 1)],
      [pending('pu-1', '首页.png', 2)],
    );
    expect(new Set(cards.map((c) => c.key)).size).toBe(2);
  });
});

describe('待发送托盘 · 本地文件先猜一次有没有画面', () => {
  it('认 MIME —— 拖进来的截图常常没有扩展名', () => {
    expect(looksLikeImageName('screenshot', 'image/png')).toBe(true);
  });
  it('没有 MIME 就退回扩展名', () => {
    expect(looksLikeImageName('首页.PNG')).toBe(true);
    expect(looksLikeImageName('规范.pdf')).toBe(false);
    expect(looksLikeImageName('走查录屏.mov')).toBe(false);
  });
});

describe('待发送托盘 · 并发上传', () => {
  it('结果与输入同序,调用方不必按完成顺序对回去', async () => {
    const delays = [30, 0, 10, 20, 5];
    const out = await runWithConcurrency(delays, 2, async (ms, index) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return index;
    });
    expect(out).toEqual([0, 1, 2, 3, 4]);
  });

  it('同时在飞的不超过上限 —— 逐文件传不等于一次把几十个请求全发出去', async () => {
    let live = 0;
    let peak = 0;
    await runWithConcurrency(Array.from({ length: 9 }, (_, i) => i), 3, async () => {
      live += 1;
      peak = Math.max(peak, live);
      await Promise.resolve();
      await Promise.resolve();
      live -= 1;
      return null;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('空列表不会挂住', async () => {
    await expect(runWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
  });
});
