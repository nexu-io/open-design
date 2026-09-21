import type { ChatRunStatusResponse } from '@open-design/contracts';
import type { RunDeliverableFacts } from '../providers/daemon';

/**
 * The deliverable facts of a round read off its stored run status instead of
 * the live terminal frame: a page that opens the conversation after the round
 * settled reads the daemon's persisted verdict, so the missing-entry notice
 * follows the round, not the page's presence. Null unless the run succeeded
 * and carries a verdict — an in-flight or failed run says nothing about the
 * entry.
 */
export function deliverableFactsFromRunStatus(
  status: ChatRunStatusResponse,
  fallbackProjectId: string | null,
): RunDeliverableFacts | null {
  if (status.status !== 'succeeded') return null;
  if (typeof status.deliverableValid !== 'boolean' && typeof status.deliverableValidation !== 'string') {
    return null;
  }
  const paths = (status.artifactPaths ?? []).filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
  return {
    runId: status.id,
    projectId: status.projectId ?? fallbackProjectId,
    valid: status.deliverableValid,
    validation: status.deliverableValidation,
    entryFile: typeof status.deliverableEntryFile === 'string' ? status.deliverableEntryFile : undefined,
    artifactPaths: [...new Set(paths)],
  };
}
