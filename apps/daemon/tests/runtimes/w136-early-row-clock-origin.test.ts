/**
 * 早期那一行必须**带着自己的计时起点**上屏 —— 不只是「有一行」,还要「在走秒」。
 *
 * 产品红线(2026-09-04):「调用前(流式传输时)就要显示在界面上**并开始计时**,
 * 绝对不能调用完了才出现在界面上」。
 *
 * W115 让路径一收尾就发 `tool_input_target`,W120 又给整份写下去的那一档补了
 * `tool_input_progress`(带 `startedAt`)。缝在两者之间:
 *
 *  · `Edit` / `MultiEdit` / `NotebookEdit` / `replace` **永远只有** `tool_input_target`
 *    —— 行数在途算不出来(`−M` 要等 `old_string` 数完),所以 `tool_input_progress`
 *    一条都不发。而 `tool_input_target` 不带 `startedAt`,`stampToolTiming` 也只认
 *    `tool_use` / `tool_in_flight` / `tool_result` 三种 —— 于是这一行**从头到尾没有
 *    起点**,`build-turn-blocks` 的 `spanElapsed(undefined, live)` 返回 null,
 *    行上那一格秒数是空的。文件名在,秒表不走。
 *  · 起点还决定**落定之后**那一行读多少秒:`dropSupersededInFlightToolUses` 把早期
 *    形态的 `startedAt` 搬给结算行,没有可搬的就退回 `emitAgentEvent` 出口盖的时刻
 *    —— 那是**入参传完**的一刻,整段流式传输(真机实测 94.1 秒)被排除在外,行上
 *    只剩落盘那 0.1 秒。用户报的正是这个:「跑了 59.5s 屏幕上什么都没有,
 *    结束后蹦出一行 0.1s」。
 *
 * ── 真机量到的头程(2026-09-04,claude 2.1.260,27458 字节入参)──────────
 *
 *   content_block_start(tool_use Write)  +25.2s
 *   file_path 可证完整                    +25.5s   ← 早期那一行能上屏的时刻
 *   content_block_stop                    +121.8s  ← 现在才上屏
 *                                         ------
 *   头程                                  96.3s
 *
 * 所以起点必须是 `content_block_start` 那一刻,不是路径扫出来那一刻,也不是入参
 * 传完那一刻。三者在这次真实调用里差着 0.2 秒和 96 秒。
 *
 * 语料沿用 W120 那一套:三种帧的外壳从真录音里原样读出来复用,只换载荷。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createClaudeStreamHandler } from '../../src/runtimes/claude-stream.js';
import { stampToolTiming } from '../../src/runtimes/tool-timing.js';

type Event = Record<string, unknown>;
type Frame = Record<string, unknown>;

const SINGLE_TURN = 'claude-2.1.259-partial-single-turn.jsonl';

function readRecording(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/claude-cli-recordings/${name}`, import.meta.url)),
    'utf8',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 真录音里那三种帧的原样外壳 + 量到的分片长度(和 W120 同一条取法)。 */
function realEnvelope(): { start: Frame; delta: Frame; stop: Frame; fragmentLengths: number[] } {
  const frames = readRecording(SINGLE_TURN)
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Frame);

  let start: Frame | null = null;
  let delta: Frame | null = null;
  let stop: Frame | null = null;
  const fragmentLengths: number[] = [];
  let inToolBlock = false;

  for (const frame of frames) {
    if (frame.type !== 'stream_event' || !isRecord(frame.event)) continue;
    const inner = frame.event;
    if (
      inner.type === 'content_block_start' &&
      isRecord(inner.content_block) &&
      inner.content_block.type === 'tool_use'
    ) {
      start = frame;
      inToolBlock = true;
      continue;
    }
    if (!inToolBlock) continue;
    if (inner.type === 'content_block_delta' && isRecord(inner.delta)) {
      if (inner.delta.type !== 'input_json_delta') continue;
      delta ??= frame;
      const partial = inner.delta.partial_json;
      if (typeof partial === 'string' && partial.length > 0) fragmentLengths.push(partial.length);
      continue;
    }
    if (inner.type === 'content_block_stop') {
      stop = frame;
      inToolBlock = false;
    }
  }

  expect(start, '录音里没有 tool_use 的 content_block_start —— 外壳取不到').not.toBeNull();
  expect(delta, '录音里没有 input_json_delta —— 外壳取不到').not.toBeNull();
  expect(stop, '录音里没有 content_block_stop —— 外壳取不到').not.toBeNull();
  expect(fragmentLengths.length, '录音里一个非空分片都没有').toBeGreaterThan(3);

  return { start: start!, delta: delta!, stop: stop!, fragmentLengths };
}

