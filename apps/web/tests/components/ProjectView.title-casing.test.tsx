// @vitest-environment jsdom
// Behavioral coverage for the project title text-transform rule.
// Verifies that the CSS rule `text-transform: capitalize` is applied to the
// rendered `.app-project-title .title` element, not just present in the
// source file. Uses stylesheet injection into the jsdom document so that
// `getComputedStyle` resolves the rule against the real rendered DOM node.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type {
  AgentInfo,
  AppConfig,
  DesignSystemSummary,
  Project,
  SkillSummary,
} from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: (value: string) => value,
  }),
  useT: () => (key: string) => key,
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: vi.fn(),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: vi.fn(),
  listActiveChatRuns: vi.fn().mockResolvedValue([]),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: vi.fn(),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    deletePreviewComment: vi.fn(),
    fetchDesignSystem: vi.fn(),
    fetchLiveArtifacts: vi.fn().mockResolvedValue([]),
    fetchPreviewComments: vi.fn(),
    fetchProjectFiles: vi.fn().mockResolvedValue([]),
    fetchSkill: vi.fn(),
    getTemplate: vi.fn(),
    patchPreviewCommentStatus: vi.fn(),
    upsertPreviewComment: vi.fn(),
    writeProjectTextFile: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    createConversation: vi.fn().mockResolvedValue(null),
    listConversations: vi.fn().mockResolvedValue([]),
    listMessages: vi.fn().mockResolvedValue([]),
    loadTabs: vi.fn().mockResolvedValue({ tabs: [], active: null }),
    patchConversation: vi.fn(),
    patchProject: vi.fn(),
    saveMessage: vi.fn(),
    saveTabs: vi.fn(),
  };
});

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => (
    <header>{children}</header>
  ),
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  FileWorkspace: () => <div data-testid="file-workspace" />,
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: () => <div data-testid="chat-pane" />,
}));

const config: AppConfig = {
  mode: 'api',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

const project: Project = {
  id: 'project-1',
  name: 'acme studio',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
};

function renderProjectView() {
  return render(
    <ProjectView
      project={project}
      routeFileName={null}
      config={config}
      agents={[] as AgentInfo[]}
      skills={[] as SkillSummary[]}
      designTemplates={[] as SkillSummary[]}
      designSystems={[] as DesignSystemSummary[]}
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={vi.fn()}
      onRefreshAgents={vi.fn()}
      onOpenSettings={vi.fn()}
      onBack={vi.fn()}
      onClearPendingPrompt={vi.fn()}
      onTouchProject={vi.fn()}
      onProjectChange={vi.fn()}
      onProjectsRefresh={vi.fn()}
    />,
  );
}

// Extract only the rules relevant to the five project-name selector blocks so
// that the injected stylesheet stays small and does not pull in thousands of
// lines of unrelated CSS that jsdom would parse at test cost.
//
// Covered selectors (all five project-name display sites):
//   1. .app-project-title .title             — design-files page header (this test)
//   2. .workspace-tab__label--project        — tab strip (project tabs only)
//   3. .workspace-tabs-list__title--project  — tab overflow popover (project tabs only)
//   4. .design-card-name--project            — designs grid cards (project cards only)
//   5. .recent-projects__card-name           — recent-projects strip (separate CSS file)
const PROJECT_NAME_SELECTORS = [
  'app-project-title',
  'workspace-tab__label--project',
  'workspace-tabs-list__title--project',
  'design-card-name--project',
  'recent-projects__card-name',
] as const;

function extractProjectTitleRules(css: string): string {
  const rules: string[] = [];
  const blockRe = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(css)) !== null) {
    const selector = m[1] ?? '';
    const body = m[2] ?? '';
    if (PROJECT_NAME_SELECTORS.some((sel) => selector.includes(sel))) {
      rules.push(`${selector}{${body}}`);
    }
  }
  return rules.join('\n');
}

describe('project title casing — rendered DOM', () => {
  let styleEl: HTMLStyleElement;

  beforeEach(() => {
    // Resolved from package root: vitest runs with cwd = apps/web.
    // Note: import.meta.url is not a file: URL in the jsdom environment, so
    // process.cwd()-relative resolution is the correct anchor here.
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    styleEl = document.createElement('style');
    styleEl.setAttribute('data-testid', 'project-title-rules');
    styleEl.textContent = extractProjectTitleRules(css);
    document.head.appendChild(styleEl);
  });

  afterEach(() => {
    styleEl.remove();
    cleanup();
  });

  it('applies text-transform: capitalize to the rendered .app-project-title .title element', () => {
    const { getByTestId } = renderProjectView();

    // The element with data-testid="project-title" is the span carrying both
    // the `title` and `editable` classes, nested inside `.app-project-title`.
    const titleEl = getByTestId('project-title');

    // Verify the DOM structure matches the selector before asserting the style.
    expect(titleEl.closest('.app-project-title')).not.toBeNull();
    expect(titleEl.classList.contains('title')).toBe(true);

    // jsdom resolves <style> tags injected into document.head, so
    // getComputedStyle returns the rule's declared value.
    const computedStyle = window.getComputedStyle(titleEl);
    expect(computedStyle.textTransform).toBe('capitalize');
  });
});
