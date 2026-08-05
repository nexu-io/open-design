// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesignFilesPanel } from '../../src/components/DesignFilesPanel';
import type { ProjectFile } from '../../src/types';

// Regression coverage for #3260. In the no-preview state of the file
// list, a very long filename used to expand its `<td>` and push the
// kind / mtime / menu columns off-screen. The CSS fix locks
// `.df-cell-name` to `max-width: 0; min-width: 0` so the auto-layout
// table truncates the name with the existing `text-overflow: ellipsis`
// instead of growing the cell. The JSX fix adds `title={f.name}` so the
// browser surfaces the full filename on hover even when the visible
// text is truncated — the panel has no detail pane to fall back on.
//
// jsdom does not measure layout, so the truncation itself can't be
// asserted directly. These specs encode the contract: the rendered DOM
// keeps the structural classes the CSS relies on, and the `title` is
// present on every name span so hover-tooltip is available even on the
// very long row.

const lsStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => lsStore.get(key) ?? null,
  setItem: (key: string, value: string) => { lsStore.set(key, value); },
  removeItem: (key: string) => { lsStore.delete(key); },
  clear: () => { lsStore.clear(); },
});

function file(overrides: Partial<ProjectFile> & Pick<ProjectFile, 'name'>): ProjectFile {
  return {
    path: overrides.name,
    type: 'file',
    size: 1024,
    mtime: Date.now(),
    kind: 'image',
    mime: 'image/png',
    ...overrides,
  };
}

function renderPanel(files: ProjectFile[]) {
  return render(
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
}

beforeEach(() => {
  lsStore.clear();
});

afterEach(() => {
  cleanup();
});

const LONG_NAME =
  'mpqdcf5m-A-1-year-old-boy-_standing_-with-short-black-hair_-big-eyes-with-black-pupils_-wearing-a-watermelon-shaped-helmet.jpeg';
// Images now render as bare masonry cards (no name line), so the list-row
// truncation contract is asserted on a text file, which keeps the row shell.
const LONG_ROW_NAME = LONG_NAME.replace(/\.jpeg$/, '.txt');

describe('DesignFilesPanel long filename truncation (#3260)', () => {
  it('renders the image card for a long filename without crashing', () => {
    const { container } = renderPanel([file({ name: LONG_NAME })]);
    const card = container.querySelector(`[data-testid="design-file-row-${LONG_NAME}"]`);
    expect(card).toBeTruthy();
  });

  it('exposes the full filename via a `title` attribute on the image card thumb (hover tooltip)', () => {
    const { container } = renderPanel([file({ name: LONG_NAME })]);
    const thumb = container.querySelector('.df-card-thumb') as HTMLElement | null;
    expect(thumb).toBeTruthy();
    // The tooltip contract: an image card has no visible name line, so the
    // full filename must surface on the thumb's hover tooltip.
    expect(thumb?.getAttribute('title')).toContain(LONG_NAME);
  });

  it('exposes the full filename via a `title` attribute on the row name span (hover tooltip)', () => {
    const { container } = renderPanel([
      file({ name: LONG_ROW_NAME, kind: 'text', mime: 'text/plain' }),
    ]);
    const nameSpan = container.querySelector('.df-row-name') as HTMLElement | null;
    expect(nameSpan).toBeTruthy();
    // The tooltip contract: hovering a truncated row reveals the full
    // filename. Without this users see "...g-helmet.txt" with no way
    // to read the leading characters until they open the preview pane.
    expect(nameSpan?.getAttribute('title')).toBe(LONG_ROW_NAME);
  });

  it('keeps the truncate-friendly DOM structure (.df-row-name-wrap > .df-row-name-btn > .df-row-name-wrap > .df-row-name)', () => {
    const { container } = renderPanel([
      file({ name: LONG_ROW_NAME, kind: 'text', mime: 'text/plain' }),
    ]);
    // The CSS fix relies on this nesting: the outer `.df-row-name-wrap`
    // cell constrains its width, the inner wrap is min-width:0 /
    // max-width:100%, and `.df-row-name` carries `text-overflow: ellipsis`.
    // If the JSX shape ever changes the CSS regression risk returns
    // silently — this asserts the chain stays intact.
    const cell = container.querySelector('div.df-row-name-wrap');
    expect(cell).toBeTruthy();
    const btn = cell!.querySelector('button.df-row-name-btn');
    expect(btn).toBeTruthy();
    const wrap = btn!.querySelector('span.df-row-name-wrap');
    expect(wrap).toBeTruthy();
    const name = wrap!.querySelector('span.df-row-name');
    expect(name).toBeTruthy();
  });
});
