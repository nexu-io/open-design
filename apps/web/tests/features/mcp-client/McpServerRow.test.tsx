// @vitest-environment jsdom
//
// The row editor: collapsed summary -> expanded form, enable/transport/field
// edits flowing out through onChange, the per-row JSON-helper disclosure (unique
// id), and the conditional OAuth affordances. A saved managed-OAuth HTTP row
// mounts the real wired OAuth control, so global fetch is stubbed for that case.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServerRow } from '../../../src/features/mcp-client/components/McpServerRow';
import type { DraftRow } from '../../../src/features/mcp-client/types';

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function row(over: Partial<DraftRow> = {}): DraftRow {
  return { id: 'srv-1', transport: 'stdio', enabled: true, command: 'npx', _localId: 'row-1', ...over };
}

function renderRow(over: Partial<Parameters<typeof McpServerRow>[0]> = {}) {
  const props = {
    row: row(),
    idx: 0,
    total: 2,
    onChange: vi.fn(),
    onRemove: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    ...over,
  };
  render(<McpServerRow {...props} />);
  return props;
}

describe('McpServerRow', () => {
  it('shows the summary collapsed and expands to the editor', () => {
    renderRow();
    expect(screen.getByText('srv-1')).toBeTruthy();
    expect(screen.queryByText('ID')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Expand this MCP server/i }));
    expect(screen.getByText('ID')).toBeTruthy();
  });

  it('forwards enable, remove and move interactions', () => {
    const props = renderRow();
    fireEvent.click(screen.getByLabelText('Enable this MCP server'));
    expect(props.onChange).toHaveBeenCalledWith({ enabled: false });
    // The icon Buttons expose their glyph as the accessible name, so query by
    // the `title` tooltip instead of the role name.
    fireEvent.click(screen.getByTitle('Remove this MCP server'));
    expect(props.onRemove).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Move up'));
    expect(props.onMoveUp).toHaveBeenCalled();
  });

  it('edits command and switches transport through onChange', () => {
    const props = renderRow();
    fireEvent.click(screen.getByRole('button', { name: /Expand this MCP server/i }));
    fireEvent.change(screen.getByDisplayValue('npx'), { target: { value: 'node' } });
    expect(props.onChange).toHaveBeenCalledWith({ command: 'node' });
    fireEvent.change(screen.getByLabelText('Transport'), { target: { value: 'http' } });
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ transport: 'http' }));
  });

  it('gives each row a uniquely-id-ed JSON helper panel', () => {
    renderRow({ row: row({ _localId: 'row-xyz' }) });
    fireEvent.click(screen.getByRole('button', { name: /Expand this MCP server/i }));
    const toggle = screen.getByRole('button', { name: /Need help\?/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    const controls = toggle.getAttribute('aria-controls');
    expect(controls).toBe('mcp-json-helper-panel-row-xyz');
    expect(document.getElementById(controls!)?.textContent).toContain('Example MCP JSON');
  });

  it('mounts the managed OAuth control for a saved public HTTP row', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ connected: false }) })) as unknown as typeof fetch;
    renderRow({ row: row({ id: 'remote', transport: 'http', url: 'https://mcp.example.com', command: undefined }) });
    fireEvent.click(screen.getByRole('button', { name: /Expand this MCP server/i }));
    await waitFor(() => expect(screen.getByText(/Not connected/)).toBeTruthy());
  });

  it('shows the no-managed-OAuth hint for a saved localhost HTTP row', () => {
    renderRow({ row: row({ id: 'local', transport: 'http', url: 'http://localhost:4000/mcp', command: undefined }) });
    fireEvent.click(screen.getByRole('button', { name: /Expand this MCP server/i }));
    expect(screen.getAllByText(/No managed OAuth/i).length).toBeGreaterThan(0);
  });
});
