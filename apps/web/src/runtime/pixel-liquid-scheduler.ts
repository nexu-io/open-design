/**
 * 像素液体的共享节拍器。
 *
 * 交付稿里每个实例自己开一条 `requestAnimationFrame` 死循环 —— 那是一张
 * 单文件静态稿,一页统共六格。产品里不行:聊天流水很长,一轮可能同时挂着
 * 四格生图 + 两张还在写的产物卡,再往上翻还有更早几轮的。所以这里收成
 * **一条 rAF 驱动全部实例**,并且加三道闸:
 *
 *   ① 看不见就停(`setVisible(false)`,由 IntersectionObserver 喂)。
 *   ② 页面藏起来就停(`setPaused`,由 visibilitychange 喂)。
 *      rAF 在后台标签页本来就不跑,这条是给「窗口被挡住但仍在跑」的实现兜底。
 *   ③ 同时动的实例有上限。超出的那些停在自己挂载时画的那一帧上 ——
 *      不是灰块,只是不动;屏幕上一次也塞不下那么多在动的格子。
 *
 * 节流按 FPS 走(30):方格本身就在跳,60 帧只是多烧一倍 CPU。
 */
import { FPS } from './pixel-liquid';

/** 同时在动的实例上限。四格一排,两排还有余量;再多屏幕上也读不过来。 */
const MAX_ANIMATING = 8;

export interface LiquidFrameHost {
  requestFrame(callback: (ms: number) => void): number;
  cancelFrame(handle: number): void;
}

export interface LiquidTicket {
  /** 进/出视口。只有「可见」的实例才有资格排进循环。 */
  setVisible(visible: boolean): void;
  /** 卸载时调用:摘掉自己,必要时把循环收干净。 */
  release(): void;
}

export interface LiquidSchedulerStats {
  /** 还挂在调度器上的实例数 */
  registered: number;
  /** 这一帧真的会被画的实例数(可见 且 在上限之内) */
  animating: number;
  /** 循环是否还排着下一帧 */
  ticking: boolean;
}

export interface LiquidScheduler {
  join(draw: (seconds: number) => void): LiquidTicket;
  setPaused(paused: boolean): void;
  stats(): LiquidSchedulerStats;
}

interface Member {
  draw: (seconds: number) => void;
  visible: boolean;
}

export function createLiquidScheduler(
  host: LiquidFrameHost,
  options: { fps?: number; maxAnimating?: number } = {},
): LiquidScheduler {
  const fps = options.fps ?? FPS;
  const maxAnimating = options.maxAnimating ?? MAX_ANIMATING;
  /* 加入顺序即排队顺序:先挂上的先拿到动画名额,后面的顶上来靠前面的释放。 */
  const members: Member[] = [];
  let paused = false;
  let handle = 0;
  let ticking = false;
  let last = -1;

  /** 这一帧该画谁:可见的,按加入顺序取前 maxAnimating 个。 */
  function animating(): Member[] {
    const out: Member[] = [];
    for (const member of members) {
      if (!member.visible) continue;
      out.push(member);
      if (out.length >= maxAnimating) break;
    }
    return out;
  }

  function frame(ms: number): void {
    ticking = false;
    const seconds = ms / 1000;
    if (last < 0 || seconds - last >= 1 / fps) {
      last = seconds;
      for (const member of animating()) member.draw(seconds);
    }
    sync();
  }

  function sync(): void {
    const shouldTick = !paused && animating().length > 0;
    if (shouldTick === ticking) return;
    if (shouldTick) {
      ticking = true;
      handle = host.requestFrame(frame);
    } else {
      host.cancelFrame(handle);
      ticking = false;
      /* 下次起步立刻画一帧,而不是先欠 1/fps 秒 */
      last = -1;
    }
  }

  return {
    join(draw) {
      const member: Member = { draw, visible: false };
      members.push(member);
      return {
        setVisible(visible) {
          if (member.visible === visible) return;
          member.visible = visible;
          sync();
        },
        release() {
          const at = members.indexOf(member);
          if (at < 0) return;
          members.splice(at, 1);
          sync();
        },
      };
    },
    setPaused(next) {
      if (paused === next) return;
      paused = next;
      sync();
    },
    stats() {
      return { registered: members.length, animating: animating().length, ticking };
    },
  };
}

/* ── 全应用共用的那一条 ───────────────────────────────────── */

const browserHost: LiquidFrameHost = {
  requestFrame(callback) {
    /* 每次调用现取:SSR / node 环境下 rAF 可能压根不存在,那就永远不排帧 ——
       实例仍然挂得上、仍然会在挂载时画一帧,只是不动。 */
    return typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : 0;
  },
  cancelFrame(handle) {
    if (handle && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
  },
};

export const liquidScheduler: LiquidScheduler = createLiquidScheduler(browserHost);

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    liquidScheduler.setPaused(document.visibilityState === 'hidden');
  });
}
