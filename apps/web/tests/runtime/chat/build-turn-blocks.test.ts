import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import { isExpandable, isStruck } from '../../../src/runtime/chat/contract';
import type { ExecutionShell, ProseBlock, TodoSegment, ToolRow, TurnBlock } from '../../../src/runtime/chat/contract';

/* ── 事件构造 ─────────────────────────────────────────────── */

const text = (t: string): PersistedAgentEvent => ({ kind: 'text', text: t });
const thinking = (t = ''): PersistedAgentEvent => ({ kind: 'thinking', text: t });

function call(
  id: string,
  name: string,
  input: unknown,
  opts: { content?: string; isError?: boolean; startedAt?: number; completedAt?: number } = {},
): PersistedAgentEvent[] {
  const use: PersistedAgentEvent = opts.startedAt != null
    ? { kind: 'tool_use', id, name, input, startedAt: opts.startedAt }
    : { kind: 'tool_use', id, name, input };
  const res: PersistedAgentEvent = {
    kind: 'tool_result',
    toolUseId: id,
    content: opts.content ?? 'ok',
    isError: Boolean(opts.isError),
    ...(opts.completedAt != null ? { completedAt: opts.completedAt } : {}),
  };
  return [use, res];
}

const todo = (id: string, items: Array<[string, string]>): PersistedAgentEvent[] => ([
  { kind: 'tool_use', id, name: 'TodoWrite', input: { todos: items.map(([content, status]) => ({ content, status })) } },
]);

const shells = (blocks: TurnBlock[]): ExecutionShell[] =>
  blocks.filter((b): b is ExecutionShell => b.kind === 'shell');
const prose = (blocks: TurnBlock[]): ProseBlock[] =>
  blocks.filter((b): b is ProseBlock => b.kind === 'prose');
const tools = (items: readonly { kind: string }[]): ToolRow[] =>
  items.filter((i): i is ToolRow => i.kind === 'tool');
const texts = (items: readonly { kind: string }[]): string[] =>
  items.filter((i): i is { kind: 'text'; text: string } => i.kind === 'text').map((i) => i.text);
const todoRows = (items: readonly { kind: string }[]): Array<{ kind: 'todo'; segment: TodoSegment }> =>
  items.filter((i): i is { kind: 'todo'; segment: TodoSegment } => i.kind === 'todo');
const plans = (items: readonly { kind: string }[]): Array<{ kind: 'plan'; steps: string[] }> =>
  items.filter((i): i is { kind: 'plan'; steps: string[] } => i.kind === 'plan');


/** 严格索引下 `arr[i]` 是 `T | undefined`;测试里越界就是断言写错了,直接抛 */
function nth<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`fixture/assertion 越界:index ${i} of ${arr.length}`);
  return v;
}
const last = <T>(arr: readonly T[]): T => nth(arr, arr.length - 1);

const done = (runStatus: 'succeeded' | 'failed' | 'canceled' = 'succeeded') => ({ runStatus } as const);

/* ── 壳的出现与状态 ───────────────────────────────────────── */

describe('执行记录永远出现(D10)', () => {
  it('本轮第一条事件就开壳,哪怕它只是一条 status —— 空态先出来', () => {
    const blocks = buildTurnBlocks({ events: [{ kind: 'status', label: 'requesting' }] });
    expect(shells(blocks)).toHaveLength(1);
    expect(nth(shells(blocks), 0).items).toEqual([]);
    expect(nth(shells(blocks), 0).status).toBe('running');
  });

  /*
   * D10 原话是「空态先出来,不等任何 agent 信号」。
   * 2026-08-26 用户真机量到:第二、三轮每次都要空等一会儿才看到「进行中」——
   * 因为壳原来只挂在**第一条事件**上。现在跑起来那一刻就有壳。
   * 反过来,**跑完了还是空壳**就不留(B47:一行孤零零的「已完成」不说明任何事)。
   */
  it('还没有任何事件、但 run 在跑 → 立刻出一张空壳', () => {
    const out = buildTurnBlocks({ events: [], runStatus: 'running' });
    expect(shells(out)).toHaveLength(1);
    expect(nth(shells(out), 0).status).toBe('running');
  });

  it('跑完了还是空壳 → 不留', () => {
    expect(buildTurnBlocks({ events: [], ...done() })).toEqual([]);
  });

  it('plain 系整轮只有文本:话在壳外,空壳不留(2026-08-26 裁决 + B47)', () => {
    const blocks = buildTurnBlocks({ events: [text('好的,我来分析这个页面。')], ...done() });
    // 正文在壳外(落块裁决),壳里因此空着 —— 空壳跑完就不留
    expect(shells(blocks)).toHaveLength(0);
    expect(prose(blocks).map((p) => p.text)).toEqual(['好的,我来分析这个页面。']);
  });
});

describe('思考中靠事件不靠文字(S21 / W11)', () => {
  it('claude 的 thinking 全是空串,照样要让壳知道在想', () => {
    const blocks = buildTurnBlocks({ events: [thinking(''), thinking('')] });
    expect(nth(shells(blocks), 0).thinking).toBe(true);
    expect(nth(shells(blocks), 0).items).toEqual([]); // 空串不成段
  });

  it('正文一到就撤回思考中', () => {
    const blocks = buildTurnBlocks({ events: [thinking(''), text('先看一下目录。')] });
    expect(nth(shells(blocks), 0).thinking).toBe(false);
  });

  it('工具一到也撤回', () => {
    const blocks = buildTurnBlocks({ events: [thinking(''), ...call('t1', 'Read', { file_path: 'a.ts' })] });
    expect(nth(shells(blocks), 0).thinking).toBe(false);
  });
});

