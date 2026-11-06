/**
 * 终端输出块 —— 组件 11 折叠块正文里 `div.code` 的第二块(第一块是命令那一行)。
 *
 * 从 `ToolRow.tsx` 里搬出来单独成文件,理由是**它现在有自己的成本模型**:
 * 装依赖能吐几百行,一行一个 `<div>`;而 `ToolRow` 所在的这棵树在轮次跑着的时候
 * 每秒被秒表重渲一次(`AssistantMessage` 的 `useTickingNow`,`setInterval(…, 1000)`)。
 * 一个跟输出内容无关的秒数跳动,不该把几百个节点重算一遍 —— 记忆化边界因此落在
 * **调用方**(`ToolRow` 用 `memo` 包住这个导出),挡的正是那一层的重渲。
 *
 * ## 限高滚动 + 自动贴底(稿子 `body-components.html:1010`)
 *
 * 状态标注逐字是「执行中 · 终端实时追加,**限高滚动自动贴底**」。
 *   · 限高归 CSS:`record.module.css` 的 `.term { max-height: 104px; overflow-y: auto }`
 *     (和稿子 `components.css:2446` 同一个值),这里不重复一遍。
 *   · 贴底归 `useThinkingFollow` —— **复用**,不另写一套。
 *
 * ⚠️ 原来这里是 `useEffect(() => { el.scrollTop = el.scrollHeight }, [text])`:
 * **每来一批输出就无条件跳到底**。ACP 在途输出 250ms 一批,用户往上翻一行、
 * 半秒不到就被硬拽回底部 —— 产品原话「不能跟用户抢滚动条」。折叠块改成执行中
 * 默认展开之后,这个坑从「没人看得见」变成「天天撞上」,所以一起换成
 * 和思考正文同一套意图状态机(`runtime/chat/stick-to-bottom.ts`):
 * 意图只由用户动作改;往上滚 := 位置变小**且几何没变**;恢复跟随必须是
 * 同一次主动下滚并真的到底。判据钉在 `tests/components/chat/terminal-follow.test.tsx`。
 *
 * ## 绿 / 红只按行首那个符号判(`✓` / `✗`)
 *
 * 设计稿给的是成品截图,没有给判定规则:我们的事件流里没有任何「这一行是成功还是
 * 失败」的结构化信息,输出就是一整块文本。认符号是能站得住的最小规则,认不出来
 * 就按普通行画(和设计稿的中性色一致),不去猜「哪一行像报错」。这条规则待设计确认。
 */
import { useMemo, useRef, type ReactElement } from 'react';
import { useThinkingFollow } from './useThinkingFollow';
import styles from './record.module.css';

export interface TerminalOutputProps {
  text: string;
}

interface TerminalLine {
  text: string;
  tone: string | undefined;
}

export function TerminalOutput({ text }: TerminalOutputProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  /*
   * 贴底跟随。`active` 恒为真:已经跑完的那一块展开时同样要落在最后几行
   * ——「一段构建日志里要读的永远是最后几行」。跑完之后 `text` 不再变,
   * 也就不存在和用户抢滚动条的问题。
   */
  useThinkingFollow(ref, true);
  /*
   * 切行只在 `text` 真的变了的时候做一次。上面那层 `memo` 已经挡掉了
   * 「内容没变的重渲」,这里再挡一次「同一份内容被重渲」的情况(受控 prop 变化、
   * context 更新),两层都不贵。
   */
  const lines = useMemo(() => splitTerminal(text), [text]);
  return (
    <div className={styles.term} ref={ref}>
      {lines.map((line, i) => (
        <div key={i} className={line.tone}>{line.text}</div>
      ))}
    </div>
  );
}

function splitTerminal(text: string): TerminalLine[] {
  return text.replace(/\s+$/, '').split('\n').map((line) => ({ text: line, tone: lineTone(line) }));
}

function lineTone(line: string): string | undefined {
  const head = line.trimStart().charAt(0);
  if (head === '\u2713' || head === '\u2714') return styles.ok;      // ✓ ✔
  if (head === '\u2717' || head === '\u2718' || head === '\u2716') return styles.er;  // ✗ ✘ ✖
  return undefined;
}
