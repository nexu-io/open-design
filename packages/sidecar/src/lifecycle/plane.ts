import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { SidecarLifecycleError } from "./error.js";
import type {
  BootstrapSidecarLifecycleOptions,
  SidecarAbortTransitionResult,
  SidecarAttachResult,
  SidecarBeginTransitionResult,
  SidecarCompleteTransitionResult,
  SidecarLeaseCredential,
  SidecarLeaseView,
  SidecarLifecycleOwner,
  SidecarLifecyclePlane,
  SidecarLifecycleScope,
  SidecarLifecycleSnapshot,
  SidecarRenewLeaseResult,
  SidecarRenewTransitionResult,
  SidecarTakeoverTransitionResult,
  SidecarTransitionCredential,
  SidecarTransitionView,
} from "./public-types.js";

const STATE_SCHEMA_VERSION = 1;
const DEFAULT_MAX_LEASE_MS = 60_000;
const DEFAULT_GUARD_SPIN_MS = 300;
const DEFAULT_GUARD_STALE_MS = 2_000;

type LeaseRecord = SidecarLeaseView & Readonly<{ token: string }>;
type TransitionRecord = SidecarTransitionView & Readonly<{ token: string }>;
type LifecycleState = {
  leases: LeaseRecord[];
  nextFence: number;
  observedAtMs: number;
  schemaVersion: 1;
  scope: SidecarLifecycleScope;
  transition: TransitionRecord | null;
};

function fail(code: ConstructorParameters<typeof SidecarLifecycleError>[0], message: string, cause?: unknown): never {
  throw new SidecarLifecycleError(code, message, cause == null ? undefined : { cause });
}

function assertSegment(value: string, field: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(value)) {
    fail("invalid-input", `${field} must be a lowercase filesystem-safe segment`);
  }
  return value;
}

function assertOwner(owner: SidecarLifecycleOwner): SidecarLifecycleOwner {
  if (!owner || typeof owner !== "object") fail("invalid-input", "owner is required");
  if (!Number.isSafeInteger(owner.generation) || owner.generation < 0) {
    fail("invalid-input", "owner.generation must be a non-negative integer");
  }
  for (const [field, value] of [["owner.key", owner.key], ["owner.incarnation", owner.incarnation]] as const) {
    if (typeof value !== "string" || value.length === 0 || value.length > 256) {
      fail("invalid-input", `${field} must be a non-empty string of at most 256 characters`);
    }
  }
  return owner;
}

function assertDuration(value: number, maxLeaseMs: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maxLeaseMs) {
    fail("invalid-input", `leaseMs must be an integer between 1 and ${maxLeaseMs}`);
  }
  return value;
}

function leaseView(record: LeaseRecord): SidecarLeaseView {
  return { expiresAtMs: record.expiresAtMs, id: record.id, owner: record.owner };
}

function transitionView(record: TransitionRecord): SidecarTransitionView {
  return {
    expiresAtMs: record.expiresAtMs,
    fence: record.fence,
    id: record.id,
    kind: record.kind,
    owner: record.owner,
  };
}

function credentialMatches(
  record: Readonly<{ id: string; token: string }>,
  credential: Readonly<{ id: string; token: string }>,
): boolean {
  return record.id === credential.id && record.token === credential.token;
}

function transitionCredentialMatches(
  record: TransitionRecord,
  credential: SidecarTransitionCredential,
): boolean {
  return credentialMatches(record, credential) && record.fence === credential.fence;
}

function isOwner(value: unknown): value is SidecarLifecycleOwner {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const owner = value as Partial<SidecarLifecycleOwner>;
  return Number.isSafeInteger(owner.generation) && Number(owner.generation) >= 0
    && typeof owner.incarnation === "string" && owner.incarnation.length > 0
    && typeof owner.key === "string" && owner.key.length > 0;
}

