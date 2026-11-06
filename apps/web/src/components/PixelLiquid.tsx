/**
 * 「还没出来」的那一格里流动的东西 —— 交付稿的像素液体。
 *
 * 产品口径(设计同学 2026-08-26):图片的 loading 态,不管是下载还是生成期间,
 * **占位不许用灰色那一块**;产物卡加载期间同理。所以这颗东西只用在
 * 「东西还在长」的位置上,不用在「本来就没有缩略图」的位置上(比如 `.md`
 * 产物卡的图标 + 文件名档)—— 那两件事不是一回事。
 *
 * 着色与常量在 `runtime/pixel-liquid.ts`,节拍在 `runtime/pixel-liquid-scheduler.ts`
 * (**一条 rAF 驱动全部实例**,看不见就停,同时动的有上限)。这里只负责
 * 挂画布、量尺寸、进出视口、卸载时收干净。
 *
 * 轮次级别的「进行中」是 `Orb`(thinking-orbs),那是另一回事:orb 说的是
 * 「这一轮在跑」,液体说的是「这一格里的东西还在长」。不要互相顶替。
 */
import { useEffect, useRef, type ReactElement } from 'react';
import { PHASE_STEP, pixelSizeFor, shade } from '../runtime/pixel-liquid';
import { liquidScheduler } from '../runtime/pixel-liquid-scheduler';
import styles from './PixelLiquid.module.css';

/** 挂载序号 → 相位偏移。一排格子完全同步地脉动会很假。 */
let seat = 0;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PixelLiquid({ className }: { className?: string }): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    /* jsdom / 老浏览器拿不到 2D 上下文:画布留空,宿主自己的底色照样在。 */
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const phase = (seat++ % 16) * PHASE_STEP;
    let img: ImageData | null = null;
    let w = 0;
    let h = 0;
    let pixel = pixelSizeFor(0);

    function measure(): void {
      const target = ref.current;
      if (!target || !ctx) return;
      const nw = Math.max(1, Math.round(target.clientWidth));
      const nh = Math.max(1, Math.round(target.clientHeight));
      if (nw === w && nh === h) return;
      w = nw;
      h = nh;
      /* 画布按 CSS 像素开,不乘 dpr —— 理由见 runtime/pixel-liquid.ts 开头 */
      target.width = w;
      target.height = h;
      pixel = pixelSizeFor(w);
      img = ctx.createImageData(w, h);
    }

    let dirty = true;
    /* 有 ResizeObserver 就只在真的变了尺寸时量;没有就退回交付稿的做法 —— 每帧量。 */
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { dirty = true; })
      : null;
    resizeObserver?.observe(canvas);

    function draw(seconds: number): void {
      if (dirty || !resizeObserver) {
        dirty = false;
        measure();
      }
      if (!img || !ctx) return;
      shade(img, w, h, seconds + phase, pixel);
      ctx.putImageData(img, 0, 0);
    }

    /* 先落一帧:超出动画上限、或者降级了的实例,看到的就是这一帧 —— 不动,但不是灰块。 */
    draw(0);

    if (prefersReducedMotion()) {
      canvas.dataset.liquid = 'static';
      resizeObserver?.disconnect();
      return () => {
        canvas.width = 0;
        canvas.height = 0;
        img = null;
      };
    }
    canvas.dataset.liquid = 'live';

    const ticket = liquidScheduler.join(draw);
    /* 屏幕外的格子不烧 CPU。没有 IntersectionObserver 的环境按「看得见」处理。 */
    const inViewObserver = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => ticket.setVisible(Boolean(entry?.isIntersecting)))
      : null;
    if (inViewObserver) inViewObserver.observe(canvas);
    else ticket.setVisible(true);

    return () => {
      inViewObserver?.disconnect();
      resizeObserver?.disconnect();
      ticket.release();
      /* 0×0 让浏览器立刻回收那块位图,别等 GC */
      canvas.width = 0;
      canvas.height = 0;
      img = null;
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-testid="pixel-liquid"
      className={className ? `${styles.liquid} ${className}` : styles.liquid}
    />
  );
}
