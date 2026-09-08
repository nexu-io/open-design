export const STANDALONE_GENERATION_STATE_SCHEMA = 4 as const;

export class StandaloneStateConflictError extends Error {
  constructor(readonly code: "revision-conflict" | "identity-conflict", message: string) {
    super(message);
    this.name = "StandaloneStateConflictError";
  }
}

export type ActivationAuthority = "silent" | "user";
export type ActivationCause = "installed-seed" | "repair" | "update-policy" | "user-interaction";
export type UpdateActivationPolicy = "observe" | "authorize-silent" | "authorize-user" | "revoke-silent";
export type ActivationIntent = Readonly<{
  generationId: string;
  authority: ActivationAuthority;
  cause: ActivationCause;
  authorizedAt: string;
}>;
export type ActivationAttempt = Readonly<{
  attemptId: string;
  generationId: string;
  launchId: string | null;
  launchCount: number;
}>;
export type ActivationLaunchProof = Readonly<{ attemptId: string; generationId: string; launchId: string }>;
export type GenerationState = Readonly<{
  schemaVersion: typeof STANDALONE_GENERATION_STATE_SCHEMA;
  revision: number;
  prepared: string | null;
  activationIntent: ActivationIntent | null;
  activationAttempt: ActivationAttempt | null;
  active: string | null;
  lastHealthy: string | null;
}>;

export type GenerationStateCommand =
  | Readonly<{ type: "prepare"; expectedRevision: number; generationId: string }>
  | Readonly<{
      type: "authorize";
      expectedRevision: number;
      generationId: string;
      authority: ActivationAuthority;
      cause: ActivationCause;
      authorizedAt: string;
    }>
  | Readonly<{ type: "revoke-silent"; expectedRevision: number; generationId: string }>
  | Readonly<{ type: "activate"; expectedRevision: number; generationId: string; attemptId: string }>
  | Readonly<{ type: "begin-launch"; expectedRevision: number; attemptId: string; launchId: string }>
  | Readonly<{ type: "confirm-launch"; expectedRevision: number; proof: ActivationLaunchProof }>
  | Readonly<{ type: "rollback"; expectedRevision: number; attemptId?: string }>;

export const INITIAL_GENERATION_STATE: GenerationState = Object.freeze({
  schemaVersion: STANDALONE_GENERATION_STATE_SCHEMA,
  revision: 0,
  prepared: null,
  activationIntent: null,
  activationAttempt: null,
  active: null,
  lastHealthy: null,
});

const GENERATION_PATTERN = /^[a-f0-9]{64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function assertGenerationId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !GENERATION_PATTERN.test(value)) throw new Error(`invalid ${label}`);
}

function assertToken(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !TOKEN_PATTERN.test(value)) throw new Error(`invalid ${label}`);
}

function intent(value: unknown): ActivationIntent | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("invalid activation intent");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== "authority,authorizedAt,cause,generationId") throw new Error("invalid activation intent");
  assertGenerationId(input.generationId, "activation intent generation");
  if (input.authority !== "silent" && input.authority !== "user") throw new Error("invalid activation authority");
  if (!["installed-seed", "repair", "update-policy", "user-interaction"].includes(String(input.cause))) throw new Error("invalid activation cause");
  if (typeof input.authorizedAt !== "string" || !Number.isFinite(Date.parse(input.authorizedAt))) throw new Error("invalid activation intent time");
  return input as unknown as ActivationIntent;
}

function activationAttempt(value: unknown): ActivationAttempt | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("invalid activation attempt");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== "attemptId,generationId,launchCount,launchId") throw new Error("invalid activation attempt");
  assertToken(input.attemptId, "activation attempt id");
  assertGenerationId(input.generationId, "activation attempt generation");
  if (input.launchId != null) assertToken(input.launchId, "activation launch id");
  if (!Number.isSafeInteger(input.launchCount) || (input.launchCount as number) < 0 || (input.launchCount as number) > 2) throw new Error("invalid activation launch count");
  if (((input.launchCount as number) === 0) !== (input.launchId == null)) throw new Error("activation launch id is not bound to its count");
  return input as unknown as ActivationAttempt;
}

export function validateGenerationState(value: unknown): GenerationState {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid generation state");
  const input = value as Record<string, unknown>;
  const keys = ["activationAttempt", "activationIntent", "active", "lastHealthy", "prepared", "revision", "schemaVersion"];
  if (Object.keys(input).sort().join(",") !== keys.sort().join(",")) throw new Error("invalid generation state fields");
  if (input.schemaVersion !== STANDALONE_GENERATION_STATE_SCHEMA) throw new Error("unsupported generation state schema");
  if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 0) throw new Error("invalid generation state revision");
  if (input.prepared != null) assertGenerationId(input.prepared, "prepared generation");
  if (input.active != null) assertGenerationId(input.active, "active generation");
  if (input.lastHealthy != null) assertGenerationId(input.lastHealthy, "last healthy generation");
  const activationIntent = intent(input.activationIntent);
  const attempt = activationAttempt(input.activationAttempt);
  if (activationIntent != null && activationIntent.generationId !== input.prepared) throw new Error("activation intent is not bound to prepared generation");
  if (attempt != null && attempt.generationId !== input.active) throw new Error("activation attempt is not bound to active generation");
  if (attempt == null && input.active !== input.lastHealthy) throw new Error("settled active generation is not last healthy");
  if (input.active == null && input.lastHealthy != null) throw new Error("last healthy generation is detached from active");
  return {
    schemaVersion: STANDALONE_GENERATION_STATE_SCHEMA,
    revision: input.revision as number,
    prepared: input.prepared as string | null,
    activationIntent,
    activationAttempt: attempt,
    active: input.active as string | null,
    lastHealthy: input.lastHealthy as string | null,
  };
}

