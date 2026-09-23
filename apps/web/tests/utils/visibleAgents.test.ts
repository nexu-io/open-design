import { describe, expect, it } from 'vitest';
import type { AgentInfo } from '../../src/types';
import {
  availableVisibleAgentCount,
  deepSeekHarnessNeedsSetup,
  isVisibleLocalCliAgent,
} from '../../src/utils/visibleAgents';

function agent(partial: Partial<AgentInfo> & { id: string }): AgentInfo {
  return {
    name: partial.id,
    bin: partial.id,
    models: [],
    modelsSource: 'fallback',
    available: false,
    ...partial,
  } as AgentInfo;
}

describe('availableVisibleAgentCount', () => {
  // The rescan notice and the list underneath it must agree. `byok-opencode`
  // is available whenever OpenCode is installed but is never rendered, so
  // counting the raw detection list announced one more CLI than the user
  // could see — "3 available" sitting above a two-row list.
  it('excludes agents that are hidden from the picker', () => {
    const agents = [
      agent({ id: 'amr', available: true }),
      agent({ id: 'deepseek', available: true }),
      agent({ id: 'byok-opencode', available: true }),
    ];

    expect(agents.filter((a) => a.available).length).toBe(3);
    expect(availableVisibleAgentCount(agents)).toBe(2);
  });

  it('ignores unavailable agents', () => {
    const agents = [
      agent({ id: 'amr', available: true }),
      agent({ id: 'codex', available: false }),
    ];

    expect(availableVisibleAgentCount(agents)).toBe(1);
  });

  it('counts nothing when every agent is hidden or unavailable', () => {
    expect(
      availableVisibleAgentCount([
        agent({ id: 'byok-opencode', available: true }),
        agent({ id: 'codex', available: false }),
      ]),
    ).toBe(0);
  });
});

describe('isVisibleLocalCliAgent', () => {
  it('hides only the internal BYOK OpenCode runtime', () => {
    expect(isVisibleLocalCliAgent({ id: 'byok-opencode' })).toBe(false);
    expect(isVisibleLocalCliAgent({ id: 'opencode' })).toBe(true);
  });
});

describe('deepSeekHarnessNeedsSetup', () => {
  // The picker renders an unavailable DSH only when detection reported the
  // path it found. Detection that drops the path leaves the row invisible,
  // which is exactly how a broken CLI disappears instead of offering a fix.
  it('requires a resolved path alongside the profile diagnostic', () => {
    const withPath = agent({
      id: 'deepseek-harness',
      available: false,
      path: '/usr/local/bin/dsh',
      diagnostics: [{ reason: 'runtime-profile-incompatible', severity: 'error', message: '' }],
    });
    const withoutPath = agent({
      id: 'deepseek-harness',
      available: false,
      diagnostics: [{ reason: 'runtime-profile-incompatible', severity: 'error', message: '' }],
    });

    expect(deepSeekHarnessNeedsSetup(withPath)).toBe(true);
    expect(deepSeekHarnessNeedsSetup(withoutPath)).toBe(false);
  });
});
