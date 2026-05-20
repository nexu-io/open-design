// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpClientSection } from '../../src/components/McpClientSection';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}

describe('McpClientSection OAuth controls', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/mcp/servers')) {
        return jsonResponse({
          servers: [
            {
              id: 'figma-use',
              label: 'figma-use',
              templateId: 'figma-use',
              transport: 'http',
              enabled: true,
              url: 'http://localhost:38451/mcp',
            },
          ],
          templates: [],
        });
      }
      if (url.startsWith('/api/mcp/oauth/status')) {
        return jsonResponse({ connected: false });
      }
      return jsonResponse({});
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('does not force managed OAuth for saved localhost HTTP MCP servers', async () => {
    render(<McpClientSection />);

    const expand = await screen.findByRole('button', {
      name: /Expand this MCP server/i,
    });
    fireEvent.click(expand);

    await waitFor(() => {
      expect(screen.getAllByText(/No managed OAuth/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: /^Connect$/i })).toBeNull();
  });

  it('infers no managed OAuth when a custom HTTP row is pointed at localhost', async () => {
    render(<McpClientSection />);

    fireEvent.click(await screen.findByRole('button', { name: /Add server/i }));
    fireEvent.click(screen.getByRole('button', { name: /Custom server/i }));
    const expandButtons = screen.getAllByRole('button', {
      name: /Expand this MCP server/i,
    });
    fireEvent.click(expandButtons[expandButtons.length - 1]!);

    fireEvent.change(screen.getByLabelText('Transport'), {
      target: { value: 'http' },
    });
    fireEvent.change(screen.getByLabelText('URL'), {
      target: { value: 'http://localhost:38451/mcp' },
    });

    await waitFor(() => {
      expect((screen.getByLabelText('OAuth mode') as HTMLSelectElement).value).toBe(
        'none',
      );
    });
    expect(screen.queryByRole('button', { name: /^Connect$/i })).toBeNull();
  });
});
