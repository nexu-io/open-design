import type { SharedProjectPredicate } from '../../collab/all-projects-list';

/**
 * Whether the signed-in member may mutate (rename / duplicate / move / delete)
 * a project: the daemon's `canMutate` is privileged-or-self-created, and it
 * 403s everything else. A project the team hub does not attribute to anyone
 * is the member's own local one — unless it is shared, in which case the
 * missing attribution means "someone else's" (the hub row simply has not
 * arrived yet).
 */
export function projectOwnedBySelf(input: {
  projectId: string;
  ownerMemberIds: ReadonlyMap<string, string> | undefined;
  selfMemberId: string | null | undefined;
  isShared: SharedProjectPredicate;
}): boolean {
  const ownerMemberId = input.ownerMemberIds?.get(input.projectId) ?? null;
  return (
    ownerMemberId === (input.selfMemberId ?? null)
    || (!ownerMemberId && !input.isShared(input.projectId))
  );
}
