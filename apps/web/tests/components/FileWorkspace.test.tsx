// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileWorkspace, scrollWorkspaceTabsWithWheel } from '../../src/components/FileWorkspace';
import { projectSplitClassName } from '../../src/components/ProjectView';
import type { ProjectFile } from '../../src/types';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  host?.remove();
  host = null;
});

function workspaceFile(name: string): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 100,
    mtime: 1700000000,
    kind: name.endsWith('.html') ? 'html' : 'text',
    mime: name.endsWith('.html') ? 'text/html' : 'text/plain',
  };
}

function renderWorkspace(element: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(element);
  });
  return host;
}

function getTabByName(container: HTMLElement, name: RegExp): HTMLElement {
  const tabs = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
  const tab = tabs.find((node) => name.test(node.textContent ?? ''));
  if (!tab) throw new Error(`Could not find tab matching ${name}`);
  return tab;
}

function createDragDataTransfer() {
  const store = new Map<string, string>();
  return {
    effectAllowed: 'move',
    dropEffect: 'move',
    getData: vi.fn((type: string) => store.get(type) ?? ''),
    setData: vi.fn((type: string, value: string) => {
      store.set(type, value);
    }),
  };
}

function dispatchDragEvent(
  target: HTMLElement,
  type: string,
  dataTransfer = createDragDataTransfer(),
  clientX = 0,
  relatedTarget: EventTarget | null = null,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    dataTransfer: { value: dataTransfer },
    relatedTarget: { value: relatedTarget },
  });
  target.dispatchEvent(event);
  return dataTransfer;
}

function stubTabRect(tab: HTMLElement, left = 0, width = 100) {
  tab.getBoundingClientRect = vi.fn(() => ({
    x: left,
    y: 0,
    left,
    top: 0,
    right: left + width,
    bottom: 20,
    width,
    height: 20,
    toJSON: () => ({}),
  }));
}

describe('FileWorkspace upload input', () => {
  it('keeps the Design Files picker aligned with drag-and-drop file support', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="project-1"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    expect(markup).toContain('data-testid="design-files-upload-input"');
    expect(markup).not.toContain('accept=');
  });

  it('keeps focus mode controls in the workspace tab bar', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="project-1"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        focusMode={false}
        onFocusModeChange={vi.fn()}
      />,
    );

    expect(markup).toContain('data-testid="workspace-focus-toggle"');
    expect(markup).toContain('Focus workspace');
  });

  it('keeps the focus mode action outside the horizontally scrollable tablist', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="project-1"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        focusMode={false}
        onFocusModeChange={vi.fn()}
      />,
    );

    expect(markup).toContain('class="ws-tabs-shell"');
    expect(markup).toContain('class="ws-tabs-actions"');
    expect(markup).toMatch(
      /<div class="ws-tabs-bar" role="tablist"[^>]*>[\s\S]*?<\/div><div class="ws-tabs-actions">/,
    );
  });

  it('labels the same workspace control as chat restore while focused', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="project-1"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        focusMode
        onFocusModeChange={vi.fn()}
      />,
    );

    expect(markup).toContain('Show chat');
  });
});

