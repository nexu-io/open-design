// @vitest-environment jsdom
//
// Red spec for bug #3a: view state (pageSize, sortKey, sortDir, kindFilter)
// resets on navigation because the component remounts via key={projectId}.
// These tests must go RED on origin/main and GREEN after the fix.

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesignFilesPanel } from '../../src/components/DesignFilesPanel';
import type { ProjectFile, ProjectFileKind } from '../../src/types';

// Minimal localStorage stub mirroring the pattern in state/config.test.ts
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key);
  }),
  clear: vi.fn(() => {
    store.clear();
  }),
});

function file(name: string, kind: ProjectFileKind = 'html', mtime = Date.now()): ProjectFile {
  return { path: name, name, type: 'file', size: 1024, mtime, kind, mime: 'text/html' };
}

function generateFiles(count: number): ProjectFile[] {
  const kinds: ProjectFileKind[] = ['html', 'image', 'sketch', 'text', 'code', 'pdf'];
  return Array.from({ length: count }, (_, i) => {
    const kind = kinds[i % kinds.length]!;
    return file(`file-${i + 1}.html`, kind, Date.now() - i * 60_000);
  });
}

function renderPanel(
  files: ProjectFile[],
  projectId = 'proj-a',
) {
  return render(
    <DesignFilesPanel
      projectId={projectId}
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
    />,
  );
}

function getPerPageSelect(container: HTMLElement): HTMLSelectElement {
  // The per-page select is the first select in the panel
  return container.querySelector<HTMLSelectElement>('.df-pagination-start select')!;
}

function getSortBtn(container: HTMLElement, label: string): HTMLElement {
  return Array.from(container.querySelectorAll<HTMLElement>('.df-th-btn')).find(
    (el) => el.textContent?.trim().startsWith(label),
  )!;
}

describe('DesignFilesPanel view-state persistence', () => {
  beforeEach(() => {
    store.clear();
    vi.mocked(localStorage.getItem).mockClear();
    vi.mocked(localStorage.setItem).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('restores pageSize from localStorage after remount', () => {
    const files = generateFiles(500);

    // First mount: change page size to 60
    const first = renderPanel(files);
    const sel = getPerPageSelect(first.container);
    fireEvent.change(sel, { target: { value: '60' } });
    first.unmount();

    // Second mount simulates navigation away and back (key={projectId} causes remount)
    const second = renderPanel(files);
    const restoredSel = getPerPageSelect(second.container);
    expect(restoredSel.value).toBe('60');
  });

  it('restores sort key from localStorage after remount', () => {
    const files = generateFiles(50);

    // First mount: click "Name" header to sort by name
    const first = renderPanel(files);
    fireEvent.click(getSortBtn(first.container, 'Name'));
    first.unmount();

    // Second mount: "Name" column should show the sort arrow
    const second = renderPanel(files);
    const nameBtn = getSortBtn(second.container, 'Name');
    expect(nameBtn.textContent).toContain('↑');
  });

  it('restores sort direction from localStorage after remount', () => {
    const files = generateFiles(50);

    // First mount: click "Name" twice to get desc
    const first = renderPanel(files);
    fireEvent.click(getSortBtn(first.container, 'Name'));
    fireEvent.click(getSortBtn(first.container, 'Name'));
    first.unmount();

    // Second mount: Name column should show desc arrow
    const second = renderPanel(files);
    const nameBtn = getSortBtn(second.container, 'Name');
    expect(nameBtn.textContent).toContain('↓');
  });

  it('restores kindFilter from localStorage after remount', () => {
    // Files with mixed kinds so the filter button appears
    const files = [
      file('a.html', 'html'),
      file('b.png', 'image'),
      file('c.txt', 'text'),
    ];

    // First mount: open the filter popover and check 'HTML page'
    const first = renderPanel(files);
    const filterTrigger = first.container.querySelector<HTMLElement>('.df-kind-filter-trigger');
    expect(filterTrigger).not.toBeNull();
    fireEvent.click(filterTrigger!);
    const checkboxes = first.container.querySelectorAll<HTMLInputElement>(
      '.df-kind-filter-list input[type="checkbox"]',
    );
    // Check the first checkbox (HTML)
    if (checkboxes[0]) fireEvent.click(checkboxes[0]);
    first.unmount();

    // Second mount: filter button should show active state (a kind is selected)
    const second = renderPanel(files);
    const trigger = second.container.querySelector('.df-kind-filter-trigger');
    expect(trigger?.classList.contains('active')).toBe(true);
  });

  it('does not bleed pageSize from one project into another', () => {
    const files = generateFiles(500);

    // Project A: set page size 60
    const first = renderPanel(files, 'proj-a');
    fireEvent.change(getPerPageSelect(first.container), { target: { value: '60' } });
    first.unmount();

    // Project B: should still have the default (30), not project A's setting
    const second = renderPanel(files, 'proj-b');
    expect(getPerPageSelect(second.container).value).toBe('30');
  });

  it('writes view state to localStorage on pageSize change', () => {
    const files = generateFiles(500);
    const { container } = renderPanel(files);

    fireEvent.change(getPerPageSelect(container), { target: { value: '45' } });

    expect(vi.mocked(localStorage.setItem)).toHaveBeenCalledWith(
      expect.stringMatching(/od:design-files:view-state/),
      expect.any(String),
    );
  });

  it('falls back to default pageSize when stored value is not a supported option', () => {
    const files = generateFiles(500);

    // Seed localStorage with an unsupported value (fractional, out-of-set integer)
    for (const bad of [0.5, 17, 999, -1, 0]) {
      vi.mocked(localStorage.getItem).mockReturnValueOnce(JSON.stringify({ pageSize: bad }));
      const { container } = renderPanel(files);
      expect(getPerPageSelect(container).value).toBe('30');
      cleanup();
    }
  });
});
