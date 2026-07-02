// @vitest-environment jsdom

import { describe, expect, it, beforeEach } from 'vitest';
import {
  useDesignSignatureStripEnabled,
  setDesignSignatureStripEnabled,
} from '../../src/components/Signature/hooks/useDesignSignatureStripEnabled';
import { act, renderHook } from '@testing-library/react';

beforeEach(() => window.localStorage.clear());

describe('useDesignSignatureStripEnabled', () => {
  it('defaults to false', () => {
    const { result } = renderHook(() => useDesignSignatureStripEnabled());
    expect(result.current).toBe(false);
  });

  it('reflects a same-tab toggle without reload', () => {
    const { result } = renderHook(() => useDesignSignatureStripEnabled());
    act(() => setDesignSignatureStripEnabled(true));
    expect(result.current).toBe(true);
  });
});
