/**
 * 正文取词(设计稿组件 23)的**纯判据**。
 *
 * 放在这一层是为了能脱离 DOM 测:浮条翻不翻面、选中的字要不要收、
 * 多段选择怎么合并计数 —— 这些都是规则,不是画法。
 */

/** 一条被「添加到对话」的引用 */
export interface ChatQuote {
  id: string;
  /** 选中的原文(已折叠空白) */
  text: string;
  /** 出自哪条助手消息 —— 之后要回跳定位就靠它 */
  messageId: string;
}

/** 定位用得上的那四条边 —— `DOMRect` 的子集,好让判据脱离 DOM 测。 */
export interface QuoteRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** 稿子 `.selbar { bottom: calc(100% + 7px) }` —— 朝上时和选区之间的缝。 */
export const QUOTE_BAR_GAP_ABOVE_PX = 7;
/** 稿子 `.selbar.mod-below { top: calc(100% + 6px) }` —— 翻到下方时那道缝小 1px。 */
export const QUOTE_BAR_GAP_BELOW_PX = 6;
/** 浮条离面板左右/上下边的安全内缩。 */
export const QUOTE_BAR_EDGE_INSET_PX = 8;
/** 稿子的 3px 内距 + 28px 按钮;真实浮条量到宽高之前拿它顶一拍。 */
export const QUOTE_BAR_DEFAULT_WIDTH_PX = 112;
export const QUOTE_BAR_DEFAULT_HEIGHT_PX = 34;

/**
 * 浮条摆在选区上方还是下方。
 *
 * **默认朝上**(稿子 23-1),只有上方被面板顶边挤住时才翻到下方(稿子 23-2)——
 * 和 tooltip 那套边界补正同一个道理:浮层默认朝上,容器上面没地方了才翻。
 *
 * 朝下当默认是错的,而且错得不止一格:浮条会盖住用户接着要读的下一行,
 * 更要命的是它把定位基准换成了选区的**下沿** —— 一旦下沿因为末端零宽矩形
 * 跑远(见 `QuoteBar` 的 `visibleSelectionRects`),浮条就跟着掉到几百像素以下。
 *
 * 判据是**放不放得下**,不是「离边多少像素」这种拍脑袋的阈值:浮条自己的高度
 * 加上那道缝就是它需要的空间。两边都放不下时选空间大的一侧,再由
 * `quoteBarPosition` 夹回面板里。
 */
export function quoteBarPlacement(input: {
  /** 选区**首行**矩形的上边(视口坐标)—— 朝上时浮条贴的就是它 */
  selectionTop: number;
  /** 选区**末行**矩形的下边(视口坐标)—— 翻到下方时浮条贴的是它 */
  selectionBottom: number;
  /** 聊天日志可视区的上边(视口坐标) */
  panelTop: number;
  /** 聊天日志可视区的下边(即 composer 上沿) */
  panelBottom: number;
  /** 浮条高度,默认按稿子的 3px 内距 + 28px 按钮算 */
  barHeight?: number;
  gapAbove?: number;
  gapBelow?: number;
}): 'above' | 'below' {
  const bar = input.barHeight ?? QUOTE_BAR_DEFAULT_HEIGHT_PX;
  const gapAbove = input.gapAbove ?? QUOTE_BAR_GAP_ABOVE_PX;
  const gapBelow = input.gapBelow ?? QUOTE_BAR_GAP_BELOW_PX;
  const availableAbove = input.selectionTop - input.panelTop;
  if (availableAbove >= bar + gapAbove) return 'above';
  const availableBelow = input.panelBottom - input.selectionBottom;
  if (availableBelow >= bar + gapBelow) return 'below';
  return availableAbove >= availableBelow ? 'above' : 'below';
}

