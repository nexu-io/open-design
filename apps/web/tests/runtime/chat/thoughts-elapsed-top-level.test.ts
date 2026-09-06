// @vitest-environment node
/**
 * 用户 2026-08-27 真机指认第二问:**顶层那一格「思考过程」没有耗时,抽屉里那格有 `12.4s`**。
 *
 * 结论:**不是 bug**。那一格拿不到数,是 §2.2b 那条「空白里不止它一个就不给数」
 * 正常生效 —— 不是边界回退失灵,也不是被当成「还在写」。
 *
 * ── 那一轮长什么样(真实录制 `.od/runs/f7695c01-…`,agent=codex)──────────
 *
 *   轮次开头 1787840635911
 *     thinking ×3            ← 顶层那一格(截图里空着的那个)
 *     text                   ← 中文那段「Kami Parchment Document 将锁定羊皮纸…」
 *   TodoWrite  startedAt=1787840685920
 *     thinking               ← 抽屉里那一格
 *   Bash       startedAt=1787840698353
 *
 * 顶层那一格要认领的空白是 `635911 → 685920` = **50,009ms**,而那段空白里
 * **还躺着中文那段正文** —— 两件事分掉同一段时间,`thinking` 和 `text` 都不带自己的时刻,
 * 谁都说不出自己占了多少。给推理记 50s 就是把写正文那几秒也算进去。
 *
 * 抽屉里那一格的空白是 `685920 → 698353` = **12,433ms**,中间干干净净只有它 ——
 * 所以它报得出 `12.4s`。同一条规则,两个结果。
 *
 * ── 三种可能各自怎么排除的 ────────────────────────────────────────────
 *
 *  ① 规则本身就该给不出数        → **就是这一条**,`真因` 那两个用例是消融证据:
 *                                  把那一条正文事件拿掉,同一份录制立刻报出 50,009ms。
 *  ② `live` 判据把它当成还在写   → 排除。`live` 只落在**末尾**那一格
 *                                  (`groupThinking` 的 tail 判据),顶层那一格后面
 *                                  压着正文 / 清单 / 五条 todo,它永远不是末尾。
 *                                  `顶层那一格永远不是「还在写」的那一格` 钉住这条。
 *  ③ 边界回退没生效(开头没退回轮次开头)→ 排除。回退**是生效的**:同一份录制
 *                                  去掉正文就有数;而去掉 `startedAtMs` 就没数。
 *                                  两个用例互为对照。
 *
 * ⚠️ 这一整个文件是**保护性用例**,不是待修的红测。谁要让顶层那一格显示出数字,
 *    只能靠放宽「空白里不止它一个」那条判据 —— 那会把写正文的时间记到推理头上,
 *    正是 §2.2b 明令禁止的「偏大的假数」。改之前先回去读 `group-thinking.ts`
 *    的 `elapsedMs` 注释和 `build-turn-blocks.ts` 的 `closeThink`。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import { groupThinking, type ThoughtsGroup } from '../../../src/runtime/chat/group-thinking';
import { formatElapsed } from '../../../src/runtime/chat/format';
import type { BuildTurnInput, ExecutionShell } from '../../../src/runtime/chat/contract';
import codexParchment from '../../fixtures/chat/codex-parchment.turn0.json';

const f = codexParchment as unknown as {
  runStatus: string;
  startedAtMs: number;
  endedAtMs: number;
  events: PersistedAgentEvent[];
};

/** 截图那一刻:轮次开跑 1m 6s,还在 `Working` */
const SHOT_MS = f.startedAtMs + 66_000;

const shellOf = (input: BuildTurnInput): ExecutionShell => {
  const shells = buildTurnBlocks(input).filter((b): b is ExecutionShell => b.kind === 'shell');
  expect(shells.length, '这一轮只有一张壳').toBe(1);
  return shells[0]!;
};

/** 截图那一刻的回放:还在跑 */
const asShot = (events: PersistedAgentEvent[] = f.events): BuildTurnInput => ({
  events,
  runStatus: 'running',
  startedAtMs: f.startedAtMs,
  nowMs: SHOT_MS,
});

const thoughtsIn = (items: ExecutionShell['items'], live = false): ThoughtsGroup[] =>
  groupThinking(items, live).filter((g): g is ThoughtsGroup => g.kind === 'thoughts');

