import { expect, it } from 'vitest';
import { amrAgentDef } from '../../src/runtimes/defs/amr.js';
import { agentSessionStorageKey } from '../../src/runtimes/amr-session-key.js';

it('selects the AMR harness per invocation without changing the default', () => {
  expect(amrAgentDef.buildArgs('', [])).toEqual(['agent', 'run', '--runtime', 'opencode']);
  expect(amrAgentDef.buildArgs('', [], [], { amrRuntime: 'pi' }))
    .toEqual(['agent', 'run', '--runtime', 'pi']);
  expect(amrAgentDef.buildArgs('', [], [], { amrRuntime: 'opencode' }))
    .toEqual(['agent', 'run', '--runtime', 'opencode']);
  expect(amrAgentDef.buildArgs('', [])).toEqual(['agent', 'run', '--runtime', 'opencode']);
});

it('keeps legacy OpenCode handles separate from Pi and other agents', () => {
  expect(agentSessionStorageKey('amr')).toBe('amr');
  expect(agentSessionStorageKey('amr', 'opencode')).toBe('amr');
  expect(agentSessionStorageKey('amr', 'pi')).toBe('amr:pi');
  expect(agentSessionStorageKey('pi')).toBe('pi');
});

it.each(['codex', 'claude', 'dsh', 'none'] as const)('passes %s through and keeps its own session namespace', (runtime) => {
  expect(amrAgentDef.buildArgs('', [], [], { amrRuntime: runtime }))
    .toEqual(['agent', 'run', '--runtime', runtime]);
  expect(agentSessionStorageKey('amr', runtime)).toBe(`amr:${runtime}`);
});

// Every AMR runtime shares the production 2-minute first-output window carried
// on the shared AMR def, so the evaluation matches what online users get. Other
// agents keep their own def value (no watchdog when it is unset).
it('keeps the production first-output window on the shared AMR def', () => {
  expect(amrAgentDef.firstOutputTimeoutMs).toBe(2 * 60 * 1000);
});
