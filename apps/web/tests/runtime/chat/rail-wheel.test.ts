/**
 * 红测:**消息导轨消化不掉的滚轮,必须交给聊天记录。**
 *
 * ── 症状(真机坐实) ────────────────────────────────────────────────────
 * 指针落在右侧 20px 的用户消息导轨上时,滚轮对聊天记录完全无效 —— 上下两个
 * 方向都死。出现条件只是「≥2 条用户消息」(`CHAT_RAIL_MIN_USER_MESSAGES`),
 * 几乎每段对话都有;导轨平时 `opacity: 0` 却照样吃输入,而 `.chat-log` 又
 * **故意没有滚动条**(注释里写明导轨就是替代品),于是用户按肌肉记忆把指针停在
 * 右边缘,正好落进死区,屏幕上没有任何线索。
 *
 * ── 根因是结构性的 ─────────────────────────────────────────────────────
 * 导轨是 `.chat-log` 的**兄弟节点**(同在 `.chat-log-viewport` 的一个 grid cell
 * 里叠着),不是祖先。Chromium 沿**祖先链**找滚动容器,chat log 从来不在那条
 * 链上;往上找到的 `.chat-log-viewport` / `.chat-log-wrap` / `.pane` 都不接受
 * 滚轮。所以浏览器没有任何理由把这个滚轮交给聊天记录 —— 得由代码交。
 *
 * ⚠️ `overscroll-behavior: contain` **不是**原因。已反证:改成 `auto`、把轨道
 * 滚到底再发滚轮,日志仍然不动 —— scroll chaining 只往**祖先**传,而 log 不是
 * 祖先。摘掉它不构成修复,这条规格也不去测它。
 *
 * ── 这一层能证明什么 / 不能证明什么 ─────────────────────────────────────
 * 能:**位移怎么分账** —— 轨道不可滚 / 可滚且已到底 / 可滚且还有余量,分别应当
 * 把多少交给聊天记录;以及 `deltaMode` 不是像素时怎么折算。
 * 不能:**指针落在导轨上时滚轮到底走不走这条路**。那是命中测试 + 布局的事,
 * jsdom 两样都没有,只有真机能确认(见测试文件末尾的清单)。
 */
import { describe, expect, it } from 'vitest';

import {
  RAIL_WHEEL_FALLBACK_VIEWPORT_PX,
  railWheelDeltaPx,
  splitRailWheelDelta,
} from '../../../src/runtime/chat/rail-wheel';

/** 轨道压根不可滚:短会话里那一列短横比导轨矮,`scrollHeight === clientHeight`。 */
const NOT_SCROLLABLE = { scrollTop: 0, scrollHeight: 300, clientHeight: 300 };
/** 长会话里那一列短横自己会滚:600 的内容、400 的窗口 ⇒ 200px 行程。 */
const scrollable = (scrollTop: number) => ({
  scrollTop,
  scrollHeight: 600,
  clientHeight: 400,
});

describe('导轨滚轮分账 · splitRailWheelDelta', () => {
  describe('★ 轨道吃不下的,全部交给聊天记录', () => {
    it('轨道不可滚时,向下的位移一分不留全给 log', () => {
      expect(splitRailWheelDelta(120, NOT_SCROLLABLE)).toEqual({ track: 0, log: 120 });
    });

    it('轨道不可滚时,向上的位移同样全给 log —— 缺陷是上下两个方向都死', () => {
      expect(splitRailWheelDelta(-120, NOT_SCROLLABLE)).toEqual({ track: 0, log: -120 });
    });

    it('轨道可滚但**已经到底**,继续向下滚要交给 log', () => {
      // 行程 200,已经在 200 —— 向下再没有余量。
      expect(splitRailWheelDelta(120, scrollable(200))).toEqual({ track: 0, log: 120 });
    });

    it('轨道可滚但**已经到顶**,继续向上滚要交给 log', () => {
      expect(splitRailWheelDelta(-120, scrollable(0))).toEqual({ track: 0, log: -120 });
    });

    it('轨道还没挂上(ref 为空)时,整份交给 log', () => {
      expect(splitRailWheelDelta(120, null)).toEqual({ track: 0, log: 120 });
    });
  });

  describe('★ 轨道自己还有余量时先给轨道 —— 别把导轨自己的滚动弄没了', () => {
    it('余量够,整份留给轨道,log 一动不动', () => {
      // 在 0,向下余量 200,要 120 ⇒ 全吃下。
      expect(splitRailWheelDelta(120, scrollable(0))).toEqual({ track: 120, log: 0 });
    });

    it('向上同理:在 200,向上余量 200,要 120 ⇒ 全吃下', () => {
      expect(splitRailWheelDelta(-120, scrollable(200))).toEqual({ track: -120, log: 0 });
    });

    it('余量只够一半:轨道吃到底,**剩下的交给 log**,不许丢', () => {
      // 在 150,向下余量 50,要 120 ⇒ 轨道 50、log 70。
      expect(splitRailWheelDelta(120, scrollable(150))).toEqual({ track: 50, log: 70 });
    });

    it('向上的半份同理', () => {
      // 在 50,向上余量 50,要 120 ⇒ 轨道 -50、log -70。
      expect(splitRailWheelDelta(-120, scrollable(50))).toEqual({ track: -50, log: -70 });
    });
  });

  describe('边界', () => {
    it('位移为 0 / 非数时什么都不做 —— 不去无谓地取消默认行为', () => {
      expect(splitRailWheelDelta(0, scrollable(0))).toEqual({ track: 0, log: 0 });
      expect(splitRailWheelDelta(Number.NaN, scrollable(0))).toEqual({ track: 0, log: 0 });
      expect(splitRailWheelDelta(Number.POSITIVE_INFINITY, null)).toEqual({ track: 0, log: 0 });
    });

    it('几何越界(scrollTop 大于行程)不许算出负余量', () => {
      expect(splitRailWheelDelta(120, { scrollTop: 9999, scrollHeight: 600, clientHeight: 400 }))
        .toEqual({ track: 0, log: 120 });
      expect(splitRailWheelDelta(-120, { scrollTop: -50, scrollHeight: 600, clientHeight: 400 }))
        .toEqual({ track: 0, log: -120 });
    });
  });
});

/**
 * 归一化。接管之后位移是我们自己写进 `scrollTop` 的,单位就必须自己负责:
 * Firefox 在部分平台上用 `DOM_DELTA_LINE`,一格滚轮的 `deltaY` 是 3 ——
 * 不折算的话转给聊天记录的就是 3px,滚动等于纹丝不动。
 */
describe('导轨滚轮归一化 · railWheelDeltaPx', () => {
  it('DOM_DELTA_PIXEL(0) 原样通过 —— macOS / Windows Chromium 走的就是这条', () => {
    expect(railWheelDeltaPx(120, 0, 600)).toBe(120);
  });

  it('DOM_DELTA_LINE(1) 折算成像素,不能按 3px 当一格', () => {
    expect(railWheelDeltaPx(3, 1, 600)).toBeGreaterThan(3);
  });

  it('DOM_DELTA_PAGE(2) 按可视高度折算', () => {
    expect(railWheelDeltaPx(1, 2, 600)).toBe(600);
  });

  it('还读不到可视高度时,页模式退到兜底高度,而不是折算成 0', () => {
    expect(railWheelDeltaPx(1, 2, 0)).toBe(RAIL_WHEEL_FALLBACK_VIEWPORT_PX);
  });

  it('非数的 deltaY 折算成 0', () => {
    expect(railWheelDeltaPx(Number.NaN, 0, 600)).toBe(0);
  });
});