describe('截图那一轮 · 顶层「思考过程」为什么没有耗时', () => {
  const shell = shellOf(asShot());

  it('回放认得出截图:顶层是 思考 → 正文 → 清单,清单五条', () => {
    expect(groupThinking(shell.items, false).map((g) => g.kind))
      .toEqual(['thoughts', 'text', 'plan', 'todo', 'todo', 'todo', 'todo', 'todo']);
    expect(shell.segments).toHaveLength(5);
    expect(shell.segments[0]!.content).toBe('定义品牌令牌与真实产品内容');
  });

  it('顶层那一格确实没有耗时 —— 复现用户看到的画面', () => {
    expect(thoughtsIn(shell.items).map((g) => g.elapsedMs)).toEqual([null]);
    expect(formatElapsed(thoughtsIn(shell.items)[0]!.elapsedMs)).toBeNull();
  });

  it('抽屉里那一格照旧报 12.4s —— 同一条规则,那段空白只有它一个', () => {
    const drawer = shell.segments[0]!;
    expect(drawer.status, '截图里那条是进行中').toBe('in_progress');
    const inner = thoughtsIn(drawer.items);
    expect(inner[0]!.elapsedMs).toBe(12_433); // 698353 − 685920
    expect(formatElapsed(inner[0]!.elapsedMs)).toBe('12.4s');
  });
});

describe('真因 · 消融:那段空白里躺着的是中文那段正文', () => {
  /** 录制里唯一那条顶层正文(中文那段) */
  const proseIndex = f.events.findIndex(
    (e) => e.kind === 'text' && e.text.includes('Kami Parchment Document'),
  );
  const withoutProse = f.events.filter((_, i) => i !== proseIndex);

  it('录制里那条正文就夹在推理和 TodoWrite 中间', () => {
    expect(proseIndex).toBeGreaterThan(0);
    expect(f.events[proseIndex - 1]!.kind, '它前面是推理').toBe('thinking');
    const todo = f.events[proseIndex + 1]!;
    expect(todo.kind === 'tool_use' && todo.name, '它后面是清单').toBe('TodoWrite');
  });

  /**
   * **这条是判定 ①/③ 的分水岭。** 同一份录制,只把那条正文拿掉,
   * 顶层那一格立刻报出 50,009ms —— 说明「退回轮次开头」这条边界回退**是生效的**,
   * 没有数纯粹是因为那段空白里不止推理一件事。
   */
  it('把正文拿掉:同一份录制立刻报出 50,009ms(= 轮次开头 → TodoWrite 开跑)', () => {
    const todo = f.events.find(
      (e): e is Extract<PersistedAgentEvent, { kind: 'tool_use' }> =>
        e.kind === 'tool_use' && e.name === 'TodoWrite',
    );
    expect(todo?.startedAt! - f.startedAtMs).toBe(50_009);
    expect(thoughtsIn(shellOf(asShot(withoutProse)).items).map((g) => g.elapsedMs))
      .toEqual([50_009]);
  });

  /** 反向对照:回退的起点确实来自 `startedAtMs`,不传就还是没数 */
  it('正文拿掉但也不给 `startedAtMs`:还是没数 —— 起点真的来自轮次开头', () => {
    const shell = shellOf({ events: withoutProse, runStatus: 'running', nowMs: SHOT_MS });
    expect(thoughtsIn(shell.items).map((g) => g.elapsedMs)).toEqual([null]);
  });
});

describe('排除 ② · 顶层那一格永远不是「还在写」的那一格', () => {
  /**
   * `live` 只落在**末尾**那一格。顶层那一格后面压着正文、清单和五条 todo,
   * 所以哪怕整张壳在思考、`groupThinking` 收到 `live=true`,它也拿不到这个标记
   * (`live=true` 时补在末尾的是**另一格空的**)—— 于是 `ThoughtsRow` 走的是
   * 「想完了」那一支:brain 图标 + 读 `elapsedMs`,不是「思考中」。
   */
  it('即便整摞标成 live,顶层那一格仍然 live=false', () => {
    const shell = shellOf(asShot());
    const cells = thoughtsIn(shell.items, true);
    expect(cells[0]!.live ?? false, '截图里它显示的是「思考过程」不是「思考中」').toBe(false);
    expect(cells.some((g) => g.live === true), 'live 落在末尾补的那一格上').toBe(true);
  });

  /** 轮次终止之后回放也一样 —— 这一格的结果与「整轮还在不在跑」无关 */
  it('轮次收尾后重放:顶层那一格照旧没数,与 running 与否无关', () => {
    const ended = shellOf({
      events: f.events,
      runStatus: 'canceled',
      startedAtMs: f.startedAtMs,
      endedAtMs: f.endedAtMs,
    });
    expect(thoughtsIn(ended.items).map((g) => g.elapsedMs)).toEqual([null]);
  });
});
