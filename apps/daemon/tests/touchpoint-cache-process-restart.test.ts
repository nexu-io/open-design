// Real SIGKILL and fresh process, rather than a second instance in one VM.
import { fork, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function recordEvidence(value: object) {
  console.info(JSON.stringify(value));
  const log = process.env.CMS_CACHE_PROCESS_RECEIPTS;
  if (log) appendFileSync(log, `${JSON.stringify(value)}\n`);
}

type Receipt = { command: string; pid: number; key: string | null; alias: string | null; account: string | null; dispatches: number; authorizations: number; keySchedule: string | null; error?: string };
const fixture = fileURLToPath(new URL('./helpers/touchpoint-cache-process.ts', import.meta.url));
async function start(dataDir: string) {
  const child = fork(fixture, [dataDir], { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let stderr = '';
  child.stderr?.on('data', chunk => { stderr += String(chunk); });
  const waitMessage = () => new Promise<Receipt>((resolve, reject) => {
    const onExit = (code: number | null, signal: string | null) => reject(new Error(`child exited ${code}/${signal}: ${stderr}`));
    child.once('exit', onExit);
    child.once('message', result => { child.off('exit', onExit); resolve(result as Receipt); });
  });
  await waitMessage();
  return { child, send: async (message: object) => { const pending = waitMessage(); child.send(message); return pending; } };
}
async function terminate(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<{ code: number | null; signal: string | null }>(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  child.kill('SIGKILL');
  const result = await exited;
  expect(result).toEqual({ code: null, signal: 'SIGKILL' });
  return { pid: child.pid, ...result };
}

describe('touchpoint authority across OS process death', () => {
  it.each(['assembly-read', 'assembly-enumeration'])('does not revive a 404 when %s fails but journal writes succeed', async fault => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'touchpoint-process-'));
    const children: ChildProcess[] = [];
    try {
      const first = await start(dataDir); children.push(first.child);
      await first.send({ command: 'seed' });
      const refused = await first.send({ command: 'refuse', status: 404, fault });
      expect(refused.error).toBeUndefined(); expect(refused.key).toBeNull();
      const exit = await terminate(first.child);
      const second = await start(dataDir); children.push(second.child);
      const restarted = await second.send({ command: 'probe' });
      expect(restarted.error).toBeUndefined(); expect(restarted.pid).not.toBe(refused.pid);
      expect(restarted.key).toBeNull(); expect(restarted.alias).toBe('deployment-1');
      expect(restarted.account).toBe('deployment-1'); expect(restarted.authorizations).toBe(0);
      recordEvidence({ case: `404-${fault}-sigkill`, refused, exit, restarted });
    } finally { for (const child of children.reverse()) await terminate(child); rmSync(dataDir, { recursive: true, force: true }); }
  });
  it.each([401, 403, 404, 410])('persists %s through successful/fallback refusal and process restart', async status => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'touchpoint-process-'));
    const children: ChildProcess[] = [];
    try {
      const first = await start(dataDir); children.push(first.child);
      expect((await first.send({ command: 'seed' })).key).toBe('deployment-1');
      const refused = await first.send({ command: 'refuse', status, fault: status === 410 ? 'delete' : 'rename' });
      expect(refused.key).toBeNull();
      // A global write fault can prevent unrelated clock high-water persistence too;
      // account isolation is checked after the storage fault dies with this process.
      const exit = await terminate(first.child);
      const second = await start(dataDir); children.push(second.child);
      const restarted = await second.send({ command: 'probe' });
      expect(restarted.pid).not.toBe(refused.pid); expect(restarted.authorizations).toBe(0);
      expect(restarted.key).toBeNull(); expect(restarted.account).toBe('deployment-1');
      expect(restarted.alias).toBe(status === 404 ? 'deployment-1' : null);
      expect((await second.send({ command: 'fresh' })).key).toBe('deployment-1');
      recordEvidence({ case: `persist-${status}`, refused, exit, restarted });
    } finally { for (const child of children.reverse()) await terminate(child); rmSync(dataDir, { recursive: true, force: true }); }
  });
  it.each([401, 410])('persists recovered %s before death across all affected locales', async status => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'touchpoint-process-'));
    const children: ChildProcess[] = [];
    try {
      const first = await start(dataDir); children.push(first.child);
      await first.send({ command: 'seed' });
      expect((await first.send({ command: 'refuse', status, fault: 'all' })).key).toBeNull();
      const recovered = await first.send({ command: 'recover' });
      expect(recovered.key).toBeNull(); expect(recovered.alias).toBeNull();
      const exit = await terminate(first.child);
      const second = await start(dataDir); children.push(second.child);
      const restarted = await second.send({ command: 'probe' });
      expect(restarted.key).toBeNull(); expect(restarted.alias).toBeNull(); expect(restarted.account).toBe('deployment-1');
      recordEvidence({ case: `recovered-${status}`, recovered, exit, restarted });
    } finally { for (const child of children.reverse()) await terminate(child); rmSync(dataDir, { recursive: true, force: true }); }
  });
  it('does not replay withdrawn authority after all persistence fails and the process dies', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'touchpoint-process-'));
    const children: ChildProcess[] = [];
    try {
      const first = await start(dataDir); children.push(first.child);
      await first.send({ command: 'seed' });
      const refused = await first.send({ command: 'refuse', status: 410, fault: 'all' });
      expect(refused.key).toBeNull(); expect(refused.alias).toBeNull();
      const exit = await terminate(first.child);
      // Injection dies with the OS process: disk is writable again, but no refusal was persisted.
      const second = await start(dataDir); children.push(second.child);
      const restarted = await second.send({ command: 'probe' });
      expect(restarted.key).toBeNull(); expect(restarted.alias).toBeNull();
      expect(restarted.authorizations).toBe(0);
      expect(restarted.account).toBe('deployment-1');
      recordEvidence({ case: 'all-io-denial-sigkill-offline-safety', refused, exit, restarted });
    } finally { for (const child of children.reverse()) await terminate(child); rmSync(dataDir, { recursive: true, force: true }); }
  });
  it.each([401, 403, 404, 410])('quarantines ambiguous %s after total I/O failure through protected production paths', async status => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'touchpoint-process-'));
    const children: ChildProcess[] = [];
    try {
      const first = await start(dataDir); children.push(first.child);
      expect((await first.send({ command: 'seed' })).key).toBe('deployment-1');
      const refused = await first.send({ command: 'refuse', status, fault: 'all', events: status === 401 || status === 403, held: status === 410 });
      expect(refused.error).toBeUndefined(); expect(refused.key).toBeNull();
      const exit = await terminate(first.child);
      const second = await start(dataDir); children.push(second.child);
      const restarted = await second.send({ command: 'probe' });
      expect(restarted.error).toBeUndefined(); expect(restarted.pid).not.toBe(refused.pid);
      expect(restarted.key).toBeNull(); expect(restarted.alias).toBeNull(); expect(restarted.account).toBe('deployment-1');
      recordEvidence({ case: `protected-total-io-${status}`, refused, exit, restarted });
    } finally { for (const child of children.reverse()) await terminate(child); rmSync(dataDir, { recursive: true, force: true }); }
  });
  it.each(['SIGKILL', 'clean'] as const)('preserves a healthy settled account and schedule after %s between requests', async kind => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'touchpoint-process-'));
    const children: ChildProcess[] = [];
    try {
      const first = await start(dataDir); children.push(first.child);
      const seeded = await first.send({ command: 'seed' }); expect(seeded.key).toBe('deployment-1');
      if (kind === 'clean') await first.send({ command: 'close' });
      const exit = await terminate(first.child);
      const second = await start(dataDir); children.push(second.child);
      const restarted = await second.send({ command: 'probe' });
      expect(restarted.pid).not.toBe(seeded.pid); expect(restarted.key).toBe('deployment-1');
      expect(restarted.keySchedule).toBe(seeded.keySchedule); expect(restarted.authorizations).toBe(0);
      expect(restarted.alias).toBe('deployment-1'); expect(restarted.account).toBe('deployment-1');
      recordEvidence({ case: `healthy-${kind}`, seeded, exit, restarted });
    } finally { for (const child of children.reverse()) await terminate(child); rmSync(dataDir, { recursive: true, force: true }); }
  });
  it.each([false, true])('fresh authorization restores only its own recovered key (trimmed=%s)', async trimmed => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'touchpoint-process-'));
    const children: ChildProcess[] = [];
    try {
      const first = await start(dataDir); children.push(first.child); await first.send({ command: 'seed' });
      await first.send({ command: 'refuse', status: 410, fault: 'all' }); await terminate(first.child);
      const second = await start(dataDir); children.push(second.child);
      expect((await second.send({ command: 'probe' })).key).toBeNull();
      const renewed = await second.send({ command: 'fresh', trimmed });
      expect(renewed.key).toBe('deployment-1'); expect(renewed.alias).toBeNull(); expect(renewed.account).toBe('deployment-1');
      await terminate(second.child);
      const third = await start(dataDir); children.push(third.child);
      const restarted = await third.send({ command: 'probe' });
      expect(restarted.key).toBe('deployment-1'); expect(restarted.alias).toBeNull(); expect(restarted.account).toBe('deployment-1');
      recordEvidence({ case: `recovered-renewal-${trimmed}`, renewed, restarted });
    } finally { for (const child of children.reverse()) await terminate(child); rmSync(dataDir, { recursive: true, force: true }); }
  });
  it('a real competing process cannot dispatch, replay or clear another owner evidence', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'touchpoint-process-'));
    const children: ChildProcess[] = [];
    try {
      const first = await start(dataDir); children.push(first.child); await first.send({ command: 'seed' });
      const journals = () => readdirSync(path.join(dataDir, 'touchpoint-content-cache')).map(scope => readFileSync(path.join(dataDir, 'touchpoint-content-cache', scope, 'replay-authority.json'), 'utf8'));
      const before = journals();
      const contender = await start(dataDir); children.push(contender.child);
      const blocked = await contender.send({ command: 'seed' });
      expect(journals()).toEqual(before);
      expect(blocked.dispatches).toBe(0); expect(blocked.key).toBeNull(); expect(blocked.alias).toBeNull(); expect(blocked.account).toBeNull();
      expect((await first.send({ command: 'probe' })).key).toBe('deployment-1');
      await terminate(first.child);
      const recovered = await contender.send({ command: 'fresh' });
      expect(recovered.pid).toBe(blocked.pid); expect(recovered.authorizations).toBe(1);
      expect(recovered.key).toBe('deployment-1');
      // The contender booted before the incumbent's last clock high-water
      // write. Its unchanged clock-safety rule can quarantine that old alias.
      await terminate(contender.child);
      const successor = await start(dataDir); children.push(successor.child);
      const restarted = await successor.send({ command: 'probe' });
      expect(restarted.key).toBe('deployment-1'); expect(restarted.alias).toBe('deployment-1');
      recordEvidence({ case: 'exclusive-two-process-ownership', blocked, restarted });
    } finally { for (const child of children.reverse()) await terminate(child); rmSync(dataDir, { recursive: true, force: true }); }
  });
  it('pre-dispatch persistence failure sends no production request', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'touchpoint-process-'));
    const children: ChildProcess[] = [];
    try {
      const first = await start(dataDir); children.push(first.child);
      const seeded = await first.send({ command: 'seed' });
      const blocked = await first.send({ command: 'pre-fault', fault: 'all' });
      expect(blocked.dispatches).toBe(seeded.dispatches); expect(blocked.key).toBeNull();
      await first.send({ command: 'recover' });
      const recovered = await first.send({ command: 'fresh' });
      expect(recovered.pid).toBe(blocked.pid); expect(recovered.key).toBe('deployment-1');
      expect(recovered.authorizations).toBe(seeded.authorizations + 1);
      recordEvidence({ case: 'pre-marker-no-dispatch-then-recovery', seeded, blocked, recovered });
    } finally { for (const child of children.reverse()) await terminate(child); rmSync(dataDir, { recursive: true, force: true }); }
  });

});
