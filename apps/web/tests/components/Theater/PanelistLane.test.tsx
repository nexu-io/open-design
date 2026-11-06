// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PanelistLane } from '../../../src/components/Theater/PanelistLane';
import type { CritiqueRound } from '../../../src/components/Theater/state/reducer';

afterEach(() => cleanup());

function roundWithCritic(n: number, score?: number, mustFixes: string[] = []): CritiqueRound {
  return {
    n,
    mustFix: mustFixes.length,
    panelists: {
      critic: {
        dims: [
          { name: 'hierarchy', score: score ?? 6, note: '' },
          { name: 'contrast', score: score ? score - 0.5 : 5.5, note: '' },
        ],
        mustFixes,
        score,
      },
    },
  };
}

describe('<PanelistLane> (Phase 8)', () => {
  it('renders the localized role label and groups by aria-label', () => {
    render(
      <PanelistLane
        role="critic"
        rounds={[roundWithCritic(1, 7)]}
        activeRound={1}
        activePanelist={null}
        scale={10}
      />,
    );
    expect(screen.getByRole('group').getAttribute('aria-label')).toBe('Critic');
  });

  it('sums must-fix counts across rounds', () => {
    render(
      <PanelistLane
        role="critic"
        rounds={[
          roundWithCritic(1, 6, ['low contrast', 'missing focus ring']),
          roundWithCritic(2, 7, ['weak hero']),
        ]}
        activeRound={2}
        activePanelist={null}
        scale={10}
      />,
    );
    expect(screen.getByText('3 must-fix')).toBeTruthy();
  });

  it('marks the current round as active when the panelist is speaking', () => {
    render(
      <PanelistLane
        role="critic"
        rounds={[roundWithCritic(1, 7), roundWithCritic(2)]}
        activeRound={2}
        activePanelist="critic"
        scale={10}
      />,
    );
    const lane = screen.getByRole('group');
    expect(lane.getAttribute('data-active')).toBe('true');
    const open = lane.querySelector('[data-state="open"][data-current="true"]');
    expect(open).not.toBeNull();
  });

  it('renders a closed score with one decimal once panelist_close fires', () => {
    render(
      <PanelistLane
        role="critic"
        rounds={[roundWithCritic(1, 7.4)]}
        activeRound={1}
        activePanelist={null}
        scale={10}
      />,
    );
    expect(screen.getByText('7.4')).toBeTruthy();
  });
});
