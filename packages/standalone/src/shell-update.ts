import { compareVersions, type StandaloneShellIdentity, type StandaloneShellRequirement } from "./protocol.js";
import type { GenerationRecord } from "./store.js";
import type { LifecycleAttachment, LifecycleStatus } from "./launcher.js";
import type { StandaloneGenerationBinding } from "./bootloader-handoff.js";

export const STANDALONE_SHELL_UPDATER_SCHEMA = 3 as const;

export type StandaloneLifecycleOccupant = Readonly<{
  attachmentId: string;
  generationId: string;
  shell: StandaloneShellIdentity;
}>;

export type StandaloneLifecycleTransition = Readonly<{
  attemptId: string;
  fence: number;
  expiresAt: string;
  heartbeatIntervalMs: number;
  occupants: readonly StandaloneLifecycleOccupant[];
  phase: "reserved" | "stopped-sealed";
  renew(): Promise<void>;
  release(): Promise<void>;
  forceStop(): Promise<void>;
  completeBoundStart(generation: GenerationRecord, attachment: LifecycleAttachment, binding: StandaloneGenerationBinding): Promise<LifecycleStatus>;
}>;

export type StandaloneLifecycleTransitionResult =
  | Readonly<{ state: "acquired"; transition: StandaloneLifecycleTransition }>
  | Readonly<{
      state: "blocked";
      reason: "occupied" | "transition-active" | "unavailable";
      occupants: readonly StandaloneLifecycleOccupant[];
    }>;

export interface StandaloneLifecycleTransitionPort {
  occupants(scope: Readonly<{ channel: string; namespace: string }>): Promise<readonly StandaloneLifecycleOccupant[]>;
  beginTransition(
    scope: Readonly<{ channel: string; namespace: string }>,
    kind: "content-restart" | "shell-install",
    options?: Readonly<{ attemptId?: string; ownerAttachmentId?: string; ownerShellType?: string; force?: boolean }>,
  ): Promise<StandaloneLifecycleTransitionResult>;
}

export type StandaloneShellUpdaterState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "applying"
  | "handed-off"
  | "installed"
  | "failed";

export type StandaloneShellUpdaterAction = Readonly<{
  id: "check" | "download" | "install" | "later" | "force-stop-and-install" | "abandon";
  emphasis: "primary" | "secondary" | "danger";
}>;

export type StandaloneShellUpdaterSnapshot = Readonly<{
  schemaVersion: typeof STANDALONE_SHELL_UPDATER_SCHEMA;
  revision: number;
  shellType: string;
  state: StandaloneShellUpdaterState;
  candidateId?: string;
  installAttemptId?: string;
  progress?: Readonly<{ completed: number; total: number }>;
  actions: readonly StandaloneShellUpdaterAction[];
  blockedBy: readonly StandaloneLifecycleOccupant[];
  handoff?: Readonly<{
    interaction: "restart-and-install";
    releaseVersion: string;
    target: string;
    artifact: Readonly<{ path: string; sha256: string; size: number; mediaType: string }>;
    shell: Readonly<{ type: string; version: string; buildHash: string }>;
  }>;
  error?: Readonly<{ code: string; message: string }>;
}>;

export type StandaloneShellUpdaterCommand = Readonly<{
  expectedRevision: number;
  state: StandaloneShellUpdaterState;
  candidateId?: string;
  installAttemptId?: string;
  progress?: Readonly<{ completed: number; total: number }>;
  blockedBy?: readonly StandaloneLifecycleOccupant[];
  handoff?: StandaloneShellUpdaterSnapshot["handoff"];
  error?: Readonly<{ code: string; message: string }>;
}>;

const SHELL_UPDATE_TOKEN_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function shellUpdaterActions(snapshot: Omit<StandaloneShellUpdaterSnapshot, "actions">): readonly StandaloneShellUpdaterAction[] {
  if (snapshot.state === "idle" || snapshot.state === "failed") return [{ id: "check", emphasis: "primary" }];
  if (snapshot.state === "available") return [{ id: "download", emphasis: "primary" }];
  if (snapshot.state === "ready") {
    return snapshot.blockedBy.length > 0
      ? [{ id: "later", emphasis: "secondary" }, { id: "force-stop-and-install", emphasis: "danger" }]
      : [{ id: "install", emphasis: "primary" }, { id: "later", emphasis: "secondary" }];
  }
  if (snapshot.state === "handed-off") return [{ id: "abandon", emphasis: "danger" }];
  return [];
}

export function initialShellUpdaterSnapshot(shellType: string): StandaloneShellUpdaterSnapshot {
  return validateShellUpdaterSnapshot({ schemaVersion: STANDALONE_SHELL_UPDATER_SCHEMA, revision: 0, shellType, state: "idle", actions: [{ id: "check", emphasis: "primary" }], blockedBy: [] });
}

