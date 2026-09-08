/**
 * 取词浮条「不能跑太远」(用户 2026-09-02 裁决)。
 *
 * > 长选区兜底,把那个发送到会话的悬浮按钮,**始终保持在画面里**不行吗?做不到吗…
 * > 但**尽可能显示在贴近选区的地方**,选区显示在视窗口内,**不能跑太远啊,跑太远肯定就是 bug 了**
 *
 * 拆成两条,优先级从高到低:
 * 1. 浮条整个盒子任何情况下都落在可视区内;
 * 2. 在此前提下尽量贴近选区**看得见的那一段**。
 *
 * 这一组替换掉原来那条「选区比半屏还高就算长选区」的兜底。半屏是在**猜**
 * 「选区大到让不开了」;真正要回答的是「选区现在**有哪一段在画面里**」——
 * 这个不用猜,`first` / `last` 两块矩形和面板矩形一交就量出来了。
 * 而且那条兜底当初是在一个被污染的现场定下的:选区曾把日志底部一块**满宽的空占位盒子**
 * 吞进去(见 `tests/components/chat/quote-bar-anchor-truth.test.tsx`),于是「选区高度」
 * 变成「从你选的地方一直到日志底部」,必然超过半屏、必然触发兜底 —— 过去有一部分
 * 「长选区」是假的。源头已经堵了(只认被高亮的文字画出来的行),这条兜底的真实触发
 * 情况和当初定它时看到的已经不是一回事。
 *
 * ⚠️ jsdom 没有排版,`getBoundingClientRect()` 默认全 0。所以这里测的是**纯函数**
 * `quoteBarPosition`,每一个几何数字都是显式喂进去的 —— 红绿都是真读数。
 *
 * ⚠️ 浮条的 CSS `transform` 必须算进「它实际占的矩形」:朝上是
 * `translate(-50%, -100%)`(盒子在 `top` 之**上**),朝下是 `translateX(-50%)`。
 * 只断言 `top` / `left` 两个数字等于钉了一个不存在的盒子。
 */
import { describe, expect, it } from 'vitest';
import {
  QUOTE_BAR_EDGE_INSET_PX,
  QUOTE_BAR_GAP_ABOVE_PX,
  QUOTE_BAR_GAP_BELOW_PX,
  quoteBarPosition,
  visibleQuoteAnchors,
} from '../../../src/runtime/chat/quote-selection';

/** 一块矩形,按「左上宽高」写更贴近量出来的样子 */
const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

const BAR_WIDTH = 112;
const BAR_HEIGHT = 34;

/** 聊天日志可视区:100..580 × 100..700(下沿就是 composer 上沿) */
const PANEL = box(100, 100, 480, 600);

/**
 * 浮条**实际占的那块矩形** —— 把 CSS transform 的位移算进去。
 *
 * 朝上:`translate(-50%, -100%)`,盒子在 `top` 之上;
 * 朝下:`translateX(-50%)`,盒子从 `top` 往下长。
 * 两档水平都是以 `left` 为中心。
 */
function barRect(
  position: { left: number; top: number; placement: 'above' | 'below' },
  barWidth = BAR_WIDTH,
  barHeight = BAR_HEIGHT,
) {
  const left = position.left - barWidth / 2;
  const top = position.placement === 'above' ? position.top - barHeight : position.top;
  return { left, right: left + barWidth, top, bottom: top + barHeight };
}

function expectInsidePanel(
  position: { left: number; top: number; placement: 'above' | 'below' },
  panel: { left: number; right: number; top: number; bottom: number },
  barWidth = BAR_WIDTH,
  barHeight = BAR_HEIGHT,
): void {
  const bar = barRect(position, barWidth, barHeight);
  expect(bar.left).toBeGreaterThanOrEqual(panel.left);
  expect(bar.right).toBeLessThanOrEqual(panel.right);
  expect(bar.top).toBeGreaterThanOrEqual(panel.top);
  expect(bar.bottom).toBeLessThanOrEqual(panel.bottom);
}

