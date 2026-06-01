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
// text is truncated. (`<DfPreview>` already renders the full name with
// `word-break: break-word` for users who open the preview pane.)
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

describe('DesignFilesPanel long filename truncation (#3260)', () => {
  it('renders the file row for a long filename without crashing', () => {
    const { container } = renderPanel([file({ name: LONG_NAME })]);
    const row = container.querySelector(`[data-testid="design-file-row-${LONG_NAME}"]`);
    expect(row).toBeTruthy();
  });

  it('exposes the full filename via a `title` attribute on the name span (hover tooltip)', () => {
    const { container } = renderPanel([file({ name: LONG_NAME })]);
    const nameSpan = container.querySelector('.df-row-name') as HTMLElement | null;
    expect(nameSpan).toBeTruthy();
    // The tooltip contract: hovering a truncated row reveals the full
    // filename. Without this users see "...g-helmet.jpeg" with no way
    // to read the leading characters until they open the preview pane.
    expect(nameSpan?.getAttribute('title')).toBe(LONG_NAME);
  });

  it('keeps the truncate-friendly DOM structure (.df-cell-name > .df-row-name-btn > .df-row-name-wrap > .df-row-name)', () => {
    const { container } = renderPanel([file({ name: LONG_NAME })]);
    // The CSS fix relies on this nesting: `td.df-cell-name` constrains
    // its width, the wrap is min-width:0 / max-width:100%, and
    // `.df-row-name` carries `text-overflow: ellipsis`. If the JSX
    // shape ever changes the CSS regression risk returns silently —
    // this asserts the chain stays intact.
    const cell = container.querySelector('td.df-cell-name');
    expect(cell).toBeTruthy();
    const btn = cell!.querySelector('button.df-row-name-btn');
    expect(btn).toBeTruthy();
    const wrap = btn!.querySelector('span.df-row-name-wrap');
    expect(wrap).toBeTruthy();
    const name = wrap!.querySelector('span.df-row-name');
    expect(name).toBeTruthy();
  });
});
