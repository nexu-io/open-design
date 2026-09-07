// @vitest-environment jsdom
/**
 * 没有人话标题的命令行(AMR / ACP 九家)也要是折叠块 —— 形态统一 + 在途输出看得见。
 *
 * ── 产品裁决(2026-09-03,口述)──────────────────────────────────────────
 *
 *   「(AMR 那种没标题的命令行)**AMR 要的吧?统一一下?并且要支持流式?**」
 *
 * 也就是:两种命令行统一成同一个形态,而且都要能看到实时输出。
 *
 * ── 修之前的错位:有输出的看不见,看得见的没输出 ─────────────────────────
 *
 * | | 有折叠块可以放输出吗 | daemon 给不给在途输出 |
 * |---|---|---|
 * | Claude 家族(claude/amp/codebuddy) | ✅ 有(`ToolRow` 的 `!row.rawTitle` 那支) | ❌ 不给 |
 * | AMR / ACP 家族(9 家)             | ❌ 单行,输出无处可放                     | ✅ 给(`tool_in_flight`) |
 *
 * 判据是 `isRawCommandTitle(name, input) = isCommandTool(name) && !input.description`。
 * **谁落在哪一支是量出来的**(179 条 langfuse 录音 + `w123-acp-inflight-frames.json`
 * 那次 vela 实录):claude 47/48 带 description、直连 opencode 71/71 带 —— 都走折叠块那支;
 * **codex 0/569 带**、**经 vela 走 ACP 的 bash 不带**(实录 `rawInput` 逐字是
 * `{"command": …, "timeout": 180000}`)—— 都走单行那支。
 *
 * ⚠️ 我一度把这一支写成「opencode 的 bash 入参只有 `{ command }`」,**是反的**:
 * 直连 opencode 全带。同一个 opencode,直连与经 vela 走的是两条不同的支。
 * 而这一支最大的住户是 **codex**,不是 AMR —— 569 次调用的输出在此之前一次都没上过屏。
 *
 * ── 稿子怎么说的(基线 `1720acc247`,`docs/design/chat-panel/src/body-components.html`)──
 *
 * 全稿 `执行 <命令>` 单行形态**只有 1 处**(脚本数过:`div.tool` 且 `nm` 以「执行」
 * 开头的,全文命中 1 条),就是 `:909`,原文逐字:
 *
 *   <div class="tool"><span class="ti"><svg …><path d="M4.5 6.5l5 5.5-5 5.5"/>
 *   <path d="M12.5 18h7"/></svg></span><span class="nm">执行 <button class="fn"
 *   type="button" aria-label="查看 npm run build 的输出"><code>npm run build</code>
 *   </button></span><span class="ms">8.4s</span></div>
 *
 * 三件事:①行首是**静态终端图标**(`span.ti`)不是转圈球;②右侧是**结算过的 8.4s**;
 * 所以**这一格画的是已完成态**。③那颗按钮的 `aria-label` 逐字是
 * **「查看 npm run build 的输出」** —— 稿子自己就把这一行的用途写成「看输出」,
 * 只是没给出「看」之后长什么样。
 *
 * 而稿子**会**画进行中的单行 —— `:1037` 生图那条逐字是:
 *
 *   <div class="tool"><span class="mk is-run"><i class="sheen"></i><i class="rim"></i>
 *   </span><span class="nm">生成配套插图</span><span class="ms mod-num">2/4</span></div>
 *
 * 转圈球(`mk is-run`)+ `2/4`,是个不折不扣的进行中单行。所以结论不是
 * 「稿子不画进行中单行」,而是**专门没画过 exec 的进行中形态**。这次按产品裁决补上,
 * 补法与有标题那支**完全一致**(同一个 `lifecycleOpen`、同一个 `div.code` 正文)。
 *
 * ── 防假绿 ───────────────────────────────────────────────────────────────
 *
 * · 断言的是**输出的文字本身在不在 DOM 里**,不是「有没有一个 details」、也不是
 *   「有没有某个 class」—— vitest 的 CSS Module 代理对任何 key 都返回类名。
 * · `ToolRow` 内部用 `useT()`,不接受 `t` 参数,所以断言中文要显式挂 zh-CN provider。
 * · 最后一组用**真事件流**(`buildTurnBlocks` + `IN_FLIGHT_TOOL_OUTPUT_KEY`)从
 *   daemon 记号一路验到 DOM,不靠手搓 `row.terminal` 自证。
 *
 * ⚠️ **`running` 现在必须显式传**(2026-09-03)。这个文件测的是「**轮次还在跑**」
 * 那一档,而在此之前它只给了 `pending: true` 就断言摊开 —— `row.pending` 的定义是
 * `result == null`(「从来没回来过」),用户按停止之后它永远为真。也就是说这些用例
 * 原来喂进去的数据**同时**符合「正在跑」和「被停掉之后的残行」两种情形,断言的却只是
 * 前者。自动摊开改成认 `row.pending && running` 之后,「正在跑」这层意思必须自己说出来。
 * 那个洞与不变量本身钉在 `stopped-run-row-collapse.test.tsx`。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { ToolRow } from '../../../src/components/chat/primitives/ToolRow';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import { IN_FLIGHT_TOOL_OUTPUT_KEY } from '../../../src/runtime/tool-events';
import type { ToolRow as ToolRowData, TurnBlock } from '../../../src/runtime/chat/contract';

afterEach(cleanup);

function render(ui: ReactElement) {
  const wrap = (node: ReactElement) => <I18nProvider initial="zh-CN">{node}</I18nProvider>;
  const result = rtlRender(wrap(ui));
  return { ...result, rerender: (next: ReactElement) => result.rerender(wrap(next)) };
}

/** opencode 在途输出的真实体量:一点点长出来的 stdout */
const LIVE_OUT = [
  '⠋ Resolving dependencies',
  'Progress: resolved 142, reused 138, downloaded 4',
  'Packages: +37',
].join('\n');

