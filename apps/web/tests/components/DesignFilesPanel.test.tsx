// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesignFilesPanel } from '../../src/components/DesignFilesPanel';
import type { ProjectFile } from '../../src/types';

function file(overrides: Partial<ProjectFile> & Pick<ProjectFile, 'name'>): ProjectFile {
  return {
    path: overrides.name,
    type: 'file',
    size: 1024,
    mtime: Date.now(),
    kind: 'html',
    mime: 'text/html',
    ...overrides,
  };
}

function renderPanel(files: ProjectFile[]) {
  return render(
    <DesignFilesPanel
      projectId="project-1"
      files={files}
      liveArtifacts={[]}
      onRefreshFiles={vi.fn()}
      onOpenFile={vi.fn()}
      onOpenLiveArtifact={vi.fn()}
      onDeleteFile={vi.fn()}
      onDeleteFiles={vi.fn()}
      onUpload={vi.fn()}
      onUploadFiles={vi.fn()}
      onPaste={vi.fn()}
      onNewSketch={vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DesignFilesPanel grouping', () => {
  it('does not show grouping controls when only live artifacts are available', () => {
    render(
      <DesignFilesPanel
        projectId="project-1"
        files={[]}
        liveArtifacts={[
          {
            kind: 'live-artifact',
            artifactId: 'artifact-1',
            tabId: 'live:artifact-1',
            projectId: 'project-1',
            title: 'Live Preview',
            slug: 'live-preview',
            status: 'active',
            refreshStatus: 'idle',
            pinned: false,
            preview: { type: 'html', entry: 'index.html' },
            hasDocument: true,
            updatedAt: '2026-05-09T12:00:00.000Z',
          },
        ]}
        onRefreshFiles={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDeleteFile={vi.fn()}
        onDeleteFiles={vi.fn()}
        onUpload={vi.fn()}
        onUploadFiles={vi.fn()}
        onPaste={vi.fn()}
        onNewSketch={vi.fn()}
      />,
    );

    expect(screen.queryByRole('group', { name: 'Group by' })).toBeNull();
    expect(screen.getByTestId('design-file-row-live:artifact-1')).toBeTruthy();
  });

  it('keeps kind grouping as the default view', () => {
    renderPanel([
      file({ name: 'page.html', kind: 'html', mime: 'text/html' }),
      file({ name: 'chart.png', kind: 'image', mime: 'image/png' }),
    ]);

    expect(screen.getByRole('button', { name: 'Kind' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByText('Pages')).toBeTruthy();
    expect(screen.getByText('Images')).toBeTruthy();
    expect(screen.queryByText('Today')).toBeNull();
  });

  it('can group files by modified date and collapse a date group', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel([
      file({ name: 'today.html', mtime: new Date(2026, 4, 9, 11).getTime() }),
      file({ name: 'yesterday.html', mtime: new Date(2026, 4, 8, 12).getTime() }),
    ]);

    expect(screen.getByText('Pages')).toBeTruthy();
    expect(screen.queryByText('Today')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getByTestId('design-file-row-today.html')).toBeTruthy();
    expect(screen.getByTestId('design-file-row-yesterday.html')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Collapse Today/i }));

    expect(screen.queryByTestId('design-file-row-today.html')).toBeNull();
    expect(screen.getByTestId('design-file-row-yesterday.html')).toBeTruthy();
  });

  it('keeps files from seven calendar days ago in the previous 7 days group', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel([file({ name: 'week-old.html', mtime: new Date(2026, 4, 2, 12).getTime() })]);

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));

    expect(screen.getByText('Previous 7 days')).toBeTruthy();
    expect(screen.queryByText('Previous 30 days')).toBeNull();
    expect(screen.getByTestId('design-file-row-week-old.html')).toBeTruthy();
  });

  it('keeps files at the seven calendar day boundary in the previous 7 days group', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel([
      file({ name: 'week-boundary.html', mtime: new Date(2026, 4, 2, 0, 0, 0, 0).getTime() }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));

    expect(screen.getByText('Previous 7 days')).toBeTruthy();
    expect(screen.queryByText('Previous 30 days')).toBeNull();
    expect(screen.getByTestId('design-file-row-week-boundary.html')).toBeTruthy();
  });

  it('keeps files from thirty calendar days ago in the previous 30 days group', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel([
      file({ name: 'month-old.html', mtime: new Date(2026, 3, 9, 12).getTime() }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));

    expect(screen.getByText('Previous 30 days')).toBeTruthy();
    expect(screen.queryByText('Older')).toBeNull();
    expect(screen.getByTestId('design-file-row-month-old.html')).toBeTruthy();
  });

  it('keeps files at the thirty calendar day boundary in the previous 30 days group', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel([
      file({
        name: 'month-boundary.html',
        mtime: new Date(2026, 3, 9, 0, 0, 0, 0).getTime(),
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));

    expect(screen.getByText('Previous 30 days')).toBeTruthy();
    expect(screen.queryByText('Older')).toBeNull();
    expect(screen.getByTestId('design-file-row-month-boundary.html')).toBeTruthy();
  });

  it('groups files older than thirty calendar days into older', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel([file({ name: 'archive.html', mtime: new Date(2026, 3, 8, 12).getTime() })]);

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));

    expect(screen.getByText('Older')).toBeTruthy();
    expect(screen.queryByText('Previous 30 days')).toBeNull();
    expect(screen.getByTestId('design-file-row-archive.html')).toBeTruthy();
  });

  it('keeps modified groups paginated and expandable', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel(
      Array.from({ length: 31 }, (_, i) =>
        file({ name: `today-${String(i + 1).padStart(2, '0')}.html`, mtime: now - i }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));

    expect(screen.getByTestId('design-file-row-today-01.html')).toBeTruthy();
    expect(screen.queryByTestId('design-file-row-today-31.html')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show +1 more' }));

    expect(screen.getByTestId('design-file-row-today-31.html')).toBeTruthy();
  });

  it('can select and clear an entire modified group', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel([
      file({ name: 'today-a.html', mtime: new Date(2026, 4, 9, 11).getTime() }),
      file({ name: 'today-b.html', mtime: new Date(2026, 4, 9, 10).getTime() }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));

    expect(screen.getByTitle('Download 2 as ZIP')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.queryByTitle('Download 2 as ZIP')).toBeNull();
  });
});
