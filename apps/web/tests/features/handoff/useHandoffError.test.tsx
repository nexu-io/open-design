// @vitest-environment jsdom
//
// Unit tests for the shared error hook. Pure state container (no port), used
// as coordination injected into the editors and CLI hooks.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useHandoffError } from '../../../src/features/handoff/hooks/useHandoffError.hooks';

describe('useHandoffError', () => {
  it('starts with no error', () => {
    const { result } = renderHook(() => useHandoffError());
    expect(result.current.error).toBeNull();
  });

  it('setError sets the message', () => {
    const { result } = renderHook(() => useHandoffError());
    act(() => result.current.setError('boom'));
    expect(result.current.error).toBe('boom');
  });

  it('clearError resets to null', () => {
    const { result } = renderHook(() => useHandoffError());
    act(() => result.current.setError('boom'));
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it('setError / clearError keep a stable identity across renders', () => {
    const { result, rerender } = renderHook(() => useHandoffError());
    const firstSet = result.current.setError;
    const firstClear = result.current.clearError;
    rerender();
    expect(result.current.setError).toBe(firstSet);
    expect(result.current.clearError).toBe(firstClear);
  });
});
