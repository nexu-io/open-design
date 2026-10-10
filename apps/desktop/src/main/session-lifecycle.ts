import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * A run's abnormal exit, carried across launches until its telemetry has been
 * acked. Persisting these (rather than holding them only in memory) means a
 * failed report — e.g. the daemon isn't reachable yet — retries on the next
 * launch instead of losing the signal this mechanism exists to catch.
 */
export interface DesktopCrashSummary {
  sessionId: string;
  version: string | null;
  startedAt: string;
  /** Host events seen during that run, oldest first (see `recordDesktopHostEvent`). */
  hostEvents?: DesktopHostEventRecord[];
}

/**
 * A system or app lifecycle event that can explain a run ending without a clean
 * shutdown: the machine sleeping, shutting down or ending the session, or a quit
 * that started but whose teardown never finished.
 */
export type DesktopHostEvent =
  | { kind: "suspend" }
  | { kind: "resume" }
  | { kind: "shutdown" }
  | { kind: "session-end"; reasons?: string[] }
  | { kind: "quit-requested" };

export interface DesktopHostEventRecord {
  /** `suspend`, `resume`, `shutdown`, `quit-requested`, or `session-end[:reason,...]`. */
  kind: string;
  at: string;
}

// The last few events are enough to tell how a run ended; older ones are dropped.
const MAX_HOST_EVENTS = 8;

// Bound how many un-acked crashes we carry, so a device that crashes AND fails
// to report repeatedly can't grow the marker without limit. Oldest are dropped.
const MAX_UNREPORTED_CRASHES = 20;

/**
 * Persisted marker for one desktop run.
 *
 *  - `reachedRunning` flips true once the window is actually revealed, so a
 *    bootstrap failure BEFORE that (already covered by `packaged_runtime_failed`)
 *    isn't mistaken for a runtime crash.
 *  - `clean` flips true on a graceful quit.
 *  - `unreportedCrashes` is the queue of prior abnormal exits awaiting an ack.
 *
 * A run counts as an abnormal "runtime 闪退" when it `reachedRunning` but never
 * went `clean` — the app was up, then the process died without a graceful
 * shutdown. That class reaches no other telemetry.
 */
export interface DesktopSessionState {
  sessionId: string;
  version: string | null;
  startedAt: string;
  reachedRunning: boolean;
  clean: boolean;
  unreportedCrashes: DesktopCrashSummary[];
  hostEvents: DesktopHostEventRecord[];
}

function defaultRead(path: string): string {
  return readFileSync(path, "utf8");
}

function defaultWrite(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data, "utf8");
}

function parseHostEvents(value: unknown): DesktopHostEventRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is DesktopHostEventRecord =>
      e != null && typeof e === "object" && typeof (e as DesktopHostEventRecord).kind === "string" &&
      typeof (e as DesktopHostEventRecord).at === "string")
    .slice(-MAX_HOST_EVENTS);
}

function parseCrash(value: unknown): DesktopCrashSummary | null {
  if (value == null || typeof value !== "object") return null;
  const c = value as Partial<DesktopCrashSummary>;
  if (typeof c.sessionId !== "string") return null;
  const hostEvents = parseHostEvents(c.hostEvents);
  return {
    sessionId: c.sessionId,
    version: typeof c.version === "string" ? c.version : null,
    startedAt: typeof c.startedAt === "string" ? c.startedAt : "",
    ...(hostEvents.length > 0 ? { hostEvents } : {}),
  };
}

function parseState(raw: string): DesktopSessionState | null {
  const parsed = JSON.parse(raw) as Partial<DesktopSessionState>;
  if (parsed == null || typeof parsed.sessionId !== "string") return null;
  const queue = Array.isArray(parsed.unreportedCrashes)
    ? parsed.unreportedCrashes.map(parseCrash).filter((c): c is DesktopCrashSummary => c != null)
    : [];
  return {
    sessionId: parsed.sessionId,
    version: typeof parsed.version === "string" ? parsed.version : null,
    startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : "",
    reachedRunning: parsed.reachedRunning === true,
    clean: parsed.clean === true,
    unreportedCrashes: queue,
    hostEvents: parseHostEvents(parsed.hostEvents),
  };
}

export interface BeginDesktopSessionDeps {
  stateFilePath: string;
  sessionId: string;
  version: string | null;
  now: () => Date;
  /** Injectable for tests; defaults to fs. */
  readFile?: (path: string) => string;
  writeFile?: (path: string, data: string) => void;
}

/**
 * Read the previous run's marker, carry forward every not-yet-reported abnormal
 * exit (plus the previous run itself if it crashed), then write a fresh marker
 * for this run. Returns the full queue of crashes to report. Each is persisted
 * in the new marker's `unreportedCrashes` so it survives a failed report and is
 * retried next launch; `clearReportedCrash(id)` removes one once acked. The
 * queue is capped (oldest dropped) so it can't grow without bound. Best-effort —
 * never throws.
 */
