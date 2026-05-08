// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamplesTab } from '../../src/components/ExamplesTab';
import { fetchSkillExample } from '../../src/providers/registry';
import type { SkillSummary } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  fetchSkillExample: vi.fn(),
}));

const mockedFetch = fetchSkillExample as unknown as ReturnType<typeof vi.fn>;

function skill(overrides: Partial<SkillSummary> & Pick<SkillSummary, 'id' | 'name'>): SkillSummary {
  const { id, name, ...rest } = overrides;
  return {
    id,
    name,
    description: `${name} description`,
    triggers: [id],
    mode: 'prototype',
    surface: 'web',
    platform: 'desktop',
    scenario: 'general',
    previewType: 'web',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    aggregatesExamples: false,
    hasBody: true,
    examplePrompt: `Build ${name}`,
    ...rest,
  };
}

function renderExamples(skills: SkillSummary[]) {
  render(<ExamplesTab skills={skills} onUsePrompt={() => {}} />);
}

describe('ExamplesTab filter counts', () => {
  beforeEach(() => {
    mockedFetch.mockResolvedValue({ html: '<main>preview</main>' });
  });

  afterEach(() => {
    cleanup();
    mockedFetch.mockReset();
  });

  it('keeps the Scenario All count scoped to surface and type, not the selected scenario', () => {
    renderExamples([
      skill({ id: 'eng-desktop', name: 'Engineering desktop', scenario: 'engineering' }),
      skill({ id: 'eng-deck', name: 'Engineering deck', mode: 'deck', scenario: 'engineering' }),
      skill({ id: 'product-desktop', name: 'Product desktop', scenario: 'product' }),
      skill({ id: 'product-mobile', name: 'Product mobile', platform: 'mobile', scenario: 'product' }),
    ]);

    const scenarioFilters = screen.getByRole('tablist', { name: 'Scenario' });
    expect(within(scenarioFilters).getByRole('button', { name: /^All\s*4$/ })).toBeTruthy();

    const typeFilters = screen.getByRole('tablist', { name: 'Type' });
    fireEvent.click(within(typeFilters).getByRole('tab', { name: /^Prototypes · Desktop\s*2$/ }));

    expect(within(scenarioFilters).getByRole('button', { name: /^All\s*2$/ })).toBeTruthy();
    expect(within(scenarioFilters).getByRole('button', { name: /^Engineering\s*1$/ })).toBeTruthy();
    expect(within(scenarioFilters).getByRole('button', { name: /^Product\s*1$/ })).toBeTruthy();

    fireEvent.click(within(scenarioFilters).getByRole('button', { name: /^Product\s*1$/ }));

    expect(within(scenarioFilters).getByRole('button', { name: /^All\s*2$/ })).toBeTruthy();
    expect(within(scenarioFilters).getByRole('button', { name: /^Product\s*1$/ })).toBeTruthy();
  });

  it('uses media tags for media examples so visible tags do not imply zero-count prototype types', () => {
    renderExamples([
      skill({ id: 'web-prototype', name: 'Web prototype' }),
      skill({
        id: 'image-example',
        name: 'Image example',
        mode: 'image',
        surface: 'image',
        platform: null,
        previewType: 'image',
      }),
    ]);

    const surfaceFilters = screen.getByRole('tablist', { name: 'Surface' });
    fireEvent.click(within(surfaceFilters).getByRole('tab', { name: /^Image\s*1$/ }));

    const typeFilters = screen.getByRole('tablist', { name: 'Type' });
    expect(within(typeFilters).getByRole('tab', { name: /^All\s*1$/ })).toBeTruthy();
    expect(within(typeFilters).getByRole('tab', { name: /^Prototypes · Desktop\s*0$/ })).toBeTruthy();
    const imageCard = screen.getByTestId('example-card-image-example');
    expect(within(imageCard).getByText('Image')).toBeTruthy();
    expect(within(imageCard).queryByText('Desktop prototype')).toBeNull();
  });
});
