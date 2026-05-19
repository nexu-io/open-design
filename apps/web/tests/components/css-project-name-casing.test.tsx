// @vitest-environment jsdom
// Behavioral coverage for text-transform: capitalize on the four project-name
// display sites beyond the design-files page header.
//
// Approach: identical to ProjectView.title-casing.test.tsx — inject only the
// relevant CSS rules extracted from the source files so that getComputedStyle
// resolves the declared rule in jsdom without paying the cost of parsing the
// full ~25 000-line index.css.
//
// NOTE: .workspace-tab__label and .workspace-tabs-list__title also render
// non-project tab labels (Home, Marketplace, etc.). capitalize is safe there
// too — already-uppercase strings are unaffected and sentence-case labels
// (e.g. "common.untitled") benefit. The brand-name trade-off documented in
// index.css on .app-project-title .title applies equally here.
//
// NOTE: .design-card-name renders project names in the projects grid AND
// live-artifact titles in the live-artifact grid. capitalize applies to both
// for the same reason.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesignsTab } from '../../src/components/DesignsTab';
import { RecentProjectsStrip } from '../../src/components/RecentProjectsStrip';
import { WorkspaceTabsBar } from '../../src/components/WorkspaceTabsBar';
import type { Project } from '../../src/types';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => {
    const labels: Record<string, string> = {
      'common.close': 'Close',
      'common.untitled': 'Untitled',
      'common.justNow': 'just now',
      'entry.navDesignSystems': 'Design systems',
      'entry.navHome': 'Home',
      'entry.navIntegrations': 'Integrations',
      'entry.navPlugins': 'Plugins',
      'entry.navProjects': 'Projects',
      'entry.navTasks': 'Tasks',
      'recentProjects.title': 'Recent projects',
      'recentProjects.viewAll': 'View all',
      'settings.welcomeTitle': 'Welcome',
      'workspaceTabs.marketplace': 'Marketplace',
      'workspaceTabs.pluginDetails': 'Plugin details',
      'workspaceTabs.project': 'Project',
    };
    return labels[key] ?? key;
  },
}));

vi.mock('../../src/router', async () => {
  const actual = await vi.importActual<typeof import('../../src/router')>(
    '../../src/router',
  );
  return { ...actual, navigate: vi.fn() };
});

