import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { AmrBalanceBranch } from './amr-balance-branch';

/** Stable UI correlation only: never a permission, quota reservation or lease. */
export function stableIdentityDigest(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(36).padStart(13, '0');
}

export function homeAutoSendIdentity(projectId: string) {
  const handoffId = `home-auto-send-${stableIdentityDigest(projectId)}`;
  return { clientRequestId: handoffId, userMessageId: `${handoffId}-user`, assistantMessageId: `${handoffId}-assistant` };
}

/** Internal UI callback after a named initial rejection and an empty-composer
 * witness. The receiver must also verify its original Home handoff and route. */
export interface HomeRequestConcurrencyRejection {
  projectId: string;
  clientRequestId: string;
  accountGeneration: number;
  workspaceContext: WorkspaceCollabContext | null;
  branch: AmrBalanceBranch;
}
