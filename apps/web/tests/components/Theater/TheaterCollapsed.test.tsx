// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TheaterCollapsed } from '../../../src/components/Theater/TheaterCollapsed';
import type { CritiqueState } from '../../../src/components/Theater/state/reducer';

afterEach(() => cleanup());

const baseConfig = {
  cast: ['designer', 'critic', 'brand', 'a11y', 'copy'] as const,
  maxRounds: 3,
  threshold: 8,
  scale: 10,
  protocolVersion: 1,
};

describe('<TheaterCollapsed> (Phase 8)', () => {
  it('renders the shipped badge + composite + round for a clean ship', () => {
    const state: CritiqueState = {
      phase: 'shipped',
      runId: 'r',
      config: { ...baseConfig, cast: [...baseConfig.cast] },
      rounds: [],
      warnings: [],
      final: {
        composite: 8.6,
        round: 2,
        status: 'shipped',
        artifactRef: { projectId: 'p', artifactId: 'a' },
        summary: 'ok',
      },
    };
    render(<TheaterCollapsed state={state} />);
    expect(screen.getByRole('status').getAttribute('data-phase')).toBe('shipped');
    expect(screen.getByRole('status').getAttribute('data-ship-status')).toBe('shipped');
    expect(screen.getByText('Shipped')).toBeTruthy();
    expect(screen.getByText(/Shipped at round 2/)).toBeTruthy();
    expect(screen.getByText(/composite 8\.6/)).toBeTruthy();
  });

  it('renders the below-threshold badge when the run shipped under the bar', () => {
    const state: CritiqueState = {
      phase: 'shipped',
      runId: 'r',
      config: { ...baseConfig, cast: [...baseConfig.cast] },
      rounds: [],
      warnings: [],
      final: {
        composite: 7.2,
        round: 3,
        status: 'below_threshold',
        artifactRef: { projectId: 'p', artifactId: 'a' },
        summary: 'best-effort',
      },
    };
    render(<TheaterCollapsed state={state} />);
    expect(screen.getByText('Below threshold')).toBeTruthy();
  });

  it('renders the interrupted phase with bestRound + composite', () => {
    const state: CritiqueState = {
      phase: 'interrupted',
      runId: 'r',
      config: { ...baseConfig, cast: [...baseConfig.cast] },
      rounds: [],
      warnings: [],
      bestRound: 1,
      composite: 7.9,
    };
    render(<TheaterCollapsed state={state} />);
    expect(screen.getByRole('status').getAttribute('data-phase')).toBe('interrupted');
    expect(screen.getByText('Interrupted')).toBeTruthy();
    // Lefarcen P3 on PR #1314: the interrupted branch must NOT reuse
    // the shipped summary copy ("Shipped at round...") since the run
    // was specifically NOT shipped. Pin the wording so a future
    // refactor that swaps the keys back trips this assertion.
    expect(screen.getByText(/Interrupted at round 1/)).toBeTruthy();
    expect(screen.getByText(/best composite 7\.9/)).toBeTruthy();
    expect(
      screen.queryByText((_, node) => /Shipped at round/.test(node?.textContent ?? '')),
    ).toBeNull();
  });

  it('renders the failed phase with the cause-specific reason', () => {
    const state: CritiqueState = {
      phase: 'failed',
      runId: 'r',
      config: { ...baseConfig, cast: [...baseConfig.cast] },
      rounds: [],
      warnings: [],
      cause: 'total_timeout',
    };
    render(<TheaterCollapsed state={state} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('data-phase')).toBe('failed');
    expect(status.getAttribute('data-cause')).toBe('total_timeout');
    expect(screen.getByText(/total time budget/i)).toBeTruthy();
  });
});
