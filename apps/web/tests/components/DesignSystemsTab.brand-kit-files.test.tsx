// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';

import { DesignSystemsTab } from '../../src/components/DesignSystemsTab';
import { I18nProvider } from '../../src/i18n';
import type { DesignSystemDetail, DesignSystemSummary } from '../../src/types';
import { workspaceContextFixture } from '../helpers/workspace-context';

const workspaceHarness = vi.hoisted(() => ({ state: null as any }));
const registryMocks = vi.hoisted(() => ({
  fetchDesignSystem: vi.fn(),
  fetchProjectFileText: vi.fn(),
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
    fetchProjectFileText: registryMocks.fetchProjectFileText,
    updateDesignSystemDraft: vi.fn(async () => null),
    deleteDesignSystemDraft: vi.fn(async () => true),
    projectRawUrl: (projectId: string, filePath: string, _context?: WorkspaceCollabContext | null) =>
      `/raw/${projectId}/${filePath}`,
  };
});

const CONTEXT = workspaceContextFixture({
  workspaceId: 'ws-kit',
  workspaceMemberId: 'member-kit',
  workspaceType: 'personal',
});

const SYSTEM: DesignSystemSummary = {
  id: 'user:acme',
  title: 'Acme',
  summary: 'Acme product system',
  category: 'Brands',
  source: 'user',
  status: 'published',
  isEditable: true,
  projectId: 'ds-acme',
};

const BRAND = {
  name: 'Acme',
  tagline: '',
  description: '',
  sourceUrl: '',
  logo: { primary: null, alternates: [], notes: '' },
  colors: [{ role: 'accent', name: 'Accent', hex: '#005ce8', usage: '' }],
  typography: {
    display: { family: 'Inter', fallbacks: [], weights: [] },
    body: { family: 'Inter', fallbacks: [], weights: [] },
  },
  voice: { adjectives: [], tone: '', messagingPillars: [], vocabulary: { use: [], avoid: [] } },
  imagery: { style: '', subjects: [], treatment: '', avoid: [], samples: [] },
  layout: { radius: '', borderWeight: '', spacing: '', postureRules: [] },
};

const DETAIL: DesignSystemDetail = {
  ...SYSTEM,
  body: '# Acme',
  packageInfo: {
    availableFiles: ['DESIGN.md', 'system/kit.html', 'preview/colors.html'],
    manifest: {
      schemaVersion: 'od-design-system-project/v1',
      id: 'acme',
      name: 'Acme',
      category: 'Brands',
      files: { design: 'DESIGN.md', tokens: 'tokens.css', components: 'components.html' },
      preview: { dir: 'preview', pages: [{ path: 'preview/colors.html', role: 'colors', title: 'Colors' }] },
    },
  },
};

function iframeSources(container: HTMLElement): string[] {
  return [...container.querySelectorAll('iframe')].map((frame) => frame.getAttribute('src') ?? '');
}

beforeEach(() => {
  workspaceHarness.state = {
    context: CONTEXT,
    resourceReadIdentity: { context: CONTEXT, generation: 'generation-a' },
    loading: false,
    identityChangePending: false,
  };
  registryMocks.fetchDesignSystem.mockReset();
  registryMocks.fetchProjectFileText.mockReset();
  registryMocks.fetchProjectFileText.mockImplementation((_projectId: string, fileName: string) =>
    Promise.resolve(fileName === 'brand.json' ? JSON.stringify(BRAND) : null),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('design-system tab brand kit files', () => {
  it('never points at artifact files the package lacks, even before the detail arrives', async () => {
    let resolveDetail!: (detail: DesignSystemDetail) => void;
    registryMocks.fetchDesignSystem.mockReturnValue(
      new Promise<DesignSystemDetail>((resolve) => {
        resolveDetail = resolve;
      }),
    );

    const view = render(
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

    await waitFor(() => expect(registryMocks.fetchProjectFileText).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(iframeSources(view.container).filter((src) => src.includes('system/'))).toEqual([]);

    await act(async () => {
      resolveDetail(DETAIL);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(iframeSources(view.container)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('/raw/ds-acme/system/kit.html'),
          expect.stringContaining('/raw/ds-acme/preview/colors.html'),
        ]),
      );
    });
    expect(iframeSources(view.container).some((src) => src.includes('system/artifacts/'))).toBe(false);
  });
});
