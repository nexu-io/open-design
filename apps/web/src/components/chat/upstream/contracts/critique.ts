export const CRITIQUE_INLINE_TAGS = ['PANELIST', 'MUST_FIX', 'RESOLVED', 'SHIP'] as const;
/** 整条都是协议的标记 */
export const CRITIQUE_BLOCK_TAGS = ['CRITIQUE_RUN', 'ROUND', 'ROUND_END'] as const;
export const CRITIQUE_GRAMMAR_TAGS: readonly string[] = [
  ...CRITIQUE_INLINE_TAGS,
  ...CRITIQUE_BLOCK_TAGS,
];

/**
 * 一条完整标记:`<TAG …>` / `</TAG>` / `<TAG …/>`。
 * 标签名后面必须紧跟空白、`>` 或 `/`,否则 `<PANELISTS>` 这种会被误吃。
 *
 * 每次现造一个,不共享 —— 带 `g` 的正则有 `lastIndex` 状态,共享实例会让
 * 相邻两次调用互相干扰(第二次从上一次停下的位置开始找)。
 */
export function critiqueGrammarTagPattern(): RegExp {
  return new RegExp(`</?(?:${CRITIQUE_GRAMMAR_TAGS.join('|')})(?=[\\s/>])[^>]*>`, 'g');
}

/**
 * 把一整段**已经完整**的文本里的剧场语法剥掉(给历史消息用)。
 *
 * 只摘标记、不吞标记之间的字:`<PANELIST role="Designer">已完成…</PANELIST>`
 * 剩下「已完成…」。宁可多留一句人话,也不要把用户的正文吃掉。
 *
 * **不避开代码块**,和 daemon 那道流式剥离保持同一口径:那边按 SSE 分片处理,
 * 根本不知道自己在不在围栏里。两边口径必须一致,否则同一段文字在
 * 「刚生成」和「刷新后」会长得不一样。真要在正文里展示这套标记,用转义。
 *
 * 连续标记之间只剩空行时会塌成一个换行 —— 否则剥完会留下一大片空白,
 * 读着像回答中间断了一截。
 */
export function stripCritiqueGrammar(text: string): string {
  if (!text || !text.includes('<')) return text;
  const withoutTags = text.replace(critiqueGrammarTagPattern(), '');
  if (withoutTags === text) return text;
  return withoutTags.replace(/\n{3,}/g, '\n\n');
}
