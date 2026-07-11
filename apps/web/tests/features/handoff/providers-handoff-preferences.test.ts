// @vitest-environment jsdom
//
// The remembered-picks localStorage bridge. Pins the round-trip for both
// keys, the invalid/missing-value fallback, and the try/catch swallow when
// localStorage throws (quota exceeded, sandboxed storage). The `typeof
// window === 'undefined'` SSR guard on `readPreferredFramework` is covered by
// the node-environment companion suite.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readPreferredEditor,
  readPreferredFramework,
  writePreferredEditor,
  writePreferredFramework,
} from '../../../src/providers/handoff-preferences';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('readPreferredEditor / writePreferredEditor', () => {
  it('round-trips a written editor id', () => {
    writePreferredEditor('cursor');
    expect(readPreferredEditor()).toBe('cursor');
  });

  it('returns null when nothing is stored', () => {
    expect(readPreferredEditor()).toBeNull();
  });

  it('returns null instead of throwing when localStorage.getItem throws', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readPreferredEditor()).toBeNull();
  });

  it('swallows a write failure (quota exceeded, sandboxed storage)', () => {
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => writePreferredEditor('vscode')).not.toThrow();
  });
});

describe('readPreferredFramework / writePreferredFramework', () => {
  it('round-trips a known framework id', () => {
    writePreferredFramework('vue');
    expect(readPreferredFramework()).toBe('vue');
  });

  it('defaults to react when nothing is stored', () => {
    expect(readPreferredFramework()).toBe('react');
  });

  it('defaults to react when the stored value is not a known framework id', () => {
    window.localStorage.setItem('open-design:handoff-framework', 'not-a-framework');
    expect(readPreferredFramework()).toBe('react');
  });

  it('defaults to react instead of throwing when localStorage.getItem throws', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readPreferredFramework()).toBe('react');
  });

  it('swallows a write failure (quota exceeded, sandboxed storage)', () => {
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => writePreferredFramework('svelte')).not.toThrow();
  });
});
