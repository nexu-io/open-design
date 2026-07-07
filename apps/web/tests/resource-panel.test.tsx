// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ResourcePanelPage from '../app/resource-panel/page';

describe('ResourcePanelPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uses the selected kind for manual non-design-system pulls', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input) === '/api/resources') {
        return new Response(JSON.stringify({ resources: [] }), { status: 200 });
      }
      if (
        String(input) === '/api/resources/plugin/hub-plugin/pull' &&
        init?.method === 'POST'
      ) {
        return new Response(JSON.stringify({ alreadyOwned: false, version: 3 }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ error: 'unexpected_request' }), {
        status: 500,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ResourcePanelPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/resources', { method: 'GET' });
    });

    fireEvent.change(screen.getByTestId('pull-kind'), {
      target: { value: 'plugin' },
    });
    fireEvent.change(screen.getByTestId('pull-id'), {
      target: { value: 'hub-plugin' },
    });
    fireEvent.click(screen.getByTestId('pull-btn'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/resources/plugin/hub-plugin/pull',
        { method: 'POST' },
      );
    });
  });
});
