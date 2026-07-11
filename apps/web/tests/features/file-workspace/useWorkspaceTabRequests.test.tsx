// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useWorkspaceTabRequests,
  type WorkspaceTabRequestsParams,
} from '../../../src/features/file-workspace/hooks/useWorkspaceTabRequests.hooks';
import {
  DESIGN_FILES_TAB,
  DESIGN_SYSTEM_TAB,
  QUESTIONS_TAB,
} from '../../../src/features/file-workspace/constants';
import type { BrowserWorkspaceTab, SketchState } from '../../../src/features/file-workspace/types';
import type { OpenTabsState } from '../../../src/types';

function workspaceTabsState(
  tabs: string[],
  active: string | null,
  nextBrowserTabs: BrowserWorkspaceTab[] = [],
): OpenTabsState {
  const state: OpenTabsState = { tabs, active };
  if (nextBrowserTabs.length > 0) state.browserTabs = nextBrowserTabs;
  return state;
}

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

function baseParams(over: Partial<WorkspaceTabRequestsParams> = {}): WorkspaceTabRequestsParams {
  return {
    activeTab: 'a.md',
    setActiveTab: vi.fn(),
    defaultRootTab: DESIGN_FILES_TAB,
    persistedTabs: ['a.md', 'b.md'],
    browserTabs: [],
    setBrowserTabs: vi.fn(),
    orderedWorkspaceTabs: [],
    sketches: {},
    designSystemProject: null,
    showQuestionsTab: false,
    setUploadError: vi.fn(),
    setPersistedActive: vi.fn(),
    onTabsStateChange: vi.fn(),
    commitTabsState: vi.fn(),
    workspaceTabsState,
    ...over,
  };
}

