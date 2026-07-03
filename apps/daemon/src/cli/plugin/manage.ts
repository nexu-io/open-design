// @ts-nocheck
/** @module cli/plugin/manage
 * Core `od plugin` subcommand router and list/install/apply/trust workflows.
 * Collaborators: publish.ts (login/publish), verify.ts (doctor/simulate/canon), dev.ts (scaffold/validate/pack).
 * Invariant: flag whitelist (PLUGIN_*_FLAGS) is enforced before any daemon call to fail-fast on misspelled flags.
 */
import { cliDaemonUrl, coerceCliValue, exitWithStructuredError, parseFlags, streamRunEvents, structuredHttpFailure } from '../core/index.js';
import { runPluginExport, runPluginPack, runPluginScaffold, runPluginValidate } from './dev.js';
import { resolveMarketplacePluginFromList } from './marketplace.js';
import { runPluginLogin, runPluginOpenDesignPr, runPluginPublish, runPluginPublishRepo, runPluginWhoami, runPluginYank } from './publish.js';
import { runPluginCanon, runPluginDiff, runPluginReplay, runPluginSimulate, runPluginSnapshots, runPluginVerify } from './verify.js';

/**
 * Whitelist of valid string flag names for plugin commands.
 * Unknown flags cause immediate parse failure (Plan §3.Y1).
 * Enables CLI agents to catch typos before reaching daemon HTTP layer.
 * @internal
 */
export const PLUGIN_STRING_FLAGS = new Set([
  'daemon-url',
  'source',
  'inputs',
  'project',
  'conversation',
  'message',
  'agent',
  'model',
  'snapshot-id',
  'capabilities',
  'grant-caps',
  'before',
  'trust',
  'tag',
  'policy',
  'version',
  'reason',
  'catalog',
  'host',
  'name',
]);

/**
 * Whitelist of valid boolean flag names for plugin commands.
 * Paired with PLUGIN_STRING_FLAGS for strict flag validation.
 * @internal
 */
export const PLUGIN_BOOLEAN_FLAGS = new Set([
  'help',
  'h',
  'json',
  'revoke',
  'follow',
  'strict',
]);

/**
 * Whitelist of filters for list/search (extends PLUGIN_STRING_FLAGS with task-kind/mode/tag/trust).
 * @internal
 */
const PLUGIN_LIST_FILTER_FLAGS = new Set([
  ...PLUGIN_STRING_FLAGS,
  'task-kind', 'mode', 'tag', 'trust',
]);

/**
 * Whitelist of boolean filters for list/search (extends PLUGIN_BOOLEAN_FLAGS with bundled/no-bundled).
 * @internal
 */
const PLUGIN_LIST_BOOLEAN_FLAGS = new Set([
  ...PLUGIN_BOOLEAN_FLAGS,
  'bundled', 'no-bundled',
]);

/**
 * Main entry point: routes `od plugin <subcommand> [args]` to 30+ handlers.
 * Subcommands: list, search, stats, sources, info, manifest, install, upgrade,
 * uninstall, apply, duplicate, canon, diff, doctor, replay, trust, snapshots,
 * simulate, verify, events, run, scaffold, validate, pack, candidates,
 * login, whoami, export, publish, publish-repo, open-design-pr, yank.
 * @param args Raw argv slice after 'plugin'
 */
export async function runPlugin(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    printPluginHelp();
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'list':      return runPluginList(rest);
    case 'search':    return runPluginSearch(rest);
    case 'stats':     return runPluginStats(rest);
    case 'sources':   return runPluginSources(rest);
    case 'info':      return runPluginInfo(rest);
    case 'manifest':  return runPluginManifest(rest);
    case 'install':   return runPluginInstall(rest);
    case 'upgrade':   return runPluginUpgrade(rest);
    case 'uninstall': return runPluginUninstall(rest);
    case 'apply':     return runPluginApply(rest);
    case 'duplicate': return runPluginDuplicate(rest);
    case 'canon':     return runPluginCanon(rest);
    case 'diff':      return runPluginDiff(rest);
    case 'doctor':    return runPluginDoctor(rest);
    case 'replay':    return runPluginReplay(rest);
    case 'trust':     return runPluginTrust(rest);
    case 'snapshots': return runPluginSnapshots(rest);
    case 'simulate':  return runPluginSimulate(rest);
    case 'verify':    return runPluginVerify(rest);
    case 'events':    return runPluginEvents(rest);
    case 'run':       return runPluginRun(rest);
    case 'scaffold': return runPluginScaffold(rest);
    case 'validate': return runPluginValidate(rest);
    case 'pack':     return runPluginPack(rest);
    case 'candidates': return runPluginCandidates(rest);
    case 'login':    return runPluginLogin(rest);
    case 'whoami':   return runPluginWhoami(rest);
    case 'export':   return runPluginExport(rest);
    case 'publish':  return runPluginPublish(rest);
    case 'publish-repo': return runPluginPublishRepo(rest);
    case 'open-design-pr': return runPluginOpenDesignPr(rest);
    case 'yank':     return runPluginYank(rest);
    default:
      console.error(`unknown subcommand: od plugin ${sub}`);
      printPluginHelp();
      process.exit(2);
  }
}

// Plan §3.B3: `od plugin run <id>` shorthand. Today this is a thin
// wrapper around `od plugin apply` + `POST /api/runs` so a code agent
// can drive the apply→start→follow loop without two hops.
/**
 * `od plugin run <id> --project <projectId> [--inputs <json>] [--follow]`
 * Shorthand: apply → POST /api/runs → [stream events]. Phase 1.5 wrapper (spec §3.B3).
 * Honors --grant-caps for capability promotion; exits 66 on capabilities-required (spec §9.1).
 * @internal
 */
