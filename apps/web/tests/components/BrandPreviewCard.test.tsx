// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrandSummary } from '@open-design/contracts';

vi.mock('../../src/providers/registry', () => ({
  projectRawUrl: (projectId: string, filePath: string) => `/raw/${projectId}/${filePath}`,
}));

import { BrandPreviewCard } from '../../src/components/BrandPreviewCard';
import { I18nProvider } from '../../src/i18n';

const rampBrand: BrandSummary = {
  meta: {
    id: 'brand-ramp',
    sourceUrl: 'https://ramp.com',
    createdAt: 0,
    updatedAt: 0,
    status: 'ready',
    designSystemId: 'user:brand-ramp',
    projectId: 'project-ramp',
  },
  brand: {
    name: 'Ramp',
    tagline: 'Spend smarter. Move faster.',
    description: 'Ramp is an all-in-one spend management platform.',
    sourceUrl: 'https://ramp.com',
    logo: { primary: 'logos/ramp.svg', alternates: [], notes: '' },
    colors: [
      { role: 'accent', hex: '#eaff00', oklch: '', name: 'Ramp Lime', usage: 'Primary actions' },
    ],
    typography: {
      display: { family: 'Inter', fallbacks: ['sans-serif'], weights: [600, 700] },
      body: { family: 'Inter', fallbacks: ['sans-serif'], weights: [400, 500] },
    },
    voice: { adjectives: [], tone: '', messagingPillars: [], vocabulary: { use: [], avoid: [] } },
    imagery: { style: '', subjects: [], treatment: '', avoid: [], samples: [] },
    layout: { radius: '', borderWeight: '', spacing: '', postureRules: [] },
  },
};

describe('BrandPreviewCard', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/brands/brand-ramp');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('re-enables panel actions after Use in new chat navigates away while the card stays mounted', async () => {
    const onApplyDesignSystem = vi.fn();
    const onOpenProject = vi.fn();

    render(
      <I18nProvider initial="en">
        <BrandPreviewCard
          summary={rampBrand}
          variant="panel"
          onApplyDesignSystem={onApplyDesignSystem}
          onOpenProject={onOpenProject}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('brand-preview-use'));

    await waitFor(() => {
      expect(onApplyDesignSystem).toHaveBeenCalledWith('user:brand-ramp');
      expect(window.location.pathname).toBe('/');
      expect((screen.getByTestId('brand-preview-use') as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByTestId('brand-preview-open-project') as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByTestId('brand-preview-delete') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('closes the brand asset preview modal with Escape', async () => {
    render(
      <I18nProvider initial="en">
        <BrandPreviewCard summary={rampBrand} variant="panel" />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /landing page/i }));
    expect(screen.getByRole('dialog', { name: /landing page/i })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /landing page/i })).toBeNull();
    });
  });
});
