import type { WorkspaceDirectoryItem } from '@open-design/contracts';

type Identity = { profile: string; apiUrl: string; userId: string };
type Directory = { ok: boolean; items: WorkspaceDirectoryItem[]; reason?: 'unauthorized' | 'upstream' | 'network' };

function activeMember(items: WorkspaceDirectoryItem[], workspaceId: string): boolean {
  return items.some(item => item.workspaceId === workspaceId
    && item.workspaceType === 'team' && item.memberStatus === 'active'
    && item.lifecycleState !== 'deleted');
}

/** Membership verified online or, during an outage, saved for this exact account. */
export async function authorizeHeaderlessTeamRead(input: {
  workspaceId: string;
  currentIdentity: () => string;
  account: Identity | null;
  fetchDirectory: () => Promise<Directory>;
  hasSnapshot: (account: Identity, workspaceId: string) => boolean;
  snapshotMember?: (account: Identity, workspaceId: string) => string | null;
  expectedMemberId?: string;
  onUnauthorized?: (account: Identity) => void;
  onMembershipLost?: (account: Identity, workspaceId: string) => void;
}): Promise<'allowed' | 'forbidden' | 'unavailable'> {
  const identity = input.currentIdentity();
  let directory: Directory;
  try { directory = await input.fetchDirectory(); }
  catch { directory = { ok: false, items: [], reason: 'network' }; }
  if (identity !== input.currentIdentity()) return 'unavailable';
  if (!directory.ok && directory.reason === 'unauthorized') {
    if (input.account) input.onUnauthorized?.(input.account);
    return 'forbidden';
  }
  if (directory.ok) {
    const allowed = activeMember(directory.items, input.workspaceId);
    if (!allowed && input.account) input.onMembershipLost?.(input.account, input.workspaceId);
    if (!allowed) return 'forbidden';
    return !input.expectedMemberId || directory.items.some(item => item.workspaceId === input.workspaceId
      && item.workspaceType === 'team' && item.memberStatus === 'active'
      && item.lifecycleState !== 'deleted' && item.workspaceMemberId === input.expectedMemberId)
      ? 'allowed' : 'forbidden';
  }
  if (!input.account || !input.hasSnapshot(input.account, input.workspaceId)) return 'unavailable';
  return !input.expectedMemberId || input.snapshotMember?.(input.account, input.workspaceId) === input.expectedMemberId
    ? 'allowed' : 'forbidden';
}
