import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createJsonEventStreamHandler } from '../../src/runtimes/json-event-stream.js';
import { stampToolTiming } from '../../src/runtimes/tool-timing.js';

/**
 * codex 的 `web_search` 必须在**发起时**就上屏,不能等搜完才出现。
 *
 * ── 产品红线(2026-09-03,口述)────────────────────────────────────────────
 *
 *   「我的要求始终是,**调用前(流式传输时)就要显示在界面上并开始计时**,
 *     绝对不能调用完了才出现在界面上!」
 *
 * ── 修之前:codex 四类工具里三类合规,`web_search` 是唯一的例外 ──────────
 *
 * `json-event-stream.ts` 的 `item.started` 分支:
 *   · `command_execution`  → 当场发 `tool_use`  ✅
 *   · `file_change`        → 当场发 `tool_use`  ✅
 *   · `mcp_tool_call`      → 当场发 `tool_use`  ✅
 *   · `web_search`         → **`return true` 什么都不发**,行只在
 *     `item.completed` 才出现  ❌
 *
 * 当时的理由写在那段注释里,而且是个真问题:started 帧的 `query` 恒为空
 * (见下面逐字 fixture,`"query":"","action":{"type":"other"}`),
 * 「一个没有搜索词的『搜索』行比没有行更糟」。红线推翻的是这个取舍 ——
 * **没有词的行也比空屏好**,因为它带着秒表,回答的是「卡在哪」。
 *
 * ── 这个洞有多大 ──────────────────────────────────────────────────────────
 *
 * 本地 179 条录音里 codex 没有 `web_search` 样本,所以**不拿它当证据**。
 * 同一类调用能量到的是 claude 的 `WebFetch`:2 次共 11.1 秒,单次 **7.42 秒**。
 * 一次要走网络的搜索是秒级的,不是毫秒级 —— 7 秒空屏正是红线要消灭的东西。
 *
 * ── 补法:用现成的 `tool_in_flight`,不新造机制 ───────────────────────────
 *
 * `tool_in_flight` 是**通用**契约事件(`packages/contracts/src/sse/chat.ts:301`),
 * 不是 ACP 专用:同 `id` 的早期形态会被 `dropSupersededInFlightToolUses` 退成
 * 结算后的那一行,**一行一个秒表**,不会画两行也不会重启计时。ACP 家族就是这么
 * 干的(`acp/session.ts` 的 `tool_use` 反而是终态才发)。所以这里照抄那条路:
 * started 发 `tool_in_flight`(没有词),completed 那一对原样不动,词到那时补上。
 *
 * ⚠️ **id 必须用 codex 那个坑里的值**:started / completed 两帧都把 `id` 序列化
 * 了两次(先 `item_2`,再 `exec-…`),`JSON.parse` 保留**后一个**。两帧一致,
 * 所以配得上;要是这里取了 `item_2`,早期行就退不进结算行,屏幕上会出现两行。
 *
 * ── 防假绿 ────────────────────────────────────────────────────────────────
 *
 * · fixture 是从真机 `codex exec --json`(codex-cli 0.149.1)逐字拷来的,
 *   和 `json-event-stream.test.ts` 里那两条同源,不许"整理"。
 * · 反向对照:`item.completed` 那一对必须一个字都没变,否则等于把结算行改坏了。
 * · 时钟不在解析器里(它是纯函数),所以分两处断言:解析器发出事件、
 *   `stampToolTiming` 在唯一出口补上 `startedAt`。少任何一半这条链都不通。
 */

type JsonStreamEvent = Record<string, unknown>;

function collectEvents(kind: string) {
  const events: JsonStreamEvent[] = [];
  const handler = createJsonEventStreamHandler(kind, (event) => events.push(event));
  return { events, handler };
}

/* 逐字来自真机 codex exec --json(codex-cli 0.149.1)。注意 `id` 出现两次。 */
const STARTED =
  '{"type":"item.started","item":{"id":"item_2","type":"web_search","id":"exec-9fb8985e-4163-4af2-82a2-d499ab71d18b","query":"","action":{"type":"other"}}}';
const COMPLETED =
  '{"type":"item.completed","item":{"id":"item_2","type":"web_search","id":"exec-9fb8985e-4163-4af2-82a2-d499ab71d18b","query":"OpenAI Codex CLI release notes","action":{"type":"search","query":"OpenAI Codex CLI release notes"}}}';
/** 重复 key 里 `JSON.parse` 留下的那一个 —— 早期行与结算行靠它配对 */
const TOOL_ID = 'exec-9fb8985e-4163-4af2-82a2-d499ab71d18b';

test('codex web_search 在 item.started 就发出早期行(红线:不许跑完才出现)', () => {
  const { events, handler } = collectEvents('codex');

  handler.feed(`${STARTED}\n`);

  assert.deepEqual(events, [
    { type: 'tool_in_flight', id: TOOL_ID, name: 'web_search', input: {} },
  ]);
});

test('早期行的 id 与结算行一致 —— 否则屏幕上会出现两行搜索', () => {
  const { events, handler } = collectEvents('codex');

  handler.feed(`${STARTED}\n${COMPLETED}\n`);

  const ids = events.map((e) => e.id ?? e.toolUseId);
  assert.deepEqual(
    [...new Set(ids)],
    [TOOL_ID],
    `三条事件必须共用同一个 id,实际是 ${JSON.stringify(ids)}`,
  );
});

test('反向对照:结算那一对一个字都没变', () => {
  const { events, handler } = collectEvents('codex');

  handler.feed(`${STARTED}\n${COMPLETED}\n`);

  assert.deepEqual(events.slice(1), [
    {
      type: 'tool_use',
      id: TOOL_ID,
      name: 'web_search',
      input: { query: 'OpenAI Codex CLI release notes' },
    },
    { type: 'tool_result', toolUseId: TOOL_ID, content: '', isError: false },
  ]);
});

test('时钟在唯一出口补上 —— 早期行没有 startedAt 就没有秒表', () => {
  const early: Record<string, unknown> = {
    type: 'tool_in_flight', id: TOOL_ID, name: 'web_search', input: {},
  };
  stampToolTiming(early, { now: () => 1_800_000_000_000 });
  assert.equal(early.startedAt, 1_800_000_000_000);
});

test('反向对照:已经带了 startedAt 的不许被覆盖(只补不改)', () => {
  const early: Record<string, unknown> = {
    type: 'tool_in_flight', id: TOOL_ID, name: 'web_search', input: {}, startedAt: 42,
  };
  stampToolTiming(early, { now: () => 1_800_000_000_000 });
  assert.equal(early.startedAt, 42);
});
