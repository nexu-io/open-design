import type { SkillPluginCandidate } from '@open-design/contracts';

export interface SkillCandidateRunContext {
  projectId?: string | null;
  conversationId?: string | null;
}

export interface SkillCandidateReader {
  list(projectId: string): SkillPluginCandidate[];
}

export function deferredSkillPluginCandidateForRun(
  candidates: SkillCandidateReader,
  run: SkillCandidateRunContext,
): SkillPluginCandidate | null {
  if (!run.projectId || !run.conversationId) return null;
  return candidates
    .list(run.projectId)
    .find((candidate) =>
      candidate.status !== 'dismissed' &&
      !candidate.assistantMessageId &&
      candidate.conversationId === run.conversationId,
    ) ?? null;
}
