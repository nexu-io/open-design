// Smoke tests for the identity-rotation contract that lets PostHog stay
// in lockstep with the existing Langfuse installationId. The full
// rotation flow (Delete-my-data → daemon rotates id → app-config updates
// → posthog.reset() + identify(newId)) is verified end-to-end against
// a live PostHog project; these unit tests pin only the safety guards
// (no-client paths, null inputs) so future refactors can't regress the
// "never throw out of an analytics path" invariant.

import { describe, expect, it } from 'vitest';
import { applyConsent, applyIdentity } from '../src/analytics/client';

describe('analytics identity safety', () => {
  it('applyConsent never throws when no PostHog client is initialized', () => {
    expect(() => applyConsent(true)).not.toThrow();
    expect(() => applyConsent(false)).not.toThrow();
  });

  it('applyIdentity is a no-op for null installationId', () => {
    expect(() => applyIdentity(null)).not.toThrow();
  });

  it('applyIdentity never throws when no PostHog client is initialized', () => {
    expect(() => applyIdentity('install-X')).not.toThrow();
  });
});
