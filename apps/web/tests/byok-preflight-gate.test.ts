// The run-start BYOK gate: when may a browser with no local BYOK config send?
// A host-managed default (OD_BYOK_* on the daemon) covers daemon-driven
// byok-opencode runs only — API mode must keep blocking, because the proxy
// never completes a partial request tuple with the host key (exfiltration
// guard), so a keyless api-mode body would 400 after the fact.

import { describe, expect, it } from 'vitest';

import { shouldBlockByokRunStart } from '../src/components/byok/preflight';

describe('shouldBlockByokRunStart', () => {
  it('lets a byok-opencode run through when the host manages a default provider', () => {
    // Given a fresh browser (no local BYOK provider) pointed at a server
    // deployment whose daemon holds OD_BYOK_*
    const blocked = shouldBlockByokRunStart(
      { mode: 'daemon', apiProtocol: 'anthropic', agentId: 'byok-opencode' },
      false,
      true,
    );

    // When the user hits send, then the daemon fallback gets its chance
    expect(blocked).toBe(false);
  });

  it('still blocks a byok-opencode run when neither browser nor host has a provider', () => {
    const blocked = shouldBlockByokRunStart(
      { mode: 'daemon', apiProtocol: 'anthropic', agentId: 'byok-opencode' },
      false,
      false,
    );
    expect(blocked).toBe(true);
  });

  it('keeps blocking API mode even with a host default — the proxy must not complete a partial tuple with the host key', () => {
    const blocked = shouldBlockByokRunStart(
      { mode: 'api', apiProtocol: 'anthropic', agentId: null },
      false,
      true,
    );
    expect(blocked).toBe(true);
  });

  it('never blocks when the browser carries a complete provider of its own', () => {
    const blocked = shouldBlockByokRunStart(
      { mode: 'daemon', apiProtocol: 'anthropic', agentId: 'byok-opencode' },
      true,
      false,
    );
    expect(blocked).toBe(false);
  });

  it('does not gate ordinary agent runs at all, host default or not', () => {
    expect(
      shouldBlockByokRunStart(
        { mode: 'daemon', apiProtocol: 'anthropic', agentId: 'claude' },
        false,
        false,
      ),
    ).toBe(false);
    expect(
      shouldBlockByokRunStart(
        { mode: 'daemon', apiProtocol: 'anthropic', agentId: 'claude' },
        false,
        true,
      ),
    ).toBe(false);
  });

  it('keeps the bedrock API-mode exemption', () => {
    expect(
      shouldBlockByokRunStart(
        { mode: 'api', apiProtocol: 'bedrock', agentId: null },
        false,
        false,
      ),
    ).toBe(false);
  });
});
