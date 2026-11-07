import { describe, expect, it } from 'vitest';
import { opencodeAgentDef } from '../../src/runtimes/defs/opencode.js';
import { byokOpenCodeAgentDef } from '../../src/runtimes/defs/byok-opencode.js';
import { toOpenCodeSdkModel } from '../../src/runtimes/opencode-sdk-host.js';

// SDK-only transport: `opencode run --format json` spawning was removed, so
// there is no `-s <id>` argv anymore. Resume replays the same SDK
// `sessionID` through `sessions.prompt`. These specs lock in that contract:
// the defs advertise the SDK transport, `buildArgs` (a required-but-unused
// `RuntimeAgentDef` slot) refuses CLI construction, and daemon model ids map
// onto the `{ id, providerID, variant? }` the SDK requires.
describe('opencode SDK session resume', () => {
  const SESSION = 'ses_4af9c2e1b0';

  it('advertises the native SDK transport for the opencode family', () => {
    expect((opencodeAgentDef as { transport?: string }).transport).toBe('sdk');
    expect((byokOpenCodeAgentDef as { transport?: string }).transport).toBe('sdk');
  });

  it('refuses CLI argv construction (no `run --format json`, no `-s`)', () => {
    expect(() =>
      opencodeAgentDef.buildArgs('prompt', [], [], {}, { resumeSessionId: SESSION }),
    ).toThrow(/CLI removed/);
    expect(() =>
      byokOpenCodeAgentDef.buildArgs('prompt', [], [], {}, { resumeSessionId: SESSION }),
    ).toThrow(/CLI removed/);
  });

  it('maps provider/model ids onto SDK model references', () => {
    expect(toOpenCodeSdkModel('anthropic/claude-sonnet-4-5')).toEqual({
      id: 'claude-sonnet-4-5',
      providerID: 'anthropic',
    });
    expect(toOpenCodeSdkModel('openai/gpt-5#high')).toEqual({
      id: 'gpt-5',
      providerID: 'openai',
      variant: 'high',
    });
    expect(toOpenCodeSdkModel('openai/gpt-5', 'high')).toEqual({
      id: 'gpt-5',
      providerID: 'openai',
      variant: 'high',
    });
  });

  it('routes BYOK models through the run-scoped provider', () => {
    expect(toOpenCodeSdkModel('open-design-byok/gpt-4o-mini')).toEqual({
      id: 'gpt-4o-mini',
      providerID: 'open-design-byok',
    });
    // A raw model id without a provider prefix addresses the BYOK provider.
    expect(toOpenCodeSdkModel('gpt-4o-mini')).toEqual({
      id: 'gpt-4o-mini',
      providerID: 'open-design-byok',
    });
  });

  it('returns null for default/empty models (session keeps its default)', () => {
    expect(toOpenCodeSdkModel(null)).toBeNull();
    expect(toOpenCodeSdkModel('')).toBeNull();
    expect(toOpenCodeSdkModel('default')).toBeNull();
    expect(toOpenCodeSdkModel(' anthropic/claude-sonnet-4-5 ', 'default')).toEqual({
      id: 'claude-sonnet-4-5',
      providerID: 'anthropic',
    });
  });
});
