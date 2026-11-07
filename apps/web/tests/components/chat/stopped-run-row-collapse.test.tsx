// @vitest-environment jsdom
/**
 * 【产品裁决 2026-11-07】**工具行跑完(含被停止时在飞的那一行)不自动收起。**
 *
 * 这个文件原来钉的是「按了停止之后,那条正在跑的命令行必须收起来」——因为
 * `row.pending`(『这次调用从来没回来过』)在轮次停止后会永远为真,那一行会永远摊着。
 * 新裁决把「自动收起」整个拿掉了:行里的输出、失败原因和现场本来就是用户回头看
 * 这一轮时要读的东西,跑完/停掉都不该藏。用户手动收起仍然算数(`userToggled` 闩)。
 *
 * ── 为什么这不是「把 bug 改回来」 ────────────────────────────────────────
 *
 * 旧行为把「pending 且轮次已停」也自动收起,靠的是 `row.pending && running` 与
 * `row.failed`;代价是**成功**的命令一结算也立刻收起。现在的判据只有一条:
 * 默认摊开。停掉的那一行仍然 `pending`,行首照旧画中性灰 —— 那只影响状态标记,
 * 不再影响开合。
 *
 * ── 防假绿 ───────────────────────────────────────────────────────────────
 *
 * · 断言的是 `<details>` 的 **`open` 属性**和**输出文字在不在 DOM 里**,不是类名。
 * · 前两组走 `AssistantMessage` + 真事件流(`runStatus: 'canceled'`),从产品的
 *   真实触发路径验起;第三组才落到 `ToolRow` 这一层,把「手动收起仍然优先」钉死。
 * · 反向对照:轮次还在跑 → 同样摊开,证明「默认展开」对所有相位一致。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { ChatMessage, PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { ToolRow } from '../../../src/components/chat/primitives/ToolRow';
import { IN_FLIGHT_TOOL_OUTPUT_KEY } from '../../../src/runtime/tool-events';
import type { ToolRow as ToolRowData } from '../../../src/runtime/chat/contract';

afterEach(cleanup);

const T0 = 1_800_000_000_000;

const show = (node: ReactElement): ReactElement => (
  <I18nProvider initial="zh-CN">{node}</I18nProvider>
);

/** 装依赖那种一点点长出来的 stdout —— 默认展开时这些字都该在 DOM 里 */
const LIVE_OUT = [
  'Progress: resolved 142, reused 138, downloaded 4',
  'Packages: +37',
].join('\n');

/**
 * 一条**在飞时被掐掉**的调用:只有 `tool_use`,没有 `tool_result`。
 * `withDescription` 切两种命令行形态(有人话标题 / 没有),两支都得展开。
 */
function severedEvents(withDescription: boolean): PersistedAgentEvent[] {
  const input: Record<string, unknown> = {
    command: 'npm install',
    [IN_FLIGHT_TOOL_OUTPUT_KEY]: LIVE_OUT,
  };
  if (withDescription) input.description = '装依赖,准备跑构建';
  return [{ kind: 'tool_use', id: 't1', name: 'Bash', input, startedAt: T0 }] as unknown as PersistedAgentEvent[];
}

const message = (runStatus: string, withDescription: boolean): ChatMessage => ({
  id: 'm1',
  role: 'assistant',
  content: '',
  createdAt: T0,
  runStatus,
  events: severedEvents(withDescription),
} as unknown as ChatMessage);

/**
 * 一整轮。`streaming` 跟着 `runStatus` 走 —— 这一对必须自洽:传
 * `streaming` 却给 `canceled` 是产线上不存在的组合,拿它测出来的结论不算数。
 */
const turn = (runStatus: string, withDescription = true): ReactElement => (
  <AssistantMessage
    message={message(runStatus, withDescription)}
    streaming={runStatus === 'running'}
  />
);

/** 壳自己那层 flat fold 不算工具行 */
const commandFold = (root: HTMLElement): HTMLDetailsElement => {
  const el = root.querySelector<HTMLDetailsElement>('details[class*="fold"]:not([class*="flat"])');
  if (!el) throw new Error('壳 body 里没有命令折叠块 —— 选择器没命中,不是开合的问题');
  return el;
};

