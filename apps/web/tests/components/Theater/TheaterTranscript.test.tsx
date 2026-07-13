// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TheaterTranscript } from '../../../src/components/Theater/TheaterTranscript';
import type { CritiqueState } from '../../../src/components/Theater/state/reducer';

afterEach(() => cleanup());

const idle: CritiqueState = { phase: 'idle' };

describe('<TheaterTranscript> (Phase 8)', () => {
  it('shows the loading copy while the transcript fetch is in flight', () => {
    render(
      <TheaterTranscript
        state={idle}
        status="loading"
        error={null}
        speed="instant"
        onSpeedChange={() => undefined}
      />,
    );
    expect(screen.getByText('Loading transcript…')).toBeTruthy();
  });

  it('renders an alert with the error message when status is error', () => {
    render(
      <TheaterTranscript
        state={idle}
        status="error"
        error="404 not found"
        speed="instant"
        onSpeedChange={() => undefined}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('404 not found');
  });

  it('shows the empty copy when nothing has been replayed yet', () => {
    render(
      <TheaterTranscript
        state={idle}
        status="idle"
        error={null}
        speed="instant"
        onSpeedChange={() => undefined}
      />,
    );
    expect(
      screen.getByText('No transcript to replay yet. Run a critique to record one.'),
    ).toBeTruthy();
  });

  it('renders the read-only badge + speed picker for a running replay', () => {
    const state: CritiqueState = {
      phase: 'running',
      runId: 'r',
      config: { cast: ['critic'], maxRounds: 3, threshold: 8, scale: 10, protocolVersion: 1 },
      rounds: [{ n: 1, mustFix: 0, panelists: {} }],
      activeRound: 1,
      activePanelist: null,
      warnings: [],
    };
    render(
      <TheaterTranscript
        state={state}
        status="playing"
        error={null}
        speed="instant"
        onSpeedChange={() => undefined}
      />,
    );
    expect(screen.getByText('Read-only')).toBeTruthy();
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('fires onSpeedChange when the user picks a different speed', () => {
    const onSpeedChange = vi.fn();
    const state: CritiqueState = {
      phase: 'running',
      runId: 'r',
      config: { cast: ['critic'], maxRounds: 3, threshold: 8, scale: 10, protocolVersion: 1 },
      rounds: [{ n: 1, mustFix: 0, panelists: {} }],
      activeRound: 1,
      activePanelist: null,
      warnings: [],
    };
    render(
      <TheaterTranscript
        state={state}
        status="playing"
        error={null}
        speed="instant"
        onSpeedChange={onSpeedChange}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'paused' } });
    expect(onSpeedChange).toHaveBeenCalledWith('paused');
  });
});
