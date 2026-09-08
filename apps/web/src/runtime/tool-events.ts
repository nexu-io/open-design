import type { AgentEvent } from '../types';

import { isSnapshotTool } from './chat/tool-kind';

/**
 * 同一次 `tool_use` 被送两遍时只留第一条 —— SSE 重放会这样。
 *
 * **快照型工具除外**(`isSnapshotTool`):它们每次调用都是把整份状态替换一遍,
 * 有的 agent 干脆把「计划」建模成一个反复改写的条目,五次推进共用同一个 tool id。
 * 按 id 去重会把除第一次以外的状态推进全部丢掉 —— 真机撞到过:一轮跑完了,
 * 四条 todo 还全是虚线圈的「未开始」,第一条同时挂着 35.1s 的耗时和「未开始」的记号。
 * 重复的快照多留一份没有代价:落块是原地更新,同一份状态应用两次结果一样。
 */
export function dedupeToolUsesById(events: AgentEvent[] | undefined): AgentEvent[] {
  if (!events || events.length === 0) return [];

  const seen = new Set<string>();
  let deduped: AgentEvent[] | null = null;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]!;
    if (event.kind === 'tool_use' && !isSnapshotTool(event.name)) {
      if (seen.has(event.id)) {
        if (!deduped) deduped = events.slice(0, i);
        continue;
      }
      seen.add(event.id);
    }
    if (deduped) deduped.push(event);
  }

  return deduped ?? events;
}

/**
 * 「入参还在传」的那一档写文件调用,在 `input` 上带的记号。
 *
 * daemon 在路径刚够完整时发一条 `tool_input_target`(几十字节,原始入参一个字节
 * 都不出 daemon);`providers/daemon.ts` 把它翻成**同一次调用的早期形态** ——
 * 一个只带 `file_path` 的 `tool_use`。这样动词、图标、文件名按钮全部复用已有的
 * `buildToolRow` / `ToolRow`,不新增文案 key,也不新增渲染分支:提前那一行长得
 * 就是最终那一行**减去** `+N −M`(那个要 `content` 才算得出来)。
 *
 * 记号放在 `input` 里而不是事件顶层,是因为 `input` 是 `unknown` ——
 * 早期形态因此是一个**合法的** `tool_use`,不用把 `PersistedAgentEvent` 撑宽成
 * 一个「落了库就不成立」的形状。它也从来不落库(daemon 那边
 * `runSseEventToPersistedAgentEvent` 直接丢掉 `tool_input_target`)。
 */
export const IN_FLIGHT_TOOL_INPUT_MARKER = 'od_input_streaming';

/**
 * 早期形态上「到目前为止跑出来的输出」,ACP 那条线用(`tool_in_flight`)。
 *
 * 为什么不发一条 `tool_result`:`buildToolRow` 拿 `result == null` 判 `pending`,
 * 给一次还在跑的调用配个结果,行会立刻不再是 pending —— 秒表停住、状态显示成
 * 已完成,而命令还在跑。放在 `input` 上就只是「这一行现在知道的事情」多了一件,
 * 和文件名、命令是同一档,行本身仍然是未完成态。
 */
export const IN_FLIGHT_TOOL_OUTPUT_KEY = 'od_output_streaming';

/** 这条 `tool_use` 是不是「入参还没传完」的早期形态。 */
export function isInFlightToolUse(event: AgentEvent): boolean {
  if (event.kind !== 'tool_use') return false;
  const input = event.input;
  return (
    typeof input === 'object' &&
    input !== null &&
    (input as Record<string, unknown>)[IN_FLIGHT_TOOL_INPUT_MARKER] === true
  );
}

/**
 * 一次调用只留**一条**事件:真的 `tool_use` 到了就摘掉早期形态,还没到就只留
 * 最新的那一条早期形态。
 *
 * ⚠️ 两件事都必须跑在 `dedupeToolUsesById` **之前**,因为那个函数按 id 留
 * **第一条**:
 *
 *  · 真货来了不先摘早期形态,留下来的就是那份没有 `content` 的入参 —— `+N −M`
 *    永久消失,所有读 `input.content` 的下游也永远只看得到半截。
 *  · 入参还在传的这一段里,daemon 会一条接一条地报新的行数(W120)。不把旧的那
 *    几条摘掉,留下来的永远是第一条 —— **行上的数字会停在第一个值不动**,
 *    文件名还在,光看名字发现不了。
 *
 * 摘干净之后「先显示一个、后变成另一个」不可能发生:daemon 保证每一条早期形态的
 * `path` 都是最终的 `file_path`,而且一次调用只剩一条事件,也就只画一行。
 *
 * ── 计时起点跟着往前搬 ────────────────────────────────────────────────
 *
 * 早期形态带的 `startedAt` 是 daemon **第一次看见这次调用的入参**的时刻;真的
 * `tool_use` 拿到的却是入参**传完**那一刻(`emitAgentEvent` 在出口盖的)。写一个
 * 27.6KB 的页面,两者差着一百多秒。不搬的话,行上的秒数会在落定那一帧从
 * 「2m 18s」被按回 0 —— 用户看到的是计时器倒退。所以真货沿用早期形态的起点:
 * **一行的计时从这一行出现的时候开始算**,跨越交接不重来。
 */
export function dropSupersededInFlightToolUses(events: AgentEvent[] | undefined): AgentEvent[] {
  if (!events || events.length === 0) return [];

  let sawInFlight = false;
  const settledIds = new Set<string>();
  const lastInFlightAt = new Map<string, number>();
  const inFlightStartedAt = new Map<string, number>();
  events.forEach((event, index) => {
    if (event.kind !== 'tool_use') return;
    if (!isInFlightToolUse(event)) {
      settledIds.add(event.id);
      return;
    }
    sawInFlight = true;
    lastInFlightAt.set(event.id, index);
    const startedAt = (event as { startedAt?: number }).startedAt;
    if (typeof startedAt === 'number' && !inFlightStartedAt.has(event.id)) {
      inFlightStartedAt.set(event.id, startedAt);
    }
  });
  if (!sawInFlight) return events;

  const kept: AgentEvent[] = [];
  events.forEach((event, index) => {
    if (event.kind !== 'tool_use') {
      kept.push(event);
      return;
    }
    if (isInFlightToolUse(event)) {
      // 真货已经到了,或者这条不是最新的那一条早期形态 —— 都不留
      if (settledIds.has(event.id)) return;
      if (lastInFlightAt.get(event.id) !== index) return;
      kept.push(event);
      return;
    }
    const earlier = inFlightStartedAt.get(event.id);
    const own = (event as { startedAt?: number }).startedAt;
    if (earlier != null && (typeof own !== 'number' || earlier < own)) {
      kept.push({ ...event, startedAt: earlier });
      return;
    }
    kept.push(event);
  });
  return kept;
}
