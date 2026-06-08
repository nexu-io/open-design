// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  openWorkspaceTab,
  WorkspaceTabsBar,
} from '../../src/components/WorkspaceTabsBar';
import { navigate, type Route } from '../../src/router';
import type { Project } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: (key: string) => key,
  }),
  useT: () => (key: string) => {
    const labels: Record<string, string> = {
      'app.brand': 'Open Design',
      'common.close': 'Close',
      'common.untitled': 'Untitled',
      'entry.navDesignSystems': 'Design systems',
      'entry.navHome': 'Home',
      'entry.navProjects': 'Projects',
      'entry.navTasks': 'Automations',
      'entry.navPlugins': 'Plugins',
      'entry.navIntegrations': 'Integrations',
    };
    return labels[key] ?? key;
  },
}));

vi.mock('../../src/router', async () => {
  const actual = await vi.importActual<typeof import('../../src/router')>(
    '../../src/router',
  );
  return {
    ...actual,
    navigate: vi.fn(),
  };
});

const homeRoute: Route = { kind: 'home', view: 'home' };
const projectRoute: Route = {
  kind: 'project',
  projectId: 'project-alpha',
  conversationId: null,
  fileName: null,
};

const project: Project = {
  id: 'project-alpha',
  name: 'Project Alpha',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
};

const projectBeta: Project = {
  id: 'project-beta',
  name: 'Project Beta',
  skillId: null,
  designSystemId: null,
  createdAt: 2,
  updatedAt: 2,
};

function createDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    dropEffect: 'move',
    effectAllowed: 'move',
    getData: vi.fn((key: string) => store.get(key) ?? ''),
    setData: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  } as unknown as DataTransfer;
}

function mockTabRect(element: HTMLElement, left: number, width = 100) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        x: left,
        y: 0,
        left,
        right: left + width,
        top: 0,
        bottom: 32,
        width,
        height: 32,
        toJSON: () => ({}),
      }) as DOMRect,
  });
}

function dispatchDragEvent(
  element: HTMLElement,
  type: 'dragover' | 'drop',
  dataTransfer: DataTransfer,
  clientX: number,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { configurable: true, value: dataTransfer });
  Object.defineProperty(event, 'clientX', { configurable: true, value: clientX });
  fireEvent(element, event);
}

