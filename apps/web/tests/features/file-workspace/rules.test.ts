import { describe, expect, it } from 'vitest';
import type { OpenTabsState } from '../../../src/types';
import {
  arraysEqual,
  browserTabIndex,
  browserTabsFromState,
  isBrowserTabId,
  isLiveArtifactImplementationPath,
  isSketchName,
  kindIconName,
  lastWorkspaceTabId,
  maxBrowserTabSequence,
  orderWorkspaceTabs,
  parentDirForProjectFile,
  reanchorBrowserTabsToCurrentOrder,
  sameFileName,
  scrollWorkspaceTabsWithWheel,
  tabDropEdgeFromEvent,
} from '../../../src/features/file-workspace/rules';
import type { BrowserWorkspaceTab, WorkspaceOrderedTab } from '../../../src/features/file-workspace/types';

function browserTab(id: string, over: Partial<BrowserWorkspaceTab> = {}): BrowserWorkspaceTab {
  return { id, label: 'Browser', ...over };
}

describe('arraysEqual', () => {
  it('is true for identical arrays', () => {
    expect(arraysEqual(['a', 'b'], ['a', 'b'])).toBe(true);
  });
  it('is false for different lengths', () => {
    expect(arraysEqual(['a'], ['a', 'b'])).toBe(false);
  });
  it('is false for different order', () => {
    expect(arraysEqual(['a', 'b'], ['b', 'a'])).toBe(false);
  });
  it('is true for two empty arrays', () => {
    expect(arraysEqual([], [])).toBe(true);
  });
});

describe('isBrowserTabId / browserTabIndex', () => {
  it('recognizes a browser tab id', () => {
    expect(isBrowserTabId('__browser__:3')).toBe(true);
    expect(isBrowserTabId('design.md')).toBe(false);
  });
  it('parses the sequence number', () => {
    expect(browserTabIndex('__browser__:7')).toBe(7);
  });
  it('returns 0 for a non-browser tab id', () => {
    expect(browserTabIndex('design.md')).toBe(0);
  });
  it('returns 0 for a non-numeric or non-positive suffix', () => {
    expect(browserTabIndex('__browser__:abc')).toBe(0);
    expect(browserTabIndex('__browser__:0')).toBe(0);
    expect(browserTabIndex('__browser__:-1')).toBe(0);
  });
});

describe('browserTabsFromState', () => {
  it('returns an empty array for non-array input', () => {
    expect(browserTabsFromState(undefined as unknown as OpenTabsState['browserTabs'])).toEqual([]);
  });
  it('drops entries without a valid browser-tab id and dedupes by id', () => {
    const result = browserTabsFromState([
      { id: '__browser__:1', label: 'A' },
      { id: 'not-a-browser-tab', label: 'B' },
      { id: '__browser__:1', label: 'A dup' },
    ] as OpenTabsState['browserTabs']);
    expect(result).toEqual([{ id: '__browser__:1', label: 'A' }]);
  });
  it('falls back to "Browser" for a blank label and trims optional fields', () => {
    const result = browserTabsFromState([
      { id: '__browser__:2', label: '  ', title: ' Title ', url: ' https://a ', iconUrl: ' https://icon ' },
    ] as OpenTabsState['browserTabs']);
    expect(result).toEqual([
      {
        id: '__browser__:2',
        label: 'Browser',
        title: 'Title',
        url: 'https://a',
        iconUrl: 'https://icon',
      },
    ]);
  });
  it('preserves an explicit null insertAfter and a string insertAfter', () => {
    const result = browserTabsFromState([
      { id: '__browser__:1', label: 'A', insertAfter: null },
      { id: '__browser__:2', label: 'B', insertAfter: '__browser__:1' },
    ] as OpenTabsState['browserTabs']);
    expect(result[0]?.insertAfter).toBeNull();
    expect(result[1]?.insertAfter).toBe('__browser__:1');
  });
  it('omits title/url/iconUrl and insertAfter when blank or absent', () => {
    const result = browserTabsFromState([
      { id: '__browser__:1', label: 'A', title: '  ', url: '', iconUrl: undefined },
    ] as OpenTabsState['browserTabs']);
    expect(result[0]).toEqual({ id: '__browser__:1', label: 'A' });
  });
});

