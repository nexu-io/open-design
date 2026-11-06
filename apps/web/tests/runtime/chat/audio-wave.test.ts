/** 音频波形的采样规则 —— 兜底必须稳定,不能每次刷新长得不一样 */
import { describe, expect, it } from 'vitest';
import { fallbackWave, formatClock, playedBars } from '../../../src/runtime/chat/audio-wave';

describe('兜底采样', () => {
  it('同一段音频每次都画出同一条波形', () => {
    expect(fallbackWave(48, 40)).toEqual(fallbackWave(48, 40));
  });

  it('不同时长的音频波形不同 —— 不是一条写死的假图', () => {
    expect(fallbackWave(48, 40)).not.toEqual(fallbackWave(12, 40));
  });

  it('取值落在稿子那排竖条的范围里(3 ~ 43)', () => {
    for (const h of fallbackWave(48, 64)) {
      expect(h).toBeGreaterThanOrEqual(3);
      expect(h).toBeLessThanOrEqual(43);
    }
  });
});

describe('已播那截', () => {
  it('停着的时候一条都不点亮', () => {
    expect(playedBars(0, 48, 40)).toBe(0);
  });
  it('播到一半点亮一半', () => {
    expect(playedBars(24, 48, 40)).toBe(20);
  });
  it('播完全亮,而且不会越界', () => {
    expect(playedBars(99, 48, 40)).toBe(40);
  });
  it('时长未知时不乱点', () => {
    expect(playedBars(10, 0, 40)).toBe(0);
  });
});

describe('时间', () => {
  it('只给分:秒', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(-3)).toBe('0:00');
  });
});
