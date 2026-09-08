/** Explicit local acceptance, NOT a hermetic CI test or remote batch creator. */
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, open, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { createToolsDevSuite, e2eWorkspaceRoot } from '../lib/tools-dev/runtime.ts';

type Json = Record<string, any>;
type ReplayFixture = {
  id: string; source: string; expected?: string; action: 'allow' | 'fail'; attempts?: number;
  appliedRepairRules?: string[]; finalizationReason?: string; refusal?: string;
};
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const sourceScopes = ['apps/daemon', 'packages/contracts', 'pnpm-lock.yaml'];

/** git diff excludes new files: record their scoped paths and bytes alongside the tracked diff. */
export async function captureUntrackedSourceIdentity(workspace: string) {
  const { stdout } = await promisify(execFile)('git', ['ls-files', '--others', '--exclude-standard', '-z', '--', ...sourceScopes], { cwd: workspace });
  const paths = stdout.split('\0').filter(Boolean).sort();
  const untrackedFiles = await Promise.all(paths.map(async relativePath => ({
    path: relativePath, sha256: hash(await readFile(path.join(workspace, relativePath))),
  })));
  return { untrackedFiles, untrackedFilesSha256: hash(JSON.stringify(untrackedFiles)) };
}

/** File-only fixture input: never imports daemon implementation or executes fixture JavaScript. */
export async function loadReplayFixtures(manifestPath: string): Promise<ReplayFixture[]> {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Json;
  if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length === 0) throw new Error('Fixture manifest must have a nonempty fixtures array');
  const seen = new Set<string>();
  return await Promise.all(manifest.fixtures.map(async (entry: Json) => {
    if (typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(entry.id) || seen.has(entry.id)) throw new Error('Fixture IDs must be unique and path-safe');
    seen.add(entry.id);
    if (entry.action !== 'allow' && entry.action !== 'fail') throw new Error(`${entry.id}: invalid fixture action`);
    if (typeof entry.before !== 'string' || (entry.action === 'allow' && typeof entry.after !== 'string')) throw new Error(`${entry.id}: before and exact expected after are required for allow`);
    if (entry.attempts !== undefined && (!Number.isInteger(entry.attempts) || entry.attempts < 0)) throw new Error(`${entry.id}: invalid attempts`);
    const source = await readFile(path.resolve(path.dirname(manifestPath), entry.before), 'utf8');
    const expected = typeof entry.after === 'string' ? await readFile(path.resolve(path.dirname(manifestPath), entry.after), 'utf8') : source;
    if (entry.action === 'fail' && expected !== source) throw new Error(`${entry.id}: rejected fixture must preserve original bytes`);
    return { id: entry.id, source, expected, action: entry.action, attempts: entry.attempts,
      appliedRepairRules: entry.appliedRepairRules, finalizationReason: entry.finalizationReason, refusal: entry.refusal };
  }));
}

