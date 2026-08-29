export interface WorkspaceDesignSystemBindingWitness {
  workspaceId: string;
  visibility: string;
  resourceState: string | null;
  createdByWorkspaceMemberId: string | null;
}

export function ownedDesignSystemSourceIsReady(input: {
  ownerMemberId: string | null | undefined;
  currentMemberId: string;
  workspaceId: string;
  localSourceExists: boolean;
  binding: WorkspaceDesignSystemBindingWitness | null | undefined;
}): boolean {
  if (input.ownerMemberId !== input.currentMemberId) return false;
  const { binding } = input;
  return input.localSourceExists
    && binding?.workspaceId === input.workspaceId
    && binding.visibility === 'personal'
    && binding.resourceState !== 'deleted'
    && binding.createdByWorkspaceMemberId === input.currentMemberId;
}
