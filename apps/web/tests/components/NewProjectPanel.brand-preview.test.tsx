// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrandSummary } from '@open-design/contracts';
import { isOpenDesignHostAvailable, pickHostWorkingDir } from '@open-design/host';
import { NewProjectPanel } from '../../src/components/NewProjectPanel';
import { openFolderDialog } from '../../src/providers/registry';
import type { DesignSystemSummary, SkillSummary } from '../../src/types';

vi.mock('@open-design/host', async () => {
  const actual = await vi.importActual<typeof import('@open-design/host')>('@open-design/host');
  return {
    ...actual,
    isOpenDesignHostAvailable: vi.fn(),
    pickHostWorkingDir: vi.fn(),
  };
});

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    openFolderDialog: vi.fn(),
  };
});

// The brand lookup hook is mocked so the picker resolves a brand for the
// `user:brand-acme` design system without hitting the network.
const { brandsByDesignSystem } = vi.hoisted(() => ({
  brandsByDesignSystem: new Map<string, BrandSummary>(),
}));

vi.mock('../../src/runtime/brands', () => ({
  useBrandsByDesignSystemId: () => brandsByDesignSystem,
}));

const mockedIsHostAvailable = vi.mocked(isOpenDesignHostAvailable);
const mockedOpenFolderDialog = vi.mocked(openFolderDialog);

const skills: SkillSummary[] = [
  {
    id: 'prototype-skill',
    name: 'Prototype',
    description: 'Build prototypes',
    mode: 'prototype',
    surface: 'web',
    previewType: 'html',
    designSystemRequired: true,
    defaultFor: ['prototype'],
    triggers: [],
    upstream: null,
    hasBody: true,
    examplePrompt: 'Build a prototype.',
    aggregatesExamples: false,
  },
];

const designSystems: DesignSystemSummary[] = [
  {
    id: 'clay',
    title: 'Clay',
    summary: 'Friendly tactile product UI.',
    category: 'Product',
    swatches: ['#f4efe7', '#25211d'],
    source: 'built-in',
    status: 'published',
  },
  {
    id: 'user:brand-acme',
    title: 'Acme',
    summary: 'Acme brand kit.',
    category: 'Brand',
    swatches: ['#0b5fff', '#0a0a0a'],
    source: 'user',
    status: 'published',
  },
];

const acmeBrand: BrandSummary = {
  meta: {
    id: 'brand-acme',
    sourceUrl: 'https://acme.example.com',
    createdAt: 0,
    updatedAt: 0,
    status: 'ready',
    designSystemId: 'user:brand-acme',
    projectId: 'proj-acme',
  },
  brand: {
    name: 'Acme',
    tagline: 'Build the future, faster.',
    description: 'Acme is a bold engineering brand for fast-moving teams.',
    sourceUrl: 'https://acme.example.com',
    logo: { primary: 'logos/acme.svg', alternates: [], notes: '' },
    colors: [
      { role: 'accent', hex: '#0b5fff', oklch: '', name: 'Signal Blue', usage: 'Primary actions' },
      { role: 'background', hex: '#0a0a0a', oklch: '', name: 'Ink', usage: 'Surfaces' },
    ],
    typography: {
      display: { family: 'Space Grotesk', fallbacks: ['sans-serif'], weights: [500, 700] },
      body: { family: 'Inter', fallbacks: ['sans-serif'], weights: [400, 600] },
    },
    voice: { adjectives: [], tone: '', messagingPillars: [], vocabulary: { use: [], avoid: [] } },
    imagery: { style: '', subjects: [], treatment: '', avoid: [], samples: [] },
    layout: { radius: '', borderWeight: '', spacing: '', postureRules: [] },
  },
};

const originalResizeObserver = globalThis.ResizeObserver;
const originalScrollIntoView = Element.prototype.scrollIntoView;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
  mockedIsHostAvailable.mockReturnValue(false);
  mockedOpenFolderDialog.mockResolvedValue(null);
  brandsByDesignSystem.clear();
  brandsByDesignSystem.set('user:brand-acme', acmeBrand);
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
  Element.prototype.scrollIntoView = originalScrollIntoView;
  vi.unstubAllGlobals();
});

describe('NewProjectPanel brand preview flyout', () => {
  function renderPanel(defaultDesignSystemId: string | null = 'user:brand-acme') {
    return render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId={defaultDesignSystemId}
        templates={[]}
        onDeleteTemplate={vi.fn()}
        promptTemplates={[]}
        onCreate={vi.fn()}
      />,
    );
  }

  it('shows the rich brand card when the selected design system is a brand', () => {
    renderPanel('user:brand-acme');

    fireEvent.click(screen.getByTestId('design-system-trigger'));

    const flyout = screen.getByTestId('new-project-ds-brand-flyout');
    expect(flyout).toBeTruthy();
    expect(screen.getByTestId('brand-preview-card').getAttribute('data-variant')).toBe('compact');
    expect(screen.getByText('Acme is a bold engineering brand for fast-moving teams.')).toBeTruthy();
    expect(screen.getByText('Space Grotesk')).toBeTruthy();
    expect(screen.getByText('#0b5fff')).toBeTruthy();
  });

  it('keeps the flyout hidden for a non-brand selection', () => {
    renderPanel('clay');

    fireEvent.click(screen.getByTestId('design-system-trigger'));

    expect(screen.queryByTestId('new-project-ds-brand-flyout')).toBeNull();
  });

  it('previews the hovered brand even when the current selection is a non-brand system', () => {
    renderPanel('clay');

    fireEvent.click(screen.getByTestId('design-system-trigger'));
    expect(screen.queryByTestId('new-project-ds-brand-flyout')).toBeNull();

    fireEvent.mouseEnter(screen.getByRole('option', { name: /Acme/i }));

    expect(screen.getByTestId('new-project-ds-brand-flyout')).toBeTruthy();
    expect(screen.getByText('Acme is a bold engineering brand for fast-moving teams.')).toBeTruthy();
  });
});
