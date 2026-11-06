/**
 * 在途那一行不能只有一个秒表 —— **写了多少行要一边写一边长**。
 *
 * W115 让路径一收尾就发一条 `tool_input_target`,于是行上有了文件名。但那条只发
 * 一次,之后 140 秒里那一行是**静止**的:一个文件名 + 一个秒数,看不出还在不在长。
 * 产品 2026-09-03 的原话是「写入的行数能否动态增加,外加一个增长的计时?」。
 *
 * 这一单守两条硬约束:
 *
 *  1. **行数口径必须和落定后完全一致。** 落定那一行的 `+N` 由
 *     `apps/web/src/runtime/chat/format.ts` 的 `diffStat` 算出,Write 走的是
 *     `content.split('\n').length`(注意:结尾换行会多算一行,空串算 1 行)。
 *     在途必须用同一条规则,否则 `tool_use` 落地时数字会跳 —— 那比不显示更糟。
 *     web 那半边直接拿真的 `diffStat` 对照,见
 *     `apps/web/tests/components/chat/w120-inflight-write-line-count.test.tsx`。
 *  2. **原始入参仍然一个字节都不出 daemon。** 计数事件只发数字。
 *
 * ── 语料:真录音的**外壳**,加大的**载荷** ──────────────────────────────
 *
 * `../fixtures/claude-cli-recordings/` 里六份都是真 CLI 2.1.259 的逐字节 stdout,
 * **不要拿手搭夹具替换它们**。但这一单要看的是「行数在长」,而那六份录音里最大的
 * 一次 `Write` 只有 **55 字节 / 1 行**(下面第一条断言把这个前提钉死)—— 一行的
 * 文件从头到尾都是 1,增长在现有语料里**根本看不见**。
 *
 * 所以长写入的场景这样搭:`content_block_start` / `input_json_delta` /
 * `content_block_stop` 三种帧的外壳**从录音里读出来原样复用**(`realEnvelope()`
 * 会先断言自己确实读到了那三帧),只把 `partial_json` 的载荷换成一份更大的**真实
 * 字节** —— 用的是录音文件自己的文本,所以引号、反斜杠、`\n` 转义全都是真的。
 * 分片长度也照录音里量到的那一串循环取。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createClaudeStreamHandler } from '../../src/runtimes/claude-stream.js';
import { daemonAgentPayloadToPersistedAgentEvent } from '../../src/runtimes/chat-run-messages.js';

type Event = Record<string, unknown>;
type Frame = Record<string, unknown>;

const SINGLE_TURN = 'claude-2.1.259-partial-single-turn.jsonl';
const NO_PARTIAL = 'claude-2.1.259-no-partial-messages.jsonl';

function readRecording(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/claude-cli-recordings/${name}`, import.meta.url)),
    'utf8',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 从录音里取出一个流式 `tool_use` 内容块的三种帧的**原样外壳**,以及录音里量到的
 * 分片长度。任何一样取不到就当场红 —— 这是「外壳是真的」这句话的凭据。
 */