/**
 * AMR / ACP 那一支的数据形态:`rawTitle: true`(入参里**没有** description),
 * 标题就是命令原文本身。
 */
function raw(over: Partial<ToolRowData> = {}): ToolRowData {
  return {
    kind: 'tool',
    id: 'r1',
    tool: 'exec',
    name: 'Bash',
    title: 'npm install',
    rawTitle: true,
    file: null,
    pattern: null,
    hits: null,
    delta: null,
    elapsedMs: null,
    pending: false,
    failed: false,
    failReason: null,
    command: 'npm install',
    terminal: null,
    ...over,
  };
}

const rawRunning = (over: Partial<ToolRowData> = {}): ToolRowData =>
  raw({ pending: true, terminal: LIVE_OUT, elapsedMs: 4100, ...over });

const rawSettled = (over: Partial<ToolRowData> = {}): ToolRowData =>
  raw({ pending: false, terminal: 'added 37 packages in 8.4s', elapsedMs: 8420, ...over });

/** 有人话标题那一支(Claude 家族)—— 反向对照用,一个字都不许改坏 */
function titled(over: Partial<ToolRowData> = {}): ToolRowData {
  return raw({ title: '装依赖,准备跑构建', rawTitle: false, ...over });
}

const fold = (): HTMLDetailsElement => {
  const el = document.querySelector<HTMLDetailsElement>('details');
  if (!el) throw new Error('折叠块没渲染出来 —— 没有人话标题的命令行也该是 <details>');
  return el;
};

/** 浏览器在 `open` 属性被写回时派发的那一次 —— 不是用户点的(OPEND-2557) */
const echoToggle = (el: HTMLDetailsElement): void => {
  fireEvent(el, new Event('toggle', { bubbles: false }));
};

/** 真人点标题行:DOM 先自己翻面,浏览器随后才派发 toggle */
const clickSummary = (el: HTMLDetailsElement): void => {
  const s = el.querySelector<HTMLElement>('summary');
  if (!s) throw new Error('summary 没渲染出来');
  fireEvent.click(s);
  echoToggle(el);
};