async function runPluginRun(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const id = rest.find((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.source
    && a !== flags.inputs
    && a !== flags.project
    && a !== flags.conversation
    && a !== flags.message
    && a !== flags.agent
    && a !== flags.model
    && a !== flags['snapshot-id']
    && a !== flags.capabilities
    && a !== flags['grant-caps']);
  if (!id) {
    console.error('Usage: od plugin run <id> --project <projectId> [--inputs <json>] [--agent <id>] [--message "<text>"] [--grant-caps a,b] [--follow]');
    process.exit(2);
  }
  if (!flags.project) {
    console.error('--project <projectId> is required (Phase 1.5 will add the auto-create wrapper)');
    process.exit(2);
  }
  const inputs = flags.inputs ? safeParseJson(flags.inputs) ?? {} : {};
  const grantCaps = typeof flags['grant-caps'] === 'string' && flags['grant-caps'].length > 0
    ? flags['grant-caps'].split(',').map((c) => c.trim()).filter(Boolean)
    : [];
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  // 1. Apply (returns ApplyResult + manifestSourceDigest).
  const applyResp = await fetch(`${base}/api/plugins/${encodeURIComponent(id)}/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inputs, grantCaps, projectId: flags.project }),
  });
  const applyData = await applyResp.json().catch(() => ({}));
  if (!applyResp.ok) {
    console.error(`apply failed: ${applyResp.status} ${JSON.stringify(applyData)}`);
    process.exit(applyResp.status === 422 ? 67 : 1);
  }
  // 2. Start the run with pluginId so the daemon resolver pins the
  //    snapshot to the run object.
  const runResp = await fetch(`${base}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId:        flags.project,
      pluginId:         id,
      pluginInputs:     inputs,
      grantCaps,
      ...(flags.conversation ? { conversationId: flags.conversation } : {}),
      ...(flags.message ? { message: flags.message } : {}),
      ...(flags.agent ? { agentId: flags.agent } : {}),
      ...(flags.model ? { model: flags.model } : {}),
      ...(flags['snapshot-id'] ? { appliedPluginSnapshotId: flags['snapshot-id'] } : {}),
    }),
  });
  const runData = await runResp.json().catch(() => ({}));
  if (!runResp.ok) {
    if (runResp.status === 409 && runData?.error?.code === 'capabilities-required') {
      const missing = (runData.error.data?.missing ?? []).join(',');
      console.error(`[run] capabilities required: ${missing}`);
      console.error(`[run] retry with --grant-caps ${missing} or run \`od plugin trust ${id} --capabilities ${missing}\``);
      process.exit(66);
    }
    console.error(`run failed: ${runResp.status} ${JSON.stringify(runData)}`);
    process.exit(1);
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify({ apply: applyData, run: runData }, null, 2) + '\n');
    if (flags.follow) await streamRunEvents(base, runData.runId);
    return;
  }
  console.log(`[run] started run ${runData.runId} (snapshot ${runData.appliedPluginSnapshotId ?? applyData?.appliedPlugin?.snapshotId ?? 'n/a'})`);
  if (flags.follow) {
    await streamRunEvents(base, runData.runId);
  }
}

/**
 * Resolves daemon URL from --daemon-url flag, OD_DAEMON_URL env, OD_SIDECAR_IPC_PATH discovery,
 * or default http://127.0.0.1:7456. Wrapper around cliDaemonUrl() for plugin-specific context.
 * @param flags Parsed command flags
 * @returns HTTP base URL (without trailing /)
 */
export async function pluginDaemonUrl(flags) {
  return cliDaemonUrl(flags);
}

// Plan §3.Y1 — filter knobs on `od plugin list` (and feeds
// `od plugin search` below). Recognising these as string flags
// keeps the parseFlags() argv consumer happy.
/**
 * List installed plugins with AND-combined filters (--task-kind, --mode, --tag, --trust, --bundled).
 * Delegates to searchInstalledPlugins() for ranking/matching. Output: compact or --json.
 */
async function runPluginList(rest) {
  const flags = parseFlags(rest, {
    string:  PLUGIN_LIST_FILTER_FLAGS,
    boolean: PLUGIN_LIST_BOOLEAN_FLAGS,
  });
  if (flags.help || flags.h) {
    console.log(`Usage:
  od plugin list [--task-kind <kind>] [--mode <mode>] [--tag <tag>] \\
                 [--trust <tier>] [--bundled | --no-bundled] [--json]

Lists installed plugins. Filters AND together: --task-kind=code-migration
+ --tag=phase-7 returns only code-migration plugins tagged 'phase-7'.

  --task-kind   Match od.taskKind (new-generation / figma-migration /
                code-migration / tune-collab).
  --mode        Match od.mode.
  --tag         Match an entry in tags[].
  --trust       Match trust tier (trusted / restricted / bundled).
  --bundled     Restrict to bundled plugins (sourceKind='bundled' OR
                trust='bundled').
  --no-bundled  Exclude bundled plugins.`);
    process.exit(0);
  }
  const data = await fetchPluginList(flags);
  const filtered = await applyPluginFilters(data?.plugins ?? [], flags);
  emitPluginList({ entries: filtered, json: !!flags.json, emptyMessage: 'No plugins matched the filter.' });
}

// Plan §3.Y1 — `od plugin search <query>`.
/**
 * Free-text search: case-insensitive substring match on id/title/description/tags.
 * Combines with same filters as list (spec §3.Y1).
 */
async function runPluginSearch(rest) {
  const flags = parseFlags(rest, {
    string:  PLUGIN_LIST_FILTER_FLAGS,
    boolean: PLUGIN_LIST_BOOLEAN_FLAGS,
  });
  const positional = rest.filter((a) => !a.startsWith('-'));
  const query = positional[0];
  if (flags.help || flags.h || !query) {
    console.log(`Usage:
  od plugin search <query> [--task-kind <kind>] [--mode <mode>] \\
                           [--tag <tag>] [--trust <tier>] \\
                           [--bundled | --no-bundled] [--json]

Free-text search across installed plugins. Matches case-insensitively
on id / title / description / tags. Combines with the same filter
flags as 'od plugin list'.`);
    process.exit(query ? 0 : 2);
  }
  const data = await fetchPluginList(flags);
  const filtered = await applyPluginFilters(data?.plugins ?? [], flags, query);
  emitPluginList({
    entries: filtered,
    json:    !!flags.json,
    emptyMessage: `No installed plugins matched "${query}".`,
    showRank: true,
  });
}

// Plan §3.DD1 — `od plugin stats`. Pretty-prints the
// pluginInventoryStats + snapshotInventoryStats aggregation. The
// daemon-side route owns the SQLite reads; the CLI is a thin
// formatter.
/**
 * Aggregate inventory report: plugin counts by sourceKind/trust/taskKind, bundled vs third-party,
 * snapshot totals/status breakdown, oldest/newest applied timestamps (spec §3.DD1).
 */