const place = (
  first: ReturnType<typeof box>,
  last: ReturnType<typeof box>,
  panel = PANEL,
  barWidth = BAR_WIDTH,
  barHeight = BAR_HEIGHT,
) => quoteBarPosition({ first, last, panel, barWidth, barHeight });

describe('浮条贴的是选区在画面里**露出来的那一段**', () => {
  /*
   * ① 首行滚到可视区上边之外,末行还看得见。
   *
   * 旧的半屏兜底在这里把浮条丢到面板最顶上(贴一块在画面外几百像素的首行,
   * 再被夹回顶边),水平也居中于那块看不见的矩形 —— 用户说的「跑太远」。
   * 看得见的只有末行,浮条就该贴末行。
   */
  it('首行在画面之上、末行可见时,贴末行下沿 + 稿子的 6px', () => {
    const first = box(150, -400, 260, 22); // -400..-378,滚到画面外
    const last = box(200, 300, 180, 22); // 300..322,可见

    const position = place(first, last);

    expect(position.placement).toBe('below');
    expect(position.top).toBe(last.bottom + QUOTE_BAR_GAP_BELOW_PX); // 328
    expect(position.left).toBe((last.left + last.right) / 2); // 290,居中于看得见的那一行
    expectInsidePanel(position, PANEL);
  });

  /*
   * ② 末行沉到可视区下边之外,首行还看得见。
   *
   * 贴末行会把浮条丢到折线以下,所以退回贴**可见的起点**。旧代码靠半屏兜底
   * 碰巧也走到这一步,所以这一档钉的是**不许回归**。
   */
  it('末行在画面之下、首行可见时,退回贴可见的起点', () => {
    const first = box(200, 110, 180, 22); // 110..132,上方只剩 10px,放不下 34+7
    const last = box(150, 1500, 260, 22); // 沉到画面外

    const position = place(first, last);

    expect(position.placement).toBe('below');
    expect(position.top).toBe(first.bottom + QUOTE_BAR_GAP_BELOW_PX); // 138
    expect(position.left).toBe((first.left + first.right) / 2); // 290
    expectInsidePanel(position, PANEL);
  });

  /*
   * ③ 两头都在画面外(选区比一整屏还高,中间那段可见)。
   *
   * **稿子没有这一格,W32 定**:落在可视区**顶边**(`panel.top + edgeInset`),
   * 水平居中于面板。
   *
   * 理由:整屏都是被选中的字,没有「选区的边」可贴,贴谁都是贴在选区中间。
   * 选顶边有三条:(a) 稿子的默认就是朝上、贴选区**起点**方向,顶边与它同向;
   * (b) 顶边离底下的输入框最远,不会压住用户接着要点/要打字的地方;
   * (c) 两头都看不见时,首行 / 末行的水平位置是画面外的数字,拿它居中等于随机 ——
   * 面板中线是这一档唯一有意义的水平参照。
   *
   * 旧代码在这里贴的是画面外那块首行:垂直被夹回顶边(碰巧同一处),
   * 水平却居中到一块看不见的矩形上,被夹到面板右边缘去了。
   */
  it('两头都在画面外时落在可视区顶边、居中于面板', () => {
    const first = box(500, -400, 60, 22); // 画面之上
    const last = box(120, 1200, 60, 22); // 画面之下

    const position = place(first, last);

    const bar = barRect(position);
    expect(bar.top).toBe(PANEL.top + QUOTE_BAR_EDGE_INSET_PX); // 108
    expect(position.left).toBe((PANEL.left + PANEL.right) / 2); // 340
    expectInsidePanel(position, PANEL);
  });

  /*
   * 选区整个滚出画面(用户把它滚走了)。
   *
   * 这一档的裁决在组件那一层:`QuoteBar` 的 `selectionOnScreen` —— 选区自己
   * 不在可视区里露着了就**收起**浮条(但保留 Selection,ChatPane 不许因此恢复
   * 追尾;滚回画面时浮条自己回来)。这里只钉纯函数那一半:就算调用方没收,
   * 算出来的位置也必须还在画面里,不许是个画面外的坐标。
   */
  it('选区整个滚出画面时,算出来的位置仍在可视区内(藏不藏由组件既有裁决管)', () => {
    const scrolledAway = place(box(150, -900, 260, 22), box(150, -700, 260, 22));
    expectInsidePanel(scrolledAway, PANEL);

    const scrolledPast = place(box(150, 1400, 260, 22), box(150, 1600, 260, 22));
    expectInsidePanel(scrolledPast, PANEL);
  });

  /*
   * ④ 单行选区(退化情形,first === last)。整块都在画面里,行为不许变:
   * 上方放得下就贴上方 7px。
   */
  it('单行选区在画面里时照旧贴上方 7px', () => {
    const line = box(200, 400, 180, 22);
    const position = place(line, line);

    expect(position.placement).toBe('above');
    expect(position.top).toBe(line.top - QUOTE_BAR_GAP_ABOVE_PX); // 393
    expect(position.left).toBe((line.left + line.right) / 2); // 290
    expectInsidePanel(position, PANEL);
  });

  /*
   * ⑤ 选区紧贴可视区上沿 / 下沿,那 7px / 6px 放不下。
   */
  it('紧贴上沿放不下 7px 时翻到下方,浮条仍整块在画面里', () => {
    const line = box(200, 105, 180, 22); // 上方只剩 5px
    const position = place(line, line);

    expect(position.placement).toBe('below');
    expect(position.top).toBe(line.bottom + QUOTE_BAR_GAP_BELOW_PX); // 133
    expectInsidePanel(position, PANEL);
  });

  it('紧贴下沿放不下 6px 时留在上方,浮条仍整块在画面里', () => {
    const line = box(200, 690, 180, 22); // 690..712,下沿已经越过折线 700
    const position = place(line, line);

    expect(position.placement).toBe('above');
    expect(position.top).toBe(line.top - QUOTE_BAR_GAP_ABOVE_PX); // 683
    expectInsidePanel(position, PANEL);
  });

  /*
   * ⑥ 面板本身很矮(小窗口):两侧都放不下,浮条只能挤在中间,但不许越界。
   */
  it('面板矮到两侧都放不下时,浮条仍整块在画面里', () => {
    const shortPanel = box(100, 100, 480, 60); // 100..160,只比浮条高 26
    const line = box(200, 120, 180, 22);
    const position = place(line, line, shortPanel);

    expectInsidePanel(position, shortPanel);
  });

  it('面板矮到连一道安全内缩都放不下时,浮条居中于面板且仍在画面里', () => {
    const tinyPanel = box(100, 100, 130, 40); // 只比浮条高 6 / 宽 18
    const line = box(140, 110, 40, 12);
    const position = place(line, line, tinyPanel);

    expectInsidePanel(position, tinyPanel);
  });
});