describe('轮次停止之后:在飞的命令行仍然摊开(真实触发路径)', () => {
  for (const withDescription of [true, false]) {
    const shape = withDescription ? '有人话标题(Claude 家族)' : '没有人话标题(AMR / ACP 九家)';

    it(`${shape}:轮次 canceled → 折叠块保持 open`, () => {
      const { container } = render(show(turn('canceled', withDescription)));
      expect(
        commandFold(container).open,
        '轮次停了也不许把这一行的现场收走',
      ).toBe(true);
    });

    it(`${shape}:停掉之后那几百行输出仍然在 DOM 里`, () => {
      const { container } = render(show(turn('canceled', withDescription)));
      expect(container.textContent).toContain('Packages: +37');
    });

    it(`${shape}:反向对照,轮次还在跑同样摊开、输出看得见`, () => {
      const { container } = render(show(turn('running', withDescription)));
      expect(commandFold(container).open, '在跑的那一档当然摊开').toBe(true);
      expect(container.textContent).toContain('Packages: +37');
    });
  }
});

describe('轮次的其它终态也不收起', () => {
  it('failed:壳展开,工具行也展开 —— 报错现场要看得见', () => {
    const { container } = render(show(turn('failed')));
    const shell = container.querySelector<HTMLDetailsElement>('details[class*="flat"]');
    expect(shell?.open, '壳不再因为终态自动收起').toBe(true);
    expect(commandFold(container).open, '工具行同样展开').toBe(true);
    expect(container.textContent).toContain('Packages: +37');
  });

  it('canceled:壳照旧摊开,里面那一行也摊开', () => {
    const { container } = render(show(turn('canceled')));
    const shell = container.querySelector<HTMLDetailsElement>('details[class*="flat"]');
    expect(shell?.open).toBe(true);
    expect(commandFold(container).open).toBe(true);
  });
});

/* ── 不变量本身:默认摊开,手动收起仍然优先 ───────────────────────────────── */

function row(over: Partial<ToolRowData> = {}): ToolRowData {
  return {
    kind: 'tool',
    id: 'r1',
    tool: 'exec',
    name: 'Bash',
    title: '装依赖,准备跑构建',
    rawTitle: false,
    file: null,
    pattern: null,
    hits: null,
    delta: null,
    elapsedMs: 4100,
    pending: true,
    failed: false,
    failReason: null,
    command: 'npm install',
    terminal: LIVE_OUT,
    ...over,
  };
}

const fold = (): HTMLDetailsElement => {
  const el = document.querySelector<HTMLDetailsElement>('details');
  if (!el) throw new Error('折叠块没渲染出来');
  return el;
};

/** 真人点标题行:DOM 先自己翻面,浏览器随后才派发 toggle */
const clickSummary = (el: HTMLDetailsElement): void => {
  const s = el.querySelector<HTMLElement>('summary');
  if (!s) throw new Error('summary 没渲染出来');
  fireEvent.click(s);
  fireEvent(el, new Event('toggle', { bubbles: false }));
};

describe('ToolRow 这一层:默认摊开,手动收起算数', () => {
  it('pending 且 running=false(默认值)→ 仍然摊开', () => {
    render(show(<ToolRow row={row()} />));
    expect(fold().open, '停掉的那一行也要能读到输出').toBe(true);
  });

  it('pending 且 running=true → 摊开', () => {
    render(show(<ToolRow row={row()} running />));
    expect(fold().open).toBe(true);
  });

  it('失败那一档 → 摊开(报错原文是这时候唯一要读的东西)', () => {
    render(show(<ToolRow row={row({ pending: false, failed: true, terminal: 'ELIFECYCLE  Command failed.' })} />));
    expect(fold().open, '失败照旧默认摊开,轮次停没停都一样').toBe(true);
  });

  it('rawTitle 那一支同样默认摊开', () => {
    const raw = row({ rawTitle: true, title: 'npm install' });
    const { unmount } = render(show(<ToolRow row={raw} />));
    expect(fold().open, '没有 running 也摊开').toBe(true);
    unmount();
    render(show(<ToolRow row={raw} running />));
    expect(fold().open, 'running=true → 摊开').toBe(true);
  });

  it('用户手动收起之后,重渲染不许替他打开', () => {
    const { rerender } = render(show(<ToolRow row={row()} />));
    clickSummary(fold());
    expect(fold().open, '用户点了收起').toBe(false);

    rerender(show(<ToolRow row={row({ elapsedMs: 4200 })} />));
    expect(fold().open, '用户收起过的那一行,后续不许自动打开').toBe(false);
  });
});
