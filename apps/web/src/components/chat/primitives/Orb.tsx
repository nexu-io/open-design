/**
 * 那颗会转的球 —— 壳头的「进行中 / 思考中」、步骤上的「正在跑」都是它。
 *
 * 来源与取舍(D8):
 * 上游 `thinking-orbs@0.3.1`(MIT,Jakub Antalik)。包本身是 React 组件,但它把几何和画笔
 * 单独发在 `thinking-orbs/engine` 这个入口上 —— 纯 2D canvas、零依赖。设计稿是把整份引擎
 * **内联**进单文件预览页的(那是为了双击即开、且 artifact 查看器的 CSP 会拦外站请求);
 * 我们是 React 应用,**装包不内联**,25KB 引擎没必要抄进源码。
 *
 * 为什么用 `MODE_FRAMES` 而不是 `MODE_DRAWS`:
 * 设计稿要求这颗球跟着 `--chat-anim-ink` 染色(和上传流光、文字扫光同一个墨色),
 * 而上游的画笔是写死的灰。稿子里的做法是改引擎内部变量 —— 装包之后改不了,也不该改。
 * 但引擎把「几何」和「画」拆开了:`MODE_FRAMES[mode]` 给的是纯数据(点、线、以及每个点的
 * 墨值 `white`),自己画一遍即可。**景深不会丢** —— 引擎的远近本来就是靠墨的明暗表达的,
 * 这里把那份明暗转成 alpha 再上色,只是换了个通道。
 *
 * 另外三件按设计稿来的事:
 *  · 时钟取全局 `performance.now()`,不各自从 0 起 —— 一屏几颗球要同相,不能各转各的
 *  · 滚出视口 / 切走标签页就停,回来接着当前时钟走(一颗没人看的 canvas 不该占着帧)
 *  · 关了动效的人给一帧**静止的代表帧**(t=0.6,和上游同一帧),不是空白也不是转圈
 */
import { useEffect, useRef, type ReactElement } from 'react';
import { MODE_FRAMES, resolvePreset, type OrbState } from 'thinking-orbs/engine';

export interface OrbProps {
  /** 上游的状态名。壳头用 connecting(进行中)/ composing(思考中),步骤用 solving */
  state: OrbState;
  /** 画布显示尺寸(CSS px)。几何档位固定取 20,见下 */
  box?: number;
  /**
   * 读屏念什么。**旁边已经有同义文字时就不要传** —— 壳头的球紧挨着「进行中」三个字,
   * 再给一遍标签就是念两遍;不传则整颗球对读屏隐身,由那行字负责表达状态。
   * 步骤记号上的球没有伴随文字(同排的 ✓ / ✕ 也都是自带 aria-label 的图),所以必须传。
   */
  label?: string;
  className?: string;
}

/**
 * 几何档位。上游只发 64 和 20 两档,而且明说**不是缩放系数**,是两套各自调过点数与点径的
 * 设计 —— 传 24 进 `resolvePreset` 会直接取不到表。所以档位固定 20,只把这一档画到更大的盒子里:
 * 几何按 box/20 等比放大,backing store 也跟着放大,不是把 20px 的位图拉上去。
 */
const GEOMETRY_SIZE = 20;
/** 关掉动效时定格的那一帧,与上游示例同一个 t */
const STILL_T = 0.6;