function realEnvelope(): {
  start: Frame;
  delta: Frame;
  stop: Frame;
  fragmentLengths: number[];
} {
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

/** 把一串 JSON 按录音里量到的分片长度循环切开。 */
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

interface Replay {
  events: Event[];
  fragments: number;
  argumentJson: string;
}

/**
 * 用录音的外壳跑一次写文件调用。`content` 是要写进去的正文,`toolName` 决定这是
 * 哪一类工具,`extraArgs` 用来构造 `Edit` 这种带新旧串的入参。
 */
function replayWrite(options: {
  toolName?: string;
  path?: string | null;
  content?: string | null;
  extraArgs?: Record<string, unknown>;
  closeArguments?: boolean;
  now?: () => number;
}): Replay {
  const {
    toolName = 'Write',
    path = '/repo/scratchpad/w120.html',
    content = null,
    extraArgs = {},
    closeArguments = true,
  } = options;
  const envelope = realEnvelope();

  const args: Record<string, unknown> = {};
  if (path !== null) args.file_path = path;
  if (content !== null) args.content = content;
  Object.assign(args, extraArgs);

  const full = JSON.stringify(args);
  /*
   * 入参没写完的那一档:从**正文中间**砍断(不是只砍掉收尾的 `}` —— 那样正文那个
   * 字符串还是收了尾的,补报会照常发生,测不出取消),并且**不发**
   * `content_block_stop`。这就是 run 被取消时流的样子。
   */
  const argumentJson = closeArguments ? full : full.slice(0, Math.floor(full.length * 0.6));
  const fragments = chunkLikeRecording(argumentJson, envelope.fragmentLengths);

  const events: Event[] = [];
  const handler = createClaudeStreamHandler(
    (event) => events.push(event as Event),
    options.now ? { now: options.now } : {},
  );

  const withToolName = (frame: Frame): Frame => {
    const clone = structuredClone(frame) as Frame;
    const inner = clone.event as Record<string, unknown>;
    (inner.content_block as Record<string, unknown>).name = toolName;
    (inner.content_block as Record<string, unknown>).input = {};
    return clone;
  };
  const withFragment = (frame: Frame, partial: string): Frame => {
    const clone = structuredClone(frame) as Frame;
    const inner = clone.event as Record<string, unknown>;
    (inner.delta as Record<string, unknown>).partial_json = partial;
    return clone;
  };

  handler.feed(`${JSON.stringify(withToolName(envelope.start))}\n`);
  for (const fragment of fragments) {
    handler.feed(`${JSON.stringify(withFragment(envelope.delta, fragment))}\n`);
  }
  if (closeArguments) handler.feed(`${JSON.stringify(envelope.stop)}\n`);
  handler.flush();

  return { events, fragments: fragments.length, argumentJson };
}

const progressOf = (events: Event[]): Event[] =>
  events.filter((event) => event.type === 'tool_input_progress');
const linesOf = (events: Event[]): number[] => progressOf(events).map((e) => Number(e.lines));

/** 落定那一行的 `+N`:`format.ts` 的 `diffStat`,Write 分支逐字同一条规则。 */
const settledAddedLines = (content: string): number => content.split('\n').length;

/**
 * 长写入用的正文:**录音文件自己的字节**。真引号、真反斜杠、真换行转义,
 * 而且行与行之间隔着几百字节 —— 用来照口径和转义。
 */
const LONG_CONTENT = readRecording(SINGLE_TURN);

/**
 * 密集换行的正文:**按真机那一次的形状造** —— 27.6KB / 734 行的 HTML 页面
 * (issue 里那次「写了 140 秒,行上只有一个秒表」的就是它)。
 *
 * 为什么非要它:`LONG_CONTENT` 是 JSONL,一行好几百字节,靠「行数得变过」这一条
 * 就已经把事件量压下来了 —— 拿它去测节流,**把字节步长整个删掉照样绿**。真实的
 * HTML 平均三十几个字符一行,而分片本身就是三十几个字符,于是**几乎每个分片都跨过
 * 一个换行**:没有字节步长的话,计数事件会和分片数一样多(约 700 条),正好是这一
 * 单要防的「把心跳变成广播」。仓库里没有一份多行写入的录音(上面「前提」那条把这个
 * 事实钉死了),所以这一份只能造 —— 造的只有**载荷**,外壳仍旧是录音里读出来的。
 */
const DENSE_CONTENT = ((): string => {
  const rows: string[] = [];
  for (let i = 0; i < 733; i += 1) {
    rows.push(`      <div class="card" data-i="${String(i).padStart(4, '0')}">`);
  }
  return `${rows.join('\n')}\n`;
})();

describe('W120 · 在途写文件行的行数', () => {
  describe('前提', () => {
    /**
     * 防真空:先证明「量法看得见缺陷」。录音里最大的一次 `Write` 只有 1 行,
     * 所以「行数在长」这件事在现有语料里从头到尾都是常数 1 —— 长写入的场景
     * 必须自己搭载荷,这条断言就是那个决定的凭据。哪天录进来一份多行的写入,
     * 这条会红,那时应该把语料换成它。
     */
    it('录音里最大的一次 Write 只有 1 行 —— 增长在现有语料里看不见', () => {
      let biggest = 0;
      const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        const rec = node as Record<string, unknown>;
        if (rec.type === 'tool_use' && isRecord(rec.input) && typeof rec.input.content === 'string') {
          biggest = Math.max(biggest, settledAddedLines(rec.input.content));
        }
        for (const key of Object.keys(rec)) walk(rec[key]);
      };
      for (const name of [
        SINGLE_TURN,
        'claude-2.1.259-partial-two-turns.jsonl',
        'claude-2.1.259-partial-same-turn-echo.jsonl',
        'claude-2.1.259-no-partial-two-turns.jsonl',
      ]) {
        for (const line of readRecording(name).split('\n')) {
          if (!line.trim()) continue;
          walk(JSON.parse(line));
        }
      }
      expect(biggest).toBe(1);
    });

    /** 长写入语料本身得够长,不然下面几条测的是空气。 */
    it('长写入语料有几十行、上千个分片', () => {
      const replay = replayWrite({ content: LONG_CONTENT });
      expect(settledAddedLines(LONG_CONTENT)).toBeGreaterThan(20);
      expect(replay.fragments).toBeGreaterThan(500);
    });
  });

  describe('增长', () => {
    it('入参还在流的过程中,行数变过至少两次且单调不减', () => {
      const { events } = replayWrite({ content: LONG_CONTENT });
      const lines = linesOf(events);

      expect(lines.length, '一条计数事件都没有 —— 行上还是静止的').toBeGreaterThan(2);
      const distinct = new Set(lines);
      expect(distinct.size, `行数从头到尾没变过:${JSON.stringify(lines.slice(0, 5))}`)
        .toBeGreaterThanOrEqual(3);
      for (let i = 1; i < lines.length; i += 1) {
        expect(lines[i]!, `第 ${i} 条计数比上一条小了(${lines[i - 1]} → ${lines[i]})`)
          .toBeGreaterThanOrEqual(lines[i - 1]!);
      }
    });

    /**
     * ⚠️ 最关键的一条:**结尾不许跳数字**。在途报的最后一个行数,必须等于落定后
     * `diffStat` 从 `tool_use.input.content` 算出来的 `+N`。差一行都不行 ——
     * 用户会看见数字在最后一刻蹦一下,那比全程不显示更糟。
     */
    it('在途最后一个行数 == 落定后的 +N', () => {
      for (const content of [LONG_CONTENT, 'a\nb\nc', 'a\nb\nc\n', '', 'single line']) {
        const { events } = replayWrite({ content });
        const lines = linesOf(events);
        const toolUse = events.find((event) => event.type === 'tool_use');
        const settled = (toolUse?.input as Record<string, unknown> | undefined)?.content;

        expect(typeof settled, '录制流没有落定成 tool_use').toBe('string');
        expect(lines.length, `content=${JSON.stringify(content.slice(0, 20))}: 没有任何计数`)
          .toBeGreaterThan(0);
        expect(
          lines[lines.length - 1],
          `content=${JSON.stringify(content.slice(0, 20))}: 在途最后一个行数和落定对不上`,
        ).toBe(settledAddedLines(String(settled)));
      }
    });
  });

  describe('节流', () => {
    /** 语料本身得是密集换行的,否则下面那条测的是空气(见 `DENSE_CONTENT` 的注释)。 */
    it('前提:密集语料几乎每个分片都跨过一个换行', () => {
      expect(settledAddedLines(DENSE_CONTENT)).toBe(734);
      expect(DENSE_CONTENT.length).toBeGreaterThan(26_000);
      expect(DENSE_CONTENT.length).toBeLessThan(29_000);
      const { fragments } = replayWrite({ content: DENSE_CONTENT });
      // 分片数和行数同一个量级 = 不靠字节步长就压不下来
      expect(fragments).toBeGreaterThan(600);
    });

    /**
     * 每来一个 delta 就发一条计数 = 把心跳变成广播。跑一遍那份 27.6KB 的页面,
     * 计数事件数必须远小于 delta 帧数。两个具体数字打在失败信息里,回归时一眼
     * 看得出退化。
     */
    it('计数事件数远小于 delta 帧数', () => {
      for (const [label, content] of [
        ['27.6KB / 734 行的页面', DENSE_CONTENT],
        ['录音自己的字节', LONG_CONTENT],
      ] as const) {
        const { events, fragments } = replayWrite({ content });
        const counts = progressOf(events).length;

        expect(counts, `${label}: 一条计数都没有`).toBeGreaterThan(2);
        expect(
          counts * 5,
          `${label}:节流没生效 —— ${fragments} 个分片发了 ${counts} 条计数`,
        ).toBeLessThan(fragments);
      }
    });
  });

  describe('反向', () => {
    it('Bash / Grep 不发计数', () => {
      for (const [toolName, args] of [
        ['Bash', { command: 'cat > /repo/login.html <<ODEOF\nline\nline\nODEOF\n' }],
        ['Grep', { pattern: 'foo', path: '/repo/src' }],
      ] as const) {
        const { events } = replayWrite({
          toolName,
          path: null,
          content: null,
          extraArgs: args as Record<string, unknown>,
        });
        expect(progressOf(events), `${toolName} 也发了计数`).toHaveLength(0);
      }
    });

    /**
     * `Edit` / `MultiEdit` 落定后是 `+N −M`。`−M` 要 `old_string` 数完才知道,
     * 在途给不出来 —— 那就**一半都不显示**,绝不拿 0 冒充。这条钉的是「不许只报
     * 一半」,不是「Edit 永远没有在途反馈」:文件名照旧由 W115 的 target 给。
     */
    it('Edit 不发计数(−M 在途算不出来,不许填 0 冒充)', () => {
      const { events } = replayWrite({
        toolName: 'Edit',
        extraArgs: { old_string: 'a\nb\nc', new_string: 'x\ny\nz\nw' },
        content: null,
      });
      expect(events.some((event) => event.type === 'tool_input_target')).toBe(true);
      expect(progressOf(events), 'Edit 报了半个改动量').toHaveLength(0);
    });

    /**
     * ⚠️ 上面那条只证明「Edit 的真实入参里没有 `content`」,证不了那份工具名单本身
     * 在守什么。这条直接顶着名单打:**同样带一个 `content` 键**喂给写文件家族里
     * 除 `Write` / `write_file` 之外的每一个,一条计数都不许发。
     *
     * 为什么这一条必须存在:`diffStat` 只有 `write` / `write_file` 那一支会从
     * `content` 数行,其余的一律返回 `null` —— 也就是**落定后那一行根本不显示改动量**。
     * 名单一旦放宽,在途会长出一个 `+N −0`,落定时整格消失,比不显示更糟。
     * 名单里多塞一个名字,这条就红。
     */
    it('只有 Write / write_file 会数行:同样带 content 的其他写文件工具一条都不发', () => {
      for (const toolName of ['Edit', 'MultiEdit', 'NotebookEdit', 'replace']) {
        const { events } = replayWrite({ toolName, content: 'a\nb\nc\nd\ne\nf\ng' });
        expect(
          events.some((event) => event.type === 'tool_input_target'),
          `${toolName}: 连文件名都没发 —— 这条测的就不是计数`,
        ).toBe(true);
        expect(
          progressOf(events),
          `${toolName} 报了行数,可它落定后 diffStat 给的是 null —— 那一格会凭空消失`,
        ).toHaveLength(0);
      }
    });

    /** 路径没收尾时什么都不显示 —— 现状不变,计数也不许抢跑。 */
    it('路径没收尾时不发计数', () => {
      const envelope = realEnvelope();
      const events: Event[] = [];
      const handler = createClaudeStreamHandler((event) => events.push(event as Event));
      const withFragment = (partial: string): Frame => {
        const clone = structuredClone(envelope.delta) as Frame;
        const inner = clone.event as Record<string, unknown>;
        (inner.delta as Record<string, unknown>).partial_json = partial;
        return clone;
      };
      handler.feed(`${JSON.stringify(envelope.start)}\n`);
      // content 先到、路径还差半截:行数已经数得出来,但一个字都不许发
      for (const fragment of [
        '{"content": "alpha\\nbeta\\ngamma\\ndelta\\n',
        'epsilon\\nzeta\\n", "file_path": "/repo/la',
      ]) {
        handler.feed(`${JSON.stringify(withFragment(fragment))}\n`);
      }
      expect(progressOf(events), '路径还没收尾就把行数发出去了').toHaveLength(0);

      // 正向对照:同一条流里路径一收尾,行数立刻跟上 —— 证明上一条不是「永远不发」
      handler.feed(`${JSON.stringify(withFragment('te.html"}'))}\n`);
      handler.feed(`${JSON.stringify(envelope.stop)}\n`);
      const lines = linesOf(events);
      expect(lines.length, '路径收尾之后仍然一条计数都没有').toBeGreaterThan(0);
      expect(lines[lines.length - 1]).toBe(settledAddedLines('alpha\nbeta\ngamma\ndelta\nepsilon\nzeta\n'));
    });

    /**
     * ⚠️ 和 W115 同一条红线:**正文一个字节都不许出 daemon**。计数事件只带
     * 数字和那条已经发过一遍的路径。
     */
    it('计数事件里没有一个字节的正文', () => {
      const { events } = replayWrite({ content: LONG_CONTENT });
      const counts = progressOf(events);
      expect(counts.length).toBeGreaterThan(2);

      for (const event of counts) {
        expect(Object.keys(event).sort()).toEqual(
          ['id', 'lines', 'name', 'path', 'startedAt', 'type'].sort(),
        );
        const serialized = JSON.stringify(event);
        expect(serialized, '文件正文漏进计数事件了').not.toContain('partial_json');
        expect(serialized).not.toContain('content_block_delta');
        expect(serialized.length, '计数事件不该有几百字节').toBeLessThan(400);
      }
    });

    /**
     * run 在写到一半被取消:入参永远收不了尾,`content_block_stop` 也不会来。
     * 那就**停在最后报出来的那个数字**上 —— 不补一个假的收尾值,也不把没写完的
     * 那一份当成落定。行上留着的是「写到这儿的时候被停了」,那是实话。
     */
    it('写到一半被取消:停在最后一个数字上,不落定成 tool_use', () => {
      const { events } = replayWrite({ content: DENSE_CONTENT, closeArguments: false });
      const lines = linesOf(events);

      expect(lines.length, '取消前一条计数都没有').toBeGreaterThan(2);
      expect(
        lines[lines.length - 1],
        '取消时补出了一个收尾值 —— 那份正文根本没写完',
      ).toBeLessThan(settledAddedLines(DENSE_CONTENT));
      expect(
        events.filter((event) => event.type === 'tool_use'),
        '没写完的入参落定成了一次调用',
      ).toHaveLength(0);
    });

    it('没有 partial-messages 的录音里不发计数', () => {
      const events: Event[] = [];
      const handler = createClaudeStreamHandler((event) => events.push(event as Event));
      for (const line of readRecording(NO_PARTIAL).split('\n')) {
        if (!line.trim()) continue;
        handler.feed(`${line}\n`);
      }
      handler.flush();
      expect(progressOf(events)).toHaveLength(0);
      expect(events.filter((event) => event.type === 'tool_use').length).toBeGreaterThan(0);
    });
  });

  describe('不落库', () => {
    /**
     * 一次 27.6KB 的写入会发几十条计数。落库等于把同一次调用存几十遍,而且重开
     * 会话时那几十条都会各画一行 —— 和 `tool_input_target` 同一条理由,只是更狠。
     * 跑完之后同一份行数在 `tool_use.input.content` 里本来就有。
     *
     * ⚠️ 这条守的是**落库那张表的默认值**(认不出来的类型一律 `return null`),
     * 不是某一行显式的挡板 —— 显式写一行 `if (type === 'tool_input_progress')
     * return null` 撤掉之后这条照样绿,那行就是多余的,已经删掉了。会让它变红的
     * 是「有人给计数事件补了一条落库分支」,那正是要防的事。
     */
    it('计数事件不进落库', () => {
      expect(
        daemonAgentPayloadToPersistedAgentEvent({
          type: 'tool_input_progress',
          id: 'toolu_x',
          name: 'Write',
          path: '/repo/a.html',
          lines: 128,
          startedAt: 1,
        }),
        '计数事件落库了 —— 重开会话会看到几十行同一次写入',
      ).toBeNull();
    });
  });

  describe('计时起点', () => {
    /**
     * 秒数要在**客户端** tick,daemon 只给一个**不动的起点**。所以同一次调用的
     * 每一条计数事件必须带同一个 `startedAt` —— 每条各盖一个「现在」的话,
     * 行上的秒数会被一路按回 0。
     */
    it('同一次调用的所有计数事件共用一个 startedAt', () => {
      let clock = 1_787_809_851_233;
      const { events } = replayWrite({
        content: LONG_CONTENT,
        now: () => (clock += 250),
      });
      const stamps = progressOf(events).map((event) => event.startedAt);
      expect(stamps.length).toBeGreaterThan(2);
      expect(new Set(stamps).size, `startedAt 每条都在变:${JSON.stringify(stamps.slice(0, 4))}`).toBe(1);
      expect(typeof stamps[0]).toBe('number');
    });
  });
});