describe('maxBrowserTabSequence', () => {
  it('returns 0 for an empty list', () => {
    expect(maxBrowserTabSequence([])).toBe(0);
  });
  it('returns the highest sequence number', () => {
    expect(maxBrowserTabSequence([browserTab('__browser__:2'), browserTab('__browser__:5'), browserTab('__browser__:1')])).toBe(5);
  });
});

describe('lastWorkspaceTabId', () => {
  it('returns null for an empty list', () => {
    expect(lastWorkspaceTabId([])).toBeNull();
  });
  it('returns the id of the last entry', () => {
    const tabs: WorkspaceOrderedTab[] = [
      { id: 'a.md', kind: 'file', name: 'a.md' },
      { id: 'b.md', kind: 'file', name: 'b.md' },
    ];
    expect(lastWorkspaceTabId(tabs)).toBe('b.md');
  });
});

describe('orderWorkspaceTabs / reanchorBrowserTabsToCurrentOrder', () => {
  it('places file tabs in order and inserts unanchored browser tabs at the root', () => {
    const ordered = orderWorkspaceTabs(['a.md', 'b.md'], [browserTab('__browser__:1')]);
    expect(ordered.map((t) => t.id)).toEqual(['__browser__:1', 'a.md', 'b.md']);
  });
  it('anchors a browser tab immediately after its insertAfter target', () => {
    const ordered = orderWorkspaceTabs(['a.md', 'b.md'], [browserTab('__browser__:1', { insertAfter: 'a.md' })]);
    expect(ordered.map((t) => t.id)).toEqual(['a.md', '__browser__:1', 'b.md']);
  });
  it('appends a browser tab whose anchor no longer exists', () => {
    const ordered = orderWorkspaceTabs(['a.md'], [browserTab('__browser__:1', { insertAfter: 'missing.md' })]);
    expect(ordered.map((t) => t.id)).toEqual(['a.md', '__browser__:1']);
  });
  it('reanchors browser tabs to their current predecessor in the ordered list', () => {
    const ordered = orderWorkspaceTabs(['a.md', 'b.md'], []);
    const tabs = [browserTab('__browser__:1', { insertAfter: 'a.md' })];
    const reanchored = reanchorBrowserTabsToCurrentOrder(ordered, tabs);
    // a.md has no successor browser tab yet, so nothing changes for this input.
    expect(reanchored).toBe(tabs);
  });
  it('returns the same array reference when nothing changes', () => {
    const emptyTabs: BrowserWorkspaceTab[] = [];
    expect(reanchorBrowserTabsToCurrentOrder([], emptyTabs)).toBe(emptyTabs);
  });
});

describe('isSketchName / parentDirForProjectFile / sameFileName / isLiveArtifactImplementationPath', () => {
  it('recognizes a sketch workspace document', () => {
    expect(isSketchName('scratch.sketch.json')).toBe(true);
    expect(isSketchName('design.md')).toBe(false);
  });
  it('derives the parent directory of a nested path', () => {
    expect(parentDirForProjectFile('assets/img/logo.png')).toBe('assets/img');
    expect(parentDirForProjectFile('logo.png')).toBe('');
  });
  it('compares file names case-insensitively', () => {
    expect(sameFileName('Design.md', 'design.md')).toBe(true);
    expect(sameFileName('a.md', 'b.md')).toBe(false);
  });
  it('identifies live-artifact implementation paths', () => {
    expect(isLiveArtifactImplementationPath('.live-artifacts')).toBe(true);
    expect(isLiveArtifactImplementationPath('.live-artifacts/snapshot.json')).toBe(true);
    expect(isLiveArtifactImplementationPath('design.md')).toBe(false);
  });
});

