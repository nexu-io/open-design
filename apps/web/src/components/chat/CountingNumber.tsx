/**
 * 一条会**自己数上去**的读数 —— 目前只服务思考行右边那个 token 计数。
 *
 * ── 走到这一版之前(整段经过都记下来,别照着中途那版回改)────────────────
 *
 * 用户 2026-09-04 一天里给了三条,后一条推翻前一条的**做法**、但需求始终是同一件事:
 *   ① 「token 数量怎么没有什么数字滚动的效果啊? 这个太生硬了..」
 *   ② 「token 最好也有个**增长的过程**,而不是直接从 100 跳到 200,而是逐渐从 100
 *      数字滚动到 200,这个滚动过程可以快一点,但是能让用户感受到这里好像有一个
 *      **流式的感觉**」
 *   ③ 看到实物之后:「我看到实现的数字滚动**跳动**了,**太花哨了,自然一点**...」
 *      「**实在不行就不要动画了**,直接**数字自增**的那种动画就行,自增的**单位可以
 *      随机一些**?比如一次 1 一次 3 一次 5 啥的啥的」
 *
 * ②③ 合起来说的是一件事:他要的是**数在往上数**,不是**字形在动**。
 *
 * 中间那一版是「每一位一条 0–9 字带 + CSS transition」,被 ③ 否掉了,原因是**视觉行程**:
 * 199 → 200 时个位 9→0 要倒着滚 9 格、十位也倒着滚 9 格,而百位 1→2 正着滚 1 格 ——
 * 三位同时动、方向相反、距离差 9 倍,而变化最频繁的恰恰是最闹的低位。
 * 那一版连同它的 CSS Module(`.reel` / `.digit` / clip-path 那一整套)**已按产品授权删掉**,
 * 不留半条名不副实的守卫。
 *
 * ── 现在只剩一件事:自增 ────────────────────────────────────────────────
 *
 * 没有 CSS 动画、没有关键帧、没有 transform。屏幕上只是那个数一格一格往上跳,
 * 步长**自适应 + 带抖动**,不规则本身就是「有东西在流」的手感。
 *
 * ── 四条硬约束(每一条都有判据,别在改手感时弄丢)───────────────────────
 *
 *  1. **刷新页面不从 0 数上来。** 挂载那一帧显示的就是落定值(`useState(target)`),
 *     而且**不排任何 tick**。自增只发生在「已经在屏上的值 → 新值」之间。
 *  2. **永远落在真值上,不过冲。** 每一步都按剩余量夹住,最后一步无论差多少直接补齐。
 *     屏幕上任何时刻都不会出现比已收到读数**更大**的数 —— 那是我们编出来的假进度。
 *  3. **新读数一到就改朝新目标走**,从当前显示值接着数,不重置、不排队。
 *  4. **必须在下一条读数通常到达之前数完。** 数不完就永远追不上真值,屏幕上长期挂着
 *     一个落后的假数,比直接跳变更糟。所以预算是固定的,步长按「差值 ÷ 剩余步数」自适应:
 *     差 40 就走大步,差 3 就走小步 —— 不是固定的 1/3/5。
 *
 * 判据整套在 `tests/components/chat/thinking-token-count-up.test.tsx`。
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';

/**
 * 数完一段的**预算**。
 *
 * 上界由上游帧率定,不由观感定:claude 的 `thinking_tokens` 帧间隔实测 p50 = 1.4s、
 * 整轮最大 4.88s(真实录制,`specs/current/chat-panel-next.md`);codex 那侧一轮
 * 19 条 usage,中位间隔约 14s。400ms ≈ claude p50 的 29%,典型情况下这一段早就数完了
 * 下一帧才到;真撞上最密的一段也只是**从当前值改道**,不会跳、不会排队。
 * 下界是「看得出在数」—— 低于 200ms 和直接换数没有区别。
 *
 * 不写成 `--chat-dur-*`:接缝里那三档(100 / 150 / 200ms)描述的是 UI 元素的出入场,
 * 这一条描述的是**数据追赶数据**,两者不该共用一个旋钮。
 */
