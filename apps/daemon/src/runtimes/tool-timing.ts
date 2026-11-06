/**
 * 给工具调用盖时间戳,让界面能显示「这次调用花了多久」。
 *
 * 为什么放在这里,而不是各家适配器里(规格 §4 ①):
 * daemon 的 ring buffer 每条事件本来就有到达时间,诊断统计也一直在用它算单工具耗时 ——
 * **数据一直都在,只是没送到前端**。SSE 只发 `(event, data, id)`,web 的 `toAgentEvent()`
 * 也不带,时间在链路上丢了两次。所以只要在**唯一的出口**(`emitAgentEvent`)补两个字段,
 * 27 家 runtime 就全部受益,不用一家一家改。
 *
 * 为什么两端都可能缺(§2.2b / W10):
 *  · claude 的 `tool_use` 在 assistant 消息到达时就发出 → 出口盖的时间就是真实开始时间
 *  · codex 的 `tool_use` 在 `item.started` 就发出 —— `command_execution`、
 *    `file_change`、`mcp_tool_call` 三种都是,两条 wire(`exec --json` 与默认的
 *    `app-server`)都如此。**只有 `web_search` 例外**,它在 `item.completed` 才发。
 *    实测 141 条本机 run:codex 的 162 条工具行 `tool_use → tool_result` p50 1ms、
 *    max 119.9s —— 有真实跨度,不是同批到达。
 *
 *    ⚠️ 这一条原本写的是「codex 在 `item.completed` 才发出,和 `tool_result` 同时
 *    到达」。那是错的,而且落地当天(`38aa03bff4`)`command_execution` 就已经在
 *    `item.started` 发了。当时量到的「p50 只有几毫秒」是真的,错在归因:codex 有
 *    一半 Bash 本来就是瞬时命令。改这段之前请先自己量一遍,不要照抄任何一版说法。
 *
 *    `< 100ms` 当未知那条前端规则**照旧保留** —— 它挡的是「真的没有起点信息」那一档
 *    (界面上出过「0.0s」,是这条规则的由来),只是理由不再是 codex。
 *  · ACP 家族自己带 `startedAt`(首帧时间),已经有的就不覆盖。
 *    ⚠️ 注意 ACP 的 `startedAt` 是**首帧**时刻,而 `tool_use` 事件要等**终态**才发,
 *    所以这两个时刻之间隔着整整一次工具执行 —— 实测 116 条 AMR 工具行累计 855 秒。
 *    拿这个差去当"工具耗时"是对的;拿它当"事件延迟"会得出错误结论。
 *
 * 只补不改:任何一端已经有值,原样保留。
 */

export interface ToolTimingClock { now(): number }

const systemClock: ToolTimingClock = { now: () => Date.now() };

/** 出口处的事件形状(daemon 内部用 `type`,落库/送前端后叫 `kind`) */
interface MaybeToolEvent {
  type?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
}

/**
 * 在事件对象上补齐工具时间戳。原地改 —— 这里是事件的唯一出口,
 * 对象由各家适配器现造,没有别处引用它。
 */
export function stampToolTiming(event: unknown, clock: ToolTimingClock = systemClock): void {
  if (!event || typeof event !== 'object') return;
  const ev = event as MaybeToolEvent;
  if (ev.type === 'tool_use') {
    if (typeof ev.startedAt !== 'number') ev.startedAt = clock.now();
    return;
  }
  /*
   * 早期形态和 `tool_use` 走同一条规矩 —— 它就是「这次调用开始了」的另一种说法,
   * 只是发生在还不知道结果的时候。契约上 `startedAt` 是**必填**(客户端拿它跑秒表,
   * 也拿它把早期行退成结算行),而解析器是纯函数、手上没有时钟,所以由这个唯一出口补。
   *
   * ACP 那条线自己带 `firstSeenAt`,已经有值的原样保留(同下面「只补不改」)。
   */
  if (ev.type === 'tool_in_flight') {
    if (typeof ev.startedAt !== 'number') ev.startedAt = clock.now();
    return;
  }
  if (ev.type === 'tool_result') {
    if (typeof ev.completedAt !== 'number') ev.completedAt = clock.now();
  }
}
