/**
 * 像素液体 —— 着色器移植 + 共享调度器。
 *
 * 这一层跑在 node 里,**不碰 canvas**:jsdom 既没有 2D 上下文也没有布局,
 * 「画得对不对」在这里根本量不到。所以这个文件只钉两件事:
 *   ① `shade()` 是一个确定性的抖动场 —— 同一个 t 出同一帧、不同 t 出不同帧,
 *      而且一帧里 alpha 是有层次的(是抖动,不是铺一块实心)。
 *   ② 调度器:一条共享 rAF、看不见就停、同时跑的实例有上限、释放后不空转。
 * 画面正确性只能靠真浏览器,那部分在 PR 里以人工验证交付。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  DESIGN_CELL_PX,
  DESIGN_PIXEL,
  TARGET_COLS,
  pixelSizeFor,
  shade,
} from '../../src/runtime/pixel-liquid';
import { createLiquidScheduler, type LiquidFrameHost } from '../../src/runtime/pixel-liquid-scheduler';

function surface(w: number, h: number) {
  return { data: new Uint8ClampedArray(w * h * 4) };
}

/** 手动推进的 rAF 替身 —— 调度器的时间必须由测试说了算 */
function fakeHost() {
  let next = 1;
  const queued = new Map<number, (ms: number) => void>();
  const host: LiquidFrameHost = {
    requestFrame(cb) {
      const handle = next++;
      queued.set(handle, cb);
      return handle;
    },
    cancelFrame(handle) {
      queued.delete(handle);
    },
  };
  return {
    host,
    pending: () => queued.size,
    /** 把当前排队的那一帧跑掉(回调里再排的下一帧留到下次 tick) */
    tick(ms: number) {
      const now = [...queued.entries()];
      queued.clear();
      for (const [, cb] of now) cb(ms);
    },
  };
}

describe('shade() —— 上游 color_frag 的移植', () => {
  it('同一个 t 出同一帧,不同 t 出不同帧', () => {
    const a = surface(24, 32);
    const b = surface(24, 32);
    const c = surface(24, 32);
    shade(a, 24, 32, 1.5, 6);
    shade(b, 24, 32, 1.5, 6);
    shade(c, 24, 32, 2.5, 6);

    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
  });

  it('一帧里 alpha 是有层次的 —— 抖动,不是一块实心', () => {
    const img = surface(48, 64);
    shade(img, 48, 64, 3.2, 6);

    const alphas = new Set<number>();
    for (let p = 3; p < img.data.length; p += 4) alphas.add(img.data[p] as number);

    // 一块静止的灰只有一个 alpha;4×4 Bayer + 噪声 + 颗粒会摊出一大片层级
    expect(alphas.size).toBeGreaterThan(16);
  });

  it('方格是实的:同一个 4×4 抖动格里,同一行相邻像素不会全都相等', () => {
    const img = surface(48, 64);
    shade(img, 48, 64, 3.2, 6);
    let varied = 0;
    for (let x = 0; x + 1 < 48; x++) {
      const p = (10 * 48 + x) * 4 + 3;
      if (img.data[p] !== img.data[p + 4]) varied++;
    }
    expect(varied).toBeGreaterThan(0);
  });
});

describe('pixelSizeFor() —— 按尺寸重算方格边长', () => {
  it('设计稿那一格(84px)算回稿子写死的 6', () => {
    expect(pixelSizeFor(DESIGN_CELL_PX)).toBe(DESIGN_PIXEL);
  });

  it('格子变大时保住列数,而不是保住方格边长', () => {
    for (const width of [84, 160, 240, 320]) {
      const px = pixelSizeFor(width);
      const cols = Math.ceil(width / px);
      expect(Math.abs(cols - TARGET_COLS)).toBeLessThanOrEqual(2);
    }
  });

  it('再小的格子也不会退化成 1px 噪点', () => {
    expect(pixelSizeFor(8)).toBeGreaterThanOrEqual(4);
    expect(pixelSizeFor(0)).toBeGreaterThanOrEqual(4);
  });
});