vi.mock('../../src/providers/registry', () => ({
  deleteLiveArtifact: vi.fn(),
  fetchLiveArtifacts: vi.fn(async () => []),
  fetchProjectFiles: vi.fn(async () => []),
  liveArtifactPreviewUrl: (projectId: string, artifactId: string) =>
    `/api/projects/${projectId}/live-artifacts/${artifactId}/preview`,
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/files/${fileName}`,
}));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const project: Project = {
  id: 'project-1',
  name: 'acme studio',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 2,
};

const projectRoute = {
  kind: 'project' as const,
  projectId: 'project-1',
  conversationId: null as string | null,
  fileName: null as string | null,
};

// ---------------------------------------------------------------------------
// CSS extraction helpers
//
// Each helper loads the relevant CSS file once and extracts only the rules
// that match the target selector, keeping injected stylesheets small.
// ---------------------------------------------------------------------------

function extractRulesBySelector(css: string, selectorFragment: string): string {
  const rules: string[] = [];
  // Single-level block extractor; sufficient for flat CSS files (no nested @rules).
  const blockRe = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(css)) !== null) {
    const selector = m[1] ?? '';
    const body = m[2] ?? '';
    if (selector.includes(selectorFragment)) {
      rules.push(`${selector}{${body}}`);
    }
  }
  return rules.join('\n');
}

function loadIndexCss(): string {
  return readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
}

function loadRecentProjectsCss(): string {
  return readFileSync(
    resolve(process.cwd(), 'src/styles/home/recent-projects.css'),
    'utf8',
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('project-name CSS capitalization — additional display sites', () => {
  let styleEl: HTMLStyleElement;

  afterEach(() => {
    styleEl?.remove();
    cleanup();
  });

  function injectRules(css: string): void {
    styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // -------------------------------------------------------------------------
  // Site 2: .workspace-tab__label (WorkspaceTabsBar tab strip)
  // -------------------------------------------------------------------------

  describe('.workspace-tab__label', () => {
    beforeEach(() => {
      const css = loadIndexCss();
      injectRules(extractRulesBySelector(css, 'workspace-tab__label'));
    });

    it('applies text-transform: capitalize to a project tab label', () => {
      const { container } = render(
        <WorkspaceTabsBar route={projectRoute} projects={[project]} />,
      );

      const labels = container.querySelectorAll('.workspace-tab__label');
      // At least one tab should be present (the project tab).
      expect(labels.length).toBeGreaterThan(0);

      // Find the label whose text content matches the project name.
      const projectLabel = Array.from(labels).find(
        (el) => el.textContent === project.name,
      );
      expect(projectLabel).not.toBeNull();

      const style = window.getComputedStyle(projectLabel as Element);
      expect(style.textTransform).toBe('capitalize');
    });
  });

  // -------------------------------------------------------------------------
  // Site 3: .workspace-tabs-list__title (tab overflow popover)
  // -------------------------------------------------------------------------

  describe('.workspace-tabs-list__title', () => {
    beforeEach(() => {
      const css = loadIndexCss();
      injectRules(extractRulesBySelector(css, 'workspace-tabs-list__title'));
    });

    it('applies text-transform: capitalize to the overflow list title', () => {
      // Render a minimal DOM that replicates the production selector path.
      // Mounting the full WorkspaceTabsBar overflow popover requires
      // simulating enough tabs to overflow, which is viewport-width-dependent
      // and flaky in jsdom. A fixture DOM is the correct approach here: it is
      // cheaper, deterministic, and tests the CSS contract (selector → rule)
      // without depending on component render logic.
      //
      // The selector `.workspace-tabs-list__title` is tested against a fixture
      // DOM that exactly matches the production structure; production render
      // correctness (correct class applied to the element) is covered by the
      // WorkspaceTabsBar navigation tests.
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div class="workspace-tabs-list__item">
          <button class="workspace-tabs-list__main">
            <span class="workspace-tabs-list__text">
              <span class="workspace-tabs-list__title">acme studio</span>
              <span class="workspace-tabs-list__meta">Project</span>
            </span>
          </button>
        </div>
      `;
      document.body.appendChild(wrapper);

      const titleEl = wrapper.querySelector('.workspace-tabs-list__title');
      expect(titleEl).not.toBeNull();

      const style = window.getComputedStyle(titleEl as Element);
      expect(style.textTransform).toBe('capitalize');

      wrapper.remove();
    });
  });

  // -------------------------------------------------------------------------
  // Site 4: .design-card-name (DesignsTab grid cards)
  // -------------------------------------------------------------------------

  describe('.design-card-name', () => {
    beforeEach(() => {
      const css = loadIndexCss();
      injectRules(extractRulesBySelector(css, 'design-card-name'));
    });

    it('applies text-transform: capitalize to the design card project name', () => {
      const { container } = render(
        <DesignsTab
          projects={[project]}
          skills={[]}
          designSystems={[]}
          onOpen={vi.fn()}
          onOpenLiveArtifact={vi.fn()}
          onDelete={vi.fn()}
          onRename={vi.fn()}
        />,
      );

      const nameEls = container.querySelectorAll('.design-card-name');
      expect(nameEls.length).toBeGreaterThan(0);

      const projectNameEl = Array.from(nameEls).find(
        (el) => el.textContent === project.name,
      );
      expect(projectNameEl).not.toBeNull();

      const style = window.getComputedStyle(projectNameEl as Element);
      expect(style.textTransform).toBe('capitalize');
    });
  });

  // -------------------------------------------------------------------------
  // Site 5: .recent-projects__card-name (RecentProjectsStrip)
  // -------------------------------------------------------------------------

  describe('.recent-projects__card-name', () => {
    beforeEach(() => {
      const css = loadRecentProjectsCss();
      injectRules(extractRulesBySelector(css, 'recent-projects__card-name'));
    });

    it('applies text-transform: capitalize to the recent-projects card name', () => {
      const { container } = render(
        <RecentProjectsStrip
          projects={[project]}
          onOpen={vi.fn()}
          onViewAll={vi.fn()}
        />,
      );

      const nameEls = container.querySelectorAll('.recent-projects__card-name');
      expect(nameEls.length).toBeGreaterThan(0);

      const nameEl = nameEls[0] as Element;
      expect(nameEl.textContent).toBe(project.name);

      const style = window.getComputedStyle(nameEl);
      expect(style.textTransform).toBe('capitalize');
    });
  });
});
