import { describe, expect, it } from 'vitest';
import {
  ATT_NAV_STEP_RATIO,
  attachmentNavDelta,
  attachmentNavState,
} from '../../../src/runtime/chat/attachment-nav';

/** 六张 57px 的卡 + 五道 7px 的缝 = 377,塞进 412 的行里,一行放得下。 */
const FITS = { scrollLeft: 0, scrollWidth: 377, clientWidth: 412 };
/** 七张卡 = 441,412 的行里第七张被切在腰上。 */
const OVERFLOWS = { scrollWidth: 441, clientWidth: 412 };

describe('attachmentNavState', () => {
  it('一行放得下时两枚都不出 —— 常驻的箭头在说一件不存在的事', () => {
    expect(attachmentNavState(FITS)).toEqual({ prev: false, next: false });
  });

  it('停在行首:只出「往后」', () => {
    expect(attachmentNavState({ ...OVERFLOWS, scrollLeft: 0 })).toEqual({
      prev: false,
      next: true,
    });
  });

  it('滚到中间:两枚都出', () => {
    expect(attachmentNavState({ ...OVERFLOWS, scrollLeft: 14 })).toEqual({
      prev: true,
      next: true,
    });
  });

  it('滚到行尾:只出「往前」', () => {
    expect(attachmentNavState({ ...OVERFLOWS, scrollLeft: 441 - 412 })).toEqual({
      prev: true,
      next: false,
    });
  });

  it('亚像素下差那么零点几也算到头了 —— 不留容差箭头会一直亮着却翻不动', () => {
    expect(attachmentNavState({ ...OVERFLOWS, scrollLeft: 0.4 }).prev).toBe(false);
    expect(attachmentNavState({ ...OVERFLOWS, scrollLeft: 441 - 412 - 0.4 }).next).toBe(false);
    // 溢出量本身不足 1px 时整行当作放得下
    expect(attachmentNavState({ scrollLeft: 0, scrollWidth: 412.5, clientWidth: 412 })).toEqual({
      prev: false,
      next: false,
    });
  });

  it('RTL 下 scrollLeft 走负数,判据取绝对值,两个方向同一条规矩', () => {
    expect(attachmentNavState({ ...OVERFLOWS, scrollLeft: -0 })).toEqual({
      prev: false,
      next: true,
    });
    expect(attachmentNavState({ ...OVERFLOWS, scrollLeft: -14 })).toEqual({
      prev: true,
      next: true,
    });
    expect(attachmentNavState({ ...OVERFLOWS, scrollLeft: -(441 - 412) })).toEqual({
      prev: true,
      next: false,
    });
  });

  it('量不出数(SSR / 还没布局)时不出箭头,不猜', () => {
    expect(attachmentNavState({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 })).toEqual({
      prev: false,
      next: false,
    });
    expect(
      attachmentNavState({ scrollLeft: Number.NaN, scrollWidth: Number.NaN, clientWidth: 412 }),
    ).toEqual({ prev: false, next: false });
  });
});

describe('attachmentNavDelta', () => {
  it('一次翻八成宽,留两成重叠 —— 翻过去还看得见刚才那一张', () => {
    expect(ATT_NAV_STEP_RATIO).toBe(0.8);
    expect(attachmentNavDelta('next', 412)).toBeCloseTo(412 * 0.8);
    expect(attachmentNavDelta('prev', 412)).toBeCloseTo(-412 * 0.8);
  });

  it('RTL 下行首在右,物理方向翻过来', () => {
    expect(attachmentNavDelta('next', 412, true)).toBeCloseTo(-412 * 0.8);
    expect(attachmentNavDelta('prev', 412, true)).toBeCloseTo(412 * 0.8);
  });

  it('宽度量不到就翻 0,不会把一行甩到负位置', () => {
    expect(attachmentNavDelta('next', 0)).toBeCloseTo(0);
    expect(attachmentNavDelta('prev', Number.NaN)).toBeCloseTo(0);
  });
});