async function runPluginStats(rest) {
  const flags = parseFlags(rest, {
    string:  PLUGIN_STRING_FLAGS,
    boolean: PLUGIN_BOOLEAN_FLAGS,
  });
  if (flags.help || flags.h) {
    console.log(`Usage:
  od plugin stats [--json]

Prints an at-a-glance plugin + snapshot inventory:
  - Plugin counts by sourceKind, trust, taskKind.
  - Bundled vs. third-party split.
  - Plugins with elevated capabilities (fs:write, subprocess,
    bash, network, connector:*).
  - Snapshot total, status breakdown, project / run linkage.
  - Oldest / newest applied snapshot timestamps.`);
    process.exit(0);
  }
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  const url = `${base}/api/plugins/stats`;
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
  const p = data?.plugins ?? {};
  const s = data?.snapshots ?? {};
  const lastInstalled = formatTimestamp(p.lastInstalledAt);
  const lastUpdated   = formatTimestamp(p.lastUpdatedAt);
  const oldestApplied = formatTimestamp(s.oldestAppliedAt);
  const newestApplied = formatTimestamp(s.newestAppliedAt);
  console.log('# Plugins');
  console.log(`  total:            ${p.total ?? 0}`);
  console.log(`  bundled:          ${p.bundled ?? 0}`);
  console.log(`  third-party:      ${p.thirdParty ?? 0}`);
  console.log(`  with elevated:    ${p.withElevatedCapabilities ?? 0}`);
  console.log(`  by sourceKind:    ${formatCounts(p.bySourceKind)}`);
  console.log(`  by trust:         ${formatCounts(p.byTrust)}`);
  console.log(`  by taskKind:      ${formatCounts(p.byTaskKind)}`);
  console.log(`  last installed:   ${lastInstalled}`);
  console.log(`  last updated:     ${lastUpdated}`);
  console.log('');
  console.log('# Snapshots');
  console.log(`  total:            ${s.total ?? 0}`);
  console.log(`  by status:        ${formatCounts(s.byStatus)}`);
  console.log(`  with project:     ${s.withProject ?? 0}`);
  console.log(`  with run:         ${s.withRun ?? 0}`);
  console.log(`  oldest applied:   ${oldestApplied}`);
  console.log(`  newest applied:   ${newestApplied}`);
}

/**
 * Formats object of counts as 'k=v, k=v, ...' sorted by key (or '(none)').
 * @internal
 */
function formatCounts(counts) {
  if (!counts || typeof counts !== 'object') return '(none)';
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return '(none)';
  return entries.map(([k, v]) => `${k}=${v}`).join(', ');
}

/**
 * Converts millisecond Unix timestamp to ISO string or fallback.
 * @internal
 */
function formatTimestamp(ts) {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return '(none)';
  try { return new Date(ts).toISOString(); } catch { return String(ts); }
}

/**
 * GET /api/plugins, handle errors. Returns { plugins: [...] }.
 * @internal
 */
async function fetchPluginList(flags) {
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/plugins`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`GET /api/plugins failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  return data;
}

/**
 * Delegates to searchInstalledPlugins() with trust/taskKind/mode/tag/bundled filter gates.
 * @internal
 */
async function applyPluginFilters(plugins, flags, query) {
  if (!Array.isArray(plugins) || plugins.length === 0) return [];
  const { searchInstalledPlugins } = await import('./plugins/search.js');
  const trustFlag = typeof flags.trust === 'string' ? flags.trust : undefined;
  const taskKind  = typeof flags['task-kind'] === 'string' ? flags['task-kind'] : undefined;
  const mode      = typeof flags.mode === 'string' ? flags.mode : undefined;
  const tag       = typeof flags.tag === 'string'  ? flags.tag  : undefined;
  let bundled;
  if (flags.bundled === true)         bundled = true;
  if (flags['no-bundled'] === true)   bundled = false;
  const result = searchInstalledPlugins({
    plugins,
    ...(typeof query === 'string' && query.trim() ? { query } : {}),
    ...(taskKind ? { taskKind } : {}),
    ...(mode     ? { mode } : {}),
    ...(tag      ? { tag } : {}),
    ...(trustFlag === 'trusted' || trustFlag === 'restricted' || trustFlag === 'bundled' ? { trust: trustFlag } : {}),
    ...(typeof bundled === 'boolean' ? { bundled } : {}),
  });
  return result.entries;
}

/**
 * Renders plugin list as human-readable table or --json. Shows rank if showRank=true (search mode).
 * @internal
 */
function emitPluginList({ entries, json, emptyMessage, showRank }) {
  if (json) {
    process.stdout.write(JSON.stringify({
      total: entries.length,
      plugins: entries.map((e) => ({
        ...e.plugin,
        ...(showRank ? { matched: e.matched, rank: e.rank } : {}),
      })),
    }, null, 2) + '\n');
    return;
  }
  if (entries.length === 0) {
    console.log(emptyMessage ?? 'No plugins matched.');
    return;
  }
  for (const entry of entries) {
    const p = entry.plugin;
    const tail = showRank && entry.matched.length > 0
      ? `  matched=[${entry.matched.join(',')}]`
      : '';
    console.log(`${p.id}@${p.version}  trust=${p.trust}  source=${p.sourceKind}  title="${p.title}"${tail}`);
  }
}

/**
 * Prints plugin record as JSON: id/version/title/description/manifest/trust/sourceKind.
 * Falls back to marketplace lookup if --version specified and local record is 0.0.0 (Closes #1765).
 */
