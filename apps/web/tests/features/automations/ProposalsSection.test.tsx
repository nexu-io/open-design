// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AutomationEvolutionProposal } from '@open-design/contracts';

import { I18nProvider } from '../../../src/i18n';
import { ProposalsSection } from '../../../src/features/automations/components/ProposalsSection';

afterEach(() => cleanup());

function makeProposal(overrides: Partial<AutomationEvolutionProposal> = {}): AutomationEvolutionProposal {
  return {
    id: 'p1',
    title: 'Proposal',
    summary: 'Summary',
    targetKind: 'memory-node',
    action: 'create',
    status: 'pending-review',
    reviewPolicy: 'always',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sourcePacketIds: [],
    patch: { format: 'markdown', after: 'x' },
    ...overrides,
  };
}

describe('ProposalsSection', () => {
  it('renders nothing when there are no proposals', () => {
    const { container } = render(
      <I18nProvider initial="en">
        <ProposalsSection proposals={[]} proposalBusyId={null} onReview={vi.fn()} t={(k) => k as string} />
      </I18nProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('uses the design-system icon for a design-system proposal, and omits the diff summary line when absent', () => {
    render(
      <I18nProvider initial="en">
        <ProposalsSection
          proposals={[makeProposal({ targetKind: 'design-system', patch: { format: 'markdown', after: 'x' } })]}
          proposalBusyId={null}
          onReview={vi.fn()}
          t={(k) => k as string}
        />
      </I18nProvider>,
    );
    expect(screen.queryByText('x')).toBeNull();
  });

  it('fires apply and reject with the proposal id', () => {
    const onReview = vi.fn();
    render(
      <I18nProvider initial="en">
        <ProposalsSection proposals={[makeProposal()]} proposalBusyId={null} onReview={onReview} t={(k) => k as string} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /automations.apply/ }));
    expect(onReview).toHaveBeenCalledWith('p1', 'apply');

    fireEvent.click(screen.getByRole('button', { name: /automations.reject/ }));
    expect(onReview).toHaveBeenCalledWith('p1', 'reject');
  });

  it('disables both actions while the proposal is busy', () => {
    render(
      <I18nProvider initial="en">
        <ProposalsSection proposals={[makeProposal()]} proposalBusyId="p1" onReview={vi.fn()} t={(k) => k as string} />
      </I18nProvider>,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });
});
