// @ts-nocheck
/** @module cli/system/daemon
 * Implements `od daemon` (start/status/stop/db) lifecycle and diagnostics commands.
 * Handles daemon process startup, health checks, and SQLite maintenance.
 */
import { startDaemonRuntime } from '../../daemon-startup.js';
import { cliDaemonBaseUrl, exitWithStructuredError, libraryDaemonUrl, parseFlags, structuredHttpFailure } from '../core/index.js';

/** Whitelist of string flags for `od daemon` commands. */
const DAEMON_STRING_FLAGS = new Set([
  'daemon-url', 'port', 'host',
]);

/** Whitelist of boolean flags for `od daemon` commands. */
const DAEMON_BOOLEAN_FLAGS = new Set([
  'help', 'h', 'json', 'headless', 'serve-web', 'no-open',
]);

/**
 * Entry point for `od daemon` subcommands (start/status/stop/db).
 * Routes daemon lifecycle and database inspection operations.
 */
export async function runDaemon(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od daemon start [--headless] [--serve-web] [--port <n>] [--host <addr>] [--no-open]
                                          Start the daemon (Phase 1.5 headless mode).
  od daemon status [--json] [--daemon-url <url>]
                                          Print the daemon's runtime snapshot.
  od daemon stop   [--daemon-url <url>]   Send a graceful shutdown signal.
  od daemon db     status                 Print SQLite path + size + table row counts.
  od daemon db     verify [--quick]       Run integrity_check + foreign_key_check.
  od daemon db     vacuum                 Run SQLite VACUUM to reclaim space after deletes.

Common options:
  --daemon-url <url>   Open Design daemon HTTP base.
  --headless           No browser auto-open; aliased --no-open.
  --serve-web          Serve the web UI over the existing port (no electron).
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: DAEMON_STRING_FLAGS, boolean: DAEMON_BOOLEAN_FLAGS });
  switch (sub) {
    case 'start':   return runDaemonStart(flags);
    case 'status':  return runDaemonStatus(flags);
    case 'stop':    return runDaemonStop(flags);
    case 'db':      return runDaemonDb(rest, flags);
    default:
      console.error(`unknown subcommand: od daemon ${sub}`);
      process.exit(2);
  }
}

