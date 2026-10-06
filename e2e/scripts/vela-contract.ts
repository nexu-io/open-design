import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { hostname, platform, arch, release } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { runVelaContract } from '../lib/amr/vela-contract.ts';

const { values } = parseArgs({ options: {
  binary: { type: 'string' }, out: { type: 'string' }, 'expected-version': { type: 'string' },
  'require-write-abort': { type: 'boolean', default: false }, 'require-continuation': { type: 'boolean', default: false }, help: { type: 'boolean' },
} });
if (values.help) {
  console.log('tsx scripts/vela-contract.ts --binary <Vela executable> --expected-version <exact version> --out <evidence directory> [--require-write-abort] [--require-continuation]');
  process.exit(0);
}
if (!values.binary || !values.out || !values['expected-version']) throw new Error('--binary, --expected-version and --out are required');
const binary = resolve(values.binary);
const out = resolve(values.out);
await mkdir(out, { recursive: true });
async function binaryHash() {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(binary)) hash.update(chunk);
  return hash.digest('hex');
}
const sha256 = await binaryHash();
const version = (await promisify(execFile)(binary, ['--version'], { encoding: 'utf8', timeout: 10_000 })).stdout.trim();
if (version !== values['expected-version']) throw new Error(`Vela version ${version} does not match expected ${values['expected-version']}`);
const results: Array<{ scenario: string; passed: boolean; checks: Record<string, boolean>; evidence: string; error?: string }> = [];
let incomplete: Awaited<ReturnType<typeof runVelaContract>> | undefined;
for (const scenario of ['complete', 'incomplete', 'incomplete-outstanding', 'write-stall', 'write-disconnect', 'write-missing-terminal', 'unknown-error'] as const) {
  try {
    const run = await runVelaContract({ binary, directory: join(out, scenario), scenario, cancel: scenario === 'write-stall' });
    if (scenario === 'incomplete') incomplete = run;
    const evidence = join(out, `${scenario}.json`);
    await writeFile(evidence, `${JSON.stringify(run, null, 2)}\n`);
    const promptCount = run.openCodeRequests.filter(request => request.path.endsWith('/prompt_async')).length;
    const abortCount = run.openCodeRequests.filter(request => request.path.endsWith('/abort')).length;
    const checks: Record<string, boolean> = { promptSubmittedOnce: promptCount === 1, acpPromptSentOnce: run.sent.filter(frame => frame.method === 'session/prompt').length === 1 };
    if (scenario === 'complete') checks.terminalModelStepAccepted = run.terminal.result?.stopReason === 'end_turn';
    else if (scenario === 'write-stall') { checks.cancelled = run.terminal.result?.stopReason === 'cancelled'; checks.cancelAbortedOnce = abortCount === 1; }
    else checks.noFalseSuccess = run.terminal.error !== undefined && run.terminal.result === undefined;
    if (scenario === 'incomplete') checks.incompleteNamed = run.terminal.error?.message.includes('compaction continuation ended before prompt completion') === true || run.terminal.error?.data?.code === 'OPENCODE_COMPACTION_CONTINUATION_INCOMPLETE';
    if (values['require-continuation'] && scenario === 'incomplete-outstanding') {
      checks.unknownToolNotCommitted = run.terminal.error?.data?.phase === 'tool_outstanding' && (run.terminal.error.data.continuation as Record<string, unknown> | undefined)?.toolResultsCommitted === false;
    }
    if (values['require-write-abort'] && ['write-disconnect', 'write-missing-terminal'].includes(scenario)) checks.abortedBeforeTerminal = abortCount === 1 && run.openCodeEvents.some(event => event.path.endsWith('/abort') && event.phase === 'response-complete' && BigInt(event.atNs) <= BigInt(run.terminalReceivedAtNs));
    results.push({ scenario, passed: Object.values(checks).every(Boolean), checks, evidence });
  } catch (error) {
    results.push({ scenario, passed: false, checks: {}, evidence: join(out, scenario), error: String(error) });
  }
}
if (values['require-continuation']) {
  const evidence = join(out, 'native-continuation.json');
  try {
    const data = incomplete?.terminal.error?.data;
    const cursor = data?.continuation as Record<string, unknown> | undefined;
    const capabilities = incomplete?.initialize.result?.agentCapabilities as Record<string, unknown> | undefined;
    const extensions = capabilities?._meta as Record<string, { version?: unknown }> | undefined;
    if (capabilities?.loadSession !== true || extensions?.['com.open-design.nativeSessionContinue']?.version !== 1 ||
        data?.kind !== 'opencode_continuation_incomplete' || data.code !== 'OPENCODE_COMPACTION_CONTINUATION_INCOMPLETE' ||
        data.runtime !== 'opencode' || data.phase !== 'post_tool_resume' || data.retryable !== false ||
        cursor?.version !== 1 || cursor.toolResultsCommitted !== true || typeof data.openCodeSessionId !== 'string') {
      throw new Error('target binary lacks the explicit continuation capability and committed-tool error contract');
    }
    const resumed = await runVelaContract({ binary, directory: join(out, 'native-continuation'), scenario: 'complete', loadSessionId: data.openCodeSessionId, continuation: cursor });
    await writeFile(evidence, `${JSON.stringify(resumed, null, 2)}\n`);
    const checks = {
      sameDurableSession: resumed.session.result?.openCodeSessionId === data.openCodeSessionId,
      noNewSession: !resumed.sent.some(frame => frame.method === 'session/new') && !resumed.openCodeRequests.some(request => request.method === 'POST' && request.path === '/session'),
      noPromptReplay: !resumed.sent.some(frame => frame.method === 'session/prompt') && !resumed.openCodeRequests.some(request => request.path.endsWith('/prompt_async')),
      continueOnce: resumed.openCodeRequests.filter(request => request.path.endsWith('/continue')).length === 1,
      finalModelStep: resumed.terminal.result?.stopReason === 'end_turn',
      terminalOnce: resumed.received.filter(frame => frame.id === 4).length === 1,
    };
    results.push({ scenario: 'native-continuation', passed: Object.values(checks).every(Boolean), checks, evidence });
  } catch (error) { results.push({ scenario: 'native-continuation', passed: false, checks: {}, evidence, error: String(error) }); }
}
const binaryUnchanged = sha256 === await binaryHash();
const report = { schemaVersion: 1, scope: 'real-vela-synthetic-opencode', capturedAt: new Date().toISOString(),
  machine: { hostname: hostname(), platform: platform(), arch: arch(), osRelease: release() },
  binary: { path: binary, version, sha256, unchangedDuringSuite: binaryUnchanged }, requireWriteAbort: values['require-write-abort'], requireContinuation: values['require-continuation'],
  passed: binaryUnchanged && results.every(result => result.passed), results,
  realCompactionRuns: 0, packageAcceptance: 'not-performed', postReleaseSampling: 'not-performed' };
await writeFile(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