/**
 * 选区在可视区里**露出来的那一段**的两块锚点:朝上贴谁、朝下贴谁。
 *
 * 稿子没有这一格 —— 组件 23 的五个状态全是单行 `<mark>`,首行末行都在画面里,
 * 「贴选区」和「贴看得见的选区」是同一回事。跨屏选区才把两者分开:首行可能在
 * 上面几屏,末行可能在下面几屏,照着它们摆浮条就是摆到画面外(再被边缘夹取
 * 拽回边上,离用户真正看着的那一段几百像素)—— 用户 2026-09-02 说的「跑太远」。
 *
 * 判据是**交集**,不是比例:一块锚点和可视区有没有重叠,量得出来,不用猜。
 * (这里替换掉的旧兜底是「选区比半屏还高就算长选区」。那条是在一个被污染的现场
 * 定的:选区曾把日志底部一块满宽的空占位盒子吞进去,于是「选区高度」变成
 * 「从你选的地方一直到日志底部」,必然超过半屏 —— 过去有一部分「长选区」是假的。
 * 源头已经堵在 `QuoteBar.visibleSelectionRects`:只认被高亮的文字画出来的行。)
 *
 * 三档:
 * - **两块都露头**:各自按可视区裁一刀,贴的是它**看得见**的那条边。整块都在
 *   画面里时裁不掉任何东西,行为与稿子逐像素一致。
 * - **只有一块露头**:看不见的那块换成可视区的边界。首行沉在画面之上时,
 *   「朝上」就此失去空间、自然翻到下方去贴可见的末行;末行沉在折线之下时,
 *   「朝下」退回贴**可见的起点**(这正是旧兜底想做、却用比例去猜的那件事)。
 * - **两块都不露头**:选区要么比一屏还高(中间那段占满画面),要么整个被滚走了。
 *   两头都退化成可视区边界、水平居中于面板 —— 见 `quoteBarPosition` 的注释。
 */
export function visibleQuoteAnchors(input: {
  first: QuoteRect;
  last: QuoteRect;
  panel: QuoteRect;
}): { above: QuoteRect; below: QuoteRect } {
  const { first, last, panel } = input;
  const onScreen = (rect: QuoteRect): boolean =>
    rect.bottom > panel.top && rect.top < panel.bottom;
  // 露头的锚点按可视区裁一刀:贴的是它看得见的那条边,不是画面外的那条。
  const clipped = (rect: QuoteRect): QuoteRect => ({
    left: rect.left,
    right: rect.right,
    top: Math.max(rect.top, panel.top),
    bottom: Math.min(rect.bottom, panel.bottom),
  });
  const firstOnScreen = onScreen(first);
  const lastOnScreen = onScreen(last);

  const above = firstOnScreen
    ? clipped(first)
    : {
        // 首行看不见时它的水平位置也是画面外的数字 —— 借还看得见的那块,
        // 都看不见就退回面板中线(唯一有意义的水平参照)。
        left: lastOnScreen ? last.left : panel.left,
        right: lastOnScreen ? last.right : panel.right,
        top: panel.top,
        bottom: panel.top,
      };
  const below = lastOnScreen
    ? clipped(last)
    : firstOnScreen
      ? clipped(first)
      : { left: panel.left, right: panel.right, top: panel.bottom, bottom: panel.bottom };

  return { above, below };
}

