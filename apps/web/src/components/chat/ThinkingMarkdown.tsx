import {
  Fragment,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderMarkdown } from '../../runtime/markdown';
import { splitShellCards } from '../../runtime/chat/split-shell-cards';
import { OdCardView } from '../OdCard';
import { useCharReveal } from './useCharReveal';
import styles from './ThinkingMarkdown.module.css';

/**
 * A live model can produce dozens of thinking deltas per second. Parsing the
 * entire accumulated Markdown for every delta makes a long stream quadratic
 * and replaces a large React subtree more often than a display can paint.
 * Ten commits per second is still visibly live while placing a hard ceiling on
 * full-document Markdown parses and DOM commits.
 */
export const THINKING_MARKDOWN_COMMIT_MS = 100;

export interface ThinkingMarkdownProps {
  texts: readonly string[];
  live: boolean;
}

export function ThinkingMarkdown({ texts, live }: ThinkingMarkdownProps): ReactElement | null {
  const source = texts.join('\n\n').trim();
  const snapshot = useCoalescedSnapshot(source, live);
  if (!snapshot) return null;
  return <RenderedThinkingMarkdown text={snapshot} live={live} />;
}

/**
 * Keep the scheduler separate from the parsed subtree. The outer component is
 * intentionally cheap and may receive every delta; this memoized child only
 * renders when the coalesced string changes, so neither Markdown parsing nor
 * `useCharReveal` walks the DOM for discarded intermediate deltas.
 */
const RenderedThinkingMarkdown = memo(function RenderedThinkingMarkdown({
  text,
  live,
}: {
  text: string;
  live: boolean;
}): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  useCharReveal(rootRef, live);
  const content = useMemo(() => decodedProse(text, live), [live, text]);

  return (
    <div ref={rootRef} className={styles.think} data-testid="thinking-markdown">
      {content}
    </div>
  );
});

/**
 * 推理正文 —— 先过**那一支** od-card 解析器,再当 Markdown 画。
 *
 * ## 不变量
 *
 * **一段模型文本里哪几个字节是协议卡、哪几个是用户该读的正文,全仓只有
 * `splitShellCards` 一处答案。** 壳内叙述(`SayBlock`)、壳外正文
 * (`AssistantMessage`)、推理流(这里)三条通道共用它;谁绕过去自己写一套
 * 字符串处理,谁就把 `<od-card …>{…}</od-card>` 的标签原文摊给用户看
 * (OPEND-2607 / OPEND-2745)。
 *
 * 推理流原来就是那个绕过去的第三条:它直接 `renderMarkdown(text)`。而系统提示词
 * 只说「applied memory 时可以发一枚 compact chip」,**没有**规定这枚 chip 不许
 * 落在推理里(`apps/daemon/src/prompts/system.ts`)—— 所以推理流必须和正文一样
 * 具备解码能力,而不是假定卡片只走正文。
 *
 * ## 两条边界
 *
 * · **没有卡时整篇一次解析**。跨卡片的 Markdown 结构(列表、围栏)不能被无谓切开,
 *   而绝大多数推理里一张卡都没有 —— 那一档必须和改动前逐字一致。
 * · **流式由同一支解析器判**(`live`):半截标签留给下一帧、不闪原文;还没闭合的卡
 *   不吞掉它**前面**已经写完的推理正文。这里不许再加第二套流式判断。
 *
 * 围栏代码块里引用的卡是**用户正文**(文档在讲协议本身),`splitShellCards` 已经
 * 按 Markdown 上下文放行,这里不要再动。
 *
 * ## 卡片要挂 `data-no-reveal`
 *
 * **卡片不是正在被敲出来的字,它不参与逐字化开。**
 *
 * 这只组件的化开根是外层那一只 `<div ref={rootRef}>`,`useCharReveal` 从它往下
 * 遍历**整棵子树**。卡片渲染进这棵子树之后,流式期间卡片一闭合,可见文本长度会
 * 跳一大截,化开逻辑就会把**卡片内部**的文本节点当成「刚到的字」去截短、往后
 * 追加 span —— 而那些节点是 React 建的、React 还要接着更新,正是 `useCharReveal`
 * 文件头列的那几个坑的形状。
 *
 * `[data-no-reveal]` 是那只 hook **自己声明的**子树豁免(`SKIP`),留给「在化开根
 * 里、但不是正在被敲出来的正文」这一类内容;这里是它的第一个使用者。`collect()`
 * 和 `measure()` 走同一条过滤,所以卡片的字**连长度都不计** —— 卡片冒出来不会被
 * 误当成一大批新字,去抢前面散文的化开预算。
 *
 * **为什么 `SayBlock` 不需要这个属性**:那边的化开根在 `SayText` **内部**,每段
 * 散文一只,卡片是这些根的**兄弟**、从来不是后代。这里不能照搬那个结构 ——
 * `useCharReveal` 的预算、「挂载即落定」和 `claimHistoryReplayLanded` 这枚
 * **模块级单发令牌**都是按根算的:推理正文拆成 N 只根,就会有 N 份互不相干的
 * 2s 预算,而重放令牌只会被先跑到的那一只认领掉,OPEND-2590 的「重放的历史不再
 * 化开」在推理这一格就破了。所以推理保持**一只根**,用子树豁免把卡片摘出去。
 */
function decodedProse(text: string, live: boolean): ReactNode {
  const segments = splitShellCards(text, live);
  if (!segments.some((seg) => seg.kind === 'card')) {
    return renderMarkdown(
      segments.map((seg) => (seg.kind === 'text' ? seg.text : '')).join(''),
      { syntaxHighlight: !live },
    );
  }
  return segments.map((seg, i) => {
    if (seg.kind === 'card') {
      return (
        <div key={`card-${i}`} data-no-reveal>
          <OdCardView card={seg.card} />
        </div>
      );
    }
    if (!seg.text.trim()) return null;
    return (
      <Fragment key={`text-${i}`}>
        {renderMarkdown(seg.text, { syntaxHighlight: !live })}
      </Fragment>
    );
  });
}

function useCoalescedSnapshot(source: string, live: boolean): string {
  const [snapshot, setSnapshot] = useState(source);
  const latestRef = useRef(source);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  latestRef.current = source;

  useEffect(() => {
    if (!live) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Keep state aligned with the immediately rendered final source. This
      // matters if the same component instance becomes live again (preview
      // replay / status correction): it must resume from the final text, not
      // from the last throttled snapshot that preceded completion.
      if (snapshot !== source) setSnapshot(source);
      return;
    }
    if (snapshot === source || timerRef.current !== null) return;

    // This is a fixed-window throttle, not a debounce: a continuous ds-v4-flash
    // stream still becomes visible every 100ms instead of being starved until
    // the model stops.
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setSnapshot(latestRef.current);
    }, THINKING_MARKDOWN_COMMIT_MS);
  }, [live, snapshot, source]);

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  // The completion frame must never wait behind the throttle. It also enables
  // syntax highlighting, which is deliberately skipped while the fence grows.
  return live ? snapshot : source;
}
