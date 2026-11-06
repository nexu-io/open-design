/**
 * 上游最近一次「有东西落下来」是什么时候 —— 按 run 记的一张小表。
 *
 * **为什么不能从 `message.events` 推。** S12(「等太久没动静」,P1,18,891 次/月、
 * 6,372 台)问的是一件**传输层的事实**:最近这段时间上游有没有给过我们东西。
 * 而 `message.events` 是加工过的产物,三处都会把这件事实抹掉:
 *
 *  1. `tool_input_delta` 在 `providers/daemon.ts` 记完心跳就被丢掉,
 *     压根不变成 `AgentEvent`。真机 run `7ed15c2f` 里它是 1346 条 agent 帧中的 699 条,
 *     而报「已等 156 秒」的那个 161.6 秒窗口里,126 条帧有 124 条是它 ——
 *     换句话说这张表的主力就是它,它不进来,S12 当场谎报。
 *  2. claude 的 `thinking_delta` 一律是空串(那条 run 里 414/414 条 `delta: ""`),
 *     `appendBufferedAgentDeltas` 的 `if (thinkingDelta)` 直接把它挡在门外 ——
 *     事件数组连引用都不换。
 *  3. 连续的 `text` / `thinking` 会被 `appendCoalescedAgentEvent` 合进**最后一条**,
 *     所以就算带了字,数组长度也不涨。
 *
 * 换句话说:一整段流式期间,那个数组可以一动不动。以它为准的静默计时必然谎报。
 *
 * **为什么这条对所有 agent 都成立。** 这里记的是「帧到达」,不是「事件里写了什么」。
 * 规格 §2.2 点名的那批 —— `qwen` / `deepseek` / `grok-build` / `aider` /
 * `antigravity` / `atomcode`(plain-stream)与 `qoder` —— 整轮 `tool_use` 为 0、
 * 一个带时刻的事件都没有,但只要它们还在往 stdout 写字,帧就会到,这张表就会动。
 *
 * **keepalive 不算。** 服务端的注释帧证明的是「连接还活着」,不是「上游还在干活」。
 * 传输层刻意只在**真运行事件**那一支登记(见 `daemon.ts` 里 `sawRunEvent` 旁边那行)。
 */

/**
 * 最多盯住几条 run。一次会话里同时活着的 run 是个位数,64 只是防长会话无限涨;
 * `Map` 保插入序,所以最前面那条就是最久没动过的。
 */
const MAX_TRACKED_RUNS = 64;

const lastFrameAt = new Map<string, number>();

/** 传输层收到一条**真运行帧**时叫一次。keepalive 注释帧不要叫。 */
export function markUpstreamActivity(runId: string, at: number = Date.now()): void {
  if (!runId) return;
  // 先删后插:让它回到队尾,前面那些才是该被挤掉的
  lastFrameAt.delete(runId);
  lastFrameAt.set(runId, at);
  while (lastFrameAt.size > MAX_TRACKED_RUNS) {
    const oldest = lastFrameAt.keys().next();
    if (oldest.done) break;
    lastFrameAt.delete(oldest.value);
  }
}

/**
 * 这条 run 最近一帧是什么时候到的;**从来没到过**就是 `null`。
 *
 * `null` 不是「刚刚」也不是「很久以前」—— 它是「说不出来」。调用方必须退回
 * 自己的兜底(`buildTurnBlocks` 退回轮次开头),那正是「卡在首个 token」
 * 那一档(每月 5,547 次)要的行为:一帧都没来过,静默就该从轮次开头算。
 */
export function upstreamActivityAt(runId: string | null | undefined): number | null {
  if (!runId) return null;
  return lastFrameAt.get(runId) ?? null;
}

/** 仅测试用:抹掉跨用例残留。 */
export function __resetUpstreamActivity(): void {
  lastFrameAt.clear();
}