function chunkLikeRecording(json: string, lengths: number[]): string[] {
  const out: string[] = [];
  let i = 0;
  let k = 0;
  while (i < json.length) {
    const size = lengths[k % lengths.length]!;
    out.push(json.slice(i, i + size));
    i += size;
    k += 1;
  }
  return out;
}

const BLOCK_START_AT = 1_788_000_000_000;
/** 每一帧推进的墙钟。真机那次入参传了 94 秒,这里用同一个量级的假时钟。 */
const TICK_MS = 1_000;

interface Replay {
  events: Event[];
  /** `content_block_start` 被处理的那一刻 —— 早期那一行该有的起点。 */
  blockStartAt: number;
  /** 入参传完(`content_block_stop`)的那一刻。 */
  argumentsClosedAt: number;
}

/**
 * 用真录音的外壳跑一次调用,每帧推进一格假时钟,并且让每条事件都经过
 * `stampToolTiming` —— 那是 daemon 的**唯一出口**,任何「出口会补上」的说法都必须
 * 在这里成立,不能靠断言里另外补一次。
 */
function replay(options: {
  toolName: string;
  args: Record<string, unknown>;
}): Replay {
  const envelope = realEnvelope();
  const fragments = chunkLikeRecording(JSON.stringify(options.args), envelope.fragmentLengths);

  let clock = BLOCK_START_AT - TICK_MS;
  const now = () => clock;

  const events: Event[] = [];
  const handler = createClaudeStreamHandler(
    (event) => {
      stampToolTiming(event, { now });
      events.push(event as Event);
    },
    { now },
  );

  const withToolName = (frame: Frame): Frame => {
    const clone = structuredClone(frame) as Frame;
    const inner = clone.event as Record<string, unknown>;
    (inner.content_block as Record<string, unknown>).name = options.toolName;
    (inner.content_block as Record<string, unknown>).input = {};
    return clone;
  };
  const withFragment = (frame: Frame, partial: string): Frame => {
    const clone = structuredClone(frame) as Frame;
    const inner = clone.event as Record<string, unknown>;
    (inner.delta as Record<string, unknown>).partial_json = partial;
    return clone;
  };

  clock += TICK_MS;
  const blockStartAt = clock;
  handler.feed(`${JSON.stringify(withToolName(envelope.start))}\n`);
  for (const fragment of fragments) {
    clock += TICK_MS;
    handler.feed(`${JSON.stringify(withFragment(envelope.delta, fragment))}\n`);
  }
  clock += TICK_MS;
  const argumentsClosedAt = clock;
  handler.feed(`${JSON.stringify(envelope.stop)}\n`);
  handler.flush();

  return { events, blockStartAt, argumentsClosedAt };
}

const targetsOf = (events: Event[]): Event[] =>
  events.filter((event) => event.type === 'tool_input_target');
const progressOf = (events: Event[]): Event[] =>
  events.filter((event) => event.type === 'tool_input_progress');
const toolUseOf = (events: Event[]): Event[] =>
  events.filter((event) => event.type === 'tool_use');

/** 一段长到肉眼能看出「还在传」的入参。 */
const LONG = 'a\nb\nc\n'.repeat(700);

