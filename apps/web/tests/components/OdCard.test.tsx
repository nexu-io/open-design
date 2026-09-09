// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OdCardRuleProposal, OdCardBrandBrowserAssist, OdCardVerifyScorecard } from '@open-design/contracts';
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
  onConfirm: (
    card: OdCardBrandBrowserAssist,
  ) => Promise<{ ok: boolean; action?: 'opened' | 'confirmed'; message?: string }>,
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

function renderScorecard(card: OdCardVerifyScorecard) {
  return render(
    <I18nProvider initial="en">
      <OdCardView card={card} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('OdCard verification scorecard disclosure', () => {
  it('keeps a passing scorecard collapsed to one summary line', () => {
    const { container } = renderScorecard({
      kind: 'verify-scorecard',
      status: 'pass',
      summary: '3 checks passed',
      rows: [
        { rule: 'Uses brand colors', status: 'pass' },
        { rule: 'Has accessible labels', status: 'pass' },
        { rule: 'Fits the viewport', status: 'pass' },
      ],
    });

    const head = container.querySelector<HTMLButtonElement>('[data-od-card="verify-scorecard"] > button');
    const disclosure = container.querySelector('[data-od-card="verify-scorecard"] .accordion-collapsible');
    expect(head?.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure?.classList.contains('open')).toBe(false);

    fireEvent.click(head as HTMLButtonElement);
    expect(head?.getAttribute('aria-expanded')).toBe('true');
    expect(disclosure?.classList.contains('open')).toBe(true);
  });

  it('opens partial verification and promotes only failed checks', () => {
    const { container } = renderScorecard({
      kind: 'verify-scorecard',
      status: 'partial',
      summary: '2/3 checks passed',
      rows: [
        { rule: 'Uses brand colors', status: 'pass' },
        { rule: 'Has accessible labels', status: 'fail', note: 'Missing the export label.' },
        { rule: 'Fits the viewport', status: 'fixed', note: 'Reduced the card width.' },
      ],
    });

    const head = container.querySelector<HTMLButtonElement>('[data-od-card="verify-scorecard"] > button');
    const disclosure = container.querySelector('[data-od-card="verify-scorecard"] .accordion-collapsible');
    expect(head?.getAttribute('aria-expanded')).toBe('true');
    expect(disclosure?.classList.contains('open')).toBe(true);
    expect(screen.getByText('Has accessible labels')).toBeTruthy();
    expect(screen.getByText('Missing the export label.')).toBeTruthy();
    expect(screen.queryByText('Uses brand colors')).toBeNull();
    expect(screen.queryByText('Fits the viewport')).toBeNull();
  });
});

describe('OdCard brand browser assist', () => {
  it('shows one problem and its primary action before the details are opened', () => {
    const { container } = renderAssistCard(vi.fn().mockResolvedValue({ ok: true }));

    expect(container.querySelector('[data-user-action-card="browser-assist"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open browser assist' })).toBeTruthy();
    const toggle = screen.getByRole('button', { name: 'View details' });
    const disclosure = container.querySelector('[data-od-card="brand-browser-assist"] .accordion-collapsible');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure?.classList.contains('open')).toBe(false);

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(disclosure?.classList.contains('open')).toBe(true);
  });

  it('marks browser assist done only when the confirm handler succeeds', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true });

    renderAssistCard(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: 'Open browser assist' }));

    await waitFor(() => {
      expect(screen.getByText('Browser opened')).toBeTruthy();
    });
    expect(onConfirm).toHaveBeenCalledWith(ASSIST_CARD);
    expect(screen.getByRole('button', { name: 'Open browser assist' })).toBeTruthy();
    expect(window.localStorage.getItem('od:brand-browser-assist-decision:brand-123')).toBe('done');
  });

  it('marks browser assist done when the handler opens or focuses the browser tab', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, action: 'opened' });

    renderAssistCard(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: 'Open browser assist' }));

    await waitFor(() => {
      expect(screen.getByText('Browser opened')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Open browser assist' })).toBeTruthy();
    expect(screen.getByText(/Open Browser and clear any human check/)).toBeTruthy();
    expect(window.localStorage.getItem('od:brand-browser-assist-decision:brand-123')).toBe('done');
  });

  it('keeps browser assist available after a saved opened state remounts', () => {
    window.localStorage.setItem('od:brand-browser-assist-decision:brand-123', 'done');

    renderAssistCard(vi.fn().mockResolvedValue({ ok: true }));

    expect(screen.getByText('Browser opened')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open browser assist' })).toBeTruthy();
  });

  it('keeps browser assist retryable when the confirm handler reports failure', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: false, message: 'Open this in the desktop app.' });

    renderAssistCard(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: 'Open browser assist' }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('desktop app');
    });
    expect(screen.getByRole('button', { name: 'Open browser assist' })).toBeTruthy();
    expect(screen.queryByText('Browser opened')).toBeNull();
  });
});

describe('retired rule proposal presentation', () => {
  it.each([
    null,
    JSON.stringify({ status: 'saved', name: RULE_CARD.name, id: 'existing-rule' }),
    JSON.stringify({ status: 'discarded' }),
  ])('does not reopen an action or touch memory/storage for cached decision %s', (cached) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const storageKey = 'od:rule-proposal-decision:existing';
    if (cached !== null) window.localStorage.setItem(storageKey, cached);
    const before = { ...window.localStorage };
    const first = renderRuleCard();
    expect(first.container.textContent).toBe('');
    expect(first.container.querySelector('[data-od-card]')).toBeNull();
    expect(first.container.querySelector('button')).toBeNull();
    first.unmount();
    const second = renderRuleCard(RULE_CARD, 'another-project:conversation:message');
    expect(second.container.textContent).toBe('');
    expect(second.container.querySelector('button')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect({ ...window.localStorage }).toEqual(before);
  });
});
