// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpClientSection } from '../../src/components/McpClientSection';
import { I18nProvider } from '../../src/i18n';

const oauthExpiresAt = Date.UTC(2026, 5, 7, 11, 0, 0);

beforeEach(() => {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.endsWith('/api/mcp/servers')) {
      return Promise.resolve(new Response(
        JSON.stringify({
          servers: [
            { id: 'srv-1', transport: 'stdio', enabled: true },
            {
              id: 'srv-2',
              transport: 'http',
              enabled: true,
              url: 'https://example.com/mcp',
              authMode: 'oauth',
            },
          ],
          templates: [],
        }),
      )) as any;
    }
    if (url.includes('/api/mcp/oauth/status')) {
      return Promise.resolve(new Response(
        JSON.stringify({ connected: true, expiresAt: oauthExpiresAt }),
      )) as any;
    }
    return Promise.resolve(new Response('{}')) as any;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

  it('formats managed OAuth expiry timestamps with the selected app locale', async () => {
    const toLocaleStringSpy = vi.spyOn(Date.prototype, 'toLocaleString');

    render(
      <I18nProvider initial="zh-CN">
        <McpClientSection />
      </I18nProvider>,
    );

    const expandButtons = await screen.findAllByRole('button', {
      name: /Expand this MCP server/i,
    });
    fireEvent.click(expandButtons[1]!);

    const expectedExpiry = new Date(oauthExpiresAt).toLocaleString('zh-CN');
    expect(await screen.findByText(`令牌将于 ${expectedExpiry} 过期。`)).toBeTruthy();
    expect(
      toLocaleStringSpy.mock.calls.some(([locale]) => locale === 'zh-CN'),
    ).toBe(true);
  });
});
