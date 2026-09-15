/** Accounting receipts are observed execution data, independent of wallet billing. */
export interface GenerationRequestReceipt {
  /** Stable tuple of gatewayRequestId and attemptId; retries remain separate rows. */
  requestId: string;
  gatewayRequestId: string;
  callerRequestId: string | null;
  attemptId: string | null;
  runAttempt: string | null;
  role: 'generation' | 'repair' | 'retry' | 'auxiliary' | null;
  status: 'succeeded' | 'failed' | 'canceled' | 'rejected' | 'running' | null;
  inputTokens: number | null;
  inputSemantics: 'includes_cache' | 'excludes_cache' | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  outputSemantics: 'includes_reasoning' | 'excludes_reasoning' | null;
  reasoningTokens: number | null;
  requestedModel: string | null;
  actualModel: string | null;
  provider: string | null;
  runtimeVersion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

export interface GenerationRequestLedger {
  schemaVersion: 'generation-request-ledger-v1';
  sourceRunId: string;
  requests: GenerationRequestReceipt[];
  complete: boolean;
  captureComplete: boolean;
  requestInventoryComplete: boolean;
  includesAuxiliary: boolean;
  includesFailures: boolean;
  includesProviderRetries: boolean;
  watermark: string | null;
  identity: {
    sourceSha: string | null;
    promptSha256: string | null;
    /** Hash covers the ordered, actually forwarded request bodies, including tools/messages. */
    promptHashSemantics: 'ordered_forwarded_request_bodies_v1';
    requestedModel: string | null;
    actualModel: string | null;
    runtimeVersion: string | null;
  };
  /** Every observed public/provider model pair, including auxiliary requests. */
  observedModelRoutes: Array<{ requestedModel: string; actualModel: string }>;
  /** External Vela gateway versions, separate from the candidate OD source revision. */
  observedGatewayRuntimeVersions: string[];
  /** Host Run start to terminal, excluding separately measured local queue time. */
  executionDurationMs: number | null;
  queueDurationMs: number | null;
  retryWaitMs: number | null;
  incompleteReasons: string[];
}
