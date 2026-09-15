import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanSourceIdentity, readExecutionSourceReceipt, writeSourceBuildReceipt } from '../../src/runtimes/execution-source-receipt.js';
import { createChatRunService } from '../../src/runtimes/runs.js';

const roots: string[] = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-source-receipt-')); roots.push(root);
  const daemon = path.join(root, 'apps/daemon');
  fs.mkdirSync(path.join(daemon, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(daemon, 'package.json'), JSON.stringify({ name: '@open-design/daemon', dependencies: {} }));
  fs.mkdirSync(path.join(root, 'packages'), { recursive: true });
  fs.writeFileSync(path.join(root, '.gitignore'), '**/dist/\nnode_modules/\n');
  fs.writeFileSync(path.join(root, 'source.ts'), 'export const generation = 1;\n');
  fs.writeFileSync(path.join(daemon, 'dist/server.js'), 'export const generation = 1;\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  return { root, daemon };
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
describe('daemon executed source identity', () => {
  it('binds a clean build to actual output bytes and detects stale or modified builds', () => {
    const f = fixture(), before = cleanSourceIdentity(f.root);
    expect(before).toMatch(/^[a-f0-9]{40}$/);
    const built = writeSourceBuildReceipt(f.root, before);
    expect(readExecutionSourceReceipt(f.daemon)).toMatchObject({ sourceSha: before, buildSha256: built.buildSha256, processId: process.pid, incompleteReason: null });
    fs.writeFileSync(path.join(f.daemon, 'dist/server.js'), 'different executable');
    expect(readExecutionSourceReceipt(f.daemon)).toMatchObject({ sourceSha: null, incompleteReason: 'runtime_output_changed_after_build' });
  });
  it('refuses tracked and untracked source changes but ignores dist/node_modules', () => {
    const f = fixture(), before = cleanSourceIdentity(f.root);
    fs.mkdirSync(path.join(f.root, 'node_modules')); fs.writeFileSync(path.join(f.root, 'node_modules/runtime.js'), 'dependency');
    expect(cleanSourceIdentity(f.root)).toBe(before);
    fs.writeFileSync(path.join(f.root, 'new-source.ts'), 'uncommitted source');
    expect(cleanSourceIdentity(f.root)).toBeNull();
    expect(writeSourceBuildReceipt(f.root, before).sourceSha).toBeNull();
    fs.rmSync(path.join(f.root, 'new-source.ts'));
    fs.writeFileSync(path.join(f.root, 'source.ts'), 'changed tracked source');
    expect(cleanSourceIdentity(f.root)).toBeNull();
  });
  it('leaves old or packaged builds without verifiable receipts explicitly unknown', () => {
    const f = fixture();
    expect(readExecutionSourceReceipt(f.daemon)).toMatchObject({ sourceSha: null, buildSha256: null, incompleteReason: 'source_build_receipt_unavailable' });
  });

  it('persists each Run source receipt across service restart without replacing old identity', () => {
    const f = fixture();
    const options = { createSseResponse: () => ({ send: () => {}, end: () => {} }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }), runsLogDir: path.join(f.root, 'runtime-data/runs') };
    // The legacy @ts-nocheck service infers its null defaults literally.
    const serviceOptions = options as unknown as Parameters<typeof createChatRunService>[0];
    const first = createChatRunService(serviceOptions);
    const run = first.create({ agentId: 'amr' });
    const observed = { schemaVersion: 'od-execution-source-v1', sourceSha: 'a'.repeat(40), buildSha256: 'b'.repeat(64), processId: 123, observedAt: 100, incompleteReason: null };
    Object.assign(run, { executionSourceReceipt: observed, status: 'succeeded', terminalAt: 200 });
    first.persistState(run);
    const restored = createChatRunService(serviceOptions).get(run.id);
    expect(restored.executionSourceReceipt).toEqual(observed);
    const statePath = path.join(options.runsLogDir, run.id, 'state.json');
    const legacy = JSON.parse(fs.readFileSync(statePath, 'utf8')); delete legacy.executionSourceReceipt;
    fs.writeFileSync(statePath, JSON.stringify(legacy));
    expect(createChatRunService(serviceOptions).get(run.id).executionSourceReceipt).toBeUndefined();
  });
});
