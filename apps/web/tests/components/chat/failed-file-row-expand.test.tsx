// @vitest-environment jsdom
/**
 * 失败的**文件行**也要能下拉展开看报错原文(T49)。
 *
 * ── 依据:产品口述,不是稿子 ────────────────────────────────────────────────
 *
 * 产品 2026-09-03 指着失败命令行那个折叠块说:「**能下拉展开吗?像这样**」。
 *
 * ⚠️ **稿子明确画的是另一样**,这一点必须写在最前面,别让后来人以为是照稿:
 *   `docs/design/chat-panel/src/body-components.html:917`(文件类失败)逐字是
 *       <div class="tool is-fail">…<button class="why" type="button">失败</button>
 *       <span class="ms">1.2s</span></div>
 *   —— **单行** + 一颗按钮 + 耗时,没有折叠块。
 *   只有 `:1018-1019`(命令类失败)是 `<details class="fold is-fail" open>`。
 * 所以这是一次**有意偏离**:把命令类那一档的待遇给到文件类。
 *
 * ── 为什么这个偏离站得住 ──────────────────────────────────────────────────
 *
 * `failReason` **不截断**,是设计好的 —— `build-turn-blocks` 的注释逐字说
 * 「一次 stderr 可能几百字符,截到多长是产品的事」。而在此之前那段原文被塞进
 * **单行**(「写法二」:`{动词} {文件名} · {原因}`),几百字符的 stderr 靠 CSS
 * 省略号截掉,读不到。给它一个正文块,原文才真的看得见。
 *
 * ── 顺带合掉了稿子那两种写法(规格 S1)────────────────────────────────────
 *
 * 修之前是两支:
 *   写法二  `failed && file && failReason` → `{动词} {文件名} · {原因}`,**没有**「失败」标记
 *   写法一  `failed && file`               → `{动词} {文件名}` + 「失败」标记
 * 规格 S1 一直开着(「两种写法是否有意区分」,挂在设计同学名下)。这次合成一支:
 * 摘要恒是 `{动词} {文件名}` + 「失败」+ 耗时(逐字照抄稿子 `:917` 那一行),
 * 原文进正文。**两支的差别从此只剩「有没有原文可给」**——有就能展开,没有就是单行。
 *
 * 「收起时看不到原因」不是代价:失败行**默认就是展开的**(和命令类同一个
 * `lifecycleOpen`,稿子 `:1018` 的 `open`),原文一上屏就在,只是落在第二行。
 *
 * ── 防假绿 ────────────────────────────────────────────────────────────────
 *
 * · 断言的是**原文的字在不在 DOM 里**、`<details>` 的 `open` 属性、以及
 *   `Terminal` 那个限高框在不在 —— 不断言类名(vitest 的 CSS Module 代理对任何 key
 *   都返回类名)。
 * · 「没有原文」那一档配了反向对照:必须**不是** `<details>`。否则「一律折叠」
 *   也能让上面全绿,而一个展不开的折叠块比单行更糟。
 * · 最后一组从 `build-turn-blocks` 的真事件流验起(`tool_result` 带 `isError`),
 *   不手搓 `row.failReason`。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { ToolRow } from '../../../src/components/chat/primitives/ToolRow';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ToolRow as ToolRowData, TurnBlock } from '../../../src/runtime/chat/contract';

afterEach(cleanup);

function render(ui: ReactElement) {
  const wrap = (node: ReactElement) => <I18nProvider initial="zh-CN">{node}</I18nProvider>;
  const result = rtlRender(wrap(ui));
  return { ...result, rerender: (next: ReactElement) => result.rerender(wrap(next)) };
}

/** 一段真实体量的 stderr:多行,几百字符,单行放不下 */
const LONG_ERR = [
  "EACCES: permission denied, open '/Users/x/proj/dist/index.html'",
  '  at Object.openSync (node:fs:596:3)',
  '  at writeFileSync (node:fs:2350:35)',
  '  errno: -13, syscall: open, code: EACCES',
].join('\n');

function failedFile(over: Partial<ToolRowData> = {}): ToolRowData {
  return {
    kind: 'tool',
    id: 'f1',
    tool: 'write',
    name: 'Write',
    title: '写入 index.html',
    rawTitle: false,
    file: { path: 'dist/index.html', label: 'index.html' },
    pattern: null,
    hits: null,
    delta: null,
    elapsedMs: 1200,
    pending: false,
    failed: true,
    failReason: LONG_ERR,
    command: null,
    terminal: null,
    ...over,
  } as ToolRowData;
}

const fold = (): HTMLDetailsElement => {
  const el = document.querySelector<HTMLDetailsElement>('details');
  if (!el) throw new Error('折叠块没渲染出来 —— 有原文的失败文件行该是 <details>');
  return el;
};

