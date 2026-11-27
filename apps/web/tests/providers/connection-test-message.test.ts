import { describe, expect, it } from 'vitest';
import { tForLanguageTag } from '../../src/i18n';
import { agentSpawnFailedMessage } from '../../src/providers/connection-test-message';
import type { ConnectionTestResponse } from '../../src/types';

function result(extra: Partial<ConnectionTestResponse> = {}): ConnectionTestResponse {
  return {
    ok: false,
    kind: 'agent_spawn_failed',
    latencyMs: 5,
    detail: 'raw english detail',
    ...extra,
  } as ConnectionTestResponse;
}

function translator(tag: string) {
  const t = tForLanguageTag(tag);
  expect(t).not.toBeNull();
  return t!;
}

describe('agentSpawnFailedMessage', () => {
  const en = translator('en');

  it('renders the byok guidance with the agent name', () => {
    const msg = agentSpawnFailedMessage(en, result({ errorCode: 'opencode_zen_outdated_byok' }), 'OpenCode');
    expect(msg).toContain('Could not start OpenCode:');
    expect(msg).toContain('Set up an API provider with your own API key');
    expect(msg).not.toContain('{');
    expect(msg).not.toContain('raw english detail');
  });

  it('renders the cli guidance with the agent name', () => {
    const msg = agentSpawnFailedMessage(en, result({ errorCode: 'opencode_zen_outdated_cli' }), 'OpenCode');
    expect(msg).toContain('rejected this OpenCode CLI');
    expect(msg).not.toContain('{');
    expect(msg).not.toContain('raw english detail');
  });

  it('falls back to the generic message when errorCode is absent', () => {
    expect(agentSpawnFailedMessage(en, result(), 'OpenCode')).toBe(
      'Could not start OpenCode: raw english detail.',
    );
  });

  it('falls back for an unknown code from a newer daemon', () => {
    const r = result({ errorCode: 'something_new' as unknown as ConnectionTestResponse['errorCode'] });
    expect(agentSpawnFailedMessage(en, r, 'OpenCode')).toBe(
      'Could not start OpenCode: raw english detail.',
    );
  });

  it.each(['de', 'ar'])('localizes the guidance for %s', (tag) => {
    for (const errorCode of ['opencode_zen_outdated_byok', 'opencode_zen_outdated_cli'] as const) {
      const r = result({ errorCode });
      const localized = agentSpawnFailedMessage(translator(tag), r, 'OpenCode');
      expect(localized).not.toBe(agentSpawnFailedMessage(en, r, 'OpenCode'));
      expect(localized).toContain('OpenCode');
    }
  });
});
