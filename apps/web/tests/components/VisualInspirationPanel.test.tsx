// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstalledPluginRecord, SkillSummary } from '@open-design/contracts';
import { VisualInspirationPanel } from '../../src/components/VisualInspirationPanel';
import { I18nProvider } from '../../src/i18n';
import { listPlugins } from '../../src/state/projects';

vi.mock('../../src/state/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/state/projects')>();
  return {
    ...actual,
    listPlugins: vi.fn(),
  };
});

const portfolioTemplate: SkillSummary = {
  id: 'portfolio-deck',
  name: 'Modern Portfolio Slide Deck',
  description: 'A polished presentation deck for design portfolio case studies.',
  triggers: ['portfolio', 'presentation', 'case study'],
  mode: 'deck',
  surface: 'web',
  platform: 'desktop',
  scenario: 'design',
  category: 'portfolio',
  source: 'built-in',
  previewType: 'html',
  designSystemRequired: false,
  defaultFor: [],
  upstream: null,
  featured: 2,
  hasBody: true,
  examplePrompt: 'Create a design portfolio presentation.',
  aggregatesExamples: false,
};

const communityPlugin: InstalledPluginRecord = {
  id: 'community-portfolio-site',
  title: 'Community Portfolio Site',
  version: '1.0.0',
  sourceKind: 'bundled',
  source: 'fixture',
  trust: 'bundled',
  capabilitiesGranted: [],
  manifest: {
    name: 'community-portfolio-site',
    title: 'Community Portfolio Site',
    version: '1.0.0',
    description: 'A web portfolio layout with editorial project cards.',
    tags: ['portfolio', 'web', 'editorial'],
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      mode: 'prototype',
      useCase: {
        query: 'Create a portfolio website with project cards.',
        exampleOutputs: [{ path: 'examples/index.html', title: 'Portfolio preview' }],
      },
    },
  },
  fsPath: '/tmp/community-portfolio-site',
  installedAt: 0,
  updatedAt: 0,
};

function renderPanel(onSubmit = vi.fn()) {
  render(
    <I18nProvider initial="en">
      <VisualInspirationPanel
        briefText={[
          '[form answers - discovery]',
          '- What are we making?: design portfolio presentation',
        ].join('\n')}
        designTemplates={[portfolioTemplate]}
        onSubmit={onSubmit}
      />
    </I18nProvider>,
  );
  return onSubmit;
}

describe('VisualInspirationPanel', () => {
  beforeEach(() => {
    vi.mocked(listPlugins).mockResolvedValue([communityPlugin]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('matches templates and community examples, then submits selected inspiration context', async () => {
    const onSubmit = renderPanel();

    expect(await screen.findByTestId('visual-inspiration-card-portfolio-deck')).toBeTruthy();
    expect(await screen.findByTestId('visual-inspiration-card-community-portfolio-site')).toBeTruthy();

    fireEvent.click(screen.getByTestId('visual-inspiration-card-community-portfolio-site'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Use the editorial card rhythm.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toContain('[visual inspiration — selected]');
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Community Portfolio Site');
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Use the editorial card rhythm.');
  });

  it('can skip and still submits a machine-readable skipped context', async () => {
    const onSubmit = renderPanel();

    await waitFor(() => expect(listPlugins).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toContain('[visual inspiration — skipped]');
  });

  it('shows a notice when community examples fail to load', async () => {
    vi.mocked(listPlugins).mockRejectedValueOnce(new Error('offline'));

    renderPanel();

    expect(await screen.findByText(/Community examples could not be loaded/)).toBeTruthy();
    expect(await screen.findByTestId('visual-inspiration-card-portfolio-deck')).toBeTruthy();
  });
});
