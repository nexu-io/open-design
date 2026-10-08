/**
 * 正文取词的纯判据。这一层不碰 DOM,所以能把规则一条条钉死。
 */
import { describe, expect, it } from 'vitest';
import {
  appendQuote,
  appendQuoteOutcome,
  isQuotable,
  normalizeQuoteText,
  quoteBarPlacement,
  quoteBarPosition,
  quotePromptPrefix,
  splitQuotedPrompt,
} from '../../../src/runtime/chat/quote-selection';

/** 一块选区矩形,按「左上宽高」写更贴近量出来的样子 */
const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe('浮条翻面(稿子 23-1 / 23-2)', () => {
  /*
   * 稿子 `.selbar { bottom: calc(100% + 7px) }` 是**默认**,
   * `.selbar.mod-below { top: calc(100% + 6px) }` 才是翻面那一格。
   * 产品原来反着来 —— 浮条不但盖住接着要读的下一行,还把定位基准换成了
   * 选区下沿,于是下沿一跑远它就跟着掉下去(OPEND 现场那一发)。
   */
  it('上下都放得下时默认摆在选区上方', () => {
    expect(quoteBarPlacement({
      selectionTop: 300,
      selectionBottom: 320,
      panelTop: 100,
      panelBottom: 500,
    })).toBe('above');
  });

  it('选区贴着面板顶边才翻到下方', () => {
    expect(quoteBarPlacement({
      selectionTop: 110,
      selectionBottom: 130,
      panelTop: 100,
      panelBottom: 500,
    })).toBe('below');
  });

  it('上方差一像素放不下才翻到下方', () => {
    // 需要的空间 = 浮条 34 + 稿子那道 7px 缝
    expect(quoteBarPlacement({
      selectionTop: 141,
      selectionBottom: 165,
      panelTop: 100,
      panelBottom: 500,
      barHeight: 34,
    })).toBe('above');
    expect(quoteBarPlacement({
      selectionTop: 140,
      selectionBottom: 164,
      panelTop: 100,
      panelBottom: 500,
      barHeight: 34,
    })).toBe('below');
  });

  it('选区贴着 composer 时照样在上方 —— 上方本来就是默认', () => {
    expect(quoteBarPlacement({
      selectionTop: 450,
      selectionBottom: 480,
      panelTop: 100,
      panelBottom: 500,
    })).toBe('above');
  });

  it('上下都放不下时选择空间更大的一侧', () => {
    // 上 15 / 下 30
    expect(quoteBarPlacement({
      selectionTop: 115,
      selectionBottom: 130,
      panelTop: 100,
      panelBottom: 160,
    })).toBe('below');
    // 上 30 / 下 15
    expect(quoteBarPlacement({
      selectionTop: 130,
      selectionBottom: 145,
      panelTop: 100,
      panelBottom: 160,
    })).toBe('above');
  });
});

