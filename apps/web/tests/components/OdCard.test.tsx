// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OdCardRuleProposal, OdCardBrandBrowserAssist } from '@open-design/contracts';
import { OdCardView } from '../../src/components/OdCard';
import { I18nProvider } from '../../src/i18n';

const ASSIST_CARD: OdCardBrandBrowserAssist = {
  kind: 'brand-browser-assist',
  brandId: 'brand-123',
  browserTabId: '__browser__:1',
  url: 'https://acme.test/',
  reason: 'Cloudflare',
};

function renderAssistCard(
  onConfirm: (card: OdCardBrandBrowserAssist) => Promise<{ ok: boolean; message?: string }>,
) {
  return render(
    <I18nProvider initial="en">
      <OdCardView card={ASSIST_CARD} onBrandBrowserAssistConfirm={onConfirm} />
    </I18nProvider>,
  );
}

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

describe('OdCard brand browser assist', () => {
  it('marks browser assist done only when the confirm handler succeeds', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true });

    renderAssistCard(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: 'Open browser assist' }));

    await waitFor(() => {
      expect(screen.getByText('Browser assist confirmed')).toBeTruthy();
    });
    expect(onConfirm).toHaveBeenCalledWith(ASSIST_CARD);
    expect(window.localStorage.getItem('od:brand-browser-assist-decision:brand-123')).toBe('done');
  });

  it('keeps browser assist retryable when the confirm handler reports failure', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: false, message: 'Open this in the desktop app.' });

    renderAssistCard(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: 'Open browser assist' }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('desktop app');
    });
    expect(screen.getByRole('button', { name: 'Open browser assist' })).toBeTruthy();
    expect(screen.queryByText('Browser assist confirmed')).toBeNull();
  });
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
