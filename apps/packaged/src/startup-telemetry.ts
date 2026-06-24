// Main-process direct PostHog capture for daemon/web STARTUP failures.
//
// Why this exists separately from apps/daemon/src/analytics.ts: the daemon is
// the PostHog client's host. When the daemon never reports status (e.g. a
// missing native module — see issue #4638, where `better-sqlite3` vanished
// from the app bundle and the daemon died with ERR_MODULE_NOT_FOUND), the
// daemon/web sidecars are not running, so NOTHING emits telemetry and the
// whole "startup failed before the daemon came up" class is invisible on every
// dashboard. This module lets the packaged MAIN process emit one structured
// event on the fatal-exit path.
//
// ZERO startup side-effects by construction:
//  - No work at import time (pure helpers + one async fn; no client, no I/O).
//  - Invoked ONLY from index.ts's `main().catch(...)`, i.e. only when startup
//    has ALREADY failed and the process is about to exit(1). The happy path
//    never touches any of this.
//  - capture() is fetch-based (no posthog-node SDK, no new dependency), wrapped
//    in Promise.race with a hard timeout, and swallows every error — it can
//    neither block nor crash the exit.
//
// Consent: startup-crash telemetry follows the existing `captureSafety` policy
// in apps/daemon/src/analytics.ts — stability data is retained even for
// opted-out users (and the main process cannot read daemon consent anyway,
// since the daemon isn't up). The Settings → Privacy copy MUST call this out.

import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { release } from "node:os";

const DEFAULT_HOST = "https://us.i.posthog.com";
// Real-machine e2e (local packaged build → delete better-sqlite3 → launch →
// query PostHog) proved a 1.5s cap silently DROPPED the event: a cold DNS+TLS
// handshake to us.i.posthog.com from a fresh main process exceeds 1.5s, so the
// race timed out and process.exit(1) killed the in-flight POST before it
// landed. 5s gives the one request room to complete on a cold connection.
// A genuinely offline machine still exits fast — fetch rejects on DNS failure,
// so `send` resolves early and we don't burn the full bound; only a black-hole
// network pays the full 5s, which on an already-crashing exit is acceptable.
const DEFAULT_TIMEOUT_MS = 5000;
const LOG_TAIL_MAX_BYTES = 16_384;

export const STARTUP_FAILURE_EVENT = "packaged_runtime_failed";

// Shared safety-event envelope constants. `captureSafety` in
// apps/daemon/src/analytics.ts stamps these on every stability event; we mirror
// them here so env/schema-filtered dashboards bucket packaged_runtime_failed
// beside the rest of the analytics stream instead of dropping it.
//
// EVENT_SCHEMA_VERSION must stay in lockstep with
// packages/contracts/src/analytics/public-params.ts. It is replicated (not
// imported) because apps/packaged does not depend on @open-design/contracts and
// a single integer isn't worth a new cross-package dependency that also
// complicates the daemon-chunk externalization.
const EVENT_SCHEMA_VERSION = 2;
const CLIENT_TYPE = "packaged_main";
const CAPTURE_SOURCE = "packaged/startup";

// Replicates apps/daemon/src/telemetry-environment.ts (daemon src, not
// importable here) so the packaged main process resolves the same `env` bucket
// as daemon-emitted events for a given process environment.
function resolveTelemetryEnv(env: NodeJS.ProcessEnv = process.env): string {
  const explicit =
    env.OD_TELEMETRY_ENV?.trim() ||
    env.OPEN_DESIGN_ENV?.trim() ||
    env.POSTHOG_ENV?.trim() ||
    env.LANGFUSE_ENVIRONMENT?.trim();
  if (explicit) return explicit;
  if (env.NODE_ENV === "production") return "production";
  return "development";
}

// Mirrors apps/daemon/src/analytics.ts randomInsertId. $insert_id is PostHog's
// dedup key; event_id carries the same value.
function randomInsertId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type StartupFailureKind =
  | "daemon-start"
  | "web-start"
  | "path-access"
  | "unknown";

export interface StartupFailureClassification {
  failureKind: StartupFailureKind;
  exitCode: number | null;
  signal: string | null;
  logPath: string | null;
}

