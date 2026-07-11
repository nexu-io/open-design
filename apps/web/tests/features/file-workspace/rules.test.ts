import { describe, expect, it } from 'vitest';
import type { OpenTabsState, ProjectFile } from '../../../src/types';
import { emptySketchScene } from '../../../src/components/sketch-model';
import {
  activeFileForTab,
  activeLiveArtifactForTab,
  arraysEqual,
  browserTabIndex,
  browserTabsFromState,
  consumeFileWorkspaceTabShortcut,
  createDefaultDesignFilesNavState,
  defaultSketchState,
  formatBrowserTabUrl,
  isBrowserTabId,
  isLiveArtifactImplementationPath,
  isSketchName,
  joinDisplayPath,
  kindIconName,
  lastWorkspaceTabId,
  loadedSketchStateFromDocument,
  maxBrowserTabSequence,
  mergeSketchSaveOptions,
  orderWorkspaceTabs,
  parentDirForProjectFile,
  reanchorBrowserTabsToCurrentOrder,
  sameFileName,
  scrollWorkspaceTabsWithWheel,
  shouldKeepCurrentSketchState,
  sketchFileSourceKey,
  tabDropEdgeFromEvent,
} from '../../../src/features/file-workspace/rules';
import { DESIGN_FILES_TAB, DESIGN_SYSTEM_TAB, QUESTIONS_TAB } from '../../../src/features/file-workspace/constants';
import type {
  BrowserWorkspaceTab,
  SketchState,
  WorkspaceOrderedTab,
} from '../../../src/features/file-workspace/types';
import type { LiveArtifactWorkspaceEntry } from '../../../src/types';

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

describe('activeFileForTab', () => {
  const visibleFiles: ProjectFile[] = [
    { name: 'a.md', path: 'a.md', type: 'file', size: 1, mtime: 0, kind: 'text', mime: 'text/markdown' },
  ];

  it('returns null for the reserved tabs', () => {
    expect(activeFileForTab(DESIGN_FILES_TAB, visibleFiles, {})).toBeNull();
    expect(activeFileForTab(DESIGN_SYSTEM_TAB, visibleFiles, {})).toBeNull();
    expect(activeFileForTab(QUESTIONS_TAB, visibleFiles, {})).toBeNull();
    expect(activeFileForTab('__browser__:1', visibleFiles, {})).toBeNull();
  });

  it('finds the on-disk file matching the active tab', () => {
    expect(activeFileForTab('a.md', visibleFiles, {})).toBe(visibleFiles[0]);
  });

  it('synthesizes a stand-in ProjectFile for a never-saved sketch', () => {
    const sketches: Record<string, SketchState> = {
      'sketch-1.sketch.json': defaultSketchState('sketch-1.sketch.json', emptySketchScene('sketch-1.sketch.json')),
    };
    const result = activeFileForTab('sketch-1.sketch.json', [], sketches);
    expect(result).toEqual({
      name: 'sketch-1.sketch.json',
      path: 'sketch-1.sketch.json',
      type: 'file',
      size: 0,
      mtime: expect.any(Number),
      kind: 'sketch',
      mime: 'application/json',
    });
  });

  it('returns null for a persisted sketch name with no on-disk file', () => {
    const sketches: Record<string, SketchState> = {
      'sketch-1.sketch.json': {
        ...defaultSketchState('sketch-1.sketch.json', emptySketchScene('sketch-1.sketch.json')),
        persisted: true,
      },
    };
    expect(activeFileForTab('sketch-1.sketch.json', [], sketches)).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(activeFileForTab('missing.md', visibleFiles, {})).toBeNull();
  });
});

