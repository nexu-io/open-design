// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CommentDriftDemo } from '../src/collab/CommentDriftDemo';

afterEach(cleanup);

function badgeState(): string | null {
  return document.querySelector('[data-anchor-state]')?.getAttribute('data-anchor-state') ?? null;
}

describe('CommentDriftDemo', () => {
  it('starts anchored on the unchanged scenario', () => {
    render(<CommentDriftDemo />);
    expect(badgeState()).toBe('anchored');
    expect(screen.getByText(/none \(derived state/i)).toBeTruthy();
  });

  it('reports reanchored when the version advanced', () => {
    render(<CommentDriftDemo />);
    fireEvent.click(screen.getByText('Re-rendered (v2)'));
    expect(badgeState()).toBe('reanchored');
  });

  it('recovers a churned element by content as stale', () => {
    render(<CommentDriftDemo />);
    fireEvent.click(screen.getByText('Id churned, content intact (v2)'));
    expect(badgeState()).toBe('stale');
  });

  it('goes lost and plans a durable write-back when the section is removed', () => {
    render(<CommentDriftDemo />);
    fireEvent.click(screen.getByText('Section removed (v2)'));
    expect(badgeState()).toBe('lost');
    // The last-good position (40,30) is captured for the ghost pin.
    expect(screen.getByText(/PATCH anchor → lost @ 40,30/)).toBeTruthy();
  });
});