describe('useWorkspaceTabRequests', () => {
  describe('persisted-tab fallback', () => {
    it('does nothing for the reserved tabs', () => {
      const setPersistedActive = vi.fn();
      const setActiveTab = vi.fn();
      renderHook(() =>
        useWorkspaceTabRequests(baseParams({ activeTab: DESIGN_FILES_TAB, setPersistedActive, setActiveTab })),
      );
      expect(setPersistedActive).not.toHaveBeenCalled();
      expect(setActiveTab).not.toHaveBeenCalled();
    });

    it('falls back to Design Files when a browser tab id is no longer open', () => {
      const setActiveTab = vi.fn();
      renderHook(() =>
        useWorkspaceTabRequests(baseParams({ activeTab: '__browser__:1', browserTabs: [], setActiveTab })),
      );
      expect(setActiveTab).toHaveBeenCalledWith(DESIGN_FILES_TAB);
    });

    it('leaves an open browser tab alone', () => {
      const setActiveTab = vi.fn();
      const browserTabs: BrowserWorkspaceTab[] = [{ id: '__browser__:1', insertAfter: null, label: 'Browser' }];
      renderHook(() =>
        useWorkspaceTabRequests(baseParams({ activeTab: '__browser__:1', browserTabs, setActiveTab })),
      );
      expect(setActiveTab).not.toHaveBeenCalled();
    });

    it('skips a pending (unpersisted) sketch tab', () => {
      const setPersistedActive = vi.fn();
      renderHook(() =>
        useWorkspaceTabRequests(baseParams({
          activeTab: 'sketch-1',
          persistedTabs: ['a.md'],
          sketches: { 'sketch-1': makeSketchState({ persisted: false }) },
          setPersistedActive,
        })),
      );
      expect(setPersistedActive).not.toHaveBeenCalled();
    });

    it('falls back to the last persisted tab when the active tab is gone', () => {
      const setPersistedActive = vi.fn();
      renderHook(() =>
        useWorkspaceTabRequests(baseParams({
          activeTab: 'gone.md',
          persistedTabs: ['a.md', 'b.md'],
          setPersistedActive,
        })),
      );
      expect(setPersistedActive).toHaveBeenCalledWith('b.md');
    });
  });

  describe('designSystemEditRequest', () => {
    it('clears the upload error and focuses the design-system tab when a project exists', () => {
      const setUploadError = vi.fn();
      const setPersistedActive = vi.fn();
      renderHook(() =>
        useWorkspaceTabRequests(baseParams({
          designSystemEditRequest: { nonce: 1 } as never,
          designSystemProject: { id: 'ds1' } as never,
          setUploadError,
          setPersistedActive,
        })),
      );
      expect(setUploadError).toHaveBeenCalledWith(null);
      expect(setPersistedActive).toHaveBeenCalledWith(DESIGN_SYSTEM_TAB);
    });

    it('falls back to Design Files when there is no design-system project', () => {
      const setPersistedActive = vi.fn();
      renderHook(() =>
        useWorkspaceTabRequests(baseParams({
          designSystemEditRequest: { nonce: 1 } as never,
          designSystemProject: null,
          setPersistedActive,
        })),
      );
      expect(setPersistedActive).toHaveBeenCalledWith(DESIGN_FILES_TAB);
    });
  });

  describe('openRequest', () => {
    it('activates an existing browser tab without reanchoring', () => {
      const setBrowserTabs = vi.fn();
      const onTabsStateChange = vi.fn();
      const setActiveTab = vi.fn();
      const browserTabs: BrowserWorkspaceTab[] = [{ id: '__browser__:1', insertAfter: null, label: 'Browser' }];
      renderHook(() =>
        useWorkspaceTabRequests(baseParams({
          openRequest: { name: '__browser__:1', nonce: 1 },
          browserTabs,
          setBrowserTabs,
          onTabsStateChange,
          setActiveTab,
        })),
      );
      expect(setBrowserTabs).not.toHaveBeenCalled();
      expect(setActiveTab).toHaveBeenCalledWith('__browser__:1');
      expect(onTabsStateChange).toHaveBeenCalledWith(workspaceTabsState(['a.md', 'b.md'], '__browser__:1'));
    });

    it('opens a new file tab, appending it to persistedTabs', () => {
      const onTabsStateChange = vi.fn();
      const setActiveTab = vi.fn();
      renderHook(() =>
        useWorkspaceTabRequests(baseParams({
          openRequest: { name: 'new.md', nonce: 1 },
          onTabsStateChange,
          setActiveTab,
        })),
      );
      expect(setActiveTab).toHaveBeenCalledWith('new.md');
      expect(onTabsStateChange).toHaveBeenCalledWith(
        workspaceTabsState(['a.md', 'b.md', 'new.md'], 'new.md'),
      );
    });

    it('routes DESIGN_SYSTEM_TAB to Design Files when there is no design-system project', () => {
      const onTabsStateChange = vi.fn();
      const setActiveTab = vi.fn();
      renderHook(() =>
        useWorkspaceTabRequests(baseParams({
          openRequest: { name: DESIGN_SYSTEM_TAB, nonce: 1 },
          designSystemProject: null,
          onTabsStateChange,
          setActiveTab,
        })),
      );
      expect(setActiveTab).toHaveBeenCalledWith(DESIGN_FILES_TAB);
    });
  });

  describe('shareRequest / downloadRequest', () => {
    it('shareRequest opens and activates the named file', () => {
      const commitTabsState = vi.fn();
      const setActiveTab = vi.fn();
      renderHook(() =>
        useWorkspaceTabRequests(baseParams({
          shareRequest: { name: 'c.md', nonce: 1 },
          commitTabsState,
          setActiveTab,
        })),
      );
      expect(commitTabsState).toHaveBeenCalledWith(workspaceTabsState(['a.md', 'b.md', 'c.md'], 'c.md'));
      expect(setActiveTab).toHaveBeenCalledWith('c.md');
    });

    it('downloadRequest opens and activates the named file', () => {
      const commitTabsState = vi.fn();
      const setActiveTab = vi.fn();
      renderHook(() =>
        useWorkspaceTabRequests(baseParams({
          downloadRequest: { name: 'b.md', nonce: 1 },
          commitTabsState,
          setActiveTab,
        })),
      );
      expect(commitTabsState).toHaveBeenCalledWith(workspaceTabsState(['a.md', 'b.md'], 'b.md'));
      expect(setActiveTab).toHaveBeenCalledWith('b.md');
    });
  });

  describe('slideNavRequest', () => {
    it('marks the request deliverable and activates the deck when it is already open', () => {
      const setActiveTab = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabRequests(baseParams({
          slideNavRequest: { name: 'a.md', slideIndex: 2, nonce: 7 },
          persistedTabs: ['a.md'],
          setActiveTab,
        })),
      );
      expect(setActiveTab).toHaveBeenCalledWith('a.md');
      expect(result.current.slideNavDeliverableNonce).toBe(7);
    });

    it('does not deliver a request for a file that is not open', () => {
      const setActiveTab = vi.fn();
      const { result } = renderHook(() =>
        useWorkspaceTabRequests(baseParams({
          slideNavRequest: { name: 'closed.md', slideIndex: 0, nonce: 3 },
          persistedTabs: ['a.md'],
          setActiveTab,
        })),
      );
      expect(setActiveTab).not.toHaveBeenCalled();
      expect(result.current.slideNavDeliverableNonce).toBeNull();
    });
  });

  describe('focusQuestionsRequest', () => {
    it('activates the Questions tab on a nonce bump', () => {
      const setActiveTab = vi.fn();
      renderHook(() =>
        useWorkspaceTabRequests(baseParams({
          focusQuestionsRequest: { nonce: 1 },
          setActiveTab,
        })),
      );
      expect(setActiveTab).toHaveBeenCalledWith(QUESTIONS_TAB);
    });
  });

  describe('questionFormSubmittedAnswers close-once', () => {
    it('closes the Questions tab the first time answers appear', () => {
      const setActiveTab = vi.fn();
      const { rerender } = renderHook(
        (props: WorkspaceTabRequestsParams) => useWorkspaceTabRequests(props),
        {
          initialProps: baseParams({
            activeTab: QUESTIONS_TAB,
            showQuestionsTab: true,
            questionFormSubmittedAnswers: undefined,
            setActiveTab,
          }),
        },
      );
      expect(setActiveTab).not.toHaveBeenCalled();
      rerender(baseParams({
        activeTab: QUESTIONS_TAB,
        showQuestionsTab: true,
        questionFormSubmittedAnswers: { q1: 'answer' },
        setActiveTab,
      }));
      expect(setActiveTab).toHaveBeenCalledWith(DESIGN_FILES_TAB);
    });

    it('does not reclose on a later banner click once already answered at mount', () => {
      const setActiveTab = vi.fn();
      const { rerender } = renderHook(
        (props: WorkspaceTabRequestsParams) => useWorkspaceTabRequests(props),
        {
          initialProps: baseParams({
            activeTab: QUESTIONS_TAB,
            showQuestionsTab: true,
            questionFormSubmittedAnswers: { q1: 'answer' },
            setActiveTab,
          }),
        },
      );
      expect(setActiveTab).not.toHaveBeenCalled();
      rerender(baseParams({
        activeTab: QUESTIONS_TAB,
        showQuestionsTab: true,
        questionFormSubmittedAnswers: { q1: 'answer' },
        setActiveTab,
      }));
      expect(setActiveTab).not.toHaveBeenCalled();
    });
  });

  describe('showQuestionsTab fallback', () => {
    it('falls back to the default root tab when the Questions tab loses its content', () => {
      const setActiveTab = vi.fn();
      renderHook(() =>
        useWorkspaceTabRequests(baseParams({
          activeTab: QUESTIONS_TAB,
          showQuestionsTab: false,
          setActiveTab,
        })),
      );
      expect(setActiveTab).toHaveBeenCalledWith(DESIGN_FILES_TAB);
    });

    it('leaves the Questions tab alone while it still has content', () => {
      const setActiveTab = vi.fn();
      renderHook(() =>
        useWorkspaceTabRequests(baseParams({
          activeTab: QUESTIONS_TAB,
          showQuestionsTab: true,
          setActiveTab,
        })),
      );
      expect(setActiveTab).not.toHaveBeenCalled();
    });
  });
});
