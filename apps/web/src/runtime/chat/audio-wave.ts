/**
 * 音频波形的**采样规则**(设计稿组件 24)。
 *
 * 契约里没有波形数据(T17),所以拿不到真采样时要有个兜底。
 * 兜底必须是**稳定**的 —— 同一段音频每次渲染画出同一条波形。
 * 用随机数会让同一条音频每次刷新都长得不一样,那比没有波形更糟。
 */

/** 稿子那排竖条的取值范围:`--h` 从 3 到 43(乘 0.68px 后是 2 ~ 29px) */
const MIN_H = 3;
const MAX_H = 43;

/**
 * 按「音频时长 + 条数」生成一条**确定**的伪采样。
 *
 * 用的是整数哈希扩散(xorshift 风格),没有随机源:同样的入参永远同样的输出。
 */
export function fallbackWave(durationSec: number, bars: number): number[] {
  const seed = Math.max(1, Math.round(durationSec * 1000));
  const out: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    let x = (seed ^ (i * 0x9e3779b9)) >>> 0;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    out.push(MIN_H + (x % (MAX_H - MIN_H + 1)));
  }
  return out;
}

/** 播到第几条为止要点亮 —— 已播那截变实(稿子第 44 格) */
export function playedBars(currentSec: number, durationSec: number, bars: number): number {
  if (!(durationSec > 0)) return 0;
  const ratio = Math.min(1, Math.max(0, currentSec / durationSec));
  return Math.round(ratio * bars);
}

/** `0:00` / `1:05` —— 和稿子一致,只给分:秒 */
export function formatClock(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
