/**
 * 组件 22 · 重连(84 格状态矩阵第 82–84 格)· S29「网络连接中断 / 正在重连」的**状态**。
 *
 * 产品裁决(2026-08-26,`specs/current/run-error-catalog.md` §6):
 * S29 用设计稿中现有的设计,位置在**会话中最后一行**。
 *
 * 这一层只回答一个问题:**流水尾部此刻该不该有那一行、上面写几分之几。**
 * 它是纯函数,不碰 DOM、不认识 React —— 长相在 `components/chat/Reconnect.tsx`,
 * 挂载点在 `ChatPane`,信号来自 `providers/daemon.ts` 的 `onReconnect`。
 *
 * 为什么值得单独一个 reducer,而不是在 `ProjectView` 里塞两个 `setState`:
 * 这一行有三条互相牵制的边界,散在组件里就只能靠调用方每处都记得写对 ——
 *
 *   1. **恢复后整行消失,不留「已恢复」**(cmp-ops 原话)。所以「恢复」只有一种表达:
 *      状态回到 `null`。这里没有任何一个分支能产出「已恢复」那种终态读数。
 *   2. **次数用尽换成〔重新连接〕交回给人**(22-3)。传输层用尽预算时的调用顺序是
 *      `onRunStatus('failed')` → `emitReconnect('exhausted')` → `onError(...)`,
 *      而报错那条路上还会再来一次 `failed`。所以 `exhausted` 必须能扛住随后到达的
 *      `failed`,否则那颗按钮会一闪而过。
 *   2b. **按下那颗按钮必须有回音,而且回音必须到期**(`manual-retry` /
 *      `manual-retry-expired`)。按下之后要走的整条链都在异步里,daemon 没回来时
 *      它在半路就断了,屏幕原封不动 —— 而「点了没变化」和「按钮坏了」长得一模一样。
 *      于是按下**无条件**翻回「正在重新连接」,并由一把统一的到期闸把它送回 22-3。
 *   3. **run 落终态后整行消失**。`canceled` 由 AssistantMessage 的回合 footer
 *      报「已手动停止」,不再追加 PauseLine;`succeeded` 同样不留「已恢复」。所以这里
 *      让任何 terminal status 立刻撤掉重连行,避免历史回放残留一条陈年连接状态。
 */
import type { ChatRunStatus } from '@open-design/contracts';

/**
 * 这一行在说哪一件「系统在自救」。
 *
 *   `transport`   浏览器 ↔ daemon 的那条 SSE 断了,正在重连(组件 22 的原义)
 *   `agent-retry` 连接好好的,是 daemon 把 agent 那一轮重跑了一遍
 *
 * 两件事分属不同层,但用户看到的是同一件事:系统在自救,等一下。交付稿
 * (`docs/design/chat-panel-next.html:4058`)对此有过明确裁决 ——「断线由
 * 22 · 重连全程接管……**再单立一个模块只会多出第三个说法**」。所以它们共用
 * 这一行的形态、共用「恢复后整行消失、不留『已恢复』」这条规矩,只有那句话
 * 不同:重跑一轮时线是通的,说「正在重新连接」是假话。
 *
 * 也是「共几次」取哪个预算的判据 —— 传输层是 5(`DAEMON_STREAM_RECONNECT_LIMIT`),
 * 自动重试是那一轮的 `retry_max_attempts`。一行只说一件事,所以两个预算不会混。
 */
export type ChatSelfHealReason = 'transport' | 'agent-retry' | 'agent-reconnect';

