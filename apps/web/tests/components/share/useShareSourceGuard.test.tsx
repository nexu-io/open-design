// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useShareSourceGuard } from '../../../src/components/share/useShareSourceGuard';

const options = { projectId: 'p', fileName: 'index.html', context: null };
afterEach(cleanup);
it('preview-only rerenders keep a queued publication valid without any preparation state', () => {
  const { result, rerender } = renderHook(() => useShareSourceGuard(options));
  const queued = result.current.isCurrent;
  rerender();
  expect(queued()).toBe(true);
});
it.each(['projectId', 'fileName'] as const)('rejects a retained callback after %s changes, even if it changes back', field => {
  const { result, rerender } = renderHook(props => useShareSourceGuard(props), { initialProps: options });
  const queued = result.current.isCurrent;
  rerender({ ...options, [field]: 'changed' });
  expect(queued()).toBe(false);
  rerender(options);
  expect(queued()).toBe(false);
  expect(result.current.isCurrent()).toBe(true);
});
it('unmount retires a queued publication', () => {
  const { result, unmount } = renderHook(() => useShareSourceGuard(options));
  expect(result.current.isCurrent()).toBe(true);
  const current = result.current.isCurrent;
  unmount();
  expect(current()).toBe(false);
});
