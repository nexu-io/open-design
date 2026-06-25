// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrandSummary, DesignSystemSummary } from '@open-design/contracts';

vi.mock('../../src/providers/registry', () => ({
  fetchDesignSystemPreview: vi.fn(),
  projectRawUrl: (projectId: string, filePath: string) => `/raw/${projectId}/${filePath}`,
}));

// The brand lookup hook is mocked so the picker resolves a brand for the
// `user:brand-acme` design system without hitting the network. The map is
// hoisted so the factory can close over it and tests can seed entries.
const { brandsByDesignSystem } = vi.hoisted(() => ({
  brandsByDesignSystem: new Map<string, BrandSummary>(),
}));

vi.mock('../../src/runtime/brands', () => ({
  useBrandsByDesignSystemId: () => brandsByDesignSystem,
}));

vi.mock('../../src/components/DesignSystemPreviewModal', () => ({
  DesignSystemPreviewModal: ({
    system,
    onClose,
  }: {
    system: DesignSystemSummary;
    onClose: () => void;
  }) => (
    <div role="dialog" data-testid="design-system-preview-modal">
      <span>{system.title}</span>
      <button type="button" onClick={onClose}>Close</button>
    </div>
  ),
}));

import { DesignSystemPicker } from '../../src/components/DesignSystemPicker';
import { I18nProvider, type Locale } from '../../src/i18n';
import { fetchDesignSystemPreview } from '../../src/providers/registry';

const fetchDesignSystemPreviewMock = vi.mocked(fetchDesignSystemPreview);

const designSystems: DesignSystemSummary[] = [
  {
    id: 'clay',
    title: 'Clay',
    summary: 'Friendly tactile product UI.',
    category: 'Product',
    swatches: ['#f4efe7', '#25211d'],
  },
  {
    id: 'user:brand-acme',
    title: 'Acme',
    summary: 'Acme brand kit.',
    category: 'Brand',
    source: 'user',
    swatches: ['#0b5fff', '#0a0a0a'],
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

beforeEach(() => {
  fetchDesignSystemPreviewMock.mockResolvedValue('<html><body><h1>Preview</h1></body></html>');
  brandsByDesignSystem.clear();
  brandsByDesignSystem.set('user:brand-acme', acmeBrand);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DesignSystemPicker brand preview', () => {
  function renderPicker(
    props: Partial<ComponentProps<typeof DesignSystemPicker>> = {},
    locale: Locale = 'en',
  ) {
    return render(
      <I18nProvider initial={locale}>
        <DesignSystemPicker
          designSystems={designSystems}
          selectedId="user:brand-acme"
          onChange={vi.fn()}
          {...props}
        />
      </I18nProvider>,
    );
  }

  it('renders the rich brand card when the selected design system is a brand', async () => {
    renderPicker();

    fireEvent.click(screen.getByTestId('project-ds-picker-trigger'));

    // The brand-backed system previews the Brand Kit card (identity blurb +
    // typography specimen + palette), not the thin design-system iframe.
    const brandPane = await screen.findByTestId('project-ds-picker-preview-brand');
    expect(brandPane).toBeTruthy();
    expect(screen.getByTestId('brand-preview-card').getAttribute('data-variant')).toBe('compact');
    expect(screen.getByText('Acme is a bold engineering brand for fast-moving teams.')).toBeTruthy();
    expect(screen.getByText('Space Grotesk')).toBeTruthy();
    expect(screen.getByText('#0b5fff')).toBeTruthy();
    expect(screen.queryByTestId('project-ds-picker-preview-frame')).toBeNull();

    fireEvent.click(screen.getByTestId('project-ds-picker-preview-expand'));
    expect(screen.getByTestId('design-system-preview-modal')).toBeTruthy();
  });

  it('falls back to the thin design-system preview for a non-brand system', async () => {
    renderPicker();

    fireEvent.click(screen.getByTestId('project-ds-picker-trigger'));
    await screen.findByTestId('project-ds-picker-preview-brand');

    fireEvent.mouseEnter(screen.getByTestId('project-ds-picker-option-clay'));

    await waitFor(() => {
      expect(fetchDesignSystemPreviewMock).toHaveBeenCalledWith('clay');
    });
    expect(await screen.findByTestId('project-ds-picker-preview-frame')).toBeTruthy();
    expect(screen.queryByTestId('project-ds-picker-preview-brand')).toBeNull();
  });
});
