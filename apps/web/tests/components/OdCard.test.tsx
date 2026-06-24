// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OdCardRuleProposal } from '@open-design/contracts';
import { OdCardView } from '../../src/components/OdCard';
import { I18nProvider } from '../../src/i18n';

const RULE_CARD: OdCardRuleProposal = {
  kind: 'rule-proposal',
  name: 'Palette only',
  description: 'Only use the brand palette.',
  assertion: 'Every CSS color must match a brand token.',
  check: 'Scan CSS color literals.',
  rationale: 'The user corrected off-palette colors.',
};

function renderRuleCard(card: OdCardRuleProposal = RULE_CARD, instanceScope = 'scope-a') {
  return render(
    <I18nProvider initial="en">
      <OdCardView card={card} instanceScope={instanceScope} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('OdCard rule proposal decisions', () => {
  it('keeps the saved state after the card remounts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

    const first = renderRuleCard();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));

    await waitFor(() => {
      expect(screen.getByText('Saved “Palette only” as a rule')).toBeTruthy();
    });
    first.unmount();

    renderRuleCard();

    expect(screen.getByText('Saved “Palette only” as a rule')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
  });

  it('keeps the discarded state after the card remounts', () => {
    const first = renderRuleCard();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.queryByText('Palette only')).toBeNull();
    first.unmount();

    renderRuleCard();

    expect(screen.queryByText('Palette only')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
  });

  it('does not reuse discarded decisions across scoped card instances', () => {
    const first = renderRuleCard(RULE_CARD, 'project-a:conversation-a:message-a:card-a');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.queryByText('Palette only')).toBeNull();
    first.unmount();

    renderRuleCard(RULE_CARD, 'project-b:conversation-b:message-b:card-a');

    expect(screen.getByText('Palette only')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeTruthy();
  });
});
