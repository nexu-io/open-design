// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/state/projects', () => ({
  killTerminal: vi.fn(),
}));

import { killTerminal } from '../../../src/state/projects';
import {
  useWorkspaceTabActivation,
  type UseWorkspaceTabActivationParams,
} from '../../../src/features/file-workspace/hooks/useWorkspaceTabActivation.hooks';
import {
  DESIGN_FILES_TAB,
  DESIGN_SYSTEM_TAB,
  QUESTIONS_TAB,
} from '../../../src/features/file-workspace/constants';
import type { BrowserWorkspaceTab, SketchState, TranslateFn } from '../../../src/features/file-workspace/types';
import type { OpenTabsState } from '../../../src/types';

const t: TranslateFn = (key) => key;

function makeSketchState(over: Partial<SketchState> = {}): SketchState {
  return {
    version: 1,
    rawItems: [],
    discardRawItemsOnSave: false,
    items: [],
    scene: { elements: [], appState: {}, files: {} } as unknown as SketchState['scene'],
    dirty: false,
    persisted: true,
    loaded: true,
    saving: false,
    ...over,
  };
}

function baseParams(over: Partial<UseWorkspaceTabActivationParams> = {}): UseWorkspaceTabActivationParams {
  const tabsState: OpenTabsState = { tabs: ['a.md', 'b.md'], active: 'a.md' };
  return {
    projectId: 'proj1',
    t,
    tabsState,
    tabsStateRef: { current: tabsState },
    defaultRootTab: DESIGN_FILES_TAB,
    persistedTabs: ['a.md', 'b.md'],
    activeTab: 'a.md',
    setActiveTab: vi.fn(),
    onTabsStateChange: vi.fn(),
    setUploadError: vi.fn(),
    browserTabs: [],
    setBrowserTabs: vi.fn(),
    closeBrowserTab: vi.fn(),
    orderedWorkspaceTabs: [],
    workspaceTabIds: ['a.md', 'b.md'],
    sketches: {},
    discardPendingSketchEntry: vi.fn(),
    pruneClosedSketchEntry: vi.fn(),
    designSystemProject: null,
    ...over,
  };
}