function decodeState(value: unknown, expectedScope: SidecarLifecycleScope): LifecycleState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("state-corrupt", "sidecar lifecycle state is not an object");
  }
  const state = value as Partial<LifecycleState>;
  if (state.schemaVersion !== STATE_SCHEMA_VERSION) {
    fail("state-corrupt", `unsupported sidecar lifecycle schema: ${String(state.schemaVersion)}`);
  }
  if (state.scope?.channel !== expectedScope.channel || state.scope.namespace !== expectedScope.namespace) {
    fail("state-corrupt", "sidecar lifecycle state scope does not match the requested scope");
  }
  if (!Number.isFinite(state.observedAtMs) || !Number.isSafeInteger(state.nextFence) || Number(state.nextFence) < 1) {
    fail("state-corrupt", "sidecar lifecycle state counters are invalid");
  }
  if (!Array.isArray(state.leases) || !state.leases.every((lease) =>
    lease && typeof lease.id === "string" && typeof lease.token === "string"
      && Number.isFinite(lease.expiresAtMs) && isOwner(lease.owner))) {
    fail("state-corrupt", "sidecar lifecycle leases are invalid");
  }
  const transition = state.transition;
  if (transition !== null && (!transition || typeof transition.id !== "string"
    || typeof transition.token !== "string" || typeof transition.kind !== "string"
    || !Number.isFinite(transition.expiresAtMs) || !Number.isSafeInteger(transition.fence)
    || !isOwner(transition.owner))) {
    fail("state-corrupt", "sidecar lifecycle transition is invalid");
  }
  return state as LifecycleState;
}

function initialState(scope: SidecarLifecycleScope, nowMs: number): LifecycleState {
  return {
    leases: [],
    nextFence: 1,
    observedAtMs: nowMs,
    schemaVersion: STATE_SCHEMA_VERSION,
    scope,
    transition: null,
  };
}

