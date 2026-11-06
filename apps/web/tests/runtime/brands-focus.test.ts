// @vitest-environment jsdom

// The Design-systems focus handoff is a one-shot: the brand-ready prompt stores
// the new system id, and the Design systems tab must read it EXACTLY once and
// clear it. If the clear ever regresses, every later visit to the tab would
// hijack the user's selection — so lock the read+clear contract here.

import { describe, expect, it, beforeEach } from 'vitest';
import {
  DESIGN_SYSTEM_FOCUS_KEY,
  setDesignSystemFocus,
  takeDesignSystemFocus,
} from '../../src/runtime/brands';

describe('design-system focus handoff', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('round-trips a focus id and clears it on read (one-shot)', () => {
    setDesignSystemFocus('user:acme');
    expect(window.sessionStorage.getItem(DESIGN_SYSTEM_FOCUS_KEY)).toBe('user:acme');

    expect(takeDesignSystemFocus()).toBe('user:acme');

    // Consumed: a second read returns null and the key is gone, so a later,
    // unrelated visit to the Design systems tab keeps its default selection.
    expect(takeDesignSystemFocus()).toBeNull();
    expect(window.sessionStorage.getItem(DESIGN_SYSTEM_FOCUS_KEY)).toBeNull();
  });

  it('returns null when nothing is pending', () => {
    expect(takeDesignSystemFocus()).toBeNull();
  });
});
