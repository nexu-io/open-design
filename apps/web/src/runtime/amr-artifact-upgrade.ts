export const AMR_ARTIFACT_UPGRADE_REQUEST_EVENT =
  'open-design:amr-artifact-upgrade-request';

export type AmrArtifactUpgradeDecision = 'proceed' | 'cancel';

export interface AmrArtifactUpgradeRequest {
  projectId: string;
  conversationId: string;
  source: 'chat_send';
}

export interface AmrArtifactUpgradeRequestDetail {
  projectId: string;
  conversationId: string;
  source: 'chat_send';
  settle: (decision: AmrArtifactUpgradeDecision) => void;
}

export function amrArtifactUpgradeSessionKey(
  projectId: string | null | undefined,
  conversationId: string | null | undefined,
): string | null {
  const normalizedProjectId = projectId?.trim();
  const normalizedConversationId = conversationId?.trim();
  if (!normalizedProjectId || !normalizedConversationId) return null;
  return JSON.stringify([normalizedProjectId, normalizedConversationId]);
}

export function requestAmrArtifactUpgrade(
  request: AmrArtifactUpgradeRequest,
): Promise<AmrArtifactUpgradeDecision> {
  if (
    typeof window === 'undefined'
    || !amrArtifactUpgradeSessionKey(request.projectId, request.conversationId)
    || request.source !== 'chat_send'
  ) {
    return Promise.resolve('proceed');
  }

  return new Promise((resolve) => {
    let settled = false;
    const settle = (decision: AmrArtifactUpgradeDecision) => {
      if (settled) return;
      settled = true;
      resolve(decision);
    };
    const accepted = window.dispatchEvent(new CustomEvent<AmrArtifactUpgradeRequestDetail>(
      AMR_ARTIFACT_UPGRADE_REQUEST_EVENT,
      {
        cancelable: true,
        detail: { ...request, settle },
      },
    ));
    if (accepted) settle('proceed');
  });
}