describe('浮条位置夹取', () => {
  const panel = box(100, 100, 300, 400); // 100..400 × 100..500

  it('常规选区把浮条放在选区上方并保留稿子的 7px 缝', () => {
    const line = box(180, 250, 80, 20);
    const position = quoteBarPosition({ first: line, last: line, panel, barHeight: 34 });

    expect(position).toEqual({ left: 220, top: 243, placement: 'above' });
  });

  it('翻到下方时用的是稿子的 6px 缝,不是上方那道 7px', () => {
    const line = box(180, 110, 80, 20);
    const position = quoteBarPosition({ first: line, last: line, panel, barHeight: 34 });

    expect(position.placement).toBe('below');
    expect(position.top).toBe(136);
  });

  /*
   * 稿子的 CSS 注释把参照写死了:「定位参照是【选区】不是整段」。
   * 跨行选区的并集中心就是段落中心 —— 正是它警告的那种偏。
   * 所以贴哪一块就居中于哪一块。
   */
  it('跨行选区朝上贴首行、居中于首行;翻下去则贴末行、居中于末行', () => {
    const firstLine = box(300, 250, 60, 20); // 中心 330
    const lastLine = box(140, 270, 60, 20); // 中心 170
    const above = quoteBarPosition({ first: firstLine, last: lastLine, panel, barHeight: 34 });
    expect(above).toEqual({ left: 330, top: 243, placement: 'above' });

    // 同一段跨行选区贴到面板顶边:翻到下方,基准整个换成末行
    const flippedFirst = box(300, 110, 60, 20);
    const flippedLast = box(140, 130, 60, 20);
    const below = quoteBarPosition({
      first: flippedFirst,
      last: flippedLast,
      panel,
      barHeight: 34,
    });
    expect(below).toEqual({ left: 170, top: 156, placement: 'below' });
  });

  /*
   * 选区**整块都在画面里**时,不管它多高都照稿子走:翻下去让开整段、贴末行。
   *
   * 这里原来有一条「比半屏还高就贴起点」的兜底(`isLongSelection`),现在删了。
   * 它想解决的是「贴末行会把浮条丢到几屏之外」,但它用比例去**猜**选区大不大,
   * 而真正该问的是「末行还看不看得见」—— 看得见就没有丢出去这回事。
   * 而且那条兜底是在一个被污染的现场定的:选区曾把日志底部一块满宽的空占位盒子
   * 吞进去,「选区高度」于是变成「一直到日志底部」,必然过半屏、必然触发兜底。
   * 源头已经堵了(`QuoteBar` 只认被高亮的文字画出来的行),现在这一档回到稿子。
   * 末行看不见的那些档在 `quote-bar-in-view.test.ts`。
   */
  it('选区整块在画面里时,不论多高都翻下去贴末行(稿子 23-2)', () => {
    // 短:选区 40px —— 末行下沿 150 + 6
    const shortFirst = box(140, 110, 60, 20);
    const shortLast = box(140, 130, 60, 20);
    expect(quoteBarPosition({ first: shortFirst, last: shortLast, panel, barHeight: 34 }))
      .toEqual({ left: 170, top: 156, placement: 'below' });

    // 高:选区 260px,超过半屏,但首末两行都还在 100..500 里 —— 一样贴末行 370 + 6
    const tallFirst = box(140, 110, 60, 20);
    const tallLast = box(300, 350, 60, 20);
    expect(tallLast.bottom - tallFirst.top).toBeGreaterThan((panel.bottom - panel.top) / 2);
    expect(quoteBarPosition({ first: tallFirst, last: tallLast, panel, barHeight: 34 }))
      .toEqual({ left: 330, top: 376, placement: 'below' });
  });

  it('靠左右边选择时把完整浮条夹在聊天栏内', () => {
    const leftEdge = box(100, 300, 20, 20);
    const rightEdge = box(380, 300, 20, 20);
    const left = quoteBarPosition({ first: leftEdge, last: leftEdge, panel, barWidth: 120 });
    const right = quoteBarPosition({ first: rightEdge, last: rightEdge, panel, barWidth: 120 });
    expect(left.left).toBe(168);
    expect(right.left).toBe(332);
  });

  it('底部选区的浮条坐标不会落进 composer 一侧', () => {
    const line = box(180, 450, 80, 30);
    const position = quoteBarPosition({ first: line, last: line, panel, barHeight: 34 });
    expect(position.placement).toBe('above');
    expect(position.top).toBe(443);
    expect(position.top - 34).toBeGreaterThanOrEqual(108);
    expect(position.top).toBeLessThanOrEqual(492);
  });

  /*
   * 选区**骑在**聊天视口顶边上:一半在画面外、一半还看得见。
   * 贴的是**看得见**的那条边(被裁到 panel.top = 100),不是画面外的 90。
   */
  it('选区被聊天视口顶边裁切时,下方浮条贴被裁过的那条边并夹在安全区内', () => {
    const straddling = box(180, 90, 80, 20); // 90..110,骑在 panel.top=100 上
    const position = quoteBarPosition({
      first: straddling,
      last: straddling,
      panel,
      barHeight: 34,
      edgeInset: 8,
    });

    // 上方只剩 0px,翻到下方;贴的是选区看得见那一段的下沿 110 + 稿子的 6px
    expect(position).toEqual({ left: 220, top: 116, placement: 'below' });
    expect(position.top).toBeGreaterThanOrEqual(108);
    expect(position.top + 34).toBeLessThanOrEqual(492);
  });
});

describe('选中的文字', () => {
  it('跨行选择折成单行', () => {
    expect(normalizeQuoteText('商品卡已经\n  抽成共享组件 ')).toBe('商品卡已经 抽成共享组件');
  });

  it('空白和一两个字符不值得占一枚芯片', () => {
    expect(isQuotable('   ')).toBe(false);
    expect(isQuotable('好')).toBe(false);
    expect(isQuotable('好的')).toBe(true);
  });
});

