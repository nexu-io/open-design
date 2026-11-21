// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DesignSystemSurface } from '../../src/components/plugins-home/cards/DesignSystemSurface';
import { workspaceContextFixture } from '../helpers/workspace-context';
vi.mock('../../src/utils/visualStability', () => ({ isVisualStabilityMode: () => true }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('loads a pinned showcase in the host without navigating the opaque iframe to its entry', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('<html><head></head><body>showcase</body></html>', { headers: { 'content-type': 'text/html' } }));
  vi.stubGlobal('fetch', fetcher);
  render(<DesignSystemSurface inView preview={{ kind: 'design', brand: 'Kit', designSystemId: 'kit', swatches: [], workspaceContext: workspaceContextFixture({ workspaceId: 'team', workspaceMemberId: 'member' }) }} />);
  const frame = screen.getByTitle('Kit showcase preview');
  expect(frame.getAttribute('src')).toBeNull();
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('showcase'));
  expect(fetcher).toHaveBeenCalledWith('/api/design-systems/kit/showcase?workspaceId=team&workspaceMemberId=member', expect.objectContaining({ headers: { 'x-od-design-system-preview': '1' } }));
});
