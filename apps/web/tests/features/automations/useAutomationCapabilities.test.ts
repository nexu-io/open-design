// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAutomationCapabilities } from '../../../src/features/automations/hooks/useAutomationCapabilities.hooks';
import type { AutomationCapabilitiesPort } from '../../../src/features/automations/ports';

describe('useAutomationCapabilities', () => {
  it('stays empty while closed and never calls the port', () => {
    const port: AutomationCapabilitiesPort = {
      listPlugins: vi.fn(async () => []),
      fetchMcpServers: vi.fn(async () => null),
    };
    const { result } = renderHook(() => useAutomationCapabilities(port, false));
    expect(result.current).toEqual({ plugins: [], mcpServers: [] });
    expect(port.listPlugins).not.toHaveBeenCalled();
  });

  it('loads plugins and filters to enabled MCP servers once open', async () => {
    const port: AutomationCapabilitiesPort = {
      listPlugins: vi.fn(async () => [{ id: 'p1' }] as never),
      fetchMcpServers: vi.fn(async () => ({
        servers: [
          { id: 'a', enabled: true },
          { id: 'b', enabled: false },
        ],
        templates: [],
      }) as never),
    };
    const { result } = renderHook(() => useAutomationCapabilities(port, true));
    await waitFor(() => expect(result.current.plugins).toHaveLength(1));
    expect(result.current.mcpServers.map((s) => s.id)).toEqual(['a']);
  });

  it('falls back to empty lists when a lookup rejects', async () => {
    const port: AutomationCapabilitiesPort = {
      listPlugins: vi.fn(async () => {
        throw new Error('plugins boom');
      }),
      fetchMcpServers: vi.fn(async () => {
        throw new Error('mcp boom');
      }),
    };
    const { result } = renderHook(() => useAutomationCapabilities(port, true));
    await waitFor(() => expect(port.listPlugins).toHaveBeenCalled());
    await waitFor(() => expect(result.current).toEqual({ plugins: [], mcpServers: [] }));
  });

  it('falls back to an empty MCP list when fetchMcpServers resolves null', async () => {
    const port: AutomationCapabilitiesPort = {
      listPlugins: vi.fn(async () => []),
      fetchMcpServers: vi.fn(async () => null),
    };
    const { result } = renderHook(() => useAutomationCapabilities(port, true));
    await waitFor(() => expect(port.fetchMcpServers).toHaveBeenCalled());
    expect(result.current.mcpServers).toEqual([]);
  });

  it('ignores a result that resolves after unmount', async () => {
    let resolvePlugins: (value: never[]) => void = () => {};
    const port: AutomationCapabilitiesPort = {
      listPlugins: vi.fn(() => new Promise<never[]>((resolve) => { resolvePlugins = resolve; })),
      fetchMcpServers: vi.fn(async () => null),
    };
    const { unmount } = renderHook(() => useAutomationCapabilities(port, true));
    unmount();
    await act(async () => {
      resolvePlugins([]);
    });
    // No React "state update on an unmounted component" warning/crash means
    // the `canceled` guard held.
  });
});
