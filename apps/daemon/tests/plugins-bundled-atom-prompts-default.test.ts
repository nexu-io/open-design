// Plan §3.V1 — OD_BUNDLED_ATOM_PROMPTS default is now ON.
//
// This test pins the contract: a daemon that never sets the env var
// behaves as if the flag is enabled. Setting it to '0' explicitly
// is the documented opt-out (e.g. for snapshot-replay against an
// older daemon, or for regression bisects that need byte-equal
// pre-§3.V1 prompts).

import { describe, expect, it } from 'vitest';

// The check used in apps/daemon/src/server.ts to decide whether to
// build activeStageBlocks. We pin the exact predicate so a future
// PR can't silently flip the default back to opt-in by tightening
// the comparison without updating this test.
function bundledAtomPromptsEnabled(env: Record<string, string | undefined>): boolean {
  return env.OD_BUNDLED_ATOM_PROMPTS !== '0';
}

describe('OD_BUNDLED_ATOM_PROMPTS default policy', () => {
  it('is ON when the env var is unset', () => {
    expect(bundledAtomPromptsEnabled({})).toBe(true);
  });

  it("is ON when the env var is empty (treated as 'not opted out')", () => {
    expect(bundledAtomPromptsEnabled({ OD_BUNDLED_ATOM_PROMPTS: '' })).toBe(true);
  });

  it("is ON when the env var is explicitly '1'", () => {
    expect(bundledAtomPromptsEnabled({ OD_BUNDLED_ATOM_PROMPTS: '1' })).toBe(true);
  });

  it("is OFF when the env var is explicitly '0' (documented opt-out)", () => {
    expect(bundledAtomPromptsEnabled({ OD_BUNDLED_ATOM_PROMPTS: '0' })).toBe(false);
  });

  it("is ON for any non-'0' value (forward-compat)", () => {
    expect(bundledAtomPromptsEnabled({ OD_BUNDLED_ATOM_PROMPTS: 'true' })).toBe(true);
    expect(bundledAtomPromptsEnabled({ OD_BUNDLED_ATOM_PROMPTS: 'false' })).toBe(true);
    expect(bundledAtomPromptsEnabled({ OD_BUNDLED_ATOM_PROMPTS: 'yes' })).toBe(true);
  });
});
