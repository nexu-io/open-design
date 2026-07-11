// @vitest-environment jsdom
//
// Unit tests for the dropdown navigation/layout hook. It's a pure state
// container (no port, no effects) — the whole contract is the open/tab
// transitions and a stable wrapRef, which the orchestrator's outside-click
// dismiss effect reads.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useHandoffMenuNav } from '../../../src/features/handoff/hooks/useHandoffMenuNav.hooks';

describe('useHandoffMenuNav', () => {
  it('starts closed on the editor tab with a null wrapRef', () => {
    const { result } = renderHook(() => useHandoffMenuNav());
    expect(result.current.open).toBe(false);
    expect(result.current.activeTab).toBe('editor');
    expect(result.current.wrapRef.current).toBeNull();
  });

  it('setOpen toggles the dropdown', () => {
    const { result } = renderHook(() => useHandoffMenuNav());
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    act(() => result.current.setOpen((v) => !v));
    expect(result.current.open).toBe(false);
  });

  it('setActiveTab switches between editor and cli', () => {
    const { result } = renderHook(() => useHandoffMenuNav());
    act(() => result.current.setActiveTab('cli'));
    expect(result.current.activeTab).toBe('cli');
    act(() => result.current.setActiveTab('editor'));
    expect(result.current.activeTab).toBe('editor');
  });

  it('wrapRef keeps a stable identity across renders', () => {
    const { result, rerender } = renderHook(() => useHandoffMenuNav());
    const firstRef = result.current.wrapRef;
    rerender();
    expect(result.current.wrapRef).toBe(firstRef);
  });
});
