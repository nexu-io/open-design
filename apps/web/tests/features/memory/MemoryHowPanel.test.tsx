// @vitest-environment jsdom
//
// Dumb panel for the "How it works" tab: the automatic-capture flow diagram,
// the primer copy, and the pluggable-hooks toggles (rendered by the shared
// MemoryHooksPanel). This pins that the panel renders the diagram/copy and
// passes enabled/flags/onToggle straight through to the hooks panel.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MemoryHowPanel } from '../../../src/features/memory/components/MemoryHowPanel';
import type { MemoryConfigFlagKey } from '../../../src/features/memory/rules';
import { I18nProvider } from '../../../src/i18n';

function allFlags(value: boolean): Record<MemoryConfigFlagKey, boolean> {
  return {
    chatExtractionEnabled: value,
    profileEnabled: value,
    rewriteEnabled: value,
    verifyEnabled: value,
  };
}

function renderPanel(props: Partial<Parameters<typeof MemoryHowPanel>[0]> = {}) {
  const onToggleHook = vi.fn();
  const utils = render(
    <I18nProvider initial="en">
      <MemoryHowPanel
        enabled
        hookFlags={allFlags(true)}
        onToggleHook={onToggleHook}
        {...props}
      />
    </I18nProvider>,
  );
  return { ...utils, onToggleHook };
}

afterEach(cleanup);

describe('MemoryHowPanel', () => {
  it('renders the automatic-capture flow diagram and primer copy', () => {
    renderPanel();
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
    expect(screen.getByText('Brand context')).toBeInTheDocument();
    expect(screen.getByText('Chat signals')).toBeInTheDocument();
    expect(screen.getByText('Saved memory')).toBeInTheDocument();
    expect(screen.getByText(/gathered automatically from profile setup/)).toBeInTheDocument();
  });

  it('renders the hooks panel and passes enabled/flags/onToggle straight through', () => {
    const { onToggleHook } = renderPanel({
      hookFlags: { ...allFlags(true), profileEnabled: false },
    });
    expect(screen.getByTestId('memory-hooks-panel')).toBeInTheDocument();

    const profileToggle = screen.getByRole('checkbox', { name: 'Use my profile' });
    expect(profileToggle).not.toBeChecked();

    fireEvent.click(profileToggle);
    expect(onToggleHook).toHaveBeenCalledWith('profileEnabled', true);
  });

  it('disables every hook toggle when the master switch is off', () => {
    renderPanel({ enabled: false });
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeDisabled();
    }
  });
});