/** 流水尾部那一行的读数。`null` = 此刻不该有这一行。 */
export interface ChatReconnectView {
  /** 这一行说的是哪一件自救。见 {@link ChatSelfHealReason}。 */
  reason: ChatSelfHealReason;
  /**
   * 这一行属于哪一次运行。换一轮、翻历史、后台重挂的另一条流恢复了 —— 都靠它对齐,
   * 免得一条陈年重连留在流水里(「恢复后自动消失」的另一半)。
   */
  runId: string;
  /**
   * 这一行属于哪个会话。后台重挂会在**别的**会话上跑,当前会话的流水尾部不该
   * 长出一行别人的重连。渲染前用 `reconnectViewForConversation` 过一道。
   */
  conversationId: string;
  /** 本段掉线里的第几次尝试,1 起。传输层保证单调递增(见 `DaemonReconnectState`)。 */
  attempt: number;
  /** 传输层的重连预算,设计稿的「共几次」。 */
  max: number;
  /** 预算用尽:自动重连停止,交回给人(22-3)。 */
  exhausted: boolean;
  /**
   * 这一行现在显示的是**用户按下〔重新连接〕之后的乐观读数**,不是传输层的原话。
   *
   * 它存在的唯一理由是让「按下」这件事有回音:重挂能不能起来要过好几道前置条件,
   * 而那些条件全在异步里,屏幕上没有任何东西替这一下按压说话(真机 2026-08-27,
   * 用户原话「点击 reconnect 咋没啥反应」)。
   *
   * 乐观就必须有到期:任何一条乐观读数都由 `manual-retry-expired` 统一回落成
   * 22-3,时限见 {@link MANUAL_RECONNECT_FEEDBACK_MS}。这个标记就是那把闸的钥匙 ——
   * 传输层后来接管出来的真读数不带它,于是闸对真读数一律无效。
   */
  manualRetry: boolean;
  /**
   * 这一行是**浏览器自己说这一屏没网了**推出来的,不是传输层数出来的。
   *
   * 为什么要分开记:两个上膛口的收场方式不一样。传输层那一段由 `cleared` /
   * `exhausted` 自己收;掉线这一段只由 `online` 收 —— 而 `online` 不该碰传输层
   * 正在数的那一行(线断没断和这一屏有没有网是两件事,后者好了不代表前者通了)。
   * 这个标记就是那道分界。
   *
   * 也是「谁盖得住谁」的判据:传输层的读数更具体(它数得出第几次、能走到 22-3),
   * 所以它一到就把这一档盖掉;反过来不行。
   */
  offline?: boolean;
}

/**
 * 那一下按压的乐观读数最多留多久,到点回落成 22-3(带按钮)。
 *
 * 取值的两头:
 *   · 下限 —— 重挂真的起得来时,真机量到整行在 **0.4s** 内消失(2026-08-27)。
 *     所以任何小于那个数的时限都会先闪一次「连接失败」再消失,凭空多一次跳变。
 *   · 上限 —— 这是**失败**路径上用户要等的沉默时间。太长就从「在试」变成「又卡住了」。
 *
 * 3 秒:够慢到看得见「它真的去试了」,够快到失败结论不迟到。
 */
export const MANUAL_RECONNECT_FEEDBACK_MS = 3000;