// `waitForStatus` (apps/packaged/src/sidecars.ts:206-208) throws:
//   "daemon exited before reporting status (code=1, signal=none); see <logPath> for details"
// The literal word is always "daemon" even for the web sidecar, so we
// distinguish daemon-vs-web by the LOG PATH segment, not the message text.
const EXIT_RE =
  /exited before reporting status \(code=(.*?), signal=(.*?)\); see (.*?) for details/;

export function classifyStartupFailure(
  error: unknown,
  isPathAccess: boolean,
): StartupFailureClassification {
  if (isPathAccess) {
    return { failureKind: "path-access", exitCode: null, signal: null, logPath: null };
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = EXIT_RE.exec(message);
  if (!match) {
    return { failureKind: "unknown", exitCode: null, signal: null, logPath: null };
  }
  const rawCode = match[1];
  const rawSignal = match[2];
  const logPath = match[3] && match[3] !== "<no log path>" ? match[3] : null;
  const parsedCode = rawCode === "null" ? null : Number.parseInt(rawCode, 10);
  const exitCode = parsedCode == null || Number.isNaN(parsedCode) ? null : parsedCode;
  const signal = rawSignal === "none" ? null : rawSignal;
  // `startPackagedSidecars` builds the watched log path with path.join, which is
  // backslash-separated on Windows (`...\logs\web\latest.log`). Normalize before
  // the segment check so a web-sidecar failure isn't misreported as daemon-start
  // on Windows — exactly the platform split this field exists to capture.
  const normalizedLogPath = logPath?.replace(/\\/g, "/") ?? null;
  const failureKind: StartupFailureKind = normalizedLogPath?.includes("/web/")
    ? "web-start"
    : "daemon-start";
  return { failureKind, exitCode, signal, logPath };
}

// Pull the real error code + missing module out of a sidecar log tail. Pure
// function so it can be fed the #4638 log text verbatim in tests.
export function parseDaemonLogTail(logText: string): {
  errorCode?: string;
  missingModule?: string;
} {
  const out: { errorCode?: string; missingModule?: string } = {};
  const errMatch = /\bERR_[A-Z0-9_]+/.exec(logText);
  if (errMatch) out.errorCode = errMatch[0];
  const modMatch =
    /Cannot find package '([^']+)'|Cannot find module '([^']+)'/.exec(logText);
  if (modMatch) out.missingModule = modMatch[1] ?? modMatch[2];
  return out;
}

// apps/web/src/analytics/scrub.ts only rewrites paths containing an
// apps/|packages/|tools/ segment, so it does NOT touch a user's home dir
// (verified empirically against the #4638 log). The packaged main process
// can't import the web module anyway, so we ship a focused scrubber here.
export function scrubUserPaths(value: string): string {
  return value
    .replace(/\/(Users|home)\/[^/\s]+/g, "/$1/<redacted>")
    .replace(/([A-Za-z]:\\Users\\)[^\\\s]+/g, "$1<redacted>");
}

function osName(platform: NodeJS.Platform = process.platform): string {
  if (platform === "darwin") return "Mac OS X";
  if (platform === "win32") return "Windows";
  if (platform === "linux") return "Linux";
  return platform;
}

// Stable-ish distinct id for the crash event. Best-effort reads the persistent
// installationId (survives a namespace data reset); falls back to a synthetic
// per-namespace id. Person identity is not critical for crash-distribution
// analysis — we segment on os/version/channel, not per-user funnels.
//
// `installationRoot` must be passed explicitly from `paths.installationRoot`:
// OD_INSTALLATION_DIR is only set in the daemon CHILD env, never in the packaged
// main process, so relying on the env here would always fall through to the
// synthetic id. The env is kept as a secondary fallback only.
export function resolveStartupDistinctId(
  namespace: string,
  installationRoot?: string | null,
): string {
  const dir = installationRoot?.trim() || process.env.OD_INSTALLATION_DIR?.trim();
  try {
    if (dir) {
      const raw = readFileSync(join(dir, "installation.json"), "utf8");
      const parsed = JSON.parse(raw) as { installationId?: unknown };
      if (typeof parsed.installationId === "string" && parsed.installationId.length > 0) {
        return parsed.installationId;
      }
    }
  } catch {
    // fall through to synthetic
  }
  return `packaged-${namespace}`;
}

async function defaultReadLogTail(path: string): Promise<string | null> {
  try {
    const buf = await readFile(path);
    return buf.length > LOG_TAIL_MAX_BYTES
      ? buf.subarray(buf.length - LOG_TAIL_MAX_BYTES).toString("utf8")
      : buf.toString("utf8");
  } catch {
    return null;
  }
}

export interface CaptureDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => string;
  insertId?: string;
}

