/**
 * 壳【内】的文字:thinking 落下的段落、`done` 之前的过程叙述(D43)、作废理由(D15)。
 *
 * **这里也走 markdown。** 用户裁决 2026-09-03(截图里壳内一段叙述带着裸的 `**`
 * 和反引号):「谁说按纯文本画不是 bug 的?? 都要 markdown 啊」。在此之前这一格
 * 把原文塞进一个 React 文本节点,`**加粗**` / `` `代码` `` / `## 小标题` 的语法符号
 * 原样显示在屏幕上;「壳外才走 markdown」那条分法已经作废,别再照它改回去。
 *
 * 没有「流式光标」这个 prop:8/20 21:02 版设计稿把 `.caret` 整个删了,
 * 流式期间没有任何视觉标记,逐字化开由消息层的 reveal 负责(W9)。
 */
import { useMemo, useRef, type ReactElement } from 'react';
import { renderMarkdown } from '../../../runtime/markdown';
import { useCharReveal } from '../useCharReveal';
import styles from './record.module.css';

export interface SayTextProps {
  text: string;
  /**
   * 这一段是**这一刻还在往里写的那一段**吗。为真时新到的字逐字化开(W9)。
   *
   * 挂在**整块的那只容器**上,不是某一个段落。走 markdown 之后这一点是硬要求:
   * `useCharReveal` 按元素记状态,而块树的元素会**换身份** —— `#` 再来一个字就从
   * `<p>` 变成 `<h2>`,列表长一条就多一只 `<li>`。挂在「最后那只块元素」上的话,
   * 每换一次身份状态就丢一次,已经看过的字被当成新字重放,屏幕上就是一次闪。
   * 挂在容器上则整块共用一份 `shown`,块树怎么变形都接得上
   * (`useCharReveal` 本来就按整棵子树的文本节点顺序取末尾 N 个字,跨节点也照取)。
   *
   * 思考流那边**不传这个** —— 那一格已经在整只 body 上挂了一次(`ThoughtsRow`),
   * 两处都挂就成了同一段字被拆两遍。
   */
  live?: boolean;
}

/**
 * 空行分段由 markdown 自己做(`parseBlocks` 就是按空行切块的),不再手工 `split`。
 * 段落之间的 0.75em 也交给样式表(`record.module.css` 的 `.think > * + *`),
 * 和思考流那一格用的是同一份口径。
 *
 * ## 流到一半的语法:照旧交给 markdown,不切换渲染方式
 *
 * 流的过程中一定会看到 `**bo` → `**bold` → `**bold**` 这种半截语法,闭合那一刻
 * 可见文字会**变短**一次。这是取舍,不是缺陷:
 *
 *  · 思考流(`ThinkingMarkdown`)从来就是这么渲染的,壳内两条 lane 换成两套
 *    渲染时机反而是新的不一致;
 *  · 「流的时候画纯文本、落定再换 markdown」听着更稳,实际更糟 —— 那一刻整块
 *    从裸文本换成块树,**所有**字的节点都被换掉一遍,是一次全段的闪,
 *    比几个星号短暂露面严重得多;
 *  · 化开那一侧**早就为这件事设计过**:`useCharReveal` 只认长度的增量,可见文字
 *    变短时把「已显示」压到新长度(它注释里的坑 ③ 说的就是 markdown 闭合)。
 *    所以闭合帧化开的是 0 个字,不重放。
 *
 * 代码块的语法高亮流的时候不开(`syntaxHighlight: !live`),和 `ThinkingMarkdown`
 * 同一条:围栏还在长,没必要为每一帧启一次 Shiki。
 */
export function SayText({ text, live }: SayTextProps): ReactElement | null {
  // hook 必须无条件调用 —— 空文本的提前返回放在它们后面
  const hostRef = useRef<HTMLDivElement>(null);
  useCharReveal(hostRef, Boolean(live));
  const body = useMemo(
    () => renderMarkdown(text.trim(), { syntaxHighlight: !live }),
    [live, text],
  );

  if (!text.trim()) return null;
  return <div ref={hostRef} className={styles.think}>{body}</div>;
}
