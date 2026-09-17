// @vitest-environment jsdom
/**
 * 执行记录里的文件名,在**界面上**到底还是不是一颗按钮。
 *
 * 产品 2026-08-27:「这些文件不要变成可点击的.. 因为读的不一定是我们项目文件夹下的文件....」
 * 判据与理由写在 `runtime/chat/record-file-open.ts` 的注释里,那一层有自己的纯函数单测;
 * 这一条守的是**接线**:规则算出来了,组件有没有真的照着渲染。
 *
 * ## 成对断言,别把线全拆了也能过
 *
 * 只写「读的那一行不是按钮」是可以被一个「把所有文件名都拆成纯文本」的改动骗过去的。
 * 所以每一条都配一条反面:
 *   · 读 → 不是按钮   **配**  写 → 仍然是按钮,点了还能开
 *   · 项目外的写 → 不是按钮  **配**  项目内的写 → 是按钮
 *   · 不是按钮的那一档,连**可聚焦**都不许剩(原来 `FileButton` 在没有 `onOpen` 时
 *     照样吐一颗 `<button>`,只是不挂 onClick —— 键盘能 Tab 到、读屏念「打开 X」,
 *     按下去什么都不发生。那不叫「不可点」,那叫「点了没反应」)。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ToolRow } from '../../../src/components/chat/primitives/ToolRow';
import type { ToolRow as ToolRowData } from '../../../src/runtime/chat/contract';

afterEach(() => { cleanup(); });

function render(ui: ReactElement) {
  return rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);
}

const PROJECT_DIR = '/Users/me/.od/projects/p1';
const SCOPE = {
  projectId: 'p1',
  projectResolvedDir: PROJECT_DIR,
  projectFileNames: new Set(['index.html', 'checklist.md']),
};

function row(over: Partial<ToolRowData> = {}): ToolRowData {
  return {
    kind: 'tool',
    id: 't1',
    tool: 'read',
    name: 'Read',
    title: '读取',
    rawTitle: false,
    /* 没回来的调用才是 pending —— 这几份 fixture 造的都是**已经回来**的行 */
    pending: false,
    file: null,
    pattern: null,
    hits: null,
    delta: null,
    elapsedMs: null,
    failed: false,
    failReason: null,
    command: null,
    terminal: null,
    ...over,
  };
}

const file = (path: string) => ({ path, label: path.split('/').pop() ?? path });

describe('读取那一行:文件名不是按钮', () => {
  it('技能资源(.od-skills)只是文字,既点不动也 Tab 不到', () => {
    const onOpenFile = vi.fn();
    render(
      <ToolRow
        row={row({ tool: 'read', file: file(`${PROJECT_DIR}/.od-skills/deck/template.html`) })}
        onOpenFile={onOpenFile}
        fileScope={SCOPE}
      />,
    );

    // 名字还在 —— 撤的是链接,不是信息
    expect(screen.getByText('template.html')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /template\.html/ })).toBeNull();
    expect(document.querySelector('button')).toBeNull();
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it('读项目自己的文件也不做链接 —— 这一档不留例外', () => {
    render(
      <ToolRow
        row={row({ tool: 'read', file: file(`${PROJECT_DIR}/index.html`) })}
        onOpenFile={vi.fn()}
        fileScope={SCOPE}
      />,
    );
    expect(screen.getByText('index.html')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /index\.html/ })).toBeNull();
  });
});

describe('写 / 改那一行:项目内的仍然点得开', () => {
  it('写在项目里 —— 仍然是按钮,点了拿到项目相对路径', () => {
    const onOpenFile = vi.fn();
    render(
      <ToolRow
        row={row({ tool: 'write', name: 'Write', title: '新建', file: file(`${PROJECT_DIR}/index.html`) })}
        onOpenFile={onOpenFile}
        fileScope={SCOPE}
      />,
    );

    const btn = screen.getByRole('button', { name: '打开 index.html' });
    fireEvent.click(btn);
    // 打开回调按**项目相对文件名**匹配(`requestOpenFile` → FileWorkspace),
    // 把 agent 那个绝对路径原样递过去是开不出来的
    expect(onOpenFile).toHaveBeenCalledWith('index.html');
  });

  it('改文件同理', () => {
    const onOpenFile = vi.fn();
    render(
      <ToolRow
        row={row({ tool: 'edit', name: 'Edit', title: '改写', file: file(`${PROJECT_DIR}/index.html`) })}
        onOpenFile={onOpenFile}
        fileScope={SCOPE}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '打开 index.html' }));
    expect(onOpenFile).toHaveBeenCalledWith('index.html');
  });

  it('写到项目之外 —— 不做链接', () => {
    render(
      <ToolRow
        row={row({ tool: 'write', name: 'Write', title: '新建', file: file('/Users/me/Desktop/out.html') })}
        onOpenFile={vi.fn()}
        fileScope={SCOPE}
      />,
    );
    expect(screen.getByText('out.html')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /out\.html/ })).toBeNull();
  });
});

describe('搜索 / 执行:那两处本来就不该是按钮', () => {
  it('搜索模式不是按钮(它连文件都不是)', () => {
    render(<ToolRow row={row({ tool: 'search', pattern: 'gap', hits: 2 })} onOpenFile={vi.fn()} />);
    expect(screen.getByText('gap')).toBeTruthy();
    expect(document.querySelector('button')).toBeNull();
  });

  it('「执行 <命令>」那一行的命令不是按钮', () => {
    render(
      <ToolRow
        row={row({ tool: 'exec', name: 'Bash', title: 'ls -la', rawTitle: true, command: 'ls -la' })}
        onOpenFile={vi.fn()}
      />,
    );
    expect(screen.getByText('ls -la')).toBeTruthy();
    expect(document.querySelector('button')).toBeNull();
  });
});