describe('kindIconName', () => {
  it('maps known kinds to an icon name', () => {
    expect(kindIconName('browser')).toBe('globe');
    expect(kindIconName('live-artifact')).toBe('file-code');
    expect(kindIconName('html')).toBe('file-code');
    expect(kindIconName('image')).toBe('image');
    expect(kindIconName('sketch')).toBe('pencil');
    expect(kindIconName('code')).toBe('file-code');
    expect(kindIconName('text')).toBe('file');
  });
  it('falls back to the generic file icon for an unknown or missing kind', () => {
    expect(kindIconName('unknown-kind')).toBe('file');
    expect(kindIconName(undefined)).toBe('file');
  });
});

describe('tabDropEdgeFromEvent', () => {
  function eventAt(clientX: number, rect: Partial<DOMRect> = {}): Parameters<typeof tabDropEdgeFromEvent>[0] {
    return {
      clientX,
      currentTarget: {
        getBoundingClientRect: () => ({ left: 0, width: 100, top: 0, height: 0, right: 100, bottom: 0, x: 0, y: 0, toJSON() {}, ...rect }),
      },
    } as unknown as Parameters<typeof tabDropEdgeFromEvent>[0];
  }

  it('reports "before" when the drop is left of center', () => {
    expect(tabDropEdgeFromEvent(eventAt(20))).toBe('before');
  });
  it('reports "after" when the drop is right of center', () => {
    expect(tabDropEdgeFromEvent(eventAt(80))).toBe('after');
  });
});

describe('scrollWorkspaceTabsWithWheel', () => {
  function tabBar(over: Partial<{ clientWidth: number; scrollLeft: number; scrollWidth: number }> = {}) {
    return { clientWidth: 100, scrollLeft: 0, scrollWidth: 300, ...over };
  }
  function wheelEvent(over: Partial<{ ctrlKey: boolean; deltaMode: number; deltaX: number; deltaY: number }> = {}) {
    return { ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 20, preventDefault: () => {}, ...over };
  }

  it('scrolls horizontally and prevents default when vertical wheel exceeds horizontal', () => {
    const bar = tabBar();
    let prevented = false;
    scrollWorkspaceTabsWithWheel(bar, { ...wheelEvent(), preventDefault: () => { prevented = true; } });
    expect(bar.scrollLeft).toBe(20);
    expect(prevented).toBe(true);
  });
  it('ignores ctrl+wheel (pinch-zoom gesture)', () => {
    const bar = tabBar();
    scrollWorkspaceTabsWithWheel(bar, wheelEvent({ ctrlKey: true }));
    expect(bar.scrollLeft).toBe(0);
  });
  it('ignores a wheel that is more horizontal than vertical', () => {
    const bar = tabBar();
    scrollWorkspaceTabsWithWheel(bar, wheelEvent({ deltaX: 50, deltaY: 10 }));
    expect(bar.scrollLeft).toBe(0);
  });
  it('no-ops when the tab bar has no overflow to scroll', () => {
    const bar = tabBar({ scrollWidth: 100 });
    scrollWorkspaceTabsWithWheel(bar, wheelEvent());
    expect(bar.scrollLeft).toBe(0);
  });
  it('converts a page-mode delta to pixels', () => {
    const bar = tabBar();
    scrollWorkspaceTabsWithWheel(bar, wheelEvent({ deltaMode: 2, deltaY: 1 }));
    expect(bar.scrollLeft).toBe(160);
  });
  it('converts a line-mode delta to pixels', () => {
    const bar = tabBar();
    scrollWorkspaceTabsWithWheel(bar, wheelEvent({ deltaMode: 1, deltaY: 1 }));
    expect(bar.scrollLeft).toBe(16);
  });
});