export function validateShellUpdaterSnapshot(value: unknown): StandaloneShellUpdaterSnapshot {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid Shell updater snapshot");
  const snapshot = value as StandaloneShellUpdaterSnapshot;
  if (snapshot.schemaVersion !== STANDALONE_SHELL_UPDATER_SCHEMA || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) throw new Error("unsupported Shell updater snapshot");
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(snapshot.shellType) || !Array.isArray(snapshot.actions) || !Array.isArray(snapshot.blockedBy)) throw new Error("invalid Shell updater identity or projections");
  if (!Object.hasOwn(shellUpdateTransitions, snapshot.state)) throw new Error("invalid Shell updater phase");
  if (snapshot.candidateId != null && !SHELL_UPDATE_TOKEN_PATTERN.test(snapshot.candidateId)) throw new Error("invalid Shell updater candidate identity");
  if (snapshot.installAttemptId != null && !SHELL_UPDATE_TOKEN_PATTERN.test(snapshot.installAttemptId)) throw new Error("invalid Shell install attempt identity");
  if (["available", "downloading", "ready", "applying", "handed-off", "installed"].includes(snapshot.state) && snapshot.candidateId == null) throw new Error("Shell updater phase lacks a candidate identity");
  if (["applying", "handed-off", "installed"].includes(snapshot.state) && snapshot.installAttemptId == null) throw new Error("Shell updater phase lacks an install attempt identity");
  if (["ready", "applying", "handed-off", "installed"].includes(snapshot.state) && snapshot.handoff == null) throw new Error("Shell updater phase lacks an exact handoff");
  const expectedActions = shellUpdaterActions(snapshot);
  if (JSON.stringify(snapshot.actions) !== JSON.stringify(expectedActions)) throw new Error("Shell updater actions are not derived from its phase");
  return structuredClone(snapshot);
}

const shellUpdateTransitions: Readonly<Record<StandaloneShellUpdaterState, readonly StandaloneShellUpdaterState[]>> = {
  idle: ["checking"],
  checking: ["available", "failed"],
  available: ["checking", "downloading", "failed"],
  downloading: ["ready", "failed"],
  ready: ["checking", "ready", "applying", "failed"],
  applying: ["handed-off", "installed", "failed"],
  "handed-off": ["handed-off", "installed", "failed"],
  installed: ["installed", "checking"],
  failed: ["checking"],
};

export function reduceShellUpdaterSnapshot(
  snapshotInput: StandaloneShellUpdaterSnapshot,
  command: StandaloneShellUpdaterCommand,
): StandaloneShellUpdaterSnapshot {
  const snapshot = validateShellUpdaterSnapshot(snapshotInput);
  if (snapshot.revision !== command.expectedRevision) throw new Error(`stale Shell updater revision: expected ${command.expectedRevision}, current ${snapshot.revision}`);
  if (!shellUpdateTransitions[snapshot.state].includes(command.state)) throw new Error(`invalid Shell updater transition: ${snapshot.state} -> ${command.state}`);
  const checking = command.state === "checking";
  const candidateId = checking ? undefined : command.candidateId ?? snapshot.candidateId;
  const installAttemptId = checking ? undefined : command.installAttemptId ?? snapshot.installAttemptId;
  const handoff = command.handoff ?? (checking ? undefined : snapshot.handoff);
  if (!checking && snapshot.candidateId != null && command.candidateId != null && snapshot.candidateId !== command.candidateId) throw new Error("Shell updater candidate changed concurrently");
  if (!checking && snapshot.installAttemptId != null && command.installAttemptId != null && snapshot.installAttemptId !== command.installAttemptId) throw new Error("Shell install attempt changed concurrently");
  const core = {
    schemaVersion: STANDALONE_SHELL_UPDATER_SCHEMA,
    revision: snapshot.revision + 1,
    shellType: snapshot.shellType,
    state: command.state,
    ...(candidateId == null ? {} : { candidateId }),
    ...(installAttemptId == null ? {} : { installAttemptId }),
    ...(command.progress == null ? {} : { progress: command.progress }),
    blockedBy: command.blockedBy ?? [],
    ...(handoff == null ? {} : { handoff }),
    ...(command.error == null ? {} : { error: command.error }),
  } as Omit<StandaloneShellUpdaterSnapshot, "actions">;
  return validateShellUpdaterSnapshot({ ...core, actions: shellUpdaterActions(core) });
}

export const SHELL_UPDATE_ALGEBRA = Object.freeze({
  initial: initialShellUpdaterSnapshot,
  validate: validateShellUpdaterSnapshot,
  reduce: reduceShellUpdaterSnapshot,
});

export type StandaloneShellUpdaterActionResult = Readonly<{
  outcome: "accepted" | "blocked" | "unsupported" | "failed";
  snapshot: StandaloneShellUpdaterSnapshot;
}>;

/** Shell-owned implementation exposed to Closure through the Standalone handoff. */
export interface StandaloneShellUpdaterPort {
  readonly shellType: string;
  readSnapshot(): Promise<StandaloneShellUpdaterSnapshot>;
  waitForChange(afterRevision: number, timeoutMs: number): Promise<StandaloneShellUpdaterSnapshot>;
  invoke(action: StandaloneShellUpdaterAction["id"]): Promise<StandaloneShellUpdaterActionResult>;
  confirmInstalled(proof: StandaloneShellIdentity): Promise<StandaloneShellUpdaterActionResult>;
}

export type StandaloneShellCompatibilityResult =
  | Readonly<{ state: "compatible" }>
  | Readonly<{
      state: "update-required";
      shellType: string;
      currentVersion: string;
      minimumVersion: string | null;
      updater: StandaloneShellUpdaterPort | null;
    }>;

export function resolveStandaloneShellCompatibility(input: Readonly<{
  requirement: StandaloneShellRequirement | null;
  shell: StandaloneShellIdentity;
  updater?: StandaloneShellUpdaterPort | null;
}>): StandaloneShellCompatibilityResult {
  if (input.requirement != null && compareVersions(input.shell.version, input.requirement.minVersion) >= 0) {
    return { state: "compatible" };
  }
  return {
    state: "update-required",
    shellType: input.shell.type,
    currentVersion: input.shell.version,
    minimumVersion: input.requirement?.minVersion ?? null,
    updater: input.updater ?? null,
  };
}
