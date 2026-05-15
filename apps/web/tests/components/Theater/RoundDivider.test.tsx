// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RoundDivider } from '../../../src/components/Theater/RoundDivider';

afterEach(() => cleanup());

describe('<RoundDivider> (Phase 8)', () => {
  it('renders the round label with both numerator and denominator', () => {
    render(<RoundDivider round={2} total={3} threshold={8} scale={10} />);
    expect(screen.getByRole('separator').getAttribute('aria-label')).toBe('Round 2 of 3');
    expect(screen.getByText('Round 2 of 3')).toBeTruthy();
  });

  it('marks the round in-progress when composite is undefined', () => {
    render(<RoundDivider round={1} total={3} threshold={8} scale={10} />);
    expect(screen.getByRole('separator').getAttribute('data-status')).toBe('in-progress');
    expect(screen.queryByText(/^\d+\.\d/)).toBeNull();
  });

  it('renders the composite score against scale once the round lands', () => {
    render(
      <RoundDivider round={1} total={3} composite={7.4} threshold={8} scale={10} />,
    );
    const separator = screen.getByRole('separator');
    expect(separator.getAttribute('data-status')).toBe('landed');
    expect(screen.getByText('7.4')).toBeTruthy();
    expect(screen.getByText('/10')).toBeTruthy();
  });

  it('flags whether the composite meets the threshold', () => {
    const { rerender } = render(
      <RoundDivider round={1} total={3} composite={7.4} threshold={8} scale={10} />,
    );
    expect(
      document.querySelector('.theater-round-score')?.getAttribute('data-meets-threshold'),
    ).toBe('false');

    rerender(<RoundDivider round={1} total={3} composite={8.6} threshold={8} scale={10} />);
    expect(
      document.querySelector('.theater-round-score')?.getAttribute('data-meets-threshold'),
    ).toBe('true');
  });
});
