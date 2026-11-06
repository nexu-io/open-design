// @vitest-environment jsdom
/**
 * 那颗球到底转没转。
 *
 * 这一条是验收项,不是补测:壳头和步骤记号上挂个 `data-orb` 属性太容易了 ——
 * 属性在、球是死的,页面看着就是「卡住」。所以这里**记下每一笔画**,拿上游引擎
 * 同一时刻的几何去对:画上去的点必须逐个等于 `MODE_FRAMES` 算出来的点。
 * 对得上,才说明引擎真的在驱动这块画布,而不是我们自己画了个圈糊弄过去。
 *
 * jsdom 没有 2D 上下文(`getContext` 返回 null),所以这里塞一个只记账的假上下文。
 * 它不改变被测代码的任何一步:引擎照跑、坐标照算,只是把「画」换成「记」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MODE_FRAMES, resolvePreset, type OrbState } from 'thinking-orbs/engine';
import { Orb } from '../../../src/components/chat/primitives/Orb';

/** 一笔画:方法名 + 参数 + 落笔时的颜色 */
interface Stroke { op: string; args: number[]; ink: string }

let strokes: Stroke[] = [];
let realGetContext: HTMLCanvasElement['getContext'];
let nowMs = 0;

function recordingContext(): unknown {
  const ctx = {
    fillStyle: '' as string,
    strokeStyle: '' as string,
    lineWidth: 0,
  } as Record<string, unknown>;
  const rec = (op: string, inkFrom: 'fillStyle' | 'strokeStyle') =>
    (...args: number[]) => { strokes.push({ op, args, ink: String(ctx[inkFrom] ?? '') }); };
  ctx.setTransform = rec('setTransform', 'fillStyle');
  ctx.clearRect = rec('clearRect', 'fillStyle');
  ctx.beginPath = rec('beginPath', 'fillStyle');
  ctx.moveTo = rec('moveTo', 'strokeStyle');
  ctx.lineTo = rec('lineTo', 'strokeStyle');
  ctx.stroke = rec('stroke', 'strokeStyle');
  ctx.arc = rec('arc', 'fillStyle');
  ctx.fill = rec('fill', 'fillStyle');
  return ctx;
}

beforeEach(() => {
  strokes = [];
  nowMs = 1234;
  realGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = (() => recordingContext()) as HTMLCanvasElement['getContext'];
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
  // 默认「没关动效」。关掉动效的那条用例自己再覆盖一次
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
});

