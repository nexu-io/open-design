// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileOpsSummary } from '../../src/components/FileOpsSummary';
import type { FileOpEntry } from '../../src/runtime/file-ops';

function entry(partial: Partial<FileOpEntry> & { path: string }): FileOpEntry {
  return {
    fullPath: `/repo/${partial.path}`,
    ops: ['write'],
    opCounts: { read: 0, write: 1, edit: 0, delete: 0 },
    total: 1,
    status: 'done',
    ...partial,
  };
}

describe('FileOpsSummary', () => {
  afterEach(() => cleanup());

  it('renders nothing when there are no entries', () => {
    const { container } = render(
      <FileOpsSummary entries={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one produced file as a framed direct row without a redundant title card', () => {
    const { container } = render(
      <FileOpsSummary
        entries={[
          entry({ path: 'result.html', ops: ['write'], opCounts: { read: 0, write: 1, edit: 0, delete: 0 } }),
        ]}
      />,
    );

    expect(screen.getByTestId('file-ops-row-result.html')).toBeTruthy();
    expect(container.querySelector('.file-ops')).not.toHaveClass('file-ops--single');
    expect(screen.queryByTestId('file-ops-toggle')).toBeNull();
    expect(screen.queryByText('Files from this turn')).toBeNull();
  });

  it('shows up to four files directly without inheriting the run state', () => {
    const { container } = render(
      <FileOpsSummary
        entries={[
          entry({ path: 'a.ts', ops: ['read', 'edit'], opCounts: { read: 2, write: 0, edit: 1, delete: 0 }, total: 3 }),
          entry({ path: 'b.ts', ops: ['write'], opCounts: { read: 0, write: 1, edit: 0, delete: 0 } }),
          entry({ path: 'c.ts', ops: ['edit'], opCounts: { read: 0, write: 0, edit: 3, delete: 0 }, total: 3 }),
          entry({ path: 'd.ts', ops: ['write'], opCounts: { read: 0, write: 1, edit: 0, delete: 0 } }),
        ]}
      />,
    );

    expect(screen.getByText(/Write 2/)).toBeTruthy();
    // #5909: the "Files from this turn" header counts unique produced files,
    // not write operations. c.ts was edited three times but is one file, so
    // the edit total is 2 (a.ts + c.ts), not the op-level count of 4.
    expect(screen.getByText(/Edit 2/)).toBeTruthy();
    expect(screen.queryByText(/Delete/)).toBeNull();
    expect(screen.queryByText(/Read/)).toBeNull();
    expect(screen.getByTestId('file-ops-row-a.ts')).toBeTruthy();
    expect(screen.getByTestId('file-ops-row-b.ts')).toBeTruthy();
    expect(container.querySelector('.file-ops')).not.toHaveClass('is-streaming');
    const toggle = screen.getByTestId('file-ops-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBeNull();
  });

  it('shows small completed result sets without a disclosure click', () => {
    render(
      <FileOpsSummary
        entries={[
          entry({ path: 'a.ts', ops: ['read', 'edit'], opCounts: { read: 1, write: 0, edit: 1, delete: 0 }, total: 2 }),
          entry({ path: 'b.ts', ops: ['write'], opCounts: { read: 0, write: 1, edit: 0, delete: 0 } }),
        ]}
      />,
    );

    expect(screen.getByTestId('file-ops-row-a.ts')).toBeTruthy();
    expect(screen.getByTestId('file-ops-row-b.ts')).toBeTruthy();
  });

  it('keeps a small result set visible across rerenders', () => {
    const { rerender } = render(
      <FileOpsSummary
        entries={[entry({ path: 'a.ts' })]}
      />,
    );
    expect(screen.getByTestId('file-ops-row-a.ts')).toBeTruthy();

    rerender(
      <FileOpsSummary
        entries={[entry({ path: 'a.ts' })]}
      />,
    );
    expect(screen.getByTestId('file-ops-row-a.ts')).toBeTruthy();
  });

  it('shows the first four files and collapses only the remaining rows', () => {
    render(
      <FileOpsSummary
        entries={[
          entry({ path: 'a.ts' }),
          entry({ path: 'b.ts' }),
          entry({ path: 'c.ts' }),
          entry({ path: 'd.ts' }),
          entry({ path: 'e.ts' }),
        ]}
      />,
    );

    const toggle = screen.getByTestId('file-ops-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('file-ops-row-a.ts')).toBeTruthy();
    expect(screen.getByTestId('file-ops-row-d.ts')).toBeTruthy();
    expect(screen.queryByTestId('file-ops-row-e.ts')).toBeNull();
    expect(screen.getByText('+1 more')).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('file-ops-row-e.ts')).toBeTruthy();
  });

  it('shows the open button only for files that are present in the project file set', () => {
    const onRequestOpenFile = vi.fn();
    render(
      <FileOpsSummary
        entries={[
          entry({ path: 'a.ts' }),
          entry({ path: 'missing.ts' }),
        ]}
        projectFileNames={new Set(['a.ts'])}
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    expect(screen.getByTestId('file-ops-row-open-a.ts')).toBeTruthy();
    expect(screen.queryByTestId('file-ops-row-open-missing.ts')).toBeNull();

    fireEvent.click(screen.getByTestId('file-ops-row-open-a.ts'));
    expect(onRequestOpenFile).toHaveBeenCalledWith('a.ts');
  });

  it('keeps the header free of a redundant open action', () => {
    const onRequestOpenFile = vi.fn();
    render(
      <FileOpsSummary
        entries={[
          entry({ path: 'input.ts' }),
          entry({ path: 'result.ts', ops: ['write'], opCounts: { read: 0, write: 1, edit: 0, delete: 0 } }),
          entry({ path: 'third.ts' }),
          entry({ path: 'fourth.ts' }),
          entry({ path: 'fifth.ts' }),
        ]}
        projectFileNames={new Set(['input.ts', 'result.ts', 'third.ts', 'fourth.ts', 'fifth.ts'])}
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    expect(screen.queryByTestId('file-ops-primary-open-result.ts')).toBeNull();
    fireEvent.click(screen.getByTestId('file-ops-row-open-result.ts'));
    expect(onRequestOpenFile).toHaveBeenCalledWith('result.ts');
    expect(screen.getByTestId('file-ops-toggle').getAttribute('aria-expanded')).toBe('false');
  });

  it('does not show the open button for deleted files', () => {
    const onRequestOpenFile = vi.fn();
    render(
      <FileOpsSummary
        entries={[
          entry({ path: 'gone.ts', ops: ['delete'], opCounts: { read: 0, write: 0, edit: 0, delete: 1 } }),
        ]}
        projectFileNames={new Set(['gone.ts'])}
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    expect(screen.getByTestId('file-ops-row-gone.ts')).toBeTruthy();
    expect(screen.queryByTestId('file-ops-row-open-gone.ts')).toBeNull();
  });

  it('keeps execution history and run state out of artifact rows', () => {
    render(
      <FileOpsSummary
        entries={[
          entry({
            path: 'index.html',
            ops: ['read', 'edit'],
            opCounts: { read: 1, write: 0, edit: 1, delete: 0 },
            total: 2,
            status: 'running',
          }),
        ]}
      />,
    );
    const row = screen.getByTestId('file-ops-row-index.html');
    expect(row.className).not.toContain('file-ops-row--running');
    expect(row.querySelector('.file-ops-badge--edit')).toBeTruthy();
    expect(row.querySelector('.file-ops-badge--read')).toBeNull();
    expect(row.querySelectorAll('.file-ops-badge')).toHaveLength(1);
    expect(row.querySelector('.file-ops-badge--edit svg')).toBeTruthy();
    expect(row.querySelector('.file-ops-badge--edit')?.textContent).toBe('');
    expect(row.querySelector('.file-ops-row-status')).toBeNull();
    expect(screen.queryByText('running…')).toBeNull();
  });
});

// Component 14 — design matrix grids 30-33. Cards only appear once a project
// id is available, because both the thumbnail and the export href are
// project-scoped URLs.
describe('FileOpsSummary artifact cards', () => {
  afterEach(() => cleanup());

  it('keeps text rows when no project id is available', () => {
    render(<FileOpsSummary entries={[entry({ path: 'result.html' })]} />);

    expect(screen.queryByTestId('artifact-cards')).toBeNull();
    expect(screen.getByTestId('file-ops-row-result.html')).toBeTruthy();
  });

  it('renders an artifact as a card that writes no filename and carries no preview button', () => {
    render(
      <FileOpsSummary
        entries={[entry({ path: 'result.html' })]}
        projectId="proj-1"
        onRequestOpenFile={vi.fn()}
      />,
    );

    const card = screen.getByTestId('artifact-card-result.html');
    expect(card.textContent).not.toContain('result.html');
    expect(screen.queryByTestId('file-ops-row-result.html')).toBeNull();
    // 卡片形态下**不出文本列表**;但「这一轮的产物面板」这个身份要留着 ——
    // 「一条消息只出一个产物面板」那条不变量(P0 recvqaerXd82bE)靠它来守
    expect(document.querySelector('.file-ops-list')).toBeNull();
    expect(screen.queryByTestId('file-ops-summary')).not.toBeNull();
    // The card itself is the preview entry (D28) — no separate preview action.
    expect(card.querySelectorAll('.artifact-card-act')).toHaveLength(1);
  });

  it('renders one card when a historical run reports the same artifact twice', () => {
    render(
      <FileOpsSummary
        entries={[
          entry({ path: 'result.html', fullPath: '/first/result.html' }),
          entry({ path: 'result.html', fullPath: '/second/result.html' }),
        ]}
        projectId="proj-1"
      />,
    );

    expect(screen.getAllByTestId('artifact-card-result.html')).toHaveLength(1);
  });

  it('gives an HTML artifact both publish and export, in that order', () => {
    const onPublish = vi.fn();
    const onExport = vi.fn();
    render(
      <FileOpsSummary
        entries={[entry({ path: 'landing.html' })]}
        projectId="proj-1"
        onPublish={onPublish}
        onExport={onExport}
      />,
    );

    const acts = Array.from(
      screen
        .getByTestId('artifact-card-landing.html')
        .querySelectorAll('.artifact-card-act'),
    );
    expect(acts).toHaveLength(2);
    expect(acts[0]).toBe(screen.getByTestId('artifact-card-publish-landing.html'));
    expect(acts[1]).toBe(screen.getByTestId('artifact-card-export-landing.html'));

    /*
     * 两枚都**不在卡上画菜单**:它们把「哪份产物 + 锚在哪枚按钮上」交给预览区,
     * 由预览区把**它本来那两块菜单**开在这枚按钮旁边(产品 2026-08-27:
     * 「为啥不直接复用现在那个分享弹窗??」「导出这个样式也不对呢, 为啥不直接复用?」)。
    */
    fireEvent.click(acts[0] as HTMLElement);
    expect(onPublish).toHaveBeenCalledWith(
      'landing.html',
      expect.stringMatching(/^publish:[^:]+:landing\.html$/),
    );
    fireEvent.click(acts[1] as HTMLElement);
    expect(onExport).toHaveBeenCalledWith(
      'landing.html',
      expect.stringMatching(/^export:[^:]+:landing\.html$/),
    );
  });

  it('leaves a non-HTML artifact with export alone (grid 32)', () => {
    render(
      <FileOpsSummary
        entries={[entry({ path: 'poster.png' })]}
        projectId="proj-1"
        onPublish={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('artifact-card-publish-poster.png')).toBeNull();
    expect(screen.getByTestId('artifact-card-export-poster.png')).toBeTruthy();
  });

  it('exports through a direct download when the parent supplies no handler', () => {
    render(
      <FileOpsSummary entries={[entry({ path: 'poster.png' })]} projectId="proj-1" />,
    );

    const exportLink = screen.getByTestId('artifact-card-export-poster.png');
    expect(exportLink.tagName).toBe('A');
    expect(exportLink.getAttribute('download')).toBe('poster.png');
    expect(exportLink.getAttribute('href')).toBe('/api/projects/proj-1/raw/poster.png');
  });

  it('presses nothing onto a video card and letterboxes it (grid 33)', () => {
    render(
      <FileOpsSummary
        entries={[entry({ path: 'reveal.mp4' })]}
        projectId="proj-1"
        onPublish={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    const card = screen.getByTestId('artifact-card-reveal.mp4');
    expect(card.className).toContain('artifact-card--video');
    expect(screen.queryByTestId('artifact-card-publish-reveal.mp4')).toBeNull();
    expect(card.querySelectorAll('.artifact-card-act')).toHaveLength(1);
  });

  it('shows a still-writing artifact as a placeholder with no actions (D37)', () => {
    render(
      <FileOpsSummary
        entries={[entry({ path: 'result.html', status: 'running' })]}
        projectId="proj-1"
        onRequestOpenFile={vi.fn()}
        onPublish={vi.fn()}
        onExport={vi.fn()}
        /*
         * 「还在写」需要**轮次也还在跑**。轮次结束之后 `status: 'running'` 只说明
         * 那条 `tool_result` 丢了,不说明还在写 —— 挂一张永远转下去的 loading 卡
         * 是在撒谎(分叉出来的会话尤其明显,用户真机指认过)。这一条原来没传这个
         * 旗标,断言的其实是修掉那个谎之前的形态。
         */
        turnIsLive
      />,
    );

    const card = screen.getByTestId('artifact-card-result.html');
    expect(card.className).toContain('is-pending');
    expect(card.querySelector('.artifact-card-mini')).toBeTruthy();
    expect(card.querySelector('.artifact-card-acts')).toBeNull();
    expect(screen.queryByTestId('artifact-card-open-result.html')).toBeNull();
  });

  /**
   * 拿不出缩略图的产出(md / csv / 源码)走 `doc` 卡,**不是**文本行。
   *
   * 这一条原来断言的是「notes.md 留在文本列表里」。那是两条产物面板路径里的
   * 一条:同一份 `notes.md` 在「没有工具行」的那一轮里是一张 `doc` 卡
   * (`producedArtifactCardKind`),在这一轮里却是一行灰字 —— 同一个面板两副
   * 长相。收口的时候按用户 2026-08-26 对着灰列表的裁决走:「变成上面卡片形式
   * 才对」。
   *
   * ⚠️ 这一处与设计稿组件 13 的散文有张力(「顺手生成的文件(组件、样式、
   * csv、md)都不是这一轮的主产物,不给它们各来一张大卡」)。稿子里确实没有
   * `doc` 卡这一档 —— 它只画了缩略图能答话的那三种。翻回去只要把
   * `producedArtifactCardKind` 换回 `artifactCardKind` 一行,等产品裁决。
   */
  it('cards non-thumbnail artifacts too, and keeps deletions out of the cards', () => {
    render(
      <FileOpsSummary
        entries={[
          entry({ path: 'result.html' }),
          entry({ path: 'notes.md' }),
          entry({
            path: 'old.png',
            ops: ['delete'],
            opCounts: { read: 0, write: 0, edit: 0, delete: 1 },
          }),
        ]}
        projectId="proj-1"
      />,
    );

    expect(screen.getByTestId('artifact-card-result.html')).toBeTruthy();
    expect(screen.getByTestId('artifact-card-notes.md')).toBeTruthy();
    expect(screen.getByTestId('artifact-card-notes.md').getAttribute('data-kind')).toBe('doc');
    // 删掉的文件**不出卡** —— 一张带预览的卡对一个已经不在的文件是假话
    expect(screen.queryByTestId('artifact-card-old.png')).toBeNull();
    expect(screen.getByTestId('file-ops-row-old.png')).toBeTruthy();
  });
});