/** 把 `--chat-anim-ink` 解析成 rgb;没写就返回 null,退回上游的灰 */
function readInk(host: HTMLElement): [number, number, number] | null {
  const raw = getComputedStyle(host).getPropertyValue('--chat-anim-ink').trim();
  if (!raw) return null;
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return null;
  probe.fillStyle = '#000';
  probe.fillStyle = raw;                       // 交给浏览器解析,任何合法写法都行
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(probe.fillStyle);
  if (!m?.[1] || !m[2] || !m[3]) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

export function Orb({ state, box = 20, label, className }: OrbProps): ReactElement {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement('canvas');
    if (label != null) {
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', label);
    }
    canvas.style.width = `${box}px`;
    canvas.style.height = `${box}px`;
    canvas.style.display = 'block';
    host.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return () => { canvas.remove(); };

    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(box * dpr);
    canvas.height = Math.round(box * dpr);

    const preset = resolvePreset(state, GEOMETRY_SIZE);
    const frameOf = MODE_FRAMES[preset.mode];
    const ink = readInk(host);
    // 产品当前强制亮色(D20),但主题一旦解禁这里不用改:墨值到 alpha 的映射两边都成立
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';

    const paint = (t: number): void => {
      const frame = frameOf(GEOMETRY_SIZE, t, preset.opts);
      const k = dpr * box / GEOMETRY_SIZE;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, GEOMETRY_SIZE, GEOMETRY_SIZE);
      // 线先画,点压在自己的边上面(与上游 paintFrame 的顺序一致)
      for (const line of frame.lines) {
        ctx.strokeStyle = shade(ink, line.white, line.a ?? 1, dark);
        ctx.lineWidth = line.w;
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
      }
      for (const dot of frame.dots) {
        ctx.fillStyle = shade(ink, dot.white, dot.a ?? 1, dark);
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    const clock = (): number => performance.now() / 1000 * preset.speed;

    let raf = 0;
    let running = false;
    let visible = true;
    const tick = (): void => { paint(clock()); if (running) raf = requestAnimationFrame(tick); };
    const start = (): void => { if (!running) { running = true; raf = requestAnimationFrame(tick); } };
    const stop = (): void => { running = false; cancelAnimationFrame(raf); };
    // 定格帧只画一次:sync 会被 IntersectionObserver / 可见性 / 动效开关反复调,
    // 不记这一笔的话,关了动效的人每收到一次事件就白画一帧
    let frozen = false;
    const sync = (): void => {
      if (reduce?.matches) {
        stop();
        if (!frozen) { paint(STILL_T); frozen = true; }
        return;
      }
      frozen = false;
      if (visible && document.visibilityState !== 'hidden') start(); else stop();
    };

    // 先落一帧再说 —— IntersectionObserver 的头一次回调是异步的,不能让它空着
    if (reduce?.matches) { paint(STILL_T); frozen = true; } else { paint(clock()); }

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(([entry]) => {
        visible = entry?.isIntersecting ?? true;
        sync();
      });
      observer.observe(canvas);
    } else {
      sync();
    }
    document.addEventListener('visibilitychange', sync);
    reduce?.addEventListener('change', sync);

    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reduce?.removeEventListener('change', sync);
      canvas.remove();
    };
  }, [state, box, label]);

  // 传了标签就由 canvas 自己去念;没传才整块隐身 —— 反过来写的话
  // aria-hidden 会连同 canvas 上的标签一起吞掉,标签成了死代码
  /*
   * `data-orb-box` 是给 CSS 用的:稿子按尺寸档给不同的负外边距
   * (`.orb[data-orb-box="24"] { margin-inline: -3px }`)—— 球的画布四周本来就留了空,
   * 不收回来的话它和旁边的字之间会多出一段莫名其妙的空隙。
   */
  return (
    <span
      ref={hostRef}
      className={className}
      data-orb={state}
      data-orb-box={box}
      aria-hidden={label == null || undefined}
    />
  );
}

/**
 * 墨值 → 颜色。`white` 是上游的墨:0 = 纸上最浓的一笔。
 * 浅底上墨越重颜色越浓;深底上引擎会把墨值镜像,所以近处的点反而要亮。
 * 没给 ink 就退回上游的灰,行为与 `paintFrame` 一致。
 */
function shade(ink: [number, number, number] | null, white: number, alpha: number, dark: boolean): string {
  const v = dark ? 1 - white : white;
  if (!ink) {
    const level = Math.round((dark ? 1 - v : v) * 255);
    return `rgba(${level},${level},${level},${alpha})`;
  }
  const strength = 1 - v;   // 墨越重(v→0),这一笔越浓
  return `rgba(${ink[0]},${ink[1]},${ink[2]},${(alpha * strength).toFixed(3)})`;
}
