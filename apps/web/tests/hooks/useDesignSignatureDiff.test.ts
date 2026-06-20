// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDesignSignatureDiff } from '../../src/components/Signature/hooks/useDesignSignatureDiff';

describe('useDesignSignatureDiff', () => {
  it('returns null diff on first version, a real diff on the next', () => {
    const { result, rerender } = renderHook(
      ({ html }) => useDesignSignatureDiff(html, 'art-1'),
      { initialProps: { html: 'a{color:#3b82f6}' } },
    );
    expect(result.current.signature).not.toBeNull();
    expect(result.current.diff).toBeNull();

    rerender({ html: 'a{color:#8b5cf6}' });
    expect(result.current.diff?.unchanged).toBe(false);
    expect(result.current.diff?.changes.some((c) => c.area === 'palette')).toBe(true);
  });

  it('returns null signature for empty html', () => {
    const { result } = renderHook(() => useDesignSignatureDiff('', 'art-1'));
    expect(result.current.signature).toBeNull();
    expect(result.current.diff).toBeNull();
  });

  it('does not leak previous-version state across different artifact ids', () => {
    const { result, rerender } = renderHook(
      ({ html, id }: { html: string; id: string }) => useDesignSignatureDiff(html, id),
      { initialProps: { html: 'a{color:#3b82f6}', id: 'a' } },
    );
    // Artifact 'a' has been seen once — no diff yet.
    expect(result.current.diff).toBeNull();

    // Switch to a different artifact id 'b' — it has never been seen, so diff must be null.
    rerender({ html: 'a{color:#8b5cf6}', id: 'b' });
    expect(result.current.diff).toBeNull();
  });
});
