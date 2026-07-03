// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef, useState, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const trackChatPanelClickMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/events')>();
  return {
    ...actual,
    trackChatPanelClick: trackChatPanelClickMock,
  };
});

import { ChatComposer, type ChatComposerHandle } from '../../src/components/ChatComposer';
import { I18nProvider } from '../../src/i18n';
import type { Locale } from '../../src/i18n/types';
import type { AppliedPluginSnapshot, ProjectMetadata } from '@open-design/contracts';
import { composerText, pressEnter, typeAndSettle } from '../helpers/lexical-composer';

const COMMUNITY_PLUGIN = {
  id: 'community-deck',
  title: 'Community Deck',
  version: '1.0.0',
  trust: 'restricted' as const,
  sourceKind: 'bundled' as const,
  source: 'bundled/community-deck',
  capabilitiesGranted: [],
  manifest: {
    name: 'community-deck',
    title: 'Community Deck',
    description: 'Official deck starter',
    od: { kind: 'skill' },
  },
  fsPath: '/plugins/community-deck',
  installedAt: 0,
  updatedAt: 0,
};

const USER_PLUGIN = {
  ...COMMUNITY_PLUGIN,
  id: 'my-export',
  title: 'My Export',
  sourceKind: 'local' as const,
  source: '/plugins/my-export',
  manifest: {
    ...COMMUNITY_PLUGIN.manifest,
    name: 'my-export',
    title: 'My Export',
    description: 'Private export workflow',
  },
};

const SKILL = {
  id: 'deck-builder',
  name: 'Deck Builder',
  description: 'Build a polished slide deck.',
  triggers: ['deck'],
  mode: 'deck' as const,
  previewType: 'html',
  designSystemRequired: false,
  defaultFor: [],
  upstream: null,
  hasBody: true,
  examplePrompt: 'Make a deck',
  aggregatesExamples: false,
};

function makeSkill(overrides: Partial<typeof SKILL>): typeof SKILL {
  return {
    ...SKILL,
    id: overrides.id ?? SKILL.id,
    name: overrides.name ?? SKILL.name,
    description: overrides.description ?? SKILL.description,
    triggers: overrides.triggers ?? SKILL.triggers,
    mode: overrides.mode ?? SKILL.mode,
    previewType: overrides.previewType ?? SKILL.previewType,
    designSystemRequired: overrides.designSystemRequired ?? SKILL.designSystemRequired,
    defaultFor: overrides.defaultFor ?? SKILL.defaultFor,
    upstream: overrides.upstream ?? SKILL.upstream,
    hasBody: overrides.hasBody ?? SKILL.hasBody,
    examplePrompt: overrides.examplePrompt ?? SKILL.examplePrompt,
    aggregatesExamples: overrides.aggregatesExamples ?? SKILL.aggregatesExamples,
  };
}

const MCP_SERVER = {
  id: 'slack',
  label: 'Slack MCP',
  transport: 'stdio' as const,
  enabled: true,
  command: 'slack-mcp',
};

const APPLY_RESULT = {
  ok: true,
  query: 'Run plugin.',
  contextItems: [],
  inputs: [],
  assets: [],
  mcpServers: [],
  trust: 'restricted',
  capabilitiesGranted: ['prompt:inject'],
  capabilitiesRequired: ['prompt:inject'],
  appliedPlugin: {
    snapshotId: 'snap-1',
    pluginId: USER_PLUGIN.id,
    pluginVersion: '1.0.0',
    manifestSourceDigest: 'a'.repeat(64),
    inputs: {},
    resolvedContext: { items: [] },
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    assetsStaged: [],
    taskKind: 'new-generation',
    appliedAt: 0,
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
    status: 'fresh',
  },
  projectMetadata: {},
};

let fetchMock: ReturnType<typeof vi.fn>;
let plugins = [COMMUNITY_PLUGIN, USER_PLUGIN];
let skills = [SKILL];
let servers = [MCP_SERVER];
let openFolderPaths: string[];
let deferNextProjectPatch = false;
let rejectNextProjectPatch = false;
let resolveDeferredProjectPatch: (() => void) | null = null;
let referenceProjects: Array<{
  id: string;
  name: string;
  skillId: null;
  designSystemId: null;
  createdAt: number;
  updatedAt: number;
  metadata: { kind: 'prototype' };
}>;
let referenceProjectDetails: Record<string, { project: (typeof referenceProjects)[number]; resolvedDir: string | null }>;

function composerElement(
  overrides: Partial<ComponentProps<typeof ChatComposer>> = {},
) {
  return (
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onOpenMcpSettings={vi.fn()}
      skills={skills}
      {...overrides}
    />
  );
}

function renderComposer(
  overrides: Partial<ComponentProps<typeof ChatComposer>> = {},
  options: { locale?: Locale } = {},
) {
  const tree = composerElement(overrides);

  return options.locale
    ? render(<I18nProvider initial={options.locale}>{tree}</I18nProvider>)
    : render(tree);
}

// Flush the composer's lazy mount fetches (MCP servers, installed plugins,
// connectors) so the @-picker lists are populated before we drive the editor.
async function flushMounts() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function stagedPluginChip(): Element | null {
  return screen
    .queryByTestId('staged-contexts')
    ?.querySelector('.staged-chip.staged-context--plugin') ?? null;
}

function projectPatchBodies(): Array<{ metadata?: { linkedDirs?: string[] } }> {
  return fetchMock.mock.calls
    .filter(([url, init]) => url === '/api/projects/project-1' && init?.method === 'PATCH')
    .map(([, init]) => JSON.parse(String(init?.body ?? '{}')));
}

// The contenteditable serializes newlines as `<br>`, which jsdom's
// `.textContent` drops — so use the Lexical-aware `composerText()` helper for
// every editor-text assertion (it walks the tree and emits real `\n`s).

