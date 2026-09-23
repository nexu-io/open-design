// One place decides what the memory settings screen is allowed to claim.
//
// The feature has one visible master switch and four flags underneath it
// (`chatExtractionEnabled`, `profileEnabled`, `rewriteEnabled`,
// `verifyEnabled`). They drifted apart twice, in both directions:
//
//   - The daemon defaults `chatExtractionEnabled` to OFF while `enabled`
//     defaults ON (deliberate; see apps/daemon/src/memory.ts and PR #5708),
//     but the screen rendered only the green master switch, so a user whose
//     conversations were never mined read it as "memory is fully on"
//     (OPEND-2606).
//   - When `GET /api/memory` failed, the client invented a config in which
//     every flag was `true` and painted every switch green — a claim about the
//     daemon's state made without having read the daemon's state.
//
// The invariant both bugs violated is the same one: **the screen must never be
// more optimistic than the daemon.** So the two helpers below are the only
// place that turns a config (or the absence of one) into switch positions and
// into the set of capabilities the screen still owes the user. A flag added to
// `MemoryHookKey` is picked up by both without another edit.

import type { MemoryHookKey } from './MemoryHooksPanel';

export interface MemoryFlags {
  enabled: boolean;
  chatExtractionEnabled: boolean;
  profileEnabled: boolean;
  rewriteEnabled: boolean;
  verifyEnabled: boolean;
}

/** Every hook the master switch sits above, in the order the panel lists them. */
export const MEMORY_HOOK_KEYS: readonly MemoryHookKey[] = [
  'profileEnabled',
  'rewriteEnabled',
  'verifyEnabled',
  'chatExtractionEnabled',
] as const;

const NOTHING_KNOWN: MemoryFlags = {
  enabled: false,
  chatExtractionEnabled: false,
  profileEnabled: false,
  rewriteEnabled: false,
  verifyEnabled: false,
};

/**
 * The flag values the screen may render. `null` means the config has not been
 * read yet (first paint) or could not be read (the request failed) — and a
 * config we have not read is not a config that says "on".
 */
export function paintedMemoryFlags(config: MemoryFlags | null): MemoryFlags {
  return config ?? NOTHING_KNOWN;
}

/**
 * Hooks that are off while the master switch reads on — i.e. the capabilities a
 * lone green toggle would otherwise claim the user has. The settings view has
 * to show each of these with its own switch and state; that is the whole
 * difference between "memory is on" and "reading is on, writing is not".
 *
 * Empty while memory is off (the OFF banner already says nothing runs) and
 * while the config is unknown (we have nothing truthful to disclose yet).
 */
export function hooksOffWhileEnabled(
  config: MemoryFlags | null,
): MemoryHookKey[] {
  if (!config || !config.enabled) return [];
  return MEMORY_HOOK_KEYS.filter((key) => !config[key]);
}