export function replayCaseVerdict(fixture: ReplayFixture, run: Json, content: string) {
  const validation = run.deliverableSyntaxValidation ?? {};
  const beforeAfterEqual = content === fixture.source;
  const expectedAfterEqual = fixture.expected === undefined ? null : content === fixture.expected;
  const appliedRepairRules = validation.metrics?.appliedRepairRules ?? [];
  const finalization = validation.finalization;
  const expectedCommitted = fixture.action === 'allow' ? (fixture.attempts ?? 0) : 0;
  const terminalSummaryValid = finalization?.summaryVersion === 1
    && finalization.repairEngine === 'host-safe-fixer@2'
    && Number.isInteger(finalization.stagedPatchCount)
    && finalization.stagedPatchCount >= 0
    && finalization.committedPatchCount === expectedCommitted
    && (fixture.attempts === undefined || finalization.stagedPatchCount === fixture.attempts)
    && (fixture.action !== 'allow' || finalization.initialStatus === (expectedCommitted > 0 ? 'repairable' : 'pass'))
    && JSON.stringify(finalization.committedRepairRules) === JSON.stringify(expectedCommitted > 0 ? appliedRepairRules : []);
  return {
    passed: run.status === (fixture.action === 'allow' ? 'succeeded' : 'failed')
      && terminalSummaryValid
      && validation.finalization?.action === fixture.action
      && (fixture.attempts === undefined || (validation.repairState?.attempt ?? 0) === fixture.attempts)
      && (fixture.action !== 'allow' || validation.status === 'pass')
      && (fixture.action !== 'fail' || beforeAfterEqual)
      && (fixture.expected !== undefined ? expectedAfterEqual : fixture.action === 'fail' || fixture.attempts === 0 ? beforeAfterEqual : !beforeAfterEqual)
      && (fixture.appliedRepairRules === undefined || JSON.stringify(appliedRepairRules) === JSON.stringify(fixture.appliedRepairRules))
      && (fixture.finalizationReason === undefined || validation.finalization?.reason === fixture.finalizationReason)
      && (fixture.refusal === undefined || validation.finalization?.refusal === fixture.refusal),
    terminalSummaryValid,
    beforeAfterEqual, expectedAfterEqual, beforeSha256: hash(fixture.source), afterSha256: hash(content),
    expectedAfterSha256: fixture.expected === undefined ? null : hash(fixture.expected), appliedRepairRules,
    // Historical repairToDeliveryDurationMs also contains failed terminal time; keep outcomes distinct.
    discoveryToDeliveryMs: run.status === 'succeeded' ? validation.metrics?.repairToDeliveryDurationMs ?? null : null,
    discoveryToBlockedTerminalMs: run.status === 'failed' ? validation.metrics?.repairToDeliveryDurationMs ?? null : null,
  };
}

