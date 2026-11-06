// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';

import { DesignSystemPreviewModal } from '../../src/components/DesignSystemPreviewModal';
import { DesignSystemsTab } from '../../src/components/DesignSystemsTab';
import { BrandLogo } from '../../src/components/DesignKitView';
import { I18nProvider } from '../../src/i18n';
import type { DesignSystemDetail, DesignSystemSummary } from '../../src/types';
import { workspaceContextFixture } from '../helpers/workspace-context';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const workspaceHarness = vi.hoisted(() => ({ state: null as any }));
const registryMocks = vi.hoisted(() => ({
  fetchDesignSystem: vi.fn(),
  fetchDesignSystemPreview: vi.fn(),
  fetchDesignSystemShowcase: vi.fn(),
  fetchProjectFileText: vi.fn(),
  updateDesignSystemDraft: vi.fn(),
}));

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => workspaceHarness.state,
}));

vi.mock('../../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn(),
}));

vi.mock('../../src/collab/workspace-snapshot-activation', () => ({
  useWorkspaceSnapshotActivation: () => vi.fn(),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchDesignSystem: registryMocks.fetchDesignSystem,
    fetchDesignSystemPreview: registryMocks.fetchDesignSystemPreview,
    fetchDesignSystemShowcase: registryMocks.fetchDesignSystemShowcase,
    fetchProjectFileText: registryMocks.fetchProjectFileText,
    updateDesignSystemDraft: registryMocks.updateDesignSystemDraft,
    deleteDesignSystemDraft: vi.fn(async () => true),
    projectRawUrl: (
      projectId: string,
      filePath: string,
      context?: WorkspaceCollabContext | null,
    ) => `/raw/${projectId}/${filePath}?workspace=${context?.workspaceId ?? 'none'}`,
  };
});

const CONTEXT = workspaceContextFixture({
  workspaceId: 'ws-read',
  workspaceMemberId: 'member-read',
  workspaceType: 'personal',
});

const SYSTEM: DesignSystemSummary = {
  id: 'user:generation-fence',
  title: 'Generation Fence',
  summary: 'Generation scoped system',
  category: 'Custom',
  source: 'user',
  status: 'draft',
  isEditable: true,
  projectId: 'project-generation-fence',
};

function setWorkspaceGeneration(
  generation: string,
  verifiedContext: WorkspaceCollabContext | null = CONTEXT,
  readContext: WorkspaceCollabContext = CONTEXT,
) {
  workspaceHarness.state = {
    context: verifiedContext,
    resourceReadIdentity: { context: readContext, generation },
    loading: false,
    identityChangePending: false,
  };
}

function renderModal() {
  return render(
    <I18nProvider initial="en">
      <DesignSystemPreviewModal system={SYSTEM} onClose={() => {}} />
    </I18nProvider>,
  );
}

function renderTab() {
  return render(
    <I18nProvider initial="en">
      <DesignSystemsTab
        systems={[SYSTEM]}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />
    </I18nProvider>,
  );
}

