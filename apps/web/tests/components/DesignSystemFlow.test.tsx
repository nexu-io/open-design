// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorDetail } from '@open-design/contracts';

import {
  buildDesignSystemPackageAuditRepairPrompt,
  summarizeDesignSystemPackageAudit,
} from '../../src/runtime/design-system-package-audit';
import {
  DesignSystemCreationFlow,
  DesignSystemDetailView,
} from '../../src/components/DesignSystemFlow';
import { CONNECTORS_CHANGED_EVENT } from '../../src/components/connectors-events';
import type { AppConfig, Conversation, DesignSystemDetail, DesignSystemSummary, Project, ProjectFile } from '../../src/types';
import { I18nProvider } from '../../src/i18n';

const mocks = vi.hoisted(() => ({
  connectConnector: vi.fn(),
  createDesignSystemDraft: vi.fn(),
  disconnectConnector: vi.fn(),
  ensureDesignSystemWorkspace: vi.fn(),
  fetchConnectorStatuses: vi.fn(),
  fetchDesignSystem: vi.fn(),
  fetchDesignSystemRevisions: vi.fn(),
  fetchProjectDesignSystemPackageAudit: vi.fn(),
  fetchProjectFiles: vi.fn(),
  getProject: vi.fn(),
  openFolderDialog: vi.fn(),
  patchProject: vi.fn(),
  createConversation: vi.fn(),
  listConversations: vi.fn(),
  listMessages: vi.fn(),
  loadTabs: vi.fn(),
  patchConversation: vi.fn(),
  saveMessage: vi.fn(),
  saveTabs: vi.fn(),
  streamViaDaemon: vi.fn(),
  uploadProjectFile: vi.fn(),
  writeProjectTextFile: vi.fn(),
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: ({
    error,
    initialDraft,
    onNewConversation,
    onSend,
  }: {
    error?: string | null;
    initialDraft?: string;
    onNewConversation?: () => void;
    onSend: (prompt: string, attachments: unknown[], commentAttachments: unknown[]) => void;
  }) => (
    <>
      {error ? <div role="alert">{error}</div> : null}
      {initialDraft ? <div data-testid="chat-initial-draft">{initialDraft}</div> : null}
      <button
        type="button"
        data-testid="new-conversation"
        onClick={() => onNewConversation?.()}
      >
        New
      </button>
      <button
        type="button"
        data-testid="design-system-chat-send"
        onClick={() => onSend('Update the design tokens', [], [])}
      >
        send
      </button>
    </>
  ),
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: () => <div data-testid="design-system-files" />,
}));

