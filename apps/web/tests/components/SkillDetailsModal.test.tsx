// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SkillDetail, SkillSummary } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/providers/registry', () => ({
  fetchSkill: vi.fn(),
}));

import { SkillDetailsModal } from '../../src/components/SkillDetailsModal';
import { fetchSkill } from '../../src/providers/registry';

const mockedFetchSkill = vi.mocked(fetchSkill);

const SUMMARY: SkillSummary = {
  id: 'brand-copy',
  name: 'Brand Copy',
  description: 'Writes brand copy.',
  triggers: ['copy'],
  mode: 'prototype',
  previewType: 'html',
  designSystemRequired: true,
  defaultFor: [],
  upstream: null,
  hasBody: true,
  examplePrompt: 'Write copy.',
  aggregatesExamples: false,
  source: 'built-in',
};

const DETAIL: SkillDetail = {
  ...SUMMARY,
  body: '# Brand Copy\n\nDetailed instructions.',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SkillDetailsModal', () => {
  it('renders an error instead of a summary-only success when detail loading fails', async () => {
    mockedFetchSkill.mockResolvedValueOnce(null).mockResolvedValueOnce(DETAIL);

    render(
      <SkillDetailsModal
        skillId="brand-copy"
        summary={SUMMARY}
        onClose={() => undefined}
      />,
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't load skill details");
    expect(screen.queryByText('SKILL.md')).toBeNull();
    expect(screen.queryByText('Writes brand copy.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(mockedFetchSkill).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('SKILL.md')).toBeTruthy();
    expect(screen.getByText(/Detailed instructions/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