/**
 * 判据本身:选区和可视区一交,得到「朝上贴谁 / 朝下贴谁」。
 * 上面那组测的是它算出来的落点,这一组直接读判据,好让三档一眼看清。
 */
describe('可见锚点的三档', () => {
  it('两头都露头:各自按可视区裁一刀,整块在画面里时一个像素都不裁', () => {
    const first = box(200, 200, 180, 22);
    const last = box(220, 400, 160, 22);
    expect(visibleQuoteAnchors({ first, last, panel: PANEL })).toEqual({
      above: first,
      below: last,
    });

    // 骑在顶边上的那块被裁到 panel.top —— 贴的是它看得见的那条边
    const straddling = box(200, 90, 180, 22); // 90..112
    expect(visibleQuoteAnchors({ first: straddling, last, panel: PANEL }).above).toEqual({
      left: 200,
      right: 380,
      top: PANEL.top, // 100,不是 90
      bottom: 112,
    });
  });

  it('首行沉在画面之上:朝上退化成可视区顶边,朝下仍贴可见的末行', () => {
    const first = box(150, -400, 260, 22);
    const last = box(200, 300, 180, 22);
    const anchors = visibleQuoteAnchors({ first, last, panel: PANEL });

    // 顶边上一条零高的线 —— 水平借还看得见的末行,不是画面外首行的坐标
    expect(anchors.above).toEqual({ left: 200, right: 380, top: 100, bottom: 100 });
    expect(anchors.below).toEqual(last);
  });

  it('末行沉在折线之下:朝下退回贴可见的起点', () => {
    const first = box(200, 110, 180, 22);
    const last = box(150, 1500, 260, 22);
    const anchors = visibleQuoteAnchors({ first, last, panel: PANEL });

    expect(anchors.above).toEqual(first);
    expect(anchors.below).toEqual(first);
  });

  it('两头都不露头:上下都退化成可视区边界、水平取整个面板', () => {
    const anchors = visibleQuoteAnchors({
      first: box(500, -400, 60, 22),
      last: box(120, 1200, 60, 22),
      panel: PANEL,
    });

    expect(anchors.above).toEqual({ left: 100, right: 580, top: 100, bottom: 100 });
    expect(anchors.below).toEqual({ left: 100, right: 580, top: 700, bottom: 700 });
  });
});