async function runPluginInfo(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const id = rest.find((a) => !a.startsWith('--')
    && a !== flags['daemon-url']
    && a !== flags.source
    && a !== flags.version);
  if (!id) {
    console.error('Usage: od plugin info <id-or-marketplace-name> [--version <version|tag|range>] [--json]');
    process.exit(2);
  }
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  const url = `${base}/api/plugins/${encodeURIComponent(id)}`;
  const resp = await fetch(url);
  if (resp.ok && !flags.version) {
    const data = await resp.json();
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  const mpResp = await fetch(`${base}/api/marketplaces`);
  if (mpResp.ok) {
    const mpData = await mpResp.json().catch(() => ({}));
    const resolved = resolveMarketplacePluginFromList(
      mpData?.marketplaces ?? [],
      flags.version ? `${id}@${flags.version}` : id,
    );
    if (resolved) {
      process.stdout.write(JSON.stringify({ marketplace: resolved }, null, 2) + '\n');
      return;
    }
  }
  if (!resp.ok) {
    console.error(`GET /api/plugins/${id} failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

// Plan §3.MM1 — `od plugin manifest <id>`. Prints just the parsed
// manifest JSON, no wrapper. Useful for plugin authors who want to
// compare the daemon's view to their on-disk open-design.json
// without scrolling past the registry record fields (sourceKind /
// fsPath / installedAt etc).
/**
 * Prints only manifest JSON (parsed open-design.json), no registry wrapper fields.
 * Useful for authors comparing daemon view to on-disk (spec §3.MM1).
 */
async function runPluginManifest(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const id = rest.find((a) => !a.startsWith('--') && a !== flags['daemon-url'] && a !== flags.source);
  if (!id) {
    console.error('Usage: od plugin manifest <id>');
    process.exit(2);
  }
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/plugins/${encodeURIComponent(id)}`;
  const resp = await fetch(url);
  if (resp.status === 404) {
    console.error(`plugin ${id} not found`);
    process.exit(65);
  }
  if (!resp.ok) {
    console.error(`GET /api/plugins/${id} failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  if (!data?.manifest) {
    console.error(`plugin ${id} has no recorded manifest (registry row is incomplete)`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(data.manifest, null, 2) + '\n');
}

// Plan §3.MM2 — `od plugin sources`. Lists every distinct install
// source string + count of plugins installed from it, ordered by
// count descending then source ascending. Useful for ops audits
// ('which github repos do my plugins come from') + for plugin
// authors comparing their fork to its upstream installs.
/**
 * Lists every distinct (sourceKind, source) pair + plugin count ordered by count desc.
 * Useful for ops audits and fork comparisons (spec §3.MM2).
 */
async function runPluginSources(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/plugins`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`GET /api/plugins failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  const plugins = Array.isArray(data?.plugins) ? data.plugins : [];
  const buckets = new Map();
  for (const p of plugins) {
    const key = `${p.sourceKind ?? 'unknown'}\t${p.source ?? '(none)'}`;
    const entry = buckets.get(key) ?? { sourceKind: p.sourceKind ?? 'unknown', source: p.source ?? '(none)', count: 0, plugins: [] };
    entry.count += 1;
    entry.plugins.push({ id: p.id, version: p.version });
    buckets.set(key, entry);
  }
  const rows = [...buckets.values()].sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    if (a.sourceKind !== b.sourceKind) return a.sourceKind.localeCompare(b.sourceKind);
    return a.source.localeCompare(b.source);
  });
  if (flags.json) {
    process.stdout.write(JSON.stringify({ total: plugins.length, sources: rows }, null, 2) + '\n');
    return;
  }
  if (rows.length === 0) {
    console.log('No plugins installed.');
    return;
  }
  console.log(`# Plugin install sources (total: ${plugins.length})`);
  for (const row of rows) {
    console.log(`  ${row.sourceKind.padEnd(11)}  ${String(row.count).padStart(3)}  ${row.source}`);
    for (const plug of row.plugins) {
      console.log(`               \u2514\u2500 ${plug.id}@${plug.version}`);
    }
  }
}

/**
 * Install from source (local/github/https/marketplace name). Streams SSE progress/success/error.
 */
async function runPluginInstall(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const source = typeof flags.source === 'string' ? flags.source : rest.find((a) => !a.startsWith('-'));
  if (!source) {
    console.error('Usage: od plugin install <source-or-name>\n' +
      '       od plugin install ./local-folder\n' +
      '       od plugin install github:owner/repo[@ref][/subpath]\n' +
      '       od plugin install https://example.com/plugin.tar.gz\n' +
      '       od plugin install <name>[@version|tag|range]  # resolves through configured marketplaces');
    process.exit(2);
  }
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/plugins/install`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ source }),
  });
  if (!resp.ok || !resp.body) {
    console.error(`POST /api/plugins/install failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let exitCode = 0;
  const events = [];
  let finalEvent = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const lines = block.split('\n');
      const eventLine = lines.find((l) => l.startsWith('event: '));
      const dataLine  = lines.find((l) => l.startsWith('data: '));
      const event = eventLine ? eventLine.slice('event: '.length) : 'message';
      const data = dataLine ? safeParseJson(dataLine.slice('data: '.length)) : null;
      events.push({ event, data });
      if (event === 'progress') {
        if (!flags.json) console.log(`[install] ${data?.phase ?? '...'}: ${data?.message ?? ''}`);
      } else if (event === 'success') {
        finalEvent = data;
        if (!flags.json) console.log(`[install] ok — ${data?.plugin?.id}@${data?.plugin?.version} (trust=${data?.plugin?.trust})`);
        if (!flags.json && Array.isArray(data?.warnings) && data.warnings.length > 0) {
          for (const w of data.warnings) console.log(`[install] warn: ${w}`);
        }
      } else if (event === 'error') {
        finalEvent = data;
        if (!flags.json) console.error(`[install] error: ${data?.message ?? 'unknown'}`);
        exitCode = 1;
      }
    }
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify({
      ok: exitCode === 0,
      result: finalEvent,
      events,
    }, null, 2) + '\n');
  }
  process.exit(exitCode);
}

// Plan §3.Z2 — `od plugin upgrade <id>`. Re-installs the plugin
// from its recorded source. Streams the same SSE event shape as
// install, so 'progress' / 'success' / 'error' arrive verbatim.
// Plan §3.II1 — `od plugin events tail`. Tails the daemon's
// in-memory plugin event ring buffer via SSE. -f keeps the
// connection open and prints live events; otherwise prints the
// backlog and exits when the daemon closes the stream.
/**
 * Tails plugin event ring buffer (1000-entry cap, resets on daemon restart).
 * Subcommands: tail [-f], snapshot, stats, purge. Filters: --since id, --kind, --plugin-id.
 */
async function runPluginEvents(rest) {
  const sub = rest[0];
  if (!sub || sub === 'help' || rest.includes('--help') || rest.includes('-h')) {
    console.log(`Usage:
  od plugin events tail     [-f] [--since <id>] [--kind <k>] [--plugin-id <id>] [--json]
  od plugin events snapshot [--since <id>] [--kind <k>] [--plugin-id <id>] [--json]
  od plugin events stats    [--json]
  od plugin events purge    [--confirm] [--json]    (loopback-only)

Tail / snapshot / stats / purge over the daemon's in-memory
plugin event ring buffer (capped at 1000 entries; resets on
daemon restart).
Lifecycle vocabulary:
  plugin.installed | plugin.upgraded | plugin.uninstalled
  plugin.trust-changed | plugin.snapshot-pruned
  plugin.marketplace-refreshed | plugin.applied

  --since <id>       Trim backlog to events strictly after id.
  --kind <k>         Filter to a single kind.
  --plugin-id <id>   Filter to events touching one plugin id.
  -f / --follow      tail-only: keep the SSE stream open.
  --json             Emit raw JSON (one event per line on tail,
                     full report on snapshot/stats).`);
    process.exit(sub ? 0 : 2);
  }
  const flags = parseFlags(rest.slice(1), {
    string:  new Set([...PLUGIN_STRING_FLAGS, 'since', 'kind', 'plugin-id']),
    boolean: new Set([...PLUGIN_BOOLEAN_FLAGS, 'f', 'follow']),
  });
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  const since = typeof flags.since === 'string' ? Number(flags.since) : 0;
  const kindFilter = typeof flags.kind === 'string' && flags.kind.length > 0 ? flags.kind : null;
  const pluginIdFilter = typeof flags['plugin-id'] === 'string' && flags['plugin-id'].length > 0
    ? flags['plugin-id']
    : null;
  const matches = (ev) => {
    if (!ev) return false;
    if (kindFilter && ev.kind !== kindFilter) return false;
    if (pluginIdFilter && ev.pluginId !== pluginIdFilter) return false;
    return true;
  };

  if (sub === 'snapshot') {
    const url = `${base}/api/plugins/events/snapshot${Number.isFinite(since) && since > 0 ? `?since=${since}` : ''}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`GET ${url} failed: ${resp.status} ${await resp.text()}`);
      process.exit(1);
    }
    const data = await resp.json();
    const events = (Array.isArray(data?.events) ? data.events : []).filter(matches);
    if (flags.json) {
      process.stdout.write(JSON.stringify({ events, count: events.length, generatedAt: data?.generatedAt }, null, 2) + '\n');
      return;
    }
    if (events.length === 0) {
      console.log('[events snapshot] no events match filter');
      return;
    }
    for (const ev of events) {
      const ts = ev.at ? new Date(ev.at).toISOString() : '?';
      const detailKeys = ev.details ? Object.keys(ev.details).slice(0, 3).join(',') : '';
      console.log(`#${ev.id}  ${ts}  ${ev.kind}  pluginId=${ev.pluginId || '-'}` +
        (detailKeys ? `  details=${detailKeys}` : ''));
    }
    return;
  }

  if (sub === 'purge') {
    // Refuse to run without an explicit --confirm so 'od plugin
    // events purge' alone never drops audit data accidentally.
    const purgeFlags = parseFlags(rest.slice(1), {
      string:  new Set(['daemon-url']),
      boolean: new Set(['help', 'h', 'json', 'confirm']),
    });
    if (!purgeFlags.confirm) {
      console.error('[events purge] refusing without --confirm. This drops every event in the in-memory buffer.');
      process.exit(2);
    }
    const resp = await fetch(`${base}/api/plugins/events/purge`, { method: 'POST' });
    if (!resp.ok) {
      console.error(`POST /api/plugins/events/purge failed: ${resp.status} ${await resp.text()}`);
      process.exit(1);
    }
    const data = await resp.json();
    if (purgeFlags.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    } else {
      console.log(`[events purge] dropped ${data.purged ?? 0} event${(data.purged ?? 0) === 1 ? '' : 's'} (id range: ${data.firstId ?? '(none)'} \u2192 ${data.lastId ?? '(none)'}; preNextId=${data.preNextId})`);
    }
    return;
  }

  if (sub === 'stats') {
    const resp = await fetch(`${base}/api/plugins/events/stats`);
    if (!resp.ok) {
      console.error(`GET /api/plugins/events/stats failed: ${resp.status} ${await resp.text()}`);
      process.exit(1);
    }
    const data = await resp.json();
    if (flags.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    const s = data?.stats ?? {};
    console.log('# Plugin events');
    console.log(`  total:           ${s.total ?? 0}`);
    console.log(`  by kind:         ${formatCounts(s.byKind)}`);
    console.log(`  by pluginId:     ${formatCounts(s.byPluginId)}`);
    console.log(`  oldest at:       ${formatTimestamp(s.oldestAt)}`);
    console.log(`  newest at:       ${formatTimestamp(s.newestAt)}`);
    console.log(`  id range:        ${s.firstId ?? '(none)'} \u2192 ${s.lastId ?? '(none)'}`);
    return;
  }

  if (sub !== 'tail') {
    console.error(`unknown subcommand: od plugin events ${sub}`);
    process.exit(2);
  }
  const follow = flags.f === true || flags.follow === true;
  const url = `${base}/api/plugins/events${Number.isFinite(since) && since > 0 ? `?since=${since}` : ''}`;
  const resp = await fetch(url, { headers: { accept: 'text/event-stream' } });
  if (!resp.ok || !resp.body) {
    console.error(`GET ${url} failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const renderEvent = (channel, data) => {
    if (!matches(data)) return;
    if (flags.json) {
      process.stdout.write(JSON.stringify({ channel, ...data }) + '\n');
      return;
    }
    const ts = data?.at ? new Date(data.at).toISOString() : '?';
    const id = data?.id ?? '?';
    const tag = channel === 'backlog' ? '[bk]' : '[ev]';
    const detailKeys = data?.details ? Object.keys(data.details).slice(0, 3).join(',') : '';
    console.log(`${tag} #${id}  ${ts}  ${data?.kind ?? '?'}  pluginId=${data?.pluginId ?? '-'}` +
      (detailKeys ? `  details=${detailKeys}` : ''));
  };
  // Read until the daemon closes the stream OR --follow keeps it open
  // forever. Without --follow we still let the daemon drain the
  // backlog naturally; the route emits all backlog entries first,
  // and our reader exits when the connection closes (which the
  // daemon never does on its own, so we add a small idle timer).
  if (!follow) {
    // Non-follow: drain backlog, then exit after a short idle period
    // (the route never naturally closes; the SSE backlog is a one-shot
    // stream of event entries).
    let lastChunkAt = Date.now();
    const idleMs = 200;
    const idleTimer = setInterval(() => {
      if (Date.now() - lastChunkAt > idleMs) {
        clearInterval(idleTimer);
        try { reader.cancel(); } catch { /* ignore */ }
      }
    }, 100);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        lastChunkAt = Date.now();
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const lines = block.split('\n');
          const ev = lines.find((l) => l.startsWith('event: '))?.slice('event: '.length) ?? 'message';
          const dat = lines.find((l) => l.startsWith('data: '))?.slice('data: '.length);
          if (!dat) continue;
          try { renderEvent(ev, JSON.parse(dat)); } catch { /* ignore */ }
        }
      }
    } finally {
      clearInterval(idleTimer);
    }
    return;
  }
  // Follow mode: read forever.
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const lines = block.split('\n');
      const ev = lines.find((l) => l.startsWith('event: '))?.slice('event: '.length) ?? 'message';
      const dat = lines.find((l) => l.startsWith('data: '))?.slice('data: '.length);
      if (!dat) continue;
      try { renderEvent(ev, JSON.parse(dat)); } catch { /* ignore */ }
    }
  }
}

