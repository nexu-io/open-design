import { describe, expect, it } from 'vitest';
import { parsePrimeAgentModels, primeAgentDef } from '../../src/runtimes/defs/prime-agent.js';

describe('Prime Agent runtime', () => {
  it('selects provider, model, thinking, and cwd through process arguments', () => {
    expect(primeAgentDef.buildArgs('', [], [], {
      model: 'openai/gpt-5',
      reasoning: 'high',
    }, { cwd: '/tmp/design' })).toEqual([
      '--mode', 'rpc', '--cwd', '/tmp/design',
      '--provider', 'openai', '--model', 'gpt-5',
      '--thinking', 'high',
    ]);
  });

  it('reopens the same native session file instead of forking it', () => {
    expect(primeAgentDef.streamFormat).toBe('pi-rpc');
    expect(primeAgentDef.piRpcSessionDir).toMatch(/\.prime\/agent\/sessions$/);
    expect(primeAgentDef.piRpcResumeViaProcessArgs).toBe(true);
    expect(primeAgentDef.buildArgs('', [], [], {}, {
      cwd: '/tmp/design',
      resumeSessionId: '/tmp/prime-session.jsonl',
    })).toEqual([
      '--mode', 'rpc', '--cwd', '/tmp/design',
      '--resume', '/tmp/prime-session.jsonl',
    ]);
  });

  it('parses provider-qualified model ids from the model table', () => {
    const parsed = parsePrimeAgentModels(`Provider  Model  Context\nopenai gpt-5 400k\n`);
    expect(parsed.map((entry) => entry.id)).toEqual(['default', 'openai/gpt-5']);
  });
});
