import { describe, expect, it } from 'vitest';
import { minimaxAgentDef } from '../../src/runtimes/defs/minimax.js';
import { AGENT_DEFS } from '../../src/runtimes/registry.js';

const minimax = AGENT_DEFS.find((agent) => agent.id === 'minimax')!;

describe('minimax runtime', () => {
  it('is registered under the mcode binary', () => {
    expect(minimax).toBe(minimaxAgentDef);
    expect(minimax.bin).toBe('mcode');
    expect(minimax.name).toBe('MiniMax Code');
  });

  it('speaks ACP over stdio so the prompt never travels through argv', () => {
    const args = minimax.buildArgs('design a page', [], [], {});
    expect(args).toEqual(['acp']);
    expect(minimax.streamFormat).toBe('acp-json-rpc');
    expect(minimax.mcpDiscovery).toBe('mature-acp');
    expect(minimax.externalMcpInjection).toBe('acp-merge');
  });

  it('leaves model selection to the ACP session', () => {
    const args = minimax.buildArgs('hello', [], [], {
      model: 'm:minimax:MiniMax-M3:v:thinking',
    });
    expect(args).toEqual(['acp']);
  });

  it('rejects live detection for a missing binary so the picker uses the fallback list', async () => {
    await expect(minimax.fetchModels!('/nonexistent/mcode', {})).rejects.toThrow(/spawn failed/);
    expect(minimax.fallbackModels).toEqual([{ id: 'default', label: 'Default (CLI config)' }]);
  });
});