describe('W136 · 早期那一行的计时起点', () => {
  describe('Edit 那一档:只有 tool_input_target,也必须能走秒', () => {
    it('tool_input_target 带得动的起点', () => {
      const { events } = replay({
        toolName: 'Edit',
        args: { file_path: '/repo/page.html', old_string: LONG, new_string: 'y' },
      });

      const targets = targetsOf(events);
      expect(targets, 'Edit 连早期那一行都没有 —— 前提就不成立了').toHaveLength(1);
      expect(
        progressOf(events),
        'Edit 不该有行数事件(−M 在途算不出来),前提变了就得重写这一单',
      ).toHaveLength(0);

      expect(
        typeof targets[0]!.startedAt,
        '早期那一行没有起点 —— 行上有文件名,秒表不走(spanElapsed(undefined) === null)',
      ).toBe('number');
    });

    it('起点是块开始那一刻,不是路径扫出来那一刻', () => {
      const { events, blockStartAt } = replay({
        toolName: 'Edit',
        args: { file_path: '/repo/page.html', old_string: LONG, new_string: 'y' },
      });
      const target = targetsOf(events)[0]!;
      expect(
        target.startedAt,
        '起点盖在路径扫出来那一刻 —— 真机那次这两者差 0.2s,但块开始才是「这次调用开始了」',
      ).toBe(blockStartAt);
    });

    it('起点排在入参传完之前 —— 否则整段流式传输不计入耗时', () => {
      const { events, argumentsClosedAt } = replay({
        toolName: 'Edit',
        args: { file_path: '/repo/page.html', old_string: LONG, new_string: 'y' },
      });
      const target = targetsOf(events)[0]!;
      expect(typeof target.startedAt).toBe('number');
      expect(
        (target.startedAt as number) < argumentsClosedAt,
        '早期起点不早于入参传完 —— 那就等于没有头程,行上只会剩落盘那零点几秒',
      ).toBe(true);
      // 真机那次头程 94.1 秒;这里至少要看得见「很长一段」而不是几毫秒。
      expect(argumentsClosedAt - (target.startedAt as number)).toBeGreaterThan(10_000);
    });
  });

  describe('Write 那一档:一次调用只有一个起点', () => {
    it('target 与 progress 报的是同一个起点', () => {
      const { events } = replay({
        toolName: 'Write',
        args: { file_path: '/repo/page.html', content: LONG },
      });

      const target = targetsOf(events)[0];
      const progress = progressOf(events);
      expect(target, 'Write 没发早期那一行').toBeTruthy();
      expect(progress.length, 'Write 没发行数 —— 前提变了').toBeGreaterThan(2);

      const origins = new Set<unknown>([
        target!.startedAt,
        ...progress.map((event) => event.startedAt),
      ]);
      expect(
        origins.size,
        `同一次调用报了多个起点:${JSON.stringify([...origins])} —— 行上的秒数会被按回去`,
      ).toBe(1);
    });
  });

  describe('结算那一行的起点仍归出口盖(不改既有语义)', () => {
    /**
     * 这一条不是要改 `tool_use` —— 它照旧由 `emitAgentEvent` 在入参传完时盖。
     * 把两个起点搬到一起的是客户端的 `dropSupersededInFlightToolUses`;这里只钉住
     * 「daemon 确实给了它一个更早的可搬起点」,否则客户端无从搬起。
     */
    it('tool_use 的起点晚于早期那一行的起点', () => {
      const { events } = replay({
        toolName: 'Edit',
        args: { file_path: '/repo/page.html', old_string: LONG, new_string: 'y' },
      });
      const target = targetsOf(events)[0]!;
      const settled = toolUseOf(events)[0];
      expect(settled, '没有结算行').toBeTruthy();
      expect(typeof settled!.startedAt).toBe('number');
      expect(
        (settled!.startedAt as number) > (target.startedAt as number),
        '结算行的起点没有晚于早期起点 —— 那客户端搬不搬都一样,这一单测不到东西',
      ).toBe(true);
    });
  });
});