describe('activeLiveArtifactForTab', () => {
  const entries: LiveArtifactWorkspaceEntry[] = [
    { tabId: 'artifact-1', title: 'Artifact 1' } as unknown as LiveArtifactWorkspaceEntry,
  ];

  it('returns null for the reserved tabs', () => {
    expect(activeLiveArtifactForTab(DESIGN_FILES_TAB, entries)).toBeNull();
    expect(activeLiveArtifactForTab(DESIGN_SYSTEM_TAB, entries)).toBeNull();
    expect(activeLiveArtifactForTab(QUESTIONS_TAB, entries)).toBeNull();
    expect(activeLiveArtifactForTab('__browser__:1', entries)).toBeNull();
  });

  it('finds the entry matching the active tab id', () => {
    expect(activeLiveArtifactForTab('artifact-1', entries)).toBe(entries[0]);
  });

  it('returns null when no entry matches', () => {
    expect(activeLiveArtifactForTab('artifact-2', entries)).toBeNull();
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

function projectFile(over: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'sketch-1.sketch.json',
    path: 'sketch-1.sketch.json',
    size: 42,
    mtime: 1000,
    kind: 'sketch',
    mime: 'application/json',
    ...over,
  };
}

describe('defaultSketchState', () => {
  it('builds a fresh, unpersisted, loaded sketch state with a default scene', () => {
    const state = defaultSketchState('sketch-1.sketch.json');
    expect(state).toMatchObject({
      version: 2,
      rawItems: [],
      discardRawItemsOnSave: false,
      items: [],
      dirty: false,
      persisted: false,
      loaded: true,
      saving: false,
    });
    expect(state.scene.appState?.name).toBe('sketch-1.sketch.json');
  });
  it('accepts an explicit scene override', () => {
    const scene = emptySketchScene('custom');
    const state = defaultSketchState('sketch-1.sketch.json', scene);
    expect(state.scene).toBe(scene);
  });
});

describe('loadedSketchStateFromDocument', () => {
  it('marks the resulting state persisted and loaded, carrying the source key', () => {
    const scene = emptySketchScene('doc');
    const state = loadedSketchStateFromDocument(
      { version: 3, rawItems: [{ kind: 'stroke' }], items: [], scene, format: 'excalidraw' },
      'proj:1:42:1000',
    );
    expect(state).toMatchObject({
      version: 3,
      rawItems: [{ kind: 'stroke' }],
      discardRawItemsOnSave: false,
      items: [],
      scene,
      sourceKey: 'proj:1:42:1000',
      dirty: false,
      persisted: true,
      loaded: true,
      saving: false,
    });
  });
});

describe('sketchFileSourceKey', () => {
  it('combines project id, path, size, and mtime', () => {
    expect(sketchFileSourceKey('proj-1', projectFile())).toBe('proj-1:sketch-1.sketch.json:42:1000');
  });
  it('falls back to the file name when path is absent', () => {
    expect(sketchFileSourceKey('proj-1', projectFile({ path: undefined }))).toBe(
      'proj-1:sketch-1.sketch.json:42:1000',
    );
  });
});

describe('shouldKeepCurrentSketchState', () => {
  it('is false when there is no current state', () => {
    expect(shouldKeepCurrentSketchState(undefined, 'a', 'key', new Set())).toBe(false);
  });
  it('is true when the current state is not yet persisted (a pending sketch)', () => {
    const state = defaultSketchState('a');
    expect(shouldKeepCurrentSketchState(state, 'a', 'key', new Set())).toBe(true);
  });
  it('is true when dirty, saving, or a save is in flight', () => {
    const base: SketchState = { ...defaultSketchState('a'), persisted: true, loaded: true, sourceKey: 'key' };
    expect(shouldKeepCurrentSketchState({ ...base, dirty: true }, 'a', 'other-key', new Set())).toBe(true);
    expect(shouldKeepCurrentSketchState({ ...base, saving: true }, 'a', 'other-key', new Set())).toBe(true);
    expect(shouldKeepCurrentSketchState(base, 'a', 'other-key', new Set(['a']))).toBe(true);
  });
  it('is true when loaded with a matching source key, false when the key changed', () => {
    const base: SketchState = { ...defaultSketchState('a'), persisted: true, loaded: true, sourceKey: 'key' };
    expect(shouldKeepCurrentSketchState(base, 'a', 'key', new Set())).toBe(true);
    expect(shouldKeepCurrentSketchState(base, 'a', 'other-key', new Set())).toBe(false);
  });
  it('is false when persisted but not yet loaded', () => {
    const base: SketchState = { ...defaultSketchState('a'), persisted: true, loaded: false, sourceKey: 'key' };
    expect(shouldKeepCurrentSketchState(base, 'a', 'key', new Set())).toBe(false);
  });
});

describe('mergeSketchSaveOptions', () => {
  it('OR-combines each option, defaulting to true unless a side explicitly opts out', () => {
    expect(mergeSketchSaveOptions({}, {})).toEqual({ activate: true, refreshFiles: true, showSaving: true });
    expect(mergeSketchSaveOptions({ activate: false }, {})).toEqual({
      activate: true,
      refreshFiles: true,
      showSaving: true,
    });
    expect(mergeSketchSaveOptions({ activate: false }, { activate: false })).toEqual({
      activate: false,
      refreshFiles: true,
      showSaving: true,
    });
  });
});

describe('consumeFileWorkspaceTabShortcut', () => {
  it('prevents default and stops propagation', () => {
    let prevented = false;
    let stopped = false;
    consumeFileWorkspaceTabShortcut({
      preventDefault: () => { prevented = true; },
      stopPropagation: () => { stopped = true; },
    } as unknown as KeyboardEvent);
    expect(prevented).toBe(true);
    expect(stopped).toBe(true);
  });
});

describe('formatBrowserTabUrl', () => {
  it('returns an empty string for an empty url', () => {
    expect(formatBrowserTabUrl('')).toBe('');
  });
  it('strips a leading www. and a bare root path', () => {
    expect(formatBrowserTabUrl('https://www.example.com/')).toBe('example.com');
  });
  it('keeps a non-root path, search, and hash', () => {
    expect(formatBrowserTabUrl('https://example.com/docs?x=1#top')).toBe('example.com/docs?x=1#top');
  });
  it('returns the raw input when it fails to parse as a URL', () => {
    expect(formatBrowserTabUrl('not a url')).toBe('not a url');
  });
});

describe('joinDisplayPath', () => {
  it('joins root and child with a single slash', () => {
    expect(joinDisplayPath('/root', 'child')).toBe('/root/child');
  });
  it('trims trailing slashes on root and leading slashes on child', () => {
    expect(joinDisplayPath('/root/', '/child')).toBe('/root/child');
  });
  it('returns the trimmed root when child is empty', () => {
    expect(joinDisplayPath('/root/', '')).toBe('/root');
  });
});

describe('createDefaultDesignFilesNavState', () => {
  it('builds an empty nav state at page 0', () => {
    const state = createDefaultDesignFilesNavState();
    expect(state.kindFilter.size).toBe(0);
    expect(state.currentDir).toBe('');
    expect(state.page).toBe(0);
    expect(state.pageSize).toBe(30);
  });
  it('returns a fresh Set instance on each call', () => {
    const a = createDefaultDesignFilesNavState();
    const b = createDefaultDesignFilesNavState();
    expect(a.kindFilter).not.toBe(b.kindFilter);
  });
});
