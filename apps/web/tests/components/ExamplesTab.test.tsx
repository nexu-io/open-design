// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExamplesTab } from '../../src/components/ExamplesTab';
import { fetchSkillExample } from '../../src/providers/registry';
import {
  exportAsHtml,
  exportAsPdf,
  exportAsZip,
  openSandboxedPreviewInNewTab,
} from '../../src/runtime/exports';
import type { SkillSummary } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  fetchSkillExample: vi.fn(async (id: string) => ({
    html: `<main><h1>${id} preview</h1></main>`,
  })),
}));

vi.mock('../../src/runtime/exports', () => ({
  exportAsHtml: vi.fn(),
  exportAsPdf: vi.fn(),
  exportAsZip: vi.fn(),
  openSandboxedPreviewInNewTab: vi.fn(),
}));

const originalIntersectionObserver = globalThis.IntersectionObserver;

class IdleIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  globalThis.IntersectionObserver = IdleIntersectionObserver as typeof IntersectionObserver;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  globalThis.IntersectionObserver = originalIntersectionObserver;
});

function skill(overrides: Partial<SkillSummary> & Pick<SkillSummary, 'id' | 'name'>): SkillSummary {
  return {
    id: overrides.id,
    name: overrides.name,
    description: overrides.description ?? `${overrides.name} example`,
    triggers: overrides.triggers ?? [],
    mode: overrides.mode ?? 'prototype',
    surface: overrides.surface ?? 'web',
    platform: overrides.platform ?? 'desktop',
    scenario: overrides.scenario ?? 'general',
    previewType: overrides.previewType ?? 'html',
    designSystemRequired: overrides.designSystemRequired ?? false,
    defaultFor: overrides.defaultFor ?? [],
    upstream: overrides.upstream ?? null,
    featured: overrides.featured ?? null,
    fidelity: overrides.fidelity ?? null,
    speakerNotes: overrides.speakerNotes ?? null,
    animations: overrides.animations ?? null,
    craftRequires: overrides.craftRequires ?? [],
    hasBody: overrides.hasBody ?? true,
    examplePrompt: overrides.examplePrompt ?? `Build ${overrides.name}.`,
  };
}

const skills: SkillSummary[] = [
  skill({
    id: 'live-dashboard',
    name: 'live-dashboard',
    description: 'Notion style workspace dashboard',
    examplePrompt: 'Build me a Notion-style team dashboard.',
    scenario: 'operations',
    featured: 1,
  }),
  skill({
    id: 'open-design-landing',
    name: 'open-design-landing',
    description: 'Editorial marketing landing page',
    examplePrompt: 'Produce a world-class single-page editorial landing site.',
    scenario: 'marketing',
    featured: 2,
  }),
  skill({
    id: 'mobile-checkout',
    name: 'mobile-checkout',
    description: 'Mobile checkout prototype',
    mode: 'prototype',
    platform: 'mobile',
    scenario: 'product',
  }),
  skill({
    id: 'brand-deck',
    name: 'brand-deck',
    description: 'Slides for brand strategy',
    mode: 'deck',
    scenario: 'marketing',
  }),
  skill({
    id: 'hero-image',
    name: 'hero-image',
    description: 'Image generation prompt',
    mode: 'image',
    surface: 'image',
    platform: null,
    scenario: 'design',
  }),
  skill({
    id: 'launch-video',
    name: 'launch-video',
    description: 'Video generation prompt',
    mode: 'video',
    surface: 'video',
    platform: null,
    scenario: 'marketing',
  }),
  skill({
    id: 'brief-template',
    name: 'brief-template',
    description: 'Reusable project brief template',
    examplePrompt: 'Create a reusable project brief from this template.',
    mode: 'template',
    surface: 'web',
    platform: null,
    scenario: 'operations',
  }),
];

function renderExamples(onUsePrompt = vi.fn()) {
  render(<ExamplesTab skills={skills} onUsePrompt={onUsePrompt} />);
  return { onUsePrompt };
}

function filterRow(name: string) {
  return screen.getByRole('tablist', { name });
}