function prune(state: LifecycleState, nowMs: number): void {
  state.observedAtMs = Math.max(state.observedAtMs, nowMs);
  state.leases = state.leases.filter((lease) => lease.expiresAtMs > state.observedAtMs);
  if (state.transition && state.transition.expiresAtMs <= state.observedAtMs) state.transition = null;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

export function bootstrapSidecarLifecycle(options: BootstrapSidecarLifecycleOptions): SidecarLifecyclePlane {
  const scope = {
    channel: assertSegment(options.scope.channel, "scope.channel"),
    namespace: assertSegment(options.scope.namespace, "scope.namespace"),
  };
  const controlRoot = resolve(options.controlRoot);
  const maxLeaseMs = options.maxLeaseMs ?? DEFAULT_MAX_LEASE_MS;
  const guardSpinMs = options.guardSpinMs ?? DEFAULT_GUARD_SPIN_MS;
  const guardStaleMs = options.guardStaleMs ?? DEFAULT_GUARD_STALE_MS;
  const clock = options.now ?? Date.now;
  if (!Number.isSafeInteger(maxLeaseMs) || maxLeaseMs <= 0 || maxLeaseMs > DEFAULT_MAX_LEASE_MS) {
    fail("invalid-input", `maxLeaseMs must be between 1 and ${DEFAULT_MAX_LEASE_MS}`);
  }
  if (!Number.isSafeInteger(guardSpinMs) || guardSpinMs < 0 || guardSpinMs > 2_000) {
    fail("invalid-input", "guardSpinMs must be between 0 and 2000");
  }
  if (!Number.isSafeInteger(guardStaleMs) || guardStaleMs < 500 || guardStaleMs > 10_000) {
    fail("invalid-input", "guardStaleMs must be between 500 and 10000");
  }

  const scopeDigest = createHash("sha256")
    .update(`${scope.channel}\0${scope.namespace}`)
    .digest("hex")
    .slice(0, 24);
  const statePath = join(controlRoot, "sidecar-lifecycle", `${scopeDigest}.json`);
  const guardPath = `${statePath}.guard`;

  async function acquireGuard(): Promise<void> {
    await mkdir(dirname(guardPath), { mode: 0o700, recursive: true });
    await chmod(dirname(guardPath), 0o700);
    const deadline = Date.now() + guardSpinMs;
    while (true) {
      try {
        await mkdir(guardPath, { mode: 0o700 });
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          fail("state-unavailable", "sidecar lifecycle guard is unavailable", error);
        }
      }

      try {
        const guardStat = await stat(guardPath);
        if (Date.now() - guardStat.mtimeMs >= guardStaleMs) {
          await rm(guardPath, { recursive: true });
          continue;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        fail("state-unavailable", "sidecar lifecycle guard cannot be inspected", error);
      }

      if (Date.now() >= deadline) {
        fail("guard-busy", "sidecar lifecycle guard is busy; retry the operation");
      }
      await wait(Math.min(20, Math.max(1, deadline - Date.now())));
    }
  }

  async function readState(): Promise<LifecycleState> {
    let source: string;
    try {
      source = await readFile(statePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return initialState(scope, clock());
      fail("state-unavailable", "sidecar lifecycle state cannot be read", error);
    }
    try {
      return decodeState(JSON.parse(source), scope);
    } catch (error) {
      if (error instanceof SidecarLifecycleError) throw error;
      fail("state-corrupt", "sidecar lifecycle state is not valid JSON", error);
    }
  }

  async function writeState(state: LifecycleState): Promise<void> {
    await mkdir(dirname(statePath), { mode: 0o700, recursive: true });
    await chmod(dirname(statePath), 0o700);
    const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryPath, statePath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      fail("state-unavailable", "sidecar lifecycle state cannot be committed", error);
    }
  }

  async function mutate<TResult>(operation: (state: LifecycleState) => TResult | Promise<TResult>): Promise<TResult> {
    await acquireGuard();
    try {
      const state = await readState();
      prune(state, clock());
      const result = await operation(state);
      await writeState(state);
      return result;
    } finally {
      await rm(guardPath, { recursive: true }).catch(() => undefined);
    }
  }

  return {
    scope,
    async attach({ leaseMs, owner, transition }): Promise<SidecarAttachResult> {
      assertOwner(owner);
      assertDuration(leaseMs, maxLeaseMs);
      return mutate((state) => {
        if (state.transition && (!transition || !transitionCredentialMatches(state.transition, transition))) {
          return { reason: "transition-active", state: "blocked", transition: transitionView(state.transition) };
        }
        const credential = { id: randomUUID(), token: randomUUID() };
        const lease: LeaseRecord = {
          expiresAtMs: state.observedAtMs + leaseMs,
          id: credential.id,
          owner,
          token: credential.token,
        };
        state.leases.push(lease);
        return { credential, lease: leaseView(lease), state: "attached" };
      });
    },
    async renewLease({ credential, leaseMs, transition }): Promise<SidecarRenewLeaseResult> {
      assertDuration(leaseMs, maxLeaseMs);
      return mutate((state) => {
        if (state.transition && (!transition || !transitionCredentialMatches(state.transition, transition))) {
          return {
            reason: "transition-active",
            state: "rejected",
            transition: transitionView(state.transition),
          };
        }
        const lease = state.leases.find((candidate) => credentialMatches(candidate, credential));
        if (!lease) return { reason: "expired-or-fenced", state: "rejected" };
        const renewed: LeaseRecord = { ...lease, expiresAtMs: state.observedAtMs + leaseMs };
        state.leases = state.leases.map((candidate) => candidate.id === lease.id ? renewed : candidate);
        return { lease: leaseView(renewed), state: "renewed" };
      });
    },
    async detach(credential): Promise<Readonly<{ detached: boolean }>> {
      return mutate((state) => {
        const before = state.leases.length;
        state.leases = state.leases.filter((lease) => !credentialMatches(lease, credential));
        return { detached: state.leases.length !== before };
      });
    },
    async beginTransition({ kind, leaseMs, owner, requester }): Promise<SidecarBeginTransitionResult> {
      assertOwner(owner);
      assertDuration(leaseMs, maxLeaseMs);
      if (typeof kind !== "string" || kind.length === 0 || kind.length > 128) {
        fail("invalid-input", "transition kind must be a non-empty string of at most 128 characters");
      }
      return mutate((state) => {
        if (state.transition) {
          return {
            reason: "transition-active",
            state: "blocked",
            transition: transitionView(state.transition),
          };
        }
        let requesterRecord: LeaseRecord | undefined;
        if (requester) {
          requesterRecord = state.leases.find((lease) => credentialMatches(lease, requester));
          if (!requesterRecord) return { reason: "requester-expired-or-fenced", state: "blocked" };
        }
        const occupants = state.leases.filter((lease) => lease !== requesterRecord);
        if (occupants.length > 0) {
          return { occupants: occupants.map(leaseView), reason: "occupied", state: "blocked" };
        }
        const credential = { fence: state.nextFence, id: randomUUID(), token: randomUUID() };
        state.nextFence += 1;
        const transition: TransitionRecord = {
          expiresAtMs: state.observedAtMs + leaseMs,
          fence: credential.fence,
          id: credential.id,
          kind,
          owner,
          token: credential.token,
        };
        state.transition = transition;
        return { credential, state: "acquired", transition: transitionView(transition) };
      });
    },
    async renewTransition({ credential, leaseMs }): Promise<SidecarRenewTransitionResult> {
      assertDuration(leaseMs, maxLeaseMs);
      return mutate((state) => {
        if (!state.transition || !transitionCredentialMatches(state.transition, credential)) {
          return { reason: "expired-or-fenced", state: "rejected" };
        }
        state.transition = { ...state.transition, expiresAtMs: state.observedAtMs + leaseMs };
        return { state: "renewed", transition: transitionView(state.transition) };
      });
    },
    async takeoverTransition({ credential, leaseMs, owner }): Promise<SidecarTakeoverTransitionResult> {
      assertOwner(owner);
      assertDuration(leaseMs, maxLeaseMs);
      return mutate((state) => {
        if (!state.transition || !transitionCredentialMatches(state.transition, credential)) {
          return { reason: "expired-or-fenced", state: "rejected" };
        }
        const nextCredential = { fence: state.nextFence, id: state.transition.id, token: randomUUID() };
        state.nextFence += 1;
        state.transition = {
          ...state.transition,
          expiresAtMs: state.observedAtMs + leaseMs,
          fence: nextCredential.fence,
          owner,
          token: nextCredential.token,
        };
        return {
          credential: nextCredential,
          state: "acquired",
          transition: transitionView(state.transition),
        };
      });
    },
    async abortTransition(credential): Promise<SidecarAbortTransitionResult> {
      return mutate((state) => {
        if (!state.transition || !transitionCredentialMatches(state.transition, credential)) {
          return { reason: "expired-or-fenced", state: "rejected" };
        }
        state.transition = null;
        return { state: "aborted" };
      });
    },
    async completeTransition({ lease, transition }): Promise<SidecarCompleteTransitionResult> {
      return mutate((state) => {
        if (!state.transition || !transitionCredentialMatches(state.transition, transition)) {
          return { reason: "transition-expired-or-fenced", state: "rejected" };
        }
        if (!state.leases.some((candidate) => credentialMatches(candidate, lease))) {
          return { reason: "lease-expired-or-fenced", state: "rejected" };
        }
        state.transition = null;
        return { state: "completed" };
      });
    },
    async snapshot(): Promise<SidecarLifecycleSnapshot> {
      return mutate((state) => ({
        leases: state.leases.map(leaseView),
        scope,
        transition: state.transition ? transitionView(state.transition) : null,
      }));
    },
  };
}