/**
 * 浮条的落点。
 *
 * 传进来的是选区**首行**和**末行**两块矩形,不是它们的并集:朝上贴首行的上沿、
 * 翻下去贴末行的下沿,水平也只居中于**贴着的那一块**。稿子的 CSS 注释把这条
 * 写死了 ——「定位参照是【选区】不是整段:浮条要对准你选的那几个字,段落居中
 * 会在长句里偏出去老远」。跨行选择时并集的中心就是段落中心,正是它警告的那种偏。
 * 单行选区两块是同一块,退化回原来的行为。
 *
 * 贴的是**看得见的那一段**(`visibleQuoteAnchors`),不是可能在几屏之外的
 * 首行 / 末行 —— 用户 2026-09-02 的裁决:浮条**始终保持在画面里**,在此前提下
 * **尽可能贴近选区**,「跑太远肯定就是 bug」。两条冲突时第一条赢,末尾那段
 * 边缘夹取就是它的兜底:朝上时浮条占 `[top - barHeight, top]`,朝下占
 * `[top, top + barHeight]`,两档的上下界都按这个盒子算,所以夹完整块都在面板里。
 *
 * **两头都不露头**那一档稿子没有,W32 定:落在可视区**顶边**、水平居中于面板。
 * 整屏都是被选中的字时没有「选区的边」可贴,贴谁都是贴在选区中间;选顶边是因为
 * (a) 稿子的默认本来就朝上、贴选区起点方向,顶边与它同向;(b) 顶边离底下的输入框
 * 最远,不会压住用户接着要点 / 要打字的地方;(c) 首行末行的水平位置此时是画面外的
 * 数字,面板中线是唯一有意义的水平参照。落点由两侧空间都为 0 时的平手规则
 * (`quoteBarPlacement` 的 `availableAbove >= availableBelow`)带到「朝上」,
 * 再由边缘夹取贴到顶边;`tests/runtime/chat/quote-bar-in-view.test.ts` 钉住了它。
 *
 * 选区**整个**被滚出画面也落在这一档。那种情况的裁决在组件层 ——
 * `QuoteBar.selectionOnScreen`:选区自己不在可视区里露着了就收起浮条(滚回来会
 * 自己回来,用户 2026-09-04)。这一层只保证「就算没收,坐标也还在画面里」。
 */
export function quoteBarPosition(input: {
  /** 选区首行矩形 */
  first: QuoteRect;
  /** 选区末行矩形;单行选区与 `first` 相同 */
  last: QuoteRect;
  /** 聊天日志可视区 */
  panel: QuoteRect;
  barWidth?: number;
  barHeight?: number;
  gapAbove?: number;
  gapBelow?: number;
  edgeInset?: number;
}): { left: number; top: number; placement: 'above' | 'below' } {
  const barWidth = input.barWidth ?? QUOTE_BAR_DEFAULT_WIDTH_PX;
  const barHeight = input.barHeight ?? QUOTE_BAR_DEFAULT_HEIGHT_PX;
  const gapAbove = input.gapAbove ?? QUOTE_BAR_GAP_ABOVE_PX;
  const gapBelow = input.gapBelow ?? QUOTE_BAR_GAP_BELOW_PX;
  const edge = input.edgeInset ?? QUOTE_BAR_EDGE_INSET_PX;
  // 朝上贴谁、朝下贴谁 —— 都取选区在画面里露出来的那一段。
  const { above: aboveAnchor, below: belowAnchor } = visibleQuoteAnchors({
    first: input.first,
    last: input.last,
    panel: input.panel,
  });
  const placement = quoteBarPlacement({
    selectionTop: aboveAnchor.top,
    selectionBottom: belowAnchor.bottom,
    panelTop: input.panel.top,
    panelBottom: input.panel.bottom,
    barHeight,
    gapAbove,
    gapBelow,
  });

  // 贴哪一块,就居中于哪一块 —— 位置和参照必须是同一个矩形。
  const anchor = placement === 'above' ? aboveAnchor : belowAnchor;
  const center = (anchor.left + anchor.right) / 2;
  const minLeft = input.panel.left + edge + barWidth / 2;
  const maxLeft = input.panel.right - edge - barWidth / 2;
  const left = maxLeft < minLeft
    ? (input.panel.left + input.panel.right) / 2
    : Math.min(Math.max(center, minLeft), maxLeft);

  const desiredTop = placement === 'above'
    ? anchor.top - gapAbove
    : anchor.bottom + gapBelow;
  const minTop = placement === 'above'
    ? input.panel.top + edge + barHeight
    : input.panel.top + edge;
  const maxTop = placement === 'above'
    ? input.panel.bottom - edge
    : input.panel.bottom - edge - barHeight;
  const top = maxTop < minTop
    ? (minTop + maxTop) / 2
    : Math.min(Math.max(desiredTop, minTop), maxTop);

  return { left, top, placement };
}

