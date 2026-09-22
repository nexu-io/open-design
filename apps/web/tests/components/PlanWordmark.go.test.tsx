// @vitest-environment jsdom
//
// The Go tier joined the personal ladder (free → go → plus → pro → max). Until
// it was mapped, a Go subscriber fell through `planBadgeTierForLabel` to null
// and the billing pill drew the generic battery glyph — the one badge that is
// supposed to name the plan said nothing about it.
//
// The vector wordmark has not been delivered yet, so the badge is a text
// placeholder in the same shape/colour contract as the other tiers.

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

  it('draws a Go badge instead of falling back to the generic glyph', () => {
    render(<PlanWordmark tier="go" />);

    expect(screen.getByText('Go')).toBeTruthy();
  });
});
