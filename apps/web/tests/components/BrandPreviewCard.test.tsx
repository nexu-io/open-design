// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrandSummary } from '@open-design/contracts';

vi.mock('../../src/providers/registry', () => ({
  projectRawUrl: (projectId: string, filePath: string) => `/raw/${projectId}/${filePath}`,
}));

import { BrandPreviewCard } from '../../src/components/BrandPreviewCard';
import { I18nProvider } from '../../src/i18n';
import { consumePendingHomeChip, consumePendingHomeNotice } from '../../src/runtime/home-intent';

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

  it('queues a visible confirmation notice naming the brand on Use in new chat', async () => {
    // Drain any latched intent from a prior test so the assertion is clean.
    consumePendingHomeChip();
    consumePendingHomeNotice();

    render(
      <I18nProvider initial="en">
        <BrandPreviewCard summary={rampBrand} variant="panel" onApplyDesignSystem={vi.fn()} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('brand-preview-use'));

    await waitFor(() => {
      expect(consumePendingHomeChip()).toBe('prototype');
    });
    // The notice makes the otherwise-silent navigate+apply verifiable on Home.
    expect(consumePendingHomeNotice()).toBe('Using Ramp');
  });

  it('shows a Needs input badge and hint when the backing run awaits the user', () => {
    const blocked: BrandSummary = {
      ...rampBrand,
      meta: { ...rampBrand.meta, status: 'needs_input', designSystemId: undefined },
    };

    render(
      <I18nProvider initial="en">
        <BrandPreviewCard summary={blocked} variant="panel" onApplyDesignSystem={vi.fn()} />
      </I18nProvider>,
    );

    expect(screen.getByText('Needs input')).toBeTruthy();
    expect(
      screen.getByText(
        'Extraction paused — open the project to finish verification or answer the question.',
      ),
    ).toBeTruthy();
  });

  it('does not mount design-system iframes for an in-progress brand', () => {
    const extracting: BrandSummary = {
      ...rampBrand,
      meta: { ...rampBrand.meta, status: 'extracting' },
    };

    const { container } = render(
      <I18nProvider initial="en">
        <BrandPreviewCard summary={extracting} variant="panel" onApplyDesignSystem={vi.fn()} />
      </I18nProvider>,
    );

    expect(screen.getByText('Extracting…')).toBeTruthy();
    expect(container.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('clears the parent detail after deleting a brand', async () => {
    const events: string[] = [];
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).startsWith('/api/brands/') && init?.method === 'DELETE') {
          events.push('fetch-delete');
        }
        return { ok: true, json: async () => ({}) };
      }),
    );

    render(
      <I18nProvider initial="en">
        <BrandPreviewCard
          summary={rampBrand}
          variant="panel"
          onBeforeMutation={() => {
            events.push('clear-preview');
          }}
          onChanged={() => {
            events.push('refresh');
          }}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('brand-preview-delete'));

    await waitFor(() => {
      expect(events).toContain('refresh');
    });
    expect(events).toEqual(['fetch-delete', 'clear-preview', 'refresh']);
  });

  it('keeps the parent detail selected when deleting a brand fails', async () => {
    const onBeforeMutation = vi.fn();
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).startsWith('/api/brands/') && init?.method === 'DELETE') {
          throw new Error('delete failed');
        }
        return { ok: true, json: async () => ({}) };
      }),
    );

    render(
      <I18nProvider initial="en">
        <BrandPreviewCard
          summary={rampBrand}
          variant="panel"
          onBeforeMutation={onBeforeMutation}
          onChanged={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('brand-preview-delete'));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/brands/brand-ramp', { method: 'DELETE' });
      expect((screen.getByTestId('brand-preview-delete') as HTMLButtonElement).disabled).toBe(false);
    });
    expect(onBeforeMutation).not.toHaveBeenCalled();
  });

  it('keeps the parent detail selected when deleting a brand returns an HTTP failure', async () => {
    const onBeforeMutation = vi.fn();
    const onChanged = vi.fn();
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).startsWith('/api/brands/') && init?.method === 'DELETE') {
          return { ok: false, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({}) };
      }),
    );

    render(
      <I18nProvider initial="en">
        <BrandPreviewCard
          summary={rampBrand}
          variant="panel"
          onBeforeMutation={onBeforeMutation}
          onChanged={onChanged}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('brand-preview-delete'));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/brands/brand-ramp', { method: 'DELETE' });
      expect((screen.getByTestId('brand-preview-delete') as HTMLButtonElement).disabled).toBe(false);
    });
    expect(onBeforeMutation).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/brands/brand-ramp');
  });
});
