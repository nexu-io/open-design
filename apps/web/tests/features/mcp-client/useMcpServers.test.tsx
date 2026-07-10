// @vitest-environment jsdom
//
// The server-list hook against a hand-written fake `McpServersPort` — no global
// `fetch` mock. Pins load + daemon-error, draft editing (add/update/remove/move
// + picker), dirty-tracking with the onDirtyChange callback, and save (success,
// validation failure, transport failure).
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { McpServerConfig, McpServersResponse } from '@open-design/contracts';

import { useMcpServers } from '../../../src/features/mcp-client/hooks/useMcpServers.hooks';
import type { McpServersPort } from '../../../src/features/mcp-client/ports';
import type { UseMcpServersOptions } from '../../../src/features/mcp-client/hooks/useMcpServers.hooks';
import { I18nProvider } from '../../../src/i18n';

function server(over: Partial<McpServerConfig> = {}): McpServerConfig {
  return { id: 'a', transport: 'stdio', enabled: true, command: 'npx', ...over };
}
function response(over: Partial<McpServersResponse> = {}): McpServersResponse {
  return { servers: [server()], templates: [], ...over };
}
function makePort(over: Partial<McpServersPort> = {}): McpServersPort {
  return {
    fetchMcpServers: vi.fn(async () => response()),
    saveMcpServers: vi.fn(async (servers) => response({ servers })),
    ...over,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider initial="en">{children}</I18nProvider>
);

function renderServers(port: McpServersPort, options?: UseMcpServersOptions) {
  return renderHook(() => useMcpServers(port, options), { wrapper });
}

describe('useMcpServers', () => {
  it('loads servers + templates and starts clean', async () => {
    const { result } = renderServers(makePort());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.dirty).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets a daemon error when the load returns null', async () => {
    const { result } = renderServers(makePort({ fetchMcpServers: vi.fn(async () => null) }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBeTruthy();
    expect(result.current.rows).toHaveLength(0);
  });

  it('adds a blank row, closes the picker and becomes dirty', async () => {
    const onDirtyChange = vi.fn();
    const { result } = renderServers(makePort(), { onDirtyChange });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.togglePicker());
    expect(result.current.pickerOpen).toBe(true);
    act(() => result.current.addBlank());
    expect(result.current.pickerOpen).toBe(false);
    expect(result.current.rows).toHaveLength(2);
    await waitFor(() => expect(result.current.dirty).toBe(true));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('adds from a template, updates, moves and removes rows', async () => {
    const { result } = renderServers(makePort());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.addFromTemplate({ id: 'fig', label: 'Fig', description: '', transport: 'stdio', category: 'utilities' }));
    expect(result.current.rows.map((r) => r.templateId)).toContain('fig');

    act(() => result.current.updateRow(0, { label: 'renamed' }));
    expect(result.current.rows[0]!.label).toBe('renamed');

    act(() => result.current.moveRow(0, 1));
    expect(result.current.rows[1]!.label).toBe('renamed');
    // Out-of-range move is a no-op.
    act(() => result.current.moveRow(0, -1));
    expect(result.current.rows[1]!.label).toBe('renamed');

    act(() => result.current.removeRow(0));
    expect(result.current.rows).toHaveLength(1);
  });

  it('saves, rehydrates and notifies onServersChanged', async () => {
    const saveMcpServers = vi.fn(async (servers: McpServerConfig[]) => response({ servers }));
    const onServersChanged = vi.fn();
    const { result } = renderServers(makePort({ saveMcpServers }), { onServersChanged });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.addBlank());
    act(() => result.current.updateRow(1, { id: 'newsrv', command: 'node' }));

    let ok = false;
    await act(async () => {
      ok = await result.current.save();
    });
    expect(ok).toBe(true);
    expect(saveMcpServers).toHaveBeenCalledTimes(1);
    expect(onServersChanged).toHaveBeenCalled();
    expect(result.current.savedAt).toBeTypeOf('number');
    expect(result.current.dirty).toBe(false);
  });

  it('blocks save on a validation error without calling transport', async () => {
    const saveMcpServers = vi.fn(async (servers: McpServerConfig[]) => response({ servers }));
    const { result } = renderServers(makePort({ saveMcpServers }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.addBlank());
    act(() => result.current.updateRow(1, { id: '-invalid', command: 'node' }));

    let ok = true;
    await act(async () => {
      ok = await result.current.save();
    });
    expect(ok).toBe(false);
    expect(saveMcpServers).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/ID must start/);
  });

  it('reports a transport failure on save', async () => {
    const { result } = renderServers(makePort({ saveMcpServers: vi.fn(async () => null) }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.updateRow(0, { command: 'node' }));

    let ok = true;
    await act(async () => {
      ok = await result.current.save();
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(result.current.saving).toBe(false);
  });
});
