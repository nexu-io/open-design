/**
 * Global run notices (P0-24 N10).
 *
 * The daemon keeps an in-memory log of the turns that ended on this machine
 * and should reach the user wherever they are: a question waiting for their
 * reply, a finished reply, or a failure. The desktop client polls the log and
 * decides per rule ④ whether to show a system notification; `od run notices`
 * reads the same log.
 *
 * A notice never carries reply text — only enough to title the notification
 * and open the conversation.
 */

/** What the user should hear about. Stopped turns and mid-task segments produce none. */
export type RunNoticeKind = 'awaiting_input' | 'new_reply' | 'failed';

export interface RunNotice {
  /** Monotonic within one daemon process (see `RunNoticesResponse.epoch`). */
  seq: number;
  runId: string;
  projectId: string;
  /** Project display name at the time the turn ended; `null` when unknown. */
  projectName: string | null;
  conversationId: string | null;
  kind: RunNoticeKind;
  /** Terminal timestamp of the run, epoch ms. */
  at: number;
}

export interface RunNoticesResponse {
  /**
   * Changes every time the daemon starts. A client that sees a new epoch
   * resumes from `latestSeq` without showing anything, so a restart never
   * replays notices from before it.
   */
  epoch: string;
  /** Highest `seq` recorded so far (0 = none). Visible or not. */
  latestSeq: number;
  /** Notices with `seq` greater than the requested `after`, oldest first. */
  notices: RunNotice[];
}
