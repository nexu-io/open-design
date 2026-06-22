// Project isolation guard (#4594).
//
// A chat run carries a `projectId` and may carry a `conversationId`.
// Conversations are project-scoped: a conversation row has a fixed
// `project_id`, and the resumable CLI agent session is keyed off the
// conversation (`agent_sessions(conversation_id, agent_id) -> session_id`, see
// agent-session-resume.ts). The run's working directory, by contrast, is
// derived from the run's `projectId`.
//
// If a run's `projectId` does not match its conversation's project, proceeding
// would resume another project's agent session (and its working memory) into a
// run rooted in a different project — exactly the cross-project context bleed
// reported in #4594. Conversations never legitimately move between projects, so
// a mismatch is always a client/state bug that should be refused rather than
// silently crossed.

/**
 * True only for a definite cross-project mismatch: both the conversation's
 * project id and the run's project id are present and differ. A missing
 * project id or conversation is left to existing handling (e.g. the
 * project-less `PROJECT_ROOT` fallback), so this never rejects a run that
 * simply omits one of them.
 */
export function isCrossProjectConversation(
  conversationProjectId: string | null | undefined,
  runProjectId: string | null | undefined,
): boolean {
  return (
    typeof conversationProjectId === 'string' &&
    conversationProjectId.length > 0 &&
    typeof runProjectId === 'string' &&
    runProjectId.length > 0 &&
    conversationProjectId !== runProjectId
  );
}