export type ChatReconnectSignal =
  /** 传输层的原话,逐字来自 `DaemonStreamHandlers.onReconnect`。 */
  | {
      kind: 'transport';
      runId: string;
      conversationId: string;
      attempt: number;
      max: number;
      phase: 'reconnecting' | 'cleared' | 'exhausted';
    }
  /** 这一轮落了终态。`canceled` 的结果由回合 footer 展示,见文件头第 3 条。 */
  | { kind: 'settled'; runId: string; status: ChatRunStatus }
  /**
   * daemon 把 agent 那一轮重跑了 —— 逐字来自 SSE 上的 `run_retry_attempted`
   * (经 `DaemonStreamHandlers.onAgentRetry` 转成读数)。
   *
   * 没有 `exhausted` 那一档:预算烧完之后接手的是报错卡(设计稿 S10 的时机原文
   * 是「自动重试都失败后」),不是一颗〔重新连接〕。这一行只负责说「还在试」。
   */
  | {
      kind: 'agent-retry';
      runId: string;
      conversationId: string;
      attempt: number;
      max: number;
      phase: 'retrying' | 'cleared';
    }
  /** Agent CLI is reconnecting its upstream model stream (for example Codex). */
  | {
      kind: 'agent-reconnect';
      runId: string;
      conversationId: string;
      attempt: number;
      max: number;
      phase: 'reconnecting' | 'cleared';
    }
  /**
   * 本地不再跟这条流了:切会话、离开项目、组件卸载。不带 `runId` 就是全清。
   * 与 `settled` 分开是因为它不表达运行结果 —— 那一轮可能还在 daemon 上跑着。
   */
  | { kind: 'dropped'; runId?: string }
  /**
   * 用户按了〔重新连接〕。把交回给人的那一行**立刻**翻回「正在重新连接 1/5」。
   *
   * 为什么必须翻:按下之后要走的是「清重试记账 → 叫醒重挂扫描 → 拉运行状态 →
   * 起重挂」,daemon 没回来时这条链在第三步就断了,而整条链上没有一样东西会
   * 碰这一行 —— 屏幕于是原封不动。真机 2026-08-27,用户原话「点击 reconnect
   * 咋没啥反应」。**「点了没变化」和「按钮坏了」在屏幕上长得一模一样。**
   *
   * 为什么不能翻成「整行消失」:更早一版就是那么做的(乐观推一条 `dropped`),
   * 而重挂起不来时没有人再把行画回来,屏幕只剩壳头一句「运行失败」,报错卡按 R9
   * 又是该压掉的 —— 用户连再按一次的入口都没有。撤整行的唯一正当时机仍然只有
   * 「重挂真的开始了」,那个位置由 `dropped` 占着。
   *
   * 只对**已经交回给人**的那一行有效:还在数的那一行本来就没有按钮,而且它显示的
   * 是传输层的真实读数,不该被一次按压改写成 1。
   *
   * 连点不成立:翻过去之后 `exhausted` 是 false,`Reconnect` 那一档根本不画按钮
   * (见 `components/chat/Reconnect.tsx`)—— 窗口里没有可按的东西,一次按压
   * 只换来一次重挂扫描,也没有任何东西会自己再按一次。
   */
  | { kind: 'manual-retry'; runId: string }
  /**
   * 那一下按压的乐观读数到期了(`MANUAL_RECONNECT_FEEDBACK_MS`)。
   *
   * 乐观读数**必须**有且只有这一个收场:重挂没起来的形态太多(状态拉不到、
   * daemon 亲口说这一轮已经 failed、被冷却窗口挡下、扫描本身因为 `daemonLive`
   * 翻假而压根没跑),挨个去认等于把一条不变量拆成十几处记得写对。这里只认一件事:
   * **过了这么久这一行还是那条乐观读数,就说明没接上** —— 回落成 22-3,把按钮还给人。
   *
   * 对不是乐观读数的那一行一律不动,所以传输层真的接管之后这把闸自动作废。
   */
  | { kind: 'manual-retry-expired'; runId: string }
  /**
   * **浏览器自己报的**这一屏的联网状态(`online` / `offline` 事件 +
   * `navigator.onLine`)。传输层那条梯子之外的第二个上膛口。
   *
   * 为什么必须有第二个:今天那一行只有 socket 真的断掉才上膛。可 daemon 跑在
   * **本机回环**上 —— 页签断网时那条流常常一点事都没有,25 秒一次的 keepalive
   * 照旧到,75 秒的静默闸(`DAEMON_STREAM_IDLE_TIMEOUT_MS`)一次都不上膛,
   * 于是「重连预算」从头到尾是 0。真机 2026-09-03:断网一分钟后
   * `navigator.onLine` 已经是 `false`,壳头还写着「进行中」、秒数还在往上走,
   * 屏幕上一个字都没有。**浏览器早就知道,我们没问过它。**
   *
   * 读数固定 `1/1`:这一档背后**没有梯子在数**,写「1/5」是假话。
   * `Reconnect` 的 `showCount = max > 1` 于是自动只画那句话,不画分数。
   *
   * 也没有 `exhausted`:没网这件事不会「重试到用尽」,它由 `online` 收场,
   * 摆一颗〔重新连接〕没有对应的动作 —— 能做的事在浏览器那头,不在这颗按钮上。
   */
  | { kind: 'network'; runId: string; conversationId: string; online: boolean };