function assertExpected(state: GenerationState, expectedRevision: number): void {
  if (state.revision !== expectedRevision) throw new StandaloneStateConflictError("revision-conflict", `stale generation state revision: expected ${expectedRevision}, current ${state.revision}`);
}

function next(state: GenerationState, patch: Partial<GenerationState>): GenerationState {
  return validateGenerationState({ ...state, ...patch, revision: state.revision + 1 });
}

function expectPrepared(state: GenerationState, generationId: string): void {
  assertGenerationId(generationId, "expected generation");
  if (state.prepared !== generationId) throw new StandaloneStateConflictError("identity-conflict", "prepared generation changed concurrently");
}

export function reduceGenerationState(stateInput: GenerationState, command: GenerationStateCommand): GenerationState {
  const state = validateGenerationState(stateInput);
  assertExpected(state, command.expectedRevision);
  if (command.type === "prepare") {
    assertGenerationId(command.generationId, "prepared generation");
    if (state.activationAttempt != null) throw new Error("cannot replace prepared generation during an unfinished activation attempt");
    if (state.prepared === command.generationId) return state;
    return next(state, { prepared: command.generationId, activationIntent: null });
  }
  if (command.type === "authorize") {
    expectPrepared(state, command.generationId);
    const existing = state.activationIntent;
    const authority = existing?.authority === "user" && command.authority === "silent" ? "user" : command.authority;
    const cause = authority === existing?.authority && authority === "user" ? existing.cause : command.cause;
    if (existing?.generationId === command.generationId && existing.authority === authority && existing.cause === cause) return state;
    return next(state, { activationIntent: { generationId: command.generationId, authority, cause, authorizedAt: command.authorizedAt } });
  }
  if (command.type === "revoke-silent") {
    expectPrepared(state, command.generationId);
    if (state.activationIntent?.authority !== "silent") return state;
    return next(state, { activationIntent: null });
  }
  if (command.type === "activate") {
    expectPrepared(state, command.generationId);
    assertToken(command.attemptId, "activation attempt id");
    if (state.activationAttempt != null) throw new Error("cannot activate while another attempt is unfinished");
    if (state.activationIntent?.generationId !== command.generationId) throw new Error("prepared generation is not authorized for activation");
    return next(state, {
      prepared: null,
      activationIntent: null,
      activationAttempt: { attemptId: command.attemptId, generationId: command.generationId, launchId: null, launchCount: 0 },
      active: command.generationId,
    });
  }
  if (command.type === "begin-launch") {
    assertToken(command.attemptId, "activation attempt id");
    assertToken(command.launchId, "activation launch id");
    const attempt = state.activationAttempt;
    if (attempt == null || attempt.attemptId !== command.attemptId || attempt.generationId !== state.active) throw new StandaloneStateConflictError("identity-conflict", "activation attempt changed concurrently");
    if (attempt.launchCount >= 2) throw new Error("activation attempt retry budget is exhausted");
    return next(state, { activationAttempt: { ...attempt, launchId: command.launchId, launchCount: attempt.launchCount + 1 } });
  }
  if (command.type === "confirm-launch") {
    const attempt = state.activationAttempt;
    if (
      attempt == null
      || attempt.attemptId !== command.proof.attemptId
      || attempt.generationId !== command.proof.generationId
      || attempt.launchId !== command.proof.launchId
      || attempt.launchCount < 1
    ) throw new StandaloneStateConflictError("identity-conflict", "activation launch proof is stale");
    return next(state, { activationAttempt: null, lastHealthy: attempt.generationId });
  }
  if (command.attemptId != null && state.activationAttempt?.attemptId !== command.attemptId) throw new StandaloneStateConflictError("identity-conflict", "activation attempt changed concurrently");
  if (state.activationAttempt == null) return state;
  return next(state, { active: state.lastHealthy, activationAttempt: null, prepared: null, activationIntent: null });
}

export function activationPolicyCommand(
  state: GenerationState,
  generationId: string,
  policy: UpdateActivationPolicy,
  now = new Date().toISOString(),
): Extract<GenerationStateCommand, { type: "authorize" | "revoke-silent" }> | null {
  if (policy === "observe") return null;
  if (policy === "revoke-silent") return { type: "revoke-silent", expectedRevision: state.revision, generationId };
  return {
    type: "authorize",
    expectedRevision: state.revision,
    generationId,
    authority: policy === "authorize-user" ? "user" : "silent",
    cause: policy === "authorize-user" ? "user-interaction" : "update-policy",
    authorizedAt: now,
  };
}
