// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { McpClientSection } from '../../src/components/McpClientSection';

beforeAll(() => {
  (global as any).fetch = (input: RequestInfo) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.endsWith('/api/mcp/servers')) {
      return Promise.resolve(new Response(
        JSON.stringify({
          servers: [
            { id: 'srv-1', transport: 'stdio', enabled: true },
            { id: 'srv-2', transport: 'http', enabled: true },
          ],
          templates: [],
        }),
      )) as any;
    }
    return Promise.resolve(new Response('{}')) as any;
  };
});

describe('McpJsonHelper (production)', () => {
  it('renders helper toggles and opens the per-row panel with a unique id', async () => {
    render(<McpClientSection />);

    const expandButtons = await screen.findAllByRole('button', {
      name: /Expand this MCP server/i,
    });
    expect(expandButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(expandButtons[0]!);
    fireEvent.click(expandButtons[1]!);

    const toggles = await screen.findAllByRole('button', { name: /Need help\?/i });
    expect(toggles.length).toBeGreaterThanOrEqual(2);

    const firstToggle = toggles[0];
    const secondToggle = toggles[1];
    if (!firstToggle || !secondToggle) {
      throw new Error('Expected at least two MCP helper toggle buttons');
    }

    expect(firstToggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(secondToggle);

    const ariaControls = secondToggle.getAttribute('aria-controls');
    expect(ariaControls).toBeTruthy();
    expect(ariaControls).not.toBe('mcp-json-helper-panel');
    expect(ariaControls).toMatch(/^mcp-json-helper-panel-/);

    const panel = document.getElementById(ariaControls!);
    expect(panel).toBeTruthy();
    expect(panel?.textContent).toContain('Example MCP JSON');
  });
});
