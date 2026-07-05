// @ts-nocheck
/** @module cli/ui/ui
 * Implements `od ui` CLI commands for GenUI surface interaction (list/show/respond/revoke/prefill).
 * Enables headless inspection and answering of UI surfaces created by agent runs or projects.
 */
import { cliDaemonUrl, parseFlags } from '../core/index.js';

/** Whitelist of string flags for `od ui` commands. */
const UI_STRING_FLAGS = new Set([
  'daemon-url',
  'run',
  'project',
  'value',
  'value-json',
  'plugin',
  'snapshot-id',
  'persist',
  'kind',
]);

/** Whitelist of boolean flags for `od ui` commands; --schema extracts JSON Schema only. */
const UI_BOOLEAN_FLAGS = new Set([
  'help',
  'h',
  'json',
  'skip',
  // Plan §6 Phase 2A.5 — `od ui show --schema` returns just the
  // surface's JSON Schema (or `null` when the surface declares
  // none). Lets a code agent inspect the contract before piping a
  // value back through `od ui respond --value-json`.
  'schema',
]);

/**
 * Entry point for `od ui` subcommands (list/show/respond/revoke/prefill).
 * Routes to surface listing, inspection, or response handling.
 */
export async function runUi(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    printUiHelp();
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'list':    return runUiList(rest);
    case 'show':    return runUiShow(rest);
    case 'respond': return runUiRespond(rest);
    case 'revoke':  return runUiRevoke(rest);
    case 'prefill': return runUiPrefill(rest);
    default:
      console.error(`unknown subcommand: od ui ${sub}`);
      printUiHelp();
      process.exit(2);
  }
}

/** @internal Resolves daemon URL for ui subcommands. */
async function uiDaemonUrl(flags) {
  return cliDaemonUrl(flags);
}