beforeEach(() => {
  trackChatPanelClickMock.mockClear();
  plugins = [COMMUNITY_PLUGIN, USER_PLUGIN];
  skills = [SKILL];
  servers = [MCP_SERVER];
  openFolderPaths = ['/Users/me/reference-dir'];
  deferNextProjectPatch = false;
  rejectNextProjectPatch = false;
  resolveDeferredProjectPatch = null;
  referenceProjects = [];
  referenceProjectDetails = {};
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/mcp/servers') {
      return new Response(JSON.stringify({ servers, templates: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/api/plugins/') && url.endsWith('/apply')) {
      return new Response(JSON.stringify(APPLY_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/skills') {
      return new Response(JSON.stringify({ skills }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/projects') {
      return new Response(JSON.stringify({ projects: referenceProjects }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/dialog/open-folder' && init?.method === 'POST') {
      return new Response(
        JSON.stringify({ path: openFolderPaths.shift() ?? '/Users/me/reference-dir' }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    if (url.startsWith('/api/skills/')) {
      const id = decodeURIComponent(url.split('/').pop() ?? '');
      const skill = skills.find((candidate) => candidate.id === id) ?? makeSkill({ id, name: id });
      return new Response(JSON.stringify({ ...skill, body: `skill body for ${id}` }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/projects/project-1' && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body ?? '{}')) as { metadata?: unknown };
      if (rejectNextProjectPatch) {
        rejectNextProjectPatch = false;
        return new Response(JSON.stringify({
          error: { message: 'directory does not exist or is not accessible' },
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (deferNextProjectPatch) {
        deferNextProjectPatch = false;
        await new Promise<void>((resolve) => {
          resolveDeferredProjectPatch = resolve;
        });
        resolveDeferredProjectPatch = null;
      }
      return new Response(JSON.stringify({
        project: {
          id: 'project-1',
          name: 'Project',
          skillId: SKILL.id,
          designSystemId: null,
          createdAt: 1,
          updatedAt: 1,
          metadata: body.metadata ?? { kind: 'prototype' },
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const projectDetailMatch = /^\/api\/projects\/([^/?]+)(?:\?.*)?$/.exec(url);
    if (projectDetailMatch && init?.method !== 'PATCH') {
      const projectId = decodeURIComponent(projectDetailMatch[1]!);
      const detail = referenceProjectDetails[projectId] ?? null;
      return new Response(JSON.stringify(detail ?? {}), {
        status: detail ? 200 : 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    // Any other lazy mount fetch (e.g. /api/connectors) returns an empty-OK
    // body. flushMounts() awaits these, so throwing here would surface as an
    // unhandled rejection during the await; an empty payload keeps the picker
    // lists empty without breaking the render.
    return new Response('[]', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('ChatComposer context pickers', () => {
  it('auto-stages the active workspace context and re-stages after a tab change', async () => {
    const onSend = vi.fn();
    const fileContext = {
      id: 'file:index.html',
      kind: 'file' as const,
      label: 'index.html',
      path: 'index.html',
      tabId: 'index.html',
    };
    const browserContext = {
      id: 'browser:1',
      kind: 'browser' as const,
      label: 'Dribbble',
      url: 'https://dribbble.com/',
      tabId: '__browser__:1',
    };
    const view = renderComposer({ activeWorkspaceContext: fileContext, onSend });
    await flushMounts();

    expect(screen.getByTestId('staged-contexts').textContent).toContain('Currentindex.html');
    fireEvent.click(screen.getByLabelText('Remove index.html'));
    await waitFor(() => expect(screen.queryByText('index.html')).toBeNull());

    view.rerender(composerElement({ activeWorkspaceContext: browserContext, onSend }));
    await waitFor(() => expect(screen.getByTestId('staged-contexts').textContent).toContain('CurrentDribbble'));

    await typeAndSettle('Use the current tab.');
    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalled());
    const meta = onSend.mock.calls[0]?.[3];
    expect(meta?.context?.workspaceItems).toEqual([browserContext]);
  });

  it('opens the @ panel even when every source is empty', async () => {
    plugins = [];
    skills = [];
    servers = [];
    renderComposer();
    await flushMounts();

    await typeAndSettle('@');

    await waitFor(() => expect(screen.getByTestId('mention-popover')).toBeTruthy());
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'All',
      'Design files',
      'Tabs',
      'Plugins',
      'Skills',
      'MCP',
      'Connectors',
    ]);
    expect(screen.getByRole('tab', { name: 'Plugins' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Skills' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'MCP' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Connectors' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Design files' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Tabs' })).toBeTruthy();
    expect(screen.getByText('Search Design Files, tabs, plugins, skills, MCP servers, and connectors.')).toBeTruthy();
  });

  it('localizes @ panel tabs and empty states in Chinese mode', async () => {
    plugins = [];
    skills = [];
    servers = [];
    renderComposer({}, { locale: 'zh-CN' });
    await flushMounts();

    await typeAndSettle('@');

    await waitFor(() => expect(screen.getByRole('tab', { name: '全部' })).toBeTruthy());
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '全部',
      '设计文件',
      '标签页',
      '插件',
      '技能',
      'MCP',
      '连接器',
    ]);
    expect(screen.getByRole('tab', { name: '插件' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '技能' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'MCP' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '连接器' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '设计文件' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '标签页' })).toBeTruthy();
    expect(screen.getByText('搜索设计文件、标签页、插件、技能、MCP 服务器和连接器。')).toBeTruthy();

    await typeAndSettle('@missing');

    await waitFor(() => expect(screen.getByText('没有找到“missing”的结果。')).toBeTruthy());
    expect(screen.queryByText('No results for “missing”.')).toBeNull();
  });

  it('lists Design Files first in All and picks the first file with Enter', async () => {
    renderComposer({
      projectFiles: [
        {
          path: 'designs/landing.html',
          name: 'landing.html',
          kind: 'html',
          mime: 'text/html',
          mtime: 1,
          size: 128,
        },
      ],
      workspaceContexts: [
        {
          id: 'browser:__browser__:1',
          kind: 'browser' as const,
          label: 'Dribbble',
          title: 'Dribbble - Discover designers',
          url: 'https://dribbble.com/',
          tabId: '__browser__:1',
        },
      ],
    });
    await flushMounts();

    await typeAndSettle('@');

    await waitFor(() => expect(screen.getByText('designs/landing.html')).toBeTruthy());
    const labels = Array.from(
      screen.getByTestId('mention-popover').querySelectorAll('.mention-section-label'),
      (node) => node.textContent,
    );
    expect(labels[0]).toBe('Design files');
    expect(labels[1]).toBe('Tabs');

    pressEnter();

    await waitFor(() => expect(composerText()).toBe('@designs/landing.html '));
    expect(screen.getByTestId('staged-contexts').textContent).toContain('landing.html');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/apply'))).toBe(false);
  });

  it('searches workspace tabs from @ and sends the selected tab context', async () => {
    const onSend = vi.fn();
    const browserContext = {
      id: 'browser:__browser__:1',
      kind: 'browser' as const,
      label: 'Dribbble',
      title: 'Dribbble - Discover designers',
      url: 'https://dribbble.com/',
      tabId: '__browser__:1',
    };
    renderComposer({
      onSend,
      workspaceContexts: [browserContext],
    });
    await flushMounts();

    await typeAndSettle('@drib');

    await waitFor(() => expect(screen.getByText('Dribbble')).toBeTruthy());
    const labels = Array.from(
      screen.getByTestId('mention-popover').querySelectorAll('.mention-section-label'),
      (node) => node.textContent,
    );
    expect(labels[0]).toBe('Tabs');
    fireEvent.click(screen.getByText('Dribbble'));

    await waitFor(() => expect(composerText()).toBe('@Dribbble '));
    const pill = screen
      .getByTestId('chat-composer-input')
      .querySelector('.composer-inline-mention');
    expect(pill?.getAttribute('data-mention-kind')).toBe('workspace');
    expect(screen.getByTestId('staged-contexts').textContent).toContain('BrowserDribbble');

    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[3]?.context?.workspaceItems).toEqual([browserContext]);
  });

  it('does not preserve active file paths as linked dirs when changing the working dir', async () => {
    openFolderPaths = ['/Users/me/new-work-dir'];
    renderComposer({
      activeWorkspaceContext: {
        id: 'file:index.html',
        kind: 'file',
        label: 'index.html',
        path: 'index.html',
        absolutePath: '/tmp/open-design/project-1/index.html',
        tabId: 'index.html',
      },
      projectMetadata: { kind: 'prototype', linkedDirs: ['/Users/me/work-dir'] },
    });
    await flushMounts();

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    fireEvent.click(await screen.findByTestId('working-dir-pick'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(1);
    });
    expect(projectPatchBodies()[0]?.metadata?.linkedDirs).toEqual(['/Users/me/new-work-dir']);
  });

  it('removes the linked dir added for a local-code context when its chip is cleared', async () => {
    const onProjectMetadataChange = vi.fn();
    renderComposer({
      projectMetadata: { kind: 'prototype' },
      onProjectMetadataChange,
    });
    await flushMounts();

    fireEvent.click(screen.getByTestId('chat-plus-trigger'));
    fireEvent.click(await screen.findByText('Link local code'));

    await waitFor(() => {
      expect(screen.getByTestId('staged-contexts').textContent).toContain('reference-dir');
    });
    expect(projectPatchBodies()[0]?.metadata?.linkedDirs).toEqual(['/Users/me/reference-dir']);

    fireEvent.click(screen.getByLabelText('Remove reference-dir'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(2);
    });
    expect(projectPatchBodies()[1]?.metadata?.linkedDirs).toEqual([]);
    await waitFor(() => {
      expect(screen.queryByText('reference-dir')).toBeNull();
    });
    expect(onProjectMetadataChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ linkedDirs: [] }),
    );
  });

  it('stages multiple referenced projects and links all resolved dirs together', async () => {
    const referenceA = {
      id: 'reference-a',
      name: 'Reference A',
      skillId: null,
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
      metadata: { kind: 'prototype' as const },
    };
    const referenceB = {
      ...referenceA,
      id: 'reference-b',
      name: 'Reference B',
    };
    referenceProjects = [referenceA, referenceB];
    referenceProjectDetails = {
      'reference-a': {
        project: referenceA,
        resolvedDir: '/tmp/open-design/reference-a',
      },
      'reference-b': {
        project: referenceB,
        resolvedDir: '/tmp/open-design/reference-b',
      },
    };
    const onProjectMetadataChange = vi.fn();
    renderComposer({
      projectMetadata: { kind: 'prototype', linkedDirs: ['/Users/me/work-dir'] },
      onProjectMetadataChange,
    });
    await flushMounts();

    fireEvent.click(screen.getByTestId('chat-plus-trigger'));
    fireEvent.click(await screen.findByTestId('composer-plus-reference-project'));
    await screen.findByText('Reference A');
    fireEvent.click(screen.getByText('Reference B'));
    fireEvent.click(screen.getByRole('button', { name: 'Reference project' }));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(1);
    });
    expect(projectPatchBodies()[0]?.metadata?.linkedDirs).toEqual([
      '/Users/me/work-dir',
      '/tmp/open-design/reference-a',
      '/tmp/open-design/reference-b',
    ]);
    await waitFor(() => {
      const stagedText = screen.getByTestId('staged-contexts').textContent ?? '';
      expect(stagedText).toContain('ProjectReference A');
      expect(stagedText).toContain('ProjectReference B');
    });
    expect(onProjectMetadataChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        linkedDirs: [
          '/Users/me/work-dir',
          '/tmp/open-design/reference-a',
          '/tmp/open-design/reference-b',
        ],
      }),
    );
  });

  it('does not stage referenced project context when linking its directory is rejected', async () => {
    const referenceA = {
      id: 'reference-a',
      name: 'Reference A',
      skillId: null,
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
      metadata: { kind: 'prototype' as const },
    };
    referenceProjects = [referenceA];
    referenceProjectDetails = {
      'reference-a': {
        project: referenceA,
        resolvedDir: '/tmp/open-design/missing-reference-a',
      },
    };
    rejectNextProjectPatch = true;
    const onSend = vi.fn();
    renderComposer({ onSend });
    await flushMounts();
    await typeAndSettle('Review this');

    fireEvent.click(screen.getByTestId('chat-plus-trigger'));
    fireEvent.click(await screen.findByTestId('composer-plus-reference-project'));
    await screen.findByText('Reference A');
    fireEvent.click(screen.getByRole('button', { name: 'Reference project' }));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(1);
    });
    expect(screen.queryByTestId('staged-contexts')).toBeNull();
    expect(composerText()).toBe('Review this');
    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[3]?.context?.workspaceItems).toBeUndefined();
  });

  it('keeps sent linked-dir workspace context visible and removable after reset', async () => {
    const onProjectMetadataChange = vi.fn();
    const onSend = vi.fn();

    function ControlledComposer() {
      const [metadata, setMetadata] = useState<ProjectMetadata>({ kind: 'prototype' });
      return composerElement({
        projectMetadata: metadata,
        onProjectMetadataChange: (next) => {
          onProjectMetadataChange(next);
          setMetadata(next);
        },
        onSend,
      });
    }

    render(<ControlledComposer />);
    await flushMounts();

    fireEvent.click(screen.getByTestId('chat-plus-trigger'));
    fireEvent.click(await screen.findByText('Link local code'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(1);
    });
    expect(projectPatchBodies()[0]?.metadata?.linkedDirs).toEqual(['/Users/me/reference-dir']);
    await waitFor(() => {
      expect(screen.getByTestId('staged-contexts').textContent).toContain('reference-dir');
    });

    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[3]?.context?.workspaceItems).toEqual([
      expect.objectContaining({
        id: 'local-code:/Users/me/reference-dir',
        absolutePath: '/Users/me/reference-dir',
      }),
    ]);
    await waitFor(() => {
      expect(composerText().trim()).toBe('');
      expect(screen.getByTestId('staged-contexts').textContent).toContain('reference-dir');
    });
    expect(screen.getByTestId('working-dir-trigger').textContent).not.toContain('reference-dir');

    fireEvent.click(screen.getByLabelText('Remove reference-dir'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(2);
    });
    expect(projectPatchBodies()[1]?.metadata?.linkedDirs).toEqual([]);
    expect(screen.queryByTestId('staged-contexts')?.textContent ?? '').not.toContain('reference-dir');
    expect(onProjectMetadataChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ linkedDirs: [] }),
    );
  });

  it('does not remove a pre-existing linked dir when a matching workspace chip is cleared', async () => {
    const onProjectMetadataChange = vi.fn();
    renderComposer({
      projectMetadata: { kind: 'prototype', linkedDirs: ['/Users/me/reference-dir'] },
      onProjectMetadataChange,
    });
    await flushMounts();

    fireEvent.click(screen.getByTestId('chat-plus-trigger'));
    fireEvent.click(await screen.findByText('Link local code'));

    await waitFor(() => {
      expect(screen.getByTestId('staged-contexts').textContent).toContain('reference-dir');
    });
    expect(projectPatchBodies()).toEqual([]);

    fireEvent.click(screen.getByLabelText('Remove reference-dir'));

    await waitFor(() => {
      expect(screen.queryByTestId('staged-contexts')?.textContent ?? '').not.toContain('reference-dir');
    });
    expect(projectPatchBodies()).toEqual([]);
    expect(onProjectMetadataChange).not.toHaveBeenCalled();
  });

  it('keeps draft text typed while linked-dir removal is pending', async () => {
    renderComposer({ projectMetadata: { kind: 'prototype' } });
    await flushMounts();

    fireEvent.click(screen.getByTestId('chat-plus-trigger'));
    fireEvent.click(await screen.findByText('Link local code'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(1);
    });

    deferNextProjectPatch = true;
    fireEvent.click(screen.getByLabelText('Remove reference-dir'));

    await waitFor(() => {
      expect(resolveDeferredProjectPatch).toBeTruthy();
    });
    await typeAndSettle('Keep the typed text after clicking remove');
    await act(async () => {
      resolveDeferredProjectPatch?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(2);
    });
    expect(composerText()).toBe('Keep the typed text after clicking remove');
  });

  it('preserves staged local-code linked dirs when changing or clearing the working dir', async () => {
    openFolderPaths = ['/Users/me/reference-dir', '/Users/me/other-work-dir'];
    const onProjectMetadataChange = vi.fn();
    renderComposer({
      projectMetadata: { kind: 'prototype', linkedDirs: ['/Users/me/work-dir'] },
      onProjectMetadataChange,
    });
    await flushMounts();

    fireEvent.click(screen.getByTestId('chat-plus-trigger'));
    fireEvent.click(await screen.findByText('Link local code'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(1);
    });
    expect(projectPatchBodies()[0]?.metadata?.linkedDirs).toEqual([
      '/Users/me/work-dir',
      '/Users/me/reference-dir',
    ]);

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    fireEvent.click(await screen.findByTestId('working-dir-pick'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(2);
    });
    expect(projectPatchBodies()[1]?.metadata?.linkedDirs).toEqual([
      '/Users/me/other-work-dir',
      '/Users/me/reference-dir',
    ]);

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    fireEvent.click(await screen.findByTestId('working-dir-clear'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(3);
    });
    expect(projectPatchBodies()[2]?.metadata?.linkedDirs).toEqual(['/Users/me/reference-dir']);
    expect(screen.getByTestId('staged-contexts').textContent).toContain('reference-dir');
  });

  it('treats Home-carried workspace dirs as context-only after project creation', async () => {
    openFolderPaths = ['/Users/me/other-work-dir'];
    const onProjectMetadataChange = vi.fn();

    function ControlledComposer() {
      const [metadata, setMetadata] = useState<ProjectMetadata>({
        kind: 'prototype',
        linkedDirs: ['/Users/me/reference-dir'],
      });
      return composerElement({
        initialWorkspaceContexts: [{
          id: 'local-code:/Users/me/reference-dir',
          kind: 'local-code',
          label: 'reference-dir',
          title: 'reference-dir',
          absolutePath: '/Users/me/reference-dir',
        }],
        projectMetadata: metadata,
        onProjectMetadataChange: (next) => {
          onProjectMetadataChange(next);
          setMetadata(next);
        },
      });
    }

    render(<ControlledComposer />);
    await flushMounts();

    expect(screen.getByTestId('working-dir-trigger').textContent).not.toContain('reference-dir');

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    expect(screen.queryByTestId('working-dir-clear')).toBeNull();
    fireEvent.click(await screen.findByTestId('working-dir-pick'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(1);
    });
    expect(projectPatchBodies()[0]?.metadata?.linkedDirs).toEqual([
      '/Users/me/other-work-dir',
      '/Users/me/reference-dir',
    ]);
    await waitFor(() => {
      expect(screen.getByTestId('working-dir-trigger').textContent).toContain('other-work-dir');
    });

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    fireEvent.click(await screen.findByTestId('working-dir-clear'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(2);
    });
    expect(projectPatchBodies()[1]?.metadata?.linkedDirs).toEqual(['/Users/me/reference-dir']);
    expect(screen.getByTestId('staged-contexts').textContent).toContain('reference-dir');

    fireEvent.click(screen.getByLabelText('Remove reference-dir'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(3);
    });
    expect(projectPatchBodies()[2]?.metadata?.linkedDirs).toEqual([]);
    expect(screen.queryByTestId('staged-contexts')?.textContent ?? '').not.toContain('reference-dir');
    expect(screen.getByTestId('working-dir-trigger').textContent).not.toContain('reference-dir');
  });

  it('keeps a promoted context dir as the working dir when its chip is removed', async () => {
    openFolderPaths = ['/Users/me/shared', '/Users/me/shared'];
    const onProjectMetadataChange = vi.fn();

    function ControlledComposer() {
      const [metadata, setMetadata] = useState<ProjectMetadata>({ kind: 'prototype' });
      return composerElement({
        projectMetadata: metadata,
        onProjectMetadataChange: (next) => {
          onProjectMetadataChange(next);
          setMetadata(next);
        },
      });
    }

    render(<ControlledComposer />);
    await flushMounts();

    fireEvent.click(screen.getByTestId('chat-plus-trigger'));
    fireEvent.click(await screen.findByText('Link local code'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(1);
    });
    expect(projectPatchBodies()[0]?.metadata?.linkedDirs).toEqual(['/Users/me/shared']);

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    fireEvent.click(await screen.findByTestId('working-dir-pick'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(2);
    });
    expect(projectPatchBodies()[1]?.metadata?.linkedDirs).toEqual(['/Users/me/shared']);
    await waitFor(() => {
      expect(screen.getByTestId('working-dir-trigger').textContent).toContain('shared');
    });

    fireEvent.click(screen.getByLabelText('Remove shared'));

    await waitFor(() => {
      expect(screen.queryByTestId('staged-contexts')?.textContent ?? '').not.toContain('shared');
    });
    expect(projectPatchBodies()).toHaveLength(2);
    expect(screen.getByTestId('working-dir-trigger').textContent).toContain('shared');
    expect(onProjectMetadataChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ linkedDirs: ['/Users/me/shared'] }),
    );
  });

  it('preserves a promoted context dir when clearing the working dir while its chip remains', async () => {
    openFolderPaths = ['/Users/me/shared', '/Users/me/shared'];
    const onProjectMetadataChange = vi.fn();

    function ControlledComposer() {
      const [metadata, setMetadata] = useState<ProjectMetadata>({ kind: 'prototype' });
      return composerElement({
        projectMetadata: metadata,
        onProjectMetadataChange: (next) => {
          onProjectMetadataChange(next);
          setMetadata(next);
        },
      });
    }

    render(<ControlledComposer />);
    await flushMounts();

    fireEvent.click(screen.getByTestId('chat-plus-trigger'));
    fireEvent.click(await screen.findByText('Link local code'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(1);
    });
    expect(projectPatchBodies()[0]?.metadata?.linkedDirs).toEqual(['/Users/me/shared']);

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    fireEvent.click(await screen.findByTestId('working-dir-pick'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(2);
    });
    expect(projectPatchBodies()[1]?.metadata?.linkedDirs).toEqual(['/Users/me/shared']);
    await waitFor(() => {
      expect(screen.getByTestId('working-dir-trigger').textContent).toContain('shared');
    });

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    fireEvent.click(await screen.findByTestId('working-dir-clear'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(3);
    });
    expect(projectPatchBodies()[2]?.metadata?.linkedDirs).toEqual(['/Users/me/shared']);
    expect(screen.getByTestId('staged-contexts').textContent).toContain('shared');
    expect(screen.getByTestId('working-dir-trigger').textContent).not.toContain('shared');
    expect(onProjectMetadataChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ linkedDirs: ['/Users/me/shared'] }),
    );
  });

  it('keeps a shared linked dir while another workspace item uses the same path', async () => {
    openFolderPaths = ['/Users/me/shared'];
    const onProjectMetadataChange = vi.fn();
    renderComposer({
      activeWorkspaceContext: {
        id: 'project:project-a',
        kind: 'project',
        label: 'Project A',
        title: 'Project A',
        path: 'project-a',
        absolutePath: '/Users/me/shared',
      },
      projectMetadata: { kind: 'prototype' },
      onProjectMetadataChange,
    });
    await flushMounts();

    fireEvent.click(screen.getByTestId('chat-plus-trigger'));
    fireEvent.click(await screen.findByText('Link local code'));

    await waitFor(() => {
      expect(projectPatchBodies()).toHaveLength(1);
    });
    expect(projectPatchBodies()[0]?.metadata?.linkedDirs).toEqual(['/Users/me/shared']);
    expect(screen.getByLabelText('Remove Project A')).toBeTruthy();

    fireEvent.click(screen.getAllByLabelText('Remove shared')[0]!);

    await waitFor(() => {
      expect(screen.queryByLabelText('Remove shared')).toBeNull();
    });
    expect(projectPatchBodies()).toHaveLength(1);
    expect(onProjectMetadataChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ linkedDirs: ['/Users/me/shared'] }),
    );
  });

  it('selects an MCP server from @ search and keeps the inline token visible', async () => {
    renderComposer();
    await flushMounts();

    await typeAndSettle('@sl');

    await waitFor(() => expect(screen.getByText('Slack MCP')).toBeTruthy());
    fireEvent.click(screen.getByText('Slack MCP'));

    await waitFor(() => expect(composerText()).toBe('@Slack MCP '));
    const pill = screen
      .getByTestId('chat-composer-input')
      .querySelector('.composer-inline-mention');
    expect(pill?.textContent).toBe('@Slack MCP');
    expect(pill?.getAttribute('data-mention-kind')).toBe('mcp');
    expect(screen.getByTestId('staged-contexts').textContent).toContain('@Slack MCP');

    fireEvent.click(screen.getByLabelText('Remove Slack MCP'));
    await waitFor(() => expect(composerText().trim()).toBe(''));
    expect(screen.queryByTestId('staged-contexts')).toBeNull();
  });

  it('applies a skill from @ search and reports the active project skill', async () => {
    const onProjectSkillChange = vi.fn();
    renderComposer({ onProjectSkillChange });
    await flushMounts();

    await typeAndSettle('@deck');

    await waitFor(() => expect(screen.getByText('Deck Builder')).toBeTruthy());
    fireEvent.click(screen.getByText('Deck Builder'));

    await waitFor(() => expect(onProjectSkillChange).toHaveBeenCalledWith('deck-builder'));
    await waitFor(() => expect(composerText()).toBe('@Deck Builder '));
    const pill = screen
      .getByTestId('chat-composer-input')
      .querySelector('.composer-inline-mention');
    expect(pill?.textContent).toBe('@Deck Builder');
    expect(pill?.getAttribute('data-mention-kind')).toBe('skill');
    expect(screen.getByTestId('staged-contexts').textContent).toContain('@Deck Builder');

    fireEvent.click(
      within(screen.getByTestId('staged-contexts')).getByRole('button', {
        name: 'Deck Builder',
      }),
    );
    await waitFor(() => expect(screen.getByTestId('skill-details-modal')).toBeTruthy());
    expect(screen.getByText('skill body for deck-builder')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);

    fireEvent.click(screen.getByLabelText('Remove Deck Builder'));
    await waitFor(() => expect(composerText().trim()).toBe(''));
    expect(screen.queryByTestId('staged-contexts')).toBeNull();
  });

  it('shows all matching skills and ranks exact prefix matches first', async () => {
    skills = [
      makeSkill({
        id: 'story-brief',
        name: 'Story Brief',
        description: 'Use when planning audit work.',
        triggers: ['writing'],
      }),
      ...Array.from({ length: 9 }, (_, index) =>
        makeSkill({
          id: `audit-helper-${index + 1}`,
          name: `Audit Helper ${index + 1}`,
          description: `Audit support workflow ${index + 1}.`,
          triggers: [`audit-${index + 1}`],
        }),
      ),
      makeSkill({
        id: 'accessibility-review',
        name: 'Accessibility Review',
        description: 'Audit accessible interaction details.',
        triggers: ['a11y-audit'],
      }),
    ];
    renderComposer();
    await flushMounts();

    await typeAndSettle('@audit');

    await waitFor(() => expect(screen.getByText('Audit Helper 9')).toBeTruthy());
    const skillNames = Array.from(
      screen.getByTestId('mention-popover').querySelectorAll('.mention-item strong'),
      (node) => node.textContent,
    );

    expect(skillNames).toContain('Audit Helper 9');
    expect(skillNames.indexOf('Audit Helper 1')).toBeLessThan(skillNames.indexOf('Story Brief'));
    expect(skillNames.indexOf('Audit Helper 9')).toBeLessThan(skillNames.indexOf('Accessibility Review'));
  });

  it('applies a plugin from @ search and keeps the plugin token inline', async () => {
    renderComposer();
    await flushMounts();

    await typeAndSettle('@export');

    await waitFor(() => expect(screen.getByText('My Export')).toBeTruthy());
    fireEvent.click(screen.getByText('My Export'));

    await waitFor(() => expect(composerText()).toBe('@My Export '));
    const pill = screen
      .getByTestId('chat-composer-input')
      .querySelector('.composer-inline-mention');
    expect(pill?.textContent).toBe('@My Export');
    expect(pill?.getAttribute('data-mention-kind')).toBe('plugin');
  });

  it('clears the inline plugin context when the plugin token is removed', async () => {
    renderComposer();
    await flushMounts();

    await typeAndSettle('@export');

    await waitFor(() => expect(screen.getByText('My Export')).toBeTruthy());
    fireEvent.click(screen.getByText('My Export'));

    await waitFor(() => expect(composerText()).toBe('@My Export '));
    await waitFor(() => expect(stagedPluginChip()?.textContent).toContain(USER_PLUGIN.id));

    await typeAndSettle('');

    await waitFor(() => expect(stagedPluginChip()).toBeNull());
  });

  it('clears restored inline plugin context when the queued draft token is removed', async () => {
    const onSend = vi.fn();
    const composerRef = createRef<ChatComposerHandle>();
    const restoredAppliedPlugin = APPLY_RESULT.appliedPlugin as AppliedPluginSnapshot;
    render(<ChatComposer ref={composerRef} {...composerElement({ onSend }).props} />);
    await flushMounts();

    act(() => {
      composerRef.current?.restoreDraft({
        text: '@My Export queued work',
        meta: {
          appliedPluginSnapshot: restoredAppliedPlugin,
          appliedPluginSnapshotId: restoredAppliedPlugin.snapshotId,
          inlineAppliedPlugin: {
            pluginId: USER_PLUGIN.id,
            label: USER_PLUGIN.title,
          },
          context: { pluginIds: [USER_PLUGIN.id] },
        },
      });
    });

    await waitFor(() => expect(composerText()).toBe('@My Export queued work'));

    await typeAndSettle('queued work');
    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[3]?.context?.pluginIds).toBeUndefined();
    expect(onSend.mock.calls[0]?.[3]?.appliedPluginSnapshot).toBeUndefined();
  });

  it('keeps restored non-inline plugin context when matching prompt text is removed', async () => {
    const onSend = vi.fn();
    const composerRef = createRef<ChatComposerHandle>();
    const restoredAppliedPlugin = APPLY_RESULT.appliedPlugin as AppliedPluginSnapshot;
    render(<ChatComposer ref={composerRef} {...composerElement({ onSend }).props} />);
    await flushMounts();

    act(() => {
      composerRef.current?.restoreDraft({
        text: '@My Export queued work',
        meta: {
          appliedPluginSnapshot: restoredAppliedPlugin,
          appliedPluginSnapshotId: restoredAppliedPlugin.snapshotId,
          context: { pluginIds: [USER_PLUGIN.id] },
        },
      });
    });

    await waitFor(() => expect(composerText()).toBe('@My Export queued work'));

    await typeAndSettle('queued work');
    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[3]).toMatchObject({
      appliedPluginSnapshotId: restoredAppliedPlugin.snapshotId,
      appliedPluginSnapshot: expect.objectContaining({
        pluginId: USER_PLUGIN.id,
      }),
      context: { pluginIds: [USER_PLUGIN.id] },
    });
  });

  it('keeps the inline plugin context when the plugin token has trailing punctuation', async () => {
    renderComposer();
    await flushMounts();

    await typeAndSettle('@export');

    await waitFor(() => expect(screen.getByText('My Export')).toBeTruthy());
    fireEvent.click(screen.getByText('My Export'));

    await waitFor(() => expect(composerText()).toBe('@My Export '));
    await waitFor(() => expect(stagedPluginChip()?.textContent).toContain(USER_PLUGIN.id));

    await typeAndSettle('@My Export, refine this export');

    await waitFor(() => expect(composerText()).toBe('@My Export, refine this export'));
    expect(stagedPluginChip()?.textContent).toContain(USER_PLUGIN.id);
  });

  it('sends the applied plugin snapshot as per-turn context', async () => {
    const onSend = vi.fn();
    renderComposer({ onSend });
    await flushMounts();

    await typeAndSettle('@export');

    await waitFor(() => expect(screen.getByText('My Export')).toBeTruthy());
    fireEvent.click(screen.getByText('My Export'));

    await waitFor(() => expect(composerText()).toBe('@My Export '));
    // The applied-plugin chip now rides the shared staged-context row as a
    // `.staged-context--plugin` chip (rendered by the host, not PluginsSection's
    // own ContextChipStrip). It is keyed off the plugin id when no display title
    // is present in the applied snapshot.
    await waitFor(() => {
      expect(stagedPluginChip()?.textContent).toContain(USER_PLUGIN.id);
    });

    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    const meta = onSend.mock.calls[0]?.[3];
    expect(meta).toMatchObject({
      appliedPluginSnapshotId: 'snap-1',
      appliedPluginSnapshot: expect.objectContaining({
        snapshotId: 'snap-1',
        pluginId: USER_PLUGIN.id,
      }),
      context: { pluginIds: [USER_PLUGIN.id] },
    });
    // After sending, the applied plugin clears, so its staged chip is gone.
    await waitFor(() => {
      expect(stagedPluginChip()).toBeNull();
    });
  });

  it('removes the inline design file token when its staged chip is removed', async () => {
    renderComposer({
      projectFiles: [
        {
          path: 'designs/landing.html',
          name: 'landing.html',
          kind: 'html',
          mime: 'text/html',
          mtime: 1,
          size: 128,
        },
      ],
    });
    await flushMounts();

    await typeAndSettle('Use @landing');

    await waitFor(() => expect(screen.getByText('designs/landing.html')).toBeTruthy());
    fireEvent.click(screen.getByText('designs/landing.html'));

    await waitFor(() => expect(composerText()).toBe('Use @designs/landing.html '));
    expect(screen.getByTestId('staged-contexts').textContent).toContain('landing.html');

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove landing.html'));
      await Promise.resolve();
    });

    await waitFor(() => expect(composerText()).toBe('Use '));
    expect(screen.queryByTestId('staged-contexts')).toBeNull();
  });

  it('preserves surrounding draft formatting when removing a design file token', async () => {
    renderComposer({
      projectFiles: [
        {
          path: 'designs/landing.html',
          name: 'landing.html',
          kind: 'html',
          mime: 'text/html',
          mtime: 1,
          size: 128,
        },
      ],
    });
    await flushMounts();

    // Open the @ picker mid-draft and pick the file — that stages the
    // attachment AND inserts the atomic pill (typing alone never stages). The
    // surrounding `\n\n` runs are preserved as LineBreakNodes.
    await typeAndSettle('Plan:\n\n@landing');

    await waitFor(() => expect(screen.getByText('designs/landing.html')).toBeTruthy());
    fireEvent.click(screen.getByText('designs/landing.html'));

    await waitFor(() =>
      expect(composerText()).toBe('Plan:\n\n@designs/landing.html '),
    );
    expect(screen.getByTestId('staged-contexts').textContent).toContain('landing.html');

    // The user keeps typing after the trailing space; re-seed the full draft to
    // capture that, then remove the staged chip.
    await typeAndSettle('Plan:\n\n@designs/landing.html \n\nKeep spacing');
    await waitFor(() =>
      expect(composerText()).toBe('Plan:\n\n@designs/landing.html \n\nKeep spacing'),
    );

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove landing.html'));
      await Promise.resolve();
    });

    await waitFor(() => expect(composerText()).toBe('Plan:\n\n\n\nKeep spacing'));
    expect(screen.queryByTestId('staged-contexts')).toBeNull();
  });

  it('removes a design file token when punctuation follows it', async () => {
    renderComposer({
      projectFiles: [
        {
          path: 'designs/landing.html',
          name: 'landing.html',
          kind: 'html',
          mime: 'text/html',
          mtime: 1,
          size: 128,
        },
      ],
    });
    await flushMounts();

    await typeAndSettle('Use @landing');

    await waitFor(() => expect(screen.getByText('designs/landing.html')).toBeTruthy());
    fireEvent.click(screen.getByText('designs/landing.html'));
    await waitFor(() => expect(composerText()).toBe('Use @designs/landing.html '));

    await typeAndSettle('Use @designs/landing.html, please');

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove landing.html'));
      await Promise.resolve();
    });

    await waitFor(() => expect(composerText()).toBe('Use , please'));
    expect(screen.queryByTestId('staged-contexts')).toBeNull();
  });

  it('removes a quoted design file token when its chip is removed', async () => {
    renderComposer({
      projectFiles: [
        {
          path: 'designs/landing.html',
          name: 'landing.html',
          kind: 'html',
          mime: 'text/html',
          mtime: 1,
          size: 128,
        },
      ],
    });
    await flushMounts();

    await typeAndSettle('@landing');

    await waitFor(() => expect(screen.getByText('designs/landing.html')).toBeTruthy());
    fireEvent.click(screen.getByText('designs/landing.html'));
    await waitFor(() => expect(composerText()).toBe('@designs/landing.html '));

    await typeAndSettle('"@designs/landing.html"');

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove landing.html'));
      await Promise.resolve();
    });

    await waitFor(() => expect(composerText()).toBe('""'));
    expect(screen.queryByTestId('staged-contexts')).toBeNull();
  });

  it('clears an attachment upload error after a later retry succeeds', async () => {
    let uploadAttempts = 0;
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers, templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/skills') {
        return new Response(JSON.stringify({ skills }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects/project-1/upload' && init?.method === 'POST') {
        uploadAttempts += 1;
        if (uploadAttempts === 1) {
          return new Response(JSON.stringify({ error: 'storage offline' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          files: [{ name: 'recovered.txt', path: 'uploads/recovered.txt', size: 24 }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderComposer();
    const input = screen.getByTestId('chat-file-input') as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [new File(['first failure'], 'failed.txt', { type: 'text/plain' })],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Attachment upload failed for 1 file(s) (storage offline).')).toBeTruthy();
    });
    expect(screen.queryByTestId('staged-contexts')).toBeNull();

    fireEvent.change(input, {
      target: {
        files: [new File(['retry works'], 'recovered.txt', { type: 'text/plain' })],
      },
    });

    await waitFor(() => {
      expect(screen.queryByText('Attachment upload failed for 1 file(s) (storage offline).')).toBeNull();
    });
    expect(screen.getByTestId('staged-contexts').textContent).toContain('recovered.txt');
  });

  // The sliders "tools" popover (Official / My plugins switch, plugin search)
  // and the standalone "@" mention trigger button were removed from the
  // composer; plugins/skills/MCP are now reached via typed @-mentions and the
  // "+" menu, so their dedicated click-tracking coverage moved out with them.

  // The inline pet popover (the "Pets — wake, tuck, or pick one" button and
  // its `.composer-pet-menu` flyout) was removed from ChatComposer; only the
  // pet props survive to drive `/pet` slash handling. Assert the entry stays
  // gone even when every pet handler is wired.
  it('does not render the pet composer entry when pet handlers are wired', () => {
    renderComposer({
      petConfig: {
        adopted: false,
        enabled: false,
        petId: 'custom',
        custom: {
          name: 'Buddy',
          glyph: '🐾',
          accent: '#7c3aed',
          greeting: 'hi',
        },
      },
      onAdoptPet: vi.fn(),
      onTogglePet: vi.fn(),
      onOpenPetSettings: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: 'Pets — wake, tuck, or pick one' })).toBeNull();
    expect(screen.queryByText('Buddy')).toBeNull();
  });
});
