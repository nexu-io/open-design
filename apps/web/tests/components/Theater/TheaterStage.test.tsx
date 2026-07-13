// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TheaterStage } from '../../../src/components/Theater/TheaterStage';
import type { CritiqueState } from '../../../src/components/Theater/state/reducer';

afterEach(() => cleanup());

const baseConfig = {
  cast: ['designer', 'critic', 'brand', 'a11y', 'copy'] as const,
  maxRounds: 3,
  threshold: 8,
  scale: 10,
  protocolVersion: 1,
};

describe('<TheaterStage> (Phase 8)', () => {
  it('renders nothing for the idle phase', () => {
    const { container } = render(
      <TheaterStage state={{ phase: 'idle' }} onInterrupt={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('mounts the live stage with a lane per panelist on the running phase', () => {
    const state: CritiqueState = {
      phase: 'running',
      runId: 'r',
      config: { ...baseConfig, cast: [...baseConfig.cast] },
      rounds: [{ n: 1, mustFix: 0, panelists: {} }],
      activeRound: 1,
      activePanelist: null,
      warnings: [],
    };
    render(<TheaterStage state={state} onInterrupt={() => undefined} />);
    expect(screen.getByRole('region').getAttribute('data-phase')).toBe('running');
    // Five panelist lanes mount: one group per role.
    expect(screen.getAllByRole('group')).toHaveLength(5);
  });

  it('routes a click on Interrupt back to the parent', () => {
    const onInterrupt = vi.fn();
    const state: CritiqueState = {
      phase: 'running',
      runId: 'r',
      config: { ...baseConfig, cast: [...baseConfig.cast] },
      rounds: [{ n: 1, mustFix: 0, panelists: {} }],
      activeRound: 1,
      activePanelist: null,
      warnings: [],
    };
    render(<TheaterStage state={state} onInterrupt={onInterrupt} />);
    fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }));
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it('falls through to the collapsed summary on shipped phase', () => {
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
    render(<TheaterStage state={state} onInterrupt={() => undefined} />);
    expect(screen.getByRole('status').getAttribute('data-phase')).toBe('shipped');
  });

  it('renders the degraded chip on degraded phase', () => {
    const state: CritiqueState = {
      phase: 'degraded',
      runId: 'r',
      config: { ...baseConfig, cast: [...baseConfig.cast] },
      rounds: [],
      warnings: [],
      degraded: { reason: 'adapter_unsupported', adapter: 'legacy-cli' },
    };
    render(<TheaterStage state={state} onInterrupt={() => undefined} />);
    expect(screen.getByRole('status').getAttribute('data-reason')).toBe('adapter_unsupported');
  });
});