/** @internal Lists GenUI surfaces for a run or project. */
async function runUiList(rest) {
  const flags = parseFlags(rest, { string: UI_STRING_FLAGS, boolean: UI_BOOLEAN_FLAGS });
  const base = (await uiDaemonUrl(flags)).replace(/\/$/, '');
  let url;
  if (flags.run) url = `${base}/api/runs/${encodeURIComponent(flags.run)}/genui`;
  else if (flags.project) url = `${base}/api/projects/${encodeURIComponent(flags.project)}/genui`;
  else {
    console.error('Usage: od ui list --run <runId> | --project <projectId>');
    process.exit(2);
  }
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`GET ${url} failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  const surfaces = Array.isArray(data?.surfaces) ? data.surfaces : [];
  if (surfaces.length === 0) {
    console.log('No GenUI surfaces.');
    return;
  }
  for (const s of surfaces) {
    console.log(`${s.surfaceId}  kind=${s.kind}  persist=${s.persist}  status=${s.status}  rowId=${s.id}`);
  }
}

/** @internal Reads a single surface (kind/schema/value); --schema prints JSON Schema only. */
async function runUiShow(rest) {
  const flags = parseFlags(rest, { string: UI_STRING_FLAGS, boolean: UI_BOOLEAN_FLAGS });
  const positional = rest.filter((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.run
    && a !== flags.project
    && a !== flags.value
    && a !== flags['value-json']
    && a !== flags.plugin
    && a !== flags['snapshot-id']
    && a !== flags.persist
    && a !== flags.kind);
  const runId = flags.run ?? positional[0];
  const surfaceId = flags['snapshot-id'] ? null : positional[flags.run ? 0 : 1];
  if (!runId || !surfaceId) {
    console.error('Usage: od ui show --run <runId> <surfaceId>');
    process.exit(2);
  }
  const url = `${(await uiDaemonUrl(flags)).replace(/\/$/, '')}/api/runs/${encodeURIComponent(runId)}/genui/${encodeURIComponent(surfaceId)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`GET ${url} failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  // Plan §6 Phase 2A.5 — `--schema` prints the spec's JSON Schema
  // only (null if the surface declares none). Designed to feed
  // `od ui respond --value-json "$(...)"` in headless / agent flows.
  if (flags.schema) {
    const schema = data?.spec?.schema ?? null;
    process.stdout.write(JSON.stringify(schema, null, 2) + '\n');
    return;
  }
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

/** @internal Answers a pending surface with value, JSON, or skip. */
async function runUiRespond(rest) {
  const flags = parseFlags(rest, { string: UI_STRING_FLAGS, boolean: UI_BOOLEAN_FLAGS });
  const positional = rest.filter((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.run
    && a !== flags.project
    && a !== flags.value
    && a !== flags['value-json']
    && a !== flags.plugin
    && a !== flags['snapshot-id']
    && a !== flags.persist
    && a !== flags.kind);
  const runId = flags.run ?? positional[0];
  const surfaceId = positional[flags.run ? 0 : 1];
  if (!runId || !surfaceId) {
    console.error('Usage: od ui respond --run <runId> <surfaceId> [--value <text> | --value-json <json> | --skip]');
    process.exit(2);
  }
  let value = null;
  if (flags.skip) {
    // Skip translates to a null answer; daemon resolves the surface in
    // `resolved` state with `respondedBy: 'auto'`. Phase 2A keeps the
    // semantics simple; spec §10.3.4 onTimeout='skip' lands in Phase 4.
    value = null;
  } else if (typeof flags['value-json'] === 'string') {
    try { value = JSON.parse(flags['value-json']); } catch (err) {
      console.error(`--value-json must be valid JSON: ${err.message}`);
      process.exit(2);
    }
  } else if (typeof flags.value === 'string') {
    value = flags.value;
  }
  const url = `${(await uiDaemonUrl(flags)).replace(/\/$/, '')}/api/runs/${encodeURIComponent(runId)}/genui/${encodeURIComponent(surfaceId)}/respond`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value, respondedBy: 'user' }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error(`POST ${url} failed: ${resp.status} ${JSON.stringify(data)}`);
    process.exit(1);
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    console.log(`[ui] ${surfaceId} resolved (rowId=${data?.surface?.id})`);
  }
}

/** @internal Invalidates a cached project-tier answer. */
async function runUiRevoke(rest) {
  const flags = parseFlags(rest, { string: UI_STRING_FLAGS, boolean: UI_BOOLEAN_FLAGS });
  const positional = rest.filter((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.run
    && a !== flags.project
    && a !== flags.value
    && a !== flags['value-json']
    && a !== flags.plugin
    && a !== flags['snapshot-id']
    && a !== flags.persist
    && a !== flags.kind);
  const projectId = flags.project ?? positional[0];
  const surfaceId = positional[flags.project ? 0 : 1];
  if (!projectId || !surfaceId) {
    console.error('Usage: od ui revoke --project <projectId> <surfaceId>');
    process.exit(2);
  }
  const url = `${(await uiDaemonUrl(flags)).replace(/\/$/, '')}/api/projects/${encodeURIComponent(projectId)}/genui/${encodeURIComponent(surfaceId)}/revoke`;
  const resp = await fetch(url, { method: 'POST' });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error(`POST ${url} failed: ${resp.status} ${JSON.stringify(data)}`);
    process.exit(1);
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    console.log(`[ui] revoked ${data.invalidated} row(s)`);
  }
}

/** @internal Pre-answers a surface so the run never broadcasts it. */
async function runUiPrefill(rest) {
  const flags = parseFlags(rest, { string: UI_STRING_FLAGS, boolean: UI_BOOLEAN_FLAGS });
  const positional = rest.filter((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.run
    && a !== flags.project
    && a !== flags.value
    && a !== flags['value-json']
    && a !== flags.plugin
    && a !== flags['snapshot-id']
    && a !== flags.persist
    && a !== flags.kind);
  const projectId = flags.project ?? positional[0];
  const surfaceId = positional[flags.project ? 0 : 1];
  const snapshotId = flags['snapshot-id'];
  if (!projectId || !surfaceId || !snapshotId) {
    console.error('Usage: od ui prefill --project <projectId> --snapshot-id <id> <surfaceId> [--value <text> | --value-json <json>] [--persist run|conversation|project] [--kind form|choice|confirmation|oauth-prompt]');
    process.exit(2);
  }
  let value = null;
  if (typeof flags['value-json'] === 'string') {
    try { value = JSON.parse(flags['value-json']); } catch (err) {
      console.error(`--value-json must be valid JSON: ${err.message}`);
      process.exit(2);
    }
  } else if (typeof flags.value === 'string') {
    value = flags.value;
  }
  const url = `${(await uiDaemonUrl(flags)).replace(/\/$/, '')}/api/projects/${encodeURIComponent(projectId)}/genui/prefill`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      snapshotId,
      surfaceId,
      kind:    flags.kind ?? 'confirmation',
      persist: flags.persist ?? 'project',
      value,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error(`POST ${url} failed: ${resp.status} ${JSON.stringify(data)}`);
    process.exit(1);
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    console.log(`[ui] prefilled ${surfaceId} (rowId=${data?.surface?.id})`);
  }
}

/** @internal Prints usage for `od ui` commands. */
function printUiHelp() {
  console.log(`Usage:
  od ui list  --run <runId>                          List GenUI surfaces for a run.
  od ui list  --project <projectId>                  List GenUI surfaces for a project.
  od ui show  --run <runId> <surfaceId> [--schema]   Read a single surface (kind / schema / value). --schema prints just the JSON Schema.
  od ui respond --run <runId> <surfaceId> [--value <txt> | --value-json <json> | --skip]
                                                     Answer a pending surface from any process.
  od ui revoke --project <projectId> <surfaceId>     Invalidate a project-tier cached answer.
  od ui prefill --project <projectId> --snapshot-id <id> <surfaceId>
                [--value <text> | --value-json <json>] [--persist run|conversation|project]
                                                     Pre-answer a surface so the run never broadcasts it.

Common options:
  --daemon-url <url>   Open Design daemon HTTP base (default OD_DAEMON_URL, OD_SIDECAR_IPC_PATH discovery, or http://127.0.0.1:7456).
  --json               Emit raw JSON (suitable for scripts) instead of human-readable output.`);
}
