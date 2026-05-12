// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CritiqueTheaterMount } from '../../../src/components/Theater/CritiqueTheaterMount';
import type { CritiqueAction } from '../../../src/components/Theater/state/reducer';

afterEach(() => cleanup());

interface FactoryHandle {
  send: (action: CritiqueAction) => void;
  closed: boolean;
}

function makeFactory() {
  const handles: FactoryHandle[] = [];
  const factory = (
    _projectId: string,
    onEvent: (action: CritiqueAction) => void,
  ) => {
    const handle: FactoryHandle = {
      send: (action) => onEvent(action),
      closed: false,
    };
    handles.push(handle);
    return {
      close(): void {
        handle.closed = true;
      },
    };
  };
  return { factory, handles };
}

describe('<CritiqueTheaterMount> (Phase 9.1)', () => {
  it('renders nothing when disabled even if a runs starts later', () => {
    const { factory } = makeFactory();
    const { container } = render(
      <CritiqueTheaterMount projectId="p-1" enabled={false} connectionFactory={factory} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while idle, then mounts the stage on run_started', () => {
    const { factory, handles } = makeFactory();
    const { container } = render(
      <CritiqueTheaterMount projectId="p-1" enabled connectionFactory={factory} />,
    );
    // Idle pre-event: no DOM.
    expect(container.firstChild).toBeNull();
    expect(handles).toHaveLength(1);

    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'r',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
    });

    expect(screen.getByRole('region').getAttribute('data-phase')).toBe('running');
  });

  it('flips the kill button to pending and synthesizes interrupted on click', () => {
    const { factory, handles } = makeFactory();
    render(<CritiqueTheaterMount projectId="p-1" enabled connectionFactory={factory} />);
    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'r',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
      handles[0]!.send({
        type: 'round_end',
        runId: 'r',
        round: 1,
        composite: 7.4,
        mustFix: 0,
        decision: 'continue',
        reason: 'below threshold',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }));

    // Phase flips to interrupted -> collapsed surface mounts in place
    // of the live stage.
    expect(screen.getByRole('status').getAttribute('data-phase')).toBe('interrupted');
    expect(screen.getByText('Interrupted')).toBeTruthy();
  });

  it('tears down the connection when enabled flips to false', () => {
    const { factory, handles } = makeFactory();
    const { rerender } = render(
      <CritiqueTheaterMount projectId="p-1" enabled connectionFactory={factory} />,
    );
    expect(handles).toHaveLength(1);
    expect(handles[0]!.closed).toBe(false);

    rerender(
      <CritiqueTheaterMount projectId="p-1" enabled={false} connectionFactory={factory} />,
    );
    expect(handles[0]!.closed).toBe(true);
  });

  it('POSTs to the daemon interrupt endpoint on Interrupt click (PR #1315 review)', () => {
    // Lefarcen + codex P1: the previous revision did the optimistic
    // local dispatch only, so the daemon-side run kept running while
    // the UI ignored the real terminal event. Fire the kill request
    // alongside the optimistic dispatch.
    const { factory, handles } = makeFactory();
    const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
    const fetchInterrupt = vi.fn(async (url: string, init: RequestInit) => {
      fetchCalls.push({ url, init });
      return new Response(null, { status: 204 });
    });
    render(
      <CritiqueTheaterMount
        projectId="proj-42"
        enabled
        connectionFactory={factory}
        fetchInterrupt={fetchInterrupt}
      />,
    );
    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'run-abc',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }));

    expect(fetchInterrupt).toHaveBeenCalledTimes(1);
    expect(fetchCalls[0]!.url).toBe(
      '/api/projects/proj-42/critique/run-abc/interrupt',
    );
    expect(fetchCalls[0]!.init.method).toBe('POST');
  });

  it('swallows a rejected interrupt fetch and still moves the UI to interrupted', () => {
    // If the daemon endpoint has not landed yet (Phase 15), the
    // user's click should still flip the UI; the warning surfaces
    // on the dev console rather than tearing the React tree.
    const { factory, handles } = makeFactory();
    const fetchInterrupt = vi.fn(async () => {
      throw new Error('boom');
    });
    render(
      <CritiqueTheaterMount
        projectId="proj-1"
        enabled
        connectionFactory={factory}
        fetchInterrupt={fetchInterrupt}
      />,
    );
    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'run-abc',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }));
    // Optimistic dispatch already fired so the collapsed surface
    // mounts in place of the live stage.
    expect(screen.getByRole('status').getAttribute('data-phase')).toBe('interrupted');
  });

  it('resets interruptPending when a fresh run starts after an interrupt (codex P2 on PR #1315)', () => {
    // Previously `interruptPending` stayed true forever once clicked,
    // so a second run on the same mount would render the kill
    // button stuck in the "Interrupting…" state.
    const { factory, handles } = makeFactory();
    render(
      <CritiqueTheaterMount
        projectId="proj-1"
        enabled
        connectionFactory={factory}
        fetchInterrupt={vi.fn(async () => new Response(null, { status: 204 }))}
      />,
    );
    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'run-1',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }));
    expect(screen.getByRole('status').getAttribute('data-phase')).toBe('interrupted');

    // Daemon emits a fresh run_started for the next rerun. The
    // collapsed badge should give way to a live stage with a fresh
    // Interrupt button that is NOT pending.
    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'run-2',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
    });
    const btn = screen.getByRole('button', { name: 'Interrupt' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('multi-round interrupt ships bestRound + composite from the same round (lefarcen P3 on PR #1338)', async () => {
    // Regression test for the round / composite drift bug the
    // previous bestRoundOf had: a run where round 1 closes at 8.5
    // and round 2 closes at 6.0 must dispatch interrupted with
    // bestRound=1, composite=8.5, NOT bestRound=2 paired with 8.5
    // (the two helpers had disagreed). bestRoundAndComposite now
    // walks state.rounds once and returns the matching pair so the
    // drift cannot reappear; this test locks the fix in.
    const { factory, handles } = makeFactory();
    render(
      <CritiqueTheaterMount
        projectId="proj-1"
        enabled
        connectionFactory={factory}
        fetchInterrupt={vi.fn(async () => new Response(null, { status: 204 }))}
      />,
    );
    const cast = ['designer', 'critic', 'brand', 'a11y', 'copy'] as const;
    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'run-multi',
        protocolVersion: 1,
        cast: [...cast],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
      // Round 1 closes with the high composite (8.5).
      for (const role of cast) {
        handles[0]!.send({
          type: 'panelist_close',
          runId: 'run-multi',
          round: 1,
          role,
          score: 8.5,
        });
      }
      handles[0]!.send({
        type: 'round_end',
        runId: 'run-multi',
        round: 1,
        composite: 8.5,
        mustFix: 0,
        decision: 'continue',
        reason: 'continue',
      });
      // Round 2 closes with the LOW composite (6.0), which would
      // be the "last numeric composite seen" under the buggy helper.
      for (const role of cast) {
        handles[0]!.send({
          type: 'panelist_close',
          runId: 'run-multi',
          round: 2,
          role,
          score: 6.0,
        });
      }
      handles[0]!.send({
        type: 'round_end',
        runId: 'run-multi',
        round: 2,
        composite: 6.0,
        mustFix: 1,
        decision: 'continue',
        reason: 'continue',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }));
    // The collapsed badge renders the interruptedSummary key with
    // {round} and {composite} placeholders. The right answer is
    // round 1 (the high-composite round) paired with 8.5.
    await waitFor(() => {
      expect(screen.getByRole('status').getAttribute('data-phase')).toBe('interrupted');
    });
    expect(screen.getByText(/round 1/i)).toBeTruthy();
    // The badge must not display round 2 paired with the round-1
    // composite. The buggy helper would have produced that pair.
    expect(screen.queryByText(/round 2.*8\.5/i)).toBeNull();
  });
});
