// Run preflight for a PKCE OrcaRouter account.
//
// A PKCE login never places its key in the browser, so `config.apiKey` is empty
// for that user. Every client-side gate that reads the key would then block a
// send the daemon can actually serve — the exact "the UI blocks what the
// provider supports" failure the review flagged. These tests drive the real
// preflight with the daemon verdict in each state.

import { afterEach, describe, expect, it } from 'vitest';

import { byokPreflightBlockReason } from '../../src/components/byok/preflight';
import {
  resetOrcaRouterAccount,
  setOrcaRouterAccountConnected,
} from '../../src/state/orcarouterAccount';
import type { AppConfig } from '../../src/types';

type PreflightConfig = Pick<
  AppConfig,
  'apiKey' | 'apiProtocol' | 'apiProviderBaseUrl' | 'baseUrl' | 'model'
>;

const ORCAROUTER_CONFIG: PreflightConfig = {
  apiProtocol: 'orcarouter',
  apiKey: '',
  baseUrl: 'https://api.orcarouter.ai/v1',
  apiProviderBaseUrl: null,
  model: 'openai/gpt-5.5',
};

describe('byokPreflightBlockReason with a daemon-held OrcaRouter credential', () => {
  afterEach(() => {
    resetOrcaRouterAccount();
  });

  it('blocks a keyless OrcaRouter send while the answer is unknown', () => {
    // Unknown must not pass optimistically: the run would reach the daemon and
    // fail there with a worse message than the preflight can give.
    expect(byokPreflightBlockReason(ORCAROUTER_CONFIG)).toBe('api_key_required');
  });

  it('allows the send once the daemon reports the account connected', () => {
    setOrcaRouterAccountConnected(true);
    expect(byokPreflightBlockReason(ORCAROUTER_CONFIG)).toBeNull();
  });

  it('blocks again after Disconnect', () => {
    setOrcaRouterAccountConnected(true);
    expect(byokPreflightBlockReason(ORCAROUTER_CONFIG)).toBeNull();
    setOrcaRouterAccountConnected(false);
    expect(byokPreflightBlockReason(ORCAROUTER_CONFIG)).toBe('api_key_required');
  });

  it('still requires a model even when the account is connected', () => {
    setOrcaRouterAccountConnected(true);
    expect(byokPreflightBlockReason({ ...ORCAROUTER_CONFIG, model: '' }))
      .toBe('model_required');
    expect(byokPreflightBlockReason({ ...ORCAROUTER_CONFIG, model: 'default' }))
      .toBe('model_default');
  });

  it('does not let a connected OrcaRouter account excuse another provider', () => {
    // The daemon-held credential is OrcaRouter's only. An OpenAI send with no
    // browser key is still unauthenticated.
    setOrcaRouterAccountConnected(true);
    expect(byokPreflightBlockReason({
      apiProtocol: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      apiProviderBaseUrl: null,
      model: 'gpt-5.5',
    })).toBe('api_key_required');
  });

  it('never blocks a pasted key the user typed into the browser', () => {
    // Both entries coexist; a user with a key is unaffected by the account
    // state, connected or not.
    resetOrcaRouterAccount();
    expect(byokPreflightBlockReason({
      ...ORCAROUTER_CONFIG,
      apiKey: 'sk-orca-a-real-looking-key',
    })).toBeNull();
    setOrcaRouterAccountConnected(false);
    expect(byokPreflightBlockReason({
      ...ORCAROUTER_CONFIG,
      apiKey: 'sk-orca-a-real-looking-key',
    })).toBeNull();
  });
});
