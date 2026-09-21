import type { ChatRunStatus } from '@open-design/contracts';

/**
 * Whether a Run the daemon reports as `succeeded` keeps that status on the
 * turn although its strategy task ended `blocked`.
 *
 * Since the two-round design a task blocks only when its Run failed, so a
 * succeeded Run never carries a blocked task from the current daemon; the
 * check stays for the artifact-recovery path, which reads persisted rows and
 * must not flip a delivered turn to failed on a stale verdict. Delivery is
 * judged from the daemon's filesystem-backed facts: this Run wrote the entry,
 * or the project holds a valid deliverable and the turn said something. The
 * text argument is the turn's visible reply.
 */
export function canRetainSuccessfulRunForBlockedStrategy(
  status: ChatRunStatus,
  deliverableValid: boolean | undefined,
  projectDeliverableValid: boolean | undefined,
  responseText: string,
): boolean {
  if (status !== 'succeeded') return false;
  if (deliverableValid === true) return true;
  return projectDeliverableValid === true && responseText.trim().length > 0;
}