/* ── 工具行 ───────────────────────────────────────────────── */

describe('工具行(D3 / D23 / §2.2b)', () => {
  it('调用一发出就落行,结果没回来也落 —— D3 那条「没有执行中这一档」已作废', () => {
    /*
     * ⚠️ 这一条 2026-09-02 反过来了(OPEND-2419)。原来断言的是「没有结果就不落行」,
     * 依据是 D3。代价被真机量出来了:一次卡住 14.1 分钟的下载在界面上**完全不存在**,
     * 用户看到「转了 40 分钟什么都没出来」。
     * 产品裁决:「调用时不管成功没,都要立刻渲染,所有状态啥的东西都要尽快反应在界面上」。
     * 完整口径与反向对照在 `pending-tool-row.test.ts`。
     */
    const blocks = buildTurnBlocks({ events: [{ kind: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a.ts' } }] });
    const rows = tools(nth(shells(blocks), 0).items);
    expect(rows).toHaveLength(1);
    expect(nth(rows, 0).pending).toBe(true);
    // 反向对照:成对到达的那一条**不是** pending,两态确实分得开
    const settled = buildTurnBlocks({ events: call('t2', 'Read', { file_path: 'a.ts' }) });
    expect(nth(tools(nth(shells(settled), 0).items), 0).pending).toBe(false);
  });

  it('读文件:还原成读取 + 文件名', () => {
    const blocks = buildTurnBlocks({ events: call('t1', 'Bash', { command: 'cat 规格.md' }) });
    const row = nth(tools(nth(shells(blocks), 0).items), 0);
    expect(row.tool).toBe('read');
    expect(row.file?.label).toBe('规格.md');
  });

  it('搜索:带模式与命中数', () => {
    const blocks = buildTurnBlocks({
      events: call('t1', 'Bash', { command: 'grep -n "gap" a.css b.css' }, { content: 'a.css:1: gap\nb.css:4: gap' }),
    });
    const row = nth(tools(nth(shells(blocks), 0).items), 0);
    expect(row.tool).toBe('search');
    expect(row.pattern).toBe('gap');
    expect(row.hits).toBe(2);
  });

  it('写文件:带改动量', () => {
    const blocks = buildTurnBlocks({ events: call('t1', 'Write', { file_path: 'card.html', content: 'a\nb\nc' }) });
    expect(nth(tools(nth(shells(blocks), 0).items), 0).delta).toEqual({ added: 3, removed: 0 });
  });

  it('Bash 新建 / 改写 / 删除会带上文件目标,不再退化成执行命令', () => {
    const events = [
      ...call('w1', 'Bash', { command: `cat > card.html <<'EOF'\n<div/>\nEOF` }),
      ...call('e1', 'Bash', { command: `sed -i '' 's/old/new/' page.html` }),
      ...call('d1', 'Bash', { command: 'rm -f obsolete.html' }),
    ];
    const rows = tools(nth(shells(buildTurnBlocks({ events })), 0).items);
    expect(rows.map((row) => [row.tool, row.file?.label])).toEqual([
      ['write', 'card.html'],
      ['edit', 'page.html'],
      ['delete', 'obsolete.html'],
    ]);
  });

  it('复合 Bash 会找到 cd 后的读取 / 搜索目标', () => {
    const events = [
      ...call('r1', 'Bash', { command: `cd "$PWD" && sed -n '1,220p' page.html` }),
      ...call('s1', 'Bash', { command: `cd "$PWD" && rg -n 'TODO|FIXME' src` }, { content: 'src/a.ts:1:TODO' }),
    ];
    const rows = tools(nth(shells(buildTurnBlocks({ events })), 0).items);
    expect(rows[0]?.file?.label).toBe('page.html');
    expect(rows[1]?.pattern).toBe('TODO|FIXME');
  });

  it('两端时间都有才算耗时', () => {
    const blocks = buildTurnBlocks({ events: call('t1', 'Read', { file_path: 'a.ts' }, { startedAt: 1000, completedAt: 1400 }) });
    expect(nth(tools(nth(shells(blocks), 0).items), 0).elapsedMs).toBe(400);
  });

  it('调用与结果同批到达(codex)算出来的 0 毫秒当未知,不显示 0.0s', () => {
    const blocks = buildTurnBlocks({ events: call('t1', 'Bash', { command: 'ls' }, { startedAt: 1000, completedAt: 1004 }) });
    expect(nth(tools(nth(shells(blocks), 0).items), 0).elapsedMs).toBeNull();
  });

  it('缺时间戳的历史数据不显示耗时,也不报错', () => {
    const blocks = buildTurnBlocks({ events: call('t1', 'Bash', { command: 'ls' }) });
    expect(nth(tools(nth(shells(blocks), 0).items), 0).elapsedMs).toBeNull();
  });

  it('失败行标失败', () => {
    const blocks = buildTurnBlocks({ events: call('t1', 'Write', { file_path: 'dist/x.js' }, { isError: true, content: 'EACCES' }) });
    expect(nth(tools(nth(shells(blocks), 0).items), 0).failed).toBe(true);
  });
});

/* ── done 分界(D43,已被 2026-08-26 落块裁决收紧)──────────── */

/*
 * 裁决原话见 `specs/current/chat-panel-feedback.md` D 节:
 * **还没有 todo 时,普通正文落在壳外**;壳里只装工具调用和 thinking。
 *
 * 于是 D43 的「done 之前进壳、之后出壳」只在**有 todo 的阶段**还成立
 * (那时正文进的是「当前那条 todo」)。没有 todo 的轮次里,`<done/>` 不再改变
 * 正文的落点 —— 它仍然**分段**(标记两侧不合并成一段),但两侧都在壳外。
 *
 * 这条改动的由来:Codex 这类**从不发 `<done/>`** 的 agent,整轮的正文都被当成
 * 「过程叙述」吞进壳里,而壳默认是收起的 —— 用户跑真机时看到的就是这个。
 */
describe('done 之前正文一律在卡片里(2026-08-26 最终裁决)', () => {
  it('没发 done:正文和工具调用都在卡片里,最后一段回答被兜底提出来', () => {
    const blocks = buildTurnBlocks({ events: [text('我先看一下工作区里的规格文件。'), ...call('t1', 'Read', { file_path: 'a.md' })] });
    // 以工具收尾 → 没有可提的结论,那句话留在卡片里
    expect(prose(blocks)).toEqual([]);
    expect(texts(nth(shells(blocks), 0).items)).toEqual(['我先看一下工作区里的规格文件。']);
    expect(nth(shells(blocks), 0).items.some((i) => i.kind === 'tool')).toBe(true);
  });

  it('`<done/>` 是唯一的边界:之前那句在卡片里,之后那句在卡片外', () => {
    const blocks = buildTurnBlocks({
      events: [text('先看目录。'), text('<done/>两页都好了,商品卡已抽成组件。')],
      ...done(),
    });
    expect(prose(blocks).map((p) => p.text)).toEqual(['两页都好了,商品卡已抽成组件。']);
    expect(texts(nth(shells(blocks), 0).items)).toEqual(['先看目录。']);
  });

  it('标记被流式切成两半也认得出来,且不会闪出半截标签', () => {
    const blocks = buildTurnBlocks({ events: [text('先看目录。<do'), text('ne/>结论在这里。')], ...done() });
    expect(prose(blocks).map((p) => p.text)).toEqual(['结论在这里。']);
    expect(texts(nth(shells(blocks), 0).items)).toEqual(['先看目录。']);
  });

  it('意图澄清表单是**隐式 done**:表单整段留在壳外,之前那句留在卡片里', () => {
    const blocks = buildTurnBlocks({
      events: [text('我先确认两个关键点。'), text('<question-form title="确认">{}</question-form>')],
      ...done(),
    });
    expect(prose(blocks).some((b) => b.text.includes('<question-form'))).toBe(true);
    expect(texts(nth(shells(blocks), 0).items)).toEqual(['我先确认两个关键点。']);
  });

  /**
   * 表单是**隐式 done**,流式期间也一样 —— 从 `<question-form` 起的那一截必须立刻
   * 出现在壳外,消息层才看得见「有一张还没闭合的表单」并摆出加载框。
   */
  it('流式中途表单还没闭合:从 `<question-form` 起的那一截立刻进壳外', () => {
    const blocks = buildTurnBlocks({
      events: [text('One quick check:\n<question-form id="discovery" title="Quick brief">\n{"questions":[')],
      runStatus: 'running',
    });
    expect(prose(blocks).some((b) => b.text.includes('<question-form'))).toBe(true);
  });

  /** 半截 `<question-` 不能闪出来,闭合后仍要整段在壳外 */
  it('表单标记被流式切成两半:半截不外泄,拼全后整段进壳外', () => {
    const first = buildTurnBlocks({ events: [text('先确认一下。<question-')], runStatus: 'running' });
    expect(first.some((b) => b.kind === 'prose' && b.text.includes('<question-'))).toBe(false);

    const both = buildTurnBlocks({
      events: [text('先确认一下。<question-'), text('form id="d">{"questions":[')],
      runStatus: 'running',
    });
    expect(prose(both).some((b) => b.text.includes('<question-form'))).toBe(true);
  });

  it('以工具收尾的轮次:没有可提的结论,卡外一条都不多出来', () => {
    const blocks = buildTurnBlocks({
      events: [text('改一下间距。'), ...call('t1', 'Edit', { file_path: 'a.css', old_string: 'x', new_string: 'y' })],
      ...done(),
    });
    expect(prose(blocks)).toEqual([]);
    expect(texts(nth(shells(blocks), 0).items)).toEqual(['改一下间距。']);
  });

  it('运行中同样在卡片里 —— 不等轮次结束才搬家', () => {
    const blocks = buildTurnBlocks({ events: [text('先看目录。')], runStatus: 'running' });
    expect(prose(blocks)).toEqual([]);
    expect(texts(nth(shells(blocks), 0).items)).toEqual(['先看目录。']);
  });
});

/* ── 清单与分段(D29 / D13 / D26 / D14 / D36)──────────────── */

describe('清单到达时的落块(D29)', () => {
  it('② 清单之前说过话、也干过活 → 仍然只有**一块**(2026-08-26 最终裁决)', () => {
    // 清单不再另起一张卡:卡外唯一会出现的内容是 done 之后的结论,而 TodoWrite
    // 必然在 done 之前 —— 分张的产物一定是两张紧贴的卡,读着像同一件事说了两遍。
    const blocks = buildTurnBlocks({
      events: [
        { kind: 'text', text: '我先看一眼现有的列表页。' },
        ...call('t1', 'Bash', { command: 'ls' }),
        ...todo('p1', [['复刻列表页', 'in_progress'], ['抽出商品卡', 'pending']]),
        ...call('t2', 'Write', { file_path: 'list.html', content: 'x' }),
      ],
      ...done(),
    });
    const all = shells(blocks);
    expect(all).toHaveLength(1);
    expect(nth(all, 0).items.map((i) => i.kind)).toEqual(['text', 'tool', 'plan', 'todo', 'todo']);
    expect(nth(all, 0).segments.map((s) => s.content)).toEqual(['复刻列表页', '抽出商品卡']);
  });

  it('⑤ 一上来就发清单 → 不留空壳,第一块本身就是清单卡(D13)', () => {
    const blocks = buildTurnBlocks({
      events: [...todo('p1', [['第一步', 'in_progress']]), ...call('t1', 'Bash', { command: 'ls' })],
      ...done(),
    });
    expect(shells(blocks)).toHaveLength(1);
  });

  it('③ 清单期间的工具与正文收进当前那条 todo', () => {
    const blocks = buildTurnBlocks({
      events: [
        ...todo('p1', [['复刻列表页', 'in_progress'], ['抽出商品卡', 'pending']]),
        text('先量一下列宽。'),
        ...call('t1', 'Bash', { command: 'grep -n gap a.css' }),
      ],
      ...done(),
    });
    const seg = nth(nth(shells(blocks), 0).segments, 0);
    expect(tools(seg.items)).toHaveLength(1);
    expect(texts(seg.items)).toEqual(['先量一下列宽。']);
  });

  it('一条 todo 关掉,后面的内容进下一条', () => {
    const blocks = buildTurnBlocks({
      events: [
        ...todo('p1', [['A', 'in_progress'], ['B', 'pending']]),
        ...call('t1', 'Bash', { command: 'ls' }),
        ...todo('p2', [['A', 'completed'], ['B', 'in_progress']]),
        ...call('t2', 'Bash', { command: 'pwd' }),
      ],
      ...done(),
    });
    const segs = nth(shells(blocks), 0).segments;
    const a = nth(segs, 0); const b = nth(segs, 1);
    expect(tools(a.items)).toHaveLength(1);
    expect(tools(b.items)).toHaveLength(1);
  });

  it('同一份清单反复推进不会多开卡片(D26)', () => {
    // 2026-08-26 最终裁决之后,一轮正常跑完就是**一张**卡;
    // 这里要钉的是「反复推进清单不会把它撑成多张」
    const blocks = buildTurnBlocks({
      events: [
        { kind: 'text', text: '先看一眼。' },
        ...call('t0', 'Bash', { command: 'ls' }),
        ...todo('p1', [['A', 'in_progress'], ['B', 'pending']]),
        ...todo('p2', [['A', 'completed'], ['B', 'in_progress']]),
        ...todo('p3', [['A', 'completed'], ['B', 'completed']]),
      ],
      ...done(),
    });
    expect(shells(blocks)).toHaveLength(1);
  });

  it('兜底 a:清单全部打完勾之后说的话算结论,回到壳外', () => {
    const blocks = buildTurnBlocks({
      events: [
        ...todo('p1', [['A', 'in_progress']]),
        ...call('t1', 'Bash', { command: 'ls' }),
        ...todo('p2', [['A', 'completed']]),
        text('都做完了,列表页已经能点。'),
      ],
      ...done(),
    });
    expect(prose(blocks).map((p) => p.text)).toEqual(['都做完了,列表页已经能点。']);
  });
});

describe('重新规划不开新壳(D14 / D15 / D16)', () => {
  it('内容完全不重叠的新清单 = 重新规划:旧的全划线转完成态,壳数不变', () => {
    const blocks = buildTurnBlocks({
      events: [
        ...todo('p1', [['按同一套间距做设置页', 'in_progress']]),
        ...call('t1', 'Bash', { command: 'diff a b' }),
        { kind: 'tool_use', id: 'ab1', name: 'todo_abandon', input: { reason: '两页栅格其实不一样,重新规划。' } },
        ...todo('p2', [['设置页单独一套间距', 'in_progress']]),
      ],
      ...done(),
    });
    const shell = nth(shells(blocks), 0);
    expect(shells(blocks)).toHaveLength(1);
    const old = shell.segments.find((s) => s.content === '按同一套间距做设置页');
    // 作废的那条已经不在 segments 里(被新清单替换),但作废理由按壳内纯文本落了下来
    expect(old).toBeUndefined();
    expect(texts(shell.items)).toContain('两页栅格其实不一样,重新规划。');
  });

  /*
   * OPEND-2594 —— 和上面那条**配成一对**:上面是「完全不重叠」,这条是**部分重叠**。
   *
   * agent 把一条粗步骤拆成两条、其余原样重发,新旧快照有交集,于是走 D26
   * 那条「同一份清单在推进」的路。而那条路只会**追加**新内容、**改**见过的状态,
   * 从旧快照里消失的那几条一行代码都没人动 —— 原地留着「未开始」。
   *
   * 结果:药丸读最新快照说「5 步」,正文读累积下来的行排出 6 条,当前那条在两边
   * 的名次对不上;同一张卡的「执行计划 · 5 步」下面挂着 6 行,自己跟自己打架。
   */
  it('部分重叠的新清单:消失的旧步骤作废划线,活着的行按最新快照排', () => {
    const blocks = buildTurnBlocks({
      events: [
        ...todo('p1', [['a', 'in_progress'], ['b', 'pending'], ['X-coarse', 'pending'], ['d', 'pending']]),
        ...call('t1', 'Bash', { command: 'ls' }),
        // 粗步骤 X-coarse 被拆成 X1 / X2,a·b·d 原样带过来
        ...todo('p2', [['a', 'completed'], ['b', 'completed'], ['X1', 'in_progress'], ['X2', 'pending'], ['d', 'pending']]),
      ],
      runStatus: 'running',
    });
    const shell = nth(shells(blocks), 0);
    const rows = todoRows(shell.items);
    const live = rows.filter((r) => !r.segment.abandoned);

    // ① 还算数的是最新快照那 5 条,不是新旧并起来的 6 条
    expect(live).toHaveLength(5);
    expect(shell.segments).toHaveLength(5);

    // ② 顺序跟最新快照走,不是插入顺序 —— 药丸和正文得指着同一条「当前」
    expect(live.map((r) => r.segment.content)).toEqual(['a', 'b', 'X1', 'X2', 'd']);
    expect(shell.segments.map((s) => s.content)).toEqual(['a', 'b', 'X1', 'X2', 'd']);

    // ③ 被拆掉的那条:作废 + 划线,行**留着**(沿用上面 D14 那条的做法)
    const gone = rows.find((r) => r.segment.content === 'X-coarse');
    expect(gone).toBeDefined();
    expect(gone?.segment.abandoned).toBe(true);
    expect(gone ? isStruck(gone.segment) : false).toBe(true);

    // ④ 同一张卡不许自相矛盾:「执行计划 · N 步」的 N 必须等于还算数的行数
    const plan = nth(plans(shell.items), 0);
    expect(plan.steps).toEqual(['a', 'b', 'X1', 'X2', 'd']);
    expect(plan.steps).toHaveLength(live.length);
  });
});

describe('隐式进行中(D36)—— codex 全靠这条', () => {
  it('清单里一条 in_progress 都没有时,第一条未完成的收内容', () => {
    const blocks = buildTurnBlocks({
      events: [
        ...todo('p1', [['锁定字体', 'pending'], ['实现新增', 'pending']]),
        ...call('t1', 'Bash', { command: 'ls' }),
      ],
      ...done(),
    });
    const segs = nth(shells(blocks), 0).segments;
    const first = nth(segs, 0); const second = nth(segs, 1);
    expect(first.implicit).toBe(true);
    expect(tools(first.items)).toHaveLength(1);
    expect(tools(second.items)).toHaveLength(0);
  });

  it('这条隐式的「进行中」在轮次里是真的进行中(跑完之后才收掉,见上)', () => {
    const blocks = buildTurnBlocks({
      events: [
        ...todo('p1', [['锁定字体', 'pending'], ['实现新增', 'pending']]),
        ...call('t1', 'Bash', { command: 'ls' }),
      ],
      runStatus: 'running',
    });
    expect(nth(nth(shells(blocks), 0).segments, 0).status).toBe('in_progress');
  });

  it('后续清单里它仍写 pending 也不退回去', () => {
    const blocks = buildTurnBlocks({
      events: [
        ...todo('p1', [['A', 'pending'], ['B', 'pending']]),
        ...call('t1', 'Bash', { command: 'ls' }),
        ...todo('p2', [['A', 'pending'], ['B', 'pending']]),
      ],
      runStatus: 'running',
    });
    expect(nth(nth(shells(blocks), 0).segments, 0).status).toBe('in_progress');
  });
});

/* ── 展开与划线(D25 / D35)────────────────────────────────── */

describe('能不能展开只看本轮有没有内容(D25 / D35)', () => {
  it('同一份清单里一次关掉、从没进行过的 todo:划线且不可展开', () => {
    const blocks = buildTurnBlocks({
      events: [
        ...todo('p1', [['A', 'in_progress'], ['B', 'pending'], ['C', 'pending']]),
        ...call('t1', 'Bash', { command: 'ls' }),
        ...todo('p2', [['A', 'completed'], ['B', 'completed'], ['C', 'completed']]),
      ],
      ...done(),
    });
    const segs = nth(shells(blocks), 0).segments;
    const a = nth(segs, 0); const b = nth(segs, 1);
    expect(isExpandable(a)).toBe(true);
    expect(isStruck(a)).toBe(false);
    expect(isExpandable(b)).toBe(false);
    expect(isStruck(b)).toBe(true);
  });

  it('上一轮就完成的召回条目:划线、不可展开', () => {
    const blocks = buildTurnBlocks({
      events: [...todo('p1', [['复刻列表页', 'completed'], ['抽出商品卡', 'in_progress']])],
      previousTodos: [{ content: '复刻列表页', status: 'completed' }],
      ...done(),
    });
    const recalled = nth(nth(shells(blocks), 0).segments, 0);
    expect(recalled.recalled).toBe(true);
    expect(isStruck(recalled)).toBe(true);
    expect(isExpandable(recalled)).toBe(false);
  });

  it('上一轮中断、本轮继续做的召回条目:仍划线但可展开,展开的是本轮新增', () => {
    const blocks = buildTurnBlocks({
      events: [
        ...todo('p1', [['抽出商品卡', 'in_progress']]),
        ...call('t1', 'Write', { file_path: 'card.html', content: 'x' }),
      ],
      previousTodos: [{ content: '抽出商品卡', status: 'in_progress' }],
      ...done(),
    });
    const seg = nth(nth(shells(blocks), 0).segments, 0);
    expect(seg.recalled).toBe(true);
    expect(isExpandable(seg)).toBe(true);
    expect(tools(seg.items)).toHaveLength(1);
  });
});

/* ── 轮次收尾 ─────────────────────────────────────────────── */

describe('收尾以 run 生命周期为准(D18 / B7 / W4)', () => {
  it('中断:壳不进第四种状态,只挂旗标;进行中的 todo 标停止', () => {
    const blocks = buildTurnBlocks({
      events: [...todo('p1', [['A', 'in_progress']]), ...call('t1', 'Bash', { command: 'ls' })],
      ...done('canceled'),
    });
    const shell = nth(shells(blocks), 0);
    expect(shell.stopped).toBe(true);
    expect(shell.status).toBe('running');
    expect(nth(shell.segments, 0).status).toBe('stopped');
  });

  it('整轮失败:壳头转运行失败(下面由报错卡接手)', () => {
    const blocks = buildTurnBlocks({
      events: [...call('t1', 'Bash', { command: 'npm run build' }, { isError: true })],
      ...done('failed'),
    });
    expect(nth(shells(blocks), 0).status).toBe('failed');
  });

  it('成功:壳转已完成', () => {
    const blocks = buildTurnBlocks({ events: [...call('t1', 'Bash', { command: 'ls' })], ...done() });
    expect(nth(shells(blocks), 0).status).toBe('done');
  });

  it('壳头耗时由工具两端的时间戳推出来', () => {
    const blocks = buildTurnBlocks({
      events: [
        ...call('t1', 'Bash', { command: 'ls' }, { startedAt: 1_000, completedAt: 1_500 }),
        ...call('t2', 'Bash', { command: 'pwd' }, { startedAt: 2_000, completedAt: 9_000 }),
      ],
      ...done(),
    });
    expect(nth(shells(blocks), 0).elapsedMs).toBe(8_000);
  });

  it('一条时间戳都没有就不显示耗时', () => {
    const blocks = buildTurnBlocks({ events: [...call('t1', 'Bash', { command: 'ls' })], ...done() });
    expect(nth(shells(blocks), 0).elapsedMs).toBeNull();
  });
});

describe('每轮只装本轮内容(D24)', () => {
  it('同一条工具调用不会出现两次', () => {
    const blocks = buildTurnBlocks({ events: [...call('t1', 'Bash', { command: 'ls' })], ...done() });
    const all = shells(blocks).flatMap((s) => tools(s.items).concat(s.segments.flatMap((x) => tools(x.items))));
    expect(all.filter((t) => t.id === 't1')).toHaveLength(1);
  });
});

/* ── 生图(组件 12)───────────────────────────────────────── */

describe('生图落行(D3 的唯一例外)', () => {
  const images = (items: readonly { kind: string }[]) =>
    items.filter((i): i is Extract<import('../../../src/runtime/chat/contract').ShellItem, { kind: 'image' }> => i.kind === 'image');

  const ok = (path: string) => JSON.stringify({ status: 'succeeded', path });
  const bad = () => JSON.stringify({ status: 'failed', error: { code: 'no_provider' } });

  it('要出几张是从命令里数出来的,不等结果', () => {
    // 调用还没回来 —— 换成别的工具这一行根本不该出现(D3),生图必须出
    const blocks = buildTurnBlocks({
      events: [{ kind: 'tool_use', id: 'g1', name: 'Bash', input: { command: 'od media generate a && od media generate b && od media generate c && od media generate d' } }],
    });
    const row = nth(images(nth(shells(blocks), 0).items), 0);
    expect(row.total).toBe(4);
    expect(row.done).toBe(0);
    expect(row.pending).toBe(true);
  });

  it('逐行读结果:出了几张、砸了几张、图在哪', () => {
    const blocks = buildTurnBlocks({
      events: call('g1', 'Bash', { command: 'od media generate x && od media generate y && od media generate z' },
        { content: [ok('a.png'), bad(), ok('b.png')].join('\n') }),
      ...done(),
    });
    const row = nth(images(nth(shells(blocks), 0).items), 0);
    expect([row.total, row.done, row.failed]).toEqual([3, 2, 1]);
    expect(row.thumbs).toEqual(['a.png', 'b.png']);
    expect(row.pending).toBe(false);
  });

  it('读取 od media generate 的真实成功 envelope', () => {
    const blocks = buildTurnBlocks({
      events: call('g1', 'Bash', { command: 'od media generate x' }, {
        content: JSON.stringify({ file: { name: 'actual-output.png', size: 42, kind: 'image', mime: 'image/png' } }),
      }),
      ...done(),
    });
    const row = nth(images(nth(shells(blocks), 0).items), 0);
    expect([row.done, row.failed, row.pending]).toEqual([1, 0, false]);
    expect(row.thumbs).toEqual(['actual-output.png']);
  });

  it('历史回放里结果被安全打码时,仍用调用入参还原已完成的生图行', () => {
    const blocks = buildTurnBlocks({
      events: call(
        'g1',
        'Bash',
        {
          command: '"$OD_NODE_BIN" "$OD_BIN" media generate --output e2e-image-1.png',
          file_path: 'e2e-image-1.png',
        },
        {
          content: '[REDACTED:acp_bash_output:509_chars]',
          startedAt: 1_000,
          completedAt: 3_600,
        },
      ),
      ...done(),
    });
    const shell = nth(shells(blocks), 0);
    const row = nth(images(shell.items), 0);
    expect(tools(shell.items)).toHaveLength(0);
    expect([row.total, row.done, row.failed, row.pending]).toEqual([1, 1, 0, false]);
    expect(row.thumbs).toEqual(['e2e-image-1.png']);
    expect(row.cells).toEqual([{ status: 'done', path: 'e2e-image-1.png' }]);
    expect(row.elapsedMs).toBe(2_600);
  });

  it('media task 是逐张状态真相,并保留失败格的实际顺序', () => {
    const blocks = buildTurnBlocks({
      events: [{
        kind: 'tool_use',
        id: 'g1',
        name: 'Bash',
        input: { command: 'od media generate a && od media generate b && od media generate c && od media generate d' },
      }],
      mediaTasks: [
        { taskId: 'm1', runId: 'run', status: 'done', surface: 'image', startedAt: 100, endedAt: 500, elapsed: 0, progress: [], progressCount: 0, file: { name: 'one.png' } },
        { taskId: 'm2', runId: 'run', status: 'failed', surface: 'image', startedAt: 200, endedAt: 600, elapsed: 0, progress: [], progressCount: 0, error: { message: 'failed' } },
        { taskId: 'm3', runId: 'run', status: 'running', surface: 'image', startedAt: 300, endedAt: null, elapsed: 0, progress: [], progressCount: 0 },
      ],
      runStatus: 'running',
    });
    const row = nth(images(nth(shells(blocks), 0).items), 0);
    expect([row.total, row.done, row.failed, row.pending]).toEqual([4, 1, 1, true]);
    expect(row.thumbs).toEqual(['one.png']);
    expect(row.cells).toEqual([
      { taskId: 'm1', status: 'done', path: 'one.png' },
      { taskId: 'm2', status: 'failed' },
      { taskId: 'm3', status: 'pending' },
      { status: 'pending' },
    ]);
  });

  it('terminal tool_use 到达前,每个未消费的运行中 task 都在当前 todo 里单独落一格', () => {
    const blocks = buildTurnBlocks({
      events: todo('todo-1', [['生成配套插图', 'in_progress']]),
      mediaTasks: [
        { taskId: 'm1', runId: 'run', status: 'running', surface: 'image', startedAt: 100, endedAt: null, elapsed: 0, progress: [], progressCount: 0 },
        { taskId: 'm2', runId: 'run', status: 'running', surface: 'image', startedAt: 200, endedAt: null, elapsed: 0, progress: [], progressCount: 0 },
      ],
      runStatus: 'running',
    });

    const segment = nth(nth(shells(blocks), 0).segments, 0);
    const rows = images(segment.items);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.id, row.total, row.done, row.failed, row.pending])).toEqual([
      ['media-task:m1', 1, 0, 0, true],
      ['media-task:m2', 1, 0, 0, true],
    ]);
    expect(rows.map((row) => row.cells)).toEqual([
      [{ taskId: 'm1', status: 'pending' }],
      [{ taskId: 'm2', status: 'pending' }],
    ]);
  });

  it('terminal tool_use 消费 task 后不再追加一条 task 占位行', () => {
    const blocks = buildTurnBlocks({
      events: [
        ...todo('todo-1', [['生成配套插图', 'in_progress']]),
        { kind: 'tool_use', id: 'g1', name: 'Bash', input: { command: 'od media generate a' } },
      ],
      mediaTasks: [
        { taskId: 'm1', runId: 'run', status: 'running', surface: 'image', startedAt: 100, endedAt: null, elapsed: 0, progress: [], progressCount: 0 },
      ],
      runStatus: 'running',
    });

    const segment = nth(nth(shells(blocks), 0).segments, 0);
    const rows = images(segment.items);
    expect(rows).toHaveLength(1);
    expect(nth(rows, 0).id).toBe('g1');
    expect(nth(rows, 0).cells).toEqual([{ taskId: 'm1', status: 'pending' }]);
  });

  it('命令已结束但后续 task 没创建时,未启动的格子也收敛为失败', () => {
    const blocks = buildTurnBlocks({
      events: call(
        'g1',
        'Bash',
        { command: 'od media generate a && od media generate b' },
        { content: JSON.stringify({ taskId: 'm1', status: 'failed', error: { message: 'provider failed' } }) },
      ),
      mediaTasks: [
        { taskId: 'm1', runId: 'run', status: 'failed', surface: 'image', startedAt: 100, endedAt: 200, elapsed: 0, progress: [], progressCount: 0, error: { message: 'provider failed' } },
      ],
      ...done('failed'),
    });
    const row = nth(images(nth(shells(blocks), 0).items), 0);
    expect([row.failed, row.pending]).toEqual([2, false]);
    expect(row.cells?.map((cell) => cell.status)).toEqual(['failed', 'failed']);
  });

  it('parse 不动的行用正则兜住 status', () => {
    const blocks = buildTurnBlocks({
      events: call('g1', 'Bash', { command: 'od media generate x' }, { content: '{"status": "succeeded", "path": ' }),
      ...done(),
    });
    expect(nth(images(nth(shells(blocks), 0).items), 0).done).toBe(1);
  });

  it('连续的生图调用并成一行;隔着别的调用就另起一行(S19 现行口径)', () => {
    const blocks = buildTurnBlocks({
      events: [
        ...call('g1', 'Bash', { command: 'od media generate a' }, { content: ok('a.png') }),
        ...call('g2', 'Bash', { command: 'od media generate b' }, { content: ok('b.png') }),
        ...call('t1', 'Read', { file_path: 'x.css' }),
        ...call('g3', 'Bash', { command: 'od media generate c' }, { content: ok('c.png') }),
      ],
      ...done(),
    });
    const rows = images(nth(shells(blocks), 0).items);
    expect(rows.map((r) => r.total)).toEqual([2, 1]);
    expect(nth(rows, 0).thumbs).toEqual(['a.png', 'b.png']);
  });

  it('一条状态都读不出来:命令报错就整组算失败', () => {
    const blocks = buildTurnBlocks({
      events: call('g1', 'Bash', { command: 'od media generate a && od media generate b' },
        { content: 'error: image provider is required', isError: true }),
      ...done(),
    });
    const row = nth(images(nth(shells(blocks), 0).items), 0);
    expect([row.done, row.failed]).toEqual([0, 2]);
  });

  it('一条状态都读不出来、命令也没报错:这压根不是一次生图,回落成普通命令行', () => {
    const blocks = buildTurnBlocks({
      // 假的 grep 输出。路径故意不落在 docs/ 下:那是 certain-exempt 面,
      // 哪怕只是字符串,守卫也会当成「闸道代码依赖了文档」(scripts/check-certain-exempt-consumption.ts)
      events: call('g1', 'Bash', { command: 'grep -rn "od media generate" notes/' }, { content: 'notes/a.md:3: od media generate' }),
      ...done(),
    });
    const items = nth(shells(blocks), 0).items;
    expect(images(items)).toHaveLength(0);
    expect(tools(items)).toHaveLength(1);
  });

  it('查用法不算生图', () => {
    const blocks = buildTurnBlocks({
      events: call('g1', 'Bash', { command: 'od media generate --help' }, { content: 'Usage: od media generate' }),
      ...done(),
    });
    expect(images(nth(shells(blocks), 0).items)).toHaveLength(0);
  });
});

describe('轮次结束后没有东西还在转', () => {
  const openList = [
    ...todo('p1', [['复刻商品列表页', 'in_progress'], ['抽出商品卡', 'pending']]),
    ...call('t1', 'Read', { file_path: 'a.css' }),
  ];

  it('跑完了但 agent 没关掉那条 todo:它不能继续顶着「进行中」', () => {
    // 真实里常见:agent 收尾时忘了发最后一次清单。壳已经是「已完成」,
    // 里面那条还挂着进行中 = 一颗永远转下去的球。
    const shell = last(shells(buildTurnBlocks({ events: openList, ...done('succeeded') })));
    expect(shell.segments.map((s) => s.status)).not.toContain('in_progress');
  });

  it('整轮失败同理', () => {
    const shell = last(shells(buildTurnBlocks({ events: openList, ...done('failed') })));
    expect(shell.segments.map((s) => s.status)).not.toContain('in_progress');
  });

  it('没关掉的那条不谎报成功 —— 是「没跑完」不是「做完了」', () => {
    const shell = last(shells(buildTurnBlocks({ events: openList, ...done('succeeded') })));
    expect(nth(shell.segments, 0).status).toBe('stopped');
    expect(nth(shell.segments, 1).status).toBe('pending');
  });

  it('还在跑的时候当然照转', () => {
    const shell = last(shells(buildTurnBlocks({ events: openList, runStatus: 'running' })));
    expect(nth(shell.segments, 0).status).toBe('in_progress');
  });
});

describe('done 分界在有清单时同样成立(D43)', () => {
  it('清单还有一条在跑,`<done/>` 之后的结论也要抬到壳外', () => {
    // 真实运行时照出来的:有 in_progress 的 todo 时,正文一律往那条 todo 里塞,
    // `<done/>` 被无视 —— 结果是**用户看不到这一轮的回答**(它被折在壳里)。
    const blocks = buildTurnBlocks({
      events: [
        ...todo('p1', [['复刻列表页', 'completed'], ['做设置页', 'in_progress']]),
        ...call('t1', 'Bash', { command: 'npm run build' }, { content: 'ok' }),
        text('<done/>两页的间距和圆角已经统一,设置页直接复用了商品卡。'),
      ],
      ...done(),
    });
    const outside = prose(blocks).map((p) => p.text).join('');
    expect(outside, '结论没被抬到壳外').toContain('两页的间距和圆角已经统一');
  });

  it('没有清单时同样成立(这条本来就绿,留着防回归)', () => {
    const blocks = buildTurnBlocks({
      events: [text('先看一眼。'), text('<done/>看完了。')],
      ...done(),
    });
    expect(prose(blocks).map((p) => p.text).join('')).toContain('看完了。');
  });
});

/*
 * 补一个测试洞(2026-08-27):规格 `chat-panel-next.md:274-283` 那张表里
 * **最容易被误判的一格** —— 「召回 · 本轮继续做的」既划线又可展开 ——
 * 原本那条用例标题写着「仍划线但可展开」,断言里却**没有 `isStruck`**。
 *
 * 这一格钉不住的后果是真实的:我自己就在 2026-08-27 把它读成 bug,
 * 差点去「修」一段本来正确的代码。
 */
/*
 * ⚠️ 这一组 2026-09-03 翻过面。原来断言的是「召回回来、本轮又真干了活 → **划线**
 * 且可展开」,依据是规格 `chat-panel-next.md:274-283` 那张表把三种召回态的划线列
 * 全写成 ✓。产品在真机上推翻了那两格(原话:「划线应该只有那种放弃了的,
 * 或者下次召回后上一轮已完成的」)—— 现场是一份**正在跑**的计划整份被划掉。
 * 判据与语料见 `contract.ts` 的 `isStruck` 与 `w98-strike-only-what-is-dead.test.ts`。
 *
 * 召回本身**没有被删**:`recalled` 照旧算得出来,它只是不再单独决定划线。
 */
describe('召回:本轮真动过的那条不划线', () => {
  const recalledAndWorked = () => buildTurnBlocks({
    events: [
      { kind: 'tool_use', id: 'p1', name: 'TodoWrite', input: { todos: [{ content: '复刻列表页', status: 'in_progress' }] } },
      { kind: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } },
      { kind: 'tool_result', toolUseId: 't1', content: 'ok', isError: false },
    ] as never,
    runStatus: 'succeeded',
    previousTodos: [{ content: '复刻列表页', status: 'in_progress' }],
  } as never);

  it('召回回来、本轮又真干了活:**不划线**,但可展开(本轮新增)', () => {
    const shell = recalledAndWorked().find((b) => b.kind === 'shell') as never as { segments: TodoSegment[] };
    const seg = shell.segments[0]!;
    expect(seg.recalled).toBe(true);
    expect(isStruck(seg)).toBe(false);
    expect(isExpandable(seg)).toBe(true);
  });
});