/**
 * 选中的文字规整成一条引用的正文。
 *
 * 跨行选择会带进换行和缩进,原样塞进输入框既难读也难比对;
 * 折成单行、掐掉首尾空白就够 —— 全文在 hover 的浮层里能看到(稿子第 23-4 格)。
 */
export function normalizeQuoteText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** 值得添加吗:空白、或者只选中了一两个字符,都不值得占一枚芯片 */
export function isQuotable(raw: string): boolean {
  return normalizeQuoteText(raw).length >= 2;
}

/** 这一下到底算不算数 */
export type QuoteAppendStatus = 'added' | 'duplicate';

/** 入列的结果:新列表 + 这一下算不算数 */
export interface QuoteAppendOutcome {
  quotes: ChatQuote[];
  status: QuoteAppendStatus;
}

/**
 * 同一段话被选两次不重复入列 —— 判据是**规整之后的正文**,
 * 不是选区对象(同一句话第二次选,DOM Range 是新的,文字是同一句)。
 *
 * 去重这件事**必须说出口**(OPEND-2546):重复的那一下如果只是原样退回旧列表,
 * 调用方接着清掉选区、浮条消失 —— 从用户那头看和「点了没反应」一模一样,
 * 于是他会再点一次、再点一次。所以判据这一层就把 added / duplicate 交出去,
 * 由调用方给一句轻提示。
 *
 * 重复时**原样返回同一个数组引用**(不是内容相等的新数组):既是给 React
 * 省一次白跑的重渲染,也是给调用方一个免费的「什么都没变」信号。
 */
export function appendQuoteOutcome(quotes: ChatQuote[], next: ChatQuote): QuoteAppendOutcome {
  const key = normalizeQuoteText(next.text);
  if (quotes.some((q) => normalizeQuoteText(q.text) === key)) {
    return { quotes, status: 'duplicate' };
  }
  return { quotes: [...quotes, next], status: 'added' };
}

/**
 * `appendQuoteOutcome` 的只要列表那一半。
 *
 * 留着它是为了让「只关心结果列表」的调用点不用每次解构;判据只有
 * `appendQuoteOutcome` 一处,两边不会分叉。需要给用户反馈的调用点用带
 * status 的那个。
 */
export function appendQuote(quotes: ChatQuote[], next: ChatQuote): ChatQuote[] {
  return appendQuoteOutcome(quotes, next).quotes;
}

/**
 * 发送时折进正文的那段**引文前缀**(设计稿组件 23)。
 *
 * 折进去是为了让 agent 一眼分得清「这是我上一轮说的话」和「这是新指令」;
 * 但折完之后这一条在结构上就没有引用了 —— 排进发送队列的就是这段散文。
 * 所以取回编辑时得能原样拆开,而**拆的一方必须和折的一方用同一个前缀**。
 * 两边各写各的字符串,早晚会对不上,那时候拆出来的正文会被啃掉一截,
 * 现场只剩「用户的字莫名少了半句」这一个症状。
 */
export function quotePromptPrefix(quotes: ChatQuote[]): string {
  if (quotes.length === 0) return '';
  return `${quotes.map((q) => `> ${q.text}`).join('\n')}\n\n`;
}

/**
 * `quotePromptPrefix` 的逆运算,而且**只在完全对得上时才动手**。
 *
 * 对不上就原样返回。这不是保守,是唯一安全的选择:队列里的正文是可以被改的
 * (就地编辑那条路),用户自己也可能敲出以 `> ` 开头的行。拆错一次就是把
 * 用户写的话啃掉一截,比多留一段引文糟得多 —— 后者看得见,前者看不见。
 */
export function splitQuotedPrompt(prompt: string, quotes: ChatQuote[]): string {
  const prefix = quotePromptPrefix(quotes);
  if (!prefix) return prompt;
  if (prompt.startsWith(prefix)) return prompt.slice(prefix.length);
  // 只有引用、没有正文的那一发:`submit()` 收尾的 trim 会把末尾那个空行吃掉,
  // 于是整条正文正好等于前缀去掉尾部空白。这时候正文本来就是空的。
  if (prompt === prefix.trimEnd()) return '';
  return prompt;
}