vi.mock('../../src/providers/daemon', () => ({
  streamViaDaemon: (...args: unknown[]) => mocks.streamViaDaemon(...args),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    connectConnector: mocks.connectConnector,
    createDesignSystemDraft: mocks.createDesignSystemDraft,
    disconnectConnector: mocks.disconnectConnector,
    ensureDesignSystemWorkspace: mocks.ensureDesignSystemWorkspace,
    fetchDesignSystem: mocks.fetchDesignSystem,
    fetchDesignSystemRevisions: mocks.fetchDesignSystemRevisions,
    fetchProjectDesignSystemPackageAudit: mocks.fetchProjectDesignSystemPackageAudit,
    fetchProjectFiles: mocks.fetchProjectFiles,
    fetchConnectorStatuses: mocks.fetchConnectorStatuses,
    openFolderDialog: mocks.openFolderDialog,
    uploadProjectFile: mocks.uploadProjectFile,
    writeProjectTextFile: mocks.writeProjectTextFile,
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    createConversation: mocks.createConversation,
    getProject: mocks.getProject,
    listConversations: mocks.listConversations,
    listMessages: mocks.listMessages,
    loadTabs: mocks.loadTabs,
    patchConversation: mocks.patchConversation,
    patchProject: mocks.patchProject,
    saveMessage: mocks.saveMessage,
    saveTabs: mocks.saveTabs,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

beforeEach(() => {
  mocks.connectConnector.mockResolvedValue({ connector: null });
  mocks.disconnectConnector.mockResolvedValue(null);
  mocks.fetchDesignSystem.mockResolvedValue(null);
  mocks.fetchDesignSystemRevisions.mockResolvedValue([]);
  mocks.fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
  mocks.fetchProjectFiles.mockResolvedValue([]);
  mocks.getProject.mockResolvedValue(null);
  mocks.fetchConnectorStatuses.mockResolvedValue({});
  mocks.createConversation.mockResolvedValue(null);
  mocks.listConversations.mockResolvedValue([]);
  mocks.listMessages.mockResolvedValue([]);
  mocks.loadTabs.mockResolvedValue({ tabs: [], active: null });
  mocks.patchConversation.mockResolvedValue(null);
  mocks.saveMessage.mockResolvedValue(null);
  mocks.saveTabs.mockResolvedValue(null);
  mocks.streamViaDaemon.mockImplementation(async () => {});
  mocks.openFolderDialog.mockResolvedValue(null);
  mocks.uploadProjectFile.mockImplementation(async (_projectId: string, file: File, desiredName?: string) => ({
    name: desiredName ?? file.name,
    size: file.size,
    mtime: 1,
    kind: 'code',
    mime: file.type || 'text/plain',
  }));
  mocks.writeProjectTextFile.mockImplementation(async (_projectId: string, name: string) => ({
    name,
    size: 1,
    mtime: 1,
    kind: 'document',
    mime: 'text/markdown',
  }));
});

function continueToGeneration() {
  fireEvent.click(screen.getByRole('button', { name: /^(continue to generation|generate)$/i }));
}

function confirmExtraction() {
  const button = screen.queryByRole('button', { name: /extract design system/i });
  if (button) fireEvent.click(button);
}

function addSourceUrl(value: string) {
  const input = screen.getByPlaceholderText('https://github.com/org/repo') as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  const addButton = input.closest('.ds-resource-inline')?.querySelector('button') as HTMLButtonElement | null;
  fireEvent.click(addButton!);
}

function mockBrandExtractProject(project: Project) {
  mocks.getProject.mockResolvedValue(project);
  const designSystemId = project.designSystemId ?? `user:${project.id}`;
  const fetchMock = vi.fn(async (input: unknown, _init?: unknown) => {
    if (typeof input === 'string' && input.startsWith('/api/brands')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: designSystemId.replace(/^user:/, ''),
          projectId: project.id,
          conversationId: `conv-${project.id}`,
          sourceUrl: 'designmd://source-material',
          status: 'extracting',
        }),
      } as unknown as Response;
    }
    if (typeof input === 'string' && input.includes('/figma/import')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          snapshotDir: 'figma',
          files: ['figma/tree.json', 'figma/tokens.json', 'figma/DESIGN-context.md'],
          inventory: {
            name: 'Product Design',
            pages: 1,
            frames: 2,
            components: ['Primary Button', 'Dashboard Card'],
            colors: ['#FF6A3D'],
            fonts: ['Inter'],
            imageCount: 0,
          },
          contextPath: 'figma/DESIGN-context.md',
          suggestedPrompt: 'Use the locally parsed Figma summaries.',
          label: 'product-design.fig',
        }),
      } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('design system package audit helpers', () => {
  it('summarizes passing audits and builds repair prompts for findings', () => {
    expect(summarizeDesignSystemPackageAudit({
      ok: true,
      projectPath: '/tmp/ds',
      filesInspected: 12,
      errors: [],
      warnings: [],
    })).toBe('Package audit passed (12 files inspected).');

    const failingAudit = {
      ok: false,
      projectPath: '/tmp/ds',
      filesInspected: 8,
      errors: [{
        severity: 'error' as const,
        code: 'ui_kit_index_missing_runtime_bootstrap',
        message: 'ui_kits/app/index.html must mount the kit.',
        path: 'ui_kits/app/index.html',
      }],
      warnings: [{
        severity: 'warning' as const,
        code: 'missing_source_component_examples',
        message: 'Copy source examples into source_examples/.',
        path: 'source_examples/',
      }, {
        severity: 'warning' as const,
        code: 'missing_build_assets',
        message: 'Preserve runtime icons under build/.',
        path: 'build/',
      }, {
        severity: 'warning' as const,
        code: 'readme_missing_package_reuse_guide',
        message: 'README.md should work as a Claude Design package guide.',
        path: 'README.md',
      }, {
        severity: 'warning' as const,
        code: 'readme_missing_preview_manifest',
        message: 'README.md should list preview cards.',
        path: 'README.md',
      }, {
        severity: 'warning' as const,
        code: 'missing_skill_frontmatter',
        message: 'SKILL.md should include YAML frontmatter.',
        path: 'SKILL.md',
      }],
    };

    expect(summarizeDesignSystemPackageAudit(failingAudit)).toContain(
      'Package audit found 1 error and 5 warnings',
    );
    expect(buildDesignSystemPackageAuditRepairPrompt(failingAudit)).toContain(
      'tools connectors design-system-package-audit --path . --fail-on-warnings',
    );
    expect(buildDesignSystemPackageAuditRepairPrompt(failingAudit)).toContain(
      'Treat every error and warning as blocking',
    );
    expect(buildDesignSystemPackageAuditRepairPrompt(failingAudit)).toContain(
      'preserve representative originals under root `build/`',
    );
    expect(buildDesignSystemPackageAuditRepairPrompt(failingAudit)).toContain(
      'copy them byte-for-byte from captured context snapshots',
    );
    expect(buildDesignSystemPackageAuditRepairPrompt(failingAudit)).toContain(
      'copy substantive original component snapshots into `source_examples/`',
    );
    expect(buildDesignSystemPackageAuditRepairPrompt(failingAudit)).toContain(
      'Targeted repair actions:',
    );
    expect(buildDesignSystemPackageAuditRepairPrompt(failingAudit)).toContain(
      'Rebuild `ui_kits/app/index.html` as a runnable UI-kit entry',
    );
    expect(buildDesignSystemPackageAuditRepairPrompt(failingAudit)).toContain(
      'Rewrite `SKILL.md` as a discoverable skill package',
    );
    expect(buildDesignSystemPackageAuditRepairPrompt(failingAudit)).toContain(
      'Rewrite `README.md` as a Claude Design package guide',
    );
    expect(buildDesignSystemPackageAuditRepairPrompt(failingAudit)).toContain(
      'Add a `## Preview Manifest` section to `README.md`',
    );
    expect(buildDesignSystemPackageAuditRepairPrompt(failingAudit)).toContain(
      'copying originals from `context/.../files/build/...` into root `build/` byte-for-byte',
    );
    expect(buildDesignSystemPackageAuditRepairPrompt(failingAudit)).toContain(
      '[warning] missing_source_component_examples source_examples/',
    );
  });
});

describe('DesignSystemCreationFlow', () => {
  // The unified flow (commit a05e3a29d) replaces the legacy 5-step generation
  // pipeline (createDesignSystemDraft → ensureDesignSystemWorkspace → source
  // manifest → prepare) with a two-phase brand extraction: submitting a website
  // POSTs /api/brands, which creates the backing project + conversation
  // immediately and lets the programmatic extraction register user:<id> in the
  // background.
  // Source-material specs below exercise the current handoff by staging files
  // into the backing brand project after kickoff and before navigation.
  it('renders the new create surface copy with the active non-English locale', () => {
    render(
      <I18nProvider initial="zh-CN">
        <DesignSystemCreationFlow onBack={() => {}} onCreated={() => {}} />
      </I18nProvider>,
    );

    expect(screen.getByRole('heading', { name: '从 GitHub、网站或源素材提取' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /继续生成/ })).toBeTruthy();
    expect(screen.getByText('从品牌开始')).toBeTruthy();
    expect(screen.queryByText('Continue to generation')).toBeNull();
    expect(screen.queryByText('Start from a brand')).toBeNull();
  });

  it('extracts a design system from a website via POST /api/brands and opens the backing project', async () => {
    const project: Project = {
      id: 'brand-acme-com',
      name: 'acme.com',
      skillId: 'brand-extract',
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
      metadata: { kind: 'other' },
    };
    mocks.getProject.mockResolvedValue(project);
    const fetchMock = vi.fn(async (input: unknown, _init?: unknown) => {
      if (typeof input === 'string' && input.startsWith('/api/brands')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'acme-com',
            projectId: project.id,
            conversationId: 'conv-acme',
            sourceUrl: 'https://acme.com',
            status: 'extracting',
          }),
        } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const onCreated = vi.fn();
    const onSystemsRefresh = vi.fn();

    render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={onCreated}
        onSystemsRefresh={onSystemsRefresh}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('https://github.com/org/repo'), {
      target: { value: 'https://acme.com' },
    });
    continueToGeneration();
    confirmExtraction();

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(project.id, project, 'conv-acme'));
    expect(fetchMock).toHaveBeenCalledWith('/api/brands', expect.objectContaining({ method: 'POST' }));
    const requestInit = fetchMock.mock.calls.find(([url]) => url === '/api/brands')?.[1] as unknown as { body: string };
    expect(JSON.parse(requestInit.body)).toMatchObject({ url: 'https://acme.com' });
    expect(onSystemsRefresh).toHaveBeenCalled();
    // The legacy 5-step pipeline must no longer run.
    expect(mocks.createDesignSystemDraft).not.toHaveBeenCalled();
    expect(mocks.ensureDesignSystemWorkspace).not.toHaveBeenCalled();
  });

  it('normalizes GitHub SSH source links before starting extraction', async () => {
    const project: Project = {
      id: 'brand-github',
      name: 'GitHub Design System',
      skillId: 'brand-extract',
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
      metadata: { kind: 'brand', importedFrom: 'brand-extraction' },
    };
    const fetchMock = mockBrandExtractProject(project);
    const onCreated = vi.fn();

    render(<DesignSystemCreationFlow onBack={() => {}} onCreated={onCreated} />);

    addSourceUrl('git@github.com:nexu-io/open-design.git');
    continueToGeneration();
    confirmExtraction();

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const requestInit = fetchMock.mock.calls.find(([url]) => url === '/api/brands')?.[1] as
      | { body: string }
      | undefined;
    expect(requestInit).toBeTruthy();
    expect(JSON.parse(requestInit!.body)).toMatchObject({
      url: 'https://github.com/nexu-io/open-design',
    });
  });

  it('keeps protocol-less website paths as website URLs', async () => {
    const project: Project = {
      id: 'brand-example',
      name: 'Example Design System',
      skillId: 'brand-extract',
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
      metadata: { kind: 'brand', importedFrom: 'brand-extraction' },
    };
    const fetchMock = mockBrandExtractProject(project);

    render(<DesignSystemCreationFlow onBack={() => {}} onCreated={() => {}} />);

    addSourceUrl('example.com/pricing');
    continueToGeneration();
    confirmExtraction();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/brands', expect.anything()));
    const requestInit = fetchMock.mock.calls.find(([url]) => url === '/api/brands')?.[1] as
      | { body: string }
      | undefined;
    expect(requestInit).toBeTruthy();
    expect(JSON.parse(requestInit!.body)).toMatchObject({
      url: 'https://example.com/pricing',
    });
  });

  it('creates from pasted DESIGN.md without requiring a website', async () => {
    const project: Project = {
      id: 'brand-heritage',
      name: 'Heritage Design System',
      skillId: 'brand-extract',
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
      metadata: { kind: 'brand', importedFrom: 'brand-extraction' },
    };
    mocks.getProject.mockResolvedValue(project);
    const fetchMock = vi.fn(async (input: unknown, _init?: unknown) => {
      if (typeof input === 'string' && input.startsWith('/api/brands')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'heritage',
            projectId: project.id,
            conversationId: 'conv-heritage',
            sourceUrl: 'designmd://heritage',
            status: 'extracting',
          }),
        } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const onCreated = vi.fn();

    render(<DesignSystemCreationFlow onBack={() => {}} onCreated={onCreated} />);

    fireEvent.change(screen.getByPlaceholderText(/Mission Impastabowl/i), {
      target: { value: 'A newsroom product with a precise editorial voice.' },
    });
    fireEvent.change(screen.getByPlaceholderText(/name: Heritage/i), {
      target: {
        value: [
          '---',
          'name: Heritage',
          'colors:',
          '  primary: "#1A1C1E"',
          '  tertiary: "#B8422E"',
          '---',
          '',
          '## Overview',
          'Editorial design system.',
        ].join('\n'),
      },
    });
    expect(
      (screen.getByRole('button', { name: /continue to generation/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
    continueToGeneration();
    confirmExtraction();

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(project.id, project, 'conv-heritage'));
    const requestInit = fetchMock.mock.calls.find(([url]) => url === '/api/brands')?.[1] as unknown as { body: string };
    expect(JSON.parse(requestInit.body)).toMatchObject({
      description: 'A newsroom product with a precise editorial voice.',
      designMd: expect.stringContaining('name: Heritage'),
    });
    expect(JSON.parse(requestInit.body)).not.toHaveProperty('url');
  });

  it('previews pasted DESIGN.md as a component kit and returns to edit mode', () => {
    render(<DesignSystemCreationFlow onBack={() => {}} onCreated={() => {}} />);

    const designMd = [
      '---',
      'name: Heritage',
      'colors:',
      '  primary: "#1A1C1E"',
      '  tertiary: "#B8422E"',
      '  background: "#FFFFFF"',
      '---',
      '',
      '## Overview',
      'Editorial design system.',
      '',
      '## Typography',
      '- **Display:** Public Sans — 700',
      '- **Body:** Public Sans — 400',
    ].join('\n');

    fireEvent.change(screen.getByPlaceholderText(/name: Heritage/i), {
      target: { value: designMd },
    });
    fireEvent.click(screen.getByRole('button', { name: /^preview$/i }));

    expect(screen.getByText('DESIGN.md preview')).toBeTruthy();
    expect(screen.getByText(/Heritage .* component kit/i)).toBeTruthy();
    expect(screen.getByText('colorPrimary')).toBeTruthy();
    expect(screen.getByText('#1a1c1e')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^dark$/i }));
    expect(screen.getByRole('button', { name: /^dark$/i }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    expect((screen.getByPlaceholderText(/name: Heritage/i) as HTMLTextAreaElement).value).toBe(designMd);
  });

  it('restores the current DESIGN.md draft when clearing a copied reference system', async () => {
    const clay: DesignSystemSummary = {
      id: 'clay',
      title: 'Clay',
      summary: 'Friendly tactile product UI.',
      category: 'Product',
      swatches: ['#f4efe7', '#25211d'],
    };
    const designSystems: DesignSystemSummary[] = [clay];
    const draft = [
      '---',
      'name: Manual Draft',
      'colors:',
      '  primary: "#123456"',
      '---',
      '',
      '## Overview',
      'A pasted draft the user is still editing.',
    ].join('\n');

    mocks.fetchDesignSystem.mockResolvedValue({
      ...clay,
      body: '# Clay reference\n',
      source: 'user',
      status: 'published',
      isEditable: true,
    } satisfies DesignSystemDetail);

    render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
        designSystems={designSystems}
      />,
    );

    const textarea = screen.getByPlaceholderText(/name: Heritage/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: draft } });

    fireEvent.click(screen.getByTestId('project-ds-picker-trigger'));
    fireEvent.mouseDown(await screen.findByTestId('project-ds-picker-option-clay'));

    await waitFor(() => expect(textarea.value).toBe('# Clay reference\n'));

    fireEvent.click(screen.getByTestId('project-ds-picker-trigger'));
    fireEvent.click(await screen.findByTestId('project-ds-picker-clear'));

    await waitFor(() => expect(textarea.value).toBe(draft));
  });

  it('creates from a brand description by sending a fallback DESIGN.md', async () => {
    const project: Project = {
      id: 'brand-description-only',
      name: 'Description Design System',
      skillId: 'brand-extract',
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
      metadata: { kind: 'brand', importedFrom: 'brand-extraction' },
    };
    mocks.getProject.mockResolvedValue(project);
    const fetchMock = vi.fn(async (input: unknown, _init?: unknown) => {
      if (typeof input === 'string' && input.startsWith('/api/brands')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'description-only',
            projectId: project.id,
            conversationId: 'conv-description-only',
            sourceUrl: 'designmd://description-only',
            status: 'extracting',
          }),
        } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const onCreated = vi.fn();

    render(<DesignSystemCreationFlow onBack={() => {}} onCreated={onCreated} />);

    fireEvent.change(screen.getByPlaceholderText(/Mission Impastabowl/i), {
      target: { value: 'A newsroom product with a precise editorial voice.' },
    });
    expect(
      (screen.getByRole('button', { name: /continue to generation/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
    continueToGeneration();
    confirmExtraction();

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(project.id, project, 'conv-description-only'));
    const requestInit = fetchMock.mock.calls.find(([url]) => url === '/api/brands')?.[1] as unknown as { body: string };
    const body = JSON.parse(requestInit.body) as { url?: string; description?: string; designMd?: string };
    expect(body).not.toHaveProperty('url');
    expect(body.description).toBe('A newsroom product with a precise editorial voice.');
    expect(body.designMd).toContain('A newsroom product with a precise editorial voice.');
    expect(body.designMd).toContain('## Source Material');
  });

  it('requires source material before extracting and surfaces a kickoff failure', async () => {
    const onCreated = vi.fn();
    render(<DesignSystemCreationFlow onBack={() => {}} onCreated={onCreated} />);

    // The action stays disabled until at least one source field is provided.
    expect(
      (screen.getByRole('button', { name: /continue to generation/i }) as HTMLButtonElement).disabled,
    ).toBe(true);

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'url is required' }),
    } as unknown as Response));
    vi.stubGlobal('fetch', fetchMock);

    fireEvent.change(screen.getByPlaceholderText('https://github.com/org/repo'), {
      target: { value: 'https://acme.com' },
    });
    expect(
      (screen.getByRole('button', { name: /continue to generation/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
    continueToGeneration();
    confirmExtraction();

    await waitFor(() => expect(screen.getAllByText('url is required').length).toBeGreaterThan(0));
    const toast = document.querySelector('.od-toast.placement-top.tone-error');
    expect(toast?.textContent).toContain('url is required');
    expect(onCreated).not.toHaveBeenCalled();
  });

  it.skip('opens the project as soon as the workspace exists and prepares the first chat task afterward', async () => {
    const system: DesignSystemDetail = {
      id: 'user:acme-design-system',
      title: 'Acme Design System',
      category: 'Custom',
      summary: 'Acme product workspace.',
      swatches: [],
      surface: 'web',
      body: '# Acme Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-acme-design-system',
    };
    const project: Project = {
      id: 'ds-acme-design-system',
      name: 'Acme Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    let resolveManifestWrite: (file: {
      name: string;
      size: number;
      mtime: number;
      kind: 'document';
      mime: string;
    }) => void = () => {};
    mocks.writeProjectTextFile.mockReturnValueOnce(new Promise((resolve) => {
      resolveManifestWrite = resolve;
    }));
    mocks.createDesignSystemDraft.mockResolvedValue(system);
    mocks.ensureDesignSystemWorkspace.mockResolvedValue({ project, files: [] });
    mocks.patchProject.mockResolvedValue({ ...project, pendingPrompt: 'Create this project as a design system.' });
    const onCreated = vi.fn();
    const onProjectPrepared = vi.fn();

    render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={onCreated}
        onProjectPrepared={onProjectPrepared}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Mission Impastabowl/i), {
      target: {
        value: 'Acme: analytics workspace for operations teams',
      },
    });
    continueToGeneration();
    continueToGeneration();

    await waitFor(() => expect(screen.getByText('Opening project...')).toBeTruthy());
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(project.id, project, `conv-${project.id}`));
    expect(screen.queryByText('Creating your design system...')).toBeNull();
    expect(screen.queryByText('Opening project chat...')).toBeNull();
    expect(screen.queryByText('Updated todos')).toBeNull();
    expect(mocks.patchProject).not.toHaveBeenCalled();
    expect(onProjectPrepared).not.toHaveBeenCalled();

    resolveManifestWrite({
      name: 'context/source-context.md',
      size: 1,
      mtime: 1,
      kind: 'document',
      mime: 'text/markdown',
    });
    await waitFor(() => expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Create this project as a complete Open Design design system workspace.'),
      }),
    ));
    await waitFor(() => expect(onProjectPrepared).toHaveBeenCalledWith(
      expect.objectContaining({
        id: project.id,
        pendingPrompt: 'Create this project as a design system.',
      }),
    ));
  });

  it.skip('creates a project-backed design system and hands the first task to the normal project chat', async () => {
    const system: DesignSystemDetail = {
      id: 'user:acme-design-system',
      title: 'Acme Design System',
      category: 'Custom',
      summary: 'Acme product workspace.',
      swatches: [],
      surface: 'web',
      body: '# Acme Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-acme-design-system',
    };
    const project: Project = {
      id: 'ds-acme-design-system',
      name: 'Acme Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    mocks.createDesignSystemDraft.mockResolvedValue(system);
    mocks.ensureDesignSystemWorkspace.mockResolvedValue({ project, files: [] });
    mocks.patchProject.mockResolvedValue({ ...project, pendingPrompt: 'Create this project as a design system.' });

    const onCreated = vi.fn();
    const onSystemsRefresh = vi.fn();

    render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={onCreated}
        onSystemsRefresh={onSystemsRefresh}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Mission Impastabowl/i), {
      target: {
        value: 'Acme: analytics workspace for operations teams',
      },
    });
    continueToGeneration();
    continueToGeneration();

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(project.id, project, `conv-${project.id}`));

    expect(mocks.createDesignSystemDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Acme Design System',
        status: 'draft',
        surface: 'web',
        artifactMode: 'agent-managed',
      }),
    );
    expect(mocks.ensureDesignSystemWorkspace).toHaveBeenCalledWith(system.id);
    await waitFor(() => expect(mocks.writeProjectTextFile).toHaveBeenCalled());
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('## Review Contract'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('Canonical design-system title: Acme Design System'),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Create this project as a complete Open Design design system workspace.'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Design system workspace title:\nAcme Design System'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Do not derive the title from URL protocol text such as `https`.'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Read `context/source-context.md` before drafting'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Do not ask setup or clarification questions during design-system generation.'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Do not emit `<question-form>`, "Quick brief — 30 seconds"'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('All GitHub extraction, website/source URL review, local evidence intake, source reading, design-system construction, package audit, and final artifact writes must happen inside this project workspace and this project chat run.'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('A Claude Design-quality package'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('preview/colors-primary.html'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('ui_kits/app/'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('ui_kits/app/components/'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('AssistantsList.jsx'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('MessageBubble.jsx'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('do not write one-line placeholder components'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('must load `../../colors_and_type.css`'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('must load/import/compose the modular component files'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('must mount/render the composed interface'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('app shell component must compose the role components'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('include React, ReactDOM, and Babel standalone scripts'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Claude-style UI-kit entry contract:'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('<script type="text/babel" src="components/App.jsx"></script>'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining("const root = ReactDOM.createRoot(document.getElementById('root'));"),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('root.render(<App />);'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Write `README.md` as a reusable package guide'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Include a source-backed Product Overview/Product Context section'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('expose each loaded component as `window.ComponentName`'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('do not leave manifest text pointing to older preview names'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('representative set instead of collapsing everything into one generic logo or font'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('preserve representative files under `build/` as Claude Design does'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Claude-style build asset contract:'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('copy representative runtime assets there with their original filenames'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Copy those runtime assets byte-for-byte from the captured `context/.../files/...` snapshots.'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Do not satisfy build/runtime icon evidence by only renaming those files into `assets/`'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('ui_kits/app/README.md` should document the kit structure'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('preview/brand-assets.html` must visibly load the preserved files'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('bind them in `colors_and_type.css` with `@font-face`'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Preserve high-signal source component examples'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('concrete `## Preview Manifest` section'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('lists each generated `preview/*.html` card by exact path'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Do not replace captured source examples with tiny filename-only stubs'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('source_examples/SelectModelButton.tsx'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Include YAML frontmatter with `name`, `description`, and `user-invocable`'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('reusable sections for `What is inside`, `Source context`, `When to use this skill`, `How to use`, and `Design system highlights`'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('read README.md, DESIGN.md, colors_and_type.css, preview/, assets/, build/, fonts/, source_examples/, and ui_kits/app/'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('name or model high-signal source components from the evidence'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('tools connectors design-system-package-audit --path . --fail-on-warnings'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Fix every audit error and design-quality warning'),
      }),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('tools connectors design-system-package-audit --path . --fail-on-warnings'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('fix every reported error or warning'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('All GitHub extraction, website/source URL review, local evidence intake, source reading, design-system construction, package audit, and artifact writes should happen inside this project workspace.'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('ui_kits/app/components/'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('must load `../../colors_and_type.css`'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('must load/import/compose the modular component files'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('must mount/render the composed interface'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('app shell component must compose those roles'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('ui_kits/app/README.md` should explain structure'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('include React, ReactDOM, and Babel standalone scripts'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('Claude-style UI-kit entry contract:'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('<script type="text/babel" src="components/App.jsx"></script>'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining("const root = ReactDOM.createRoot(document.getElementById('root'));"),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('root.render(<App />);'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('expose each loaded component as `window.ComponentName`'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('assistant/list rail'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('message bubble/comment'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('must describe the final focused preview cards'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('README.md should include a source-backed Product Overview/Product Context section'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('colors_and_type.css must bind those files with @font-face'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('concrete `## Preview Manifest` listing every generated `preview/*.html` card'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('SKILL.md should include YAML frontmatter'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('Claude-style reusable skill sections: What is inside, Source context, When to use this skill, How to use, and Design system highlights'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('README.md, DESIGN.md, colors_and_type.css, preview/, assets/, build/, fonts/, source_examples/, and ui_kits/app/'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('source_examples/ or equivalent root/nested source files'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('not tiny stubs that only share the component name'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('explicitly label or model source-backed modules'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('Placeholder component shells are not sufficient'),
    );
    expect(window.sessionStorage.getItem(`od:auto-send-first:${project.id}`)).toBe('1');
    expect(onCreated).toHaveBeenCalledWith(project.id, project, `conv-${project.id}`);
    expect(onSystemsRefresh).toHaveBeenCalled();
  });

  it('links a local code folder into the design-system project so the agent can read it', async () => {
    const system: DesignSystemDetail = {
      id: 'user:folder-design-system',
      title: 'Folder Design System',
      category: 'Custom',
      summary: 'Folder product workspace.',
      swatches: [],
      surface: 'web',
      body: '# Folder Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-folder-design-system',
    };
    const project: Project = {
      id: 'ds-folder-design-system',
      name: 'Folder Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    mockBrandExtractProject(project);
    mocks.patchProject.mockResolvedValue({ ...project, pendingPrompt: 'Create this project as a design system.' });
    mocks.openFolderDialog.mockResolvedValue('/Users/qingyu/work/comfyui');

    render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Mission Impastabowl/i), {
      target: { value: 'ComfyUI: node-based image workflow editor' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Browse folder' }));

    await waitFor(() => expect(screen.getByText('/Users/qingyu/work/comfyui')).toBeTruthy());
    expect(screen.queryByTestId('ds-source-upload-loading')).toBeNull();

    continueToGeneration();
    confirmExtraction();

    await waitFor(() => expect(mocks.patchProject).toHaveBeenCalled());
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        metadata: expect.objectContaining({
          linkedDirs: ['/Users/qingyu/work/comfyui'],
        }),
        pendingPrompt: expect.stringContaining('Read the linked local code folders'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('tools connectors local-design-context --path'),
      }),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('/Users/qingyu/work/comfyui'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('## Local Folder Intake Runbook'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('tools connectors local-design-context --path'),
    );
  });

  it('copies browser-selected local code folder files into the design-system project context', async () => {
    const system: DesignSystemDetail = {
      id: 'user:snapshot-design-system',
      title: 'Snapshot Design System',
      category: 'Custom',
      summary: 'Snapshot product workspace.',
      swatches: [],
      surface: 'web',
      body: '# Snapshot Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-snapshot-design-system',
    };
    const project: Project = {
      id: 'ds-snapshot-design-system',
      name: 'Snapshot Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    mockBrandExtractProject(project);
    mocks.patchProject.mockResolvedValue({ ...project, pendingPrompt: 'Create this project as a design system.' });
    const onCreated = vi.fn();

    const { container } = render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={onCreated}
      />,
    );
    const localCodeInput = container.querySelector('input[webkitdirectory]') as HTMLInputElement | null;
    const tokenFile = new File([':root { --brand: #d86a4a; }'], 'tokens.css', { type: 'text/css' });
    Object.defineProperty(tokenFile, 'webkitRelativePath', { value: 'comfyui/src/tokens.css' });

    fireEvent.change(screen.getByPlaceholderText(/Mission Impastabowl/i), {
      target: { value: 'Snapshot: product UI with tokens' },
    });
    fireEvent.change(localCodeInput!, { target: { files: [tokenFile] } });
    expect(screen.getByText('1 local code files selected')).toBeTruthy();
    expect(screen.queryByTestId('ds-source-upload-loading')).toBeNull();

    continueToGeneration();
    confirmExtraction();

    await waitFor(() => expect(mocks.uploadProjectFile).toHaveBeenCalled());
    expect(mocks.uploadProjectFile).toHaveBeenCalledWith(
      project.id,
      tokenFile,
      'context/local-code/comfyui/src/tokens.css',
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('context/local-code/comfyui/src/tokens.css'),
      }),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('context/local-code/comfyui/src/tokens.css'),
    );
    expect(window.sessionStorage.getItem(`od:auto-send-first:${project.id}`)).toBe('1');
    expect(onCreated).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({ id: project.id }),
      `conv-${project.id}`,
    );
  });

  it('shows global loading as soon as a large file-picker selection returns', async () => {
    const { container } = render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
      />,
    );
    const localCodeInput = container.querySelector('input[webkitdirectory]') as HTMLInputElement | null;
    const tokenFiles = Array.from({ length: 25 }, (_, index) => {
      const file = new File([`:root { --brand-${index}: #d86a4a; }`], `tokens-${index}.css`, {
        type: 'text/css',
      });
      Object.defineProperty(file, 'webkitRelativePath', { value: `comfyui/src/tokens-${index}.css` });
      return file;
    });

    fireEvent.change(localCodeInput!, { target: { files: tokenFiles } });

    expect(screen.getByTestId('ds-source-upload-loading').textContent).toContain('Adding source material...');
    expect(screen.queryByText('25 local code files selected')).toBeNull();
    await waitFor(() => expect(screen.getByText('25 local code files selected')).toBeTruthy(), { timeout: 2000 });
    await waitFor(() => expect(screen.queryByTestId('ds-source-upload-loading')).toBeNull(), { timeout: 2500 });
  });

  it('shows global loading when the folder picker returns before files are enumerated', async () => {
    const { container } = render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
      />,
    );
    const localCodeInput = container.querySelector('input[webkitdirectory]') as HTMLInputElement | null;
    const tokenFiles = Array.from({ length: 25 }, (_, index) => {
      const file = new File([`:root { --brand-${index}: #d86a4a; }`], `tokens-${index}.css`, {
        type: 'text/css',
      });
      Object.defineProperty(file, 'webkitRelativePath', { value: `comfyui/src/tokens-${index}.css` });
      return file;
    });

    fireEvent.click(localCodeInput!);
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    fireEvent(window, new Event('focus'));

    await waitFor(() => {
      expect(screen.getByTestId('ds-source-upload-loading').textContent).toContain('Adding source material...');
    });
    expect(screen.queryByText('25 local code files selected')).toBeNull();

    fireEvent.change(localCodeInput!, { target: { files: tokenFiles } });

    await waitFor(() => expect(screen.getByText('25 local code files selected')).toBeTruthy(), { timeout: 2000 });
    await waitFor(() => expect(screen.queryByTestId('ds-source-upload-loading')).toBeNull(), { timeout: 2500 });
  });

  it('primes global loading while the folder picker is still open', async () => {
    const { container } = render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
      />,
    );
    const localCodeInput = container.querySelector('input[webkitdirectory]') as HTMLInputElement | null;
    const tokenFiles = Array.from({ length: 25 }, (_, index) => {
      const file = new File([`:root { --brand-${index}: #d86a4a; }`], `tokens-${index}.css`, {
        type: 'text/css',
      });
      Object.defineProperty(file, 'webkitRelativePath', { value: `comfyui/src/tokens-${index}.css` });
      return file;
    });

    fireEvent.click(localCodeInput!);

    await waitFor(() => {
      expect(screen.getByTestId('ds-source-upload-loading').textContent).toContain('Adding source material...');
    }, { timeout: 1000 });

    fireEvent.change(localCodeInput!, { target: { files: tokenFiles } });

    await waitFor(() => expect(screen.getByText('25 local code files selected')).toBeTruthy(), { timeout: 2000 });
    await waitFor(() => expect(screen.queryByTestId('ds-source-upload-loading')).toBeNull(), { timeout: 2500 });
  });

  it('shows a recoverable error when a dragged local code entry cannot be read', async () => {
    const { container } = render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
      />,
    );
    const dropZone = container.querySelector('input[webkitdirectory]')?.closest('.ds-drop-zone') as HTMLElement | null;

    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [],
        items: [
          {
            webkitGetAsEntry: () => ({
              isFile: true,
              isDirectory: false,
              name: 'stale-token.css',
              file: (_done: (file: File) => void, fail?: (error: DOMException) => void) => {
                fail?.(new DOMException('missing', 'NotFoundError'));
              },
            }),
          },
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Could not read one or more dropped files or folders/).length).toBeGreaterThan(0);
    });
    expect(document.querySelector('.od-toast.placement-top.tone-error')?.textContent).toContain(
      'Could not read one or more dropped files or folders',
    );
    expect(screen.queryByText(/local code files selected/)).toBeNull();
  });

  it('shows a global loading state while local source files are being read', async () => {
    const { container } = render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
      />,
    );
    const dropZone = container.querySelector('input[webkitdirectory]')?.closest('.ds-drop-zone') as HTMLElement | null;
    const tokenFiles = Array.from({ length: 25 }, (_, index) => (
      new File([`:root { --brand-${index}: #d86a4a; }`], `tokens-${index}.css`, { type: 'text/css' })
    ));
    let resolveRead!: () => void;
    const readReady = new Promise<void>((resolve) => {
      resolveRead = resolve;
    });

    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [],
        items: [
          ...tokenFiles.map((tokenFile) => ({
            webkitGetAsEntry: () => ({
              isFile: true,
              isDirectory: false,
              name: tokenFile.name,
              file: (done: (file: File) => void) => {
                void readReady.then(() => done(tokenFile));
              },
            }),
          })),
        ],
      },
    });

    expect(screen.queryByTestId('ds-source-upload-loading')).toBeNull();
    resolveRead();

    await waitFor(() => {
      expect(screen.getByTestId('ds-source-upload-loading').textContent).toContain('Adding source material...');
    });
    await waitFor(() => expect(screen.getByText('25 local code files selected')).toBeTruthy());
    await waitFor(() => expect(screen.queryByTestId('ds-source-upload-loading')).toBeNull());
  });

  it('recursively reads a dragged local code folder into the design-system project context', async () => {
    const system: DesignSystemDetail = {
      id: 'user:dragged-folder-design-system',
      title: 'Dragged Folder Design System',
      category: 'Custom',
      summary: 'Dragged folder workspace.',
      swatches: [],
      surface: 'web',
      body: '# Dragged Folder Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-dragged-folder-design-system',
    };
    const project: Project = {
      id: 'ds-dragged-folder-design-system',
      name: 'Dragged Folder Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    mockBrandExtractProject(project);
    mocks.patchProject.mockResolvedValue({ ...project, pendingPrompt: 'Create this project as a design system.' });

    const { container } = render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
      />,
    );
    const dropZone = container.querySelector('input[webkitdirectory]')?.closest('.ds-drop-zone') as HTMLElement | null;
    const tokenFile = new File([':root { --brand: #d86a4a; }'], 'tokens.css', { type: 'text/css' });
    const buttonFile = new File(['export function Button() {}'], 'Button.tsx', { type: 'text/typescript' });
    const srcEntries = [
      { isFile: true, isDirectory: false, name: 'tokens.css', file: (done: (file: File) => void) => done(tokenFile) },
      { isFile: true, isDirectory: false, name: 'Button.tsx', file: (done: (file: File) => void) => done(buttonFile) },
    ];
    const srcDirectory = {
      isFile: false,
      isDirectory: true,
      name: 'src',
      createReader: () => {
        let read = false;
        return {
          readEntries: (done: (entries: typeof srcEntries) => void) => {
            const entries = read ? [] : srcEntries;
            read = true;
            done(entries);
          },
        };
      },
    };
    const rootDirectory = {
      isFile: false,
      isDirectory: true,
      name: 'comfyui',
      createReader: () => {
        let read = false;
        return {
          readEntries: (done: (entries: [typeof srcDirectory] | []) => void) => {
            const entries: [typeof srcDirectory] | [] = read ? [] : [srcDirectory];
            read = true;
            done(entries);
          },
        };
      },
    };

    fireEvent.change(screen.getByPlaceholderText(/Mission Impastabowl/i), {
      target: { value: 'Dragged: product UI with tokens and components' },
    });
    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [],
        items: [
          {
            webkitGetAsEntry: () => rootDirectory,
          },
        ],
      },
    });

    await waitFor(() => expect(screen.getByText('2 local code files selected')).toBeTruthy());

    continueToGeneration();
    confirmExtraction();

    await waitFor(() => expect(mocks.uploadProjectFile).toHaveBeenCalledTimes(2));
    expect(mocks.uploadProjectFile).toHaveBeenCalledWith(
      project.id,
      tokenFile,
      'context/local-code/comfyui/src/tokens.css',
    );
    expect(mocks.uploadProjectFile).toHaveBeenCalledWith(
      project.id,
      buttonFile,
      'context/local-code/comfyui/src/Button.tsx',
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('context/local-code/comfyui/src/Button.tsx'),
    );
  });

  it('parses .fig files locally into project context summaries without uploading the source file', async () => {
    const system: DesignSystemDetail = {
      id: 'user:figma-design-system',
      title: 'Figma Design System',
      category: 'Custom',
      summary: 'Figma-backed workspace.',
      swatches: [],
      surface: 'web',
      body: '# Figma Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-figma-design-system',
    };
    const project: Project = {
      id: 'ds-figma-design-system',
      name: 'Figma Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    const fetchMock = mockBrandExtractProject(project);
    mocks.patchProject.mockResolvedValue({ ...project, pendingPrompt: 'Create this project as a design system.' });

    render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
      />,
    );
    const figInput = screen
      .getByText('Drop .fig here or browse')
      .closest('label')
      ?.querySelector('input') as HTMLInputElement | null;
    const figFile = new File([
      '{"name":"Primary Button","fontFamily":"Inter","name":"Dashboard Card","fill":"#FF6A3D"}',
    ], 'product-design.fig', { type: 'application/octet-stream' });

    fireEvent.change(screen.getByPlaceholderText(/Mission Impastabowl/i), {
      target: { value: 'Figma: product UI with button and dashboard components' },
    });
    fireEvent.change(figInput!, { target: { files: [figFile] } });
    expect(screen.getByText('product-design.fig')).toBeTruthy();

    continueToGeneration();
    confirmExtraction();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/projects/${encodeURIComponent(project.id)}/figma/import`,
      expect.objectContaining({ method: 'POST' }),
    ));
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('figma/DESIGN-context.md'),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Each .fig was decoded into a real design snapshot'),
      }),
    );
    expect(mocks.uploadProjectFile).not.toHaveBeenCalled();
  });

  it('uploads brand assets into the design-system project context', async () => {
    const system: DesignSystemDetail = {
      id: 'user:asset-design-system',
      title: 'Asset Design System',
      category: 'Custom',
      summary: 'Asset-backed workspace.',
      swatches: [],
      surface: 'web',
      body: '# Asset Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-asset-design-system',
    };
    const project: Project = {
      id: 'ds-asset-design-system',
      name: 'Asset Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    mockBrandExtractProject(project);
    mocks.patchProject.mockResolvedValue({ ...project, pendingPrompt: 'Create this project as a design system.' });

    render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
      />,
    );
    const assetInput = screen
      .getByTestId('ds-asset-dropzone')
      .querySelector('input[type="file"]') as HTMLInputElement | null;
    const logoFile = new File(['<svg />'], 'logo.svg', { type: 'image/svg+xml' });
    const fontFile = new File(['font-data'], 'brand.woff2', { type: 'font/woff2' });

    fireEvent.change(screen.getByPlaceholderText(/Mission Impastabowl/i), {
      target: { value: 'Assets: product brand with custom logo and font' },
    });
    fireEvent.change(assetInput!, { target: { files: [logoFile, fontFile] } });
    expect(screen.getByText('logo.svg')).toBeTruthy();
    expect(screen.getByText('brand.woff2')).toBeTruthy();
    expect(screen.queryByTestId('ds-source-upload-loading')).toBeNull();

    continueToGeneration();
    confirmExtraction();

    await waitFor(() => expect(mocks.uploadProjectFile).toHaveBeenCalledTimes(2));
    expect(mocks.uploadProjectFile).toHaveBeenCalledWith(project.id, logoFile, 'assets/logo.svg');
    expect(mocks.uploadProjectFile).toHaveBeenCalledWith(project.id, fontFile, 'assets/brand.woff2');
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('assets/logo.svg'),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Use uploaded brand assets in `assets/`'),
      }),
    );
  });

  it.skip('infers a product title from a GitHub URL instead of the URL protocol', async () => {
    const system: DesignSystemDetail = {
      id: 'user:cherry-studio-design-system',
      title: 'Cherry Studio Design System',
      category: 'Custom',
      summary: 'https://github.com/cherryhq/cherry-studio',
      swatches: [],
      surface: 'web',
      body: '# Cherry Studio Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-cherry-studio-design-system',
    };
    const project: Project = {
      id: 'ds-cherry-studio-design-system',
      name: 'Cherry Studio Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    mocks.createDesignSystemDraft.mockResolvedValue(system);
    mocks.ensureDesignSystemWorkspace.mockResolvedValue({ project, files: [] });
    mocks.patchProject.mockResolvedValue({ ...project, pendingPrompt: 'Create this project as a design system.' });

    render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
        onSystemsRefresh={() => {}}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Mission Impastabowl/i), {
      target: { value: 'https://github.com/cherryhq/cherry-studio' },
    });
    continueToGeneration();
    continueToGeneration();

    await waitFor(() => expect(mocks.createDesignSystemDraft).toHaveBeenCalled());

    expect(mocks.createDesignSystemDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Cherry Studio Design System',
      }),
    );
    expect(mocks.createDesignSystemDraft).not.toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'https Design System',
      }),
    );
    await waitFor(() => expect(mocks.writeProjectTextFile).toHaveBeenCalled());
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('Canonical design-system title: Cherry Studio Design System'),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Design system workspace title:\nCherry Studio Design System'),
      }),
    );
  });

  it.skip('adds website source links with Enter and keeps them out of GitHub intake', async () => {
    const system: DesignSystemDetail = {
      id: 'user:open-design-website-design-system',
      title: 'Open Design Website Design System',
      category: 'Custom',
      summary: 'Open Design website source.',
      swatches: [],
      surface: 'web',
      body: '# Open Design Website Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-open-design-website-design-system',
    };
    const project: Project = {
      id: 'ds-open-design-website-design-system',
      name: 'Open Design Website Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    const onBeforeGenerate = vi.fn();
    mocks.createDesignSystemDraft.mockResolvedValue(system);
    mocks.ensureDesignSystemWorkspace.mockResolvedValue({ project, files: [] });
    mocks.patchProject.mockResolvedValue({ ...project, pendingPrompt: 'Create this project as a design system.' });

    render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
        onBeforeGenerate={onBeforeGenerate}
      />,
    );

    const sourceInput = screen.getByPlaceholderText('https://example.com or https://github.com/owner/repo') as HTMLInputElement;
    fireEvent.change(sourceInput, { target: { value: 'open-design.ai' } });
    fireEvent.keyDown(sourceInput, { key: 'Enter', code: 'Enter' });

    const previewLink = screen.getByRole('link', { name: 'Open open-design.ai' }) as HTMLAnchorElement;
    expect(previewLink.href).toBe('https://open-design.ai/');
    expect(sourceInput.value).toBe('');

    fireEvent.change(screen.getByPlaceholderText(/Mission Impastabowl/i), {
      target: { value: 'Open Design website source' },
    });
    continueToGeneration();
    continueToGeneration();

    await waitFor(() => expect(mocks.createDesignSystemDraft).toHaveBeenCalled());
    expect(onBeforeGenerate).toHaveBeenCalledWith(expect.objectContaining({
      sourceCount: 1,
      sourceUrlCount: 1,
      githubRepoCount: 0,
    }));
    const draftInput = mocks.createDesignSystemDraft.mock.calls[0]?.[0];
    expect(draftInput?.provenance?.sourceUrls).toEqual(['https://open-design.ai']);
    expect(draftInput?.provenance?.githubUrls).toBeUndefined();

    await waitFor(() => expect(mocks.writeProjectTextFile).toHaveBeenCalled());
    const sourceManifestCall = mocks.writeProjectTextFile.mock.calls.find(
      (call) => call[0] === project.id && call[1] === 'context/source-context.md',
    );
    expect(sourceManifestCall?.[2]).toEqual(expect.stringContaining('## Source Links'));
    expect(sourceManifestCall?.[2]).toEqual(expect.stringContaining('- https://open-design.ai'));
    expect(sourceManifestCall?.[2]).not.toEqual(expect.stringContaining('GitHub Connector Intake Runbook'));
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Use the linked website/source URLs as public style and product references'),
      }),
    );
  });

  it.skip('allows GitHub repo links without Composio by using local GitHub intake', () => {
    const onOpenConnectorsTab = vi.fn();
    const config = {
      composio: { apiKeyConfigured: false },
    } as AppConfig;

    render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
        config={config}
        onOpenConnectorsTab={onOpenConnectorsTab}
      />,
    );

    const input = screen.getByPlaceholderText('https://github.com/org/repo') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(screen.getByText('GitHub access: Auto')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show access methods' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Configure Composio' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show access methods' }));
    expect(screen.getByText('This device')).toBeTruthy();
    expect(screen.getByText('Open Design account')).toBeTruthy();
    expect(screen.getByText('Connector platform')).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();
    expect(screen.getByText('Not configured')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'https://github.com/nexu-io/open-design/' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('nexu-io/open-design')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Configure Composio' }));

    expect(onOpenConnectorsTab).toHaveBeenCalledTimes(1);
    expect(mocks.fetchConnectorStatuses).not.toHaveBeenCalled();
  });

  it('stops checking GitHub connector if the status request hangs', async () => {
    const originalSetTimeout = window.setTimeout;
    type WindowSetTimeout = typeof window.setTimeout;
    const timeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation(((...params: Parameters<WindowSetTimeout>) => {
      const [handler, timeout, ...args] = params;
      if (timeout === 5000 && typeof handler === 'function') {
        handler(...args);
        return 1;
      }
      return originalSetTimeout(...params);
    }) as typeof window.setTimeout);
    mocks.fetchConnectorStatuses.mockReturnValue(new Promise(() => {}));
    const config = {
      composio: { apiKeyConfigured: true, apiKeyTail: 'uQEg' },
    } as AppConfig;

    try {
      render(
        <DesignSystemCreationFlow
          onBack={() => {}}
          onCreated={() => {}}
          config={config}
        />,
      );

      expect(screen.getByText('GitHub access: Auto')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Show access methods' }));
      expect(screen.queryByText('Checking GitHub connector')).toBeNull();

      await waitFor(() => expect(screen.getByText('Needs attention')).toBeTruthy());
      expect(screen.queryByText('Checking GitHub connector')).toBeNull();
      expect(screen.getByText(/Could not finish checking GitHub connector/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Connect via Composio' })).toBeTruthy();
      expect(mocks.fetchConnectorStatuses.mock.calls[0]?.[0]?.signal?.aborted).toBe(true);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('surfaces GitHub connector status errors from the connector status endpoint', async () => {
    mocks.fetchConnectorStatuses.mockResolvedValue({
      github: {
        status: 'error',
        lastError: 'GitHub authorization expired. Reconnect GitHub.',
      },
    });
    const config = {
      composio: { apiKeyConfigured: true, apiKeyTail: 'uQEg' },
    } as AppConfig;

    render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
        config={config}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show access methods' }));
    await waitFor(() => expect(screen.getByText('Needs attention')).toBeTruthy());
    expect(screen.getByText('GitHub authorization expired. Reconnect GitHub.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect via Composio' })).toBeTruthy();
  });

  it.skip('keeps GitHub repo links available and shows connected connector status', async () => {
    const connectedConnector: ConnectorDetail = {
      id: 'github',
      name: 'GitHub',
      provider: 'Composio',
      category: 'Code',
      status: 'connected',
      tools: [],
      accountLabel: 'qiongyu1999',
    };
    mocks.fetchConnectorStatuses.mockResolvedValue({ github: { status: 'available' } });
    mocks.connectConnector.mockResolvedValue({
      connector: connectedConnector,
      auth: { kind: 'connected' },
    });
    const config = {
      composio: { apiKeyConfigured: true, apiKeyTail: 'uQEg' },
    } as AppConfig;
    const onConnectorsChanged = vi.fn();
    window.addEventListener(CONNECTORS_CHANGED_EVENT, onConnectorsChanged);

    try {
      render(
        <DesignSystemCreationFlow
          onBack={() => {}}
          onCreated={() => {}}
          config={config}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Show access methods' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Connect via Composio' })).toBeTruthy());
      expect((screen.getByPlaceholderText('https://example.com or https://github.com/owner/repo') as HTMLInputElement).disabled).toBe(false);

      fireEvent.click(screen.getByRole('button', { name: 'Connect via Composio' }));

      await waitFor(() => expect(mocks.connectConnector).toHaveBeenCalledWith('github'));
      await waitFor(() => expect(screen.getByText(/Connected as qiongyu1999/i)).toBeTruthy());
      await waitFor(() => expect(onConnectorsChanged).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('button', { name: 'Configure' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
      const input = screen.getByPlaceholderText('https://example.com or https://github.com/owner/repo') as HTMLInputElement;
      expect(input.disabled).toBe(false);

      fireEvent.change(input, { target: { value: 'https://github.com/nexu-io/open-design/' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByText('nexu-io/open-design')).toBeTruthy();
      expect(input.value).toBe('');
    } finally {
      window.removeEventListener(CONNECTORS_CHANGED_EVENT, onConnectorsChanged);
    }
  });

  it('hides Composio connection ids in the connected GitHub label', async () => {
    mocks.fetchConnectorStatuses.mockResolvedValue({
      github: { status: 'connected', accountLabel: 'ca_6U6mv_8IzMVR' },
    });
    const config = {
      composio: { apiKeyConfigured: true, apiKeyTail: 'uQEg' },
    } as AppConfig;

    render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
        config={config}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show access methods' }));
    await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy());
    expect(screen.queryByText(/ca_6U6mv_8IzMVR/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Configure' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
  });

  it('keeps a manual GitHub authorization action when the automatic popup is blocked', async () => {
    const availableConnector: ConnectorDetail = {
      id: 'github',
      name: 'GitHub',
      provider: 'Composio',
      category: 'Code',
      status: 'available',
      tools: [],
    };
    mocks.fetchConnectorStatuses.mockResolvedValue({ github: { status: 'available' } });
    mocks.connectConnector.mockResolvedValue({
      connector: availableConnector,
      auth: {
        kind: 'redirect_required',
        redirectUrl: 'https://example.com/oauth',
        expiresAt: '2099-05-08T10:00:00.000Z',
      },
      error: 'Popup blocked. Allow popups for Open Design and try again.',
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => ({ closed: false } as Window));
    const config = {
      composio: { apiKeyConfigured: true, apiKeyTail: 'uQEg' },
    } as AppConfig;

    try {
      render(
        <DesignSystemCreationFlow
          onBack={() => {}}
          onCreated={() => {}}
          config={config}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Show access methods' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Connect via Composio' })).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'Connect via Composio' }));

      await waitFor(() => expect(screen.getByText('Pending')).toBeTruthy());
      expect(screen.getByText('Popup blocked. Allow popups for Open Design and try again.')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Open authorization' }));

      expect(openSpy).toHaveBeenCalledWith('https://example.com/oauth', '_blank');
    } finally {
      openSpy.mockRestore();
    }
  });

  it('records connected GitHub repository sources in the project source manifest', async () => {
    const availableConnector: ConnectorDetail = {
      id: 'github',
      name: 'GitHub',
      provider: 'Composio',
      category: 'Code',
      status: 'connected',
      accountLabel: 'qiongyu1999',
      tools: [],
    };
    const system: DesignSystemDetail = {
      id: 'user:github-design-system',
      title: 'Github Design System',
      category: 'Custom',
      summary: 'GitHub-backed workspace.',
      swatches: [],
      surface: 'web',
      body: '# Github Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-github-design-system',
    };
    const project: Project = {
      id: 'ds-github-design-system',
      name: 'Github Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    mocks.fetchConnectorStatuses.mockResolvedValue({
      github: { status: 'connected', accountLabel: 'qiongyu1999' },
    });
    mockBrandExtractProject(project);
    mocks.patchProject.mockResolvedValue({ ...project, pendingPrompt: 'Create this project as a design system.' });
    const config = {
      composio: { apiKeyConfigured: true, apiKeyTail: 'uQEg' },
    } as AppConfig;

    render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
        config={config}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show access methods' }));
    await waitFor(() => expect(screen.getByText(/Connected as qiongyu1999/i)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/Mission Impastabowl/i), {
      target: { value: 'GitHub: product workspace' },
    });
    addSourceUrl('https://github.com/nexu-io/open-design');
    continueToGeneration();
    confirmExtraction();

    await waitFor(() => expect(mocks.writeProjectTextFile).toHaveBeenCalled());
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('Connector status: connected as qiongyu1999.'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('https://github.com/nexu-io/open-design'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('GitHub Connector Intake Runbook'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('"$OD_NODE_BIN" "$OD_BIN" tools connectors github-design-context --repo \'https://github.com/nexu-io/open-design\' --output context/github/nexu-io-open-design.md'),
    );
    expect(mocks.writeProjectTextFile).not.toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('--require-connector'),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('GitHub repository intake is required before drafting the design system'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Do not call GitHub connector tree/content/raw tools directly from the agent.'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('The command tries this-device access first'),
      }),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('GitHub evidence must come from the bounded `github-design-context` command'),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Do not call GitHub connector tree/content/raw tools directly from the agent.'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('Treat `Read method: git-clone` as the preferred this-device path.'),
      }),
    );
    expect(mocks.patchProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        pendingPrompt: expect.stringContaining('selects design-system-relevant source files plus available logos/icons/fonts'),
      }),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('assets/, build/, fonts/, and context/ should preserve logos'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('Claude-style build asset contract:'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('copy representative runtime assets there with their original filenames'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('Copy those runtime assets byte-for-byte from the captured `context/.../files/...` snapshots.'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('Do not satisfy build/runtime icon evidence by only renaming those files into `assets/`'),
    );
    expect(mocks.writeProjectTextFile).toHaveBeenCalledWith(
      project.id,
      'context/source-context.md',
      expect.stringContaining('preview/brand-assets.html should visibly reference preserved files'),
    );
  });

  it('does not leak Composio connected-account ids into the project source manifest', async () => {
    const system: DesignSystemDetail = {
      id: 'user:github-internal-account-design-system',
      title: 'GitHub Internal Account Design System',
      category: 'Custom',
      summary: 'GitHub-backed workspace.',
      swatches: [],
      surface: 'web',
      body: '# GitHub Internal Account Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-github-internal-account-design-system',
    };
    const project: Project = {
      id: 'ds-github-internal-account-design-system',
      name: 'GitHub Internal Account Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    mocks.fetchConnectorStatuses.mockResolvedValue({
      github: { status: 'connected', accountLabel: 'ca_6U6mv_8IzMVR' },
    });
    mockBrandExtractProject(project);
    mocks.patchProject.mockResolvedValue({ ...project, pendingPrompt: 'Create this project as a design system.' });
    const config = {
      composio: { apiKeyConfigured: true, apiKeyTail: 'uQEg' },
    } as AppConfig;

    render(
      <DesignSystemCreationFlow
        onBack={() => {}}
        onCreated={() => {}}
        config={config}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show access methods' }));
    await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/Mission Impastabowl/i), {
      target: { value: 'GitHub: product workspace' },
    });
    addSourceUrl('https://github.com/nexu-io/open-design');
    continueToGeneration();
    confirmExtraction();

    await waitFor(() => expect(mocks.writeProjectTextFile).toHaveBeenCalled());
    const sourceManifestCall = mocks.writeProjectTextFile.mock.calls.find(
      (call) => call[0] === project.id && call[1] === 'context/source-context.md',
    );
    expect(sourceManifestCall?.[2]).toEqual(expect.stringContaining('Connector status: connected.'));
    expect(sourceManifestCall?.[2]).not.toEqual(expect.stringContaining('ca_6U6mv_8IzMVR'));
  });
});

describe('DesignSystemDetailView', () => {
  it('does not silently seed audit repair prompts into the composer after manual runs', async () => {
    const system: DesignSystemDetail = {
      id: 'user:acme-design-system',
      title: 'Acme Design System',
      category: 'Custom',
      summary: 'Acme product workspace.',
      swatches: [],
      surface: 'web',
      body: '# Acme Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-acme-design-system',
    };
    const project: Project = {
      id: 'ds-acme-design-system',
      name: 'Acme Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    const config: AppConfig = {
      mode: 'daemon',
      apiKey: '',
      baseUrl: '',
      model: '',
      agentId: 'agent-1',
      agentModels: {},
      skillId: null,
      designSystemId: null,
    };

    mocks.fetchDesignSystem.mockResolvedValue(system);
    mocks.ensureDesignSystemWorkspace.mockResolvedValue({ project, files: [] });
    mocks.listConversations.mockResolvedValue([
      { id: 'conv-design-system', projectId: project.id, title: 'Design system', createdAt: 1, updatedAt: 1 },
    ]);
    mocks.fetchProjectDesignSystemPackageAudit.mockResolvedValue({
      ok: false,
      projectPath: '/tmp/ds',
      filesInspected: 12,
      errors: [{
        severity: 'error',
        code: 'missing_required_file',
        message: 'README.md is missing.',
        path: 'README.md',
      }],
      warnings: [],
    });
    mocks.streamViaDaemon.mockImplementation(async (options: {
      handlers: { onDone: () => void };
      onRunCreated?: (runId: string) => void;
    }) => {
      options.onRunCreated?.('run-design-system');
      options.handlers.onDone();
    });

    render(
      <DesignSystemDetailView
        id={system.id}
        selectedId={system.id}
        config={config}
        agents={[{ id: 'agent-1', name: 'OpenCode', bin: 'opencode', available: true, models: [] }]}
        onBack={() => {}}
        onSetDefault={() => {}}
      />,
    );

    await screen.findByText('Acme Design System');
    fireEvent.click(screen.getByTestId('design-system-chat-send'));

    await waitFor(() => expect(mocks.fetchProjectDesignSystemPackageAudit).toHaveBeenCalledWith(project.id));
    await waitFor(() =>
      expect(screen.getAllByText(/Package audit found 1 error/).length).toBeGreaterThan(0),
    );
    expect(screen.queryByTestId('chat-initial-draft')?.textContent ?? '').not.toContain(
      'Fix the design-system package audit findings below.',
    );
  });

  it('opens the Design Files workspace when the detail payload omits the optional source field', async () => {
    const system = {
      id: 'user:acme-design-system',
      title: 'Acme Design System',
      category: 'Custom',
      summary: 'Acme product workspace.',
      swatches: [],
      surface: 'web',
      body: '# Acme Design System\n',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-acme-design-system',
    } satisfies Omit<DesignSystemDetail, 'source'>;
    const project: Project = {
      id: 'ds-acme-design-system',
      name: 'Acme Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    const config: AppConfig = {
      mode: 'daemon',
      apiKey: '',
      baseUrl: '',
      model: '',
      agentId: 'agent-1',
      agentModels: {},
      skillId: null,
      designSystemId: null,
    };

    mocks.fetchDesignSystem.mockResolvedValue(system);
    mocks.ensureDesignSystemWorkspace.mockResolvedValue({ project, files: [] });
    mocks.listConversations.mockResolvedValue([
      { id: 'conv-design-system', projectId: project.id, title: 'Design system', createdAt: 1, updatedAt: 1 },
    ]);

    render(
      <DesignSystemDetailView
        id={system.id}
        selectedId={system.id}
        config={config}
        agents={[{ id: 'agent-1', name: 'OpenCode', bin: 'opencode', available: true, models: [] }]}
        onBack={() => {}}
        onSetDefault={() => {}}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Design Files' }));

    await waitFor(() => expect(mocks.ensureDesignSystemWorkspace).toHaveBeenCalledWith(system.id));
    await waitFor(() => expect(screen.getByTestId('design-system-files')).toBeTruthy());
    expect(screen.queryByText('Opening the design system workspace...')).toBeNull();
  });

  it('opens the existing project fallback when workspace creation returns null', async () => {
    const system: DesignSystemDetail = {
      id: 'user:acme-design-system',
      title: 'Acme Design System',
      category: 'Custom',
      summary: 'Acme product workspace.',
      swatches: [],
      surface: 'web',
      body: '# Acme Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-acme-design-system',
    };
    const project: Project = {
      id: 'ds-acme-design-system',
      name: 'Acme Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    const files: ProjectFile[] = [
      { name: 'DESIGN.md', size: 42, mtime: 1, kind: 'text', mime: 'text/markdown' },
    ];
    const config: AppConfig = {
      mode: 'daemon',
      apiKey: '',
      baseUrl: '',
      model: '',
      agentId: 'agent-1',
      agentModels: {},
      skillId: null,
      designSystemId: null,
    };
    const onOpenProject = vi.fn();
    const onProjectsRefresh = vi.fn();

    mocks.fetchDesignSystem.mockResolvedValue(system);
    mocks.ensureDesignSystemWorkspace.mockResolvedValue(null);
    mocks.getProject.mockResolvedValue(project);
    mocks.fetchProjectFiles.mockResolvedValue(files);
    mocks.listConversations.mockResolvedValue([
      { id: 'conv-design-system', projectId: project.id, title: 'Design system', createdAt: 1, updatedAt: 1 },
    ]);

    render(
      <DesignSystemDetailView
        id={system.id}
        selectedId={system.id}
        config={config}
        agents={[{ id: 'agent-1', name: 'OpenCode', bin: 'opencode', available: true, models: [] }]}
        onBack={() => {}}
        onSetDefault={() => {}}
        onOpenProject={onOpenProject}
        onProjectsRefresh={onProjectsRefresh}
      />,
    );

    await waitFor(() => expect(mocks.ensureDesignSystemWorkspace).toHaveBeenCalledWith(system.id));
    await waitFor(() => expect(mocks.getProject).toHaveBeenCalledWith(project.id));
    expect(mocks.fetchProjectFiles).toHaveBeenCalledWith(project.id);
    expect(onProjectsRefresh).toHaveBeenCalledTimes(1);
    expect(onOpenProject).toHaveBeenCalledWith(project.id);
    expect(screen.queryByText('Could not open the design system workspace.')).toBeNull();
  });

  it('shows a terminal error when workspace creation and project fallback both fail', async () => {
    const system: DesignSystemDetail = {
      id: 'user:acme-design-system',
      title: 'Acme Design System',
      category: 'Custom',
      summary: 'Acme product workspace.',
      swatches: [],
      surface: 'web',
      body: '# Acme Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-acme-design-system',
    };
    const config: AppConfig = {
      mode: 'daemon',
      apiKey: '',
      baseUrl: '',
      model: '',
      agentId: 'agent-1',
      agentModels: {},
      skillId: null,
      designSystemId: null,
    };
    const onOpenProject = vi.fn();

    mocks.fetchDesignSystem.mockResolvedValue(system);
    mocks.ensureDesignSystemWorkspace.mockResolvedValue(null);
    mocks.getProject.mockResolvedValue(null);

    render(
      <DesignSystemDetailView
        id={system.id}
        selectedId={system.id}
        config={config}
        agents={[{ id: 'agent-1', name: 'OpenCode', bin: 'opencode', available: true, models: [] }]}
        onBack={() => {}}
        onSetDefault={() => {}}
        onOpenProject={onOpenProject}
      />,
    );

    await waitFor(() => expect(mocks.ensureDesignSystemWorkspace).toHaveBeenCalledWith(system.id));
    await waitFor(() => expect(mocks.getProject).toHaveBeenCalledWith(system.projectId));
    expect(mocks.fetchProjectFiles).not.toHaveBeenCalled();
    expect(onOpenProject).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Design Files' }));
    await waitFor(() => expect(screen.getByText('Could not open the design system workspace.')).toBeTruthy());
    expect(screen.queryByText('Opening the design system workspace...')).toBeNull();
    expect(screen.queryByTestId('design-system-files')).toBeNull();
  });

  it('sends chat through an existing project fallback when workspace creation returns null', async () => {
    const system: DesignSystemDetail = {
      id: 'user:acme-design-system',
      title: 'Acme Design System',
      category: 'Custom',
      summary: 'Acme product workspace.',
      swatches: [],
      surface: 'web',
      body: '# Acme Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-acme-design-system',
    };
    const project: Project = {
      id: 'ds-acme-design-system',
      name: 'Acme Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    const files: ProjectFile[] = [
      { name: 'DESIGN.md', size: 42, mtime: 1, kind: 'text', mime: 'text/markdown' },
    ];
    const config: AppConfig = {
      mode: 'daemon',
      apiKey: '',
      baseUrl: '',
      model: '',
      agentId: 'agent-1',
      agentModels: {},
      skillId: null,
      designSystemId: null,
    };
    const conversation = {
      id: 'conv-design-system',
      projectId: project.id,
      title: 'Design system',
      createdAt: 1,
      updatedAt: 1,
    };

    mocks.fetchDesignSystem.mockResolvedValue(system);
    mocks.ensureDesignSystemWorkspace
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue(null);
    mocks.getProject.mockResolvedValue(project);
    mocks.fetchProjectFiles.mockResolvedValue(files);
    mocks.createConversation.mockResolvedValue(conversation);

    render(
      <DesignSystemDetailView
        id={system.id}
        selectedId={system.id}
        config={config}
        agents={[{ id: 'agent-1', name: 'OpenCode', bin: 'opencode', available: true, models: [] }]}
        onBack={() => {}}
        onSetDefault={() => {}}
      />,
    );

    await waitFor(() => expect(mocks.ensureDesignSystemWorkspace).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('design-system-chat-send'));

    await waitFor(() => expect(mocks.ensureDesignSystemWorkspace).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(mocks.getProject).toHaveBeenCalledWith(project.id);
    expect(mocks.fetchProjectFiles).toHaveBeenCalledWith(project.id);
    expect(mocks.createConversation).toHaveBeenCalledWith(project.id, 'Design system');
    expect(mocks.streamViaDaemon).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        conversationId: conversation.id,
        designSystemId: system.id,
      }),
    );
    expect(screen.queryByText('Could not open the design system workspace.')).toBeNull();
  });

  it('starts a new design-system conversation by opening the workspace first', async () => {
    const system: DesignSystemDetail = {
      id: 'installed:acme-design-system',
      title: 'Acme Design System',
      category: 'Custom',
      summary: 'Acme product workspace.',
      swatches: [],
      surface: 'web',
      body: '# Acme Design System\n',
      source: 'installed',
      status: 'published',
      isEditable: true,
    };
    const project: Project = {
      id: 'ds-acme-design-system',
      name: 'Acme Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    const fresh: Conversation = {
      id: 'conv-new',
      projectId: project.id,
      title: 'Design system',
      createdAt: 1,
      updatedAt: 1,
    };
    mocks.fetchDesignSystem.mockResolvedValue(system);
    mocks.ensureDesignSystemWorkspace
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue({ project, files: [] });
    mocks.createConversation.mockResolvedValue(fresh);

    render(
      <DesignSystemDetailView
        id={system.id}
        selectedId={null}
        config={{ mode: 'daemon', agentId: 'codex' } as AppConfig}
        agents={[]}
        onBack={() => {}}
        onSetDefault={() => {}}
      />,
    );

    const button = await screen.findByTestId('new-conversation');
    fireEvent.click(button);

    await waitFor(() => expect(mocks.ensureDesignSystemWorkspace).toHaveBeenCalledWith(system.id));
    await waitFor(() => expect(mocks.createConversation).toHaveBeenCalledWith(project.id, 'Design system'));
    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    expect(mocks.listConversations).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.listMessages).toHaveBeenCalledWith(project.id, fresh.id));
  });

  it('clears a stale creation error after a successful new conversation retry', async () => {
    const system: DesignSystemDetail = {
      id: 'installed:acme-design-system',
      title: 'Acme Design System',
      category: 'Custom',
      summary: 'Acme product workspace.',
      swatches: [],
      surface: 'web',
      body: '# Acme Design System\n',
      source: 'installed',
      status: 'published',
      isEditable: true,
    };
    const project: Project = {
      id: 'ds-acme-design-system',
      name: 'Acme Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    const fresh: Conversation = {
      id: 'conv-new',
      projectId: project.id,
      title: 'Design system',
      createdAt: 1,
      updatedAt: 1,
    };
    mocks.fetchDesignSystem.mockResolvedValue(system);
    mocks.ensureDesignSystemWorkspace
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue({ project, files: [] });
    mocks.createConversation
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fresh);

    render(
      <DesignSystemDetailView
        id={system.id}
        selectedId={null}
        config={{ mode: 'daemon', agentId: 'codex' } as AppConfig}
        agents={[]}
        onBack={() => {}}
        onSetDefault={() => {}}
      />,
    );

    const button = await screen.findByTestId('new-conversation');
    fireEvent.click(button);

    await screen.findByText('Could not create a design system conversation.');

    fireEvent.click(button);

    await waitFor(() => expect(mocks.createConversation).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(screen.queryByText('Could not create a design system conversation.')).toBeNull();
    });
    await waitFor(() => expect(mocks.listMessages).toHaveBeenCalledWith(project.id, fresh.id));
  });

  it('passes the current UI locale to daemon workspace chat runs', async () => {
    const system: DesignSystemDetail = {
      id: 'user:acme-design-system',
      title: 'Acme Design System',
      category: 'Custom',
      summary: 'Acme product workspace.',
      swatches: [],
      surface: 'web',
      body: '# Acme Design System\n',
      source: 'user',
      status: 'draft',
      isEditable: true,
      projectId: 'ds-acme-design-system',
    };
    const project: Project = {
      id: 'ds-acme-design-system',
      name: 'Acme Design System',
      skillId: null,
      designSystemId: system.id,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
        entryFile: 'DESIGN.md',
        sourceFileName: system.id,
      },
    };
    const config: AppConfig = {
      mode: 'daemon',
      apiKey: '',
      baseUrl: '',
      model: '',
      agentId: 'agent-1',
      agentModels: {},
      skillId: null,
      designSystemId: null,
    };

    mocks.fetchDesignSystem.mockResolvedValue(system);
    mocks.ensureDesignSystemWorkspace.mockResolvedValue({ project, files: [] });
    mocks.listConversations.mockResolvedValue([
      { id: 'conv-design-system', projectId: project.id, title: 'Design system', createdAt: 1, updatedAt: 1 },
    ]);

    render(
      <I18nProvider initial="zh-CN">
        <DesignSystemDetailView
          id={system.id}
          selectedId={system.id}
          config={config}
          agents={[{ id: 'agent-1', name: 'OpenCode', bin: 'opencode', available: true, models: [] }]}
          onBack={() => {}}
          onSetDefault={() => {}}
        />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('design-system-chat-send')).toBeTruthy());
    fireEvent.click(screen.getByTestId('design-system-chat-send'));

    await waitFor(() => expect(mocks.streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(mocks.streamViaDaemon).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        conversationId: 'conv-design-system',
        designSystemId: system.id,
        locale: 'zh-CN',
      }),
    );
  });
});