const COUNT_UP_MS = 400;

/**
 * 每隔多久跳一格。约 7 格走完预算 —— 少于 4 格看着还是「跳」,多于十几格
 * 每格的增量小到看不出变化,反而像卡住。
 */
const COUNT_UP_TICK_MS = 55;

/** 步长抖动区间:基准步长的 60% ~ 140%。不规则感来自这里,不来自 CSS */
const JITTER_MIN = 0.6;
const JITTER_SPAN = 0.8;

/**
 * 这一跳走多远。
 *
 * `base` 是**自适应**的那一半:把还差的量摊到还剩的步数上,所以差 40 走大步、
 * 差 3 走小步。`jitter` 是不规则的那一半。两头都夹住:至少 1(否则原地不动),
 * 至多 `remaining`(**永不过冲**,这是产品那条硬约束)。
 * 只剩最后一步时直接补齐,不再抖 —— 落点必须精确等于真值。
 */
export function countUpStep(remaining: number, stepsLeft: number, jitter: number): number {
  if (remaining <= 0) return 0;
  if (stepsLeft <= 1) return remaining;
  const base = remaining / stepsLeft;
  const stepped = Math.round(base * (JITTER_MIN + jitter * JITTER_SPAN));
  return Math.min(Math.max(stepped, 1), remaining);
}

/**
 * 系统设了「减少动效」就不数,直接给落定值。
 *
 * 每次读都现问一次而不是缓存:这个偏好在系统设置里随时可改,而这一格活得很短,
 * 缓存下来只会让当前这一轮拿着过期的答案。jsdom 没有 `matchMedia`,可选链让它
 * 落到「没设过」那一档,和真实浏览器里默认值一致。
 */
function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * 显示值一格一格数到目标值。
 *
 * 目标**变小**时直接落定,不倒着数:计数是每个推理块从头累计的,变小只发生在
 * 「换了一块、CLI 自己归零」那一刻(见 `ExecutionShell` 的 `thinkingTokens` 注释)——
 * 那不是同一件事在退,是换了一件事,倒数会把它讲成「想少了」。
 */
function useCountingUp(target: number): number {
  const [shown, setShown] = useState(target);
  /** 只读当前值,不进 effect 依赖 —— 进了的话每跳一格就重排一次调度,步数账全乱 */
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    if (shownRef.current === target) return undefined;
    if (shownRef.current > target || prefersReducedMotion()) {
      setShown(target);
      return undefined;
    }
    let stepsLeft = Math.max(1, Math.round(COUNT_UP_MS / COUNT_UP_TICK_MS));
    const timer = setInterval(() => {
      const remaining = target - shownRef.current;
      const step = countUpStep(remaining, stepsLeft, Math.random());
      stepsLeft -= 1;
      const next = shownRef.current + step;
      shownRef.current = next;
      setShown(next);
      if (next >= target) clearInterval(timer);
    }, COUNT_UP_TICK_MS);
    return () => clearInterval(timer);
  }, [target]);

  return shown;
}

export interface CountingNumberProps {
  /** 真值(此刻的 token 数)。屏幕上的数会**数**到它,不是一帧换过去 */
  value: number;
  /**
   * 把一个显示值排成整条读数,含 i18n 后缀(如「3.3k tokens」/「3.3k トークン」)。
   * 排版留在调用方,这一层就不必知道语种,也不必知道 `formatThinkingTokens` 的规矩。
   */
  render: (shown: number) => string;
}

/**
 * 只吐字,不套壳:返回的是纯文本,不是一个新的 `<span>`。
 * 槽本身(`.meta`)已经是等宽字族,数字逐位同宽 —— 多包一层反而可能改动排版。
 */
export function CountingNumber({ value, render }: CountingNumberProps): ReactElement {
  const shown = useCountingUp(value);
  return <>{render(shown)}</>;
}
