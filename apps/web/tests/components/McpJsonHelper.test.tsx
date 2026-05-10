import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeAll } from 'vitest';
import { McpClientSection } from '../../src/components/McpClientSection';

// Interactive jsdom test that renders the real production component and
// asserts the helper toggle/panel wiring instead of using a duplicated
// fixture. Stubs fetch to return a predictable server list.

beforeAll(() => {
  // Minimal fetch stub for the MCP servers endpoint used by the component.
  // Keep it permissive so other incidental fetches return an empty JSON.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // Wait for helper toggles to appear (component fetches servers).
    const toggles = await screen.findAllByRole('button', { name: /Need help\?/i });
    expect(toggles.length).toBeGreaterThanOrEqual(2);

    // Default should be collapsed
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');

    // Open the second row's helper (http transport) and assert wiring
    fireEvent.click(toggles[1]);

    const ariaControls = toggles[1].getAttribute('aria-controls');
    expect(ariaControls).toBeTruthy();
    // Should not be the literal duplicate id
    expect(ariaControls).not.toBe('mcp-json-helper-panel');
    expect(ariaControls).toMatch(/^mcp-json-helper-panel-/);

    const panel = document.getElementById(ariaControls!);
    expect(panel).toBeTruthy();
    expect(panel?.textContent).toContain('Example MCP JSON');
  });
});
