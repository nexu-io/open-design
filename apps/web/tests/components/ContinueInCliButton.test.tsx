// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContinueInCliButton } from '../../src/components/ContinueInCliButton';

afterEach(() => {
  cleanup();
});

const STATE_MISSING = { exists: false, isStale: false };
const STATE_FRESH = { exists: true, isStale: false };
const STATE_STALE = { exists: true, isStale: true };

describe('ContinueInCliButton', () => {
  it('renders disabled with the prerequisite tooltip when DESIGN.md is missing', () => {
    render(<ContinueInCliButton designMdState={STATE_MISSING} onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: /Continue in CLI/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute('title')).toBe('Finalize the design package first.');
  });

  it('renders enabled and chip-less when DESIGN.md is fresh', () => {
    render(<ContinueInCliButton designMdState={STATE_FRESH} onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: /^Continue in CLI$/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('renders enabled with the canonical stale chip when DESIGN.md is stale', () => {
    render(<ContinueInCliButton designMdState={STATE_STALE} onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: /Continue in CLI/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    const chip = screen.getByRole('note');
    expect(chip.textContent).toBe('Spec is stale — regenerate?');
  });

  it('does not invoke onClick while disabled', () => {
    const onClick = vi.fn();
    render(<ContinueInCliButton designMdState={STATE_MISSING} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /Continue in CLI/i }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('invokes onClick when DESIGN.md is fresh', () => {
    const onClick = vi.fn();
    render(<ContinueInCliButton designMdState={STATE_FRESH} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /Continue in CLI/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('invokes onClick when DESIGN.md is stale (button still enabled)', () => {
    const onClick = vi.fn();
    render(<ContinueInCliButton designMdState={STATE_STALE} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /Continue in CLI/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
