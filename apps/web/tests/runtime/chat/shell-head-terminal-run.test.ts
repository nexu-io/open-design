// @vitest-environment node
/**
 * 壳头对**已经结束的一轮**的读数 —— 秒表必须停,状态词必须说实话。
 *
 * 这是 `ProjectView.reattach-replayed-start.test.tsx` 的下游对照。那边钉的是
 * 「状态不许被历史帧写坏」;这边钉的是「状态没写坏时,壳头本来就画得对」——
 * 两边合起来才说得清真机上那张 `Working 202m 23s` 是谁的责任。
 *
 * 用的是真机会话 64acc867 里两条 `run_status=failed` 消息的**原样** `events_json`:
 * 一条(b7b61e19)带着没有 `tool_result` 的 `tool_use`,一条(65514d97)只有 thinking。
 * 真机上前者画错、后者画对,所以两条都要在这里跑一遍 —— 只测画错的那条,
 * 就照不出「把所有轮次一律画成失败」这种把 bug 弄消失的改法。
 *
 * `buildTurnBlocks` 在这几例上**一直是对的**(改耗时之前的提交上逐条量过同样的数),
 * 这个文件是回归护栏,不是 bug 的落点。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { BuildTurnInput, ExecutionShell } from '../../../src/runtime/chat/contract';

const STARTED_AT = 1787844872191;
const ENDED_AT = 1787845003969;
/** 这一轮自己的跨度 = 2m 11s。真机壳头写的是 `202m 23s`,差在它跟着 `nowMs` 走。 */
const TURN_SPAN_MS = ENDED_AT - STARTED_AT;

/** 真机很久之后的「现在」—— 202 分钟那个数就是这么来的。 */
const NOW_LATER = 1787857000000;
/** 再晚一点的「现在」,用来照「秒数还在不在涨」。 */
const NOW_EVEN_LATER = NOW_LATER + 5 * 60_000;

/** b7b61e19 的 `events_json` 原样:带 `startedAt`、**没有** `tool_result` 的 `tool_use`。 */
const WITH_DANGLING_TOOL_USE: PersistedAgentEvent[] = [
  { kind: 'status', label: 'starting', detail: 'codex' },
  { kind: 'done_key', key: '42bcec4487e388e5' },
  { kind: 'status', label: 'initializing' },
  { kind: 'status', label: 'thinking' },
  { kind: 'thinking', text: '**Planning detailed typography article**' },
  { kind: 'text', text: '我会保留现有羊皮纸写作室与交互。' },
  {
    kind: 'tool_use',
    id: 'item_2',
    name: 'TodoWrite',
    input: {
      todos: [
        { content: '核对现有文稿结构与权威排版依据', status: 'pending' },
        { content: '撰写八节以上的中文排版长文', status: 'pending' },
      ],
    },
    startedAt: 1787844892886,
  },
  {
    kind: 'status',
    label: 'error',
    detail: 'daemon stream disconnected before run completed',
    code: 'GENERIC_DAEMON_DISCONNECT',
  },
] as unknown as PersistedAgentEvent[];

/** 65514d97 的 `events_json` 原样:一个工具调用都没有,真机上这条画对了。 */
const THINKING_ONLY: PersistedAgentEvent[] = [
  { kind: 'status', label: 'starting', detail: 'codex' },
  { kind: 'done_key', key: 'a10a46aad27fa38d' },
  { kind: 'status', label: 'initializing' },
  { kind: 'status', label: 'thinking' },
  { kind: 'status', label: 'warning', detail: 'Skill descriptions were shortened.' },
  { kind: 'thinking', text: '**Planning detailed article revision**' },
  { kind: 'status', label: 'error', detail: 'Run interrupted because the daemon restarted.' },
] as unknown as PersistedAgentEvent[];

const soleShell = (input: BuildTurnInput): ExecutionShell => {
  const shells = buildTurnBlocks(input).filter(
    (b): b is ExecutionShell => b.kind === 'shell',
  );
  expect(shells.length, '这几例都该只有一张壳').toBe(1);
  return shells[0]!;
};

const turn = (
  events: PersistedAgentEvent[],
  runStatus: BuildTurnInput['runStatus'],
  nowMs: number,
): BuildTurnInput => ({
  events,
  runStatus,
  startedAtMs: STARTED_AT,
  endedAtMs: ENDED_AT,
  nowMs,
});

describe('壳头 · 已经结束的一轮', () => {
  it('failed + 悬空的 tool_use —— 壳头是「运行失败」,不是「进行中」', () => {
    const shell = soleShell(turn(WITH_DANGLING_TOOL_USE, 'failed', NOW_LATER));
    expect(shell.status).toBe('failed');
    expect(shell.stopped, '失败不是「停住」那一档').toBe(false);
  });

  it('failed 的秒表停在轮次收尾,不跟着 `nowMs` 涨', () => {
    const early = soleShell(turn(WITH_DANGLING_TOOL_USE, 'failed', NOW_LATER));
    const late = soleShell(turn(WITH_DANGLING_TOOL_USE, 'failed', NOW_EVEN_LATER));
    // 真机症状是这个数每次量都更大(199m24s → 200m48s → 202m23s)。
    expect(late.elapsedMs, '「现在」往后走 5 分钟,已结束的一轮不能跟着涨').toBe(
      early.elapsedMs,
    );
    expect(early.elapsedMs, '读数就是这一轮自己的跨度 2m 11s').toBe(TURN_SPAN_MS);
    // 202 分钟那个数 = `nowMs - startedAtMs`,壳头绝不能出现它。
    expect(early.elapsedMs).not.toBe(NOW_LATER - STARTED_AT);
  });

  it('真机上画对的那条(只有 thinking)保持画对', () => {
    const shell = soleShell(turn(THINKING_ONLY, 'failed', NOW_LATER));
    expect(shell.status).toBe('failed');
    expect(shell.elapsedMs).toBe(TURN_SPAN_MS);
  });

  it('canceled 仍然是「进行中」+ 秒数停住(手动停止的设计规定,别改坏)', () => {
    const early = soleShell(turn(WITH_DANGLING_TOOL_USE, 'canceled', NOW_LATER));
    const late = soleShell(turn(WITH_DANGLING_TOOL_USE, 'canceled', NOW_EVEN_LATER));
    // 壳头读的是 `stopped` 那一支:状态词还是「进行中」,但不挂扫光、秒数不动。
    expect(early.status, '取消不是第四态,壳头状态保持 running').toBe('running');
    expect(early.stopped, '停住的旗标必须挂上').toBe(true);
    expect(late.elapsedMs, '停住之后秒数不许再涨').toBe(early.elapsedMs);
    expect(early.elapsedMs).toBe(TURN_SPAN_MS);
  });

  it('真的在跑的一轮 —— 仍然是「进行中」,秒数仍然在涨', () => {
    const early = soleShell({
      events: WITH_DANGLING_TOOL_USE,
      runStatus: 'running',
      startedAtMs: STARTED_AT,
      nowMs: NOW_LATER,
    });
    const late = soleShell({
      events: WITH_DANGLING_TOOL_USE,
      runStatus: 'running',
      startedAtMs: STARTED_AT,
      nowMs: NOW_EVEN_LATER,
    });
    expect(early.status).toBe('running');
    expect(early.stopped).toBe(false);
    // 这一条是防「把秒表整个关掉」把 bug 弄消失:活着的轮次必须继续走表。
    expect(late.elapsedMs!).toBeGreaterThan(early.elapsedMs!);
    expect(late.elapsedMs! - early.elapsedMs!).toBe(NOW_EVEN_LATER - NOW_LATER);
  });
});