describe('有报错原文:折叠块、默认展开、原文每一行都在 DOM 里', () => {
  it('是折叠块,而且默认展开(与失败命令行同一个 lifecycleOpen)', () => {
    render(<ToolRow row={failedFile()} />);
    expect(fold().open, '失败照旧默认摊开,报错原文是这时候唯一要读的东西').toBe(true);
  });

  it('原文的每一行都真的在 DOM 里 —— 这条才是 bug 的判据', () => {
    // 生产默认 deferBody=true;失败行默认展开,所以正文首帧就该挂上
    const { container } = render(<ToolRow row={failedFile()} deferBody />);
    for (const line of LONG_ERR.split('\n')) {
      expect(container.textContent, `报错原文缺了这一行:${line}`).toContain(line);
    }
  });

  it('原文走那个限高滚动框 —— 几百字符不许把整屏顶开', () => {
    const { container } = render(<ToolRow row={failedFile()} />);
    const box = container.querySelector('div[class*="term"]');
    expect(box, '复用 .term(max-height 104px + overflow-y auto),不另写一套').not.toBeNull();
    expect(box!.textContent).toContain('EACCES');
  });

  it('摘要逐字照抄稿子 :917 那一行:动词 + 文件名 + 「失败」+ 耗时', () => {
    render(<ToolRow row={failedFile()} />);
    const summary = fold().querySelector('summary');
    // zh-CN 的 `chat.record.verb.write` 是「**新建**」,不是「写入」—— 照抄产线文案
    expect(summary?.textContent, '动词').toContain('新建');
    expect(summary?.textContent, '文件名').toContain('index.html');
    expect(summary?.textContent, '稿子 :917 的「失败」标记').toContain('失败');
    expect(summary?.textContent, '稿子 :917 的耗时槽').toContain('1.2s');
  });

  it('摘要里**不再**把原文拼在文件名后面 —— 那是被合掉的「写法二」', () => {
    render(<ToolRow row={failedFile()} />);
    const summary = fold().querySelector('summary');
    expect(
      summary?.textContent,
      '原文归正文;摘要再拼一份,展开后同一段话会出现两遍',
    ).not.toContain('EACCES');
  });

  it('读取失败也一样(不是只有写入)', () => {
    render(<ToolRow row={failedFile({ tool: 'read', name: 'Read', failReason: 'File not found' })} />);
    expect(fold().open).toBe(true);
    expect(screen.getByText('File not found')).toBeTruthy();
    expect(fold().querySelector('summary')?.textContent).toContain('读取');
  });
});

describe('用户自己动过的,不许拨回去', () => {
  const echoToggle = (el: HTMLDetailsElement): void => {
    fireEvent(el, new Event('toggle', { bubbles: false }));
  };

  it('用户收起了这一条失败行,重渲染不许替他打开', () => {
    const { rerender } = render(<ToolRow row={failedFile()} />);
    echoToggle(fold()); // 摊开那一帧的回声,不算用户点过

    const summary = fold().querySelector<HTMLElement>('summary')!;
    fireEvent.click(summary);
    echoToggle(fold());
    expect(fold().open, '用户点了收起').toBe(false);

    rerender(<ToolRow row={failedFile({ elapsedMs: 1300 })} />);
    expect(fold().open, '用户收起过的,不许替他打开').toBe(false);
  });
});

describe('反向对照:没有原文的那一档仍然是单行', () => {
  /*
   * 一个**展不开**的折叠块比单行更糟(多一枚假的箭头)。所以「有没有原文」
   * 才是两种形状的判据 —— 这也正是合掉稿子那两种写法之后剩下的唯一区别。
   */
  it('failReason 为 null → 不是 <details>,是稿子 :917 那一行', () => {
    const { container } = render(<ToolRow row={failedFile({ failReason: null })} />);
    expect(document.querySelector('details'), '没原文可给就别摆一个展不开的箭头').toBeNull();
    expect(container.textContent).toContain('index.html');
    expect(screen.getByText('失败')).toBeTruthy();
    expect(container.textContent).toContain('1.2s');
  });

  it('原文整段是空白 → 和 null 同一档(build-turn-blocks 已回落成 null,这里守住渲染端)', () => {
    render(<ToolRow row={failedFile({ failReason: '   ' })} />);
    expect(document.querySelector('details')).toBeNull();
  });
});

describe('反向对照:没失败的文件行一个字都没改坏', () => {
  it('成功的写入行仍然是单行 + 改动量', () => {
    const { container } = render(<ToolRow row={failedFile({
      failed: false, failReason: null, delta: { added: 12, removed: 3 },
    })} />);
    expect(document.querySelector('details'), '成功的文件行不该被顺手改成折叠块').toBeNull();
    expect(container.textContent).toContain('+12');
    expect(container.textContent).toContain('3');
  });

  /*
   * ⚠️ 秒数不要拿 140 秒去测:`formatElapsed` 到分钟就换成 `2m 20s`,断言 `140.0s`
   * 会红在格式化上,读起来像秒表没接上。产品那句「写了 140 秒」说的是现象,不是这一层的量。
   */
  it('还在写的那一行:改动量和秒表都还在(2026-09-03 那条裁决不许被带走)', () => {
    const { container } = render(<ToolRow running row={failedFile({
      failed: false, failReason: null, pending: true,
      delta: { added: 40, removed: 0 }, elapsedMs: 4100,
    })} />);
    expect(container.textContent).toContain('+40');
    expect(container.textContent).toContain('4.1s');
  });
});

/* ── 整条链:tool_result.isError → row.failReason → 折叠块正文 ─────────────── */

describe('从真事件流验起(不手搓 failReason)', () => {
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

  const events: PersistedAgentEvent[] = ([
    { kind: 'tool_use', id: 'w1', name: 'Write', input: { file_path: 'dist/index.html', content: '<html/>' }, startedAt: 1000 },
    { kind: 'tool_result', toolUseId: 'w1', content: LONG_ERR, isError: true, completedAt: 2200 },
  ] as unknown as PersistedAgentEvent[]);

  it('daemon 的 isError 一路走到折叠块正文', () => {
    const rows = rowsOf(buildTurnBlocks({ events, runStatus: 'succeeded', nowMs: 3000 }));
    const row = rows.find((r) => r.failed);
    if (!row) throw new Error('fixture 坏了:事件流没产出失败行');
    expect(row.failReason, '原文原样递出,不截断').toBe(LONG_ERR);
    expect(row.file?.label).toBe('index.html');

    const { container } = render(<ToolRow row={row} deferBody />);
    expect(fold().open).toBe(true);
    expect(container.textContent).toContain('errno: -13');
  });
});
