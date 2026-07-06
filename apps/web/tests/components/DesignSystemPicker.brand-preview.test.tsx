// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrandSummary, DesignSystemSummary } from '@open-design/contracts';

vi.mock('../../src/providers/registry', () => ({
  designSystemStaticUrl: (id: string, filePath: string) => `/design-systems/${id}/${filePath}`,
  fetchDesignSystem: vi.fn(),
  fetchProjectFileText: vi.fn(),
  openExternalUrl: vi.fn(),
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
import {
  fetchDesignSystem,
  fetchProjectFileText,
} from '../../src/providers/registry';

const fetchDesignSystemMock = vi.mocked(fetchDesignSystem);
const fetchProjectFileTextMock = vi.mocked(fetchProjectFileText);

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
  fetchDesignSystemMock.mockImplementation(async (id) => ({
    id,
    title: id === 'clay' ? 'Clay' : 'Acme',
    summary: id === 'clay' ? 'Friendly tactile product UI.' : 'Acme brand kit.',
    category: id === 'clay' ? 'Product' : 'Brand',
    body: id === 'clay'
      ? [
          '# Clay',
          '',
          'Friendly tactile product UI.',
          '',
          '## Typography',
          '- Display: Fraunces',
          '- Body: Inter',
          '',
          '## Color Palette',
          '- Warm Paper #f4efe7',
          '- Ink #25211d',
        ].join('\n')
      : '# Acme',
    swatches: id === 'clay' ? ['#f4efe7', '#25211d'] : ['#0b5fff', '#0a0a0a'],
  }));
  fetchProjectFileTextMock.mockResolvedValue(null);
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

    // The brand-backed system previews the compact Brand Kit card (identity
    // blurb + typography specimen + palette), not the thin design-system iframe.
    const brandPane = await screen.findByTestId('project-ds-picker-preview-kit');
    expect(brandPane).toBeTruthy();
    expect(screen.getByTestId('project-ds-picker-preview-kit-view').getAttribute('data-variant')).toBe('compact');
    expect(screen.getByText('Acme is a bold engineering brand for fast-moving teams.')).toBeTruthy();
    expect(screen.queryByTestId('design-kit-logo-section')).toBeNull();
    expect(screen.getByText('Space Grotesk')).toBeTruthy();
    expect(screen.getByText('#0b5fff')).toBeTruthy();
    expect(screen.queryByTestId('project-ds-picker-preview-frame')).toBeNull();

    fireEvent.click(screen.getByTestId('project-ds-picker-preview-expand'));
    expect(screen.getByTestId('design-system-preview-modal')).toBeTruthy();
  });

  it('uses the kit preview for a non-brand system too', async () => {
    renderPicker();

    fireEvent.click(screen.getByTestId('project-ds-picker-trigger'));
    await screen.findByTestId('project-ds-picker-preview-kit');

    fireEvent.mouseEnter(screen.getByTestId('project-ds-picker-option-clay'));

    await waitFor(() => {
      expect(fetchDesignSystemMock).toHaveBeenCalledWith('clay');
    });
    expect(await screen.findByTestId('project-ds-picker-preview-kit-view')).toBeTruthy();
    expect(screen.getByText('Friendly tactile product UI.')).toBeTruthy();
    expect(screen.queryByTestId('design-kit-logo-section')).toBeNull();
    expect(screen.queryByTestId('project-ds-picker-preview-frame')).toBeNull();
  });
});