beforeEach(() => {
  setWorkspaceGeneration('generation-a');
  registryMocks.fetchDesignSystem.mockReset();
  registryMocks.fetchDesignSystemPreview.mockReset();
  registryMocks.fetchDesignSystemShowcase.mockReset();
  registryMocks.fetchProjectFileText.mockReset();
  registryMocks.updateDesignSystemDraft.mockReset();
  registryMocks.updateDesignSystemDraft.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('design-system resource read identity', () => {
  it('re-reads modal detail and project assets when only the generation changes and drops late A', async () => {
    const generationADetails: Array<ReturnType<typeof deferred<DesignSystemDetail | null>>> = [];
    const generationAAssets: Array<ReturnType<typeof deferred<string | null>>> = [];
    let issuingGeneration = 'generation-a';

    registryMocks.fetchDesignSystem.mockImplementation(() => {
      if (issuingGeneration === 'generation-b') {
        return Promise.resolve({
          ...SYSTEM,
          body: '# Generation B\n\nB detail won',
        });
      }
      const pending = deferred<DesignSystemDetail | null>();
      generationADetails.push(pending);
      return pending.promise;
    });
    registryMocks.fetchProjectFileText.mockImplementation((_projectId: string, fileName: string) => {
      if (issuingGeneration === 'generation-b') {
        return Promise.resolve(fileName === 'brand.json'
          ? JSON.stringify({ logo: { primary: 'generation-b.svg' } })
          : '# Generation B\n\nB project asset won');
      }
      const pending = deferred<string | null>();
      generationAAssets.push(pending);
      return pending.promise;
    });

    const view = renderModal();
    await waitFor(() => expect(registryMocks.fetchDesignSystem).toHaveBeenCalled());
    const generationADetailCount = registryMocks.fetchDesignSystem.mock.calls.length;
    const generationAAssetCount = registryMocks.fetchProjectFileText.mock.calls.length;

    issuingGeneration = 'generation-b';
    setWorkspaceGeneration('generation-b');
    view.rerender(
      <I18nProvider initial="en">
        <DesignSystemPreviewModal system={SYSTEM} onClose={() => {}} />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(registryMocks.fetchDesignSystem.mock.calls.length).toBeGreaterThan(generationADetailCount);
      expect(registryMocks.fetchProjectFileText.mock.calls.length).toBeGreaterThan(generationAAssetCount);
    });
    await screen.findByText('B detail won');

    await act(async () => {
      for (const pending of generationADetails) {
        pending.resolve({ ...SYSTEM, body: '# Generation A\n\nA detail arrived late' });
      }
      for (const pending of generationAAssets) {
        pending.resolve('# Generation A\n\nA project asset arrived late');
      }
      await Promise.resolve();
    });

    expect(screen.getAllByText('B detail won').length).toBeGreaterThan(0);
    expect(screen.queryByText('A detail arrived late')).toBeNull();
    expect(screen.queryByText('A project asset arrived late')).toBeNull();
    expect(registryMocks.fetchDesignSystem.mock.calls.every((call) => call[1] === CONTEXT)).toBe(true);
  });

  it('re-reads tab detail and row logo on generation change and keeps the late A logo out', async () => {
    const generationADetails: Array<ReturnType<typeof deferred<DesignSystemDetail | null>>> = [];
    const generationAAssets: Array<ReturnType<typeof deferred<string | null>>> = [];
    let issuingGeneration = 'generation-a';

    registryMocks.fetchDesignSystem.mockImplementation(() => {
      if (issuingGeneration === 'generation-b') {
        return Promise.resolve({ ...SYSTEM, body: '# Generation B\n\nTab B detail' });
      }
      const pending = deferred<DesignSystemDetail | null>();
      generationADetails.push(pending);
      return pending.promise;
    });
    registryMocks.fetchProjectFileText.mockImplementation((_projectId: string, fileName: string) => {
      if (issuingGeneration === 'generation-b') {
        return Promise.resolve(fileName === 'brand.json'
          ? JSON.stringify({ logo: { primary: 'generation-b.svg' } })
          : '# Generation B\n\nTab B project asset');
      }
      const pending = deferred<string | null>();
      generationAAssets.push(pending);
      return pending.promise;
    });

    const view = renderTab();
    await waitFor(() => expect(registryMocks.fetchDesignSystem).toHaveBeenCalledTimes(1));
    const generationAAssetCount = registryMocks.fetchProjectFileText.mock.calls.length;

    issuingGeneration = 'generation-b';
    setWorkspaceGeneration('generation-b');
    view.rerender(
      <I18nProvider initial="en">
        <DesignSystemsTab
          systems={[SYSTEM]}
          selectedId={null}
          onSelect={() => {}}
          onCreate={() => {}}
          onOpenSystem={() => {}}
        />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(registryMocks.fetchDesignSystem).toHaveBeenCalledTimes(2);
      expect(registryMocks.fetchProjectFileText.mock.calls.length).toBeGreaterThan(generationAAssetCount);
      const logo = screen.getByTestId(`design-system-card-${SYSTEM.id}`).querySelector('img');
      expect(logo?.getAttribute('src')).toContain('generation-b.svg');
    });

    await act(async () => {
      for (const pending of generationADetails) {
        pending.resolve({ ...SYSTEM, body: '# Generation A\n\nTab A detail arrived late' });
      }
      for (const pending of generationAAssets) {
        pending.resolve(JSON.stringify({ logo: { primary: 'generation-a.svg' } }));
      }
      await Promise.resolve();
    });

    const logo = screen.getByTestId(`design-system-card-${SYSTEM.id}`).querySelector('img');
    expect(logo?.getAttribute('src')).toContain('generation-b.svg');
    expect(logo?.getAttribute('src')).not.toContain('generation-a.svg');
  });

  it.each([
    ['showcase', registryMocks.fetchDesignSystemShowcase],
    ['tokens', registryMocks.fetchDesignSystemPreview],
  ] as const)('fences the modal lazy %s response by generation', async (viewId, fetchLazy) => {
    const generationA = deferred<string | null>();
    let issuingGeneration = 'generation-a';
    registryMocks.fetchDesignSystem.mockResolvedValue({ ...SYSTEM, body: '# Stable detail' });
    registryMocks.fetchProjectFileText.mockResolvedValue(null);
    fetchLazy.mockImplementation(() => issuingGeneration === 'generation-b'
      ? Promise.resolve(`<!doctype html><p>${viewId} generation B</p>`)
      : generationA.promise);

    const view = render(
      <I18nProvider initial="en">
        <DesignSystemPreviewModal
          system={SYSTEM}
          initialViewId={viewId}
          onClose={() => {}}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(fetchLazy).toHaveBeenCalledTimes(1));

    issuingGeneration = 'generation-b';
    setWorkspaceGeneration('generation-b');
    view.rerender(
      <I18nProvider initial="en">
        <DesignSystemPreviewModal
          system={SYSTEM}
          initialViewId={viewId}
          onClose={() => {}}
        />
      </I18nProvider>,
    );

    await waitFor(() => expect(fetchLazy.mock.calls.length).toBeGreaterThanOrEqual(2));
    await waitFor(() => {
      expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain(`${viewId} generation B`);
    });

    await act(async () => {
      generationA.resolve(`<!doctype html><p>${viewId} generation A late</p>`);
      await Promise.resolve();
    });
    expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain(`${viewId} generation B`);
    expect(document.querySelector('iframe')?.getAttribute('srcdoc')).not.toContain('generation A late');
  });

  it('retries an unchanged logo URL when the read generation advances', () => {
    const view = render(
      <BrandLogo
        logoSrc="/same-logo.svg"
        name="Generation logo"
        faviconSize={64}
        readGeneration="generation-a"
      />,
    );
    fireEvent.error(view.container.querySelector('img')!);
    expect(view.container.querySelector('img')).toBeNull();

    view.rerender(
      <BrandLogo
        logoSrc="/same-logo.svg"
        name="Generation logo"
        faviconSize={64}
        readGeneration="generation-b"
      />,
    );

    expect(view.container.querySelector('img')?.getAttribute('src')).toBe('/same-logo.svg');
  });

  it('keeps mutations on verified context instead of the provisional read identity', async () => {
    const verifiedContext = workspaceContextFixture({
      workspaceId: 'ws-verified',
      workspaceMemberId: 'member-verified',
      workspaceType: 'personal',
    });
    const provisionalContext = workspaceContextFixture({
      workspaceId: 'ws-provisional',
      workspaceMemberId: 'member-provisional',
      workspaceType: 'personal',
    });
    setWorkspaceGeneration('generation-provisional', verifiedContext, provisionalContext);
    registryMocks.fetchDesignSystem.mockResolvedValue({ ...SYSTEM, body: '# Provisional read' });
    registryMocks.fetchProjectFileText.mockResolvedValue(null);

    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Draft' }));

    expect(registryMocks.updateDesignSystemDraft).toHaveBeenCalledWith(
      SYSTEM.id,
      { status: 'published' },
      verifiedContext,
    );
    expect(registryMocks.fetchDesignSystem).toHaveBeenCalledWith(SYSTEM.id, provisionalContext);
  });
});