describe('AMR 形态(rawTitle)在跑的时候:是折叠块、展开着、输出真的在 DOM 里', () => {
  it('执行中 → 折叠块带 open', () => {
    render(<ToolRow running row={rawRunning()} />);
    expect(fold().open, '执行中该展开(与有标题那支同一条规矩)').toBe(true);
  });

  it('在途输出的每一行都真的在 DOM 里 —— 这条才是 bug 的判据', () => {
    // 生产默认 deferBody=true:收起的折叠块连 body 都不挂载。
    // 修之前这一支根本是 <div>,一个输出节点都没有。
    const { container } = render(<ToolRow running row={rawRunning()} deferBody />);
    for (const line of LIVE_OUT.split('\n')) {
      expect(screen.getByText(line), `在途输出缺了这一行:${line}`).toBeTruthy();
    }
    expect(container.textContent).toContain('Packages: +37');
  });

  it('还没有任何输出时也照样展开 —— 至少看得见「它在跑什么命令」', () => {
    const { container } = render(<ToolRow running row={rawRunning({ terminal: null })} />);
    expect(fold().open).toBe(true);
    expect(container.textContent).toContain('npm install');
  });

  /*
   * 正文第一块是**命令原文**,和有标题那支逐字同构(稿子组件 11 的正文是
   * `div.code` > `div.term.mod-cmd` + `div.term`)。「统一形态」指的就是这个:
   * 正文只放输出、不放命令,那是**另一种**正文,不叫统一。
   *
   * 它还有一件 summary 干不了的事:summary 是单行,靠 CSS `text-overflow` 截断;
   * 正文的 `.term div` 是 `white-space: pre-wrap`,长命令在这里才读得全。
   * 所以断言必须落在**正文里那一块**上 —— 只断言「命令出现在这一行的某处」是假绿:
   * summary 里本来就有一份,把正文整块删掉照样绿(撤销复验第 ⑥ 项实测到过)。
   *
   * ⚠️ 代价是短命令展开后会看见两遍(summary 截断版 + 正文完整版)。要不要为
   * `rawTitle` 这一支省掉正文那份,**归产品拍板** —— 已列进报告的待拍板。
   */
  it('展开后正文里有命令原文那一块(长命令只有在这里才读得全)', () => {
    const LONG = 'find . -name "*.tsx" -not -path "*/node_modules/*" -exec grep -l "useThinkingFollow" {} +';
    const { container } = render(<ToolRow running row={rawRunning({ command: LONG, title: LONG })} />);

    const body = container.querySelector('div[class*="_code_"]');
    expect(body, '展开后要有 div.code 正文').not.toBeNull();

    const cmdBlock = body!.querySelector('div[class*="_cmd_"]');
    expect(cmdBlock, '正文第一块是命令原文(和有标题那支同一个 div.term.cmd)').not.toBeNull();
    expect(cmdBlock!.textContent).toBe(LONG);
  });

  it('summary 仍然是稿子 :909 那一行:「执行」+ 等宽命令 + 秒数', () => {
    render(<ToolRow running row={rawRunning()} />);
    const summary = fold().querySelector('summary');
    expect(summary?.textContent, '稿子 :909 的动词').toContain('执行');
    expect(summary?.querySelector('code')?.textContent, '命令走等宽').toBe('npm install');
    expect(summary?.textContent).toContain('4.1s');
  });
});

describe('跑完自动收起 —— 与有标题那支完全一致', () => {
  it('同一行从 pending 翻成成功,折叠块自己收起来', () => {
    const { rerender } = render(<ToolRow running row={rawRunning()} />);
    expect(fold().open).toBe(true);
    echoToggle(fold()); // 摊开那一帧的回声,不算用户点过

    rerender(<ToolRow row={rawSettled()} />);
    expect(fold().open, '跑完该收起来').toBe(false);
  });

  it('首屏:重载老会话,一条从来没展开过的成功命令行正文一个节点都不挂', () => {
    const { container } = render(<ToolRow row={rawSettled()} deferBody />);
    expect(fold().open).toBe(false);
    expect(container.querySelector('div[class*="code"]')).toBeNull();
    expect(container.textContent).not.toContain('added 37 packages');
  });

  it('点标题行能手动展开,输出就出来了(稿子那颗按钮的 aria-label 说的正是这件事)', () => {
    const { container } = render(<ToolRow row={rawSettled()} deferBody />);
    clickSummary(fold());
    expect(container.textContent).toContain('added 37 packages in 8.4s');
  });
});

describe('反向对照:用户自己动过的,生命周期不许拨回去', () => {
  it('用户在跑的时候手动收起了,跑完不许替他打开', () => {
    const { rerender } = render(<ToolRow running row={rawRunning()} />);
    echoToggle(fold());

    clickSummary(fold());
    expect(fold().open, '用户点了收起').toBe(false);

    rerender(<ToolRow row={rawSettled()} />);
    expect(fold().open, '用户收起过的,跑完不许替他打开').toBe(false);
  });

  it('用户手动展开一条已完成的,后续重渲染不许把它收回去', () => {
    const { rerender } = render(<ToolRow row={rawSettled()} />);
    expect(fold().open).toBe(false);

    clickSummary(fold());
    expect(fold().open).toBe(true);

    rerender(<ToolRow row={rawSettled({ elapsedMs: 8430 })} />);
    expect(fold().open, '用户掀开的不许被拨回去').toBe(true);
  });
});

describe('反向对照:失败那一档行为不变', () => {
  /*
   * 失败的 rawTitle 命令**不走这一支**(条件里写死 `!row.failed`),它落到兜底那一行:
   * `<code>{row.title}</code>` + 「失败」按钮。这次改动一个字都不许碰它。
   */
  it('失败的命令行仍然是单行,不是折叠块', () => {
    render(<ToolRow row={rawSettled({ failed: true, failReason: 'exit 1' })} />);
    expect(document.querySelector('details'), '失败那档不该被顺手改成折叠块').toBeNull();
    expect(screen.getByText('失败')).toBeTruthy();
    expect(screen.getByText('npm install')).toBeTruthy();
  });

  it('失败的命令行不显示终端输出(和修之前一样)', () => {
    const { container } = render(
      <ToolRow row={rawSettled({ failed: true, terminal: 'ELIFECYCLE  Command failed.' })} />,
    );
    expect(container.textContent).not.toContain('ELIFECYCLE');
  });
});

