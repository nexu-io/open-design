/**
 * Plan 卡的收起态(设计稿第 71 格)—— 钉在输入框上方的一枚「第 N / M 步」药丸。
 *
 * 稿子的原话:展开那张卡把四步全摊开、占掉两百来 px,可它多数时候只回答一个问题
 * ——「现在到第几步了」。收起之后这句话就是药丸上的六个字,清单退到悬停时再看:
 * 要摊开的时刻是你自己想核对的时刻,不是每一轮都得占屏。
 *
 * 两层球是**两个层级**,不能混:
 *   药丸里那颗是 `solving`(轮次级的「这一轮在跑」),原生 20 那一档,不缩放;
 *   浮层里每一步的「正在跑」是 `StatusMark` 的 `running`(步骤级的绿球)。
 * 稿子注释一句话:轮次级别的用 orb,步骤级别的用绿球。
 *
 * 浮层里的清单**复用 `StatusMark` 那套四态圆**,不另画一套 —— 做完打勾并划掉、
 * 当前一颗绿球、没开始留一圈虚线,和执行记录里那一列是同一个记号系统,
 * 人不用重新学一遍。
 *
 * 展开态那张独立卡(第 70 格)**拍板不做**(D33 / S9),这里不要顺手补。
 */
import { useLayoutEffect, useRef, type ReactElement } from 'react';
import { useT } from '../../i18n';
import { planPillState, type PlanPillTodo } from '../../runtime/chat/plan-pill';
import { Orb } from './primitives/Orb';
import { StatusMark } from './primitives/StatusMark';
import record from './primitives/record.module.css';
import styles from './PlanPill.module.css';

export interface PlanPillProps {
  /** 整个会话里**最新的那一份**清单 —— 药丸不属于某一条消息 */
  todos: readonly PlanPillTodo[] | undefined;
  /** run 还在跑吗;跑完了这枚药丸就该走 */
  running: boolean;
}

// Must stay aligned with PlanPill.module.css: the popover sits 8px above the
// pill and contributes 6px padding on both block edges. The list receives the
// remaining distance to the chat viewport's top edge.
const POPOVER_GAP_PX = 8;
const POPOVER_BLOCK_PADDING_PX = 12;

function useAvailableStepsHeight(visible: boolean) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLOListElement>(null);

  useLayoutEffect(() => {
    if (!visible) return undefined;
    const wrap = wrapRef.current;
    const steps = stepsRef.current;
    const viewport = wrap?.closest<HTMLElement>('.chat-log-viewport');
    if (!wrap || !steps || !viewport) return undefined;

    let frame: number | null = null;
    const measure = () => {
      frame = null;
      const available = Math.max(
        0,
        Math.floor(
          wrap.getBoundingClientRect().top
          - viewport.getBoundingClientRect().top
          - POPOVER_GAP_PX
          - POPOVER_BLOCK_PADDING_PX,
        ),
      );
      steps.style.maxHeight = `${available}px`;
    };
    const scheduleMeasure = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasure);
    observer?.observe(viewport);
    observer?.observe(wrap);
    window.addEventListener('resize', scheduleMeasure);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [visible]);

  return { wrapRef, stepsRef };
}

export function PlanPill({ todos, running }: PlanPillProps): ReactElement | null {
  const t = useT();
  const state = planPillState(todos, running);
  const { wrapRef, stepsRef } = useAvailableStepsHeight(state !== null);
  // 出没判据全在纯函数里,这里只认 null(chat/AGENTS.md §3:数据缺席时不占位)
  if (!state) return null;

  return (
    <div
      /* 水平中线、bottom 与 popover 的定位包含块统一由 ChatPane 的
         `chat-bottom-float-slot` 管。这里仍只裹住真药丸,所以透明区域不会
         触发悬停,也不会挡住下面的消息。 */
      className={styles.wrap}
      data-testid="chat-plan-pill"
      ref={wrapRef}
    >
      <div className={styles.pop}>
        <ol
          className={styles.steps}
          data-testid="chat-plan-pill-steps"
          ref={stepsRef}
          tabIndex={0}
          aria-label={t('chat.record.planStep', { current: state.current, total: state.total })}
        >
          {state.steps.map((step, index) => (
            <li
              key={`${step.content}-${index}`}
              className={step.current ? styles.now : step.struck ? styles.done : undefined}
            >
              <StatusMark status={step.mark} />
              <span className={styles.tx}>
                {/* 划线走执行记录那枚 `.struck`,不在本 Module 里另画一条 ——
                    线只跟着文字走,所以挂在内层而不是整栏上 */}
                <span className={step.struck ? record.struck : undefined}>{step.content}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      {/* 稿子就是一颗 `<button type="button">` + `cursor: default`:它不是可点的动作,
          但保留按钮语义让键盘走得到 —— 走到时 `:focus-within` 把浮层浮出来 */}
      <button className={styles.pill} type="button">
        <Orb state="solving" label={t('chat.record.running')} className={record.orb} />
        {t('chat.record.planStep', { current: state.current, total: state.total })}
      </button>
    </div>
  );
}
