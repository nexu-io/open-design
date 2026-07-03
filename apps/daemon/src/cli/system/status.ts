// @ts-nocheck
/** @module cli/system/status
 * Implements `od status`, `od diagnostics export`, `od version`, and `od doctor` commands.
 * Provides daemon health checks, diagnostic bundle export, version reporting, and plugin audits.
 */
import { LIBRARY_BOOLEAN_FLAGS, LIBRARY_STRING_FLAGS, exitWithStructuredError, libraryDaemonUrl, parseFlags, structuredHttpFailure } from '../core/index.js';
import { CONFIG_BOOLEAN_FLAGS, CONFIG_STRING_FLAGS } from './config.js';
import { runDaemon } from './daemon.js';

/** Whitelist of string flags for `od diagnostics export`. */
const DIAGNOSTICS_STRING_FLAGS = new Set(['daemon-url', 'output']);

/** Whitelist of boolean flags for `od diagnostics export`. */
const DIAGNOSTICS_BOOLEAN_FLAGS = new Set(['help', 'h', 'json']);

/**
 * Alias of `od daemon status`: fetches and prints the daemon runtime snapshot.
 * Delegates to `runDaemon(['status', ...args])`.
 */
export async function runStatus(args) {
  // Alias of `od daemon status`.
  return runDaemon(['status', ...args]);
}

/**
 * Exports a diagnostics bundle (logs, machine info, crash reports) to zip.
 * Matches the Settings → About → Export diagnostics surface.
 */