/**
 * Re-installs plugin from recorded source with optional --policy (latest|pinned).
 * Same SSE event stream as install (spec §3.Z2).
 */
async function runPluginUpgrade(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const id = rest.find((a) => !a.startsWith('-') && a !== flags['daemon-url'] && a !== flags.source);
  if (!id) {
    console.error('Usage: od plugin upgrade <id> [--policy latest|pinned] [--json]');
    process.exit(2);
  }
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/plugins/${encodeURIComponent(id)}/upgrade`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({
      policy: flags.policy === 'pinned' ? 'pinned' : 'latest',
    }),
  });
  if (!resp.ok || !resp.body) {
    let msg = '';
    try { msg = await resp.text(); } catch { msg = ''; }
    console.error(`POST /api/plugins/${id}/upgrade failed: ${resp.status} ${msg}`);
    process.exit(1);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let exitCode = 0;
  const events = [];
  let finalEvent = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const lines = block.split('\n');
      const eventLine = lines.find((l) => l.startsWith('event: '));
      const dataLine  = lines.find((l) => l.startsWith('data: '));
      const event = eventLine ? eventLine.slice('event: '.length) : 'message';
      const data = dataLine ? safeParseJson(dataLine.slice('data: '.length)) : null;
      events.push({ event, data });
      if (event === 'progress') {
        if (!flags.json) console.log(`[upgrade] ${data?.phase ?? '...'}: ${data?.message ?? ''}`);
      } else if (event === 'success') {
        finalEvent = data;
        if (!flags.json) console.log(`[upgrade] ok — ${data?.plugin?.id}@${data?.plugin?.version} (trust=${data?.plugin?.trust})`);
        if (!flags.json && Array.isArray(data?.warnings) && data.warnings.length > 0) {
          for (const w of data.warnings) console.log(`[upgrade] warn: ${w}`);
        }
      } else if (event === 'error') {
        finalEvent = data;
        if (!flags.json) console.error(`[upgrade] error: ${data?.message ?? 'unknown'}`);
        exitCode = 1;
      }
    }
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify({
      ok: exitCode === 0,
      policy: flags.policy === 'pinned' ? 'pinned' : 'latest',
      result: finalEvent,
      events,
    }, null, 2) + '\n');
  }
  process.exit(exitCode);
}

/**
 * Removes plugin from registry and on-disk staging. Returns removedFolder flag and optional warning.
 */
async function runPluginUninstall(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const id = rest.find((a) => !a.startsWith('-') && a !== flags['daemon-url'] && a !== flags.source);
  if (!id) {
    console.error('Usage: od plugin uninstall <id>');
    process.exit(2);
  }
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/plugins/${encodeURIComponent(id)}/uninstall`;
  const resp = await fetch(url, { method: 'POST' });
  if (!resp.ok) {
    console.error(`POST /api/plugins/${id}/uninstall failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  console.log(`[uninstall] ${data?.removedFolder ? 'ok' : 'no-op'}${data?.warning ? ` (warning: ${data.warning})` : ''}`);
}

/**
 * Computes ApplyResult snapshot (preview) without starting a run.
 * Accepts --inputs <json> or repeated --input k=v forms for coercion-free agent automation (spec §3.B2).
 */
async function runPluginApply(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const id = rest.find((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.source
    && a !== flags.inputs
    && a !== flags.project
    && a !== flags['grant-caps']);
  if (!id) {
    console.error('Usage: od plugin apply <id> [--inputs <json>] [--input k=v ...] [--project <id>] [--grant-caps a,b]');
    process.exit(2);
  }
  // Plan §3.B2: support both --inputs <json> and repeated --input k=v
  // forms so a code agent can build the inputs map without a JSON
  // shell-escape dance.
  let inputs = {};
  if (typeof flags.inputs === 'string' && flags.inputs.trim().length > 0) {
    try { inputs = JSON.parse(flags.inputs); } catch (err) {
      console.error(`--inputs must be valid JSON: ${err.message}`);
      process.exit(2);
    }
  }
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--input' && typeof rest[i + 1] === 'string') {
      const kv = rest[i + 1];
      const eq = kv.indexOf('=');
      if (eq > 0) {
        const k = kv.slice(0, eq);
        const v = kv.slice(eq + 1);
        inputs[k] = coerceCliValue(v);
      }
      i += 1;
    }
  }
  const grantCaps = typeof flags['grant-caps'] === 'string' && flags['grant-caps'].length > 0
    ? flags['grant-caps'].split(',').map((c) => c.trim()).filter(Boolean)
    : [];
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/plugins/${encodeURIComponent(id)}/apply`;
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inputs, projectId: flags.project, grantCaps }),
    });
  } catch (err) {
    return exitWithStructuredError({
      code: 'daemon-not-running',
      message: `Cannot reach daemon at ${await pluginDaemonUrl(flags)}: ${err?.message ?? err}`,
    });
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    if (resp.status === 422 && Array.isArray(data?.fields)) {
      return exitWithStructuredError({
        code: 'missing-input',
        message: `Plugin "${id}" is missing required inputs: ${data.fields.join(', ')}`,
        data: { pluginId: id, missing: data.fields },
      });
    }
    return structuredHttpFailure(resp);
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  const snap = data?.appliedPlugin;
  if (snap) {
    console.log(`[apply] ${snap.pluginId}@${snap.pluginVersion} digest=${snap.manifestSourceDigest.slice(0, 12)}…`);
    console.log(`[apply] context: ${(data.contextItems ?? []).map((c) => `${c.kind}:${c.id ?? c.name ?? c.path}`).join(', ')}`);
    if (Array.isArray(data.warnings) && data.warnings.length > 0) {
      for (const w of data.warnings) console.log(`[apply] warn: ${w}`);
    }
  } else {
    console.log(JSON.stringify(data));
  }
}

