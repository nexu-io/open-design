/**
 * 附件行翻页箭头的纯算法(设计稿第 58 格 `.att-nav`)。
 *
 * 这一行永远单行、超出横向滚动,而**滚动条按稿子是藏起来的**
 * (`.user-attachments.msg-att { scrollbar-width: none }`)。于是「还能往哪边走」
 * 没有任何东西在说 —— 触控板能横扫,鼠标只剩「按住 shift 滚轮」这一条暗路。
 * 稿子本来就画了两枚翻页箭头补这个洞,这里是它的判据部分。
 *
 * 判据只认三个数(`scrollLeft` / `scrollWidth` / `clientWidth`),不碰 DOM ——
 * 组件量好喂进来,这样「什么时候该出箭头」可以脱离 jsdom 直接单测。
 */

export interface AttachmentScrollMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export interface AttachmentNavState {
  /** 行首方向还有被卷走的东西 */
  prev: boolean;
  /** 行尾方向还有没露出来的东西 */
  next: boolean;
}

/**
 * 1px 容差:亚像素宽度下滚到底了 `scrollLeft` 也可能差那么零点几,
 * 不留容差的话到头那一侧的箭头会一直亮着 —— 而它此刻什么都翻不动。
 */
export const ATT_NAV_EPSILON = 1;

/**
 * 一次翻**八成宽**,不是整屏:留两成重叠,翻过去还能看见刚才那一张,
 * 人才知道自己是接着看,不是跳到了另一段。
 */
export const ATT_NAV_STEP_RATIO = 0.8;

/**
 * 该不该出箭头。**只在真的被遮住时才出** —— 一行放得下时两枚都不出:
 * 常驻的箭头是在说「这里有东西看不见」,而那时并没有。
 *
 * RTL 说明:规范里 RTL 容器的 `scrollLeft` 从 0 往**负数**走,所以这里一律取
 * 绝对值当作「离行首滚了多远」。这样同一条判据在两个方向上都成立,
 * 不需要在样式和逻辑里各留一套。
 */
export function attachmentNavState(metrics: AttachmentScrollMetrics): AttachmentNavState {
  const scrollWidth = num(metrics.scrollWidth);
  const clientWidth = num(metrics.clientWidth);
  const max = scrollWidth - clientWidth;
  if (!(max > ATT_NAV_EPSILON)) return { prev: false, next: false };
  const scrolled = Math.abs(num(metrics.scrollLeft));
  return {
    prev: scrolled > ATT_NAV_EPSILON,
    next: scrolled < max - ATT_NAV_EPSILON,
  };
}

/**
 * 点一下要滚多少像素。返回值直接喂给 `scrollBy({ left })`,所以带**物理**方向:
 * `left` 是物理轴,而 `prev` 是**逻辑**行首 —— RTL 下两者相反,在这里翻过来,
 * 调用方不必再想一遍。
 */
export function attachmentNavDelta(
  direction: 'prev' | 'next',
  clientWidth: number,
  rtl = false,
): number {
  const step = Math.max(0, num(clientWidth)) * ATT_NAV_STEP_RATIO;
  const towardsStart = direction === 'prev';
  // LTR:行首在左,往行首走是负的;RTL 正好反过来。
  const sign = towardsStart === rtl ? 1 : -1;
  return step * sign;
}

function num(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
