// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillSummary } from '../../src/types';

// Regression coverage for nexu-io/open-design#860 (round 3): the modal's
// onView fires with the modal-internal view id ('preview'), not the
// active skill id. The Retry path must close over the selected skill so
// re-fires hit /api/skills/{skill-id}/example, not /api/skills/preview/example.

vi.mock('../../src/providers/registry', () => ({
  fetchSkillExample: vi.fn(),
}));

import { fetchSkillExample } from '../../src/providers/registry';
import { ExamplesTab } from '../../src/components/ExamplesTab';

const mockedFetch = fetchSkillExample as unknown as ReturnType<typeof vi.fn>;

const sampleSkill: SkillSummary = {
  id: 'live-dashboard',
  name: 'Live Dashboard',
  description: 'A team dashboard live artifact.',
  triggers: ['dashboard'],
  mode: 'prototype',
  previewType: 'web',
  designSystemRequired: false,
  defaultFor: [],
  upstream: null,
  hasBody: true,
  examplePrompt: 'Build me a Notion-style team dashboard.',
  aggregatesExamples: false,
};

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('ExamplesTab preview retry path (#860)', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('Retry refetches the active skill, not the modal-internal view id', async () => {
    mockedFetch.mockResolvedValue({ error: 'simulated failure' });

    render(<ExamplesTab skills={[sampleSkill]} onUsePrompt={() => {}} />);

    // Open the preview modal for the sample skill.
    const openButtons = screen.getAllByText(/open preview/i);
    fireEvent.click(openButtons[0]!);

    // Initial fetch on mount.
    await flushPromises();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenLastCalledWith('live-dashboard');

    // Error UI replaces the loading placeholder.
    expect(screen.getByText("Couldn't load this example.")).toBeTruthy();
    const retry = screen.getByRole('button', { name: /retry/i });

    // Retry must hit the same skill id, NOT 'preview' (the modal view id).
    fireEvent.click(retry);
    await flushPromises();

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(mockedFetch).toHaveBeenLastCalledWith('live-dashboard');
    // Defensive: a regression that wires the modal view id back into the
    // fetcher would call with 'preview' here.
    expect(mockedFetch).not.toHaveBeenCalledWith('preview');
  });
});
