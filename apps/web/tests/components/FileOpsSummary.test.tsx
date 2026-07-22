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
    expect(screen.getByText(/Edit 4/)).toBeTruthy();
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