/**
 * Copies plugin's HTML example into new project without starting agent run.
 * Returns projectId + relPath + optional warnings.
 */
async function runPluginDuplicate(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const id = rest.find((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.name);
  if (!id) {
    console.error('Usage: od plugin duplicate <id> [--name "<project name>"] [--json]');
    process.exit(2);
  }
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/plugins/${encodeURIComponent(id)}/duplicate-project`;
  const body = typeof flags.name === 'string' && flags.name.trim().length > 0
    ? { name: flags.name.trim() }
    : {};
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return exitWithStructuredError({
      code: 'daemon-not-running',
      message: `Cannot reach daemon at ${await pluginDaemonUrl(flags)}: ${err?.message ?? err}`,
    });
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json().catch(() => ({}));
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  console.log(`[duplicate] created project ${data.projectId} from ${data.sourcePluginId} -> ${data.relPath}`);
  if (Array.isArray(data.warnings) && data.warnings.length > 0) {
    for (const warning of data.warnings) console.log(`[duplicate] warn: ${warning}`);
  }
}

/**
 * List/draft/dismiss skill-to-plugin candidates persisted by daemon.
 * Subcommands: list, draft <id>, dismiss <id>.
 */
async function runPluginCandidates(rest) {
  const sub = rest[0];
  const args = rest.slice(1);
  const flags = parseFlags(args, {
    string: new Set(['daemon-url', 'project', 'action']),
    boolean: new Set(['help', 'h', 'json', 'include-dismissed']),
  });
  if (!sub || flags.help || flags.h) {
    console.log(`Usage:
  od plugin candidates list --project <projectId> [--json] [--include-dismissed]
  od plugin candidates draft <candidateId> --project <projectId> [--json]
  od plugin candidates dismiss <candidateId> --project <projectId> [--json]

Lists and formalizes persisted skill-to-plugin candidates.`);
    process.exit(!sub ? 2 : 0);
  }
  const projectId = typeof flags.project === 'string' && flags.project.length > 0 ? flags.project : '';
  if (!projectId) {
    console.error('--project <projectId> is required');
    process.exit(2);
  }
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  if (sub === 'list') {
    const qs = flags['include-dismissed'] ? '?includeDismissed=true' : '';
    const resp = await fetch(`${base}/api/projects/${encodeURIComponent(projectId)}/plugin-candidates${qs}`);
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error(`GET plugin candidates failed: ${resp.status} ${JSON.stringify(data)}`);
      process.exit(1);
    }
    if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    if (candidates.length === 0) {
      console.log('No plugin candidates.');
      return;
    }
    for (const candidate of candidates) {
      console.log(`${candidate.id}\t${candidate.status}\t${candidate.title}\t${candidate.draftPath ?? ''}`);
    }
    return;
  }
  const candidateId = args.find((a) => !a.startsWith('-') && a !== flags.project && a !== flags.action);
  if (!candidateId) {
    console.error(`candidate id is required for ${sub}`);
    process.exit(2);
  }
  if (sub === 'draft') {
    const resp = await fetch(`${base}/api/projects/${encodeURIComponent(projectId)}/plugin-candidates/${encodeURIComponent(candidateId)}/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await resp.json().catch(() => null);
    if (flags.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    } else if (resp.ok) {
      console.log(`[candidate] draft: ${data.draftPath}`);
      console.log(`[candidate] validation ok=${data.validation?.ok}`);
    } else {
      console.error(`[candidate] draft failed: ${data?.message ?? JSON.stringify(data)}`);
    }
    process.exit(resp.ok ? 0 : resp.status === 422 ? 4 : 1);
  }
  if (sub === 'dismiss') {
    const resp = await fetch(`${base}/api/projects/${encodeURIComponent(projectId)}/plugin-candidates/${encodeURIComponent(candidateId)}/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await resp.json().catch(() => null);
    if (flags.json) process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    else if (resp.ok) console.log(`[candidate] dismissed ${candidateId}`);
    else console.error(`[candidate] dismiss failed: ${data?.message ?? JSON.stringify(data)}`);
    process.exit(resp.ok ? 0 : 1);
  }
  console.error(`unknown subcommand: od plugin candidates ${sub}`);
  process.exit(2);
}

/**
 * Lints manifest/atoms/resolved refs. With --strict, warnings become errors (spec §3.HH1).
 */
async function runPluginDoctor(rest) {
  // Plan §3.HH1 — --strict promotes warnings to errors so CI can
  // opt into 'no warnings allowed' mode without parsing the issue
  // list manually.
  const flags = parseFlags(rest, {
    string:  PLUGIN_STRING_FLAGS,
    boolean: new Set([...PLUGIN_BOOLEAN_FLAGS, 'strict']),
  });
  const id = rest.find((a) => !a.startsWith('-') && a !== flags['daemon-url'] && a !== flags.source);
  if (!id) {
    console.error('Usage: od plugin doctor <id> [--strict] [--json]');
    process.exit(2);
  }
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/plugins/${encodeURIComponent(id)}/doctor`;
  const resp = await fetch(url, { method: 'POST' });
  if (!resp.ok) {
    console.error(`POST /api/plugins/${id}/doctor failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  const issues = Array.isArray(data?.issues) ? data.issues : [];
  const warnings = issues.filter((i) => i?.severity === 'warning');
  const strict = flags.strict === true;
  // Strict mode: a clean issue list is still required, but the
  // pass/fail bit also fails on any warning.
  const passed = data.ok && (!strict || warnings.length === 0);
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ...data, strict, passed }, null, 2) + '\n');
  } else {
    if (passed && issues.length === 0) {
      console.log(`[doctor] ${data.pluginId} ok (digest ${data.freshDigest.slice(0, 12)}…)`);
    } else {
      const tier = !data.ok ? 'errors' : (strict && warnings.length > 0) ? 'warnings (--strict)' : 'warnings';
      console.log(`[doctor] ${data.pluginId} ${tier}:`);
      for (const issue of issues) {
        console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
      }
    }
  }
  process.exit(passed ? 0 : (data.ok ? 4 : 1));
}

/**
 * Attempt JSON.parse; return null on error (no throw).
 * @internal
 */
function safeParseJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

// `od plugin trust <id> --capabilities <comma-sep>` — flip a plugin's
// capabilities_granted set. Plan §3.A2 / spec §9.1: the CLI is the
// canonical write surface (invariant I4). The daemon validates the
// capability vocabulary; unknown / malformed entries surface as
// exit-2 usage failures.
/**
 * Grants or revokes capability set on a plugin (CLI is canonical write surface per spec §9.1).
 * Validates capabilities vocabulary; unknown entries exit 2.
 */
async function runPluginTrust(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const id = rest.find((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.source
    && a !== flags.inputs
    && a !== flags.project
    && a !== flags['snapshot-id']
    && a !== flags.capabilities);
  if (!id) {
    console.error('Usage: od plugin trust <id> --capabilities connector:figma,connector:notion [--revoke]');
    process.exit(2);
  }
  const capsCsv = typeof flags.capabilities === 'string' ? flags.capabilities : '';
  const caps = capsCsv.split(',').map((c) => c.trim()).filter(Boolean);
  if (caps.length === 0) {
    console.error('--capabilities is required (comma-separated, e.g. connector:figma,fs:read)');
    process.exit(2);
  }
  const action = flags.revoke ? 'revoke' : 'grant';
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/plugins/${encodeURIComponent(id)}/trust`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ capabilities: caps, action }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    if (resp.status === 400 && data?.error?.code === 'invalid-capability') {
      const rej = (data.error.data?.rejected ?? [])
        .map((r) => `${r.capability} (${r.reason})`)
        .join(', ');
      console.error(`[trust] invalid capabilities: ${rej}`);
      process.exit(2);
    }
    console.error(`POST ${url} failed: ${resp.status} ${JSON.stringify(data)}`);
    process.exit(1);
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  console.log(`[trust] ${action === 'grant' ? 'granted' : 'revoked'} on ${id}: ${caps.join(', ')}`);
  console.log(`[trust] now: ${(data.capabilitiesGranted ?? []).join(', ')}`);
}

/**
 * Help text for `od plugin` (all subcommands). Shown on zero args or --help.
 * @internal
 */
function printPluginHelp() {
  console.log(`Usage:
  od plugin list [--task-kind <kind>]     List installed plugins (filterable).
  od plugin search <query> [--tag <t>]    Search installed plugins by id/title/desc/tag.
  od plugin stats [--json]                Inventory + snapshot health report.
  od plugin info <id>                     Print a plugin's manifest + trust state as JSON.
  od plugin manifest <id>                 Print only the parsed manifest JSON (no wrapper).
  od plugin sources                       List distinct install sources + counts.
  od plugin install --source <path>       Install a plugin from a local folder (Phase 1).
  od plugin upgrade <id>                  Re-install a plugin from its recorded source.
  od plugin uninstall <id>                Remove a plugin from the registry + on-disk staging.
  od plugin apply <id> [--inputs <json>]  Compute an ApplyResult (preview) for a plugin.
  od plugin duplicate <id> [--name <n>]   Copy a plugin HTML example into a new project
                                          without starting an agent run.
  od plugin doctor <id>                   Lint a plugin's manifest, atoms and resolved refs.
  od plugin canon <snapshotId>            Print the canonical system-prompt block for a snapshot.
                                          (--check <file> for byte-equality fixtures.)
  od plugin simulate <pluginId> [-s k=v]  Walk the plugin's pipeline against caller-supplied
                                          signals; report stage convergence + iterations
                                          (no LLM in the loop).
  od plugin verify <pluginId>             CI meta-command: doctor + simulate + canon --check
                                          driven by an .od-verify.json config in the plugin folder.
  od plugin events tail [-f] [--kind k]   Tail the in-memory plugin event ring buffer.
  od plugin events snapshot               One-shot read (filterable, no SSE).
  od plugin events stats                  Roll-up: counts by kind / pluginId / time range.
  od plugin events purge                  Drop every event in the buffer (loopback-only).
  od plugin diff <a> <b> [--json]         Compare two installed plugins by id.
  od plugin replay <runId> --snapshot-id <id>
                                          Re-emit the immutable snapshot a run launched against.
  od plugin trust <id> --capabilities a,b
                                          Stage a capability grant (full mutation lands Phase 3).
  od plugin validate <folder> [--json]    Lint a plugin folder before installing
                                          (manifest parse + atom + ref checks).
  od plugin pack <folder> [--out <path>]  Build a .tgz archive of a plugin
                                          folder for distribution.
  od plugin candidates list --project <id>
                                          List persisted skill-to-plugin candidates.
  od plugin publish-repo <folder>         Create/update the author's public
                                          GitHub repo for a plugin folder.
  od plugin open-design-pr <folder>       Push a community-catalog branch and
                                          open the nexu-io/open-design PR form.
  od plugin publish <folder> --to open-design|anthropics-skills|awesome-agent-skills|clawhub|skills-sh
                                          Prepare a registry submission link.
  od plugin login [--host github.com]      Authenticate registry publishing via gh.
  od plugin whoami [--host github.com]     Show the gh account used for publishing.

Common options:
  --daemon-url <url>   Open Design daemon HTTP base (default OD_DAEMON_URL, OD_SIDECAR_IPC_PATH discovery, or http://127.0.0.1:7456).
  --json               Emit raw JSON (suitable for scripts) instead of human-readable output.

Installs support local folders, github:owner/repo refs, HTTPS .tgz archives,
and bare marketplace names resolved through configured registry sources.`);
}
