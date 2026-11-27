// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWorkspaceJourney } from '../../src/analytics/use-workspace-journey';
const track = vi.hoisted(() => vi.fn());
vi.mock('../../src/analytics/provider', () => ({ useAnalytics: () => ({ track }) }));
afterEach(cleanup);
beforeEach(() => track.mockReset());
function Surface({ visible = true, workspace = 'one' }: { visible?: boolean; workspace?: string }) {
  const journey = useWorkspaceJourney({ page_name: 'home', area: 'credit_exhausted_dialog', reason: 'credit_exhausted', workspace_key: workspace }, visible);
  return <button onClick={() => journey.click('close')}>close</button>;
}
it('still exposes a surface when crypto.randomUUID is unavailable on an insecure origin (issue #9359)', () => {
  // Plain-HTTP non-localhost origin: crypto.randomUUID is undefined, but
  // crypto.getRandomValues is still available. The journey id must come
  // from the shared uuid helper, not a direct crypto.randomUUID() call,
  // or rendering the surface throws and the app shell crashes.
  const originalCrypto = globalThis.crypto;
  vi.stubGlobal('crypto', {
    getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
  });
  try {
    const view = render(<StrictMode><Surface /></StrictMode>);
    expect(track.mock.calls.filter(([e]) => e === 'surface_view')).toHaveLength(1);
    expect(track.mock.calls[0]![1].surface_instance_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    view.unmount();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('only exposes visible instances and associates clicks with the same block', () => {
  const view = render(<StrictMode><Surface visible={false} /></StrictMode>);
  expect(track).not.toHaveBeenCalled();
  view.rerender(<StrictMode><Surface /></StrictMode>);
  view.rerender(<StrictMode><Surface /></StrictMode>);
  expect(track.mock.calls.filter(([e]) => e === 'surface_view')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button'));
  expect(track.mock.calls[1]![1].block_id).toBe(track.mock.calls[0]![1].block_id);
  view.rerender(<StrictMode><Surface workspace="two" /></StrictMode>);
  expect(track.mock.calls.filter(([e]) => e === 'surface_view')).toHaveLength(2);
  expect(track.mock.calls[2]![1].block_id).not.toBe(track.mock.calls[0]![1].block_id);
});
