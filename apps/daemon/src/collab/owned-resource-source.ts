export interface WorkspaceResourceBindingWitness {
  workspaceId: string;
  visibility: string;
  resourceState: string | null;
  createdByWorkspaceMemberId: string | null;
}

export function ownedWorkspaceResourceSourceIsReady(input: {
  ownerMemberId: string | null | undefined;
  currentMemberId: string;
  workspaceId: string;
  localSourceExists: boolean;
  binding: WorkspaceResourceBindingWitness | null | undefined;
}): boolean {
  if (input.ownerMemberId !== input.currentMemberId) return false;
  const { binding } = input;
  return (
    input.localSourceExists &&
    binding?.workspaceId === input.workspaceId &&
    binding.visibility === 'personal' &&
    binding.resourceState !== 'deleted' &&
    binding.createdByWorkspaceMemberId === input.currentMemberId
  );
}
