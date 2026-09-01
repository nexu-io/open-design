
// @vitest-environment jsdom

import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  openWorkspaceTab,
  removeWorkspaceProjectTabs,
  WorkspaceTabsBar,
} from '../../src/components/WorkspaceTabsBar';
import { navigate, type Route } from '../../src/router';
import type { Project } from '../../src/types';
import { setWorkspaceTabsDock } from '../../src/components/workspaceTabsDock';

afterEach(() => {
  setWorkspaceTabsDock(null);
});

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: (key: string) => key,
  }),
  useT: () => (key: string) => {
    const labels: Record<string, string> = {
      'app.brand': 'OpenDesign',
      'common.close': 'Close',
      'common.untitled': 'Untitled',
      'entry.navDesignSystems': 'Design systems',
      'entry.navHome': 'Home',
      'entry.navProjects': 'Projects',
      'entry.navTasks': 'Automations',
      'entry.navPlugins': 'Plugins',
      'entry.navIntegrations': 'Integrations',
      'settings.welcomeTitle': 'Welcome',
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

const projectGamma: Project = {
  id: 'project-gamma',
  name: 'Project Gamma',
  skillId: null,
  designSystemId: null,
  createdAt: 3,
  updatedAt: 3,
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

// The active entry tab renders icon-only (sidebar toggle on the home view,
// Home nav pill on any other section), so its current section is no longer
// observable through textContent. Read it from the persisted tab state.
function storedEntryTabView(): string | null {
  const raw = window.localStorage.getItem('open-design:workspace-tabs:v1');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      tabs?: Array<{ kind?: string; view?: string }>;
    };
    return parsed.tabs?.find((tab) => tab.kind === 'entry')?.view ?? null;
  } catch {
    return null;
  }
}

function mockTabRect(element: HTMLElement, left: number, width = 100) {
  // Drop hit-testing measures tabs in LAYOUT space (offsetLeft/offsetWidth) so
  // the FLIP reorder slide and the drag transform can't shift the rects it
  // reads. jsdom reports 0 for both, so stub them alongside the visual rect —
  // the strip itself sits at x=0 with scrollLeft 0, so the two coincide here.
  Object.defineProperty(element, 'offsetLeft', { configurable: true, value: left });
  Object.defineProperty(element, 'offsetWidth', { configurable: true, value: width });
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

    // Asking for a new tab when a Home tab already exists should activate the
    // existing Home tab. #5517 removed the top-right "+" button, so ⌘/Ctrl+T is
    // now the only entry point — both used to funnel through createNewTab(), so
    // the shortcut exercises the same singleton logic the "+" click did.
    fireEvent.keyDown(document, { key: 't', metaKey: true });
    fireEvent.keyDown(document, { key: 't', metaKey: true });

    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(1);
      // The active Home tab renders as the sidebar toggle (icon-only pill).
      expect(screen.getAllByTestId('workspace-home-rail-toggle')).toHaveLength(1);
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
      // Expect that we still have 2 tabs (Home and Project Alpha). The active
      // Home tab is the icon-only sidebar toggle, so assert its testid rather
      // than a text label.
      expect(tabs).toHaveLength(2);
      expect(screen.getAllByTestId('workspace-home-rail-toggle')).toHaveLength(1);
      expect(labels.filter((label) => label.includes('Project Alpha'))).toHaveLength(1);
    });
  });

  it('closes the dock dropdown when its route-owned dock is removed', async () => {
    const firstDock = document.createElement('div');
    const secondDock = document.createElement('div');
    document.body.append(firstDock, secondDock);
    setWorkspaceTabsDock(firstDock);

    const { rerender } = render(
      <WorkspaceTabsBar route={{ ...projectRoute }} projects={[project]} />,
    );

    const trigger = await screen.findByTestId('workspace-tabs-dropdown-trigger');
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeTruthy();

    act(() => setWorkspaceTabsDock(null));
    rerender(
      <WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />,
    );
    expect(screen.queryByRole('listbox')).toBeNull();

    act(() => setWorkspaceTabsDock(secondDock));
    rerender(
      <WorkspaceTabsBar route={{ ...projectRoute }} projects={[project]} />,
    );
    const restoredTrigger = await screen.findByTestId('workspace-tabs-dropdown-trigger');
    expect(restoredTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();

    firstDock.remove();
    secondDock.remove();
  });

  // recvq5eKj2kdF0: Home's own project fetch (recent/drafts, capped) replaces
  // the `projects` prop wholesale on every reload — App.tsx's
  // reconcileFetchedProjects does not preserve entries for projects that are
  // only open in a background tab. `displayTabFor` looked the tab's project up
  // in that same list and fell back to the untitled label the instant the
  // project dropped out, even though it plainly has a real name — switching to
  // Home and back made an already-named tab regress to "Untitled".
  it('keeps a project tab\'s real name after Home reloads a projects list that no longer includes it', async () => {
    const { rerender } = render(
      <WorkspaceTabsBar route={{ ...projectRoute }} projects={[project]} />,
    );

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(true);
    });

    // Switch to Home; Home's own fetch (simulated here by an empty list) does
    // not include project-alpha at all.
    rerender(<WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[]} />);

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(true);
      expect(labels.some((label) => label.includes('Untitled'))).toBe(false);
    });
  });

  it('auto-closes the Welcome tab once onboarding completes, even when a project opens', async () => {
    const { rerender } = render(
      <WorkspaceTabsBar
        route={{ kind: 'home', view: 'onboarding' }}
        projects={[project]}
        onboardingCompleted={false}
      />,
    );

    await waitFor(() => {
      // The active entry tab is icon-only (Home nav pill) on non-home views,
      // so assert the parked Welcome view through the persisted tab state.
      expect(screen.getAllByRole('tab')).toHaveLength(1);
      expect(screen.getByTestId('workspace-home-nav')).toBeTruthy();
      expect(storedEntryTabView()).toBe('onboarding');
    });

    // Completing onboarding via the design-system path navigates to a fresh
    // project while the entry tab is still parked on the Welcome view.
    rerender(
      <WorkspaceTabsBar
        route={{ ...projectRoute }}
        projects={[project]}
        onboardingCompleted={true}
      />,
    );

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels.some((label) => label.includes('Welcome'))).toBe(false);
      expect(labels.some((label) => label.includes('Home'))).toBe(true);
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(true);
    });
  });

  it('resets the entry tab to Home after onboarding opens a design-system extraction project', async () => {
    const { rerender } = render(
      <WorkspaceTabsBar
        route={{ kind: 'home', view: 'onboarding' }}
        projects={[project]}
        onboardingCompleted={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(1);
      expect(screen.getByTestId('workspace-home-nav')).toBeTruthy();
      expect(storedEntryTabView()).toBe('onboarding');
    });

    rerender(
      <WorkspaceTabsBar
        route={{ kind: 'design-system-create' }}
        projects={[project]}
        onboardingCompleted={true}
      />,
    );

    await waitFor(() => {
      expect(storedEntryTabView()).toBe('design-systems');
    });

    rerender(
      <WorkspaceTabsBar
        route={{ ...projectRoute }}
        projects={[project]}
        onboardingCompleted={true}
      />,
    );

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels.some((label) => label.includes('Design systems'))).toBe(false);
      expect(labels.some((label) => label.includes('Home'))).toBe(true);
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(true);
    });
  });

  it('ships no tab-bar chrome buttons and no reachable Search tabs popover', async () => {
    const { rerender } = render(
      <WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />,
    );

    // #5517 removed both top-right chrome buttons. The "+" was the radial
    // template menu's only entry point and the magnifier was the Search-tabs
    // popover's only entry point, so neither overlay can be opened any more.
    // This is the regression guard for that removal: if a future change
    // re-introduces either control it must be a deliberate decision that
    // updates this test (and re-enables the popover-dismissal spec below).
    expect(screen.queryByRole('button', { name: 'New tab' })).toBeNull();
    expect(screen.queryByTestId('workspace-tabs-new-tab')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Search tabs' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Search tabs' })).toBeNull();

    // The popover must also stay absent across a route flip into /onboarding
    // (e.g. browser back/forward, which bypasses activateTab/createNewTab).
    // Nothing may float over the first-run flow with no control to dismiss it.
    rerender(
      <WorkspaceTabsBar route={{ kind: 'home', view: 'onboarding' }} projects={[project]} />,
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Search tabs' })).toBeNull();
    });
    expect(screen.queryByRole('button', { name: 'Search tabs' })).toBeNull();
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
        // The active entry tab is the icon-only Home nav pill on non-home
        // sections, so read the section from the persisted tab state.
        expect(tabs).toHaveLength(1);
        expect(screen.getByTestId('workspace-home-nav')).toBeTruthy();
        expect(storedEntryTabView()).toBe(section.view);
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
      expect(screen.getAllByRole('tab')).toHaveLength(1);
      expect(screen.getByTestId('workspace-home-nav')).toBeTruthy();
      expect(storedEntryTabView()).toBe('design-systems');
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
      expect(storedEntryTabView()).toBe('tasks');
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
      expect(screen.getAllByRole('tab')).toHaveLength(1);
      expect(screen.getByTestId('workspace-home-nav')).toBeTruthy();
      expect(storedEntryTabView()).toBe('projects');
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

  it('removes a failed provisional project from live and persisted tab state', async () => {
    render(<WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />);

    openWorkspaceTab({ ...projectRoute });
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2);
    });

    removeWorkspaceProjectTabs(project.id);

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toHaveLength(1);
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(false);
      const stored = JSON.parse(
        window.localStorage.getItem('open-design:workspace-tabs:v1') ?? '{}',
      ) as { tabs?: Array<{ projectId?: string }> };
      expect(stored.tabs?.some((tab) => tab.projectId === project.id)).toBe(false);
    });
  });

  it('reuses the existing project tab instead of duplicating on repeated open', async () => {
    render(<WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />);

    openWorkspaceTab({ ...projectRoute });
    openWorkspaceTab({ ...projectRoute });
    openWorkspaceTab({ ...projectRoute });

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toHaveLength(2);
      expect(labels.filter((label) => label.includes('Project Alpha'))).toHaveLength(1);
    });
  });

  it('updates the existing project tab fields instead of appending when reopened with new context', async () => {
    render(<WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />);

    openWorkspaceTab({ ...projectRoute });
    openWorkspaceTab({
      kind: 'project',
      projectId: 'project-alpha',
      conversationId: 'conv-1',
      fileName: 'deck.html',
    });

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toHaveLength(2);
      expect(labels.filter((label) => label.includes('Project Alpha'))).toHaveLength(1);
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
      // The active Home tab renders as the icon-only sidebar toggle.
      expect(screen.getAllByTestId('workspace-home-rail-toggle')).toHaveLength(1);
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

  it('coalesces duplicate project tabs restored from saved workspace state', async () => {
    // Regression for #2641: a workspace persisted before the dedupe fix can
    // hold several tabs for the same projectId (distinct tab ids). On restore,
    // normalization must collapse them to one and keep the canonical (newest
    // here) tab, preserving the project's conversation/file context.
    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        activeTabId: 'project:project-alpha-dup',
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
            id: 'project:project-alpha-dup',
            kind: 'project',
            projectId: 'project-alpha',
            conversationId: 'conv-1',
            fileName: 'deck.html',
            createdAt: 2,
            lastActiveAt: 5,
          },
        ],
      }),
    );

    render(<WorkspaceTabsBar route={{ ...projectRoute }} projects={[project]} />);

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      // Home + exactly one Project Alpha tab.
      expect(labels).toHaveLength(2);
      expect(labels.filter((label) => label.includes('Project Alpha'))).toHaveLength(1);
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
      // Expect that the duplicate Home tabs are deduplicated to exactly one
      // Home tab — rendered as the sidebar toggle since it is active on home.
      expect(screen.getAllByRole('tab')).toHaveLength(1);
      expect(screen.getAllByTestId('workspace-home-rail-toggle')).toHaveLength(1);
    });
  });

  it('keeps the pinned Home tab permanent and non-closable', async () => {
    render(<WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />);

    // The Home tab is pinned leftmost and has no close affordance, so there is
    // no way to remove the last remaining tab.
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();

    expect(screen.getAllByRole('tab')).toHaveLength(1);
    // Active on the home view, the pinned tab renders as the sidebar toggle.
    expect(screen.getByTestId('workspace-home-rail-toggle')).toBeTruthy();
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
      // The shortcut activates the Home tab, which then renders as the
      // icon-only sidebar toggle.
      expect(screen.getAllByTestId('workspace-home-rail-toggle')).toHaveLength(1);
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
      // Closing the project tab falls back to the Home tab, which is active on
      // the home view and therefore renders as the icon-only sidebar toggle.
      expect(screen.getAllByRole('tab')).toHaveLength(1);
      expect(screen.getByTestId('workspace-home-rail-toggle')).toBeTruthy();
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

  // Blocked on a missing entry point, not obsolete. The Search-tabs popover,
  // its capture-phase outside-click dismissal, and the Escape handler are all
  // still implemented in WorkspaceTabsBar, but #5517 removed the magnifier
  // button that was their only trigger — `setTabsMenuOpen` is now only ever
  // called with `false`, so no user gesture can open the popover and this spec
  // has no honest way to reach the state it asserts on. The body is kept intact
  // (rather than deleted) so the invariant it guards — a blank area that calls
  // stopPropagation() on mousedown must still dismiss the popover, which is why
  // the listener is registered in the capture phase — comes back for free if an
  // entry point is ever restored. Re-enable it together with that entry point.
  it.skip('dismisses tab search when a blank page area handles the mouse down', async () => {
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

describe('WorkspaceTabsBar identity-scope tab reset', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps the current route tab when the first identityScopeKey resolves over an unowned legacy snapshot', async () => {
    // A session persisted by a build that predates this feature: tabs with no
    // `scopeKey` field at all. Such a snapshot has no owner stamp and is never
    // adopted wholesale (see the discard tests below) — but the current URL
    // stays route truth, so the deep-linked project keeps its tab and the
    // first resolution must not navigate the user away.
    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        tabs: [
          { id: 'entry:home:a', kind: 'entry', view: 'home', createdAt: 1, lastActiveAt: 1 },
          {
            id: 'project:project-alpha:b',
            kind: 'project',
            projectId: 'project-alpha',
            conversationId: null,
            fileName: null,
            createdAt: 2,
            lastActiveAt: 2,
          },
        ],
        activeTabId: 'project:project-alpha:b',
      }),
    );

    render(
      <WorkspaceTabsBar
        route={{ ...projectRoute }}
        projects={[project]}
        identityScopeKey="user-1::ws-personal-1"
      />,
    );

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toHaveLength(2);
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(true);
    });

    // The now-known scope key is backfilled into storage so a later, REAL
    // change has something to compare against.
    await waitFor(() => {
      const raw = window.localStorage.getItem('open-design:workspace-tabs:v1');
      const parsed = JSON.parse(raw ?? '{}') as { scopeKey?: string };
      expect(parsed.scopeKey).toBe('user-1::ws-personal-1');
    });
  });

  it('closes every open tab down to a single fresh Home tab on sign-out', async () => {
    const { rerender } = render(
      <WorkspaceTabsBar
        route={{ kind: 'home', view: 'home' }}
        projects={[project]}
        identityScopeKey="user-1::ws-personal-1"
      />,
    );
    // Open a project tab under this (already-adopted) scope.
    rerender(
      <WorkspaceTabsBar
        route={{ ...projectRoute }}
        projects={[project]}
        identityScopeKey="user-1::ws-personal-1"
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2);
    });

    // Sign out: the account bucket flips to the fixed anon::none scope.
    rerender(
      <WorkspaceTabsBar
        route={{ ...projectRoute }}
        projects={[project]}
        identityScopeKey="anon::none"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(1);
      expect(screen.getByTestId('workspace-home-rail-toggle')).toBeTruthy();
    });
    // Route/tab-strip consistency: closing every tab down to Home also lands
    // the app ON Home, matching what closing the last remaining tab already
    // does elsewhere in this file — a stale route pointing at the project the
    // user just signed out of would otherwise keep rendering underneath.
    expect(navigate).toHaveBeenLastCalledWith(homeRoute);
  });

  it('keeps the active unbound local project open when anonymous auth resolves to a signed-in account', async () => {
    const { rerender } = render(
      <WorkspaceTabsBar
        route={{ ...projectRoute }}
        projects={[project]}
        activeProjectWorkspaceId={null}
        identityScopeKey="anon::ws-personal-1"
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2);
      expect(screen.getByRole('tab', { name: /Project Alpha/ })).toBeTruthy();
    });
    vi.mocked(navigate).mockClear();

    rerender(
      <WorkspaceTabsBar
        route={{ ...projectRoute }}
        projects={[project]}
        activeProjectWorkspaceId={null}
        identityScopeKey="user-1::ws-personal-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2);
      expect(screen.getByRole('tab', { name: /Project Alpha/ }).getAttribute('aria-selected')).toBe('true');
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps a Workspace-bound project when anonymous auth resolves with the same Workspace', async () => {
    const { rerender } = render(
      <WorkspaceTabsBar
        route={{ ...projectRoute }}
        projects={[{ ...project, workspaceId: 'ws-team-a' }]}
        activeProjectWorkspaceId="ws-team-a"
        identityScopeKey="anon::none"
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2);
    });
    vi.mocked(navigate).mockClear();

    rerender(
      <WorkspaceTabsBar
        route={{ ...projectRoute }}
        projects={[{ ...project, workspaceId: 'ws-team-a' }]}
        activeProjectWorkspaceId="ws-team-a"
        identityScopeKey="user-1::ws-team-a"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2);
      expect(screen.getByRole('tab', { name: /Project Alpha/ }).getAttribute('aria-selected')).toBe('true');
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps an explicit AMR settings navigation when auth resolves as the project exits', async () => {
    const { rerender } = render(
      <WorkspaceTabsBar
        route={{ ...projectRoute }}
        projects={[project]}
        activeProjectWorkspaceId={null}
        identityScopeKey="anon::none"
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2);
      expect(screen.getByRole('tab', { name: /Project Alpha/ })).toBeTruthy();
    });
    vi.mocked(navigate).mockClear();

    // Leaving the project drops its exact Workspace scope before the AMR login
    // resolves. Exercise both real transitions rather than collapsing them.
    rerender(
      <WorkspaceTabsBar
        route={{ kind: 'home', view: 'settings' }}
        projects={[project]}
        activeProjectWorkspaceId={undefined}
        identityScopeKey="anon::none"
      />,
    );
    await waitFor(() => {
      expect(storedEntryTabView()).toBe('settings');
    });

    rerender(
      <WorkspaceTabsBar
        route={{ kind: 'home', view: 'settings' }}
        projects={[project]}
        activeProjectWorkspaceId={undefined}
        identityScopeKey="user-1::ws-personal-1"
      />,
    );

    await waitFor(() => {
      expect(storedEntryTabView()).toBe('settings');
    });
    expect(navigate).not.toHaveBeenCalledWith(homeRoute);
  });

  it('still closes a Workspace-bound project when the signed-in witness names another Workspace', async () => {
    const { rerender } = render(
      <WorkspaceTabsBar
        route={{ ...projectRoute }}
        projects={[{ ...project, workspaceId: 'ws-team-a' }]}
        activeProjectWorkspaceId="ws-team-a"
        identityScopeKey="anon::none"
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2);
    });
    vi.mocked(navigate).mockClear();

    rerender(
      <WorkspaceTabsBar
        route={{ ...projectRoute }}
        projects={[{ ...project, workspaceId: 'ws-team-a' }]}
        activeProjectWorkspaceId="ws-team-a"
        identityScopeKey="user-1::ws-team-b"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(1);
      expect(screen.getByTestId('workspace-home-rail-toggle')).toBeTruthy();
    });
    expect(navigate).toHaveBeenLastCalledWith(homeRoute);
  });

  it('closes every open tab on a workspace switch, even for the same account', async () => {
    const { rerender } = render(
      <WorkspaceTabsBar
        route={{ kind: 'home', view: 'home' }}
        projects={[project]}
        identityScopeKey="user-1::ws-team-a"
      />,
    );
    rerender(
      <WorkspaceTabsBar
        route={{ ...projectRoute }}
        projects={[project]}
        identityScopeKey="user-1::ws-team-a"
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2);
    });

    rerender(
      <WorkspaceTabsBar
        route={{ ...projectRoute }}
        projects={[project]}
        identityScopeKey="user-1::ws-team-b"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(1);
      expect(screen.getByTestId('workspace-home-rail-toggle')).toBeTruthy();
    });
    expect(navigate).toHaveBeenLastCalledWith(homeRoute);
  });

  it('restores each workspace tab snapshot without leaking tabs across workspaces', async () => {
    const projectBetaRoute: Route = {
      kind: 'project',
      projectId: 'project-beta',
      conversationId: 'conversation-beta',
      fileName: 'beta.html',
    };
    const projectGammaRoute: Route = {
      kind: 'project',
      projectId: 'project-gamma',
      conversationId: 'conversation-gamma',
      fileName: 'gamma.html',
    };
    const { rerender, unmount } = render(
      <WorkspaceTabsBar
        route={homeRoute}
        projects={[project, projectBeta]}
        identityScopeKey="user-1::ws-team-a"
      />,
    );

    rerender(
      <WorkspaceTabsBar
        route={{ ...projectRoute, fileName: 'alpha.html' }}
        projects={[project, projectBeta]}
        identityScopeKey="user-1::ws-team-a"
      />,
    );
    openWorkspaceTab(projectBetaRoute);
    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toEqual([
        expect.stringContaining('Home'),
        expect.stringContaining('Project Alpha'),
        expect.stringContaining('Project Beta'),
      ]);
      expect(screen.getByRole('tab', { name: /Project Beta/ }).getAttribute('aria-selected')).toBe('true');
    });

    rerender(
      <WorkspaceTabsBar
        route={homeRoute}
        projects={[projectGamma]}
        identityScopeKey="user-1::ws-team-b"
      />,
    );
    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toHaveLength(1);
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(false);
      expect(labels.some((label) => label.includes('Project Beta'))).toBe(false);
    });

    openWorkspaceTab(projectGammaRoute);
    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toEqual([
        expect.stringContaining('Home'),
        expect.stringContaining('Project Gamma'),
      ]);
    });

    rerender(
      <WorkspaceTabsBar
        route={homeRoute}
        projects={[project, projectBeta]}
        identityScopeKey="user-1::ws-team-a"
      />,
    );
    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toEqual([
        expect.stringContaining('Home'),
        expect.stringContaining('Project Alpha'),
        expect.stringContaining('Project Beta'),
      ]);
      expect(screen.getByRole('tab', { name: /Project Beta/ }).getAttribute('aria-selected')).toBe('true');
    });
    expect(navigate).toHaveBeenLastCalledWith(projectBetaRoute);

    // The multi-scope registry is persistent, not just an in-memory switch
    // cache. Remounting directly in B restores only B's own active tab.
    unmount();
    render(
      <WorkspaceTabsBar
        route={projectGammaRoute}
        projects={[projectGamma]}
        identityScopeKey="user-1::ws-team-b"
      />,
    );
    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toEqual([
        expect.stringContaining('Home'),
        expect.stringContaining('Project Gamma'),
      ]);
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(false);
      expect(labels.some((label) => label.includes('Project Beta'))).toBe(false);
      expect(screen.getByRole('tab', { name: /Project Gamma/ }).getAttribute('aria-selected')).toBe('true');
    });
  });

  it('migrates a v1 single-scope snapshot before switching away and back', async () => {
    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        scopeKey: 'user-1::ws-team-a',
        tabs: [
          { id: 'entry:home:a', kind: 'entry', view: 'home', createdAt: 1, lastActiveAt: 1 },
          {
            id: 'project:project-alpha:a',
            kind: 'project',
            projectId: 'project-alpha',
            conversationId: 'conversation-alpha',
            fileName: 'alpha.html',
            createdAt: 2,
            lastActiveAt: 2,
          },
        ],
        activeTabId: 'project:project-alpha:a',
      }),
    );
    const { rerender } = render(
      <WorkspaceTabsBar
        route={{ ...projectRoute, fileName: 'alpha.html' }}
        projects={[project]}
        identityScopeKey="user-1::ws-team-a"
      />,
    );

    rerender(
      <WorkspaceTabsBar
        route={homeRoute}
        projects={[]}
        identityScopeKey="user-1::ws-team-b"
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(1);
    });

    rerender(
      <WorkspaceTabsBar
        route={homeRoute}
        projects={[project]}
        identityScopeKey="user-1::ws-team-a"
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent ?? '')).toEqual([
        expect.stringContaining('Home'),
        expect.stringContaining('Project Alpha'),
      ]);
      expect(screen.getByRole('tab', { name: /Project Alpha/ }).getAttribute('aria-selected')).toBe('true');
    });
  });

  it('retains only the twelve most recently visited workspace snapshots', async () => {
    let now = 100;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now++);
    const { rerender } = render(
      <WorkspaceTabsBar
        route={homeRoute}
        projects={[]}
        identityScopeKey="user-1::ws-team-0"
      />,
    );

    for (let index = 1; index <= 12; index += 1) {
      const scopeKey = `user-1::ws-team-${index}`;
      rerender(
        <WorkspaceTabsBar
          route={homeRoute}
          projects={[]}
          identityScopeKey={scopeKey}
        />,
      );
      await waitFor(() => {
        const parsed = JSON.parse(
          window.localStorage.getItem('open-design:workspace-tabs:v1') ?? '{}',
        ) as { scopeKey?: string };
        expect(parsed.scopeKey).toBe(scopeKey);
      });
    }

    const persisted = JSON.parse(
      window.localStorage.getItem('open-design:workspace-tabs:v1') ?? '{}',
    ) as { scopes?: Record<string, unknown> };
    expect(Object.keys(persisted.scopes ?? {})).toHaveLength(12);
    expect(persisted.scopes).not.toHaveProperty('user-1::ws-team-0');
    expect(persisted.scopes).toHaveProperty('user-1::ws-team-12');
    nowSpy.mockRestore();
  });

  it('keeps an outgoing route out of a different initial scope under StrictMode', async () => {
    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        scopeKey: 'user-1::ws-team-a',
        tabs: [
          { id: 'entry:home:a', kind: 'entry', view: 'home', createdAt: 1, lastActiveAt: 1 },
          {
            id: 'project:project-alpha:a',
            kind: 'project',
            projectId: 'project-alpha',
            conversationId: null,
            fileName: 'alpha.html',
            createdAt: 2,
            lastActiveAt: 2,
          },
        ],
        activeTabId: 'project:project-alpha:a',
      }),
    );

    render(
      <StrictMode>
        <WorkspaceTabsBar
          route={{ ...projectRoute, fileName: 'alpha.html' }}
          projects={[project]}
          identityScopeKey="user-1::ws-team-b"
        />
      </StrictMode>,
    );

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toHaveLength(1);
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(false);
      expect(screen.getByTestId('workspace-home-rail-toggle')).toBeTruthy();
    });
    expect(navigate).toHaveBeenLastCalledWith(homeRoute);
  });

  it('does not reset while onboarding is active, even if the scope changes underneath it', async () => {
    const onboardingRoute: Route = { kind: 'home', view: 'onboarding' };
    const { rerender } = render(
      <WorkspaceTabsBar
        route={onboardingRoute}
        projects={[project]}
        onboardingCompleted={false}
        identityScopeKey="anon::none"
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(1);
      expect(storedEntryTabView()).toBe('onboarding');
    });

    // Signing in mid-onboarding flips the scope key — this must NOT eject the
    // user from the Connect step before they finish it.
    rerender(
      <WorkspaceTabsBar
        route={onboardingRoute}
        projects={[project]}
        onboardingCompleted={false}
        identityScopeKey="user-1::ws-personal-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(1);
      expect(storedEntryTabView()).toBe('onboarding');
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('never resets while identityScopeKey stays unresolved (default prop, back-compat)', async () => {
    const { rerender } = render(
      <WorkspaceTabsBar route={{ kind: 'home', view: 'home' }} projects={[project]} />,
    );
    rerender(<WorkspaceTabsBar route={{ ...projectRoute }} projects={[project]} />);
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2);
    });
    // No identityScopeKey passed at all across any render — tabs must behave
    // exactly as they did before this feature existed.
    rerender(<WorkspaceTabsBar route={{ ...projectRoute }} projects={[projectBeta]} />);
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2);
    });
  });

  // Regression for the "team member's deep-linked/refreshed project bounces
  // to Home" bug: amrLoginStatus and workspaceContext resolve on independent
  // timers on every fresh boot, and a logged-in account's workspaceContext
  // routinely lands after amrLoginStatus does. `deriveTabIdentityScope`'s
  // `workspaceContextLoading` gate (see tab-scope.test.ts) keeps App.tsx from
  // ever handing this component an intermediate "workspace: none" scopeKey
  // while workspaceContext is still loading — so from THIS component's point
  // of view, a fresh boot for an already-team-scoped member must go straight
  // from unresolved (no identityScopeKey prop) to the real team scope key in
  // one hop, never passing through a fabricated no-workspace key in between.
  // This test locks in that the component does not treat that direct hop as
  // a reset, closing the loop on the upstream fix.
  it('adopts a team scope key silently when it resolves directly, with no intermediate no-workspace tick', async () => {
    const { rerender } = render(
      <WorkspaceTabsBar route={{ ...projectRoute }} projects={[project]} />,
    );
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2);
    });

    // workspaceContextLoading having gated the derivation, App.tsx never
    // produces an intermediate "user-1::none" tick — the very first resolved
    // key IS the real team workspace.
    rerender(
      <WorkspaceTabsBar
        route={{ ...projectRoute }}
        projects={[project]}
        identityScopeKey="user-1::ws-team-a"
      />,
    );

    // Silently adopted as the baseline: the project tab survives, nothing
    // resets, and no navigation away from the deep-linked/refreshed project
    // fires.
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2);
      expect(
        screen.getAllByRole('tab').some((tab) => (tab.textContent ?? '').includes('Project Alpha')),
      ).toBe(true);
    });
    expect(navigate).not.toHaveBeenCalledWith(homeRoute);
  });

  // recvqziATl6LlJ / recvqxKdOz0S6g: a legacy snapshot written by a build
  // that predates tab scoping carries NO owner stamp. The account that owned
  // those tabs may have switched since (the old build never closed tabs on an
  // account swap), so adopting the whole snapshot into whichever scope
  // happens to resolve first attributes another account's project tabs to
  // the current account's workspace — QA reproduced exactly this as "the new
  // workspace's tab strip shows a project that does not exist in it". Tabs
  // are bookmarks: when attribution is unknowable the snapshot is dropped
  // and the scope starts from route truth instead.
  it('discards an unowned legacy snapshot instead of adopting it into the first resolved scope', async () => {
    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        tabs: [
          { id: 'entry:home:a', kind: 'entry', view: 'home', createdAt: 1, lastActiveAt: 1 },
          {
            id: 'project:project-alpha:b',
            kind: 'project',
            projectId: 'project-alpha',
            conversationId: null,
            fileName: null,
            createdAt: 2,
            lastActiveAt: 2,
          },
        ],
        activeTabId: 'project:project-alpha:b',
      }),
    );

    // App boots on Home with the identity still unresolved, then the first
    // resolved scope belongs to a DIFFERENT account's brand-new workspace
    // (the account swap happened before this session, on a build that never
    // stamped an owner into the snapshot).
    const { rerender } = render(
      <WorkspaceTabsBar
        route={homeRoute}
        projects={[project]}
        identityScopeKey={null}
      />,
    );
    rerender(
      <WorkspaceTabsBar
        route={homeRoute}
        projects={[project]}
        identityScopeKey="user-2::ws-new-team"
      />,
    );

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toHaveLength(1);
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(false);
    });
    // The mis-attribution must not be persisted either: the new scope's
    // registry entry must not contain the unowned project tab.
    await waitFor(() => {
      const parsed = JSON.parse(
        window.localStorage.getItem('open-design:workspace-tabs:v1') ?? '{}',
      ) as { scopeKey?: string; scopes?: Record<string, unknown> };
      expect(parsed.scopeKey).toBe('user-2::ws-new-team');
      expect(JSON.stringify(parsed.scopes?.['user-2::ws-new-team'] ?? {})).not.toContain(
        'project-alpha',
      );
    });
  });

  it('rebuilds the first resolved scope from route truth alone when upgrading an unowned legacy snapshot', async () => {
    // Same-account upgrade path: the legacy snapshot holds MORE tabs than the
    // current URL. Even for the snapshot's rightful owner the per-tab
    // workspace cannot be inferred (legacy tabs predate workspaces), so only
    // the route-derived tab survives; background legacy tabs are dropped
    // rather than guessed into the active workspace.
    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        tabs: [
          { id: 'entry:home:a', kind: 'entry', view: 'home', createdAt: 1, lastActiveAt: 1 },
          {
            id: 'project:project-alpha:b',
            kind: 'project',
            projectId: 'project-alpha',
            conversationId: null,
            fileName: 'alpha.html',
            createdAt: 2,
            lastActiveAt: 2,
          },
          {
            id: 'project:project-beta:c',
            kind: 'project',
            projectId: 'project-beta',
            conversationId: null,
            fileName: 'beta.html',
            createdAt: 3,
            lastActiveAt: 3,
          },
        ],
        activeTabId: 'project:project-beta:c',
      }),
    );

    const { rerender } = render(
      <WorkspaceTabsBar
        route={{ ...projectRoute, fileName: 'alpha.html' }}
        projects={[project, projectBeta]}
        identityScopeKey={null}
      />,
    );
    rerender(
      <WorkspaceTabsBar
        route={{ ...projectRoute, fileName: 'alpha.html' }}
        projects={[project, projectBeta]}
        identityScopeKey="user-1::ws-personal-1"
      />,
    );

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels).toEqual([
        expect.stringContaining('Home'),
        expect.stringContaining('Project Alpha'),
      ]);
    });
    await waitFor(() => {
      const parsed = JSON.parse(
        window.localStorage.getItem('open-design:workspace-tabs:v1') ?? '{}',
      ) as { scopeKey?: string };
      expect(parsed.scopeKey).toBe('user-1::ws-personal-1');
    });
  });

  it("never re-homes another account's tabs into the incoming scope while onboarding is active", async () => {
    // recvqziATl6LlJ leak family, second face: the onboarding branch of the
    // scope effect re-homes the LIVE state into the incoming scope without
    // resetting it, assuming only the pinned entry tab can exist mid-flow.
    // But the live state can hold a snapshot restored at mount (localStorage
    // outlives a daemon data-dir reset that replays onboarding), and the
    // incoming scope can belong to a DIFFERENT account (direct account swap
    // mid-onboarding, no sign-out hop). Re-homing is attribution: across
    // accounts it must fail closed to a fresh Home state — while still never
    // navigating away from the flow.
    const onboardingRoute: Route = { kind: 'home', view: 'onboarding' };
    const ownedSnapshot = {
      tabs: [
        { id: 'entry:home:a', kind: 'entry', view: 'home', createdAt: 1, lastActiveAt: 1 },
        {
          id: 'project:project-alpha:b',
          kind: 'project',
          projectId: 'project-alpha',
          conversationId: null,
          fileName: null,
          createdAt: 2,
          lastActiveAt: 2,
        },
      ],
      activeTabId: 'project:project-alpha:b',
    };
    window.localStorage.setItem(
      'open-design:workspace-tabs:v1',
      JSON.stringify({
        ...ownedSnapshot,
        scopeKey: 'user-1::ws-a',
        scopes: { 'user-1::ws-a': { state: ownedSnapshot, updatedAt: 1 } },
      }),
    );

    const { rerender } = render(
      <WorkspaceTabsBar
        route={onboardingRoute}
        projects={[project]}
        onboardingCompleted={false}
        identityScopeKey="user-1::ws-a"
      />,
    );
    // Precondition: the owner's own scope restores its own tabs — allowed.
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(2);
    });

    // Direct account swap mid-onboarding.
    rerender(
      <WorkspaceTabsBar
        route={onboardingRoute}
        projects={[project]}
        onboardingCompleted={false}
        identityScopeKey="user-2::ws-b"
      />,
    );

    await waitFor(() => {
      const labels = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
      expect(labels.some((label) => label.includes('Project Alpha'))).toBe(false);
    });
    // Stays in the onboarding flow: no navigation fired, entry tab still on
    // the onboarding view.
    expect(navigate).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(storedEntryTabView()).toBe('onboarding');
    });
    // Persisted registry: the incoming account's bucket must not have
    // adopted the outgoing account's project tab, while the outgoing
    // account's own bucket keeps it.
    await waitFor(() => {
      const parsed = JSON.parse(
        window.localStorage.getItem('open-design:workspace-tabs:v1') ?? '{}',
      ) as { scopes?: Record<string, unknown> };
      expect(JSON.stringify(parsed.scopes?.['user-2::ws-b'] ?? {})).not.toContain(
        'project-alpha',
      );
      expect(JSON.stringify(parsed.scopes?.['user-1::ws-a'] ?? {})).toContain(
        'project-alpha',
      );
    });
  });
});
