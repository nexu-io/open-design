// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentInfo } from '../../../src/types';
import { McpAgentSupportBanner } from '../../../src/features/mcp-client/components/McpAgentSupportBanner';
import { I18nProvider } from '../../../src/i18n';

afterEach(cleanup);

function agent(over: Partial<AgentInfo> = {}): AgentInfo {
  return { id: 'claude', name: 'Claude', bin: 'claude', available: true, ...over };
}

function renderBanner(agents: AgentInfo[]) {
  render(
    <I18nProvider initial="en">
      <McpAgentSupportBanner agents={agents} />
    </I18nProvider>,
  );
}

describe('McpAgentSupportBanner', () => {
  it('renders nothing for an empty agent list', () => {
    const { container } = render(
      <I18nProvider initial="en">
        <McpAgentSupportBanner agents={[]} />
      </I18nProvider>,
    );
    expect(container.querySelector('.mcp-agent-support')).toBeNull();
  });

  it('lists forwarded and not-forwarded agents, tagging ACP as stdio-only', () => {
    renderBanner([
      agent({ id: 'claude', name: 'Claude', externalMcpInjection: 'claude-mcp-json' }),
      agent({ id: 'hermes', name: 'Hermes', externalMcpInjection: 'acp-merge' }),
      agent({ id: 'codex', name: 'Codex', externalMcpInjection: undefined }),
    ]);
    expect(screen.getByText(/Claude · Hermes \(stdio only\)/)).toBeTruthy();
    expect(screen.getByText(/Codex/)).toBeTruthy();
  });
});
