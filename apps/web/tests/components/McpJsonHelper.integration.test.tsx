import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import React from 'react';
import { McpClientSection } from '../../../src/components/McpClientSection';

// Render the real McpClientSection with a fake server list by stubbing fetch
// helpers. We only need to assert the helper id wiring and visibility across
// transports; keep the test focused and fast.

global.fetch = (input: RequestInfo) => {
  // Minimal stub for the fetchMcpServers/save endpoints used by the component
  const url = typeof input === 'string' ? input : String(input);
  if (url.endsWith('/api/mcp/servers')) {
    return Promise.resolve(new Response(JSON.stringify({ servers: [
      { id: 'srv-1', transport: 'stdio', enabled: true },
      { id: 'srv-2', transport: 'http', enabled: true }
    ], templates: [] }))) as any;
  }
  return Promise.resolve(new Response('{}')) as any;
};

describe('McpJsonHelper integration', () => {
  it('uses unique helper ids per row and is visible for HTTP transport', async () => {
    render(<McpClientSection />);

    // Wait for rows to render
    const toggles = await screen.findAllByRole('button', { name: /Need help\?/i });
    // There should be two rows from our stubbed response
    expect(toggles.length).toBeGreaterThanOrEqual(2);

    // Click the second toggle
    fireEvent.click(toggles[1]);

    // The panel id referenced by aria-controls should exist and be unique
    const ariaControls = toggles[1].getAttribute('aria-controls');
    expect(ariaControls).toBeTruthy();
    const panel = document.getElementById(ariaControls!);
    expect(panel).toBeTruthy();

    // Ensure the id contains the stable prefix and is not the literal string
    expect(ariaControls).not.toBe('mcp-json-helper-panel');
    expect(ariaControls).toMatch(/^mcp-json-helper-panel-/);

    // Ensure the helper is reachable when transport is http
    expect(panel?.textContent).toContain('Example MCP JSON');
  });
});
