// @ts-nocheck
/** @module cli/plugin/verify
 * CI meta-commands: doctor/simulate/canon checks, snapshot diff/show/prune, replay for re-runs.
 * Collaborators: manage.ts (flag parsing), ../core (exit codes).
 * Invariant: all snapshot data flows through /api/applied-plugins/; no local snapshot cache.
 */
import { parseFlags } from '../core/index.js';
import { PLUGIN_BOOLEAN_FLAGS, PLUGIN_STRING_FLAGS, pluginDaemonUrl } from './manage.js';

// Plan §3.A5 / spec §16 Phase 5: operator escape hatch for snapshot GC.
// Two subcommands:
//   - `od plugin snapshots list [--project <id>]` — list snapshots
//   - `od plugin snapshots prune [--before <ts>]` — force-delete expired
//     (and optionally older-than-cutoff unreferenced) rows.
/**
 * Subcommands: list [--project id], show <id>, diff <a> <b>, prune [--before ms].
 * Snapshot GC escape hatch (Plan §3.A5, spec Phase 5). list returns JSON; others allow --json flag.
 * Note: show/diff exit 72 (RECOVERABLE_EXIT_CODES['snapshot-stale']) on 404 — the reuse of the stale code for not-found is a known quirk.
 */
export async function runPluginSnapshots(args) {
  const sub = args[0];
  if (!sub || sub === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od plugin snapshots list  [--project <id>]               List applied plugin snapshots.
  od plugin snapshots show  <snapshotId> [--json]          Print one snapshot's full contents.
  od plugin snapshots diff  <id-a> <id-b> [--json]         Compare two snapshots field-by-field.
  od plugin snapshots prune [--before <unix-ms>]           Delete expired (or older-than-cutoff) snapshots.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const flags = parseFlags(args.slice(1), { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  if (sub === 'show') {
    const positional = args.slice(1).filter((a) => !a.startsWith('-'));
    const id = positional[0];
    if (!id) {
      console.error('Usage: od plugin snapshots show <snapshotId>');
      process.exit(2);
    }
    const url = `${base}/api/applied-plugins/${encodeURIComponent(id)}`;
    const resp = await fetch(url);
    if (resp.status === 404) {
      console.error(`snapshot ${id} not found`);
      process.exit(72);
    }
    if (!resp.ok) {
      console.error(`GET ${url} failed: ${resp.status} ${await resp.text()}`);
      process.exit(1);
    }
    const data = await resp.json();
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  if (sub === 'diff') {
    const positional = args.slice(1).filter((a) => !a.startsWith('-'));
    if (positional.length < 2) {
      console.error('Usage: od plugin snapshots diff <id-a> <id-b>');
      process.exit(2);
    }
    const [idA, idB] = positional;
    const [respA, respB] = await Promise.all([
      fetch(`${base}/api/applied-plugins/${encodeURIComponent(idA)}`),
      fetch(`${base}/api/applied-plugins/${encodeURIComponent(idB)}`),
    ]);
    if (respA.status === 404) { console.error(`snapshot ${idA} not found`); process.exit(72); }
    if (respB.status === 404) { console.error(`snapshot ${idB} not found`); process.exit(72); }
    if (!respA.ok || !respB.ok) {
      console.error(`fetch failed: ${respA.status} / ${respB.status}`);
      process.exit(1);
    }
    const a = await respA.json();
    const b = await respB.json();
    const { diffSnapshots } = await import('./plugins/snapshot-diff.js');
    const report = diffSnapshots({ a, b });
    if (flags.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      return;
    }
    const digestNote = report.digestEqual
      ? '\u2713 manifestSourceDigest equal (e2e-2 invariant holds)'
      : '\u2717 manifestSourceDigest DIFFERS (replay would diverge)';
    console.log(`[snapshots diff] ${idA} \u2194 ${idB}`);
    console.log(`  ${digestNote}`);
    console.log(`  ${report.added} added, ${report.removed} removed, ${report.changed} changed`);
    if (report.entries.length === 0) {
      console.log('  (no field-level differences)');
      return;
    }
    for (const e of report.entries) {
      const tag = e.kind === 'added' ? '+' : e.kind === 'removed' ? '-' : '~';
      if (e.summary) {
        console.log(`  ${tag} ${e.field}  (${e.summary})`);
      } else if (e.kind === 'changed') {
        console.log(`  ${tag} ${e.field}: ${e.before ?? ''} \u2192 ${e.after ?? ''}`);
      } else if (e.kind === 'added') {
        console.log(`  ${tag} ${e.field}: ${e.after ?? ''}`);
      } else {
        console.log(`  ${tag} ${e.field}: ${e.before ?? ''}`);
      }
    }
    return;
  }
  if (sub === 'list') {
    const url = flags.project
      ? `${base}/api/projects/${encodeURIComponent(flags.project)}/applied-plugins`
      : `${base}/api/applied-plugins`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`GET ${url} failed: ${resp.status} ${await resp.text()}`);
      process.exit(1);
    }
    const data = await resp.json();
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  if (sub === 'prune') {
    const url = `${base}/api/applied-plugins/prune`;
    const before = flags.before ? Number(flags.before) : undefined;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(before ? { before } : {}),
    });
    if (!resp.ok) {
      console.error(`POST ${url} failed: ${resp.status} ${await resp.text()}`);
      process.exit(1);
    }
    const data = await resp.json();
    if (flags.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    console.log(`[snapshots] pruned ${data.removed ?? 0} snapshot(s)`);
    return;
  }
  console.error(`unknown subcommand: od plugin snapshots ${sub}`);
  process.exit(2);
}

// Plan §3.FF1 — `od plugin verify <pluginId>` CI meta-command.
//
// Reads an optional .od-verify.json config from the plugin folder
// or --config <path> and runs the enabled subset of:
//
//   doctor   — calls /api/plugins/<id>/doctor
//   simulate — calls /api/plugins/<id> + simulatePipeline()
//   canon    — fetches /api/applied-plugins/<snapshotId>/canon and
//              compares against the on-disk fixture
//
// Aggregates into a unified pass/fail report. Exit 4 on any failed
// check; useful as a one-liner CI check for a plugin's repo.
/**
 * CI meta-command. Reads optional .od-verify.json from plugin folder (or --config).
 * Runs enabled subset of doctor/simulate/canon; aggregates into pass/fail.
 * Exit 4 on failure (useful for CI gates). Phase 5 / spec §16 / plan §3.FF1.
 */
export async function runPluginVerify(rest) {
  const flags = parseFlags(rest, {
    string:  new Set([...PLUGIN_STRING_FLAGS, 'config']),
    boolean: PLUGIN_BOOLEAN_FLAGS,
  });
  const positional = rest.filter((a) => !a.startsWith('-'));
  const id = positional[0];
  if (flags.help || flags.h || !id) {
    console.log(`Usage:
  od plugin verify <pluginId> [--config <path>] [--json]

CI meta-command. Reads an optional config from
'<plugin-folder>/.od-verify.json' (or --config <path>) and runs:

  doctor    — manifest + atom + ref lint
  simulate  — convergence dry-run for every until expression,
              with per-stage signals from config.simulate.signals
  canon     — byte-equality check against
              config.canon.fixturePath using the snapshot at
              config.canon.snapshotId

Sample .od-verify.json:

  {
    "enabled": ["doctor", "simulate"],
    "simulate": {
      "signals": { "critique.score": 5, "build.passing": true },
      "iterationCap": 5
    },
    "canon": {
      "snapshotId": "snap-abc",
      "fixturePath": "tests/expected-block.md"
    }
  }

Exit codes:
  0  every enabled check passed
  4  one or more enabled checks failed
  2  CLI usage error / plugin not found / config malformed`);
    process.exit(id ? 0 : 2);
  }
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');

  // 1. Resolve the plugin record (fsPath + manifest).
  const pluginResp = await fetch(`${base}/api/plugins/${encodeURIComponent(id)}`);
  if (pluginResp.status === 404) {
    console.error(`plugin ${id} not found`);
    process.exit(65);
  }
  if (!pluginResp.ok) {
    console.error(`GET /api/plugins/${id} failed: ${pluginResp.status} ${await pluginResp.text()}`);
    process.exit(1);
  }
  const plugin = await pluginResp.json();

  // 2. Load .od-verify.json from --config or <fsPath>/.od-verify.json.
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const configPath = typeof flags.config === 'string'
    ? path.resolve(flags.config)
    : (typeof plugin?.fsPath === 'string' ? path.join(plugin.fsPath, '.od-verify.json') : null);
  let config = { enabled: ['doctor', 'simulate', 'canon'] };
  if (configPath) {
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      config = JSON.parse(raw);
    } catch (err) {
      const e = err;
      if (e?.code !== 'ENOENT') {
        console.error(`[verify] cannot read config ${configPath}: ${e?.message ?? e}`);
        process.exit(2);
      }
      // ENOENT → run with defaults. canon will skip cleanly because no
      // config.canon entry was supplied.
    }
  }

  // 3. doctor (when enabled)
  const enabledSet = new Set((config.enabled ?? ['doctor', 'simulate', 'canon']).filter((c) =>
    c === 'doctor' || c === 'simulate' || c === 'canon'));
  let doctorReport = null;
  if (enabledSet.has('doctor')) {
    const doctorResp = await fetch(`${base}/api/plugins/${encodeURIComponent(id)}/doctor`);
    if (doctorResp.ok) {
      doctorReport = await doctorResp.json();
    }
  }

  // 4. simulate (when enabled)
  let simulateReport = null;
  if (enabledSet.has('simulate')) {
    const pipeline = plugin?.manifest?.od?.pipeline;
    if (pipeline && Array.isArray(pipeline.stages) && pipeline.stages.length > 0) {
      const { simulatePipeline } = await import('./plugins/simulate.js');
      simulateReport = simulatePipeline({
        pipeline,
        signals: config.simulate?.signals ?? {},
        ...(typeof config.simulate?.iterationCap === 'number' && config.simulate.iterationCap > 0
          ? { iterationCap: config.simulate.iterationCap }
          : {}),
      });
    }
  }

  // 5. canon (when enabled + fixture supplied)
  let canonActual = null;
  let canonExpected = null;
  if (enabledSet.has('canon') && config.canon?.snapshotId && config.canon?.fixturePath) {
    const fixturePath = path.resolve(
      typeof flags.config === 'string'
        ? path.dirname(path.resolve(flags.config))
        : (typeof plugin?.fsPath === 'string' ? plugin.fsPath : process.cwd()),
      config.canon.fixturePath,
    );
    try {
      canonExpected = await fs.readFile(fixturePath, 'utf8');
    } catch {
      canonExpected = null;
    }
    if (canonExpected !== null) {
      const canonResp = await fetch(
        `${base}/api/applied-plugins/${encodeURIComponent(config.canon.snapshotId)}/canon`,
        { headers: { accept: 'text/plain' } },
      );
      if (canonResp.ok) {
        canonActual = await canonResp.text();
      }
    }
  }

  // 6. Aggregate.
  const { verifyPlugin } = await import('./plugins/verify.js');
  const report = verifyPlugin({
    config: {
      enabled: [...enabledSet],
      ...(config.strict   === true     ? { strict:   true }      : {}),
      ...(config.simulate              ? { simulate: config.simulate } : {}),
      ...(config.canon                 ? { canon:    config.canon    } : {}),
    },
    ...(doctorReport   ? { doctor:        doctorReport } : {}),
    ...(simulateReport ? { simulate:      simulateReport } : {}),
    ...(canonActual    ? { canon:         canonActual } : {}),
    ...(canonExpected  ? { canonExpected: canonExpected } : {}),
  });
  if (flags.json) {
    process.stdout.write(JSON.stringify({ pluginId: id, ...report }, null, 2) + '\n');
  } else {
    console.log(`[verify] plugin ${id} \u2014 ${report.passed ? 'PASSED' : 'FAILED'}`);
    for (const o of report.outcomes) {
      const tag = o.status === 'passed' ? '\u2713'
                : o.status === 'failed' ? '\u2717'
                : o.status === 'skipped' ? '-'
                : '!';
      console.log(`  ${tag} ${o.summary}`);
    }
  }
  process.exit(report.passed ? 0 : 4);
}

// Plan §3.EE1 — `od plugin simulate <pluginId> [-s key=value ...]`.
//
// Walks the plugin's pipeline against caller-supplied signals and
// reports per-stage convergence (iterations + outcome). No LLM is
// invoked — this is a pure devloop dry-run for testing 'until'
// expressions.
//
// Signals are supplied via repeatable -s key=value flags. The
// closed UntilSignals vocabulary applies (critique.score /
// iterations / user.confirmed / preview.ok / build.passing /
// tests.passing); unknown keys surface as warnings.
/**
 * Dry-run pipeline without LLM. Walks stages, tests 'until' expressions against supplied signals.
 * Signals: critique.score, iterations, user.confirmed, preview.ok, build.passing, tests.passing (closed vocabulary).
 * Exit 4 on cap-hit or unparsable stage (plan §3.EE1).
 */
export async function runPluginSimulate(rest) {
  const flags = parseFlags(rest, {
    string:  new Set([...PLUGIN_STRING_FLAGS, 's', 'cap']),
    boolean: PLUGIN_BOOLEAN_FLAGS,
  });
  const positional = rest.filter((a) => !a.startsWith('-'));
  const id = positional[0];
  if (flags.help || flags.h || !id) {
    console.log(`Usage:
  od plugin simulate <pluginId> [-s key=value ...] [--cap <n>] [--json]

Walks the plugin's pipeline against caller-supplied signals and
reports per-stage convergence. No LLM is invoked.

Examples:
  # critique-theater stage that exits when score >= 4
  od plugin simulate my-plugin -s critique.score=5

  # build-test devloop where both signals must hold
  od plugin simulate code-migration \\
      -s build.passing=true -s tests.passing=true

  # raise the per-stage iteration cap (default 10)
  od plugin simulate my-plugin -s critique.score=2 --cap 20

Closed signal vocabulary:
  critique.score (number)
  iterations     (number)
  user.confirmed (boolean)
  preview.ok     (boolean)
  build.passing  (boolean)
  tests.passing  (boolean)`);
    process.exit(id ? 0 : 2);
  }
  // Collect every -s value (parseFlags returns the last only).
  const sValues = [];
  for (let i = 0; i < rest.length; i++) {
    if ((rest[i] === '-s' || rest[i] === '--signal') && typeof rest[i + 1] === 'string') {
      sValues.push(rest[i + 1]);
    }
  }
  // Fetch the plugin from the daemon so we get the resolved
  // manifest (including pipeline).
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  const resp = await fetch(`${base}/api/plugins/${encodeURIComponent(id)}`);
  if (resp.status === 404) {
    console.error(`plugin ${id} not found`);
    process.exit(65);
  }
  if (!resp.ok) {
    console.error(`GET /api/plugins/${id} failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const plugin = await resp.json();
  const pipeline = plugin?.manifest?.od?.pipeline;
  if (!pipeline || !Array.isArray(pipeline.stages) || pipeline.stages.length === 0) {
    if (flags.json) {
      process.stdout.write(JSON.stringify({ outcome: 'no-pipeline', stages: [] }, null, 2) + '\n');
    } else {
      console.log(`[simulate] plugin ${id} has no od.pipeline (or it is empty); nothing to walk.`);
    }
    return;
  }
  const { simulatePipeline, parseSignalKv } = await import('./plugins/simulate.js');
  const parsedSignals = parseSignalKv(sValues);
  for (const w of parsedSignals.warnings) console.warn(`[simulate] warn: ${w}`);
  const cap = typeof flags.cap === 'string' ? Number(flags.cap) : undefined;
  const result = simulatePipeline({
    pipeline,
    signals: parsedSignals.signals,
    ...(Number.isFinite(cap) && cap > 0 ? { iterationCap: cap } : {}),
  });
  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  console.log(`[simulate] plugin ${id} \u2014 outcome: ${result.outcome}, totalIterations: ${result.totalIterations}`);
  for (const stage of result.stages) {
    const tag = stage.outcome === 'converged' ? '\u2713'
              : stage.outcome === 'cap'         ? '\u2717'
              : stage.outcome === 'unparsable'  ? '!'
              :                                   '\u2014';
    const reason = stage.reason ? `  (${stage.reason})` : '';
    const matched = stage.matched && stage.matched.length > 0
      ? `  matched=[${stage.matched.map((c) => `${c.signal}${c.op}${c.value}`).join(' && ')}]`
      : '';
    console.log(`  ${tag} ${stage.stageId}: ${stage.outcome} (${stage.iterations} iter)${reason}${matched}`);
  }
  // Exit non-zero on cap-hit / unparsable so CI can wire this
  // into a pipeline check easily.
  if (result.outcome === 'cap-hit' || result.outcome === 'unparsable') process.exit(4);
}

// Plan §3.CC1 / §3.DD2 — `od plugin canon <snapshotId>`. Prints the
// canonical `## Active plugin` block a snapshot will splice into
// the system prompt. Useful for understanding what the agent
// reads + locking byte-equality regression tests against the
// daemon's renderPluginBlock() output.
//
// --check <file> mode: compares the canon output against an
// on-disk fixture (typically committed under tests/fixtures/) and
// exits 4 on byte-mismatch. Lets a plugin author lock byte-
// equality without writing a new test harness.
/**
 * Prints canonical system prompt block (## Active plugin / ## Plugin inputs / ## Plugin atoms)
 * that snapshot splices into prompt. With --check <file>, compares byte-equality (spec §3.CC1, §3.DD2).
 * Useful for locking fixtures and understanding agent read view.
 */
export async function runPluginCanon(rest) {
  const flags = parseFlags(rest, {
    string:  new Set([...PLUGIN_STRING_FLAGS, 'check']),
    boolean: PLUGIN_BOOLEAN_FLAGS,
  });
  const positional = rest.filter((a) => !a.startsWith('-'));
  const id = positional[0];
  if (flags.help || flags.h || !id) {
    console.log(`Usage:
  od plugin canon <snapshotId> [--json]
  od plugin canon <snapshotId> --check <expected-file>

Prints the canonical '## Active plugin' / '## Plugin inputs' /
'## Plugin atoms' block this snapshot would splice into the
system prompt. Default output is plain text; --json wraps the
block in { snapshotId, pluginId, block }.

--check <file> compares the canon output to the file's bytes and
exits 4 on mismatch. Useful for committing renderPluginBlock()
fixtures into a plugin's own tests/.`);
    process.exit(id ? 0 : 2);
  }
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  const url = `${base}/api/applied-plugins/${encodeURIComponent(id)}/canon`;
  const checkPath = typeof flags.check === 'string' ? flags.check : null;
  // --check always wants the raw text output; force text/plain.
  const wantsText = !flags.json || checkPath !== null;
  const headers = { accept: wantsText ? 'text/plain' : 'application/json' };
  const resp = await fetch(url, { headers });
  if (resp.status === 404) {
    console.error(`snapshot ${id} not found`);
    process.exit(72);
  }
  if (!resp.ok) {
    console.error(`GET ${url} failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  if (checkPath) {
    const fs = await import('node:fs/promises');
    let expected;
    try {
      expected = await fs.readFile(checkPath, 'utf8');
    } catch (err) {
      console.error(`[canon --check] cannot read ${checkPath}: ${err?.message ?? err}`);
      process.exit(2);
    }
    const actual = await resp.text();
    if (actual === expected) {
      console.log(`[canon] \u2713 byte-equal to ${checkPath}`);
      return;
    }
    // Surface a small unified-diff preview so the author sees what
    // drifted. Full diff is left to the user's preferred tool.
    console.error(`[canon --check] \u2717 mismatch with ${checkPath}`);
    console.error(`  expected length: ${expected.length} bytes`);
    console.error(`  actual length:   ${actual.length} bytes`);
    const expectedLines = expected.split('\n');
    const actualLines   = actual.split('\n');
    const limit = Math.min(Math.max(expectedLines.length, actualLines.length), 40);
    for (let i = 0; i < limit; i++) {
      if (expectedLines[i] !== actualLines[i]) {
        console.error(`  line ${i + 1}:`);
        if (expectedLines[i] !== undefined) console.error(`    - ${expectedLines[i]}`);
        if (actualLines[i]   !== undefined) console.error(`    + ${actualLines[i]}`);
      }
    }
    process.exit(4);
  }
  if (flags.json) {
    const data = await resp.json();
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  const body = await resp.text();
  process.stdout.write(body);
  if (!body.endsWith('\n')) process.stdout.write('\n');
}

// Plan §3.AA1 — `od plugin diff <a> <b>`. Compares two installed
// plugins (by id) and prints a structured report. Useful for
// debugging replay invariance + reviewing version bumps.
/**
 * Compares two plugin records (same id at different versions, or different ids).
 * Groups output into added/removed/changed fields with summaries or field diffs (plan §3.AA1).
 * @param rest Raw argv after 'diff'
 */
export async function runPluginDiff(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const positional = rest.filter((a) => !a.startsWith('-'));
  if (flags.help || flags.h || positional.length < 2) {
    console.log(`Usage:
  od plugin diff <id-a> <id-b> [--json]

Compares two installed plugins (or two installs of the same id at
different versions) and prints every changed field. Output groups
into 'added' / 'removed' / 'changed' with one line per field.`);
    process.exit(positional.length < 2 ? 2 : 0);
  }
  const [idA, idB] = positional;
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  const [respA, respB] = await Promise.all([
    fetch(`${base}/api/plugins/${encodeURIComponent(idA)}`),
    fetch(`${base}/api/plugins/${encodeURIComponent(idB)}`),
  ]);
  if (!respA.ok) {
    console.error(`GET /api/plugins/${idA} failed: ${respA.status}`);
    process.exit(1);
  }
  if (!respB.ok) {
    console.error(`GET /api/plugins/${idB} failed: ${respB.status}`);
    process.exit(1);
  }
  const a = await respA.json();
  const b = await respB.json();
  const { diffPlugins } = await import('./plugins/diff.js');
  const report = diffPlugins({ a, b });
  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  if (report.entries.length === 0) {
    console.log(`[diff] ${idA} and ${idB} are equivalent on every recorded field.`);
    return;
  }
  console.log(`[diff] ${idA} \u2194 ${idB} — ${report.added} added, ${report.removed} removed, ${report.changed} changed`);
  for (const e of report.entries) {
    const tag = e.kind === 'added'   ? '+'
              : e.kind === 'removed' ? '-'
              : '~';
    if (e.summary) {
      console.log(`  ${tag} ${e.field}  (${e.summary})`);
    } else if (e.kind === 'changed') {
      console.log(`  ${tag} ${e.field}: ${e.before ?? ''} \u2192 ${e.after ?? ''}`);
    } else if (e.kind === 'added') {
      console.log(`  ${tag} ${e.field}: ${e.after ?? ''}`);
    } else {
      console.log(`  ${tag} ${e.field}: ${e.before ?? ''}`);
    }
  }
}

// `od plugin replay <runId> --snapshot-id <id>` — re-emit the immutable
// snapshot the original run was launched against, so the caller (or
// another agent) can re-apply the same plugin against fresh state. Phase
// 2A keeps replay headless: the CLI prints the snapshot + rerun bundle;
// the agent restarts the run via `od plugin apply` followed by a normal
// `od run start`. Future Phase 2C `od plugin run` will collapse this
// into a one-shot wrapper.
/**
 * Re-emits immutable snapshot a run was launched against (Phase 2A headless).
 * Returns rerun bundle for agent to call `od plugin apply` + normal run start (plan §3.C1).
 * @param rest Raw argv after 'replay'
 */
export async function runPluginReplay(rest) {
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const runId = rest.find((a) => !a.startsWith('-')
    && a !== flags['daemon-url']
    && a !== flags.source
    && a !== flags.inputs
    && a !== flags.project
    && a !== flags['snapshot-id']
    && a !== flags.capabilities);
  if (!runId) {
    console.error('Usage: od plugin replay <runId> --snapshot-id <id>');
    process.exit(2);
  }
  const snapshotId = flags['snapshot-id'];
  if (!snapshotId) {
    console.error('--snapshot-id is required (runs are in-memory in Phase 2A; pass the snapshot id returned by od plugin apply)');
    process.exit(2);
  }
  const url = `${(await pluginDaemonUrl(flags)).replace(/\/$/, '')}/api/runs/${encodeURIComponent(runId)}/replay`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ snapshotId }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error(`POST /api/runs/${runId}/replay failed: ${resp.status} ${JSON.stringify(data)}`);
    process.exit(1);
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  console.log(`[replay] ${data.rerun?.pluginId}@${data.rerun?.pluginVersion} digest=${(data.rerun?.manifestSourceDigest ?? '').slice(0, 12)}…`);
  console.log(`[replay] inputs: ${JSON.stringify(data.rerun?.inputs ?? {})}`);
  console.log('[replay] re-apply via: od plugin apply ' + data.rerun?.pluginId + ' --inputs ' + JSON.stringify(JSON.stringify(data.rerun?.inputs ?? {})));
}