/**
 * 一条信号推一次状态。`prev` 原样返回表示「这条信号跟屏幕上这一行无关」。
 */
export function nextChatReconnectView(
  prev: ChatReconnectView | null,
  signal: ChatReconnectSignal,
): ChatReconnectView | null {
  if (signal.kind === 'manual-retry') {
    if (!prev || prev.runId !== signal.runId) return prev;
    if (!prev.exhausted) return prev;
    // 从 1 起:这是**人按的**这一次的第一次,不是接着传输层那一段数下去。
    // 「共几次」沿用同一份传输层预算,断了之后那把梯子也是从 1/5 重走。
    return { ...prev, attempt: 1, exhausted: false, manualRetry: true };
  }

  if (signal.kind === 'manual-retry-expired') {
    if (!prev || prev.runId !== signal.runId || !prev.manualRetry) return prev;
    return { ...prev, attempt: prev.max, exhausted: true, manualRetry: false };
  }

  if (signal.kind === 'network') {
    /*
     * 网回来了只收自己那一段。传输层正在数的那一行不许碰:这一屏有没有网,
     * 和浏览器 ↔ daemon 那条流通没通,是两件事 —— 后者好没好由它自己的
     * `cleared` 说了算,拿 `online` 去撤它就等于替它宣布「已经接上了」。
     */
    if (signal.online) return prev?.offline ? null : prev;
    // 传输层的读数更具体(数得出第几次、走得到 22-3),它在场就不降级。
    if (prev && !prev.offline) return prev;
    // 同一轮里重复报 offline 不产生新对象,免得白刷一次渲染。
    if (prev && prev.runId === signal.runId) return prev;
    return {
      reason: 'transport',
      runId: signal.runId,
      conversationId: signal.conversationId,
      attempt: 1,
      max: 1,
      exhausted: false,
      manualRetry: false,
      offline: true,
    };
  }

  if (signal.kind === 'agent-retry' || signal.kind === 'agent-reconnect') {
    if (prev && prev.runId !== signal.runId) return prev;
    /*
     * 断线那一行盖得住重试那一行,反过来不行。
     *
     * 这两件事在今天的实现里碰不到一起:daemon 发 `error` 帧不关流
     * (`runtimes/runs.ts` 只有 `finish()` 才 `sse.end()`,而同 run 重试不走
     * `finish()`),web 那边 `error` 帧只是缓存下来接着读,不会记一次重连。
     * 但那是当下实现的性质,不是这一层的保证。
     *
     * 万一真的同时到达:线断了是更大的事实,而且那一行带着〔重新连接〕——
     * 用户至少有个能按的东西。重试那一行什么按钮都没有,盖掉它不损失出路。
     */
    if (prev?.reason === 'transport') return prev;
    if (signal.phase === 'cleared') return null;
    return {
      reason: signal.kind,
      runId: signal.runId,
      conversationId: signal.conversationId,
      attempt: signal.attempt,
      max: signal.max,
      exhausted: false,
      manualRetry: false,
      offline: false,
    };
  }

  if (signal.kind === 'dropped') {
    if (signal.runId && prev && prev.runId !== signal.runId) return prev;
    /*
     * 「重挂真的开始了」撤掉的是**传输层那一段读数** —— 换一条流,前一段的
     * 第几次就作废了。可这一屏有没有网跟换不换流无关:重挂起来了网也没回来,
     * 而重挂那条流自己会失败,再由传输层报它自己的读数盖上来。撤了它,
     * 屏幕就在「重挂开始」到「重挂失败」之间空一段,壳头又只剩「进行中」。
     *
     * 不带 `runId` 的全清(切会话、离开项目、卸载)照旧连它一起撤:那时
     * 本地压根不跟这条流了,任何一行都不该留在屏幕上。
     */
    if (signal.runId && prev?.offline) return prev;
    return null;
  }

  if (signal.kind === 'settled') {
    if (!prev || prev.runId !== signal.runId) return prev;
    switch (signal.status) {
      case 'queued':
      case 'running':
        // 已经交回给人之后又听到这一轮在跑 = 外层重挂接上了。用尽后的那次重挂
        // 自己的读数从 0 起,所以它不会发 `cleared`,「又活了」是仅有的恢复证据。
        // 还在数的时候不认这个:那只是状态回声,真正的恢复由 `cleared` 说了算。
        return prev.exhausted ? null : prev;
      case 'canceled':
        // 让位给组件 20。掉线自己产不出 canceled,所以这里丢掉的一定是
        // 「用户在掉线期间按了停」那一种 —— 该说的话由暂停行去说。
        return null;
      case 'succeeded':
        return null;
      case 'failed':
        // 乐观窗口里 `exhausted` 是 false,而 `failed` 恰恰是掉线时传输层写的那个字 ——
        // 走下面那条就等于「按一下整行消失」,回到那个死胡同。窗口的收场只认到期闸。
        if (prev.manualRetry) return prev;
        // 用尽后传输层先发 failed 再发 exhausted,报错那条路上还会再来一次 failed。
        // 已经交回给人的那一行要立得住,没交回去的就跟着这一轮一起收场。
        return prev.exhausted ? prev : null;
    }
  }

  if (signal.phase === 'cleared') {
    if (prev && prev.runId !== signal.runId) return prev;
    return null;
  }

  return {
    reason: 'transport',
    runId: signal.runId,
    conversationId: signal.conversationId,
    attempt: signal.attempt,
    max: signal.max,
    exhausted: signal.phase === 'exhausted',
    // 传输层的原话永远不是乐观读数 —— 它一接管,那把到期闸就作废。
    manualRetry: false,
    // 也不是浏览器那一档:传输层接管之后 `online` 不该再撤这一行(见 `network`)。
    offline: false,
  };
}