// Fire a single PostHog capture over plain HTTPS. No-op without a key; never
// throws; never blocks longer than `timeoutMs`.
export async function captureStartupFailure(
  args: {
    posthogKey: string | null;
    posthogHost: string | null;
    distinctId: string;
    event: string;
    properties: Record<string, unknown>;
  },
  deps: CaptureDeps = {},
): Promise<void> {
  const key = args.posthogKey?.trim();
  if (!key) return; // fork builds / no key → no-op, zero network
  const host = (args.posthogHost?.trim() || DEFAULT_HOST).replace(/\/+$/, "");
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = deps.now ?? (() => new Date().toISOString());
  const insertId = deps.insertId ?? randomInsertId();
  const appVersion =
    typeof args.properties.app_version === "string" ? args.properties.app_version : null;
  const body = JSON.stringify({
    api_key: key,
    event: args.event,
    distinct_id: args.distinctId,
    properties: {
      ...args.properties,
      // Shared safety-event envelope, mirroring captureSafety in
      // apps/daemon/src/analytics.ts. posthog-node-style manual enrichment:
      // the SDK auto-fills $os/$insert_id for posthog-js but not for server
      // emits, and dashboards filter on env / event_schema_version.
      event_id: insertId,
      event_schema_version: EVENT_SCHEMA_VERSION,
      env: resolveTelemetryEnv(),
      device_id: args.distinctId,
      client_type: CLIENT_TYPE,
      capture_source: CAPTURE_SOURCE,
      ui_version: appVersion,
      $os: osName(),
      $os_version: release(),
      $insert_id: insertId,
    },
    timestamp: now(),
  });

  const send = (async () => {
    try {
      await fetchImpl(`${host}/capture/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    } catch {
      // analytics failure must never look like a product error
    }
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  await Promise.race([send, timeout]);
  if (timer) clearTimeout(timer);
}

export interface ReportStartupFailureArgs {
  error: unknown;
  isPathAccess: boolean;
  posthogKey: string | null;
  posthogHost: string | null;
  distinctId: string;
  appVersion: string | null;
  namespace: string;
  source: string;
}

export interface ReportDeps extends CaptureDeps {
  readLogTail?: (path: string) => Promise<string | null>;
}

// The single entry point index.ts's fatal-exit catch calls. Orchestrates
// classify → read log tail → parse error code → scrub → capture. Wrapped so it
// can NEVER become a new startup-failure source.
export async function reportStartupFailure(
  args: ReportStartupFailureArgs,
  deps: ReportDeps = {},
): Promise<void> {
  try {
    const classification = classifyStartupFailure(args.error, args.isPathAccess);
    let errorCode: string | undefined;
    let missingModule: string | undefined;
    if (classification.logPath) {
      const tail = await (deps.readLogTail ?? defaultReadLogTail)(classification.logPath);
      if (tail) {
        const parsed = parseDaemonLogTail(tail);
        errorCode = parsed.errorCode;
        missingModule = parsed.missingModule;
      }
    }
    const properties: Record<string, unknown> = {
      failure_kind: classification.failureKind,
      exit_code: classification.exitCode,
      signal: classification.signal,
      error_name: args.error instanceof Error ? args.error.name : "unknown",
      error_code: errorCode ?? null,
      missing_module: missingModule ?? null,
      // Structured fields only — no raw message/stack. Scrub the one path we do
      // send so a user's home dir never reaches PostHog.
      log_path: classification.logPath ? scrubUserPaths(classification.logPath) : null,
      app_version: args.appVersion,
      namespace: args.namespace,
      source: args.source,
      platform: process.platform,
    };
    await captureStartupFailure(
      {
        posthogKey: args.posthogKey,
        posthogHost: args.posthogHost,
        distinctId: args.distinctId,
        event: STARTUP_FAILURE_EVENT,
        properties,
      },
      { fetchImpl: deps.fetchImpl, timeoutMs: deps.timeoutMs, now: deps.now },
    );
  } catch {
    // Reporting a startup failure must NEVER itself break the exit path.
  }
}