describe('反向对照:有人话标题那一支一个字都没改坏', () => {
  it('执行中展开、输出在、summary 是人话不是命令', () => {
    const { container } = render(<ToolRow running row={titled({ pending: true, terminal: LIVE_OUT, elapsedMs: 4100 })} />);
    expect(fold().open).toBe(true);
    expect(fold().querySelector('summary')?.textContent).toContain('装依赖,准备跑构建');
    expect(container.textContent).toContain('Packages: +37');
  });

  it('成功且用户没动过的,默认收起', () => {
    const { container } = render(<ToolRow row={titled({ terminal: 'added 37 packages in 8.4s', elapsedMs: 8420 })} />);
    expect(fold().open).toBe(false);
    expect(container.textContent).not.toContain('added 37 packages');
  });

  it('失败的默认展开,报错原文在 DOM 里', () => {
    const { container } = render(
      <ToolRow row={titled({ failed: true, terminal: 'ELIFECYCLE  Command failed.', elapsedMs: 2100 })} />,
    );
    expect(fold().open).toBe(true);
    expect(container.textContent).toContain('ELIFECYCLE  Command failed.');
  });
});

describe('反向对照:能认出语义动词的 shell 命令仍然走它自己那一支(不归这次改)', () => {
  it('`rm -f` 这种仍然是「删除」单行', () => {
    render(<ToolRow row={raw({ tool: 'delete', title: 'rm -f a.html', command: 'rm -f a.html' })} />);
    expect(screen.getByText('删除')).toBeTruthy();
    expect(document.querySelector('details')).toBeNull();
  });
});

/* ── 整条链:daemon 的 tool_in_flight 记号 → row.terminal → 折叠块正文 ────────── */

describe('在途输出整条链(不手搓 row.terminal,从事件流验起)', () => {
  /**
   * ACP 那条线把「到目前为止的输出」挂在**入参**上(`IN_FLIGHT_TOOL_OUTPUT_KEY`),
   * 不是 `tool_result` —— 因为调用还没结算,行必须仍然是 pending(秒表继续走)。
   * `build-turn-blocks` 的 `terminal: result?.content ?? inFlightOutputOf(input)`
   * 是这条链的接口。这里验的是:**单行改成折叠块之后这条链仍然通到 DOM**。
   */
  const inFlightEvents = (output: string): PersistedAgentEvent[] => ([
    {
      kind: 'tool_use',
      id: 'acp-1',
      name: 'bash',
      // opencode 的真实入参形状:只有 command,**没有 description** → rawTitle
      input: { command: 'npm install', [IN_FLIGHT_TOOL_OUTPUT_KEY]: output },
      startedAt: 1000,
    },
  ] as unknown as PersistedAgentEvent[]);

  const rowsOf = (blocks: TurnBlock[]): ToolRowData[] => {
    const out: ToolRowData[] = [];
    const walk = (items: readonly unknown[]): void => {
      for (const item of items) {
        const node = item as { kind?: string; items?: readonly unknown[]; segment?: { items?: readonly unknown[] } };
        if (node.kind === 'tool') out.push(item as ToolRowData);
        if (node.items) walk(node.items);
        if (node.segment?.items) walk(node.segment.items);
      }
    };
    walk(blocks as unknown as readonly unknown[]);
    return out;
  };

  it('daemon 的记号最终变成 rawTitle 的 pending 行,terminal 上带着在途输出', () => {
    const rows = rowsOf(buildTurnBlocks({ events: inFlightEvents(LIVE_OUT), runStatus: 'running', nowMs: 5000 }));
    const row = rows.find((r) => r.command === 'npm install');
    if (!row) throw new Error('fixture 坏了:事件流没产出命令行');
    expect(row.rawTitle, '没有 description → 走 AMR 那一支').toBe(true);
    expect(row.pending, '还没结算,秒表要继续走').toBe(true);
    expect(row.terminal, '在途输出要落到 terminal 上').toBe(LIVE_OUT);
  });

  it('这一行渲染出来,在途输出的文字真的在 DOM 里', () => {
    const rows = rowsOf(buildTurnBlocks({ events: inFlightEvents(LIVE_OUT), runStatus: 'running', nowMs: 5000 }));
    const row = rows.find((r) => r.command === 'npm install');
    if (!row) throw new Error('fixture 坏了:事件流没产出命令行');

    const { container } = render(<ToolRow row={row} deferBody running />);
    expect(fold().open).toBe(true);
    for (const line of LIVE_OUT.split('\n')) {
      expect(container.textContent, `在途输出缺了这一行:${line}`).toContain(line);
    }
  });
});