afterEach(() => {
  cleanup();
  HTMLCanvasElement.prototype.getContext = realGetContext;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** 上游引擎在 t 时刻算出来的点,四舍五入到能比的精度 */
function engineDots(state: OrbState, t: number): number[][] {
  const preset = resolvePreset(state, 20);
  const frameOf = MODE_FRAMES[preset.mode];
  return frameOf(20, t, preset.opts).dots.map((d) => [round(d.x), round(d.y), round(d.r)]);
}
/** 记账里的点 */
function paintedDots(): number[][] {
  return strokes.filter((s) => s.op === 'arc').map((s) => [round(s.args[0] ?? NaN), round(s.args[1] ?? NaN), round(s.args[2] ?? NaN)]);
}
const round = (n: number): number => Math.round(n * 1e4) / 1e4;
const speedOf = (state: OrbState): number => resolvePreset(state, 20).speed;
const nextFrame = (): Promise<void> => new Promise((r) => { requestAnimationFrame(() => r()); });

describe('引擎真的挂上了', () => {
  it('画布上的点逐个等于上游引擎当刻的几何', () => {
    render(<Orb state="solving" box={15} label="进行中" />);
    // clock() = performance.now()/1000 * speed
    expect(paintedDots()).toEqual(engineDots('solving', 1.234 * speedOf('solving')));
    expect(paintedDots().length).toBeGreaterThan(0);
  });

  it('时间往前走,画面跟着变(不是定格在第一帧)', async () => {
    render(<Orb state="connecting" box={24} />);
    const first = paintedDots();
    strokes = [];
    nowMs = 1234 + 500;
    await nextFrame();
    const later = paintedDots();
    expect(later.length).toBeGreaterThan(0);
    expect(later).not.toEqual(first);
    expect(later).toEqual(engineDots('connecting', 1.734 * speedOf('connecting')));
  });

  it('时钟取全局的,不各自从 0 起 —— 同屏两颗同相', () => {
    render(<><Orb state="solving" box={15} label="a" /><Orb state="solving" box={15} label="b" /></>);
    const dots = paintedDots();
    const half = dots.length / 2;
    expect(half).toBeGreaterThan(0);
    expect(dots.slice(0, half)).toEqual(dots.slice(half));
  });

  it('线也照画:有边的模式先画线再压点(与上游同序)', () => {
    render(<Orb state="weaving" box={20} label="连线" />);
    const ops = strokes.filter((s) => s.op === 'arc' || s.op === 'lineTo').map((s) => s.op);
    if (ops.includes('lineTo')) {
      expect(ops.indexOf('lineTo')).toBeLessThan(ops.indexOf('arc'));
    }
    expect(ops.filter((o) => o === 'arc').length).toBeGreaterThan(0);
  });
});

describe('画布本身', () => {
  it('放大是重新画,不是把 20px 的位图拉上去', () => {
    render(<Orb state="solving" box={40} label="进行中" />);
    const canvas = document.querySelector('canvas');
    expect(canvas?.style.width).toBe('40px');
    // backing store 跟着 dpr × box 走;几何仍按 20 档算,靠 setTransform 缩放
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    expect(canvas?.width).toBe(Math.round(40 * dpr));
    const k = round(dpr * 40 / 20);
    expect(strokes.find((s) => s.op === 'setTransform')?.args.map(round)).toEqual([k, 0, 0, k, 0, 0]);
  });

  it('没配墨色就退回上游的灰,不会画成透明', () => {
    render(<Orb state="solving" box={15} label="进行中" />);
    const inks = new Set(strokes.filter((s) => s.op === 'arc').map((s) => s.ink));
    expect(inks.size).toBeGreaterThan(0);
    for (const ink of inks) expect(ink).toMatch(/^rgba\(\d+,\d+,\d+,[\d.]+\)$/);
  });
});

describe('该停的时候停', () => {
  it('关了动效:定在代表帧,时间走了也不动', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    render(<Orb state="solving" box={15} label="进行中" />);
    expect(paintedDots()).toEqual(engineDots('solving', 0.6));

    strokes = [];
    nowMs = 9999;
    await nextFrame();
    await nextFrame();
    expect(strokes).toHaveLength(0);   // 一帧都没再画
  });

  it('拆掉之后不再画,画布也不留在 DOM 里', async () => {
    const { unmount } = render(<Orb state="solving" box={15} label="进行中" />);
    unmount();
    expect(document.querySelector('canvas')).toBeNull();
    strokes = [];
    nowMs = 5000;
    await nextFrame();
    await nextFrame();
    expect(strokes).toHaveLength(0);
  });
});

describe('读屏', () => {
  it('给了标签:canvas 自己念,外层不隐身', () => {
    render(<Orb state="solving" box={15} label="进行中" />);
    const canvas = document.querySelector('canvas');
    expect(canvas?.getAttribute('role')).toBe('img');
    expect(canvas?.getAttribute('aria-label')).toBe('进行中');
    expect(document.querySelector('[data-orb]')?.getAttribute('aria-hidden')).toBeNull();
  });

  it('没给标签:整颗球隐身,不跟旁边的字念两遍', () => {
    render(<Orb state="connecting" box={24} />);
    expect(document.querySelector('canvas')?.getAttribute('aria-label')).toBeNull();
    expect(document.querySelector('[data-orb]')?.getAttribute('aria-hidden')).toBe('true');
  });
});
