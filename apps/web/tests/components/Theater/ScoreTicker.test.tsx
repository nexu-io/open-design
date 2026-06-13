// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScoreTicker } from '../../../src/components/Theater/ScoreTicker';
import type { CritiqueRound } from '../../../src/components/Theater/state/reducer';

afterEach(() => cleanup());

function landed(n: number, composite: number): CritiqueRound {
  return { n, composite, mustFix: 0, panelists: {} };
}
function inFlight(n: number): CritiqueRound {
  return { n, mustFix: 0, panelists: {} };
}

describe('<ScoreTicker> (Phase 8)', () => {
  it('renders empty state before any round lands', () => {
    render(<ScoreTicker rounds={[inFlight(1)]} threshold={8} scale={10} />);
    expect(screen.getByRole('status').getAttribute('data-empty')).toBe('true');
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('shows the latest composite as the headline value', () => {
    render(
      <ScoreTicker rounds={[landed(1, 7.4), landed(2, 8.6)]} threshold={8} scale={10} />,
    );
    expect(screen.getByText('8.6')).toBeTruthy();
  });

  it('marks each tick against the threshold', () => {
    render(
      <ScoreTicker rounds={[landed(1, 7.4), landed(2, 8.6)]} threshold={8} scale={10} />,
    );
    const ticks = Array.from(
      document.querySelectorAll<HTMLElement>('.theater-score-tick'),
    );
    expect(ticks).toHaveLength(2);
    expect(ticks[0]!.getAttribute('data-meets-threshold')).toBe('false');
    expect(ticks[1]!.getAttribute('data-meets-threshold')).toBe('true');
  });

  it('renders the threshold label with one decimal', () => {
    render(<ScoreTicker rounds={[landed(1, 7.4)]} threshold={8.5} scale={10} />);
    expect(screen.getByText(/8\.5/)).toBeTruthy();
  });
});
