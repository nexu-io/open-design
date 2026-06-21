import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
// node-pty is a native module; its TypeScript types resolve after
// `pnpm install` compiles the addon. The dynamic import keeps the daemon
// bootable even on a platform where the prebuilt binary is missing — a
// terminal create that can't load the addon fails the single request
// instead of crashing the process at module-eval time.
import type * as NodePty from 'node-pty';

/**
 * Resolve the candidate paths to node-pty's `spawn-helper` binary. On
 * macOS/Linux, `pty.fork` shells out to this helper via `posix_spawn`; node-pty
 * looks for the native artifacts under `build/Release` first and a
 * platform-tagged `prebuilds/<platform>-<arch>` dir second (see its
 * `loadNativeModule`). We return both so the executable-bit repair below covers
 * whichever one a given install produced. Empty on win32 (ConPTY has no helper)
 * or when node-pty can't be resolved at all.
 */
export function spawnHelperCandidatePaths(): string[] {
  if (process.platform === 'win32') return [];
  let pkgRoot: string;
  try {
    // `node-pty`'s "main" is `lib/index.js`, so the package root is two levels
    // up from the resolved entry. createRequire anchors resolution at this
    // module regardless of how the daemon is bundled/run.
    const require = createRequire(import.meta.url);
    pkgRoot = path.dirname(path.dirname(require.resolve('node-pty')));
  } catch {
    return [];
  }
  return [
    path.join(pkgRoot, 'build', 'Release', 'spawn-helper'),
    path.join(pkgRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
  ];
}

/**
 * Restore the executable bit on node-pty's `spawn-helper`.
 *
 * pnpm unpacks node-pty's prebuilt binaries into `prebuilds/<platform>-<arch>/`
 * with mode 0644 — and node-pty's own `post-install.js` only chmods files under
 * `build/Release`, which a prebuild-based install never creates. The result is a
 * non-executable `spawn-helper`, so the very first `pty.spawn()` dies with
 * "posix_spawnp failed." (surfaced to the user as "无法启动终端会话" / "Could not
 * start the terminal session"). Re-adding +x before the first fork makes the
 * terminal self-heal across reinstalls without depending on an install hook.
 *
 * Best-effort and idempotent: a missing file (addon not installed for this
 * platform) or a read-only filesystem (e.g. a packaged app bundle) is swallowed,
 * and the subsequent spawn surfaces the real error instead.
 */
export function ensureSpawnHelperExecutable(): void {
  for (const file of spawnHelperCandidatePaths()) {
    try {
      const stat = fs.statSync(file);
      // Owner already has the execute bit — nothing to repair.
      if (stat.mode & 0o100) continue;
      // OR in execute-for-all, preserving the existing read/write bits.
      fs.chmodSync(file, stat.mode | 0o111);
    } catch {
      // Candidate not present on this install, or fs is read-only: ignore and
      // let the spawn attempt report the underlying failure.
    }
  }
}

/**
 * In-memory interactive Terminal session manager. Mirrors the chat-run
 * lifecycle in `runs.ts`: each session keeps a bounded event ring-buffer so a
 * reattaching SSE client can replay recent scrollback after its
 * `Last-Event-ID`, then fans out live PTY output to every attached client.
 * Sessions are process-local and never persisted — closing the daemon kills
 * the PTYs (see `shutdownActive`).
 */

export const TERMINAL_SESSION_TERMINAL_STATUSES = new Set(['exited']);

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

function clampDimension(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  // PTY dimensions must be positive integers; clamp to a sane ceiling so a
  // hostile client can't ask node-pty for an absurd buffer allocation.
  return Math.min(Math.max(Math.trunc(n), 1), 1000);
}

/**
 * Resolve the shell binary for a new PTY. Honors an explicit request override,
 * then the user's environment (SHELL on posix, ComSpec on win32), and finally
 * falls back to a per-platform default.
 */
export function resolveShell(requested?: string | null): string {
  const explicit = typeof requested === 'string' && requested.trim() ? requested.trim() : null;
  if (explicit) return explicit;
  if (process.platform === 'win32') {
    return process.env.ComSpec || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

export interface CreateTerminalMeta {
  projectId?: string | null;
  cwd: string;
  cols?: number;
  rows?: number;
  shell?: string | null;
}

export function createTerminalService({
  // Count backstop for the per-session output ring-buffer. The real ceiling is
  // `maxBufferBytes` below; this only guards against a flood of tiny records.
  maxEvents = 2_000,
  // Byte ceiling for retained reattach scrollback per running session. Output
  // is evicted oldest-first (in one batched splice) once this is exceeded, so a
  // `cat largefile` can't grow a session's buffer without bound.
  maxBufferBytes = 512 * 1024,
  // After the shell exits we keep only this much trailing scrollback so an
  // exited-but-not-yet-reaped session doesn't pin megabytes for the TTL window.
  exitTailBytes = 64 * 1024,
  // Coalesce node-pty `onData` chunks for roughly one animation frame before
  // fanning out a single SSE `data` event. High-throughput output (builds,
  // `cat`) otherwise fires thousands of JSON.stringify + res.write per second
  // per client; batching collapses that to ~60/s. xterm.js buffers its own
  // writes, so a coarser event cadence is invisible to the user.
  flushIntervalMs = 16,
  // Flush immediately when buffered output crosses this size so a single burst
  // can't build an unbounded string or stall behind the frame timer.
  flushThresholdBytes = 64 * 1024,
  // Drop an exited session from the registry after this idle window so a
  // long-lived daemon doesn't leak terminated sessions.
  ttlMs = 30 * 60 * 1000,
  shutdownGraceMs = 3_000,
} = {}) {
  const sessions = new Map<string, any>();
  // Lazily loaded so a missing/uncompiled native addon only fails the first
  // create() instead of the whole daemon import.
  let ptyModule: typeof NodePty | null = null;

  const loadPty = async (): Promise<typeof NodePty> => {
    if (ptyModule) return ptyModule;
    // Repair the prebuilt spawn-helper's executable bit before the first fork;
    // otherwise spawn() fails with "posix_spawnp failed." on macOS/Linux.
    ensureSpawnHelperExecutable();
    ptyModule = (await import('node-pty')) as typeof NodePty;
    return ptyModule;
  };

  const scheduleCleanup = (session: any) => {
    setTimeout(() => {
      if (TERMINAL_SESSION_TERMINAL_STATUSES.has(session.status)) sessions.delete(session.id);
    }, ttlMs).unref?.();
  };

  const statusBody = (session: any) => ({
    id: session.id,
    projectId: session.projectId,
    cwd: session.cwd,
    shell: session.shell,
    cols: session.cols,
    rows: session.rows,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    exitCode: session.exitCode,
    signal: session.signal,
  });

  // Approximate the retained size of an event by its output payload. `data`
  // events dominate; control events (exit) are negligible.
  const recordByteLength = (data: any): number =>
    data && typeof data.data === 'string' ? data.data.length : 0;

  // Evict oldest events in a SINGLE splice once the running session is over the
  // byte (or count) cap, trimming down to ~75% so eviction is amortized instead
  // of an O(n) shift on every chunk. Always keeps at least the most recent event.
  const trimBuffer = (session: any) => {
    if (session.bufferedBytes <= maxBufferBytes && session.events.length <= maxEvents) return;
    const targetBytes = Math.floor(maxBufferBytes * 0.75);
    let dropCount = 0;
    let freed = 0;
    for (let i = 0; i < session.events.length - 1; i++) {
      const overBytes = session.bufferedBytes - freed > targetBytes;
      const overCount = session.events.length - dropCount > maxEvents;
      if (!overBytes && !overCount) break;
      freed += session.events[i].byteLength;
      dropCount++;
    }
    if (dropCount > 0) {
      session.events.splice(0, dropCount);
      session.bufferedBytes -= freed;
    }
  };

  const emit = (session: any, event: string, data: any) => {
    const id = session.nextEventId++;
    const byteLength = recordByteLength(data);
    const record = { id, event, data, timestamp: Date.now(), byteLength };
    session.events.push(record);
    session.bufferedBytes += byteLength;
    trimBuffer(session);
    session.updatedAt = record.timestamp;
    for (const sse of session.clients) sse.send(event, data, id);
    return record;
  };

  // Coalesce buffered PTY output into one `data` event. Called on the frame
  // timer, on a large burst, and right before `exit` so output ordering holds.
  const flushData = (session: any) => {
    if (session.flushTimer != null) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
    if (!session.pendingData) return;
    const chunk = session.pendingData;
    session.pendingData = '';
    emit(session, 'data', { data: chunk });
  };

  const finish = (session: any, code: number | null, signal: string | null) => {
    if (TERMINAL_SESSION_TERMINAL_STATUSES.has(session.status)) return;
    // Emit any output buffered behind the frame timer before the exit marker.
    flushData(session);
    session.status = 'exited';
    session.exitCode = code;
    session.signal = signal;
    session.updatedAt = Date.now();
    emit(session, 'exit', { code, signal });
    // Bound the memory an exited-but-not-yet-reaped session pins: keep only the
    // trailing scrollback (the exit event is last, so it's always retained).
    let keptBytes = 0;
    let firstKeep = session.events.length;
    for (let i = session.events.length - 1; i >= 0; i--) {
      firstKeep = i;
      keptBytes += session.events[i].byteLength;
      if (keptBytes >= exitTailBytes) break;
    }
    if (firstKeep > 0) {
      const dropped = session.events.splice(0, firstKeep);
      for (const r of dropped) session.bufferedBytes -= r.byteLength;
    }
    for (const sse of session.clients) sse.end();
    session.clients.clear();
    scheduleCleanup(session);
  };

  const create = async (meta: CreateTerminalMeta) => {
    const pty = await loadPty();
    const now = Date.now();
    const id = randomUUID();
    const cols = clampDimension(meta.cols, DEFAULT_COLS);
    const rows = clampDimension(meta.rows, DEFAULT_ROWS);
    const shell = resolveShell(meta.shell);
    const child = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols,
      rows,
      cwd: meta.cwd,
      env: { ...process.env } as Record<string, string>,
    });
    const session = {
      id,
      projectId: typeof meta.projectId === 'string' && meta.projectId ? meta.projectId : null,
      cwd: meta.cwd,
      shell,
      cols,
      rows,
      status: 'running' as 'running' | 'exited',
      createdAt: now,
      updatedAt: now,
      exitCode: null as number | null,
      signal: null as string | null,
      events: [] as Array<{ id: number; event: string; data: any; timestamp: number; byteLength: number }>,
      nextEventId: 1,
      clients: new Set<any>(),
      pty: child,
      // Output coalescing buffer (see flushData / the onData handler below).
      bufferedBytes: 0,
      pendingData: '',
      flushTimer: null as ReturnType<typeof setTimeout> | null,
    };
    sessions.set(id, session);
    child.onData((chunk: string) => {
      session.pendingData += chunk;
      // Flush a large burst immediately so the pending string and per-event
      // latency stay bounded; otherwise coalesce a frame's worth of chunks.
      if (session.pendingData.length >= flushThresholdBytes) {
        flushData(session);
        return;
      }
      if (session.flushTimer == null) {
        session.flushTimer = setTimeout(() => flushData(session), flushIntervalMs);
        session.flushTimer.unref?.();
      }
    });
    child.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
      // node-pty hands back a numeric signal; surface a name when we can
      // resolve it (SIGTERM is the only one we send), otherwise null.
      finish(session, exitCode ?? null, signal ? signalName(signal) : null);
    });
    return session;
  };

  const get = (id: string) => sessions.get(id) ?? null;

  const list = ({ projectId }: { projectId?: string | null } = {}) =>
    Array.from(sessions.values()).filter((session) => {
      if (typeof projectId === 'string' && projectId && session.projectId !== projectId) return false;
      return true;
    });

  const stream = (session: any, req: any, res: any, createSseResponse: (res: any) => any) => {
    const sse = createSseResponse(res);
    const lastEventId = Number(req.get('Last-Event-ID') || req.query.after || 0);
    let sent = 0;
    for (const record of session.events) {
      if (!Number.isFinite(lastEventId) || record.id > lastEventId) {
        sse.send(record.event, record.data, record.id);
        sent++;
      }
    }
    if (TERMINAL_SESSION_TERMINAL_STATUSES.has(session.status)) {
      // Guarantee a reattaching client sees the terminal `exit` even if its
      // cursor is already past the final event id, mirroring runs.ts.
      if (sent === 0 && session.events.length > 0) {
        const last = session.events[session.events.length - 1];
        sse.send(last.event, last.data, last.id);
      }
      sse.end();
      return;
    }
    session.clients.add(sse);
    res.on('close', () => {
      session.clients.delete(sse);
      sse.cleanup();
    });
  };

  const write = (session: any, input: string) => {
    if (TERMINAL_SESSION_TERMINAL_STATUSES.has(session.status)) return false;
    try {
      session.pty.write(input);
      return true;
    } catch {
      return false;
    }
  };

  const resize = (session: any, cols: number, rows: number) => {
    if (TERMINAL_SESSION_TERMINAL_STATUSES.has(session.status)) return false;
    const nextCols = clampDimension(cols, session.cols);
    const nextRows = clampDimension(rows, session.rows);
    try {
      session.pty.resize(nextCols, nextRows);
      session.cols = nextCols;
      session.rows = nextRows;
      session.updatedAt = Date.now();
      return true;
    } catch {
      return false;
    }
  };

  const kill = (session: any, signal: string = 'SIGTERM') => {
    if (TERMINAL_SESSION_TERMINAL_STATUSES.has(session.status)) return false;
    try {
      session.pty.kill(signal);
      return true;
    } catch {
      // If the kill throws, force the terminal state so clients unblock.
      finish(session, null, signal);
      return false;
    }
  };

  const shutdownActive = async ({ graceMs = shutdownGraceMs }: { graceMs?: number } = {}) => {
    const active = Array.from(sessions.values()).filter(
      (session) => !TERMINAL_SESSION_TERMINAL_STATUSES.has(session.status),
    );
    for (const session of active) {
      try { session.pty.kill('SIGTERM'); } catch { /* best-effort */ }
      finish(session, null, 'SIGTERM');
    }
    // Give children a grace window to actually exit before the daemon goes.
    if (active.length > 0 && graceMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(graceMs, 1000)).unref?.());
    }
  };

  return {
    create,
    get,
    list,
    stream,
    write,
    resize,
    kill,
    shutdownActive,
    statusBody,
    isTerminal(status: string) {
      return TERMINAL_SESSION_TERMINAL_STATUSES.has(status);
    },
  };
}

// Map the numeric signal node-pty reports on exit back to a name. We only
// ever send SIGTERM ourselves; anything else falls back to a generic label.
function signalName(signal: number): string {
  const entry = Object.entries(os.constants.signals).find(([, value]) => value === signal);
  return entry ? entry[0] : `SIG${signal}`;
}