describe('共享调度器', () => {
  it('刚加入还没露面时不开循环 —— 一个实例一条 rAF 是明令禁止的', () => {
    const { host, pending } = fakeHost();
    const scheduler = createLiquidScheduler(host);
    const draw = vi.fn();

    scheduler.join(draw);
    expect(pending()).toBe(0);
    expect(scheduler.stats().ticking).toBe(false);
    expect(draw).not.toHaveBeenCalled();
  });

  it('多个实例共用一条 rAF', () => {
    const { host, pending, tick } = fakeHost();
    const scheduler = createLiquidScheduler(host);
    const a = vi.fn();
    const b = vi.fn();
    scheduler.join(a).setVisible(true);
    scheduler.join(b).setVisible(true);

    expect(pending()).toBe(1);
    tick(0);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(pending()).toBe(1);
  });

  it('滚出屏幕就停,回来再接着跑', () => {
    const { host, pending, tick } = fakeHost();
    const scheduler = createLiquidScheduler(host);
    const draw = vi.fn();
    const ticket = scheduler.join(draw);

    ticket.setVisible(true);
    tick(0);
    expect(draw).toHaveBeenCalledTimes(1);

    ticket.setVisible(false);
    expect(pending()).toBe(0);
    expect(scheduler.stats().ticking).toBe(false);
    tick(1_000);
    expect(draw).toHaveBeenCalledTimes(1);

    ticket.setVisible(true);
    tick(2_000);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('同时跑的实例有上限:超出的那些不进循环', () => {
    const { host, tick } = fakeHost();
    const scheduler = createLiquidScheduler(host, { maxAnimating: 2 });
    const draws = [vi.fn(), vi.fn(), vi.fn()];
    for (const draw of draws) scheduler.join(draw).setVisible(true);

    tick(0);
    expect(scheduler.stats().animating).toBe(2);
    expect(draws[0]).toHaveBeenCalledTimes(1);
    expect(draws[1]).toHaveBeenCalledTimes(1);
    expect(draws[2]).not.toHaveBeenCalled();
  });

  it('上限之内的实例走掉后,排在后面的顶上来', () => {
    const { host, tick } = fakeHost();
    const scheduler = createLiquidScheduler(host, { maxAnimating: 1 });
    const first = vi.fn();
    const second = vi.fn();
    const ticket = scheduler.join(first);
    ticket.setVisible(true);
    scheduler.join(second).setVisible(true);

    tick(0);
    expect(second).not.toHaveBeenCalled();

    ticket.release();
    tick(1_000);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('按帧率节流:两次 rAF 挨太近只画一次', () => {
    const { host, tick } = fakeHost();
    const scheduler = createLiquidScheduler(host, { fps: 30 });
    const draw = vi.fn();
    scheduler.join(draw).setVisible(true);

    tick(0);
    expect(draw).toHaveBeenCalledTimes(1);
    tick(8);              // 8ms < 1/30s
    expect(draw).toHaveBeenCalledTimes(1);
    tick(40);             // 40ms > 1/30s
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('最后一个实例释放后循环收干净,不留一条空转的 rAF', () => {
    const { host, pending, tick } = fakeHost();
    const scheduler = createLiquidScheduler(host);
    const draw = vi.fn();
    const ticket = scheduler.join(draw);
    ticket.setVisible(true);
    tick(0);

    ticket.release();
    expect(pending()).toBe(0);
    expect(scheduler.stats()).toMatchObject({ registered: 0, animating: 0, ticking: false });
    tick(1_000);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('页面藏起来时全停', () => {
    const { host, pending, tick } = fakeHost();
    const scheduler = createLiquidScheduler(host);
    const draw = vi.fn();
    scheduler.join(draw).setVisible(true);
    tick(0);

    scheduler.setPaused(true);
    expect(pending()).toBe(0);
    tick(1_000);
    expect(draw).toHaveBeenCalledTimes(1);

    scheduler.setPaused(false);
    tick(2_000);
    expect(draw).toHaveBeenCalledTimes(2);
  });
});