describe('入列', () => {
  const q = (id: string, text: string) => ({ id, text, messageId: 'm1' });

  it('同一段话选两次只进一条 —— 判据是规整后的正文,不是 Range 对象', () => {
    const once = appendQuote([], q('a', '商品卡已经抽成共享组件'));
    const twice = appendQuote(once, q('b', '  商品卡已经抽成共享组件 '));
    expect(twice).toHaveLength(1);
    expect(twice[0]?.id).toBe('a');
  });

  it('不同的段落各占一条(稿子 23-5:只是数字变)', () => {
    let list = appendQuote([], q('a', '第一段'));
    list = appendQuote(list, q('b', '第二段'));
    list = appendQuote(list, q('c', '第三段'));
    expect(list).toHaveLength(3);
  });

  /*
   * 去重这件事**必须说出口**(OPEND-2546)。
   *
   * 原来重复添加的那一下:列表原样返回、选区被清掉、浮条消失 —— 从用户那头看,
   * 和「点了没反应」完全一样,于是他会再点一次、再点一次。判据在这一层已经有了,
   * 缺的是把结果**带出去**:调用方拿不到 added / duplicate,就没法给轻提示。
   * 所以这里问的不是「列表对不对」,而是「这一下到底算不算数」。
   */
  it('重复的那一下要报 duplicate,并且原样退回旧列表(引用不能悄悄换成新的)', () => {
    const first = appendQuoteOutcome([], q('a', '商品卡已经抽成共享组件'));
    expect(first.status).toBe('added');

    const again = appendQuoteOutcome(first.quotes, q('b', '  商品卡已经抽成共享组件 '));
    expect(again.status).toBe('duplicate');
    expect(again.quotes).toHaveLength(1);
    // 同一段话第二次选中,留下的必须还是**第一条**:芯片的 id 是回跳定位的抓手,
    // 悄悄换成新的等于把已经建立的引用挪了位置。
    expect(again.quotes[0]?.id).toBe('a');
    // 引用只有一份,列表也就不该换身份 —— 换了会让 React 白跑一次重渲染。
    expect(again.quotes).toBe(first.quotes);
  });

  it('新的那一下报 added', () => {
    const first = appendQuoteOutcome([], q('a', '第一段'));
    const second = appendQuoteOutcome(first.quotes, q('b', '第二段'));
    expect(second.status).toBe('added');
    expect(second.quotes).toHaveLength(2);
  });

  it('`appendQuote` 和它是同一套判据 —— 两处各算各的早晚会分叉', () => {
    const seeded = appendQuote([], q('a', '第一段'));
    expect(appendQuoteOutcome(seeded, q('b', '第一段')).quotes).toEqual(
      appendQuote(seeded, q('b', '第一段')),
    );
    expect(appendQuoteOutcome(seeded, q('b', '第二段')).quotes).toEqual(
      appendQuote(seeded, q('b', '第二段')),
    );
  });
});

/**
 * 引用在**发送时**被折进正文(`> 原文` 的 markdown 引用块),在**取回编辑时**
 * 要原样拆出来。这一对必须由同一个函数定义前缀,否则两边各写各的、
 * 早晚对不上 —— 那时候拆出来的正文会被啃掉一截,还没人看得出为什么。
 */
describe('引用折进正文 / 从正文拆回来', () => {
  const q = (id: string, text: string) => ({ id, text, messageId: 'm1' });

  it('没有引用就没有前缀,正文一个字都不动', () => {
    expect(quotePromptPrefix([])).toBe('');
    expect(splitQuotedPrompt('把首屏文案改短一点', [])).toBe('把首屏文案改短一点');
  });

  it('折进去再拆回来,拿到的还是原来那段正文', () => {
    const quotes = [q('a', '商品卡已经抽成共享组件'), q('b', '第二段')];
    const folded = `${quotePromptPrefix(quotes)}把首屏文案改短一点`;
    // 折出来的确实是 markdown 引用块 —— agent 靠它区分「我上轮说的」和「新指令」。
    expect(folded).toBe('> 商品卡已经抽成共享组件\n> 第二段\n\n把首屏文案改短一点');
    expect(splitQuotedPrompt(folded, quotes)).toBe('把首屏文案改短一点');
  });

  it('前缀对不上就一个字都不拆 —— 宁可多留一段引文,也不能啃掉用户的正文', () => {
    const quotes = [q('a', '商品卡已经抽成共享组件')];
    // 用户把队列里那条话改过了,开头已经不是我们折进去的那一段。
    const edited = '> 我自己敲的引用\n\n把首屏文案改短一点';
    expect(splitQuotedPrompt(edited, quotes)).toBe(edited);
  });

  it('正文本身就以 `> ` 开头也不会被误伤', () => {
    const plain = '> 这一行是用户自己敲的';
    expect(splitQuotedPrompt(plain, [])).toBe(plain);
  });

  it('只选了引用、一个字没敲:发送那头的收尾 trim 会吃掉末尾空行,照样拆得干净', () => {
    const quotes = [q('a', '商品卡已经抽成共享组件')];
    // `submit()` 的写法是 `${prefix}${draft.trim()}`.trim() —— 正文为空时
    // 末尾那个 `\n\n` 被 trim 掉了,于是整条正文正好等于前缀去掉尾部空白。
    const folded = `${quotePromptPrefix(quotes)}`.trim();
    expect(folded).toBe('> 商品卡已经抽成共享组件');
    // 拆出来必须是空字符串 —— 拆不掉的话这段引文会在输入框里和芯片重复一遍。
    expect(splitQuotedPrompt(folded, quotes)).toBe('');
  });
});
