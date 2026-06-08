// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PrivacyConsentModal } from '../../src/components/PrivacyConsentModal';
import { I18nProvider } from '../../src/i18n';

const PRIVACY_POLICY_HREF = 'https://open-design.ai/amr/privacy';

function renderModal(overrides?: { onAccept?: () => void; onDecline?: () => void }) {
  const onAccept = overrides?.onAccept ?? vi.fn();
  const onDecline = overrides?.onDecline ?? vi.fn();
  render(
    <I18nProvider initial="en">
      <PrivacyConsentModal onAccept={onAccept} onDecline={onDecline} />
    </I18nProvider>,
  );
  return { onAccept, onDecline };
}

describe('PrivacyConsentModal', () => {
  afterEach(cleanup);

  it('renders a binary opt-in choice (Share / Don\'t share) and no acknowledgement button', () => {
    renderModal();
    // The new banner is a binary opt-in picker, not a single acknowledgement.
    // Defaulting telemetry to on and asking the user to "I get it" is not a
    // defensible posture under GDPR / ePrivacy / LGPD / PIPA.
    expect(screen.getByRole('button', { name: 'Share usage data' })).toBeTruthy();
    expect(screen.getByRole('button', { name: "Don't share" })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'I get it' })).toBeNull();
  });

  it('tells the user nothing is shared until they opt in and is toggleable in Settings', () => {
    renderModal();
    // The binary picker must say plainly that telemetry stays off until the
    // user explicitly opts in, and point the user at Settings → Privacy as
    // the place to flip their decision later. Without this hint the surface
    // would feel ambiguous about the default state.
    const footer = screen.getByText(/We don't share anything until you opt in/i);
    expect(footer.textContent ?? '').toMatch(/Settings/);
    expect(footer.textContent ?? '').toMatch(/Privacy/);
    expect(footer.textContent ?? '').toMatch(/change this any time/i);
  });

  it('exposes the privacy policy via an obvious external link', () => {
    renderModal();
    const link = screen.getByRole('link', { name: /privacy policy/i });
    expect(link.getAttribute('href')).toBe(PRIVACY_POLICY_HREF);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel') ?? '').toContain('noopener');
  });

  it('invokes onAccept when "Share usage data" is clicked', () => {
    const { onAccept, onDecline } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Share usage data' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).not.toHaveBeenCalled();
  });

  it('invokes onDecline when "Don\'t share" is clicked', () => {
    const { onAccept, onDecline } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: "Don't share" }));
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });
});