describe('ExamplesTab', () => {
  it('shows the empty skills state when the catalog is unavailable', () => {
    render(<ExamplesTab skills={[]} onUsePrompt={vi.fn()} />);

    expect(screen.getByText('No skills available. Is the daemon running?')).toBeTruthy();
  });

  it('filters examples by free-text search and shows an empty match state', () => {
    renderExamples();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search examples by name' }), {
      target: { value: 'notion' },
    });

    expect(screen.getByTestId('example-card-live-dashboard')).toBeTruthy();
    expect(screen.queryByTestId('example-card-open-design-landing')).toBeNull();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search examples by name' }), {
      target: { value: 'no matching example' },
    });

    expect(screen.getByText('No examples match these filters.')).toBeTruthy();
  });

  it('narrows by surface, type, and scenario filter pills', () => {
    renderExamples();

    fireEvent.click(within(filterRow('Surface')).getByRole('tab', { name: /Image1/ }));
    expect(screen.getByTestId('example-card-hero-image')).toBeTruthy();
    expect(screen.queryByTestId('example-card-live-dashboard')).toBeNull();

    fireEvent.click(within(filterRow('Surface')).getByRole('tab', { name: /All7/ }));
    fireEvent.click(within(filterRow('Type')).getByRole('tab', { name: /Prototypes · Mobile1/ }));
    expect(screen.getByTestId('example-card-mobile-checkout')).toBeTruthy();
    expect(screen.queryByTestId('example-card-live-dashboard')).toBeNull();

    fireEvent.click(within(filterRow('Type')).getByRole('tab', { name: /All7/ }));
    fireEvent.click(within(filterRow('Scenario')).getByRole('button', { name: /Marketing3/ }));
    expect(screen.getByTestId('example-card-open-design-landing')).toBeTruthy();
    expect(screen.getByTestId('example-card-brand-deck')).toBeTruthy();
    expect(screen.getByTestId('example-card-launch-video')).toBeTruthy();
    expect(screen.queryByTestId('example-card-live-dashboard')).toBeNull();
  });

  it('filters Docs & templates examples and uses the selected template prompt', () => {
    const { onUsePrompt } = renderExamples();

    fireEvent.click(within(filterRow('Type')).getByRole('tab', { name: /Docs & templates1/ }));

    expect(screen.getByTestId('example-card-brief-template')).toBeTruthy();
    expect(screen.getByText('Template')).toBeTruthy();
    expect(screen.queryByTestId('example-card-live-dashboard')).toBeNull();

    fireEvent.click(screen.getByTestId('example-use-prompt-brief-template'));

    expect(onUsePrompt).toHaveBeenCalledTimes(1);
    expect(onUsePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'brief-template',
        mode: 'template',
        examplePrompt: 'Create a reusable project brief from this template.',
      }),
    );
  });

  it('passes the selected example to the Use this prompt callback', () => {
    const { onUsePrompt } = renderExamples();

    fireEvent.click(screen.getByTestId('example-use-prompt-open-design-landing'));

    expect(onUsePrompt).toHaveBeenCalledTimes(1);
    expect(onUsePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'open-design-landing',
        examplePrompt: 'Produce a world-class single-page editorial landing site.',
      }),
    );
  });

  it('loads previews on demand and enables the share export menu', async () => {
    renderExamples();

    const card = screen.getByTestId('example-card-live-dashboard');
    const shareButton = within(card).getByRole('button', { name: 'Share ▾' }) as HTMLButtonElement;
    expect(shareButton.disabled).toBe(true);

    fireEvent.mouseEnter(card);

    await waitFor(() => {
      expect(fetchSkillExample).toHaveBeenCalledWith('live-dashboard');
      expect(shareButton.disabled).toBe(false);
    });

    fireEvent.click(shareButton);
    fireEvent.click(screen.getByRole('menuitem', { name: /Export as PDF/i }));
    expect(exportAsPdf).toHaveBeenCalledWith(
      '<main><h1>live-dashboard preview</h1></main>',
      'live-dashboard',
      { deck: false },
    );

    fireEvent.click(shareButton);
    fireEvent.click(screen.getByRole('menuitem', { name: /Download as \.zip/i }));
    expect(exportAsZip).toHaveBeenCalledWith(
      '<main><h1>live-dashboard preview</h1></main>',
      'live-dashboard',
    );

    fireEvent.click(shareButton);
    fireEvent.click(screen.getByRole('menuitem', { name: /Export as standalone HTML/i }));
    expect(exportAsHtml).toHaveBeenCalledWith(
      '<main><h1>live-dashboard preview</h1></main>',
      'live-dashboard',
    );
  });

  it('opens the full preview modal and exercises its toolbar actions', async () => {
    renderExamples();

    const card = screen.getByTestId('example-card-live-dashboard');
    fireEvent.click(within(card).getByRole('button', { name: /Open preview/ }));

    const dialog = await screen.findByRole('dialog', { name: 'live-dashboard preview' });
    await waitFor(() => {
      expect(screen.getByTitle('live-dashboard Preview')).toBeTruthy();
    });

    fireEvent.click(within(dialog).getByRole('button', { name: /Fullscreen/i }));
    const modal = dialog.querySelector('.ds-modal') as HTMLElement;
    expect(modal.classList.contains('ds-modal-fullscreen')).toBe(true);
    expect(within(dialog).getByRole('button', { name: /Exit/i })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(modal.classList.contains('ds-modal-fullscreen')).toBe(false);
    expect(screen.getByRole('dialog', { name: 'live-dashboard preview' })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: /Fullscreen/i }));
    expect(modal.classList.contains('ds-modal-fullscreen')).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: /Exit/i }));
    expect(modal.classList.contains('ds-modal-fullscreen')).toBe(false);
    expect(within(dialog).getByRole('button', { name: /Fullscreen/i })).toBeTruthy();

    const shareButton = within(dialog).getByRole('button', { name: 'Share ▾' });
    fireEvent.click(shareButton);
    fireEvent.click(within(dialog).getByRole('menuitem', { name: /Export as PDF/i }));
    expect(exportAsPdf).toHaveBeenCalledWith(
      '<main><h1>live-dashboard preview</h1></main>',
      'live-dashboard',
      { deck: false },
    );

    fireEvent.click(shareButton);
    fireEvent.click(within(dialog).getByRole('menuitem', { name: /Download as \.zip/i }));
    expect(exportAsZip).toHaveBeenCalledWith(
      '<main><h1>live-dashboard preview</h1></main>',
      'live-dashboard',
    );

    fireEvent.click(shareButton);
    fireEvent.click(within(dialog).getByRole('menuitem', { name: /Export as standalone HTML/i }));
    expect(exportAsHtml).toHaveBeenCalledWith(
      '<main><h1>live-dashboard preview</h1></main>',
      'live-dashboard',
    );

    fireEvent.click(shareButton);
    fireEvent.click(within(dialog).getByRole('menuitem', { name: /Open in new tab/i }));
    expect(openSandboxedPreviewInNewTab).toHaveBeenCalledWith(
      '<main><h1>live-dashboard preview</h1></main>',
      'live-dashboard',
      { deck: false },
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'live-dashboard preview' })).toBeNull();
  });
});