/**
 * 从消息表里补一条「这一轮其实已经收场了」的信号,没有可补的就返回 `null`。
 *
 * 为什么需要它:`settled` 今天只在**流上**发 —— 流里读到终态、或重挂读到终态。
 * 可这一行出现的时刻恰恰是流断了的时刻,那一轮的结局于是常常从别的门进来
 * (会话刷新、切回这个会话时重新拉消息)。真机上(2026-08-27)看到的就是这个:
 * 用户按了〔重新连接〕,内容靠一次会话刷新回来了、消息写着「已完成」,
 * 而那一行还挂在下面说「连接失败」—— 正是稿子说的「不留残影」要挡的东西。
 *
 * 判据交回给 `nextChatReconnectView`,这里不自己决定要不要撤:
 * `failed` 对已经交回给人的那一行是**不动**的(22-3 那颗按钮要立得住),
 * 只有 `succeeded` / `canceled` 才是真的收场。
 */
export function settledSignalFromMessages(
  view: ChatReconnectView | null,
  messages: ReadonlyArray<{ runId?: string | null; runStatus?: ChatRunStatus | null }> | undefined,
): ChatReconnectSignal | null {
  if (!view || !messages) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.runId !== view.runId) continue;
    const status = message.runStatus;
    if (status === 'succeeded' || status === 'canceled') {
      return { kind: 'settled', runId: view.runId, status };
    }
    return null;
  }
  return null;
}

/**
 * 渲染前的最后一道:这一行是不是当前会话的事。不是就当没有。
 */
export function reconnectViewForConversation(
  view: ChatReconnectView | null,
  conversationId: string | null | undefined,
): ChatReconnectView | null {
  if (!view) return null;
  if (!conversationId) return null;
  return view.conversationId === conversationId ? view : null;
}