export async function runDiagnostics(args) {
  const sub = args[0];
  if (!sub || sub === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od diagnostics export [<path>] [--output <path>] [--json] [--daemon-url <url>]

Bundles daemon/web/desktop logs, machine info, and recent crash reports
into a zip. The bundle is the same one Settings → About → Export
diagnostics produces.

  <path>                 Where to write the zip. Defaults to
                         ./open-design-diagnostics-<timestamp>.zip in the
                         current working directory. Alias: --output <path>.
  --json                 Print {path, sizeBytes} on stdout instead of a
                         human-readable summary. The file is still written
                         to <path>.
  --daemon-url <url>     Override the daemon HTTP base URL.`);
    process.exit(0);
  }
  if (sub !== 'export') {
    console.error(`unknown subcommand: od diagnostics ${sub}`);
    process.exit(2);
  }

  const flags = parseFlags(args.slice(1), {
    string: DIAGNOSTICS_STRING_FLAGS,
    boolean: DIAGNOSTICS_BOOLEAN_FLAGS,
  });
  const positional = args.slice(1).filter((a) => !a.startsWith('-'));
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');

  const { DIAGNOSTICS_EXPORT_PATH, DIAGNOSTICS_FILENAME_PREFIX, diagnosticsFileName } =
    await import('@open-design/diagnostics');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const explicitOutput = typeof flags.output === 'string' && flags.output.length > 0
    ? flags.output
    : positional[0];
  const targetPath = path.resolve(explicitOutput ?? diagnosticsFileName(DIAGNOSTICS_FILENAME_PREFIX));

  let resp;
  try {
    resp = await fetch(`${base}${DIAGNOSTICS_EXPORT_PATH}`);
  } catch (err) {
    return exitWithStructuredError({
      code:    'daemon-not-running',
      message: `Cannot reach daemon at ${base}: ${err?.message ?? err}`,
    });
  }
  if (!resp.ok) return structuredHttpFailure(resp);

  const buf = Buffer.from(await resp.arrayBuffer());
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buf);

  if (flags.json) {
    process.stdout.write(JSON.stringify({ path: targetPath, sizeBytes: buf.length }) + '\n');
    return;
  }
  console.log(`Wrote diagnostics bundle to ${targetPath} (${buf.length} bytes).`);
}

/**
 * Prints the daemon version.
 * Fetches from /api/version and formats for human or JSON output.
 */
export async function runVersion(args) {
  const flags = parseFlags(args, { string: LIBRARY_STRING_FLAGS, boolean: LIBRARY_BOOLEAN_FLAGS });
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  let resp;
  try {
    resp = await fetch(`${base}/api/version`);
  } catch (err) {
    return exitWithStructuredError({
      code:    'daemon-not-running',
      message: `Cannot reach daemon at ${base}: ${err?.message ?? err}`,
    });
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  const version = typeof data?.version === 'string'
    ? data.version
    : (data?.version?.version ?? JSON.stringify(data));
  console.log(version);
}

/**
 * Audits daemon, plugins, skills, design systems, and atoms for health issues.
 * Runs per-plugin doctor checks and reports error/warning/info severity.
 * Exit code 0 when all ok, non-zero when any plugin or daemon check fails.
 */
export async function runDoctor(args) {
  const flags = parseFlags(args, { string: CONFIG_STRING_FLAGS, boolean: CONFIG_BOOLEAN_FLAGS });
  if (flags.help || flags.h) {
    console.log(`Usage:
  od doctor [--json]   Print a daemon + plugin + design-library health summary.

Exit code is non-zero when any installed plugin's doctor returns ok=false
or the daemon cannot be reached.`);
    process.exit(0);
  }
  const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
  const report = {
    daemon:        null,
    plugins:       [],
    skills:        [],
    designSystems: [],
    atoms:         [],
    issues:        [],
  };

  // Daemon status
  try {
    const resp = await fetch(`${base}/api/daemon/status`);
    if (!resp.ok) {
      report.issues.push({ severity: 'error', code: 'daemon-status', message: `HTTP ${resp.status}` });
    } else {
      report.daemon = await resp.json();
    }
  } catch (err) {
    report.issues.push({ severity: 'error', code: 'daemon-not-running', message: String(err?.message ?? err) });
    if (flags.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      console.error('[doctor] daemon unreachable:', String(err?.message ?? err));
    }
    process.exit(64);
  }

  // Library inventory
  try {
    const [skillsResp, dsResp, atomsResp] = await Promise.all([
      fetch(`${base}/api/skills`),
      fetch(`${base}/api/design-systems`),
      fetch(`${base}/api/atoms`),
    ]);
    if (skillsResp.ok) {
      const data = await skillsResp.json();
      report.skills = data?.skills ?? [];
    }
    if (dsResp.ok) {
      const data = await dsResp.json();
      report.designSystems = data?.designSystems ?? [];
    }
    if (atomsResp.ok) {
      const data = await atomsResp.json();
      report.atoms = data?.atoms ?? [];
    }
  } catch (err) {
    report.issues.push({ severity: 'warn', code: 'library-list-failed', message: String(err?.message ?? err) });
  }

  // Plugin doctor — runs the daemon's per-plugin check on every install.
  try {
    const listResp = await fetch(`${base}/api/plugins`);
    if (listResp.ok) {
      const list = await listResp.json();
      const plugins = list?.plugins ?? [];
      for (const p of plugins) {
        try {
          const doctorResp = await fetch(`${base}/api/plugins/${encodeURIComponent(p.id)}/doctor`, { method: 'POST' });
          const data = await doctorResp.json().catch(() => ({}));
          report.plugins.push({ id: p.id, version: p.version, ok: !!data?.ok, issues: data?.issues ?? [] });
          if (!data?.ok) {
            report.issues.push({
              severity: 'error',
              code:     'plugin-doctor-failed',
              message:  `${p.id}@${p.version}: ${(data?.issues ?? []).map((i) => i.code).join(', ')}`,
            });
          }
        } catch (err) {
          report.issues.push({
            severity: 'warn',
            code:     'plugin-doctor-error',
            message:  `${p.id}: ${err?.message ?? err}`,
          });
        }
      }
    }
  } catch (err) {
    report.issues.push({ severity: 'warn', code: 'plugin-list-failed', message: String(err?.message ?? err) });
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    console.log(`[doctor] daemon ${report.daemon?.bindHost ?? '?'}:${report.daemon?.port ?? '?'} pid=${report.daemon?.pid ?? '?'}`);
    console.log(`[doctor] plugins: ${report.plugins.length} (skills ${report.skills.length}, design-systems ${report.designSystems.length}, atoms ${report.atoms.length})`);
    if (report.issues.length === 0) {
      console.log('[doctor] no issues');
    } else {
      for (const i of report.issues) {
        console.log(`  [${i.severity}] ${i.code}: ${i.message}`);
      }
    }
  }
  const hasError = report.issues.some((i) => i.severity === 'error');
  process.exit(hasError ? 1 : 0);
}
