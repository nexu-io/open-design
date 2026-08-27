// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  OdNextRolloutControlStatus,
  OdNextRolloutLatchStatus,
  OdNextRolloutMode,
  OdNextRolloutModeSource,
} from '@open-design/contracts';

import { LabsSection } from '../../src/components/LabsSection';
import { I18nProvider } from '../../src/i18n';

const track = vi.fn();
vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track }),
}));

function status(overrides: {
  requestedMode?: OdNextRolloutMode;
  requestedModeSource?: OdNextRolloutModeSource;
  latch?: OdNextRolloutLatchStatus | null;
} = {}): OdNextRolloutControlStatus {
  const requestedMode = overrides.requestedMode ?? 'off';
  return {
    strategyId: 'od-next-strategy',
    scope: 'daemon_instance',
    requestedMode,
    requestedModeSource: overrides.requestedModeSource ?? 'default',
    effectiveMode: requestedMode,
    latch: overrides.latch ?? null,
    revision: 0,
    updatedAt: null,
    lastEvent: null,
    resetAllowed: false,
  };
}

interface Stub {
  rolloutStatus?: OdNextRolloutControlStatus;
  rolloutFails?: boolean;
  writeFails?: boolean;
}

function stubFetch(options: Stub = {}) {
  const writes: unknown[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/strategies/od-next/rollout') {
      if (options.rolloutFails) return new Response('{}', { status: 500 });
      return new Response(
        JSON.stringify({ status: options.rolloutStatus ?? status() }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url === '/api/app-config') {
      writes.push(JSON.parse(String(init?.body ?? '{}')));
      if (options.writeFails) return new Response('{}', { status: 500 });
      return new Response('{"config":{}}', { status: 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { writes, fetchMock };
}

function renderSection(onAutosaveStatus?: (s: 'saving' | 'saved' | 'error' | 'idle') => void) {
  return render(
    <I18nProvider initial="en">
      <LabsSection onAutosaveStatus={onAutosaveStatus} />
    </I18nProvider>,
  );
}

function switchEl(): HTMLButtonElement {
  return screen.getByTestId('labs-harness-switch') as HTMLButtonElement;
}

describe('LabsSection', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    track.mockClear();
  });

  it('renders the harness row off and operable on a machine that never configured it', async () => {
    stubFetch();
    renderSection();
    await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('false'));
    expect(switchEl().getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Design Harness')).toBeTruthy();
    expect(
      screen.getByText(
        "Your next generation will use OpenDesign's latest strategy, with noticeably more polished results (beta)",
      ),
    ).toBeTruthy();
  });

  it('renders on when the installation saved active', async () => {
    stubFetch({ rolloutStatus: status({ requestedMode: 'active', requestedModeSource: 'app_config' }) });
    renderSection();
    await waitFor(() => expect(switchEl().getAttribute('aria-checked')).toBe('true'));
    expect(switchEl().getAttribute('aria-disabled')).toBe('false');
  });

  it('shows observe as off without rewriting it', async () => {
    const { writes } = stubFetch({
      rolloutStatus: status({ requestedMode: 'observe', requestedModeSource: 'app_config' }),
    });
    renderSection();
    await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('false'));
    expect(switchEl().getAttribute('aria-checked')).toBe('false');
    expect(writes).toEqual([]);
  });

  it('writes active on the first turn-on and reports it on the autosave surface', async () => {
    const { writes } = stubFetch();
    const onAutosaveStatus = vi.fn();
    renderSection(onAutosaveStatus);
    await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('false'));

    fireEvent.click(switchEl());

    await waitFor(() => expect(writes).toEqual([{ odNextStrategyMode: 'active' }]));
    expect(switchEl().getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(onAutosaveStatus.mock.calls.map((c) => c[0])).toEqual(['saving', 'saved']));
  });

  it('writes an explicit off rather than clearing the key', async () => {
    const { writes } = stubFetch({
      rolloutStatus: status({ requestedMode: 'active', requestedModeSource: 'app_config' }),
    });
    renderSection();
    await waitFor(() => expect(switchEl().getAttribute('aria-checked')).toBe('true'));

    fireEvent.click(switchEl());

    await waitFor(() => expect(writes).toEqual([{ odNextStrategyMode: 'off' }]));
  });

  it('rolls the switch back and reports an error when the write fails', async () => {
    stubFetch({ writeFails: true });
    const onAutosaveStatus = vi.fn();
    renderSection(onAutosaveStatus);
    await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('false'));

    fireEvent.click(switchEl());

    await waitFor(() => expect(onAutosaveStatus).toHaveBeenCalledWith('error'));
    expect(switchEl().getAttribute('aria-checked')).toBe('false');
    expect(switchEl().getAttribute('aria-disabled')).toBe('false');
  });

  it('starts one write for a burst of clicks in the same tick', async () => {
    // `busy` is state, so a second click in the same tick still sees the
    // pre-render closure: `busy` false and the old `on`. Without a guard that
    // flips synchronously, each click in the burst starts its own write from a
    // stale baseline.
    const { writes } = stubFetch();
    renderSection();
    await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('false'));

    const target = switchEl();
    target.click();
    target.click();
    target.click();

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(writes).toEqual([{ odNextStrategyMode: 'active' }]);
    await waitFor(() => expect(switchEl().getAttribute('aria-checked')).toBe('true'));
  });

  it('accepts a second toggle once the first write has settled', async () => {
    const { writes } = stubFetch();
    renderSection();
    await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('false'));

    fireEvent.click(switchEl());
    await waitFor(() => expect(writes).toEqual([{ odNextStrategyMode: 'active' }]));
    await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('false'));

    fireEvent.click(switchEl());
    await waitFor(() => expect(writes).toEqual([
      { odNextStrategyMode: 'active' },
      { odNextStrategyMode: 'off' },
    ]));
    expect(switchEl().getAttribute('aria-checked')).toBe('false');
  });

  it('reports the toggle only after the preference is persisted', async () => {
    const { writes } = stubFetch();
    renderSection();
    await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('false'));

    fireEvent.click(switchEl());

    await waitFor(() => expect(writes).toHaveLength(1));
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    expect(track.mock.calls[0]?.[0]).toBe('labs_item_toggled');
    expect(track.mock.calls[0]?.[1]).toEqual({
      item_id: 'design_harness',
      to: 'on',
      source: 'settings',
    });
  });

  it('reports the opt-out direction on the way back off', async () => {
    stubFetch({ rolloutStatus: status({ requestedMode: 'active', requestedModeSource: 'app_config' }) });
    renderSection();
    await waitFor(() => expect(switchEl().getAttribute('aria-checked')).toBe('true'));

    fireEvent.click(switchEl());

    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    expect(track.mock.calls[0]?.[1]).toMatchObject({ to: 'off', source: 'settings' });
  });

  it('reports nothing when the write fails', async () => {
    // The switch rolls back, so the install does not hold the preference the
    // event would have asserted.
    stubFetch({ writeFails: true });
    const onAutosaveStatus = vi.fn();
    renderSection(onAutosaveStatus);
    await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('false'));

    fireEvent.click(switchEl());

    await waitFor(() => expect(onAutosaveStatus).toHaveBeenCalledWith('error'));
    expect(track).not.toHaveBeenCalled();
  });

  describe('opt-out reason', () => {
    async function optOut() {
      stubFetch({ rolloutStatus: status({ requestedMode: 'active', requestedModeSource: 'app_config' }) });
      renderSection();
      await waitFor(() => expect(switchEl().getAttribute('aria-checked')).toBe('true'));
      fireEvent.click(switchEl());
      await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
      await screen.findByText('Switched back to the previous approach. What did not work?');
    }

    function reasonEvents() {
      return track.mock.calls.filter((c) => (c[1] as { reason?: unknown }).reason);
    }

    it('asks only after an opt-out, never after opting in', async () => {
      stubFetch();
      renderSection();
      await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('false'));

      fireEvent.click(switchEl());

      await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
      expect(screen.queryByText('Switched back to the previous approach. What did not work?')).toBeNull();
    });

    it('reports a chosen reason as a second event, leaving the opt-out count intact', async () => {
      await optOut();

      fireEvent.click(screen.getByText('Too slow'));

      await waitFor(() => expect(track).toHaveBeenCalledTimes(2));
      expect(track.mock.calls[0]?.[1]).toEqual({ item_id: 'design_harness', to: 'off', source: 'settings' });
      expect(track.mock.calls[1]?.[1]).toEqual({
        item_id: 'design_harness',
        to: 'off',
        source: 'settings',
        reason: ['too_slow'],
        has_custom_reason: false,
      });
      expect(screen.queryByText('Switched back to the previous approach. What did not work?')).toBeNull();
    });

    it('records an explicit skip', async () => {
      await optOut();

      fireEvent.click(screen.getByText('Skip'));

      await waitFor(() => expect(reasonEvents()).toHaveLength(1));
      expect(reasonEvents()[0]?.[1]).toMatchObject({ reason: ['skipped'], has_custom_reason: false });
    });

    it('carries the free text when the user picks other', async () => {
      await optOut();

      fireEvent.click(screen.getByText('Other'));
      const input = screen.getByLabelText('What specifically did not work?') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '  layout drifts on long decks  ' } });
      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => expect(reasonEvents()).toHaveLength(1));
      expect(reasonEvents()[0]?.[1]).toMatchObject({
        reason: ['other'],
        has_custom_reason: true,
        custom_reason: 'layout drifts on long decks',
      });
    });

    it('keeps submit unavailable until the free text has content', async () => {
      await optOut();

      fireEvent.click(screen.getByText('Other'));
      const submit = screen.getByText('Submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);

      fireEvent.change(screen.getByLabelText('What specifically did not work?'), {
        target: { value: '   ' },
      });
      expect(submit.disabled).toBe(true);

      fireEvent.change(screen.getByLabelText('What specifically did not work?'), {
        target: { value: 'x' },
      });
      expect(submit.disabled).toBe(false);
    });

    it('records a skip when the question times out unanswered', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        await optOut();
        expect(reasonEvents()).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(120_000);

        await waitFor(() => expect(reasonEvents()).toHaveLength(1));
        expect(reasonEvents()[0]?.[1]).toMatchObject({ reason: ['skipped'] });
      } finally {
        vi.useRealTimers();
      }
    });

    it('stops the clock once the user starts writing a custom reason', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        await optOut();
        fireEvent.click(screen.getByText('Other'));

        await vi.advanceTimersByTimeAsync(300_000);

        // Taking the panel away mid-sentence would discard what they typed.
        expect(reasonEvents()).toHaveLength(0);
        expect(screen.getByLabelText('What specifically did not work?')).toBeTruthy();
      } finally {
        vi.useRealTimers();
      }
    });

    it('retracts the question when the user turns the switch back on', async () => {
      // A fumbled off/on used to leave the panel asking about a switch that was
      // already back on, and reported two opt-outs against a single reason row
      // once the stale question finally settled.
      await optOut();

      fireEvent.click(switchEl());

      await waitFor(() => expect(switchEl().getAttribute('aria-checked')).toBe('true'));
      await waitFor(() =>
        expect(screen.queryByText('Switched back to the previous approach. What did not work?')).toBeNull());

      const offs = track.mock.calls.filter((c) => (c[1] as { to?: string }).to === 'off');
      const ons = track.mock.calls.filter((c) => (c[1] as { to?: string }).to === 'on');
      // One reported opt-out, one reason row for it, one opt-in.
      expect(offs).toHaveLength(2);
      expect(offs.filter((c) => (c[1] as { reason?: unknown }).reason)).toHaveLength(1);
      expect(ons).toHaveLength(1);
    });

    it('records a skip when the user leaves the page with the question open', async () => {
      // Otherwise every abandoned question is a silent gap, and the share of
      // people who declined to answer reads lower than it is.
      await optOut();

      cleanup();

      await waitFor(() => expect(reasonEvents()).toHaveLength(1));
      expect(reasonEvents()[0]?.[1]).toMatchObject({ reason: ['skipped'] });
    });

    it('answers exactly once even when two paths out race', async () => {
      await optOut();

      fireEvent.click(screen.getByText('Too slow'));
      cleanup();

      await waitFor(() => expect(reasonEvents()).toHaveLength(1));
      expect(reasonEvents()[0]?.[1]).toMatchObject({ reason: ['too_slow'] });
    });
  });

  it('clears the saved confirmation instead of leaving it up', async () => {
    // The dialog's autosave pill is shared and has no timer of its own, so the
    // confirmation used to sit there for the rest of the session and follow the
    // user into every other settings section.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      stubFetch();
      const onAutosaveStatus = vi.fn();
      renderSection(onAutosaveStatus);
      await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('false'));

      fireEvent.click(switchEl());
      await waitFor(() => expect(onAutosaveStatus).toHaveBeenCalledWith('saved'));
      expect(onAutosaveStatus).not.toHaveBeenCalledWith('idle');

      await vi.advanceTimersByTimeAsync(3_000);

      await waitFor(() => expect(onAutosaveStatus).toHaveBeenCalledWith('idle'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('takes the saved confirmation down when the section is left early', async () => {
    stubFetch();
    const onAutosaveStatus = vi.fn();
    renderSection(onAutosaveStatus);
    await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('false'));

    fireEvent.click(switchEl());
    await waitFor(() => expect(onAutosaveStatus).toHaveBeenCalledWith('saved'));

    cleanup();

    expect(onAutosaveStatus).toHaveBeenCalledWith('idle');
  });

  it('locks the switch and explains when an environment variable owns the mode', async () => {
    stubFetch({
      rolloutStatus: status({ requestedMode: 'active', requestedModeSource: 'env' }),
    });
    renderSection();
    await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('true'));
    expect(switchEl().getAttribute('aria-checked')).toBe('true');
    expect(
      screen.getByText('An environment variable is controlling this setting, so it cannot be changed here.'),
    ).toBeTruthy();
  });

  it('locks the switch and explains when the local safety latch has tripped', async () => {
    stubFetch({
      rolloutStatus: status({
        requestedMode: 'active',
        requestedModeSource: 'app_config',
        latch: { mode: 'observe', reasonCode: 'quality_regression', latchedAt: 1 },
      }),
    });
    renderSection();
    await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('true'));
    expect(
      screen.getByText('Paused automatically after a problem was detected. Generation is using the original approach.'),
    ).toBeTruthy();
  });

  it('reports the latch, not the environment, when both would lock the switch', async () => {
    stubFetch({
      rolloutStatus: status({
        requestedMode: 'active',
        requestedModeSource: 'env',
        latch: { mode: 'off', reasonCode: 'machine_contract_leak', latchedAt: 1 },
      }),
    });
    renderSection();
    await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('true'));
    expect(
      screen.getByText('Paused automatically after a problem was detected. Generation is using the original approach.'),
    ).toBeTruthy();
    expect(
      screen.queryByText('An environment variable is controlling this setting, so it cannot be changed here.'),
    ).toBeNull();
  });

  it('keeps the page usable when the daemon cannot be reached', async () => {
    const { writes } = stubFetch({ rolloutFails: true });
    renderSection();
    await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('true'));
    expect(screen.getByText('Design Harness')).toBeTruthy();
    expect(
      screen.getByText('Could not read this setting. Check that the local daemon is running.'),
    ).toBeTruthy();

    fireEvent.click(switchEl());
    expect(writes).toEqual([]);
  });

  it('reveals the explanation on hover and on keyboard focus, and never toggles from it', async () => {
    const { writes } = stubFetch();
    renderSection();
    await waitFor(() => expect(switchEl().getAttribute('aria-disabled')).toBe('false'));

    const trigger = screen.getByLabelText('About Design Harness');
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip').textContent).toContain('agent harness');
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip').textContent).toContain('Hyperframes');
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.click(trigger);
    expect(writes).toEqual([]);
    expect(switchEl().getAttribute('aria-checked')).toBe('false');
  });
});
