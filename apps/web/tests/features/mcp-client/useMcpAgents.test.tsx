// @vitest-environment jsdom
//
// The agent-support hook against a fake `McpAgentsPort`: it fetches once on
// mount and exposes the list.
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentInfo } from '../../../src/types';

import { useMcpAgents } from '../../../src/features/mcp-client/hooks/useMcpAgents.hooks';
import type { McpAgentsPort } from '../../../src/features/mcp-client/ports';

function agent(over: Partial<AgentInfo> = {}): AgentInfo {
  return { id: 'claude', name: 'Claude', bin: 'claude', available: true, ...over };
}

describe('useMcpAgents', () => {
  it('starts empty and fills from the port', async () => {
    const port: McpAgentsPort = { fetchAgents: vi.fn(async () => [agent()]) };
    const { result } = renderHook(() => useMcpAgents(port));
    expect(result.current).toEqual([]);
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(port.fetchAgents).toHaveBeenCalledTimes(1);
  });
});
