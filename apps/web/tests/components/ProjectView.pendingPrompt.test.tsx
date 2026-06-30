// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { Brand } from '@open-design/contracts';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import { BROWSER_PAGE_ARCHIVE_SCHEMA } from '../../src/components/design-browser-tools';
import type {
  AgentInfo,
  AppConfig,
  ChatMessage,
  Conversation,
  DesignSystemSummary,
  Project,
  SkillSummary,
} from '../../src/types';
import {
  createConversation,
  listConversations,
  listMessages,
  saveMessage,
} from '../../src/state/projects';
import { fetchPreviewComments } from '../../src/providers/registry';
import {
  cancelBrandExtraction,
  continueBrandExtraction,
  extractBrandFromHtml,
  fetchBrands,
} from '../../src/runtime/brands';

const brandBrowserBridgeMocks = vi.hoisted(() => ({
  getBrandBrowser: vi.fn(),
}));

const fileWorkspaceSpy = vi.hoisted(() => vi.fn());
const chatPaneSpy = vi.hoisted(() => vi.fn());

type MockChatPaneProps = {
  messages?: ChatMessage[];
  activeConversationId?: string | null;
  initialDraft?: string;
  onBrandBrowserAssistConfirm?: (card: {
    kind: 'brand-browser-assist';
    brandId: string;
    browserTabId?: string;
    url?: string;
    reason?: string;
  }) => Promise<{ ok: boolean; action?: 'opened' | 'confirmed'; message?: string } | void>;
  onContinueBrandExtraction?: () => void;
  continueBrandExtractionBusy?: boolean;
  onContinueBrandAgentExtraction?: () => void;
  continueBrandAgentExtractionBusy?: boolean;
};

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: (key: string) => key,
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
  listProjectRuns: vi.fn().mockResolvedValue([]),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: vi.fn(),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/runtime/brands', async () => {
  const actual = await vi.importActual<typeof import('../../src/runtime/brands')>(
    '../../src/runtime/brands',
  );
  return {
    ...actual,
    cancelBrandExtraction: vi.fn().mockResolvedValue({ ok: true, status: 'failed' }),
    continueBrandExtraction: vi.fn().mockResolvedValue({
      ok: true,
      result: {
        id: 'brand-retry',
        projectId: 'brand-retry',
        conversationId: 'conv-brand-retry',
        sourceUrl: 'https://economist.com/',
        status: 'extracting',
        designSystemId: 'user:brand-retry',
      },
    }),
    extractBrandFromHtml: vi.fn().mockResolvedValue({
      ok: true,
      result: {
        id: 'brand-retry',
        brand: null,
        designSystemId: 'user:brand-retry',
        projectId: 'brand-retry',
        files: [],
      },
    }),
    fetchBrands: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('../../src/runtime/brand-browser-bridge', () => ({
  BRAND_BROWSER_TAB_ID: '__browser__:1',
  getBrandBrowser: brandBrowserBridgeMocks.getBrandBrowser,
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
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    listMessages: vi.fn(),
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
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: (props: {
    openRequest?: { name: string } | null;
    browserOpenRequest?: { tabId?: string; url: string; nonce: number } | null;
    onBrandExtractionStopRequest?: () => void;
    designSystemEditable?: boolean;
    filesRefreshKey?: number;
  }) => {
    fileWorkspaceSpy(props);
    return <div data-testid="file-workspace" />;
  },
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: (props: MockChatPaneProps) => {
    chatPaneSpy(props);
    return (
      <>
        <div data-testid="active-conversation">{props.activeConversationId ?? ''}</div>
        <div data-testid="chat-message-content">
          {props.messages?.map((message) => message.content).join('\n') ?? ''}
        </div>
        <textarea
          data-testid="chat-composer-input"
          readOnly
          value={props.initialDraft ?? ''}
        />
      </>
    );
  },
}));

const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedCancelBrandExtraction = vi.mocked(cancelBrandExtraction);
const mockedContinueBrandExtraction = vi.mocked(continueBrandExtraction);
const mockedExtractBrandFromHtml = vi.mocked(extractBrandFromHtml);
const mockedFetchBrands = vi.mocked(fetchBrands);
const mockedSaveMessage = vi.mocked(saveMessage);

const config: AppConfig = {
  mode: 'api',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

const project = (id: string, pendingPrompt?: string): Project => ({
  id,
  name: `Project ${id}`,
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  ...(pendingPrompt ? { pendingPrompt } : {}),
});

const conversation = (projectId: string): Conversation => ({
  id: `conv-${projectId}`,
  projectId,
  title: null,
  createdAt: 1,
  updatedAt: 1,
});

function renderProjectView(
  currentProject: Project,
  onClearPendingPrompt = vi.fn(),
  overrides: Partial<ComponentProps<typeof ProjectView>> = {},
) {
  return render(
    <ProjectView
      project={currentProject}
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
      onClearPendingPrompt={onClearPendingPrompt}
      onTouchProject={vi.fn()}
      onProjectChange={vi.fn()}
      onProjectsRefresh={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ProjectView pending prompt seeding', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    mockedListConversations.mockImplementation(async (projectId) => [
      conversation(projectId),
    ]);
    mockedCreateConversation.mockImplementation(async (projectId) =>
      conversation(projectId),
    );
    mockedListMessages.mockResolvedValue([]);
    mockedFetchPreviewComments.mockResolvedValue([]);
    mockedFetchBrands.mockResolvedValue([]);
    brandBrowserBridgeMocks.getBrandBrowser.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('prefills chat once when the project has a pending prompt and requests persistence clear', async () => {
    const onClearPendingPrompt = vi.fn();
    renderProjectView(project('with-prompt', 'Use this prompt'), onClearPendingPrompt);

    await waitFor(() => {
      expect(composerValue()).toBe('Use this prompt');
    });
    expect(onClearPendingPrompt).toHaveBeenCalledTimes(1);
  });

  it('does not prefill when re-entering a project after the pending prompt was cleared', async () => {
    renderProjectView(project('cleared'));

    await waitFor(() => {
      expect(composerValue()).toBe('');
    });
  });

  it('refreshes design systems when a brand project references a missing backing system', async () => {
    const onDesignSystemsRefresh = vi.fn();
    renderProjectView(
      {
        ...project('brand-draft'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-draft',
          brandDesignSystemId: 'user:brand-draft',
        },
      },
      vi.fn(),
      { onDesignSystemsRefresh },
    );

    await waitFor(() => expect(onDesignSystemsRefresh).toHaveBeenCalledTimes(1));
  });

  it('auto-opens a draft design system tab before the registry summary refreshes', async () => {
    renderProjectView(
      {
        ...project('brand-draft-open'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-draft-open',
          brandSourceUrl: 'https://nexu.io/',
          brandDesignSystemId: 'user:brand-draft-open',
        },
      },
    );

    await waitFor(() => {
      expect(
        fileWorkspaceSpy.mock.calls.some(([props]) =>
          props.openRequest?.name === '__design_system__',
        ),
      ).toBe(true);
    });
  });

  it('auto-opens the design system tab once a brand extraction backing system is available', async () => {
    renderProjectView(
      {
        ...project('brand-ready'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-ready',
          brandDesignSystemId: 'user:brand-ready',
        },
      },
      vi.fn(),
      {
        designSystems: [
          {
            id: 'user:brand-ready',
            title: 'Brand Ready',
            category: 'Brands',
            summary: '',
            swatches: [],
            surface: 'web',
            body: '# Brand Ready',
            source: 'user',
            status: 'draft',
            isEditable: true,
          } as DesignSystemSummary,
        ],
      },
    );

    await waitFor(() => {
      expect(
        fileWorkspaceSpy.mock.calls.some(([props]) =>
          props.openRequest?.name === '__design_system__',
        ),
      ).toBe(true);
    });
  });

  it('stops a programmatic brand extraction and returns to the draft design system tab', async () => {
    const onDesignSystemsRefresh = vi.fn();
    const onProjectsRefresh = vi.fn();
    renderProjectView(
      {
        ...project('brand-stop'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-stop',
          brandSourceUrl: 'https://nexu.io/',
          brandDesignSystemId: 'user:brand-stop',
        },
      },
      vi.fn(),
      { onDesignSystemsRefresh, onProjectsRefresh },
    );

    await waitFor(() => {
      expect(fileWorkspaceSpy.mock.calls.at(-1)?.[0].onBrandExtractionStopRequest).toBeTypeOf('function');
    });
    expect(fileWorkspaceSpy.mock.calls.at(-1)?.[0].designSystemEditable).toBe(false);
    fileWorkspaceSpy.mock.calls.at(-1)?.[0].onBrandExtractionStopRequest?.();

    await waitFor(() => expect(mockedCancelBrandExtraction).toHaveBeenCalledWith('brand-stop'));
    await waitFor(() => expect(onDesignSystemsRefresh).toHaveBeenCalled());
    await waitFor(() => {
      expect(
        fileWorkspaceSpy.mock.calls.some(([props]) =>
          props.openRequest?.name === '__design_system__',
        ),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(
        fileWorkspaceSpy.mock.calls.some(([props]) =>
          props.designSystemEditable === true && props.openRequest?.name === '__design_system__',
        ),
      ).toBe(true);
    });
  });

  it('continues a programmatic brand extraction from the next-step action', async () => {
    const onDesignSystemsRefresh = vi.fn();
    const onProjectsRefresh = vi.fn();
    renderProjectView(
      {
        ...project('brand-retry'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-retry',
          brandSourceUrl: 'https://economist.com/',
          brandDesignSystemId: 'user:brand-retry',
        },
      },
      vi.fn(),
      { onDesignSystemsRefresh, onProjectsRefresh },
    );

    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction).toBeTypeOf('function');
    });
    chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction?.();

    await waitFor(() => expect(mockedContinueBrandExtraction).toHaveBeenCalledWith('brand-retry'));
    await waitFor(() => expect(onDesignSystemsRefresh).toHaveBeenCalled());
    await waitFor(() => expect(onProjectsRefresh).toHaveBeenCalled());
    await waitFor(() => {
      expect(
        fileWorkspaceSpy.mock.calls.some(([props]) =>
          props.openRequest?.name === 'brand.html',
        ),
      ).toBe(true);
    });
  });

  it('switches to the replacement conversation returned by a brand extraction retry', async () => {
    const projectId = 'brand-retry-missing';
    const replacementConversation = {
      ...conversation(projectId),
      id: 'conv-brand-replacement',
      title: 'Brand retry',
    };
    mockedListConversations
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([replacementConversation]);
    mockedCreateConversation.mockResolvedValueOnce({
      ...conversation(projectId),
      id: 'conv-brand-empty',
      title: 'Empty fallback',
    });
    mockedListMessages.mockImplementation(async (_projectId, conversationId) => {
      if (conversationId === 'conv-brand-replacement') {
        return [
          {
            id: 'replacement-transcript',
            role: 'assistant',
            content: 'Replacement retry transcript loaded',
            createdAt: 3,
          },
        ];
      }
      return [];
    });
    mockedContinueBrandExtraction.mockResolvedValueOnce({
      ok: true,
      result: {
        id: projectId,
        projectId,
        conversationId: 'conv-brand-replacement',
        sourceUrl: 'https://economist.com/',
        status: 'extracting',
        designSystemId: `user:${projectId}`,
      },
    });

    renderProjectView(
      {
        ...project(projectId),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: projectId,
          brandSourceUrl: 'https://economist.com/',
          brandDesignSystemId: `user:${projectId}`,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-conversation').textContent).toBe('conv-brand-empty');
    });
    chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction?.();

    await waitFor(() => {
      expect(mockedContinueBrandExtraction).toHaveBeenCalledWith(projectId);
    });
    await waitFor(() => {
      expect(mockedListMessages).toHaveBeenCalledWith(projectId, 'conv-brand-replacement');
    });
    await waitFor(() => {
      expect(screen.getByTestId('active-conversation').textContent).toBe('conv-brand-replacement');
    });
    await waitFor(() => {
      expect(screen.getByTestId('chat-message-content').textContent).toContain(
        'Replacement retry transcript loaded',
      );
    });
  });

  it('opens the browser assist tab from the assist card action without extracting yet', async () => {
    renderProjectView(
      {
        ...project('brand-open'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-open',
          brandSourceUrl: 'https://economist.com/',
          brandDesignSystemId: 'user:brand-open',
        },
      },
    );

    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].onBrandBrowserAssistConfirm).toBeTypeOf('function');
    });
    const result = await chatPaneSpy.mock.calls.at(-1)?.[0].onBrandBrowserAssistConfirm?.({
      kind: 'brand-browser-assist',
      brandId: 'brand-open',
      browserTabId: '__browser__:1',
      url: 'https://economist.com/',
      reason: 'Cloudflare',
    });

    expect(result).toEqual({ ok: true, action: 'opened' });
    expect(mockedExtractBrandFromHtml).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        fileWorkspaceSpy.mock.calls.some(([props]) =>
          props.browserOpenRequest?.tabId === '__browser__:1' &&
          props.browserOpenRequest.url === 'https://economist.com/',
        ),
      ).toBe(true);
    });
  });

  it('continues a blocked brand extraction from the unblocked Browser tab DOM when available', async () => {
    const onDesignSystemsRefresh = vi.fn();
    const onProjectsRefresh = vi.fn();
    const executeJavaScript = vi.fn()
      .mockResolvedValueOnce('<html><head><title>Economist</title></head><body><h1>Economist</h1></body></html>')
      .mockResolvedValueOnce('body { color: #111111; background: #ffffff; }');
    brandBrowserBridgeMocks.getBrandBrowser.mockReturnValue({
      isDesktopWebview: true,
      getURL: () => 'https://economist.com/',
      executeJavaScript,
    });

    renderProjectView(
      {
        ...project('brand-retry'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-retry',
          brandSourceUrl: 'https://economist.com/',
          brandDesignSystemId: 'user:brand-retry',
        },
      },
      vi.fn(),
      { onDesignSystemsRefresh, onProjectsRefresh },
    );

    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction).toBeTypeOf('function');
    });
    chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction?.();

    await waitFor(() => {
      expect(mockedExtractBrandFromHtml).toHaveBeenCalledWith('brand-retry', {
        html: '<html><head><title>Economist</title></head><body><h1>Economist</h1></body></html>',
        css: 'body { color: #111111; background: #ffffff; }',
        baseUrl: 'https://economist.com/',
      });
    });
    expect(mockedContinueBrandExtraction).toHaveBeenCalledWith('brand-retry');
    await waitFor(() => expect(onDesignSystemsRefresh).toHaveBeenCalled());
    await waitFor(() => expect(onProjectsRefresh).toHaveBeenCalled());
    await waitFor(() => {
      expect(
        fileWorkspaceSpy.mock.calls.some(([props]) =>
          props.openRequest?.name === 'brand.html',
        ),
      ).toBe(true);
    });
  });

  it('continues to the current Browser tab when a saved page archive is stale', async () => {
    const onDesignSystemsRefresh = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/raw/browser/latest-page-snapshot.json')) {
        return new Response(JSON.stringify({
          schema: BROWSER_PAGE_ARCHIVE_SCHEMA,
          capturedAt: 123,
          title: 'Stale wall',
          url: 'https://economist.com/',
          baseUrl: 'https://economist.com/',
          htmlFile: 'browser/page-archive/stale.html',
          cssFile: 'browser/page-archive/stale.css',
          manifestFile: 'browser/latest-page-snapshot.json',
          resources: [],
        }), { status: 200 });
      }
      if (url.includes('/raw/browser/page-archive/stale.html')) {
        return new Response('<html><body>Human verification required</body></html>', { status: 200 });
      }
      if (url.includes('/raw/browser/page-archive/stale.css')) {
        return new Response('body { color: #888888; }', { status: 200 });
      }
      return new Response('', { status: 404 });
    });
    mockedExtractBrandFromHtml
      .mockResolvedValueOnce({
        ok: false,
        error: 'Programmatic extraction blocked by Cloudflare.',
      })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          id: 'brand-retry',
          brand: {
            name: 'Economist',
            tagline: '',
            description: '',
            sourceUrl: 'https://economist.com/',
            logo: { primary: null, alternates: [], notes: '' },
            colors: [],
            typography: {
              display: { family: 'serif', fallbacks: [], weights: [400] },
              body: { family: 'serif', fallbacks: [], weights: [400] },
            },
            voice: {
              adjectives: [],
              tone: '',
              messagingPillars: [],
              vocabulary: { use: [], avoid: [] },
            },
            imagery: { style: '', subjects: [], treatment: '', avoid: [] },
            layout: { radius: '0', borderWeight: '1px', spacing: 'normal', postureRules: [] },
          } satisfies Brand,
          designSystemId: 'user:brand-retry',
          projectId: 'brand-retry',
          files: [],
        },
      });
    const executeJavaScript = vi.fn()
      .mockResolvedValueOnce('<html><head><title>Economist</title></head><body><h1>Current page</h1></body></html>')
      .mockResolvedValueOnce('body { color: #111111; background: #ffffff; }');
    brandBrowserBridgeMocks.getBrandBrowser.mockReturnValue({
      isDesktopWebview: true,
      getURL: () => 'https://economist.com/',
      executeJavaScript,
    });

    renderProjectView(
      {
        ...project('brand-retry'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-retry',
          brandSourceUrl: 'https://economist.com/',
          brandDesignSystemId: 'user:brand-retry',
        },
      },
      vi.fn(),
      { onDesignSystemsRefresh },
    );

    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction).toBeTypeOf('function');
    });
    chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction?.();

    await waitFor(() => {
      expect(mockedExtractBrandFromHtml).toHaveBeenCalledTimes(2);
    });
    expect(mockedExtractBrandFromHtml).toHaveBeenNthCalledWith(1, 'brand-retry', {
      html: '<html><body>Human verification required</body></html>',
      css: 'body { color: #888888; }',
      baseUrl: 'https://economist.com/',
    });
    expect(mockedExtractBrandFromHtml).toHaveBeenNthCalledWith(2, 'brand-retry', {
      html: '<html><head><title>Economist</title></head><body><h1>Current page</h1></body></html>',
      css: 'body { color: #111111; background: #ffffff; }',
      baseUrl: 'https://economist.com/',
    });
    expect(mockedContinueBrandExtraction).toHaveBeenCalledWith('brand-retry');
    await waitFor(() => expect(onDesignSystemsRefresh).toHaveBeenCalled());
    fetchSpy.mockRestore();
  });

  it('continues browser DOM extraction after a www redirect from the source URL', async () => {
    const executeJavaScript = vi.fn()
      .mockResolvedValueOnce('<html><head><title>The Economist</title></head><body><h1>The Economist</h1></body></html>')
      .mockResolvedValueOnce('body { color: #e3120b; background: #ffffff; }');
    brandBrowserBridgeMocks.getBrandBrowser.mockReturnValue({
      isDesktopWebview: true,
      getURL: () => 'https://www.economist.com/',
      executeJavaScript,
    });

    renderProjectView(
      {
        ...project('brand-retry'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-retry',
          brandSourceUrl: 'https://economist.com/',
          brandDesignSystemId: 'user:brand-retry',
        },
      },
    );

    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction).toBeTypeOf('function');
    });
    chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction?.();

    await waitFor(() => {
      expect(mockedExtractBrandFromHtml).toHaveBeenCalledWith('brand-retry', {
        html: '<html><head><title>The Economist</title></head><body><h1>The Economist</h1></body></html>',
        css: 'body { color: #e3120b; background: #ffffff; }',
        baseUrl: 'https://www.economist.com/',
      });
    });
    expect(mockedContinueBrandExtraction).toHaveBeenCalledWith('brand-retry');
  });

  it('continues browser DOM extraction after a same-site locale redirect from the source URL', async () => {
    const executeJavaScript = vi.fn()
      .mockResolvedValueOnce('<html><head><title>Example</title></head><body><h1>Example</h1></body></html>')
      .mockResolvedValueOnce('body { color: #1f2937; background: #ffffff; }');
    brandBrowserBridgeMocks.getBrandBrowser.mockReturnValue({
      isDesktopWebview: true,
      getURL: () => 'https://example.com/en/',
      executeJavaScript,
    });

    renderProjectView(
      {
        ...project('brand-retry'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-retry',
          brandSourceUrl: 'https://example.com/',
          brandDesignSystemId: 'user:brand-retry',
        },
      },
    );

    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction).toBeTypeOf('function');
    });
    chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction?.();

    await waitFor(() => {
      expect(mockedExtractBrandFromHtml).toHaveBeenCalledWith('brand-retry', {
        html: '<html><head><title>Example</title></head><body><h1>Example</h1></body></html>',
        css: 'body { color: #1f2937; background: #ffffff; }',
        baseUrl: 'https://example.com/en/',
      });
    });
    expect(mockedContinueBrandExtraction).toHaveBeenCalledWith('brand-retry');
  });

  it('falls back to programmatic retry when the Browser tab is on another origin', async () => {
    const executeJavaScript = vi.fn()
      .mockResolvedValueOnce('<html><head><title>Wrong</title></head><body><h1>Wrong</h1></body></html>')
      .mockResolvedValueOnce('body { color: #111111; background: #ffffff; }');
    brandBrowserBridgeMocks.getBrandBrowser.mockReturnValue({
      isDesktopWebview: true,
      getURL: () => 'https://wrong.example/',
      executeJavaScript,
    });

    renderProjectView(
      {
        ...project('brand-retry'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-retry',
          brandSourceUrl: 'https://economist.com/',
          brandDesignSystemId: 'user:brand-retry',
        },
      },
    );

    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction).toBeTypeOf('function');
    });
    chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction?.();

    await waitFor(() => expect(mockedContinueBrandExtraction).toHaveBeenCalledWith('brand-retry'));
    expect(mockedExtractBrandFromHtml).not.toHaveBeenCalled();
  });

  it('falls back to programmatic retry when the Browser tab is same-origin but off-path', async () => {
    const executeJavaScript = vi.fn()
      .mockResolvedValueOnce('<html><head><title>Login</title></head><body><h1>Login</h1></body></html>')
      .mockResolvedValueOnce('body { color: #111111; background: #ffffff; }');
    brandBrowserBridgeMocks.getBrandBrowser.mockReturnValue({
      isDesktopWebview: true,
      getURL: () => 'https://economist.com/login?next=/',
      executeJavaScript,
    });

    renderProjectView(
      {
        ...project('brand-retry'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-retry',
          brandSourceUrl: 'https://economist.com/',
          brandDesignSystemId: 'user:brand-retry',
        },
      },
    );

    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction).toBeTypeOf('function');
    });
    chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction?.();

    await waitFor(() => expect(mockedContinueBrandExtraction).toHaveBeenCalledWith('brand-retry'));
    expect(mockedExtractBrandFromHtml).not.toHaveBeenCalled();
  });

  it('falls back to programmatic retry when the Browser tab DOM read fails', async () => {
    const executeJavaScript = vi.fn().mockRejectedValueOnce(new Error('bridge timed out'));
    brandBrowserBridgeMocks.getBrandBrowser.mockReturnValue({
      isDesktopWebview: true,
      getURL: () => 'https://economist.com/',
      executeJavaScript,
    });

    renderProjectView(
      {
        ...project('brand-retry'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-retry',
          brandSourceUrl: 'https://economist.com/',
          brandDesignSystemId: 'user:brand-retry',
        },
      },
    );

    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction).toBeTypeOf('function');
    });
    chatPaneSpy.mock.calls.at(-1)?.[0].onContinueBrandExtraction?.();

    await waitFor(() => expect(mockedContinueBrandExtraction).toHaveBeenCalledWith('brand-retry'));
    expect(mockedExtractBrandFromHtml).not.toHaveBeenCalled();
  });

  it('does not duplicate a persisted browser-assist card already in the conversation', async () => {
    mockedFetchBrands.mockResolvedValue([
      {
        meta: {
          id: 'brand-blocked',
          sourceUrl: 'https://economist.com/',
          createdAt: 1,
          updatedAt: 2,
          status: 'failed',
          blocked: true,
          blockedReason: 'Cloudflare',
          designSystemId: 'user:brand-blocked',
        },
        brand: null,
      },
    ]);
    mockedListMessages.mockResolvedValueOnce([
      {
        id: 'existing-assist',
        role: 'assistant',
        content:
          'chat.brandBrowserAssistMessage\n\n<od-card type="brand-browser-assist">{"brandId":"brand-blocked","browserTabId":"__browser__:1","url":"https://economist.com/","reason":"Cloudflare"}</od-card>',
        createdAt: 2,
      },
    ]);

    renderProjectView(
      {
        ...project('brand-blocked'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-blocked',
          brandSourceUrl: 'https://economist.com/',
          brandDesignSystemId: 'user:brand-blocked',
        },
      },
    );

    await waitFor(() => expect(mockedFetchBrands).toHaveBeenCalled());
    await Promise.resolve();
    await Promise.resolve();

    expect(
      mockedSaveMessage.mock.calls.some((call) =>
        String(call[2]?.content ?? '').includes('<od-card type="brand-browser-assist"'),
      ),
    ).toBe(false);
  });

  it('lets a terminal failed poll supersede a local retry status override', async () => {
    mockedFetchBrands.mockResolvedValue([
      {
        meta: {
          id: 'brand-retry',
          sourceUrl: 'https://economist.com/',
          createdAt: 1,
          updatedAt: 2,
          status: 'failed',
          designSystemId: 'user:brand-retry',
        },
        brand: null,
      },
    ]);

    renderProjectView(
      {
        ...project('brand-retry'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-retry',
          brandSourceUrl: 'https://economist.com/',
          brandDesignSystemId: 'user:brand-retry',
        },
      },
    );

    await waitFor(() => {
      expect(fileWorkspaceSpy.mock.calls.at(-1)?.[0].designSystemEditable).toBe(true);
    });
    const callsBeforeContinue = fileWorkspaceSpy.mock.calls.length;

    latestChatPaneProps().onContinueBrandExtraction?.();

    await waitFor(() => expect(mockedContinueBrandExtraction).toHaveBeenCalledWith('brand-retry'));
    await waitFor(() => {
      const callsAfterContinue = fileWorkspaceSpy.mock.calls.slice(callsBeforeContinue);
      expect(callsAfterContinue.some(([props]) => props.designSystemEditable === false)).toBe(true);
      expect(fileWorkspaceSpy.mock.calls.at(-1)?.[0].designSystemEditable).toBe(true);
    });
  });

  it('dedupes rapid programmatic brand continuation before the busy rerender lands', async () => {
    let resolveContinue:
      | ((value: Awaited<ReturnType<typeof continueBrandExtraction>>) => void)
      | undefined;
    mockedContinueBrandExtraction.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveContinue = resolve;
      }),
    );

    renderProjectView(
      {
        ...project('brand-retry'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-retry',
          brandSourceUrl: 'https://economist.com/',
          brandDesignSystemId: 'user:brand-retry',
        },
      },
    );

    await waitFor(() => expect(latestChatPaneProps().onContinueBrandExtraction).toBeTruthy());
    const { onContinueBrandExtraction } = latestChatPaneProps();
    onContinueBrandExtraction?.();
    onContinueBrandExtraction?.();

    await waitFor(() => {
      expect(mockedContinueBrandExtraction).toHaveBeenCalledTimes(1);
      expect(latestChatPaneProps().continueBrandExtractionBusy).toBe(true);
    });

    resolveContinue?.({
      ok: true,
      result: {
        id: 'brand-retry',
        projectId: 'brand-retry',
        conversationId: 'conv-brand-retry',
        sourceUrl: 'https://economist.com/',
        status: 'extracting',
        designSystemId: 'user:brand-retry',
      },
    });

    await waitFor(() => {
      expect(latestChatPaneProps().continueBrandExtractionBusy).toBe(false);
    });
  });

  it('refreshes brand.html when the brand extraction reaches a failed terminal state', async () => {
    mockedFetchBrands.mockResolvedValue([
      {
        meta: {
          id: 'brand-failed',
          sourceUrl: 'https://economist.com/',
          createdAt: 1,
          updatedAt: 2,
          status: 'failed',
          designSystemId: 'user:brand-failed',
        },
        brand: null,
      },
    ]);

    renderProjectView(
      {
        ...project('brand-failed'),
        metadata: {
          kind: 'brand',
          importedFrom: 'brand-extraction',
          brandId: 'brand-failed',
          brandSourceUrl: 'https://economist.com/',
          brandDesignSystemId: 'user:brand-failed',
        },
      },
    );

    await waitFor(() => {
      expect(fileWorkspaceSpy.mock.calls.some(([props]) => (props.filesRefreshKey ?? 0) > 0)).toBe(true);
    });
  });

  it('does not leak a prior project prompt into a template project without one', async () => {
    const first = project('source', 'Old seed');
    const second = {
      ...project('template'),
      metadata: { kind: 'template' as const, templateId: 'tmpl-1' },
    };
    const view = renderProjectView(first);

    await waitFor(() => {
      expect(composerValue()).toBe('Old seed');
    });

    view.rerender(
      <ProjectView
        project={second}
        routeFileName={null}
        config={config}
        agents={[]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
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

    await waitFor(() => {
      expect(composerValue()).toBe('');
    });
  });
});

function composerValue(): string {
  return (screen.getByTestId('chat-composer-input') as HTMLTextAreaElement)
    .value;
}

function latestChatPaneProps(): MockChatPaneProps {
  const latest = chatPaneSpy.mock.calls.at(-1);
  if (!latest) throw new Error('ChatPane was not rendered');
  return latest[0] as MockChatPaneProps;
}