describe('FileWorkspace tab reordering', () => {
  it('persists a dragged file tab before the tab it is dropped on', () => {
    const onTabsStateChange = vi.fn();

    const container = renderWorkspace(
      <FileWorkspace
        projectId="project-1"
        files={[
          workspaceFile('analysis.html'),
          workspaceFile('notes.md'),
          workspaceFile('summary.html'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: ['analysis.html', 'notes.md', 'summary.html'],
          active: null,
        }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    const source = getTabByName(container, /summary\.html/i);
    const target = getTabByName(container, /analysis\.html/i);
    stubTabRect(target);

    let dataTransfer = createDragDataTransfer();
    act(() => {
      dataTransfer = dispatchDragEvent(source, 'dragstart', dataTransfer);
    });
    act(() => dispatchDragEvent(target, 'dragover', dataTransfer));
    act(() => dispatchDragEvent(target, 'drop', dataTransfer));

    expect(onTabsStateChange).toHaveBeenCalledWith({
      tabs: ['summary.html', 'analysis.html', 'notes.md'],
      active: null,
    });
  });

  it('persists a dragged file tab after the tab when dropped on its right side', () => {
    const onTabsStateChange = vi.fn();

    const container = renderWorkspace(
      <FileWorkspace
        projectId="project-1"
        files={[
          workspaceFile('analysis.html'),
          workspaceFile('notes.md'),
          workspaceFile('summary.html'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: ['analysis.html', 'notes.md', 'summary.html'],
          active: null,
        }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    const source = getTabByName(container, /analysis\.html/i);
    const target = getTabByName(container, /summary\.html/i);
    stubTabRect(target);

    let dataTransfer = createDragDataTransfer();
    act(() => {
      dataTransfer = dispatchDragEvent(source, 'dragstart', dataTransfer);
    });
    act(() => dispatchDragEvent(target, 'drop', dataTransfer, 75));

    expect(onTabsStateChange).toHaveBeenCalledWith({
      tabs: ['notes.md', 'summary.html', 'analysis.html'],
      active: null,
    });
  });

  it('does not persist when a tab is dropped on itself', () => {
    const onTabsStateChange = vi.fn();

    const container = renderWorkspace(
      <FileWorkspace
        projectId="project-1"
        files={[workspaceFile('analysis.html'), workspaceFile('notes.md')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: ['analysis.html', 'notes.md'],
          active: null,
        }}
        onTabsStateChange={onTabsStateChange}
      />,
    );

    const tab = getTabByName(container, /analysis\.html/i);
    stubTabRect(tab);

    let dataTransfer = createDragDataTransfer();
    act(() => {
      dataTransfer = dispatchDragEvent(tab, 'dragstart', dataTransfer);
    });
    act(() => dispatchDragEvent(tab, 'drop', dataTransfer));

    expect(onTabsStateChange).not.toHaveBeenCalled();
  });

  it('clears the drop indicator when the drag leaves the tab bar', () => {
    const container = renderWorkspace(
      <FileWorkspace
        projectId="project-1"
        files={[workspaceFile('analysis.html'), workspaceFile('notes.md')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{
          tabs: ['analysis.html', 'notes.md'],
          active: null,
        }}
        onTabsStateChange={vi.fn()}
      />,
    );

    const source = getTabByName(container, /analysis\.html/i);
    const target = getTabByName(container, /notes\.md/i);
    const tabBar = container.querySelector<HTMLElement>('.ws-tabs-bar');
    if (!tabBar) throw new Error('Could not find tabs bar');
    stubTabRect(target);

    let dataTransfer = createDragDataTransfer();
    act(() => {
      dataTransfer = dispatchDragEvent(source, 'dragstart', dataTransfer);
    });
    act(() => dispatchDragEvent(target, 'dragover', dataTransfer));

    expect(target.className).toContain('drag-over-before');

    act(() => dispatchDragEvent(tabBar, 'dragleave', dataTransfer, 0, document.body));

    expect(target.className).not.toContain('drag-over-before');
    expect(target.className).not.toContain('drag-over-after');
  });
});

describe('projectSplitClassName', () => {
  it('marks the project split as focused so the chat pane can collapse globally', () => {
    expect(projectSplitClassName(false)).toBe('split');
    expect(projectSplitClassName(true)).toBe('split split-focus');
  });
});

describe('scrollWorkspaceTabsWithWheel', () => {
  function makeTabBar(scrollLeft: number, scrollWidth = 400, clientWidth = 200) {
    return { scrollLeft, scrollWidth, clientWidth } as HTMLDivElement;
  }

  function makeClampedTabBar(scrollLeft: number, scrollWidth = 400, clientWidth = 200) {
    let value = scrollLeft;
    return {
      scrollWidth,
      clientWidth,
      get scrollLeft() {
        return value;
      },
      set scrollLeft(next: number) {
        value = Math.min(Math.max(next, 0), scrollWidth - clientWidth);
      },
    } as HTMLDivElement;
  }

  it('maps vertical mouse wheel movement to horizontal tab scrolling', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeTabBar(12);
    const event = {
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 40,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(52);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('supports reverse vertical wheel movement', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeTabBar(52);
    const event = {
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: -40,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(12);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('normalizes line-based wheel deltas to useful pixel movement', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeTabBar(12);
    const event = {
      ctrlKey: false,
      deltaMode: 1,
      deltaX: 0,
      deltaY: 3,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(60);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('normalizes page-based wheel deltas to useful pixel movement', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeTabBar(12, 600, 200);
    const event = {
      ctrlKey: false,
      deltaMode: 2,
      deltaX: 0,
      deltaY: 1,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(172);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('leaves native horizontal wheel gestures alone', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeTabBar(12);
    const event = {
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 50,
      deltaY: 10,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(12);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('leaves ctrl-wheel zoom gestures alone', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeTabBar(12);
    const event = {
      ctrlKey: true,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 40,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(12);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('does not intercept vertical wheel movement when tabs do not overflow', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeTabBar(12, 200, 200);
    const event = {
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 40,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(12);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('lets page scrolling continue when the tab bar is already at the wheel boundary', () => {
    const preventDefault = vi.fn();
    const currentTarget = makeClampedTabBar(200, 400, 200);
    const event = {
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 40,
      preventDefault,
    } as unknown as WheelEvent;

    scrollWorkspaceTabsWithWheel(currentTarget, event);

    expect(currentTarget.scrollLeft).toBe(200);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