describe('useWorkspaceTabActivation', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  describe('workspaceTabsState', () => {
    it('omits browserTabs when the list is empty', () => {
      const { result } = renderHook(() => useWorkspaceTabActivation(baseParams()));
      expect(result.current.workspaceTabsState(['a.md'], 'a.md')).toEqual({
        tabs: ['a.md'],
        active: 'a.md',
      });
    });

    it('defaults nextBrowserTabs to the current browserTabs param', () => {
      const browserTabs: BrowserWorkspaceTab[] = [{ id: '__browser__:1', insertAfter: null, label: 'Browser' }];
      const { result } = renderHook(() => useWorkspaceTabActivation(baseParams({ browserTabs })));
      expect(result.current.workspaceTabsState(['a.md'], 'a.md')).toEqual({
        tabs: ['a.md'],
        active: 'a.md',
        browserTabs,
      });
    });

    it('accepts an explicit browserTabs override', () => {
      const explicit: BrowserWorkspaceTab[] = [{ id: '__browser__:2', insertAfter: null, label: 'Browser 2' }];
      const { result } = renderHook(() => useWorkspaceTabActivation(baseParams()));
      expect(result.current.workspaceTabsState(['a.md'], 'a.md', explicit)).toEqual({
        tabs: ['a.md'],
        active: 'a.md',
        browserTabs: explicit,
      });
    });
  });

  describe('commitTabsState', () => {
    it('mirrors into tabsStateRef and notifies the parent', () => {
      const tabsStateRef = { current: { tabs: [], active: null } as OpenTabsState };
      const onTabsStateChange = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({ tabsStateRef, onTabsStateChange })),
      );
      const next: OpenTabsState = { tabs: ['x.md'], active: 'x.md' };
      act(() => result.current.commitTabsState(next));
      expect(tabsStateRef.current).toBe(next);
      expect(onTabsStateChange).toHaveBeenCalledWith(next);
    });
  });

  describe('setPersistedActive', () => {
    it('activates the given name and commits it as active', () => {
      const setActiveTab = vi.fn();
      const onTabsStateChange = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({ setActiveTab, onTabsStateChange })),
      );
      act(() => result.current.setPersistedActive('b.md'));
      expect(setActiveTab).toHaveBeenCalledWith('b.md');
      expect(onTabsStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ tabs: ['a.md', 'b.md'], active: 'b.md' }),
      );
    });

    it('falls back to the default root tab when name is null', () => {
      const setActiveTab = vi.fn();
      const { result } = renderHook(() => useWorkspaceTabActivation(baseParams({ setActiveTab })));
      act(() => result.current.setPersistedActive(null));
      expect(setActiveTab).toHaveBeenCalledWith(DESIGN_FILES_TAB);
    });
  });

  describe('activatePending', () => {
    it('sets activeTab without touching persisted tab state', () => {
      const setActiveTab = vi.fn();
      const onTabsStateChange = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({ setActiveTab, onTabsStateChange })),
      );
      act(() => result.current.activatePending('sketch-1'));
      expect(setActiveTab).toHaveBeenCalledWith('sketch-1');
      expect(onTabsStateChange).not.toHaveBeenCalled();
    });
  });

  describe('openFile', () => {
    it('appends a new tab, commits it active, and clears any upload error', () => {
      const setActiveTab = vi.fn();
      const setUploadError = vi.fn();
      const onTabsStateChange = vi.fn();
      const tabsState: OpenTabsState = { tabs: ['a.md'], active: 'a.md' };
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          tabsState,
          tabsStateRef: { current: tabsState },
          persistedTabs: ['a.md'],
          setActiveTab,
          setUploadError,
          onTabsStateChange,
        })),
      );
      act(() => result.current.openFile('new.md'));
      expect(setUploadError).toHaveBeenCalledWith(null);
      expect(setActiveTab).toHaveBeenCalledWith('new.md');
      expect(onTabsStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ tabs: ['a.md', 'new.md'], active: 'new.md' }),
      );
    });

    it('does not duplicate an already-open tab', () => {
      const onTabsStateChange = vi.fn();
      const tabsState: OpenTabsState = { tabs: ['a.md', 'b.md'], active: 'a.md' };
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          tabsState,
          tabsStateRef: { current: tabsState },
          persistedTabs: ['a.md', 'b.md'],
          onTabsStateChange,
        })),
      );
      act(() => result.current.openFile('b.md'));
      expect(onTabsStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ tabs: ['a.md', 'b.md'], active: 'b.md' }),
      );
    });
  });

  describe('focusWorkspaceTab', () => {
    it('routes DESIGN_SYSTEM_TAB to itself when a design system project exists', () => {
      const setActiveTab = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          setActiveTab,
          designSystemProject: { id: 'ds1' } as never,
        })),
      );
      act(() => result.current.focusWorkspaceTab(DESIGN_SYSTEM_TAB));
      expect(setActiveTab).toHaveBeenCalledWith(DESIGN_SYSTEM_TAB);
    });

    it('falls DESIGN_SYSTEM_TAB back to DESIGN_FILES_TAB with no design system project', () => {
      const setActiveTab = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({ setActiveTab, designSystemProject: null })),
      );
      act(() => result.current.focusWorkspaceTab(DESIGN_SYSTEM_TAB));
      expect(setActiveTab).toHaveBeenCalledWith(DESIGN_FILES_TAB);
    });

    it('ignores a browser tab id that is no longer open', () => {
      const setActiveTab = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({ setActiveTab, browserTabs: [] })),
      );
      act(() => result.current.focusWorkspaceTab('__browser__:1'));
      expect(setActiveTab).not.toHaveBeenCalled();
    });

    it('activates an open browser tab', () => {
      const setActiveTab = vi.fn();
      const onTabsStateChange = vi.fn();
      const browserTabs: BrowserWorkspaceTab[] = [{ id: '__browser__:1', insertAfter: null, label: 'Browser' }];
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({ setActiveTab, onTabsStateChange, browserTabs })),
      );
      act(() => result.current.focusWorkspaceTab('__browser__:1'));
      expect(setActiveTab).toHaveBeenCalledWith('__browser__:1');
    });

    it('falls through to openFile for a plain file name', () => {
      const setActiveTab = vi.fn();
      const onTabsStateChange = vi.fn();
      const tabsState: OpenTabsState = { tabs: ['a.md'], active: 'a.md' };
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          tabsState,
          tabsStateRef: { current: tabsState },
          persistedTabs: ['a.md'],
          setActiveTab,
          onTabsStateChange,
        })),
      );
      act(() => result.current.focusWorkspaceTab('c.md'));
      expect(setActiveTab).toHaveBeenCalledWith('c.md');
      expect(onTabsStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ tabs: ['a.md', 'c.md'], active: 'c.md' }),
      );
    });
  });

  describe('activateWorkspaceTab', () => {
    it('activates the Questions tab directly', () => {
      const setActiveTab = vi.fn();
      const { result } = renderHook(() => useWorkspaceTabActivation(baseParams({ setActiveTab })));
      act(() => result.current.activateWorkspaceTab(QUESTIONS_TAB));
      expect(setActiveTab).toHaveBeenCalledWith(QUESTIONS_TAB);
    });

    it('activates a pending sketch without persisting it', () => {
      const setActiveTab = vi.fn();
      const onTabsStateChange = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          setActiveTab,
          onTabsStateChange,
          sketches: { 'sketch-1': makeSketchState({ persisted: false }) },
        })),
      );
      act(() => result.current.activateWorkspaceTab('sketch-1'));
      expect(setActiveTab).toHaveBeenCalledWith('sketch-1');
      expect(onTabsStateChange).not.toHaveBeenCalled();
    });

    it('routes a persisted tab through focusWorkspaceTab', () => {
      const setActiveTab = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({ setActiveTab, persistedTabs: ['a.md', 'b.md'] })),
      );
      act(() => result.current.activateWorkspaceTab('b.md'));
      expect(setActiveTab).toHaveBeenCalledWith('b.md');
    });
  });

  describe('activateWorkspaceTabByOffset / activateWorkspaceTabByIndex', () => {
    it('wraps forward past the last tab', () => {
      const setActiveTab = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          setActiveTab,
          activeTab: 'b.md',
          workspaceTabIds: ['a.md', 'b.md'],
        })),
      );
      act(() => result.current.activateWorkspaceTabByOffset(1));
      expect(setActiveTab).toHaveBeenCalledWith('a.md');
    });

    it('wraps backward before the first tab', () => {
      const setActiveTab = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          setActiveTab,
          activeTab: 'a.md',
          workspaceTabIds: ['a.md', 'b.md'],
        })),
      );
      act(() => result.current.activateWorkspaceTabByOffset(-1));
      expect(setActiveTab).toHaveBeenCalledWith('b.md');
    });

    it('does nothing when there are no workspace tabs', () => {
      const setActiveTab = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({ setActiveTab, workspaceTabIds: [] })),
      );
      act(() => result.current.activateWorkspaceTabByOffset(1));
      expect(setActiveTab).not.toHaveBeenCalled();
    });

    it('activates by a valid index', () => {
      const setActiveTab = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({ setActiveTab, workspaceTabIds: ['a.md', 'b.md'] })),
      );
      act(() => result.current.activateWorkspaceTabByIndex(1));
      expect(setActiveTab).toHaveBeenCalledWith('b.md');
    });

    it('ignores an out-of-range index', () => {
      const setActiveTab = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({ setActiveTab, workspaceTabIds: ['a.md', 'b.md'] })),
      );
      act(() => result.current.activateWorkspaceTabByIndex(5));
      expect(setActiveTab).not.toHaveBeenCalled();
    });
  });

  describe('closeActiveWorkspaceTab', () => {
    it('does nothing when the active tab is not a workspace tab', () => {
      const setActiveTab = vi.fn();
      const onTabsStateChange = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          setActiveTab,
          onTabsStateChange,
          activeTab: 'nope.md',
          workspaceTabIds: ['a.md'],
        })),
      );
      act(() => result.current.closeActiveWorkspaceTab());
      expect(setActiveTab).not.toHaveBeenCalled();
      expect(onTabsStateChange).not.toHaveBeenCalled();
    });

    it('is a no-op for the reserved Design Files / Design System tabs', () => {
      const setActiveTab = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          setActiveTab,
          activeTab: DESIGN_FILES_TAB,
          workspaceTabIds: [DESIGN_FILES_TAB],
        })),
      );
      act(() => result.current.closeActiveWorkspaceTab());
      expect(setActiveTab).not.toHaveBeenCalled();
    });

    it('falls the Questions tab back to defaultRootTab', () => {
      const setActiveTab = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          setActiveTab,
          activeTab: QUESTIONS_TAB,
          workspaceTabIds: [QUESTIONS_TAB],
        })),
      );
      act(() => result.current.closeActiveWorkspaceTab());
      expect(setActiveTab).toHaveBeenCalledWith(DESIGN_FILES_TAB);
    });

    it('routes a browser tab id to closeBrowserTab', () => {
      const closeBrowserTab = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          closeBrowserTab,
          activeTab: '__browser__:1',
          workspaceTabIds: ['__browser__:1'],
        })),
      );
      act(() => result.current.closeActiveWorkspaceTab());
      expect(closeBrowserTab).toHaveBeenCalledWith('__browser__:1');
    });

    it('routes a plain file tab to closeTab', () => {
      const onTabsStateChange = vi.fn();
      const setActiveTab = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          setActiveTab,
          onTabsStateChange,
          activeTab: 'a.md',
          workspaceTabIds: ['a.md', 'b.md'],
          persistedTabs: ['a.md', 'b.md'],
        })),
      );
      act(() => result.current.closeActiveWorkspaceTab());
      expect(onTabsStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ tabs: ['b.md'] }),
      );
    });
  });

  describe('openFileReplacing', () => {
    it('drops the closed tab and opens/activates the new one atomically', () => {
      const setActiveTab = vi.fn();
      const onTabsStateChange = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          setActiveTab,
          onTabsStateChange,
          persistedTabs: ['module.js', 'other.md'],
        })),
      );
      act(() => result.current.openFileReplacing('entry.html', 'module.js'));
      expect(onTabsStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ tabs: ['other.md', 'entry.html'], active: 'entry.html' }),
      );
      expect(setActiveTab).toHaveBeenCalledWith('entry.html');
    });
  });

  describe('closeTab', () => {
    it('kills the live terminal session and clears the tracked session id', () => {
      const { result } = renderHook(() => useWorkspaceTabActivation(baseParams()));
      act(() => {
        result.current.handleTerminalSessionChange('term-1', 'pty-live-1');
      });
      act(() => result.current.closeTab('terminal:term-1'));
      expect(killTerminal).toHaveBeenCalledWith('proj1', 'pty-live-1', { keepalive: true });
    });

    it('prompts before closing a tab with unsaved sketch strokes, and bails on cancel', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const onTabsStateChange = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          onTabsStateChange,
          sketches: { 'sketch-1.sketch.json': makeSketchState({ dirty: true }) },
        })),
      );
      act(() => result.current.closeTab('sketch-1.sketch.json'));
      expect(onTabsStateChange).not.toHaveBeenCalled();
    });

    it('discards a pending (never-saved) sketch tab and re-activates the last persisted tab', () => {
      const discardPendingSketchEntry = vi.fn();
      const setActiveTab = vi.fn();
      const onTabsStateChange = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          discardPendingSketchEntry,
          setActiveTab,
          onTabsStateChange,
          activeTab: 'sketch-1.sketch.json',
          persistedTabs: ['a.md', 'b.md'],
          sketches: { 'sketch-1.sketch.json': makeSketchState({ persisted: false, dirty: false }) },
        })),
      );
      act(() => result.current.closeTab('sketch-1.sketch.json'));
      expect(discardPendingSketchEntry).toHaveBeenCalledWith('sketch-1.sketch.json');
      expect(setActiveTab).toHaveBeenCalledWith('b.md');
      // The pending-sketch path re-activates via `setPersistedActive`, which
      // commits the persisted tab list as a side effect (unlike
      // `activatePending`, which only flips local `activeTab`).
      expect(onTabsStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ tabs: ['a.md', 'b.md'], active: 'b.md' }),
      );
    });

    it('removes a persisted tab, falls back to the last remaining tab, and prunes the sketch entry', () => {
      const pruneClosedSketchEntry = vi.fn();
      const setActiveTab = vi.fn();
      const onTabsStateChange = vi.fn();
      const tabsState: OpenTabsState = { tabs: ['a.md', 'b.md'], active: 'a.md' };
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          tabsState,
          tabsStateRef: { current: tabsState },
          pruneClosedSketchEntry,
          setActiveTab,
          onTabsStateChange,
          activeTab: 'a.md',
          persistedTabs: ['a.md', 'b.md'],
        })),
      );
      act(() => result.current.closeTab('a.md'));
      expect(onTabsStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ tabs: ['b.md'], active: 'b.md' }),
      );
      expect(setActiveTab).toHaveBeenCalledWith('b.md');
      expect(pruneClosedSketchEntry).toHaveBeenCalledWith('a.md');
    });

    it('closing a background tab preserves the current tabsState.active', () => {
      const setActiveTab = vi.fn();
      const onTabsStateChange = vi.fn();
      const tabsState: OpenTabsState = { tabs: ['a.md', 'b.md'], active: 'a.md' };
      const { result } = renderHook(() =>
        useWorkspaceTabActivation(baseParams({
          tabsState,
          tabsStateRef: { current: tabsState },
          setActiveTab,
          onTabsStateChange,
          activeTab: 'a.md',
          persistedTabs: ['a.md', 'b.md'],
        })),
      );
      act(() => result.current.closeTab('b.md'));
      expect(onTabsStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ tabs: ['a.md'], active: 'a.md' }),
      );
      // `setActiveTab` is called unconditionally at the end of the
      // non-pending path, even when `nextActive` equals the current value.
      expect(setActiveTab).toHaveBeenCalledWith('a.md');
    });
  });
});
