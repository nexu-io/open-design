// @vitest-environment jsdom
//
// The Go tier joined the personal ladder (free → go → plus → pro → max). Until
// it was mapped, a Go subscriber fell through `planBadgeTierForLabel` to null
// and the billing pill drew the generic battery glyph — the one badge that is
// supposed to name the plan said nothing about it.
//
// The designer delivered the Go vector in the v2 spec, so the text placeholder
// is gone: Go is now a stroked wordmark on the same contract as the other
// tiers (currentColor stroke, height-driven width, aria-hidden).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PlanWordmark, planBadgeTierForLabel, planBadgeTierForWorkspace } from '../../src/components/PlanWordmark';

afterEach(cleanup);

describe('Go plan badge', () => {
  it.each(['go', 'Go'])('maps the %s plan id to its own badge', (label) => {
    expect(planBadgeTierForLabel(label)).toBe('go');
  });

  it('keeps a team subscription on the team wordmark even at the Go tier', () => {
    expect(planBadgeTierForWorkspace({ tier: 'go', workspaceType: 'team' })).toBe('team');
  });

  it('does not claim every label that merely contains the letters "go"', () => {
    expect(planBadgeTierForLabel('goodwill')).toBeNull();
  });

  it('draws the designer’s Go vector, not a text placeholder', () => {
    const { container } = render(<PlanWordmark tier="go" height={20} />);

    const svg = container.querySelector('svg.plan-wordmark');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 88 49');
    // Height-driven width, from the v2 spec's own 88×49 box.
    expect(svg?.getAttribute('height')).toBe('20');
    expect(svg?.getAttribute('width')).toBe('36');
    expect(svg?.querySelectorAll('path')).toHaveLength(3);
    expect(svg?.querySelector('text')).toBeNull();
    expect(screen.queryByText('Go')).toBeNull();
  });

  // The Go glyph is the only one drawn with rounded ends — without the join
  // the `G` bar and the tail read as cut-off stubs at 20px.
  it('keeps the round line caps the vector was drawn with', () => {
    const { container } = render(<PlanWordmark tier="go" />);

    const svg = container.querySelector('svg.plan-wordmark');
    expect(svg?.getAttribute('stroke-linecap')).toBe('round');
    expect(svg?.getAttribute('stroke-linejoin')).toBe('round');
  });
});

it('uses the supplied seats HTML Go artwork only for the migrated surface', () => {
  const { container } = render(<PlanWordmark tier="go" height={16} variant="seats-phase1" />);
  const svg = container.querySelector('svg')!;
  expect(svg.getAttribute('stroke-linecap')).toBeNull();
  expect(svg.getAttribute('stroke-linejoin')).toBeNull();
  expect(svg.querySelector('path')?.getAttribute('d')).toBe('M0.5 2.5H63C75.1503 2.5 85 12.3497 85 24.5C85 36.6503 75.1503 46.5 63 46.5H0');
});
