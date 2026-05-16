// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContinueInCliButton } from '../../src/components/ContinueInCliButton';

afterEach(() => {
  cleanup();
});

const STATE_MISSING = { exists: false, isStale: false, staleReason: null } as const;
const STATE_FRESH = { exists: true, isStale: false, staleReason: null } as const;
const STATE_STALE = { exists: true, isStale: true, staleReason: 'files-newer' } as const;
const STATE_UNKNOWN_PROVENANCE = {
  exists: true,
  isStale: true,
  staleReason: 'unknown-provenance',
} as const;

describe('ContinueInCliButton', () => {
  it('renders disabled with a visible inline hint when DESIGN.md is missing', () => {
    render(<ContinueInCliButton designMdState={STATE_MISSING} onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: /Continue in CLI/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    // Native disabled buttons don't fire hover/focus, so the
    // guidance must render visibly in the DOM rather than as a
    // tooltip (mrcfps's PR #974 review). Hint links to button via
    // aria-describedby so assistive tech still announces it.
    const hint = screen.getByRole('note');
    expect(hint.textContent).toBe('Finalize the design package first.');
    expect(btn.getAttribute('aria-describedby')).toBe(hint.id);
    expect(btn.getAttribute('title')).toBeNull();
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

  // Round 7 (mrcfps @ useDesignMdState.ts:160): malformed provenance
  // surfaces as a distinct chip so the user knows freshness is degraded
  // rather than seeing the green path advertised when parsing failed.
  it('renders the unknown-provenance chip when staleReason is unknown-provenance', () => {
    render(<ContinueInCliButton designMdState={STATE_UNKNOWN_PROVENANCE} onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: /Continue in CLI/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    const chip = screen.getByRole('note');
    expect(chip.textContent).toBe('Spec freshness unknown — regenerate to refresh signal');
  });

  it('invokes onClick when staleReason is unknown-provenance (button still enabled)', () => {
    const onClick = vi.fn();
    render(<ContinueInCliButton designMdState={STATE_UNKNOWN_PROVENANCE} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /Continue in CLI/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
