// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IntegrationsView } from '../../src/components/IntegrationsView';
import { I18nProvider, type Locale } from '../../src/i18n';
import type { AppConfig, SkillSummary } from '../../src/types';

const originalFetch = globalThis.fetch;

const TEST_CONFIG: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

function skill(overrides: Partial<SkillSummary>): SkillSummary {
  return {
    id: 'skill',
    name: 'Skill',
    description: 'A reusable skill.',
    triggers: [],
    mode: 'prototype',
    previewType: 'html',
    designSystemRequired: true,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: '',
    aggregatesExamples: false,
    source: 'built-in',
    ...overrides,
  };
}

function renderSkillsIntegration(
  skills: SkillSummary[],
  options: { skillsStatus?: number; skillsBody?: unknown; locale?: Locale } = {},
) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === '/api/skills') {
      return new Response(JSON.stringify(options.skillsBody ?? { skills }), {
        status: options.skillsStatus ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  render(
    <I18nProvider initial={options.locale ?? 'en'}>
      <IntegrationsView
        config={TEST_CONFIG}
        initialTab="skills"
        onPersistComposioKey={() => undefined}
      />
    </I18nProvider>,
  );
}

describe('IntegrationsView skills tree', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders skills as a read-only list view by default and shows row metadata', async () => {
    renderSkillsIntegration([
      skill({
        id: 'dashboard',
        name: 'Dashboard',
        description: 'Dense operations UI.',
        scenario: 'operation',
        platform: 'desktop',
        previewType: 'html',
        examplePrompt: 'Build an operations dashboard.',
      }),
      skill({
        id: 'pitch-deck',
        name: 'Pitch Deck',
        mode: 'deck',
        scenario: 'product',
        previewType: 'pptx',
        designSystemRequired: false,
      }),
    ]);

    expect(await screen.findByTestId('integrations-skill-list-row-dashboard')).toBeTruthy();
    expect(screen.getByTestId('integrations-skill-list-row-pitch-deck')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'List view' }).getAttribute('class')).toContain('is-active');
    expect(screen.queryByTestId('integrations-skill-node-dashboard')).toBeNull();
    expect(screen.queryByTestId('integrations-skill-detail')).toBeNull();
    expect(screen.getByText('Select a skill row to inspect it.')).toBeTruthy();
    expect(screen.queryByText('Select a skill node to inspect it.')).toBeNull();

    fireEvent.click(screen.getByTestId('integrations-skill-list-row-pitch-deck'));

    const detail = await screen.findByTestId('integrations-skill-detail');
    expect(within(detail).getByText('Pitch Deck')).toBeTruthy();
    expect(within(detail).getByText('pptx')).toBeTruthy();
    expect(within(detail).getByText('Optional')).toBeTruthy();
  });

  it('switches to the mode/scenario tree view and reuses the detail panel', async () => {
    renderSkillsIntegration([
      skill({
        id: 'dashboard',
        name: 'Dashboard',
        description: 'Dense operations UI.',
        scenario: 'operation',
        category: 'operations',
        platform: 'desktop',
      }),
      skill({
        id: 'pitch-deck',
        name: 'Pitch Deck',
        mode: 'deck',
        scenario: 'product',
        category: 'sales',
        previewType: 'pptx',
        designSystemRequired: false,
      }),
    ]);

    await screen.findByTestId('integrations-skill-list-row-dashboard');

    fireEvent.click(screen.getByRole('button', { name: 'Skill tree' }));

    expect(screen.getByText('Prototype')).toBeTruthy();
    expect(screen.getByText('Operation')).toBeTruthy();
    expect(screen.getByText('Deck')).toBeTruthy();
    expect(screen.queryByTestId('integrations-skill-list-row-dashboard')).toBeNull();
    expect(screen.getByText('Select a skill node to inspect it.')).toBeTruthy();
    expect(screen.getByText('Operation').closest('g')?.getAttribute('class')).toContain('is-branch');
    expect(screen.getByText('Operation').closest('g')?.getAttribute('role')).toBeNull();
    expect(screen.getByTestId('integrations-skill-node-pitch-deck').getAttribute('class')).toContain('is-interactive');

    fireEvent.click(screen.getByTestId('integrations-skill-node-pitch-deck'));

    const detail = await screen.findByTestId('integrations-skill-detail');
    expect(within(detail).getByText('Pitch Deck')).toBeTruthy();
    expect(within(detail).getByText('pptx')).toBeTruthy();
  });

  it('applies catalog facet filters to the same result set', async () => {
    renderSkillsIntegration([
      skill({
        id: 'dashboard',
        name: 'Dashboard',
        scenario: 'operation',
        category: 'operations',
        platform: 'desktop',
      }),
      skill({
        id: 'poster',
        name: 'Poster',
        scenario: 'marketing',
        category: 'marketing',
        platform: 'mobile',
        designSystemRequired: false,
      }),
      skill({
        id: 'pitch-deck',
        name: 'Pitch Deck',
        mode: 'deck',
        scenario: 'product',
        category: 'sales',
        platform: 'desktop',
        previewType: 'pptx',
      }),
    ]);

    await screen.findByTestId('integrations-skill-list-row-dashboard');

    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'prototype' } });
    fireEvent.change(screen.getByLabelText('Scenario'), { target: { value: 'operation' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'operations' } });
    fireEvent.change(screen.getByLabelText('Platform'), { target: { value: 'desktop' } });
    fireEvent.change(screen.getByLabelText('Design system'), { target: { value: 'required' } });

    await waitFor(() => {
      expect(screen.getByTestId('integrations-skill-list-row-dashboard')).toBeTruthy();
      expect(screen.queryByTestId('integrations-skill-list-row-poster')).toBeNull();
      expect(screen.queryByTestId('integrations-skill-list-row-pitch-deck')).toBeNull();
    });
  });

  it('clears stale selected detail when search and filters hide the selected skill', async () => {
    renderSkillsIntegration([
      skill({ id: 'dashboard', name: 'Dashboard', scenario: 'operation', platform: 'desktop' }),
      skill({ id: 'poster', name: 'Poster', scenario: 'marketing', platform: 'mobile' }),
    ]);

    await screen.findByTestId('integrations-skill-list-row-dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Skill tree' }));

    await screen.findByTestId('integrations-skill-node-dashboard');
    fireEvent.click(screen.getByTestId('integrations-skill-node-dashboard'));
    expect(screen.getByTestId('integrations-skill-detail').textContent).toContain('Dashboard');

    fireEvent.change(screen.getByLabelText('Platform'), {
      target: { value: 'mobile' },
    });
    fireEvent.change(screen.getByPlaceholderText('Search skills...'), {
      target: { value: 'poster' },
    });

    await waitFor(() => {
      expect(screen.queryByTestId('integrations-skill-node-dashboard')).toBeNull();
    });
    expect(screen.getByTestId('integrations-skill-node-poster')).toBeTruthy();
    expect(screen.queryByTestId('integrations-skill-detail')).toBeNull();
    expect(screen.getByText('Select a skill node to inspect it.')).toBeTruthy();

    fireEvent.click(screen.getByTestId('integrations-skill-node-poster'));
    expect(screen.getByTestId('integrations-skill-detail').textContent).toContain('Poster');
  });

  it('shows an empty state when search and filters remove every skill', async () => {
    renderSkillsIntegration([
      skill({ id: 'dashboard', name: 'Dashboard', scenario: 'operation', platform: 'desktop' }),
      skill({ id: 'poster', name: 'Poster', scenario: 'marketing', platform: 'mobile' }),
    ]);

    await screen.findByTestId('integrations-skill-list-row-dashboard');

    fireEvent.change(screen.getByLabelText('Platform'), {
      target: { value: 'desktop' },
    });
    fireEvent.change(screen.getByPlaceholderText('Search skills...'), {
      target: { value: 'poster' },
    });

    expect(await screen.findByText('No skills match these filters.')).toBeTruthy();
    expect(screen.queryByTestId('integrations-skill-detail')).toBeNull();
  });

  it('shows a load failure instead of an empty filter state when skills fail to load', async () => {
    renderSkillsIntegration([], {
      skillsStatus: 500,
      skillsBody: { error: { message: 'boom' } },
    });

    expect(await screen.findByText('Could not load skills. Make sure the local daemon is running, then try again.')).toBeTruthy();
    expect(screen.queryByText('No skills match these filters.')).toBeNull();
  });

  it('localizes tree guide and legend labels', async () => {
    renderSkillsIntegration([
      skill({ id: 'dashboard', name: 'Dashboard', scenario: 'operation', platform: 'desktop' }),
    ], { locale: 'zh-CN' });

    await screen.findByTestId('integrations-skill-list-row-dashboard');
    fireEvent.click(screen.getByRole('button', { name: '技能树' }));

    await screen.findByTestId('integrations-skill-node-dashboard');

    expect(screen.getAllByText('模式').length).toBeGreaterThan(0);
    expect(screen.getAllByText('场景').length).toBeGreaterThan(0);
    expect(screen.getAllByText('技能').length).toBeGreaterThan(0);
    expect(screen.queryByText('Mode')).toBeNull();
    expect(screen.queryByText('Scenario')).toBeNull();
    expect(screen.queryByText('Skill')).toBeNull();
  });
});
