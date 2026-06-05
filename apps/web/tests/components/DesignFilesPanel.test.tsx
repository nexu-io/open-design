// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';

import { DesignFilesPanel, type DesignFilesNavState } from '../../src/components/DesignFilesPanel';
import type { ProjectFile, ProjectFileKind, ProjectFolder } from '../../src/types';

function folder(path: string): ProjectFolder {
  return { name: path.split('/').pop() ?? path, path, type: 'dir', size: 0, mtime: 1700000000 };
}

// Stub localStorage so the component's view-state persistence writes to an
// in-memory store. Cleared in beforeEach so no test bleeds state into the next.
const lsStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => lsStore.get(key) ?? null,
  setItem: (key: string, value: string) => { lsStore.set(key, value); },
  removeItem: (key: string) => { lsStore.delete(key); },
  clear: () => { lsStore.clear(); },
});

afterEach(() => {
  vi.restoreAllMocks();
});

function extForKind(kind: ProjectFileKind): string {
  if (kind === 'html') return 'html';
  if (kind === 'image') return 'png';
  if (kind === 'sketch') return 'sketch.json';
  if (kind === 'text') return 'txt';
  if (kind === 'code') return 'ts';
  if (kind === 'pdf') return 'pdf';
  return 'bin';
}

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

function generateFiles(count: number): ProjectFile[] {
  const kinds: ProjectFileKind[] = ['html', 'image', 'sketch', 'text', 'code', 'pdf'];
  return Array.from({ length: count }, (_, i) => {
    const kind = kinds[i % kinds.length]!;
    return file({
      name: `file-${i + 1}.${extForKind(kind)}`,
      kind,
      size: 1024 * (i + 1),
      mtime: Date.now() - i * 60_000,
      mime: 'text/plain',
    });
  });
}

function renderPanel(
  files: ProjectFile[],
  overrides: Partial<ComponentProps<typeof DesignFilesPanel>> = {},
) {
  const onOpenFile = vi.fn();
  const onDeleteFiles = vi.fn();
  const onClearUploadError = vi.fn();
  const result = render(
    <DesignFilesPanel
      projectId="test-project"
      files={files}
      liveArtifacts={[]}
      onRefreshFiles={vi.fn()}
      onOpenFile={onOpenFile}
      onOpenLiveArtifact={vi.fn()}
      onRenameFile={vi.fn()}
      onDeleteFile={vi.fn()}
      onDeleteFiles={onDeleteFiles}
      onUpload={vi.fn()}
      onUploadFiles={vi.fn()}
      onPaste={vi.fn()}
      onNewSketch={vi.fn()}
      onClearUploadError={onClearUploadError}
      {...overrides}
    />,
  );
  return { ...result, onDeleteFiles, onOpenFile, onClearUploadError };
}

function getPageInfo(container: HTMLElement): string {
  const el = container.querySelector('.df-page-info');
  return el?.textContent?.trim() ?? '';
}

function getPageBtns(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('.df-page-btn'));
}

function getSelects(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLSelectElement>('select'));
}

function sectionLabels(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.df-section-label')).map(
    (el) => el.textContent ?? '',
  );
}

