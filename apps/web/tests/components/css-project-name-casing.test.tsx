// @vitest-environment jsdom
// Behavioral coverage for text-transform: capitalize on the four project-name
// display sites beyond the design-files page header.
//
// Approach: identical to ProjectView.title-casing.test.tsx — inject only the
// relevant CSS rules extracted from the source files so that getComputedStyle
// resolves the declared rule in jsdom without paying the cost of parsing the
// full ~25 000-line index.css.
//
// NOTE: .workspace-tab__label--project and .workspace-tabs-list__title--project
// scope text-transform: capitalize to project tabs only. Non-project tab labels
// (Home, Marketplace, etc.) use localized strings that must not be auto-capitalized.
//
// NOTE: .design-card-name--project scopes text-transform: capitalize to project
// cards only. Live-artifact titles may have intentional casing (brand names,
// version strings) and must not be auto-capitalized.

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

  describe('.workspace-tab__label--project', () => {
    beforeEach(() => {
      const css = loadIndexCss();
      injectRules(extractRulesBySelector(css, 'workspace-tab__label'));
    });

    it('applies text-transform: capitalize to a project tab label', () => {
      const { container } = render(
        <WorkspaceTabsBar route={projectRoute} projects={[project]} />,
      );

      // Project tab labels carry the --project modifier class.
      const projectLabels = container.querySelectorAll('.workspace-tab__label--project');
      expect(projectLabels.length).toBeGreaterThan(0);

      const projectLabel = Array.from(projectLabels).find(
        (el) => el.textContent === project.name,
      );
      expect(projectLabel).not.toBeNull();

      const style = window.getComputedStyle(projectLabel as Element);
      expect(style.textTransform).toBe('capitalize');
    });

    it('does not apply text-transform: capitalize to non-project tab labels', () => {
      const { container } = render(
        <WorkspaceTabsBar route={projectRoute} projects={[project]} />,
      );

      // Non-project labels must NOT carry the --project modifier.
      const allLabels = container.querySelectorAll('.workspace-tab__label');
      const nonProjectLabels = Array.from(allLabels).filter(
        (el) => !el.classList.contains('workspace-tab__label--project'),
      );

      for (const el of nonProjectLabels) {
        const style = window.getComputedStyle(el);
        expect(style.textTransform).not.toBe('capitalize');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Site 3: .workspace-tabs-list__title (tab overflow popover)
  // -------------------------------------------------------------------------

  describe('.workspace-tabs-list__title--project', () => {
    beforeEach(() => {
      const css = loadIndexCss();
      injectRules(extractRulesBySelector(css, 'workspace-tabs-list__title'));
    });

    it('applies text-transform: capitalize to a project overflow list title', () => {
      // Fixture DOM matching production structure. The --project modifier class
      // is what carries the text-transform rule; the base class does not.
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div class="workspace-tabs-list__item">
          <button class="workspace-tabs-list__main">
            <span class="workspace-tabs-list__text">
              <span class="workspace-tabs-list__title workspace-tabs-list__title--project">acme studio</span>
              <span class="workspace-tabs-list__meta">Project</span>
            </span>
          </button>
        </div>
      `;
      document.body.appendChild(wrapper);

      const titleEl = wrapper.querySelector('.workspace-tabs-list__title--project');
      expect(titleEl).not.toBeNull();

      const style = window.getComputedStyle(titleEl as Element);
      expect(style.textTransform).toBe('capitalize');

      wrapper.remove();
    });

    it('does not apply text-transform: capitalize to non-project overflow titles', () => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div class="workspace-tabs-list__item">
          <button class="workspace-tabs-list__main">
            <span class="workspace-tabs-list__text">
              <span class="workspace-tabs-list__title">Home</span>
              <span class="workspace-tabs-list__meta">Workspace</span>
            </span>
          </button>
        </div>
      `;
      document.body.appendChild(wrapper);

      const titleEl = wrapper.querySelector('.workspace-tabs-list__title');
      expect(titleEl).not.toBeNull();

      const style = window.getComputedStyle(titleEl as Element);
      expect(style.textTransform).not.toBe('capitalize');

      wrapper.remove();
    });
  });

  // -------------------------------------------------------------------------
  // Site 4: .design-card-name (DesignsTab grid cards)
  // -------------------------------------------------------------------------

  describe('.design-card-name--project', () => {
    beforeEach(() => {
      const css = loadIndexCss();
      injectRules(extractRulesBySelector(css, 'design-card-name'));
    });

    it('applies text-transform: capitalize to project card names', () => {
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

      // Project cards carry the --project modifier class.
      const projectNameEls = container.querySelectorAll('.design-card-name--project');
      expect(projectNameEls.length).toBeGreaterThan(0);

      const projectNameEl = Array.from(projectNameEls).find(
        (el) => el.textContent === project.name,
      );
      expect(projectNameEl).not.toBeNull();

      const style = window.getComputedStyle(projectNameEl as Element);
      expect(style.textTransform).toBe('capitalize');
    });

    it('does not apply text-transform: capitalize to live-artifact titles', () => {
      // Live-artifact cards use .design-card-name without --project.
      // Fixture DOM replicates the production element; component rendering of
      // live-artifact cards requires a running daemon, so a fixture is appropriate.
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div class="design-card-meta-block">
          <div class="design-card-name" title="iPhone 16 Pro — v2.1">iPhone 16 Pro — v2.1</div>
        </div>
      `;
      document.body.appendChild(wrapper);

      const nameEl = wrapper.querySelector('.design-card-name');
      expect(nameEl).not.toBeNull();

      const style = window.getComputedStyle(nameEl as Element);
      expect(style.textTransform).not.toBe('capitalize');

      wrapper.remove();
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
