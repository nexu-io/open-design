export const STANDALONE_FEEDBACK_SCHEMA = 1 as const;

export type StandaloneFeedbackPhase =
  | "channel-discovery"
  | "metadata-verification"
  | "sync-planning"
  | "blob-resolution"
  | "blob-download"
  | "blob-verification"
  | "blob-materialization"
  | "sync-ready"
  | "generation-prepared"
  | "closure-starting"
  | "closure-ready"
  | "rollback"
  | "failure";

export type StandaloneFeedbackEvent = Readonly<{
  schemaVersion: typeof STANDALONE_FEEDBACK_SCHEMA;
  operationId: string;
  sequence: number;
  phase: StandaloneFeedbackPhase;
  state: "begin" | "progress" | "reused" | "complete" | "failed";
  channel: string;
  namespace: string;
  generationId?: string;
  resourceId?: string;
  blobSha256?: string;
  source?: "cas" | "shell" | "seed" | "remote";
  receivedBytes?: number;
  totalBytes?: number;
  error?: Readonly<{ code: string; message: string }>;
}>;

export type StandaloneFeedbackHandler = (event: StandaloneFeedbackEvent) => void | Promise<void>;

/**
 * Feedback is an observation surface, never lifecycle authority. A failed UI,
 * renderer, or terminal sink must not corrupt preparation or activation.
 */
export class StandaloneFeedbackEmitter {
  private sequence = 0;

  constructor(
    private readonly operationId: string,
    private readonly scope: Readonly<{ channel: string; namespace: string }>,
    private readonly handler?: StandaloneFeedbackHandler,
  ) {}

  emit(event: Omit<StandaloneFeedbackEvent, "schemaVersion" | "operationId" | "sequence" | "channel" | "namespace">): void {
    const value: StandaloneFeedbackEvent = Object.freeze({
      schemaVersion: STANDALONE_FEEDBACK_SCHEMA,
      operationId: this.operationId,
      sequence: this.sequence++,
      channel: this.scope.channel,
      namespace: this.scope.namespace,
      ...event,
    });
    try {
      void Promise.resolve(this.handler?.(value)).catch(() => undefined);
    } catch {
      // Observers are deliberately non-authoritative.
    }
  }
}
