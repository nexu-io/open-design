// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmrArtifactUpgradeHomeCard } from '../../src/components/AmrArtifactUpgradeHomeCard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AmrArtifactUpgradeHomeCard', () => {
  it('is a non-blocking Home offer with an explicit plans action', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onDismiss = vi.fn();
    const onViewArtifact = vi.fn();
    render(
      <AmrArtifactUpgradeHomeCard
        profile="prod"
        metricsConsent={false}
        installationId={null}
        onDismiss={onDismiss}
        onViewArtifact={onViewArtifact}
      />,
    );

    const card = screen.getByTestId('amr-artifact-upgrade-home-card');
    expect(card.tagName).toBe('SECTION');
    expect(card).not.toHaveAttribute('aria-modal');
    expect(screen.getByText('Your artifact is ready. Take the next idea further.')).toBeTruthy();
    expect(screen.getByTestId('amr-artifact-upgrade-home-plans')).toHaveTextContent(
      'Save 67%',
    );

    fireEvent.click(screen.getByTestId('amr-artifact-upgrade-home-artifact'));
    expect(onViewArtifact).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('amr-artifact-upgrade-home-plans'));
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('od_entry_source=home_artifact_upgrade'),
      '_blank',
      'noopener,noreferrer',
    );
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('allows a Home offer for every newly eligible artifact session', () => {
    const first = render(
      <AmrArtifactUpgradeHomeCard
        profile="prod"
        metricsConsent={false}
        installationId={null}
        onDismiss={vi.fn()}
        onViewArtifact={vi.fn()}
      />,
    );
    expect(screen.getByTestId('amr-artifact-upgrade-home-card')).toBeTruthy();
    first.unmount();

    const onDismiss = vi.fn();
    render(
      <AmrArtifactUpgradeHomeCard
        profile="prod"
        metricsConsent={false}
        installationId={null}
        onDismiss={onDismiss}
        onViewArtifact={vi.fn()}
      />,
    );

    expect(screen.getByTestId('amr-artifact-upgrade-home-card')).toBeTruthy();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
