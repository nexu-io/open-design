import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { agentIdToTracking } from '@open-design/contracts/analytics';
import { SHIPPED_AGENT_DEFS } from '../../src/runtimes/registry.js';

// `other` is the honest answer for an agent id analytics has never heard of.
// It is the wrong answer for one we ship: an agent that lands there is invisible
// to any breakdown or alert asking *which* CLI failed, which is the only
// question worth asking when a CLI someone installed cannot be used. Adding a
// runtime def without teaching the tracking enum about it fails here.
//
// This asserts against SHIPPED_AGENT_DEFS rather than AGENT_DEFS on purpose.
// AGENT_DEFS also carries the local profiles declared in the developer's own
// `agents.local.json`, whose ids are required not to collide with a shipped one
// and so correctly collapse to `other`. Walking that list would turn anyone's
// personal config into a failure that reads exactly like a missing mapper case,
// and the next person to hit it could not tell the two apart.
describe('every shipped agent has its own analytics id', () => {
  it('maps no shipped agent to the catch-all bucket', () => {
    const collapsed = SHIPPED_AGENT_DEFS.map((def) => def.id)
      .filter((id) => agentIdToTracking(id) === 'other')
      .sort();

    expect(collapsed).toEqual([]);
  });

  // A locally declared agent is not ours to name. PostHog should never learn an
  // id out of someone's `agents.local.json`, so collapsing it is the intent.
  it('still buckets an unknown id as other', () => {
    expect(agentIdToTracking('my-custom-agent')).toBe('other');
    expect(agentIdToTracking('not-a-shipped-agent')).toBe('other');
    expect(agentIdToTracking(null)).toBe('other');
  });

  // The regression that made this guard worth rewriting: whose machine it runs
  // on must not change the answer. Walking AGENT_DEFS instead of
  // SHIPPED_AGENT_DEFS fails here with `expected [ 'my-custom-agent' ] to
  // deeply equal []` — a developer's personal config wearing the costume of a
  // missing mapper case. Registry lists are built once at module load, so the
  // profile has to exist before the import to be part of it.
  it('stays green on a machine that declares a local agent profile', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-local-agent-profile-'));
    const profilesFile = path.join(dir, 'agents.local.json');
    writeFileSync(
      profilesFile,
      JSON.stringify({ agents: [{ id: 'my-custom-agent', baseAgent: 'claude' }] }),
    );
    vi.stubEnv('OD_AGENT_PROFILES_CONFIG', profilesFile);
    vi.resetModules();

    try {
      const registry = await import('../../src/runtimes/registry.js');

      // Guards the assertions below against passing for the boring reason that
      // the profile never loaded at all.
      expect(registry.AGENT_DEFS.map((def) => def.id)).toContain('my-custom-agent');
      expect(registry.SHIPPED_AGENT_DEFS.map((def) => def.id)).not.toContain(
        'my-custom-agent',
      );

      const collapsed = registry.SHIPPED_AGENT_DEFS.map((def) => def.id)
        .filter((id) => agentIdToTracking(id) === 'other')
        .sort();

      expect(collapsed).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
