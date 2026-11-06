import {
  assertTeamResourceCopyAllowed,
  type TeamResourceCopyTarget,
  type TeamResourceState,
} from '@open-design/contracts';

// Team-resource state seam (D1 state model). Reports whether a design system /
// plugin / skill is a team resource and its lifecycle state, so the copy
// red-line guard (D3, assertTeamResourceCopyAllowed) can be enforced at the
// copy-out routes. In production this resolves against E's resource-hub (the resource-hub owner,
// which owns whether a resource is team-shared + frozen); until it is reachable,
// the dev provider holds an in-memory map a demo/test can seed. Swapping the
// provider is the only change when the hub ships.

export type TeamResourceKind = 'design-system' | 'plugin' | 'skill';

export interface TeamResourceKey {
  kind: TeamResourceKind;
  resourceId: string;
}

export interface TeamResourceStateProvider {
  /** The copy-guard view of a resource. Unknown resources default to personal. */
  resolve(key: TeamResourceKey): Promise<TeamResourceCopyTarget>;
  /** Dev/demo seam: mark a resource team-shared with a state (absent on the real hub-backed provider). */
  set?(key: TeamResourceKey, target: TeamResourceCopyTarget): void;
}

function mapKey(key: TeamResourceKey): string {
  return `${key.kind}:${key.resourceId}`;
}

/**
 * Dev/demo provider: an in-memory registry of team-shared resources. A resource
 * not in the registry is treated as `personal` (copies freely) — so with no team
 * resources registered the guard is a no-op, exactly as production is until E's
 * hub reports real team resources. A test seeds a `frozen` resource to prove the
 * guard actually rejects.
 */
export function createDevTeamResourceStateProvider(): TeamResourceStateProvider {
  const registry = new Map<string, TeamResourceState>();
  return {
    async resolve(key) {
      const state = registry.get(mapKey(key));
      return state === undefined ? { scope: 'personal' } : { scope: 'team', state };
    },
    set(key, target) {
      if (target.scope === 'team' && target.state) registry.set(mapKey(key), target.state);
      else registry.delete(mapKey(key));
    },
  };
}

/**
 * Resolve a resource's state and enforce the copy red-line (D3) at a copy-out
 * route. Throws {@link TeamResourceCopyForbiddenError} (which routes map to 403)
 * when the resource is a frozen/deleted team resource. A one-liner the escape
 * routes (plugin duplicate, DS copy, skill edit-shadow) call before copying.
 */
export async function enforceTeamResourceCopyAllowed(
  provider: TeamResourceStateProvider,
  key: TeamResourceKey,
): Promise<void> {
  const target = await provider.resolve(key);
  assertTeamResourceCopyAllowed(target);
}
