// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';

import { DesignSystemPreviewModal } from '../../src/components/DesignSystemPreviewModal';
import { I18nProvider } from '../../src/i18n';
import type { DesignSystemSummary } from '../../src/types';

// Regression coverage: the Visualize ("kit") tab renders live DOM into
// `.ds-modal-stage-custom`, a stage-sized flex container with
// `overflow: visible` — and the stage frame around it
// (`.ds-modal-stage-iframe`) is `overflow: hidden`. A kit taller than the
// modal was therefore clipped with no scrollable ancestor anywhere in the
// chain, so the left half of the preview modal could not be scrolled at all.
// The kit view must mount inside `.ds-modal-rich-kit`, the wrapper whose
// stylesheet contract is the scroll region (`flex: 1; min-height: 0;
// overflow: auto`), so the wheel has a scroll container to act on.

const { fetchDesignSystemMock, fetchProjectFileTextMock, projectRawUrlMock } = vi.hoisted(() => ({
  fetchDesignSystemMock: vi.fn(async () => ({
    id: 'claymorphism',
    title: 'Claymorphism',
    summary: 'Bundled design system',
    category: 'style',
    body: '# Claymorphism',
  })),
  fetchProjectFileTextMock: vi.fn(async (_projectId: string, filePath: string) =>
    filePath === 'brand.json'
      ? JSON.stringify({
          name: 'Claymorphism',
          logo: { primary: 'logos/mark.svg', alternates: [], notes: '' },
          colors: [],
          typography: {},
        })
      : null,
  ),
  projectRawUrlMock: vi.fn(
    (projectId: string, filePath: string, context?: WorkspaceCollabContext | null) =>
      context
        ? `/raw/${projectId}/${filePath}?workspaceId=${context.workspaceId}&workspaceMemberId=${context.workspaceMemberId}`
        : `/raw/${projectId}/${filePath}`,
  ),
}));

vi.mock('../../src/providers/registry', () => ({
  designSystemStaticUrl: (id: string, filePath: string) => `/design-systems/${id}/${filePath}`,
  fetchDesignSystem: fetchDesignSystemMock,
  fetchDesignSystemPreview: vi.fn(async () => '<!doctype html><p>tokens</p>'),
  fetchDesignSystemShowcase: vi.fn(async () => '<!doctype html><p>showcase</p>'),
  fetchProjectFileText: fetchProjectFileTextMock,
  openExternalUrl: vi.fn(),
  projectRawUrl: projectRawUrlMock,
}));

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({ context: null, resourceReadIdentity: null, loading: false }),
  workspaceResourceReadContext: (state: { context: WorkspaceCollabContext | null }) => state.context,
}));

const SYSTEM = {
  id: 'claymorphism',
  title: 'Claymorphism',
  summary: 'Bundled design system',
  category: 'style',
  source: 'built-in',
} as DesignSystemSummary;

describe('DesignSystemPreviewModal kit scrolling', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    fetchDesignSystemMock.mockClear();
    fetchProjectFileTextMock.mockClear();
    projectRawUrlMock.mockClear();
  });

  it('mounts the kit view inside the scrollable rich-kit wrapper', () => {
    render(
      <I18nProvider>
        <DesignSystemPreviewModal system={SYSTEM} initialViewId="kit" onClose={() => {}} />
      </I18nProvider>,
    );

    const kit = screen.getByTestId('design-system-modal-kit');
    expect(kit.classList.contains('ds-modal-rich-kit')).toBe(true);
    // Still inside the shared custom stage — the wrapper is what gives that
    // stage's kit branch its own scroll container.
    expect(kit.closest('.ds-modal-stage-custom')).not.toBeNull();
  });
});