describe('WorkspaceTabsBar navigation semantics', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    document.querySelector('[data-testid="blank-workspace-area"]')?.remove();
  });

  it('keeps Home tab as a singleton and avoids duplication', async () => {
    const { rerender } = render(
      <WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />,
    );

    expect(screen.getAllByRole('tab')).toHaveLength(1);

    // Clicking 'New tab' when a Home tab already exists should activate the existing Home tab
    fireEvent.click(screen.getByRole('button', { name: 'New tab' }));
    fireEvent.click(screen.getByRole('button', { name: 'New tab' }));

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels.filter((label) => label.includes('Home'))).toHaveLength(1);
    });

    // Navigate to projectRoute using rerender with a fresh object reference
    rerender(<WorkspaceTabsBar route={{ ...projectRoute }} projects={[project]} />);

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toHaveLength(2);
      expect(labels.some((label) => label.includes('Home'))).toBe(true);
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(true);
    });

    // Return to Home by navigating back with a fresh route object reference
    rerender(<WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />);

    await waitFor(() => {
      const tabs = screen.getAllByRole('tab');
      const labels = tabs.map((tab) => tab.textContent ?? '');
      // Expect that we still have 2 tabs (Home and Project Alpha)
      expect(tabs).toHaveLength(2);
      expect(labels.filter((label) => label.includes('Home'))).toHaveLength(1);
      expect(labels.filter((label) => label.includes('Project Alpha'))).toHaveLength(1);
    });
  });

  it('collapses every entry section into the single leftmost tab (no new tab per section)', async () => {
    const { rerender } = render(
      <WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(1);

    const sections: Array<{ view: 'projects' | 'tasks' | 'design-systems' | 'plugins' | 'integrations'; label: string }> = [
      { view: 'projects', label: 'Projects' },
      { view: 'tasks', label: 'Automations' },
      { view: 'design-systems', label: 'Design systems' },
      { view: 'plugins', label: 'Plugins' },
      { view: 'integrations', label: 'Integrations' },
    ];

    for (const section of sections) {
      rerender(<WorkspaceTabsBar route={{ kind: 'home', view: section.view }} projects={[project]} />);
      await waitFor(() => {
        const tabs = screen.getAllByRole('tab');
        // Exactly one tab the whole time — the section just switches the view.
        expect(tabs).toHaveLength(1);
        expect(tabs[0]?.textContent ?? '').toContain(section.label);
      });
    }

    // The single entry tab in a non-home view is still permanent (no close btn).
    expect(screen.queryByRole('button', { name: 'Close tab' })).toBeNull();
  });

  it('keeps the entry tab when opening a project from a non-home entry view', async () => {
    const { rerender } = render(
      <WorkspaceTabsBar route={{ kind: 'home', view: 'design-systems' }} projects={[project]} />,
    );
    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toHaveLength(1);
      expect(labels[0]).toContain('Design systems');
    });

    // Opening a project from the design-systems view must APPEND a project tab,
    // not replace the entry tab.
    rerender(<WorkspaceTabsBar route={{ ...projectRoute }} projects={[project]} />);
    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toHaveLength(2);
      expect(labels.some((label) => label.includes('Design systems'))).toBe(true);
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(true);
    });

    // Switching to another section keeps the SAME entry tab and the project tab.
    rerender(<WorkspaceTabsBar route={{ kind: 'home', view: 'tasks' }} projects={[project]} />);
    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toHaveLength(2);
      expect(labels.some((label) => label.includes('Automations'))).toBe(true);
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(true);
    });
  });

  it('collapses a restored two-entry-tab workspace into a single entry tab', async () => {
    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        activeTabId: 'entry:projects:1',
        tabs: [
          { id: 'entry:home:1', kind: 'entry', view: 'home', createdAt: 1, lastActiveAt: 1 },
          { id: 'entry:projects:1', kind: 'entry', view: 'projects', createdAt: 2, lastActiveAt: 2 },
        ],
      }),
    );
    render(<WorkspaceTabsBar route={{ kind: 'home', view: 'projects' }} projects={[project]} />);
    await waitFor(() => {
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(1);
      expect(tabs[0]?.textContent ?? '').toContain('Projects');
    });
  });

  it('can append and focus a project tab for create-project flows', async () => {
    render(<WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />);

    openWorkspaceTab({ ...projectRoute });

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toHaveLength(2);
      expect(labels.some((label) => label.includes('Home'))).toBe(true);
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(true);
    });
  });

  it('keeps a singleton Home tab when restoring a Home-less workspace and navigating back to Home', async () => {
    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        activeTabId: 'project:project-alpha',
        tabs: [
          {
            id: 'project:project-alpha',
            kind: 'project',
            projectId: 'project-alpha',
            createdAt: 1,
            lastActiveAt: 1,
          },
        ],
      }),
    );

    const { rerender } = render(
      <WorkspaceTabsBar route={{ ...projectRoute }} projects={[project]} />,
    );

    // Restoring a Home-less saved workspace immediately mints the permanent
    // Home tab pinned leftmost — Project Alpha sits to its right.
    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toEqual([
        expect.stringContaining('Home'),
        expect.stringContaining('Project Alpha'),
      ]);
    });

    // Navigating to Home must not duplicate it.
    rerender(<WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />);

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toHaveLength(2);
      expect(labels.filter((label) => label.includes('Home'))).toHaveLength(1);
      expect(labels.filter((label) => label.includes('Project Alpha'))).toHaveLength(1);
    });
  });

  it('creates a pinned Home tab when restoring saved tabs that have no Home entry', async () => {
    // Users who closed/replaced Home before the permanent-Home feature shipped
    // can have a saved `[project, ...]` workspace with no Home entry. Normalizing
    // that state must mint a Home tab and pin it leftmost, not leave the workspace
    // Home-less until the user manually navigates home.
    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        activeTabId: 'project:project-alpha',
        tabs: [
          {
            id: 'project:project-alpha',
            kind: 'project',
            projectId: 'project-alpha',
            conversationId: null,
            fileName: null,
            createdAt: 1,
            lastActiveAt: 1,
          },
          {
            id: 'project:project-beta',
            kind: 'project',
            projectId: 'project-beta',
            conversationId: null,
            fileName: null,
            createdAt: 2,
            lastActiveAt: 2,
          },
        ],
      }),
    );

    render(<WorkspaceTabsBar route={{ ...projectRoute }} projects={[project, projectBeta]} />);

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toEqual([
        expect.stringContaining('Home'),
        expect.stringContaining('Project Alpha'),
        expect.stringContaining('Project Beta'),
      ]);
    });
  });

  it('deduplicates and cleans up restored Home tabs from old sessions', async () => {
    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        activeTabId: 'entry:home:old-two',
        tabs: [
          {
            id: 'entry:home:old-one',
            kind: 'entry',
            view: 'home',
            createdAt: 1,
            lastActiveAt: 1,
          },
          {
            id: 'entry:home:old-two',
            kind: 'entry',
            view: 'home',
            createdAt: 2,
            lastActiveAt: 2,
          },
        ],
      }),
    );

    render(<WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />);

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      // Expect that the duplicate Home tabs are deduplicated to exactly one Home tab
      expect(labels.filter((label) => label.includes('Home'))).toHaveLength(1);
    });
  });

  it('keeps the pinned Home tab permanent and non-closable', async () => {
    render(<WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />);

    // The Home tab is pinned leftmost and has no close affordance, so there is
    // no way to remove the last remaining tab.
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();

    const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain('Home');
  });

  it('maps the browser new-tab shortcut to the workspace new-tab action', async () => {
    render(<WorkspaceTabsBar route={{ ...projectRoute }} projects={[project]} />);

    const allowedDefault = fireEvent.keyDown(document, {
      key: 't',
      metaKey: true,
    });

    expect(allowedDefault).toBe(false);
    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toHaveLength(2);
      expect(labels.some((label) => label.includes('Home'))).toBe(true);
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(true);
    });
    expect(navigate).toHaveBeenCalledWith(homeRoute);
  });

  it('defers browser tab shortcuts when the project file workspace is mounted', () => {
    render(
      <>
        <div data-testid="file-workspace" />
        <WorkspaceTabsBar route={{ ...projectRoute }} projects={[project]} />
      </>,
    );

    const allowedDefault = fireEvent.keyDown(document, {
      key: 't',
      metaKey: true,
    });

    expect(allowedDefault).toBe(true);
    // Home is always pinned leftmost, so the project route renders Home + the
    // project tab. The deferred shortcut must not add or change tabs.
    const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
    expect(labels).toEqual([
      expect.stringContaining('Home'),
      expect.stringContaining('Project Alpha'),
    ]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('maps the browser close-tab shortcut to the active workspace tab', async () => {
    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        activeTabId: 'project:project-alpha',
        tabs: [
          {
            id: 'entry:home:seed',
            kind: 'entry',
            view: 'home',
            createdAt: 1,
            lastActiveAt: 1,
          },
          {
            id: 'project:project-alpha',
            kind: 'project',
            projectId: 'project-alpha',
            conversationId: null,
            fileName: null,
            createdAt: 2,
            lastActiveAt: 2,
          },
        ],
      }),
    );

    render(<WorkspaceTabsBar route={{ ...projectRoute }} projects={[project]} />);

    const allowedDefault = fireEvent.keyDown(document, {
      key: 'w',
      ctrlKey: true,
    });

    expect(allowedDefault).toBe(false);
    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toHaveLength(1);
      expect(labels[0]).toContain('Home');
    });
    expect(navigate).toHaveBeenCalledWith(homeRoute);
  });

  it('switches tabs with browser-style next and previous tab shortcuts', async () => {
    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        activeTabId: 'project:project-alpha',
        tabs: [
          {
            id: 'entry:home:seed',
            kind: 'entry',
            view: 'home',
            createdAt: 1,
            lastActiveAt: 1,
          },
          {
            id: 'project:project-alpha',
            kind: 'project',
            projectId: 'project-alpha',
            conversationId: null,
            fileName: null,
            createdAt: 2,
            lastActiveAt: 2,
          },
          {
            id: 'project:project-beta',
            kind: 'project',
            projectId: 'project-beta',
            conversationId: null,
            fileName: null,
            createdAt: 3,
            lastActiveAt: 3,
          },
        ],
      }),
    );

    render(<WorkspaceTabsBar route={{ ...projectRoute }} projects={[project, projectBeta]} />);

    const nextAllowedDefault = fireEvent.keyDown(document, {
      key: 'Tab',
      ctrlKey: true,
    });

    expect(nextAllowedDefault).toBe(false);
    await waitFor(() => {
      expect(navigate).toHaveBeenLastCalledWith({
        kind: 'project',
        projectId: 'project-beta',
        conversationId: null,
        fileName: null,
      });
    });

    const previousAllowedDefault = fireEvent.keyDown(document, {
      key: 'Tab',
      ctrlKey: true,
      shiftKey: true,
    });

    expect(previousAllowedDefault).toBe(false);
    await waitFor(() => {
      expect(navigate).toHaveBeenLastCalledWith(projectRoute);
    });
  });

  it('dismisses tab search when a blank page area handles the mouse down', async () => {
    const outsideArea = document.createElement('div');
    outsideArea.setAttribute('data-testid', 'blank-workspace-area');
    outsideArea.addEventListener('mousedown', (event) => event.stopPropagation());
    document.body.append(outsideArea);

    render(<WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Search tabs' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Search tabs' })).toBeTruthy();
    });

    fireEvent.mouseDown(outsideArea);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Search tabs' })).toBeNull();
    });
  });

  it('sizes the hover preview to the hovered tab width', async () => {
    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        activeTabId: 'entry:home:seed',
        tabs: [
          {
            id: 'entry:home:seed',
            kind: 'entry',
            view: 'home',
            createdAt: 1,
            lastActiveAt: 2,
          },
          {
            id: 'project:project-alpha',
            kind: 'project',
            projectId: 'project-alpha',
            conversationId: null,
            fileName: null,
            createdAt: 2,
            lastActiveAt: 1,
          },
        ],
      }),
    );

    render(<WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />);

    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2);
    });

    const projectTab = screen.getAllByRole('tab').find((tab) =>
      (tab.textContent ?? '').includes('Project Alpha'),
    ) as HTMLElement;
    mockTabRect(projectTab, 32, 148);
    fireEvent.mouseEnter(projectTab);

    await new Promise((resolve) => window.setTimeout(resolve, 430));

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.style.width).toBe('148px');
    expect(tooltip.style.left).toBe('32px');
  });

  it('keeps the Home tab pinned leftmost when a tab is dropped onto its left edge', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(window.navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });

    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        activeTabId: 'project:project-alpha',
        tabs: [
          {
            id: 'entry:home:seed',
            kind: 'entry',
            view: 'home',
            createdAt: 1,
            lastActiveAt: 1,
          },
          {
            id: 'project:project-alpha',
            kind: 'project',
            projectId: 'project-alpha',
            conversationId: null,
            fileName: null,
            createdAt: 2,
            lastActiveAt: 2,
          },
          {
            id: 'project:project-beta',
            kind: 'project',
            projectId: 'project-beta',
            conversationId: null,
            fileName: null,
            createdAt: 3,
            lastActiveAt: 3,
          },
        ],
      }),
    );

    render(<WorkspaceTabsBar route={{ ...projectRoute }} projects={[project, projectBeta]} />);

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toEqual([
        expect.stringContaining('Home'),
        expect.stringContaining('Project Alpha'),
        expect.stringContaining('Project Beta'),
      ]);
    });

    // Dragging a project tab onto Home's left edge must not place anything
    // before Home. Home is the permanent, pinned-leftmost tab; the drop should
    // resolve to "after Home" so Home stays first.
    const [homeTab, , betaTab] = screen.getAllByRole('tab');
    mockTabRect(homeTab! as HTMLElement, 0);
    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(betaTab!, { dataTransfer });
    // clientX 10 lands in the left half of Home's rect (left=0, width=100).
    dispatchDragEvent(homeTab! as HTMLElement, 'dragover', dataTransfer, 10);

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toEqual([
        expect.stringContaining('Home'),
        expect.stringContaining('Project Beta'),
        expect.stringContaining('Project Alpha'),
      ]);
    });

    dispatchDragEvent(homeTab! as HTMLElement, 'drop', dataTransfer, 10);
    fireEvent.dragEnd(betaTab!, { dataTransfer });

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toEqual([
        expect.stringContaining('Home'),
        expect.stringContaining('Project Beta'),
        expect.stringContaining('Project Alpha'),
      ]);
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledWith(8);
    expect(vibrate).toHaveBeenCalledWith(12);
    const stored = JSON.parse(window.localStorage.getItem('open-design:workspace-tabs:v1') ?? '{}') as {
      activeTabId?: string;
      tabs?: Array<{ id?: string }>;
    };
    expect(stored.activeTabId).toBe('project:project-alpha');
    expect(stored.tabs?.map((tab) => tab.id)).toEqual([
      'entry:home:seed',
      'project:project-beta',
      'project:project-alpha',
    ]);
  });

  it('reorders tabs live from right to left while dragging', async () => {
    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        activeTabId: 'project:project-alpha',
        tabs: [
          {
            id: 'entry:home:seed',
            kind: 'entry',
            view: 'home',
            createdAt: 1,
            lastActiveAt: 1,
          },
          {
            id: 'project:project-alpha',
            kind: 'project',
            projectId: 'project-alpha',
            conversationId: null,
            fileName: null,
            createdAt: 2,
            lastActiveAt: 2,
          },
          {
            id: 'project:project-beta',
            kind: 'project',
            projectId: 'project-beta',
            conversationId: null,
            fileName: null,
            createdAt: 3,
            lastActiveAt: 3,
          },
        ],
      }),
    );

    render(<WorkspaceTabsBar route={{ ...projectRoute }} projects={[project, projectBeta]} />);

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toEqual([
        expect.stringContaining('Home'),
        expect.stringContaining('Project Alpha'),
        expect.stringContaining('Project Beta'),
      ]);
    });

    const [, alphaTab, betaTab] = screen.getAllByRole('tab');
    mockTabRect(alphaTab! as HTMLElement, 100);
    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(betaTab!, { dataTransfer });
    dispatchDragEvent(alphaTab! as HTMLElement, 'dragover', dataTransfer, 110);

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toEqual([
        expect.stringContaining('Home'),
        expect.stringContaining('Project Beta'),
        expect.stringContaining('Project Alpha'),
      ]);
    });
  });
});
