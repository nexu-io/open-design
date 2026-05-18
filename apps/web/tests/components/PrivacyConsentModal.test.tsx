// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PrivacyConsentModal } from '../../src/components/PrivacyConsentModal';
import { I18nProvider } from '../../src/i18n';

const PRIVACY_POLICY_HREF = 'https://github.com/nexu-io/open-design/blob/main/PRIVACY.md';

function renderModal(overrides?: { onShare?: () => void; onDecline?: () => void }) {
  const onShare = overrides?.onShare ?? vi.fn();
  const onDecline = overrides?.onDecline ?? vi.fn();
  render(
    <I18nProvider initial="en">
      <PrivacyConsentModal onShare={onShare} onDecline={onDecline} />
    </I18nProvider>,
  );
  return { onShare, onDecline };
}

describe('PrivacyConsentModal', () => {
  afterEach(cleanup);

  it('labels the affirmative action as a consent choice, not "Help improve"', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Share usage data' })).toBeTruthy();
    expect(screen.getByRole('button', { name: "Don't share" })).toBeTruthy();
    // The old label gave no signal that this was a privacy consent decision.
    expect(screen.queryByRole('button', { name: 'Help improve' })).toBeNull();
  });

  it('keeps the accept and decline buttons equal-prominence (EDPB/GDPR)', () => {
    renderModal();
    const share = screen.getByRole('button', { name: 'Share usage data' });
    const decline = screen.getByRole('button', { name: "Don't share" });
    // Identical class lists — neither button is styled as primary/secondary.
    expect(share.className).toBe(decline.className);
    expect(share.className).toContain('privacy-consent-action');
  });

  it('exposes the privacy policy via an obvious external link', () => {
    renderModal();
    const link = screen.getByRole('link', { name: /privacy policy/i });
    expect(link.getAttribute('href')).toBe(PRIVACY_POLICY_HREF);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel') ?? '').toContain('noopener');
  });

  it('invokes the matching handler when each action is clicked', () => {
    const { onShare, onDecline } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Share usage data' }));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onDecline).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: "Don't share" }));
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledTimes(1);
  });
});
