/**
 * Daemon-internal seam for preparing and starting one physical chat Run.
 *
 * HTTP routes remain responsible for parsing, authorization, snapshot
 * resolution, response formatting, and lifecycle observers. Callers hand this
 * service the already-resolved run identity/prompt/session inputs so a future
 * coordinator can reuse the same create -> claim -> start transaction without
 * calling the daemon through HTTP.
 */
export interface InternalRunCreateInput extends Record<string, unknown> {
  projectId?: string;
  conversationId?: string;
  userMessageId?: string;
  assistantMessageId?: string;
  clientRequestId?: string;
  requestFingerprint?: string;
  agentId?: string;
  pluginId?: string;
  appliedPluginSnapshotId?: string;
  message?: string;
  currentPrompt?: string;
  sessionMode?: string;
  analyticsHints?: Record<string, unknown>;
  /** Daemon-owned immutable OD Next task input descriptor; never accepted from callers. */
  odNextTaskInputSnapshot?: {
    taskExecutionId: string;
    snapshotDir: string;
    manifestSha256: string;
  } | null;
}

export interface InternalPhysicalRun {
  id: string;
  status: string;
}

export interface InternalRunRegistry<
  TMeta extends InternalRunCreateInput,
  TRun extends InternalPhysicalRun,
> {
  createOrReuse(meta: TMeta):
    | { kind: 'created'; run: TRun }
    | { kind: 'reused'; run: TRun }
    | { kind: 'conflict'; run: TRun };
  prepareRestart(run: TRun): TRun | null;
  get(id: string): TRun | null;
  drop(run: TRun): void;
  start(run: TRun, starter: () => Promise<unknown>): TRun;
  isTerminal(status: TRun['status']): boolean;
}

export interface AssistantRunClaimOptions {
  status?: string;
  beforeClaimCommit?: () => void;
  isRunActive?: (runId: string) => boolean;
}

export type AssistantRunClaimResult = {
  ok: boolean;
  reason?: 'active' | 'scope';
};

export interface PrepareInternalRunInput<TMeta extends InternalRunCreateInput, TRun> {
  meta: TMeta;
  /**
   * Runs inside the assistant-message claim transaction. The newly allocated
   * physical Run is supplied so a logical coordinator can CAS-claim that exact
   * id before either record becomes visible.
   */
  beforeClaimCommit?: (run: TRun) => void;
  resume?: {
    requested: boolean;
    canResume: (run: TRun) => boolean;
  };
}

export type PreparedInternalRunResult<TRun> =
  | { kind: 'ready'; run: TRun; creationKind: 'created' | 'reused'; resumed: boolean }
  | { kind: 'reused'; run: TRun }
  | { kind: 'idempotency_conflict'; run: TRun }
  | { kind: 'resume_not_allowed'; run: TRun }
  | { kind: 'assistant_claim_conflict'; run: TRun; reason?: 'active' | 'scope' };

export interface InternalRunCreationService<
  TMeta extends InternalRunCreateInput,
  TRun extends InternalPhysicalRun,
> {
  prepare(input: PrepareInternalRunInput<TMeta, TRun>): PreparedInternalRunResult<TRun>;
  start(run: TRun, starter: (run: TRun) => Promise<unknown>): TRun;
}

export function createInternalRunCreationService<
  TMeta extends InternalRunCreateInput,
  TRun extends InternalPhysicalRun,
>(deps: {
  runs: InternalRunRegistry<TMeta, TRun>;
  claimAssistantMessage: (
    run: TRun,
    options?: AssistantRunClaimOptions,
  ) => AssistantRunClaimResult;
}): InternalRunCreationService<TMeta, TRun> {
  const isRunActive = (runId: string): boolean => {
    const existing = deps.runs.get(runId);
    return Boolean(existing && !deps.runs.isTerminal(existing.status));
  };

  const prepare = (
    input: PrepareInternalRunInput<TMeta, TRun>,
  ): PreparedInternalRunResult<TRun> => {
    const creation = deps.runs.createOrReuse(input.meta);
    if (creation.kind === 'conflict') {
      return { kind: 'idempotency_conflict', run: creation.run };
    }

    const run = creation.run;
    if (creation.kind === 'reused') {
      if (!input.resume?.requested) return { kind: 'reused', run };
      if (!input.resume.canResume(run)) return { kind: 'resume_not_allowed', run };

      const claim = deps.claimAssistantMessage(run, {
        status: 'queued',
        isRunActive,
      });
      if (!claim.ok) {
        return {
          kind: 'assistant_claim_conflict',
          run,
          ...(claim.reason ? { reason: claim.reason } : {}),
        };
      }
      if (!deps.runs.prepareRestart(run)) {
        return { kind: 'resume_not_allowed', run };
      }
      return { kind: 'ready', run, creationKind: 'reused', resumed: true };
    }

    let claim: AssistantRunClaimResult;
    try {
      claim = deps.claimAssistantMessage(run, {
        ...(input.beforeClaimCommit
          ? { beforeClaimCommit: () => input.beforeClaimCommit?.(run) }
          : {}),
        isRunActive,
      });
    } catch (error) {
      // The registry create is optimistic. A failed ownership transaction must
      // not leave a physical Run that can be listed, streamed, or reconciled.
      deps.runs.drop(run);
      throw error;
    }
    if (!claim.ok) {
      deps.runs.drop(run);
      return {
        kind: 'assistant_claim_conflict',
        run,
        ...(claim.reason ? { reason: claim.reason } : {}),
      };
    }
    return { kind: 'ready', run, creationKind: 'created', resumed: false };
  };

  return {
    prepare,
    start(run, starter) {
      return deps.runs.start(run, () => starter(run));
    },
  };
}