// Plan §3.GG1 — `od daemon db status`. Prints a SQLite inventory
// (file path, size on disk, schema version, per-table row counts).
/** @internal Handles `od daemon db` subcommands (status/verify/vacuum). */
async function runDaemonDb(rest, flags) {
  const sub = rest[0];
  if (!sub || sub === 'help' || rest.includes('--help') || rest.includes('-h')) {
    console.log(`Usage:
  od daemon db status [--json] [--daemon-url <url>]
  od daemon db verify [--quick] [--json] [--daemon-url <url>]
  od daemon db vacuum [--json] [--daemon-url <url>]

status:
  Prints a structured inventory of the daemon's SQLite backend:
    - file path (under .od/ by default; OD_DATA_DIR overrides)
    - size on disk (primary + WAL + SHM)
    - schema version (user_version PRAGMA)
    - per-table row counts (system tables excluded)

verify:
  Runs SQLite PRAGMA integrity_check (or quick_check with --quick)
  + foreign_key_check, returns a structured issues[] report.
  Exit 0 when ok=true, 4 when any issue is found.

vacuum:
  Runs SQLite VACUUM to reclaim space after large delete batches
  (snapshot prune, plugin uninstall, etc.). Reports before/after
  sizes + elapsed ms.`);
    process.exit(sub ? 0 : 2);
  }
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  if (sub === 'vacuum') {
    const resp = await fetch(`${base}/api/daemon/db/vacuum`, { method: 'POST' });
    if (!resp.ok) {
      console.error(`POST /api/daemon/db/vacuum failed: ${resp.status} ${await resp.text()}`);
      process.exit(1);
    }
    const data = await resp.json();
    if (flags.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    console.log(`[db vacuum] reclaimed ${formatBytes(data.reclaimedBytes ?? 0)} (`
      + `${formatBytes(data.beforeBytes ?? 0)} \u2192 ${formatBytes(data.afterBytes ?? 0)}, `
      + `${data.elapsedMs ?? 0}ms)`);
    return;
  }
  if (sub === 'verify') {
    const verifyFlags = parseFlags(rest.slice(1), {
      string:  new Set(['daemon-url']),
      boolean: new Set(['help', 'h', 'json', 'quick']),
    });
    const url = `${base}/api/daemon/db/verify${verifyFlags.quick ? '?quick=1' : ''}`;
    const resp = await fetch(url, { method: 'POST' });
    if (!resp.ok) {
      console.error(`POST ${url} failed: ${resp.status} ${await resp.text()}`);
      process.exit(1);
    }
    const data = await resp.json();
    if (flags.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    } else {
      const issueCount = Array.isArray(data.issues) ? data.issues.length : 0;
      console.log(`[db verify] mode=${data.mode}  ok=${data.ok}  issues=${issueCount}  ${data.elapsedMs ?? 0}ms`);
      if (issueCount > 0) {
        for (const issue of data.issues) {
          console.error(`  [${issue.kind}] ${issue.message}`);
        }
      }
    }
    process.exit(data.ok ? 0 : 4);
  }
  if (sub !== 'status') {
    console.error(`unknown subcommand: od daemon db ${sub}`);
    process.exit(2);
  }
  const resp = await fetch(`${base}/api/daemon/db`);
  if (!resp.ok) {
    console.error(`GET /api/daemon/db failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  console.log(`# Daemon DB`);
  console.log(`  kind:           ${data.kind ?? 'unknown'}`);
  console.log(`  location:       ${data.location ?? '?'}`);
  console.log(`  size on disk:   ${formatBytes(data.sizeBytes ?? 0)}`);
  console.log(`  schema version: ${data.schemaVersion ?? '(none)'}`);
  console.log(`  tables:`);
  const tables = Array.isArray(data.tables) ? data.tables : [];
  if (tables.length === 0) {
    console.log('    (none)');
  } else {
    const longest = Math.max(...tables.map((t) => t.name.length));
    for (const t of tables) {
      console.log(`    ${t.name.padEnd(longest)}  ${t.rowCount}`);
    }
  }
}

/** @internal Formats byte counts as human-readable sizes (B/KiB/MiB/GiB). */
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

/** @internal Starts the daemon runtime with optional browser/headless mode. */
async function runDaemonStart(flags) {
  const port = Number(flags.port ?? process.env.OD_PORT ?? 7456);
  const host = String(flags.host ?? process.env.OD_BIND_HOST ?? '127.0.0.1').trim() || '127.0.0.1';
  const headless = Boolean(flags.headless || flags['no-open'] || flags['serve-web']);
  const runtime = await startDaemonRuntime({
    host,
    logListening: false,
    openBrowser: !headless,
    port,
  });
  console.log(`[od] listening on ${runtime.url} (${headless ? 'headless' : 'desktop'})`);

  await new Promise((resolve) => {
    let shuttingDown = false;
    const stop = () => {
      if (shuttingDown) process.exit(0);
      shuttingDown = true;
      void runtime.stop().finally(() => {
        cleanup();
        resolve();
      });
    };
    const cleanup = () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}

/** @internal Fetches and displays daemon runtime snapshot. */
async function runDaemonStatus(flags) {
  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/daemon/status`);
  } catch (err) {
    return exitWithStructuredError({
      code:    'daemon-not-running',
      message: `Cannot reach daemon at ${base}: ${err?.message ?? err}`,
    });
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  console.log(`[daemon] ${data.bindHost}:${data.port} v${data.version} pid=${data.pid} plugins=${data.installedPlugins}`);
}

/** @internal Sends graceful shutdown signal to the daemon. */
async function runDaemonStop(flags) {
  const base = await cliDaemonBaseUrl(flags);
  let resp;
  try {
    resp = await fetch(`${base}/api/daemon/shutdown`, { method: 'POST' });
  } catch (err) {
    return exitWithStructuredError({
      code:    'daemon-not-running',
      message: `Cannot reach daemon at ${base}: ${err?.message ?? err}`,
    });
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  console.log(`[daemon] shutdown scheduled`);
}
