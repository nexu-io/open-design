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
