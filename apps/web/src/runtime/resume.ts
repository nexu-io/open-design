// Canonical prompt sent by the "Continue the run" affordance on a resumable
// failed run. The daemon resumes the persisted CLI session for this
// (conversation, agent) and seeds only this turn (skipTranscript), so the agent
// continues from its committed work. Worded to be correct whether or not a
// committed boundary exists, and deliberately NOT a re-send of the original
// user turn — a resume must not duplicate the original request the way the
// from-scratch Retry path (retryOfAssistantId) does.
export const RESUME_CONTINUE_PROMPT =
  'The previous turn was interrupted by a transient failure. ' +
  'If your last response was cut off, continue it from where you left off ' +
  'and keep any work already completed; otherwise complete the original ' +
  'request. Inspect the current project files as needed before making ' +
  'further changes.';
