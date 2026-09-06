// @vitest-environment jsdom
/**
 * 工具失败了,**原因要说出来**。
 *
 * 现状:`build-turn-blocks.ts` 里 `failReason` 被无条件写死 `null`(上面几行刚从
 * `result.isError` 算出 `failed`,下面还把 `result.content` 存进了 `terminal`,
 * 唯独这一个字段写死,没有任何注释)。于是 `ToolRow` 里那段设计好的
 * 「失败写法二:原因跟在名字后面」(条件 `row.failed && row.file && row.failReason`)
 * **永远进不去**,失败行只剩一个孤零零的「失败」二字,报错原文一路躺到最后一米被丢掉。
 *
 * 语料是**真实记录**:
 *   库 `/Users/elian/.od-chatpanel-preview/app.sqlite`
 *   消息 `27eaad58-120b-48ac-9570-067583367fe2`,agent = `codex`
 *   tool_use `exec-29102c36-…`,`isError: true`,内容是 152 字符的 JSON 错误体。
 * 命令是**复合命令**(`wc -l <文件> && rg -n '…' <文件> && od export …`),
 * 界面按**第一段**标成「读取 <文件>」,而失败来自**最后一段** ——
 * 标签选择这件事本身也不准,那是另一单(见 PR 说明的「相邻问题」),这里不碰。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { ToolRow } from '../../../src/components/chat/primitives/ToolRow';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type {
  ExecutionShell,
  ShellItem,
  ToolRow as ToolRowData,
  TurnBlock,
} from '../../../src/runtime/chat/contract';

afterEach(cleanup);

/** 真实记录里那条命令,一个字节都没改(含 codex 的 `/bin/zsh -c` 外壳与内层引号) */
const FAILING_COMMAND =
  '/bin/zsh -c "wc -l slow-thinking-one-pager.html && rg -n \'\\\\{\\\\{|TODO|FIXME|placeholder|rgba|#[0-9A-Fa-f]{3,8}|font-weight: [6789]00|<img|scrollIntoView\' slow-thinking-one-pager.html && \\""\'$OD_NODE_BIN" "$OD_BIN" export slow-thinking-one-pager.html --project "$OD_PROJECT_ID" --format image --out /tmp/slow-thinking-one-pager.png\'';

/** 真实记录里那条 `tool_result.content`,一个字节都没改 */
const FAILURE_TEXT =
  '{"error":{"code":"UPSTREAM_UNAVAILABLE","message":"desktop renderer unavailable: connect ENOENT /tmp/open-design/ipc/chatpanel/desktop.sock","data":{}}}\n';

const REAL_EVENTS: PersistedAgentEvent[] = [
  {
    kind: 'tool_use',
    id: 'exec-29102c36-b14d-4a05-8bfc-a7ecdb2e305d',
    name: 'Bash',
    input: { command: FAILING_COMMAND },
    startedAt: 1788354956600,
  },
  {
    kind: 'tool_result',
    toolUseId: 'exec-29102c36-b14d-4a05-8bfc-a7ecdb2e305d',
    content: FAILURE_TEXT,
    isError: true,
    completedAt: 1788354956690,
  },
] as unknown as PersistedAgentEvent[];

/** 同一条会话里那次**成功**的兄弟调用 —— 反向对照,它不许长出任何新东西 */
const OK_EVENTS: PersistedAgentEvent[] = [
  {
    kind: 'tool_use',
    id: 'exec-ok',
    name: 'Bash',
    input: {
      command: '/bin/zsh -c "sed -n \'1,240p\' .od-skills/doc-kami-parchment-0e66a0ee10/SKILL.md"',
    },
    startedAt: 1788354950000,
  },
  {
    kind: 'tool_result',
    toolUseId: 'exec-ok',
    content: '---\nname: doc-kami-parchment\n',
    isError: false,
    completedAt: 1788354951000,
  },
] as unknown as PersistedAgentEvent[];

function toolRowOf(events: PersistedAgentEvent[]): ToolRowData {
  const blocks: TurnBlock[] = buildTurnBlocks({ events, runStatus: 'succeeded' });
  const shell = blocks.find((b): b is ExecutionShell => b.kind === 'shell');
  if (!shell) throw new Error('fixture 坏了:这一轮没有壳');
  const found = shell.items.find((i: ShellItem): i is ToolRowData => i.kind === 'tool');
  if (!found) throw new Error('fixture 坏了:壳里没有工具行');
  return found;
}

const show = (row: ToolRowData) => render(
  <I18nProvider initial="zh-CN"><ToolRow row={row} deferBody={false} /></I18nProvider>,
);

/** 报错原文里那句人能读的话 —— 界面上要找的就是它 */
const MESSAGE = 'desktop renderer unavailable: connect ENOENT /tmp/open-design/ipc/chatpanel/desktop.sock';

describe('工具失败:原因要一路走到界面(真实记录 27eaad58 · codex)', () => {
  /*
   * **防真空**:先证明这把尺子看得见缺陷本身。
   * 落块器算得出 `failed`,也把同一份内容存进了 `terminal` —— 只有 `failReason`
   * 是空的。这一条红,才说明后面那条「界面上读得到」不是靠别的东西蒙对的。
   */
  it('落块器把失败原因带出来了', () => {
    const row = toolRowOf(REAL_EVENTS);
    expect(row.failed).toBe(true);
    expect(row.terminal).toBe(FAILURE_TEXT);           // 同一份内容,它一直都在
    expect(row.failReason).toBe(FAILURE_TEXT.trim());  // ← 现在恒为 null
  });

  it('界面上读得到失败原因', () => {
    const { container } = show(toolRowOf(REAL_EVENTS));
    expect(container.textContent ?? '').toContain(MESSAGE);
  });

  it('原因只出现一次 —— terminal 里那份不许再画一遍', () => {
    const { container } = show(toolRowOf(REAL_EVENTS));
    const text = container.textContent ?? '';
    expect(text.split(MESSAGE).length - 1).toBe(1);
  });

  it('这条真实记录走的确实是「原因跟在名字后面」那一支', () => {
    const row = toolRowOf(REAL_EVENTS);
    // 写法二的三个条件缺一不可;`file` 由 `commandFile` 从复合命令的第一段恢复出来
    expect(row.file).not.toBeNull();
    expect(row.failReason).toBeTruthy();
  });
});

describe('反向对照:成功的那一行一点没变', () => {
  it('成功的工具行不带原因,界面上也没有多出来的字', () => {
    const row = toolRowOf(OK_EVENTS);
    expect(row.failed).toBe(false);
    expect(row.failReason).toBeNull();
    const { container } = show(row);
    expect(container.textContent ?? '').not.toContain('UPSTREAM_UNAVAILABLE');
  });

  it('失败但没有输出时回落到「失败写法一」,不画一个空原因', () => {
    const row = toolRowOf([
      { kind: 'tool_use', id: 'e1', name: 'Bash', input: { command: 'wc -l a.html' }, startedAt: 0 },
      { kind: 'tool_result', toolUseId: 'e1', content: '   \n', isError: true, completedAt: 10 },
    ] as unknown as PersistedAgentEvent[]);
    expect(row.failed).toBe(true);
    expect(row.failReason).toBeNull();
  });
});
