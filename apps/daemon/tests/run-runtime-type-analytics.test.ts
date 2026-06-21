// runtime_type on daemon-emitted run_created / run_finished.
//
// The daemon pins `mode: 'daemon'` when deriving configure globals for run
// events and cannot see a saved BYOK key (BYOK creds live in the web client),
// so its own derivation can only ever report local_cli / amr_cloud / none —
// never byok. The web client knows the true runtime for the run it launched
// and passes it via the run request's analytics hint, which must win so the
// behavioural funnel can split AMR / BYOK / CLI on the server-side events.

import { describe, expect, it } from 'vitest';
import { deriveConfigureGlobals } from '@open-design/contracts/analytics';
import { runtimeTypeForRunAnalytics } from '../src/run-analytics-observability.js';

describe('runtime_type on daemon run analytics', () => {
  it('lets a client byok hint override the daemon BYOK-blind derivation', () => {
    const derived = deriveConfigureGlobals({
      mode: 'daemon',
      agentId: 'claude',
      agents: [{ id: 'claude', available: true }],
    }).runtime_type;
    // Daemon honestly can't tell this was a BYOK run — it sees an installed CLI.
    expect(derived).toBe('local_cli');
    // The client knows better and says byok; the hint wins.
    expect(runtimeTypeForRunAnalytics({ derived, hint: 'byok' })).toBe('byok');
  });

  it('falls back to the derived runtime when the hint is missing or invalid', () => {
    const derived = deriveConfigureGlobals({
      mode: 'daemon',
      agentId: 'amr',
      agents: [{ id: 'amr', available: true }],
      amrAuthorized: true,
    }).runtime_type;
    expect(derived).toBe('amr_cloud');
    expect(runtimeTypeForRunAnalytics({ derived, hint: undefined })).toBe('amr_cloud');
    expect(runtimeTypeForRunAnalytics({ derived, hint: 'bogus' })).toBe('amr_cloud');
    expect(runtimeTypeForRunAnalytics({ derived, hint: 42 })).toBe('amr_cloud');
  });
});