describe('DesignFilesPanel grouping', () => {
  beforeEach(() => {
    lsStore.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

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
        onRenameFile={vi.fn()}
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

  it('groups files by kind when kind grouping is selected', () => {
    renderPanel([
      file({ name: 'page.html', kind: 'html', mime: 'text/html' }),
      file({ name: 'chart.png', kind: 'image', mime: 'image/png' }),
    ]);

    const sectionLabels = Array.from(
      document.querySelectorAll<HTMLElement>('.df-section-label'),
    ).map((el) => el.textContent ?? '');
    expect(sectionLabels.some((text) => text.includes('HTML page'))).toBe(true);
    expect(sectionLabels.some((text) => text.includes('Image'))).toBe(true);
    expect(screen.getByTestId('design-file-row-page.html')).toBeTruthy();
    expect(screen.getByTestId('design-file-row-chart.png')).toBeTruthy();
    expect(screen.queryByText('Today')).toBeNull();
  });

  it('keeps kind grouping selected by default', () => {
    renderPanel([
      file({ name: 'page.html', kind: 'html', mime: 'text/html' }),
      file({ name: 'chart.png', kind: 'image', mime: 'image/png' }),
    ]);

    const groupControls = screen.getByRole('group', { name: 'Group by' });
    const kindGroupButton = within(groupControls).getByRole('button', { name: 'Kind' });
    expect(kindGroupButton.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Name')).toBeTruthy();
    expect(document.querySelector('.df-th-kind')?.textContent).toContain('Kind');
    expect(screen.queryByText('Today')).toBeNull();
  });

  it('scopes the file browser to imported surface files and clears back to all files', () => {
    const onClearFileScope = vi.fn();
    renderPanel(
      [
        file({ name: 'apps/web/src/page.tsx', kind: 'code', mime: 'text/typescript' }),
        file({ name: 'apps/web/src/styles.css', kind: 'code', mime: 'text/css' }),
        file({ name: 'public/hero.png', kind: 'image', mime: 'image/png' }),
        file({ name: 'README.md', kind: 'text', mime: 'text/markdown' }),
      ],
      {
        fileScope: {
          id: 'surface:book',
          label: 'Book screen',
          fileNames: [
            'apps/web/src/page.tsx',
            'apps/web/src/styles.css',
            'public/hero.png',
          ],
          preferredFileName: 'apps/web/src/page.tsx',
        },
        onClearFileScope,
      },
    );

    expect(screen.getByText('Book screen')).toBeTruthy();
    expect(screen.getByTestId('design-file-row-apps/web/src/page.tsx')).toBeTruthy();
    expect(screen.getByTestId('design-file-row-apps/web/src/styles.css')).toBeTruthy();
    expect(screen.getByTestId('design-file-row-public/hero.png')).toBeTruthy();
    expect(screen.queryByTestId('design-file-row-README.md')).toBeNull();
    expect(document.querySelectorAll('.df-dir-row').length).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClearFileScope).toHaveBeenCalledTimes(1);
  });

  it('opens the rendered runtime URL for imported app HTML previews', async () => {
    const onOpenRenderedPreview = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/ui-surfaces')) {
        return json({
          surfaces: [
            {
              id: 'src-main-tsx',
              label: 'Home screen',
              route: '/',
              kind: 'react-app',
              confidence: 'medium',
              framework: 'Vite',
              entryFile: 'src/main.tsx',
              previewFile: 'index.html',
              previewRuntimeRoot: '',
              previewPath: '/',
              previewStatus: 'source-mapped',
              sourceFiles: ['index.html', 'src/main.tsx', 'src/App.tsx'],
              styleFiles: ['src/index.css'],
              scriptFiles: [],
              assetFiles: [],
              fontFiles: [],
              externalDependencies: [
                { packageName: 'react', importPath: 'react', kind: 'runtime' },
              ],
              reasons: ['React app entry and HTML shell detected'],
              mtime: 20,
            },
          ],
          generatedAt: '2026-06-02T00:00:00.000Z',
        });
      }
      if (url.includes('/ui-preview')) {
        expect(init).toEqual(expect.objectContaining({ method: 'POST' }));
        return json({
          status: 'ready',
          runtimeRoot: '',
          baseUrl: 'http://127.0.0.1:43210',
          url: 'http://127.0.0.1:43210/',
          route: '/',
        });
      }
      return new Response('<div>raw preview</div>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    });
    const { onOpenFile } = renderPanel(
      [
        file({ name: 'index.html', kind: 'html', mime: 'text/html', mtime: 20 }),
        file({ name: 'src/main.tsx', kind: 'code', mime: 'text/typescript', mtime: 19 }),
      ],
      { onOpenRenderedPreview },
    );

    fireEvent.click(within(screen.getByTestId('design-file-row-index.html')).getByRole('button', { name: /index\.html/i }));
    const preview = await screen.findByTestId('design-file-preview');
    fireEvent.click(within(preview).getByRole('button', { name: 'Open' }));

    await waitFor(() => {
      expect(onOpenRenderedPreview).toHaveBeenCalledWith({
        tabId: 'rendered-preview:index.html',
        title: 'index.html',
        url: 'http://127.0.0.1:43210/',
        sourceFile: 'index.html',
      });
    });
    expect(onOpenFile).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/test-project/ui-preview',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('can group files by modified date and collapse a date group', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel([
      file({ name: 'today.html', mtime: new Date(2026, 4, 9, 11).getTime() }),
      file({ name: 'yesterday.html', mtime: new Date(2026, 4, 8, 12).getTime() }),
    ]);

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
});

describe('DesignFilesPanel large list', () => {
  afterEach(() => cleanup());

  it('paginates large file lists and can jump pages', () => {
    const { container } = renderPanel(generateFiles(500));

    expect(container.querySelectorAll('.df-file-row').length).toBe(30);
    expect(getPageInfo(container)).toContain('1');
    expect(getPageInfo(container)).toContain('30');
    expect(getPageInfo(container)).toContain('500');

    const [prev, next] = getPageBtns(container);
    expect(prev!.disabled).toBe(true);
    expect(next!.disabled).toBe(false);

    fireEvent.click(next!);

    expect(getPageInfo(container)).toContain('31');
    expect(getPageInfo(container)).toContain('60');
    expect(prev!.disabled).toBe(false);
  });

  it('supports changing page size including All', () => {
    const { container } = renderPanel(generateFiles(80));
    const pageSizeSelect = screen.getByTestId('df-page-size-select');

    fireEvent.change(pageSizeSelect, { target: { value: '60' } });
    expect(container.querySelectorAll('.df-file-row').length).toBe(60);
    expect(getPageInfo(container)).toContain('1');
    expect(getPageInfo(container)).toContain('60');

    fireEvent.change(pageSizeSelect, { target: { value: 'all' } });
    expect(container.querySelectorAll('.df-file-row').length).toBe(80);
    expect(getPageBtns(container).length).toBe(0);
    expect(getSelects(container).some((select) => select.value === 'all')).toBe(true);
  });
});

describe('DesignFilesPanel selection', () => {
  afterEach(() => cleanup());

  it('shows selected-file actions and passes every selected file to batch delete', () => {
    const files = generateFiles(3);
    const { container, onDeleteFiles } = renderPanel(files);
    const rows = Array.from(container.querySelectorAll('.df-file-row'));

    const firstName = rows[0]!.getAttribute('data-testid')!.replace(/^design-file-row-/, '');
    const secondName = rows[1]!.getAttribute('data-testid')!.replace(/^design-file-row-/, '');
    fireEvent.click(rows[0]!.querySelector('.df-row-check')!);
    fireEvent.click(rows[1]!.querySelector('.df-row-check')!);

    expect(screen.getByText('Delete 2')).toBeTruthy();

    fireEvent.click(container.querySelector('[data-testid="design-files-batch-delete"]')!);
    expect(onDeleteFiles).toHaveBeenCalledTimes(1);
    expect(onDeleteFiles).toHaveBeenCalledWith([firstName, secondName]);
  });

  it('does not preview or open files from row controls', () => {
    const files = generateFiles(1);
    const { container, onOpenFile } = renderPanel(files);
    const row = container.querySelector('.df-file-row')!;

    fireEvent.click(row.querySelector('.df-row-check')!);
    expect(container.querySelector('[data-testid="design-file-preview"]')).toBeNull();
    expect(onOpenFile).not.toHaveBeenCalled();

    fireEvent.click(row.querySelector('.df-row-menu')!);
    expect(container.querySelector('[data-testid="design-file-preview"]')).toBeNull();
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it('uses non-control row targets to preview and open', () => {
    const files = generateFiles(1);
    const { container, onOpenFile } = renderPanel(files);
    const row = container.querySelector('.df-file-row')!;

    fireEvent.click(row.querySelector('.df-row-icon')!);
    expect(container.querySelector('[data-testid="design-file-preview"]')?.textContent).toContain(
      'file-1.html',
    );

    fireEvent.doubleClick(row.querySelector('.df-row-name-btn')!);
    expect(onOpenFile).toHaveBeenCalledWith('file-1.html');
    onOpenFile.mockClear();

    fireEvent.doubleClick(row.querySelector('.df-cell-time')!);
    expect(onOpenFile).toHaveBeenCalledWith('file-1.html');
  });
});

describe('DesignFilesPanel preview', () => {
  afterEach(() => cleanup());

  it('shows file size and modified time in the preview stats', () => {
    const { container } = renderPanel([file({ name: 'chart.png', kind: 'image', size: 4096 })]);
    fireEvent.click(container.querySelector('.df-file-row .df-row-icon')!);

    const stats = container.querySelector('.df-preview-stats')?.textContent ?? '';
    expect(stats).toContain('4.0 KB');
  });

  it('renders sketch files with the static sketch preview instead of a broken image', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      items: [
        {
          kind: 'rect',
          x: 20,
          y: 16,
          w: 120,
          h: 72,
          color: '#1c1b1a',
          size: 2,
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const sketchFile = file({
      name: 'board.sketch.json',
      path: 'board.sketch.json',
      kind: 'sketch',
      mime: 'application/json; charset=utf-8',
    });
    const { container } = renderPanel([sketchFile]);

    fireEvent.click(container.querySelector('.df-file-row .df-row-name-btn')!);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="sketch-preview-svg"]')).toBeTruthy();
    });
    expect(container.querySelector('.df-preview-thumb img')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/test-project/raw/board.sketch.json', { cache: 'no-store' });
  });
});

describe('DesignFilesPanel directory navigation', () => {
  afterEach(() => {
    cleanup();
  });

  it('collapses nested files into a single folder row at root with correct descendant count', () => {
    renderPanel([
      file({ name: 'assets/logo.png', kind: 'image' }),
      file({ name: 'assets/icons/star.svg', kind: 'image' }),
    ]);

    const dirRows = document.querySelectorAll('.df-dir-row');
    expect(dirRows.length).toBe(1);
    expect(dirRows[0]!.textContent).toContain('assets');
    expect(dirRows[0]!.textContent).toContain('2');
  });

  it('pins folders ahead of files at root', () => {
    renderPanel([
      file({ name: 'assets/logo.png', kind: 'image' }),
      file({ name: 'top.html', kind: 'html' }),
    ]);

    const firstBodyRow = document.querySelector('.df-table tbody tr');
    expect(firstBodyRow?.classList.contains('df-dir-row')).toBe(true);
    expect(firstBodyRow?.textContent).toContain('assets');
  });

  it('clicking a folder row navigates into it and shows only basenames and nested dirs', () => {
    renderPanel([
      file({ name: 'assets/logo.png', kind: 'image' }),
      file({ name: 'assets/icons/star.svg', kind: 'image' }),
    ]);

    fireEvent.click(document.querySelector('.df-dir-row .df-row-name-btn')!);

    expect(document.querySelector('.df-breadcrumbs')).toBeTruthy();
    expect(document.querySelector('.df-breadcrumb-current')?.textContent).toBe('assets');

    const fileRow = screen.getByTestId('design-file-row-assets/logo.png');
    expect(fileRow.querySelector('.df-row-name')?.textContent).toBe('logo.png');
    expect(fileRow.querySelector('.df-row-name')?.textContent).not.toContain('assets/');

    const dirRows = document.querySelectorAll('.df-dir-row');
    expect(dirRows.length).toBe(1);
    expect(dirRows[0]!.textContent).toContain('icons');
  });

  it('always renders the root breadcrumb on the default-root view', () => {
    // Regression: managed-storage projects have currentDir==='' and no
    // rootDirName, which previously collapsed the whole breadcrumb nav to null
    // and left the toolbar blank on the left for the most common path. The root
    // crumb must always render, falling back to the t('designFiles.crumbs')
    // label when no rootDirName exists.
    renderPanel([file({ name: 'top.html', kind: 'html' })]);

    expect(document.querySelector('.df-breadcrumbs')).toBeTruthy();
    expect(document.querySelector('.df-breadcrumb-current')?.textContent).toBe('project');
  });

  it('shows rootDirName as the root breadcrumb when one is provided', () => {
    renderPanel([file({ name: 'top.html', kind: 'html' })], {
      rootDirName: 'my-folder',
    });

    expect(document.querySelector('.df-breadcrumb-current')?.textContent).toBe('my-folder');
  });

  it('clicking the root breadcrumb navigates back to root', () => {
    renderPanel([
      file({ name: 'assets/logo.png', kind: 'image' }),
      file({ name: 'top.html', kind: 'html' }),
    ]);

    fireEvent.click(document.querySelector('.df-dir-row .df-row-name-btn')!);
    expect(document.querySelector('.df-breadcrumbs')).toBeTruthy();

    fireEvent.click(document.querySelector('.df-breadcrumb-btn')!);

    expect(document.querySelector('.df-breadcrumb-current')?.textContent).not.toBe('assets');
    expect(screen.getByTestId('design-file-row-top.html')).toBeTruthy();
    expect(document.querySelectorAll('.df-dir-row').length).toBe(1);
  });

  it('includes subdirectory files in the flat root-level list', () => {
    renderPanel([
      file({ name: 'assets/logo.png', kind: 'image' }),
      file({ name: 'top.html', kind: 'html' }),
    ]);

    expect(document.querySelectorAll('.df-dir-row').length).toBe(1);
    expect(screen.getByTestId('design-file-row-assets/logo.png')).toBeTruthy();
    expect(screen.getByTestId('design-file-row-top.html')).toBeTruthy();
  });

  it('preserves the current directory when remounted with navState from a previous render', () => {
    let saved: DesignFilesNavState | undefined;

    function makePanel(nav?: DesignFilesNavState) {
      return (
        <DesignFilesPanel
          projectId="test-project"
          files={[
            file({ name: 'assets/logo.png', kind: 'image' }),
            file({ name: 'top.html', kind: 'html' }),
          ]}
          liveArtifacts={[]}
          navState={nav}
          onNavStateChange={(state) => { saved = state; }}
          onRefreshFiles={vi.fn()}
          onOpenFile={vi.fn()}
          onOpenLiveArtifact={vi.fn()}
          onRenameFile={vi.fn()}
          onDeleteFile={vi.fn()}
          onDeleteFiles={vi.fn()}
          onUpload={vi.fn()}
          onUploadFiles={vi.fn()}
          onPaste={vi.fn()}
          onNewSketch={vi.fn()}
        />
      );
    }

    const { unmount } = render(makePanel());

    fireEvent.click(document.querySelector('.df-dir-row .df-row-name-btn')!);
    expect(document.querySelector('.df-breadcrumb-current')?.textContent).toBe('assets');

    unmount();
    render(makePanel(saved));

    expect(document.querySelector('.df-breadcrumb-current')?.textContent).toBe('assets');
    expect(screen.getByTestId('design-file-row-assets/logo.png')).toBeTruthy();
  });

  it('navigates up one level via the parent breadcrumb', () => {
    renderPanel([file({ name: 'assets/icons/star.svg', kind: 'image' })]);

    fireEvent.click(document.querySelector('.df-dir-row .df-row-name-btn')!);
    fireEvent.click(document.querySelector('.df-dir-row .df-row-name-btn')!);
    expect(document.querySelector('.df-breadcrumb-current')?.textContent).toBe('icons');

    const crumbs = Array.from(document.querySelectorAll('.df-breadcrumb-btn'));
    fireEvent.click(crumbs[crumbs.length - 1]!);
    expect(document.querySelector('.df-breadcrumb-current')?.textContent).toBe('assets');
  });

  it('clears selection when navigating into or out of a directory', () => {
    renderPanel([
      file({ name: 'assets/logo.png', kind: 'image' }),
      file({ name: 'top.html', kind: 'html' }),
    ]);

    const topRow = screen.getByTestId('design-file-row-top.html');
    fireEvent.click(topRow.querySelector('.df-row-check')!);
    expect(topRow.classList.contains('selected')).toBe(true);

    fireEvent.click(document.querySelector('.df-dir-row .df-row-name-btn')!);
    expect(document.querySelectorAll('.df-file-row.selected').length).toBe(0);

    fireEvent.click(document.querySelector('.df-breadcrumb-btn')!);
    expect(document.querySelectorAll('.df-file-row.selected').length).toBe(0);
  });

  it('resets currentDir automatically when all files in the current subdirectory are removed', () => {
    function makePanel(files: ProjectFile[]) {
      return (
        <DesignFilesPanel
          projectId="test-project"
          files={files}
          liveArtifacts={[]}
          onRefreshFiles={vi.fn()}
          onOpenFile={vi.fn()}
          onOpenLiveArtifact={vi.fn()}
          onRenameFile={vi.fn()}
          onDeleteFile={vi.fn()}
          onDeleteFiles={vi.fn()}
          onUpload={vi.fn()}
          onUploadFiles={vi.fn()}
          onPaste={vi.fn()}
          onNewSketch={vi.fn()}
        />
      );
    }

    const { rerender } = render(
      makePanel([
        file({ name: 'assets/logo.png', kind: 'image' }),
        file({ name: 'top.html', kind: 'html' }),
      ]),
    );

    fireEvent.click(document.querySelector('.df-dir-row .df-row-name-btn')!);
    expect(document.querySelector('.df-breadcrumb-current')?.textContent).toBe('assets');

    rerender(makePanel([file({ name: 'top.html', kind: 'html' })]));

    expect(document.querySelector('.df-breadcrumb-current')?.textContent).not.toBe('assets');
    expect(screen.getByTestId('design-file-row-top.html')).toBeTruthy();
  });
});

describe('DesignFilesPanel current-directory sync', () => {
  afterEach(() => cleanup());

  it('reports the active folder so new files are created under it, not the root', () => {
    const onCurrentDirChange = vi.fn();
    renderPanel(
      [
        file({ name: 'top.html', kind: 'html' }),
        file({ name: 'assets/logo.png', kind: 'image' }),
      ],
      { onCurrentDirChange },
    );
    // Mounts at the root.
    expect(onCurrentDirChange).toHaveBeenLastCalledWith('');
    // Navigate into the folder — the parent must learn the new target dir, or
    // upload / paste / new-sketch would create at the project root (#3358 regression).
    fireEvent.click(document.querySelector('.df-dir-row .df-row-name-btn')!);
    expect(onCurrentDirChange).toHaveBeenLastCalledWith('assets');
  });
});

describe('DesignFilesPanel persisted (empty) folders', () => {
  afterEach(() => cleanup());

  it('shows an empty persisted folder that has no files under it', () => {
    // Only a root file + an empty persisted folder; the folder must still
    // appear (it would vanish if we derived dirs from file paths alone).
    renderPanel([file({ name: 'top.html', kind: 'html' })], { folders: [folder('assets')] });
    const dirRows = [...document.querySelectorAll('.df-dir-row')];
    expect(dirRows.some((r) => r.textContent?.includes('assets'))).toBe(true);
  });

  it('surfaces a nested empty persisted folder after navigating into its parent', () => {
    renderPanel([], { folders: [folder('assets'), folder('assets/icons')] });
    // Zero files, but the persisted folder still renders the tree (not the
    // empty state), so 'assets' is navigable at the root.
    const rootDirs = [...document.querySelectorAll('.df-dir-row .df-row-name')].map((e) => e.textContent);
    expect(rootDirs).toContain('assets');
    fireEvent.click(document.querySelector('.df-dir-row .df-row-name-btn')!);
    const nestedDirs = [...document.querySelectorAll('.df-dir-row .df-row-name')].map((e) => e.textContent);
    expect(nestedDirs).toContain('icons');
  });
});

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