/**
 * 用户那句话的**不变量**:无论喂什么几何,浮条实际占的矩形整个落在可视区内。
 *
 * 前提只有一条 —— 面板本身放得下浮条(`barWidth <= 面板宽 && barHeight <= 面板高`)。
 * 面板比浮条还小的时候没有任何落点能满足它,那是渲染层的问题,不是判据的。
 *
 * ⚠️ 说清楚:这一条在**改动之前也是绿的** —— `quoteBarPosition` 末尾那段边缘夹取
 * 早就无条件把 `left` / `top` 夹进面板了。真正坏掉的是「贴近」那一半(上面那组),
 * 所以红证据在上面那组、不在这里。这条留着是**护栏**:以后谁把夹取拆了、
 * 或者新加一档落点忘了夹,这里当场红。
 */
describe('不变量:浮条永远整个在可视区内', () => {
  const panels = [
    box(100, 100, 480, 600), // 常规
    box(0, 0, 300, 200), // 窄
    box(100, 100, 480, 60), // 矮
    box(100, 100, 130, 40), // 矮到放不下内缩
  ];

  const selections: Array<[ReturnType<typeof box>, ReturnType<typeof box>, string]> = [
    [box(200, 400, 180, 22), box(200, 400, 180, 22), '单行,画面正中'],
    [box(200, 130, 180, 22), box(200, 250, 180, 22), '多行,全在画面里'],
    [box(150, -400, 260, 22), box(200, 300, 180, 22), '首行在画面之上'],
    [box(200, 110, 180, 22), box(150, 1500, 260, 22), '末行在画面之下'],
    [box(500, -400, 60, 22), box(120, 1200, 60, 22), '两头都在画面之外'],
    [box(150, -900, 260, 22), box(150, -700, 260, 22), '整段滚到画面之上'],
    [box(150, 1400, 260, 22), box(150, 1600, 260, 22), '整段滚到画面之下'],
    [box(-200, 400, 80, 22), box(-200, 400, 80, 22), '横向也在画面之外'],
    [box(2000, 400, 80, 22), box(2000, 400, 80, 22), '横向甩到画面右侧之外'],
    [box(105, 105, 8, 8), box(105, 105, 8, 8), '贴着左上角的一小块'],
  ];

  for (const panel of panels) {
    const panelWidth = panel.right - panel.left;
    const panelHeight = panel.bottom - panel.top;
    for (const [first, last, label] of selections) {
      it(`${label} × 面板 ${panelWidth}×${panelHeight}`, () => {
        const barWidth = Math.min(BAR_WIDTH, panelWidth);
        const barHeight = Math.min(BAR_HEIGHT, panelHeight);
        const position = place(first, last, panel, barWidth, barHeight);
        expectInsidePanel(position, panel, barWidth, barHeight);
      });
    }
  }
});