export function beginDesktopSession(
  deps: BeginDesktopSessionDeps,
): { previousUncleanSessions: DesktopCrashSummary[] } {
  const read = deps.readFile ?? defaultRead;
  const write = deps.writeFile ?? defaultWrite;

  let pending: DesktopCrashSummary[] = [];
  try {
    const prev = parseState(read(deps.stateFilePath));
    if (prev != null) {
      pending = [...prev.unreportedCrashes];
      if (prev.reachedRunning && !prev.clean) {
        pending.push({
          sessionId: prev.sessionId,
          version: prev.version,
          startedAt: prev.startedAt,
          ...(prev.hostEvents.length > 0 ? { hostEvents: prev.hostEvents } : {}),
        });
      }
    }
  } catch {
    // No marker (first run), unreadable, or a run that never reached running.
  }
  // Keep the newest if we somehow exceed the cap.
  if (pending.length > MAX_UNREPORTED_CRASHES) pending = pending.slice(pending.length - MAX_UNREPORTED_CRASHES);

  const state: DesktopSessionState = {
    sessionId: deps.sessionId,
    version: deps.version,
    startedAt: deps.now().toISOString(),
    reachedRunning: false,
    clean: false,
    unreportedCrashes: pending,
    hostEvents: [],
  };
  try {
    write(deps.stateFilePath, JSON.stringify(state));
  } catch {
    // Best-effort.
  }
  return { previousUncleanSessions: pending };
}

function updateState(
  stateFilePath: string,
  patch: (state: DesktopSessionState) => DesktopSessionState,
  readFile: (path: string) => string,
  writeFile: (path: string, data: string) => void,
): void {
  try {
    const state = parseState(readFile(stateFilePath));
    if (state == null) return;
    writeFile(stateFilePath, JSON.stringify(patch(state)));
  } catch {
    // Best-effort.
  }
}

/**
 * Flip this run's marker to `reachedRunning: true` once the window is revealed.
 * Only after this does a subsequent dirty marker count as a runtime crash.
 */
export function markDesktopSessionRunning(deps: {
  stateFilePath: string;
  readFile?: (path: string) => string;
  writeFile?: (path: string, data: string) => void;
}): void {
  updateState(deps.stateFilePath, (s) => ({ ...s, reachedRunning: true }), deps.readFile ?? defaultRead, deps.writeFile ?? defaultWrite);
}

/**
 * Flip this run's marker to `clean: true` on a graceful quit, so the next launch
 * doesn't misreport it as an abnormal exit. Best-effort and idempotent.
 */
export function endDesktopSessionCleanly(deps: {
  stateFilePath: string;
  readFile?: (path: string) => string;
  writeFile?: (path: string, data: string) => void;
}): void {
  updateState(deps.stateFilePath, (s) => ({ ...s, clean: true }), deps.readFile ?? defaultRead, deps.writeFile ?? defaultWrite);
}

/**
 * Remove one crash from the queue once its telemetry has been acked, so it isn't
 * reported again. Keyed by sessionId so acks land independently.
 */
export function clearReportedCrash(
  deps: {
    stateFilePath: string;
    readFile?: (path: string) => string;
    writeFile?: (path: string, data: string) => void;
  },
  sessionId: string,
): void {
  updateState(
    deps.stateFilePath,
    (s) => ({ ...s, unreportedCrashes: s.unreportedCrashes.filter((c) => c.sessionId !== sessionId) }),
    deps.readFile ?? defaultRead,
    deps.writeFile ?? defaultWrite,
  );
}

/**
 * Append a host event to this run's marker. Written synchronously so the event
 * is on disk before the OS can end the process (a shutdown or session end may
 * kill it moments later). Keeps the last few events. Best-effort.
 */
export function recordDesktopHostEvent(
  deps: {
    stateFilePath: string;
    now?: () => Date;
    readFile?: (path: string) => string;
    writeFile?: (path: string, data: string) => void;
  },
  event: DesktopHostEvent,
): void {
  const reasons = event.kind === "session-end" && event.reasons && event.reasons.length > 0
    ? `:${event.reasons.join(",")}`
    : "";
  const record: DesktopHostEventRecord = { kind: `${event.kind}${reasons}`, at: (deps.now ?? (() => new Date()))().toISOString() };
  updateState(
    deps.stateFilePath,
    (s) => {
      // Several windows report the same session end; keep one per second per kind.
      const last = s.hostEvents.at(-1);
      if (last && last.kind === record.kind && Math.abs(Date.parse(record.at) - Date.parse(last.at)) < 1_000) return s;
      return { ...s, hostEvents: [...s.hostEvents, record].slice(-MAX_HOST_EVENTS) };
    },
    deps.readFile ?? defaultRead,
    deps.writeFile ?? defaultWrite,
  );
}