/** Recover completed records even if node-job exits before writing result.json. Never invent failed cases. */
export async function collectRealEvidence(output: string, expectedIds: string[]) {
  const evidenceErrors: string[] = [];
  const entries = new Map<string, Json>();
  const started = new Set<string>();
  const finishedEvents = new Set<string>();
  const duplicateFinishedCaseIds: string[] = [];
  let hasResult = false;
  let hasEvents = false;
  try {
    const result = JSON.parse(await readFile(path.join(output, 'result.json'), 'utf8')) as Json;
    if (!Array.isArray(result.cases)) throw new Error('missing cases array');
    hasResult = true;
    for (const entry of result.cases) {
      if (typeof entry.evalId !== 'string') { evidenceErrors.push('result case missing evalId'); continue; }
      if (entries.has(entry.evalId)) evidenceErrors.push(`duplicate result case ${entry.evalId}`);
      entries.set(entry.evalId, entry);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') evidenceErrors.push(`result.json: ${String(error)}`);
  }
  try {
    const lines = (await readFile(path.join(output, 'events.jsonl'), 'utf8')).split('\n');
    hasEvents = true;
    for (const [index, line] of lines.entries()) {
      if (!line.trim()) continue;
      let event: Json;
      try { event = JSON.parse(line) as Json; } catch { evidenceErrors.push(`events.jsonl: invalid JSON at line ${index + 1}`); continue; }
      if (event.type === 'case_started' && typeof event.evalId === 'string') started.add(event.evalId);
      if (event.type !== 'case_finished') continue;
      if (typeof event.evalId !== 'string') { evidenceErrors.push(`case_finished missing evalId at line ${index + 1}`); continue; }
      if (finishedEvents.has(event.evalId)) duplicateFinishedCaseIds.push(event.evalId);
      finishedEvents.add(event.evalId);
      if (!entries.has(event.evalId)) entries.set(event.evalId, event);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') evidenceErrors.push(`events.jsonl: ${String(error)}`);
  }
  const cases = [...entries.values()].map(entry => ({ ...entry,
    passed: entry.status === 'succeeded' && entry.metrics?.strategyRoute === 'od-next'
      && entry.metrics?.agent === 'open-design:amr' && entry.metrics?.model === 'deepseek-v4-flash'
      && entry.metrics?.deliverableSyntax?.status === 'pass',
  }));
  const missingCaseIds = expectedIds.filter(id => !entries.has(id));
  const unexpectedCaseIds = [...entries.keys()].filter(id => !expectedIds.includes(id));
  return { cases, collection: {
    source: hasResult ? hasEvents ? 'result+events' : 'result' : hasEvents ? 'events' : 'missing',
    expectedCaseCount: expectedIds.length, finishedCaseCount: entries.size,
    startedCaseIds: [...started], missingCaseIds, unexpectedCaseIds, duplicateFinishedCaseIds, evidenceErrors,
    unfinishedCaseIds: missingCaseIds.filter(id => started.has(id)),
    notStartedCaseIds: missingCaseIds.filter(id => !started.has(id)),
    complete: expectedIds.length > 0 && missingCaseIds.length === 0 && unexpectedCaseIds.length === 0
      && duplicateFinishedCaseIds.length === 0 && evidenceErrors.length === 0,
  } };
}

export async function runSyntaxAcceptance(args = process.argv.slice(2)) {
const exec = promisify(execFile);
const workspace = e2eWorkspaceRoot();
const { values } = parseArgs({ args, options: {
  mode: { type: 'string' }, dataset: { type: 'string' }, sha256: { type: 'string' },
  runner: { type: 'string' }, vela: { type: 'string' }, profile: { type: 'string', default: 'test' },
  'runner-version': { type: 'string', default: '0.9.24' },
  'expected-rows': { type: 'string', default: '24' }, repeat: { type: 'string', default: '3' },
  'fixture-manifest': { type: 'string' }, 'timeout-ms': { type: 'string', default: String(3 * 60 * 60 * 1000) },
} });
if (values.mode !== 'real' && values.mode !== 'replay') {
  throw new Error('Choose --mode replay or --mode real (real also requires --dataset --sha256 --runner --vela).');
}
const mode = values.mode;
const root = await mkdtemp(path.join(os.tmpdir(), 'od-syntax-acceptance-'));
await chmod(root, 0o700);
const runtime = createToolsDevSuite({
  root, namespace: `syntax-${randomUUID().slice(0, 8)}`, ownerPid: process.pid,
  toolsDevRoot: path.join(root, 'runtime'), dataDir: path.join(root, 'data'),
  codexHomeDir: path.join(root, 'codex'),
});
const env: Record<string, string | undefined> = {
  OD_NEXT_STRATEGY_ROLLOUT: mode === 'real' ? 'active' : 'off',
  OD_DELIVERABLE_SYNTAX_FINALIZER: '1',
  OPEN_DESIGN_AMR_PROFILE: values.profile, VELA_PROFILE: values.profile,
  ...(values.vela ? { VELA_BIN: path.resolve(values.vela) } : {}),
};
const report: Json = {
  mode, status: 'RUNNING', startedAt: new Date().toISOString(), root,
  boundary: mode === 'real' ? 'real AMR / OD Next generation' : 'fake CLI / real deployed daemon terminal chain; NOT AMR acceptance',
  cases: [],
};
async function save(name: string, data: unknown) {
  await writeFile(path.join(root, name), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}
async function command(command: string, args: string[], logName: string, timeout = 180_000) {
  const log = await open(path.join(root, logName), 'w', 0o600);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: workspace, env: { ...process.env, ...env }, stdio: ['ignore', log.fd, log.fd],
        timeout,
      });
      child.on('error', reject);
      child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${logName}: exit=${code}, signal=${signal}`)));
    });
  } finally { await log.close(); }
}
async function request(url: string, method = 'GET', body?: unknown): Promise<Json> {
  let response: Response;
  try {
    response = await fetch(url, {
      method, signal: AbortSignal.timeout(30_000),
      ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new Error(`${method} ${new URL(url).pathname}: ${error instanceof Error ? error.message : 'request failed'}`);
  }
  if (!response.ok) throw new Error(`${method} ${new URL(url).pathname}: HTTP ${response.status}`);
  return await response.json() as Json;
}
async function sourceIdentity() {
  const git = async (...args: string[]) => (await exec('git', args, { cwd: workspace })).stdout.trim();
  return {
    branch: await git('branch', '--show-current'), commit: await git('rev-parse', 'HEAD'),
    diffSha256: hash(await git('diff', 'HEAD', '--', ...sourceScopes)),
    ...await captureUntrackedSourceIdentity(workspace),
    harnessSha256: hash(await readFile(new URL(import.meta.url))),
    node: process.version,
  };
}
const fixtures = [
  { id: 'valid', script: 'const items = [1, 2];', action: 'allow', attempts: 0 },
  { id: 'array', script: 'const items = [1, 2;', action: 'allow', attempts: 1 },
  { id: 'division', script: 'const ratio = 10 / 2; const items = [1, 2;', action: 'allow', attempts: 1 },
  { id: 'regex', script: 'const re = /[{}()]/; const items = [1, 2;', action: 'allow', attempts: 1 },
  { id: 'three', script: 'function f() { if (true) { const items = [1, 2;', action: 'allow', attempts: 3 },
  { id: 'budget', script: 'function f() { if (true) { const items = [[[[[[[1, 2;', action: 'fail', attempts: 8 },
  { id: 'expression-hole', script: 'const value = ;', action: 'fail', attempts: 0 },
  { id: 'comment', script: 'const ready = true; /* unfinished', action: 'allow', attempts: 1 },
  { id: 'string', script: 'const label = "hello', action: 'allow', attempts: 1 },
  { id: 'oversize', script: ' '.repeat(2 * 1024 * 1024), action: 'fail', attempts: 0 },
] as const;
let activeFixtures: ReplayFixture[] = fixtures.map(fixture => ({ ...fixture, source: `<!doctype html><script>${fixture.script}</script>` }));
let expectedIds: string[] = [];
const output = path.join(root, 'evaluation');

async function replay() {
  const repeat = Number(values.repeat);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) throw new Error('--repeat must be 1..10');
  for (let round = 1; round <= repeat; round++) {
    for (const fixture of activeFixtures) {
      const id = `${fixture.id}-${round}`;
      const source = fixture.source;
      // The fake CLI supplies fixed output; it does not pretend to be an AMR model.
      const bin = path.join(root, `fixture-${id}.cjs`);
      await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0-acceptance'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p [--add-dir DIR]'); process.exit(0); }
const content = ${JSON.stringify(source)};
fs.writeFileSync('index.html', content);
const emit = value => fs.writeSync(1, JSON.stringify(value) + '\\n');
emit({ type:'system', subtype:'init', model:'fixed-fixture', session_id:'${id}' });
emit({ type:'assistant', message:{ id:'write', content:[{type:'tool_use',id:'write-index',name:'Write',input:{file_path:'index.html'}}],stop_reason:'tool_use' } });
emit({ type:'user', message:{content:[{type:'tool_result',tool_use_id:'write-index',content:'File written',is_error:false}]} });
emit({ type:'assistant',message:{id:'final',content:[{type:'text',text:'Done'}],stop_reason:'end_turn'} });
emit({ type:'result',subtype:'success',is_error:false,session_id:'${id}',stop_reason:'end_turn',usage:{input_tokens:2,output_tokens:1},duration_ms:1 });
`, { mode: 0o700 });
      await request(runtime.url.api('/api/app-config'), 'PUT', {
        agentId: 'claude', agentCliEnv: { claude: { CLAUDE_BIN: bin } },
        telemetry: { metrics: false, content: false, artifactManifest: false }, privacyDecisionAt: Date.now(),
      });
      const projectId = `acceptance_${randomUUID()}`;
      const project = await request(runtime.url.api('/api/projects'), 'POST', {
        id: projectId, name: id, metadata: { kind: 'prototype', entryFile: 'index.html' }, skipDiscoveryBrief: true,
      });
      const started = await request(runtime.url.api('/api/runs'), 'POST', {
        projectId, conversationId: project.conversationId, agentId: 'claude',
        assistantMessageId: randomUUID(), clientRequestId: randomUUID(),
        message: 'Create the page', currentPrompt: 'Create the page',
      });
      const start = Date.now();
      let run: Json;
      do {
        run = await request(runtime.url.api(`/api/runs/${started.runId}`));
        if (['succeeded', 'failed', 'canceled'].includes(run.status)) break;
        if (Date.now() - start > 60_000) throw new Error(`${id}: Run ${started.runId} timeout`);
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (true);
      await save(`${id}-run.json`, run);
      const response = await fetch(runtime.url.api(`/api/projects/${projectId}/raw/index.html`), { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`${id}: cannot read artifact`);
      const content = await response.text();
      await writeFile(path.join(root, `${id}-before.html`), source, { mode: 0o600 });
      await writeFile(path.join(root, `${id}-after.html`), content, { mode: 0o600 });
      const validation = run.deliverableSyntaxValidation ?? {};
      if (fixture.expected !== undefined) await writeFile(path.join(root, `${id}-expected.html`), fixture.expected, { mode: 0o600 });
      const verdict = replayCaseVerdict(fixture, run, content);
      report.cases.push({
        id, ...verdict, runId: run.id, projectId, status: run.status, validation,
        elapsedMs: Date.now() - start,
      });
      await save('report.json', report);
      console.log(`[replay] ${id}: ${verdict.passed ? 'PASS' : 'FAIL'} (${run.status})`);
    }
  }
}

try {
  report.sourceBefore = await sourceIdentity();
  await save('report.json', report);
  console.log(`Local evidence: ${root}`);
  let dataset: Buffer | undefined;
  const timeoutMs = Number(values['timeout-ms']);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('--timeout-ms must be a positive integer (node-job total budget, not per-case)');
  report.evaluationTimeoutMs = timeoutMs;
  if (values['fixture-manifest']) {
    if (mode !== 'replay') throw new Error('--fixture-manifest only applies to replay');
    const manifestPath = path.resolve(values['fixture-manifest']);
    activeFixtures = await loadReplayFixtures(manifestPath);
    report.fixtures = { manifestPath, manifestSha256: hash(await readFile(manifestPath)),
      entries: activeFixtures.map(fixture => ({ id: fixture.id, beforeSha256: hash(fixture.source), expectedSha256: hash(fixture.expected!), action: fixture.action })) };
  }
  if (mode === 'real') {
    if (values.profile !== 'test') throw new Error('Real local syntax acceptance requires --profile test; no production wallet fallback');
    if (!values.dataset || !values.sha256 || !values.runner || !values.vela) throw new Error('Missing real-lane arguments');
    dataset = await readFile(path.resolve(values.dataset));
    const rows = dataset.toString('utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    if (hash(dataset) !== values.sha256.replace(/^sha256:/, '')) throw new Error('Dataset hash mismatch');
    if (rows.length !== Number(values['expected-rows'])) throw new Error('Dataset row count mismatch');
    expectedIds = rows.map(row => row.eval_id);
    if (expectedIds.some(id => typeof id !== 'string' || !id) || new Set(expectedIds).size !== rows.length) throw new Error('Dataset eval_id must be unique and nonempty');
    report.dataset = { sha256: hash(dataset), rows: rows.length };
    report.runner = { path: path.resolve(values.runner), sha256: hash(await readFile(path.resolve(values.runner))) };
    report.runner.version = (await exec(process.execPath, [path.resolve(values.runner), '--version'], { timeout: 30_000 })).stdout.trim();
    if (report.runner.version.replace(/^(?:od-evals\s+)?v?/, '') !== values['runner-version']) {
      throw new Error(`RUNNER_VERSION_MISMATCH: expected ${values['runner-version']}, got ${report.runner.version}`);
    }
    report.profile = values.profile;
    report.vela = { path: path.resolve(values.vela), version: (await exec(path.resolve(values.vela), ['--version'])).stdout.trim() };
    try {
      // Never log whoami's personal data or credentials and never silently change profile/model.
      await exec(path.resolve(values.vela), ['whoami'], { env: { ...process.env, ...env }, timeout: 30_000 });
    } catch { throw new Error(`AMR_AUTH_BLOCKED: Vela profile ${values.profile} is not authenticated/reachable`); }
  }
  console.log('Building current worktree and dependencies (no --skip-build).');
  await command('pnpm', ['--filter', '@open-design/daemon...', '--workspace-concurrency=4', 'build'], 'build.log', 600_000);
  report.build = {
    serverSha256: hash(await readFile(path.join(workspace, 'apps/daemon/dist/server.js'))),
    finalizerSha256: hash(await readFile(path.join(workspace, 'apps/daemon/dist/artifacts/deliverable-syntax-finalization.js'))),
    fixerSha256: hash(await readFile(path.join(workspace, 'apps/daemon/dist/artifacts/deliverable-syntax-safe-fix.js'))),
    quotesSha256: hash(await readFile(path.join(workspace, 'apps/daemon/dist/artifacts/deliverable-syntax-quotes.js'))),
  };
  report.runtime = await runtime.startWeb(env);
  report.runtimeCheck = await runtime.check(env);
  await request(runtime.url.api('/api/app-config'), 'PUT', {
    agentId: mode === 'real' ? 'amr' : 'claude',
    telemetry: { metrics: false, content: false, artifactManifest: false }, privacyDecisionAt: Date.now(),
    ...(mode === 'real' ? { agentCliEnv: { amr: {
      VELA_BIN: path.resolve(values.vela!), VELA_PROFILE: values.profile, OPEN_DESIGN_AMR_PROFILE: values.profile,
    } } } : {}),
  });
  if (mode === 'replay') {
    await replay();
  } else {
    const login = await request(runtime.url.api('/api/integrations/vela/status'));
    report.daemonAuth = { loggedIn: login.loggedIn, profile: login.profile, sessionState: login.sessionState };
    if (login.loggedIn !== true || login.profile !== values.profile) throw new Error('DAEMON_AMR_AUTH_MISMATCH');
    await writeFile(path.join(root, 'dataset.jsonl'), dataset!, { mode: 0o600 });
    await save('arm.json', {
      id: 'local-syntax-acceptance', cli: 'amr', model: 'deepseek-v4-flash',
      strategyRoute: 'od-next', keepDiscovery: true, autoAnswerForms: false,
      env: { kind: 'daemon', url: runtime.daemonUrl },
    });
    await mkdir(output);
    await command(process.execPath, [path.resolve(values.runner!), 'node-job',
      '--dataset', path.join(root, 'dataset.jsonl'), '--arm-file', path.join(root, 'arm.json'),
      '--out-dir', output, '--concurrency', '2'], 'evaluation.log', timeoutMs);
    const evidence = await collectRealEvidence(output, expectedIds);
    report.cases = evidence.cases;
    report.collection = evidence.collection;
    if (!evidence.collection.complete) throw new Error('Incomplete evaluation evidence; see collection for unfinished/missing cases');
  }
  report.status = report.cases.length > 0 && report.cases.every((entry: Json) => entry.passed) ? 'PASS' : 'FAIL';
  report.note = mode === 'real' ? 'Generation/terminal acceptance only; visual quality is not scored.' : 'Replay PASS is not real AMR / OD Next acceptance.';
} catch (error) {
  report.status = 'BLOCKED';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  if (mode === 'real' && expectedIds.length > 0) {
    try {
      const evidence = await collectRealEvidence(output, expectedIds);
      report.cases = evidence.cases;
      report.collection = evidence.collection;
      if (!evidence.collection.complete) report.status = 'BLOCKED';
    } catch (error) { report.collectionError = String(error); report.status = 'BLOCKED'; }
  }
  try {
    report.sourceAfter = await sourceIdentity();
    report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
    if (!report.sourceStable) report.status = 'BLOCKED';
  } catch (error) { report.sourceAfterError = String(error); report.status = 'BLOCKED'; }
  // Preserve local evidence, but never leave a temporary background runtime running.
  try { await save('runtime-logs.json', await runtime.logs(env)); } catch { /* startup may not have happened */ }
  report.cleanup = { attempted: true, stopped: false };
  try {
    report.cleanup.stopResult = await runtime.stopWeb(env);
    report.cleanup.status = await runtime.status(env);
    report.cleanup.stopped = ['daemon', 'web'].every(app => {
      const state = report.cleanup.status.apps?.[app];
      return state && state.state !== 'running' && state.pid == null;
    });
    if (!report.cleanup.stopped) { report.status = 'BLOCKED'; report.cleanupError = 'Runtime stop was not confirmed by status'; }
  } catch (error) {
    report.cleanupError = String(error); report.status = 'BLOCKED';
  }
  report.finishedAt = new Date().toISOString();
  await save('report.json', report);
  console.log(`${report.status}: ${path.join(root, 'report.json')}`);
  if (report.error) console.log(report.error);
  if (report.status !== 'PASS') process.exitCode = 1;
}
return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runSyntaxAcceptance();
