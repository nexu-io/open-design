// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesignFilesPanel } from '../../src/components/DesignFilesPanel';
import type { ProjectFile, ProjectFileKind } from '../../src/types';

function file(name: string, mtime = Date.now(), kind: ProjectFileKind = 'html'): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 1024,
    mtime,
    kind,
    mime: kind === 'image' ? 'image/png' : 'text/html',
  };
}

function renderPanel(files: ProjectFile[]) {
  const result = render(
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
    />,
  );
  return result;
}

function getCheckbox(container: HTMLElement, fileName: string): HTMLElement {
  const row = container.querySelector(`[data-testid="design-file-row-${fileName}"]`);
  if (!row) throw new Error(`Row for ${fileName} not found`);
  const cb = row.querySelector('.df-row-check');
  if (!cb) throw new Error(`Checkbox in row ${fileName} not found`);
  return cb as HTMLElement;
}

function isSelected(container: HTMLElement, fileName: string): boolean {
  const row = container.querySelector(`[data-testid="design-file-row-${fileName}"]`);
  return row?.classList.contains('selected') ?? false;
}

describe('DesignFilesPanel shift-click range selection', () => {
  afterEach(() => {
    cleanup();
  });

  it('(a) click A then shift-click C selects A, B, C inclusive', () => {
    // Files are sorted by mtime desc by default; give them distinct mtimes so order is A,B,C top-to-bottom
    const files = [
      file('a.html', Date.now() - 0),
      file('b.html', Date.now() - 1000),
      file('c.html', Date.now() - 2000),
    ];
    const { container } = renderPanel(files);

    // Plain click on A — sets anchor and selects A
    fireEvent.click(getCheckbox(container, 'a.html'));

    // Shift-click on C — should range-select A..C
    fireEvent.click(getCheckbox(container, 'c.html'), { shiftKey: true });

    expect(isSelected(container, 'a.html')).toBe(true);
    expect(isSelected(container, 'b.html')).toBe(true);
    expect(isSelected(container, 'c.html')).toBe(true);
  });

  it('(b) click A, shift-click C (all selected), shift-click A collapses range to just A', () => {
    const files = [
      file('a.html', Date.now() - 0),
      file('b.html', Date.now() - 1000),
      file('c.html', Date.now() - 2000),
    ];
    const { container } = renderPanel(files);

    fireEvent.click(getCheckbox(container, 'a.html'));
    fireEvent.click(getCheckbox(container, 'c.html'), { shiftKey: true });

    // A, B, C all selected now. Shift-click A — range from anchor A to A = only A
    fireEvent.click(getCheckbox(container, 'a.html'), { shiftKey: true });

    expect(isSelected(container, 'a.html')).toBe(true);
    expect(isSelected(container, 'b.html')).toBe(false);
    expect(isSelected(container, 'c.html')).toBe(false);
  });

  it('(c) plain click on D after a range resets anchor to D', () => {
    const files = [
      file('a.html', Date.now() - 0),
      file('b.html', Date.now() - 1000),
      file('c.html', Date.now() - 2000),
      file('d.html', Date.now() - 3000),
    ];
    const { container } = renderPanel(files);

    fireEvent.click(getCheckbox(container, 'a.html'));
    fireEvent.click(getCheckbox(container, 'c.html'), { shiftKey: true });

    // Plain click on D — resets anchor to D, selects only D
    fireEvent.click(getCheckbox(container, 'd.html'));

    expect(isSelected(container, 'a.html')).toBe(false);
    expect(isSelected(container, 'b.html')).toBe(false);
    expect(isSelected(container, 'c.html')).toBe(false);
    expect(isSelected(container, 'd.html')).toBe(true);
  });

  it('(d) shift-click on first mount with no prior anchor behaves as plain click and sets anchor', () => {
    const files = [
      file('a.html', Date.now() - 0),
      file('b.html', Date.now() - 1000),
      file('c.html', Date.now() - 2000),
    ];
    const { container } = renderPanel(files);

    // No prior anchor — shift-click should act like a plain click
    fireEvent.click(getCheckbox(container, 'b.html'), { shiftKey: true });

    expect(isSelected(container, 'a.html')).toBe(false);
    expect(isSelected(container, 'b.html')).toBe(true);
    expect(isSelected(container, 'c.html')).toBe(false);

    // Subsequent shift-click from B to C should select B and C
    fireEvent.click(getCheckbox(container, 'c.html'), { shiftKey: true });

    expect(isSelected(container, 'a.html')).toBe(false);
    expect(isSelected(container, 'b.html')).toBe(true);
    expect(isSelected(container, 'c.html')).toBe(true);
  });

  it('plain click replaces selection; cmd/ctrl-click is additive and does not clear others', () => {
    // This test would fail on main because the old toggleSelect was always additive —
    // a plain click did not replace the selection. The plain-click-replaces assertion
    // is the load-bearing differentiator that goes RED on main.
    const files = [
      file('a.html', Date.now() - 0),
      file('b.html', Date.now() - 1000),
      file('c.html', Date.now() - 2000),
    ];
    const { container } = renderPanel(files);

    // Select A (plain click — sets anchor, selects only A)
    fireEvent.click(getCheckbox(container, 'a.html'));
    expect(isSelected(container, 'a.html')).toBe(true);

    // Plain click C — must REPLACE selection (only C selected; A cleared)
    // On main (old toggleSelect) this would leave both A and C selected → assertion fails.
    fireEvent.click(getCheckbox(container, 'c.html'));
    expect(isSelected(container, 'a.html')).toBe(false);
    expect(isSelected(container, 'c.html')).toBe(true);

    // Cmd-click A — should add A without clearing C
    fireEvent.click(getCheckbox(container, 'a.html'), { metaKey: true });
    expect(isSelected(container, 'a.html')).toBe(true);
    expect(isSelected(container, 'b.html')).toBe(false);
    expect(isSelected(container, 'c.html')).toBe(true);

    // Cmd-click A again — toggles it off
    fireEvent.click(getCheckbox(container, 'a.html'), { metaKey: true });
    expect(isSelected(container, 'a.html')).toBe(false);
    expect(isSelected(container, 'b.html')).toBe(false);
    expect(isSelected(container, 'c.html')).toBe(true);
  });

  it('ctrl-click is additive; plain click after ctrl-select replaces (goes red on main)', () => {
    // On main, the second plain click would toggle C off (additive), not replace.
    // Here we confirm plain click truly replaces regardless of prior ctrl state.
    const files = [
      file('a.html', Date.now() - 0),
      file('b.html', Date.now() - 1000),
    ];
    const { container } = renderPanel(files);

    fireEvent.click(getCheckbox(container, 'a.html'));
    // Ctrl-click B — adds without clearing A
    fireEvent.click(getCheckbox(container, 'b.html'), { ctrlKey: true });
    expect(isSelected(container, 'a.html')).toBe(true);
    expect(isSelected(container, 'b.html')).toBe(true);

    // Plain click A — must REPLACE: only A selected; B cleared
    fireEvent.click(getCheckbox(container, 'a.html'));
    expect(isSelected(container, 'a.html')).toBe(true);
    expect(isSelected(container, 'b.html')).toBe(false);
  });

  it('(e) Shift+Space on keyboard activates range selection the same as shift-click', () => {
    // Keyboard a11y: Space selects, Shift+Space range-selects. This test goes RED on main
    // because main's onKeyDown only called toggleSelect (additive), never range-selected.
    const files = [
      file('a.html', Date.now() - 0),
      file('b.html', Date.now() - 1000),
      file('c.html', Date.now() - 2000),
    ];
    const { container } = renderPanel(files);

    // Plain Space on A — sets anchor, selects A
    fireEvent.keyDown(getCheckbox(container, 'a.html'), { key: ' ' });
    expect(isSelected(container, 'a.html')).toBe(true);

    // Shift+Space on C — should range-select A..C (same as shift-click)
    fireEvent.keyDown(getCheckbox(container, 'c.html'), { key: ' ', shiftKey: true });

    expect(isSelected(container, 'a.html')).toBe(true);
    expect(isSelected(container, 'b.html')).toBe(true);
    expect(isSelected(container, 'c.html')).toBe(true);
  });

  it('(f) aria-selected attribute is present on rows matching selection state', () => {
    // Verifies that the <tr> carries aria-selected so assistive technologies
    // can announce "selected, 1 of 3". Goes RED on main (no aria-selected there).
    const files = [
      file('a.html', Date.now() - 0),
      file('b.html', Date.now() - 1000),
    ];
    const { container } = renderPanel(files);

    const rowA = container.querySelector('[data-testid="design-file-row-a.html"]') as HTMLElement;
    const rowB = container.querySelector('[data-testid="design-file-row-b.html"]') as HTMLElement;

    // Before any selection, aria-selected should be false on both rows
    expect(rowA.getAttribute('aria-selected')).toBe('false');
    expect(rowB.getAttribute('aria-selected')).toBe('false');

    fireEvent.click(getCheckbox(container, 'a.html'));
    expect(rowA.getAttribute('aria-selected')).toBe('true');
    expect(rowB.getAttribute('aria-selected')).toBe('false');
  });

  it('(h) shift-select across a collapsed modified section does not include hidden files', () => {
    // Regression: visiblePageOrder previously flatMapped all modifiedGroups[section]
    // regardless of collapsedModifiedSections, so files inside a collapsed section
    // were silently included in shift-click ranges and fed into batch delete/download.
    //
    // Layout under groupMode==='modified' with the middle section collapsed:
    //   [today]          visible: today.html                 (idx 0)
    //   [yesterday]      COLLAPSED — hidden from DOM
    //   [previous7Days]  visible: week.html                  (idx 1 after fix, 2 before)
    //
    // The fix makes visiblePageOrder skip collapsed sections, so shift-clicking
    // from today.html to week.html produces range [today.html, week.html] with no
    // files from the collapsed yesterday section.

    const now = Date.now();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const todayTs = startOfToday.getTime() + 1000;           // within today
    const yesterdayTs = startOfToday.getTime() - 12 * 3600 * 1000; // yesterday
    const weekTs = startOfToday.getTime() - 3 * 24 * 3600 * 1000; // previous 7 days

    vi.useFakeTimers();
    vi.setSystemTime(now);

    const files = [
      file('today.html',     todayTs,     'html'),
      file('yesterday.html', yesterdayTs, 'html'),
      file('week.html',      weekTs,      'html'),
    ];
    const { container } = renderPanel(files);

    // Switch to groupMode === 'modified'. The group-toggle area contains two
    // buttons: "Kind" (active/pressed) and "Modified" (not yet active).
    const modifiedBtn = Array.from(container.querySelectorAll('.df-group-toggle button')).find(
      (el) => el.getAttribute('aria-pressed') === 'false',
    ) as HTMLElement | undefined;
    if (!modifiedBtn) throw new Error('Modified group button not found');
    fireEvent.click(modifiedBtn);

    // Collapse the "yesterday" section
    const collapseBtn = Array.from(container.querySelectorAll('button.df-section-toggle')).find(
      (el) => el.textContent?.toLowerCase().includes('yesterday'),
    ) as HTMLElement | undefined;
    if (!collapseBtn) throw new Error('Yesterday section toggle not found');
    fireEvent.click(collapseBtn);

    // yesterday.html row must now be absent from the DOM
    expect(container.querySelector('[data-testid="design-file-row-yesterday.html"]')).toBeNull();

    // Plain click on today.html — sets anchor
    fireEvent.click(getCheckbox(container, 'today.html'));
    expect(isSelected(container, 'today.html')).toBe(true);

    // Shift-click on week.html — range should only cover today.html and week.html
    fireEvent.click(getCheckbox(container, 'week.html'), { shiftKey: true });

    expect(isSelected(container, 'today.html')).toBe(true);
    expect(isSelected(container, 'week.html')).toBe(true);
    // yesterday.html must NOT be selected — it lives in a collapsed section
    expect(isSelected(container, 'yesterday.html')).toBe(false);

    vi.useRealTimers();
  });

  it('(g) shift-select range matches visual kind-group order, not mtime sort order', () => {
    // Regression for the bug where handleRowCheck used pageFiles (sorted by
    // mtime desc) but renderKindSections reorders rows by kindSortPriority,
    // causing the shift-click range to cover wrong files.
    //
    // Visual render order in groupMode==='kind' (default):
    //   HTML group (priority 0): first.html, second.html
    //   Image group (priority 4): alpha.png, beta.png
    //
    // mtime sort order (desc, default): first.html, alpha.png, second.html, beta.png
    //
    // If handleRowCheck used mtime order, clicking first.html then
    // shift-clicking second.html would also pull in alpha.png (which sits
    // between them in mtime order). The fix makes it use visual order, so
    // only first.html and second.html are selected.
    const now = Date.now();
    const files = [
      // Interleaved by mtime so they appear in a non-kind order if sorted by mtime
      file('first.html',  now - 0,    'html'),
      file('alpha.png',   now - 1000, 'image'),
      file('second.html', now - 2000, 'html'),
      file('beta.png',    now - 3000, 'image'),
    ];
    const { container } = renderPanel(files);

    // Visual DOM order (kind grouping): first.html, second.html, alpha.png, beta.png
    const domRows = Array.from(container.querySelectorAll('.df-file-row')).map(
      (el) => el.getAttribute('data-testid')!.replace(/^design-file-row-/, ''),
    );
    // Confirm the DOM renders html rows before image rows regardless of mtime
    expect(domRows.indexOf('first.html')).toBeLessThan(domRows.indexOf('alpha.png'));
    expect(domRows.indexOf('second.html')).toBeLessThan(domRows.indexOf('alpha.png'));

    // Plain click on first.html — sets anchor at visual position 0
    fireEvent.click(getCheckbox(container, 'first.html'));
    expect(isSelected(container, 'first.html')).toBe(true);

    // Shift-click second.html — visually adjacent (position 1), so range = [first.html, second.html]
    // With the bug, the range was computed against mtime order:
    //   first.html=0, second.html=2 → slice(0,3) = [first.html, alpha.png, second.html]
    // After the fix, the range uses visual order:
    //   first.html=0, second.html=1 → slice(0,2) = [first.html, second.html]
    fireEvent.click(getCheckbox(container, 'second.html'), { shiftKey: true });

    expect(isSelected(container, 'first.html')).toBe(true);
    expect(isSelected(container, 'second.html')).toBe(true);
    // alpha.png must NOT be selected — it was falsely included by the buggy mtime-order range
    expect(isSelected(container, 'alpha.png')).toBe(false);
    expect(isSelected(container, 'beta.png')).toBe(false);
  });
});
