// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useShareSourceGuard } from '../../../src/components/share/useShareSourceGuard';

const options = { projectId: 'p', fileName: 'index.html', context: null, inputKey: 'source-a', settled: true };
afterEach(cleanup);
it('preview-only rerenders keep a queued publication valid without any preparation state', () => {
  const { result, rerender } = renderHook(() => useShareSourceGuard(options));
  const queued = result.current.canPublish;
  rerender();
  expect(queued()).toBe(true);
});
it.each(['inputKey', 'projectId', 'fileName'] as const)('rejects a retained callback after %s changes, even if it changes back', field => {
  const { result, rerender } = renderHook(props => useShareSourceGuard(props), { initialProps: options });
  const queued = result.current.canPublish;
  rerender({ ...options, [field]: 'changed' });
  expect(queued()).toBe(false);
  rerender(options);
  expect(queued()).toBe(false);
  expect(result.current.canPublish()).toBe(true);
});
it('unsettled source blocks publication but not immutable resume, and unmount retires intent', () => {
  const { result, unmount } = renderHook(() => useShareSourceGuard({ ...options, settled: false }));
  expect(result.current.isCurrent()).toBe(true);
  expect(result.current.canPublish()).toBe(false);
  const current = result.current.isCurrent;
  unmount();
  expect(current()).toBe(false);
});
