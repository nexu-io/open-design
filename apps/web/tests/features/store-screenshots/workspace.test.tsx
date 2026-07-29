// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StoreScreenshotWorkspace } from '../../../src/features/store-screenshots/StoreScreenshotWorkspace';

const documentResponse = {
  document: {
    schemaVersion: 1,
    id: 'document-1',
    projectId: 'project-1',
    version: 1,
    product: {
      name: 'Focus',
      summary: 'Plan the day with clarity.',
      audience: 'Busy professionals',
      features: ['Plan faster', 'Stay focused', 'See progress', 'Finish calmly'],
    },
    designSystemId: 'clay',
    assets: [],
    pages: Array.from({ length: 4 }, (_, index) => ({
      id: `page-${index + 1}`,
      order: index,
      templateId: 'minimal-center' as const,
      headline: `Page ${index + 1}`,
      body: 'Plan the day with clarity.',
      overrides: index === 0
        ? { googlePlay: { headline: 'Google Play page 1' } }
        : {},
      lockedFields: [],
    })),
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('StoreScreenshotWorkspace', () => {
  it('shows platform switching and the four-page gallery', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/validate')) {
        return new Response(JSON.stringify({ valid: true, issues: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(documentResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));

    render(<StoreScreenshotWorkspace projectId="project-1" aiGenerationEnabled={false} />);

    expect(await screen.findAllByTestId('store-screenshot-card')).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'App Store' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Google Play' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    await waitFor(() => {
      expect(screen.getByText('Ready to export')).toBeTruthy();
    });
  });

  it('disables AI generation without a provider and keeps manual editing available', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/validate')) {
        return new Response(JSON.stringify({ valid: true, issues: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(documentResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));

    render(<StoreScreenshotWorkspace projectId="project-1" aiGenerationEnabled={false} />);

    const generate = await screen.findByRole('button', { name: 'Generate with AI' });
    expect(generate).toBeDisabled();
    expect(screen.getByText('Connect a Provider to generate with AI. You can keep editing manually.')).toBeTruthy();
    expect(screen.getAllByTestId('store-screenshot-card')[0]).toBeEnabled();
  });
});
