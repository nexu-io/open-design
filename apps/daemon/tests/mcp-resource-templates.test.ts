import { describe, expect, it } from 'vitest';

import {
  _listMcpResourceTemplates,
  createMcpDaemonTarget,
} from '../src/mcp.js';

const BASE = 'http://127.0.0.1:19001';

function target() {
  return createMcpDaemonTarget({ daemonUrl: BASE });
}

describe('MCP `resources/templates/list` handler (#7014)', () => {
  it('returns an empty resourceTemplates array', async () => {
    const result = await _listMcpResourceTemplates(target());
    expect(result).toEqual({ resourceTemplates: [] });
  });

  it('does not require a running daemon', async () => {
    // The handler returns an empty list without any daemon I/O,
    // so no fetch mock is needed.
    const result = await _listMcpResourceTemplates(target());
    expect(Array.isArray(result.resourceTemplates)).toBe(true);
    expect(result.resourceTemplates).toHaveLength(0);
  });
});
