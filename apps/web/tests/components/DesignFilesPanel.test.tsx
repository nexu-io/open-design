// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

beforeEach(() => {
  lsStore.clear();
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

function tabIds(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.df-tab')).map(
    (el) => el.getAttribute('data-testid')?.replace(/^design-files-tab-/, '') ?? '',
  );
}

function clickTab(id: string) {
  fireEvent.click(screen.getByTestId(`design-files-tab-${id}`));
}

describe('DesignFilesPanel sections', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('does not show grouping, sort, filter, or pagination chrome', () => {
    renderPanel(generateFiles(60));

    expect(screen.queryByRole('group', { name: 'Group by' })).toBeNull();
    expect(document.querySelector('.df-table')).toBeNull();
    expect(document.querySelector('.df-th-sortable')).toBeNull();
    expect(document.querySelector('.df-kind-filter')).toBeNull();
    expect(document.querySelector('.df-pagination')).toBeNull();
    expect(document.querySelector('.df-page-btn')).toBeNull();
  });

  it('renders a single-line toolbar with file actions and no up/refresh buttons', () => {
    renderPanel([file({ name: 'page.html', kind: 'html' })]);

    expect(document.querySelector('.df-topbar')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Up' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    expect(document.querySelector('.df-up-btn')).toBeNull();
    expect(document.querySelector('.df-refresh-control')).toBeNull();
    expect(screen.getByTestId('design-files-upload-trigger')).toBeTruthy();
  });

  it('shows prioritized project starter actions in the empty state', () => {
    const onNewSketch = vi.fn();
    const onOpenBrowser = vi.fn();
    const onCreateDesignSystem = vi.fn();

    renderPanel([], {
      onNewSketch,
      onOpenBrowser,
      onCreateDesignSystem,
    });

    fireEvent.click(screen.getByTestId('design-files-empty-new-sketch'));
    fireEvent.click(screen.getByTestId('design-files-empty-open-browser'));
    fireEvent.click(screen.getByTestId('design-files-empty-create-design-system'));

    expect(onNewSketch).toHaveBeenCalledTimes(1);
    expect(onOpenBrowser).toHaveBeenCalledTimes(1);
    expect(onCreateDesignSystem).toHaveBeenCalledTimes(1);
  });

  it('groups files into category tabs and shows one tab at a time', () => {
    renderPanel([
      file({ name: 'page.html', kind: 'html', mime: 'text/html' }),
      file({ name: 'chart.png', kind: 'image', mime: 'image/png' }),
    ]);

    // Only categories with content get a tab — no Scripts/Documents tabs here.
    expect(tabIds()).toEqual(['cat:html', 'cat:image']);
    // Pages is the default tab: its card renders, the image row does not.
    expect(screen.getByTestId('design-file-row-page.html')).toBeTruthy();
    expect(screen.queryByTestId('design-file-row-chart.png')).toBeNull();

    clickTab('cat:image');
    expect(screen.getByTestId('design-file-row-chart.png')).toBeTruthy();
    expect(screen.queryByTestId('design-file-row-page.html')).toBeNull();
  });

  it('splits stylesheets into their own tab with a Stylesheet subtitle', () => {
    renderPanel([
      file({ name: 'styles.css', kind: 'code', mime: 'text/css' }),
      file({ name: 'app.ts', kind: 'code', mime: 'text/typescript' }),
    ]);

    expect(tabIds()).toEqual(['cat:stylesheet', 'cat:code']);

    // No Pages here, so the first tab (Stylesheets) is active by default.
    const cssRow = screen.getByTestId('design-file-row-styles.css');
    expect(cssRow.querySelector('.df-row-sub')?.textContent).toBe('Stylesheet');

    clickTab('cat:code');
    const tsRow = screen.getByTestId('design-file-row-app.ts');
    expect(tsRow.querySelector('.df-row-sub')?.textContent).toBe('Script');
  });

  it('renders image cards as the bare picture without a name/meta strip', () => {
    renderPanel([file({ name: 'chart.png', kind: 'image', size: 4096 })]);

    const card = screen.getByTestId('design-file-row-chart.png');
    expect(card.querySelector('img')).toBeTruthy();
    expect(card.querySelector('.df-card-meta')).toBeNull();
    expect(card.querySelector('.df-card-name')).toBeNull();
    expect(card.textContent).not.toContain('KB');
  });

});

describe('DesignFilesPanel large list', () => {
  afterEach(() => cleanup());

  it('renders every entry of the active tab at once (no pagination)', () => {
    const { container } = renderPanel(generateFiles(500));
    // HTML pages render as thumbnail cards; every other kind stays a row.
    // One tab renders at a time — sum entries across all category tabs.
    let total = 0;
    let cards = 0;
    for (const id of tabIds()) {
      clickTab(id);
      total += container.querySelectorAll('.df-file-row').length;
      total += container.querySelectorAll('.df-card').length;
      cards += container.querySelectorAll('.df-card').length;
      expect(container.querySelector('.df-pagination')).toBeNull();
    }
    expect(total).toBe(500);
    expect(cards).toBeGreaterThan(0);
  });

  it('renders 500 files within a reasonable time', () => {
    const files = generateFiles(500);
    const start = performance.now();
    renderPanel(files);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('DesignFilesPanel selection', () => {
  afterEach(() => cleanup());

  it('shows the batch bar and passes every selected file to batch delete', () => {
    const files = generateFiles(3);
    const { container, onDeleteFiles } = renderPanel(files);
    // generateFiles(3) yields one HTML page (card, default tab), one image
    // (masonry card) and one sketch behind their own tabs. Selection must
    // survive tab switches.
    const card = container.querySelector('.df-card')!;
    const cardName = card.getAttribute('data-testid')!.replace(/^design-file-row-/, '');
    fireEvent.click(card.querySelector('.df-card-check')!);

    clickTab('cat:image');
    const imageCard = container.querySelector('.df-card--image')!;
    const rowName = imageCard.getAttribute('data-testid')!.replace(/^design-file-row-/, '');
    fireEvent.click(imageCard.querySelector('.df-card-check')!);

    expect(container.querySelector('[data-testid="design-files-batch-bar"]')).toBeTruthy();

    fireEvent.click(container.querySelector('[data-testid="design-files-batch-delete"]')!);
    expect(onDeleteFiles).toHaveBeenCalledTimes(1);
    expect(onDeleteFiles).toHaveBeenCalledWith([cardName, rowName]);
  });

  it('does not open files from selection or menu controls', () => {
    const files = generateFiles(2);
    const { container, onOpenFile } = renderPanel(files);
    const card = container.querySelector('.df-card')!;
    fireEvent.click(card.querySelector('.df-card-check')!);
    fireEvent.click(card.querySelector('.df-row-menu')!);
    expect(onOpenFile).not.toHaveBeenCalled();

    clickTab('cat:image');
    const imageCard = container.querySelector('.df-card--image')!;
    fireEvent.click(imageCard.querySelector('.df-card-check')!);
    fireEvent.click(imageCard.querySelector('.df-row-menu')!);
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it('opens files from card and row click targets', () => {
    const files = generateFiles(2);
    const { container, onOpenFile } = renderPanel(files);

    const card = container.querySelector('.df-card')!;
    fireEvent.click(card.querySelector('.df-card-thumb')!);
    expect(onOpenFile).toHaveBeenCalledWith('file-1.html');
    onOpenFile.mockClear();

    clickTab('cat:image');
    const imageCard = container.querySelector('.df-card--image')!;
    fireEvent.click(imageCard.querySelector('.df-card-thumb')!);
    expect(onOpenFile).toHaveBeenCalledWith('file-2.png');
  });

  it('starts an inline rename when the card name is clicked', () => {
    const files = generateFiles(1);
    const { container, onOpenFile } = renderPanel(files);

    const card = container.querySelector('.df-card')!;
    fireEvent.click(card.querySelector('.df-card-name-btn')!);

    expect(onOpenFile).not.toHaveBeenCalled();
    const input = card.querySelector<HTMLInputElement>('.df-rename-input');
    expect(input).toBeTruthy();
    expect(input!.value).toBe('file-1.html');
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

  it('puts folders behind their own Folders tab', () => {
    renderPanel([
      file({ name: 'assets/logo.png', kind: 'image' }),
      file({ name: 'top.html', kind: 'html' }),
    ]);

    expect(tabIds()).toContain('folders');
    clickTab('folders');
    const dirRows = document.querySelectorAll('.df-dir-row');
    expect(dirRows.length).toBe(1);
    expect(dirRows[0]!.textContent).toContain('assets');
  });

  it('clicking a folder row navigates into it and shows only basenames and nested dirs', () => {
    renderPanel([
      file({ name: 'assets/logo.png', kind: 'image' }),
      file({ name: 'assets/icons/star.svg', kind: 'image' }),
    ]);

    // No pages at the root, so the Folders tab is active by default.
    fireEvent.click(document.querySelector('.df-dir-row .df-row-name-btn')!);

    expect(document.querySelector('.df-breadcrumbs')).toBeTruthy();
    expect(document.querySelector('.df-breadcrumb-current')?.textContent).toBe('assets');

    const dirRows = document.querySelectorAll('.df-dir-row');
    expect(dirRows.length).toBe(1);
    expect(dirRows[0]!.textContent).toContain('icons');

    clickTab('cat:image');
    // Image cards are name-less; the nested file still renders inside the
    // folder via its full project-relative path.
    const fileCard = screen.getByTestId('design-file-row-assets/logo.png');
    expect(fileCard.querySelector('img')?.getAttribute('src')).toContain('assets/logo.png');
  });

  it('always renders the root breadcrumb on the default-root view', () => {
    // Regression: managed-storage projects have currentDir==='' and no
    // rootDirName, which previously collapsed the whole breadcrumb nav to null
    // and left the toolbar blank on the left for the most common path. The root
    // crumb must always render, falling back to the t('designFiles.crumbs')
    // label when no rootDirName exists.
    renderPanel([file({ name: 'top.html', kind: 'html' })]);

    expect(document.querySelector('.df-breadcrumbs')).toBeTruthy();
    expect(document.querySelector('.df-breadcrumb-current')?.textContent).toBe('Project');
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

    clickTab('folders');
    fireEvent.click(document.querySelector('.df-dir-row .df-row-name-btn')!);
    expect(document.querySelector('.df-breadcrumbs')).toBeTruthy();

    fireEvent.click(document.querySelector('.df-breadcrumb-btn')!);

    expect(document.querySelector('.df-breadcrumb-current')?.textContent).not.toBe('assets');
    // Back at the root the default Pages tab is active again.
    expect(screen.getByTestId('design-file-row-top.html')).toBeTruthy();
    clickTab('folders');
    expect(document.querySelectorAll('.df-dir-row').length).toBe(1);
  });

  it('includes subdirectory files in the flat root-level list', () => {
    renderPanel([
      file({ name: 'assets/logo.png', kind: 'image' }),
      file({ name: 'top.html', kind: 'html' }),
    ]);

    expect(screen.getByTestId('design-file-row-top.html')).toBeTruthy();
    clickTab('folders');
    expect(document.querySelectorAll('.df-dir-row').length).toBe(1);
    clickTab('cat:image');
    expect(screen.getByTestId('design-file-row-assets/logo.png')).toBeTruthy();
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

    clickTab('folders');
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

    const topCard = screen.getByTestId('design-file-row-top.html');
    fireEvent.click(topCard.querySelector('.df-card-check')!);
    expect(topCard.classList.contains('selected')).toBe(true);

    clickTab('folders');
    fireEvent.click(document.querySelector('.df-dir-row .df-row-name-btn')!);
    expect(document.querySelectorAll('.df-card.selected').length).toBe(0);

    fireEvent.click(document.querySelector('.df-breadcrumb-btn')!);
    expect(document.querySelectorAll('.df-card.selected').length).toBe(0);
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

    clickTab('folders');
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
    clickTab('folders');
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
    clickTab('folders');
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
