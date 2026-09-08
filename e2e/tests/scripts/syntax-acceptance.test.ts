import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureUntrackedSourceIdentity, collectRealEvidence, loadReplayFixtures, replayCaseVerdict, runSyntaxAcceptance } from '../../scripts/syntax-acceptance.ts';

const { runtime } = vi.hoisted(() => ({ runtime: {
  startWeb: vi.fn(), logs: vi.fn(async () => ({})), stopWeb: vi.fn(async () => ({ stopped: true })),
  status: vi.fn(async () => ({ apps: { daemon: { state: 'stopped', pid: null }, web: { state: 'stopped', pid: null } } })),
} }));
vi.mock('../../lib/tools-dev/runtime.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../../lib/tools-dev/runtime.ts')>(),
  createToolsDevSuite: () => runtime,
}));

const scratchRoots: string[] = [];
const scratch = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'syntax-acceptance-contract-'));
  scratchRoots.push(root);
  return root;
};
afterEach(async () => {
  await Promise.all(scratchRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
const metrics = { strategyRoute: 'od-next', agent: 'open-design:amr', model: 'deepseek-v4-flash', deliverableSyntax: { status: 'pass' } };

describe('syntax acceptance evidence contract', () => {
  it('[P1] includes sorted untracked source paths and detects helper content changes outside git diff', async () => {
    const root = await scratch();
    const exec = promisify(execFile);
    await exec('git', ['init', '--quiet', root]);
    await mkdir(path.join(root, 'apps/daemon'), { recursive: true });
    await mkdir(path.join(root, 'packages/contracts'), { recursive: true });
    await writeFile(path.join(root, '.gitignore'), 'ignored.ts\n');
    await writeFile(path.join(root, 'apps/daemon/ignored.ts'), 'ignored');
    await writeFile(path.join(root, 'apps/daemon/tracked.ts'), 'tracked');
    await exec('git', ['add', 'apps/daemon/tracked.ts'], { cwd: root });
    await writeFile(path.join(root, 'packages/contracts/z.ts'), 'contract');
    await writeFile(path.join(root, 'apps/daemon/quote-helper.ts'), 'before');
    await writeFile(path.join(root, 'outside.ts'), 'outside scope');
    const before = await captureUntrackedSourceIdentity(root);
    expect(before.untrackedFiles.map(entry => entry.path)).toEqual(['apps/daemon/quote-helper.ts', 'packages/contracts/z.ts']);
    expect(before.untrackedFiles.every(entry => /^[a-f0-9]{64}$/.test(entry.sha256))).toBe(true);
    await writeFile(path.join(root, 'apps/daemon/quote-helper.ts'), 'after');
    const after = await captureUntrackedSourceIdentity(root);
    expect(after.untrackedFilesSha256).not.toBe(before.untrackedFilesSha256);
    expect(after.untrackedFiles[1]).toEqual(before.untrackedFiles[1]);
  });

  it('[P1] loads complete external HTML and requires an exact expected artifact for delivery', async () => {
    const root = await scratch();
    const before = '<!doctype html><p>untouched</p><script>const x = [1;</script>';
    const after = '<!doctype html><p>untouched</p><script>const x = [1];</script>';
    await writeFile(path.join(root, 'before.html'), before);
    await writeFile(path.join(root, 'after.html'), after);
    await writeFile(path.join(root, 'fixtures.json'), JSON.stringify({ fixtures: [
      { id: 'whole-page', before: 'before.html', after: 'after.html', action: 'allow', attempts: 1 },
    ] }));
    const [fixture] = await loadReplayFixtures(path.join(root, 'fixtures.json'));
    if (!fixture) throw new Error('Missing loaded fixture');
    expect(fixture.source).toBe(before);
    expect(fixture.expected).toBe(after);
    const run = { status: 'succeeded', deliverableSyntaxValidation: { status: 'pass', repairState: { attempt: 1 }, metrics: { appliedRepairRules: ['insert_missing_closing_delimiter'] }, finalization: { action: 'allow', summaryVersion: 1, repairEngine: 'host-safe-fixer@2', initialStatus: 'repairable', stagedPatchCount: 1, committedPatchCount: 1, committedRepairRules: ['insert_missing_closing_delimiter'] } } };
    expect(replayCaseVerdict(fixture, run, after).passed).toBe(true);
    expect(replayCaseVerdict(fixture, run, after.replace('untouched', 'wrong')).passed).toBe(false);
    expect(await readFile(path.join(root, 'before.html'), 'utf8')).toBe(before);
  });

  it('[P1] rejects an allow fixture without an expected artifact and unsafe fixture IDs', async () => {
    const root = await scratch();
    await writeFile(path.join(root, 'before.html'), '<script>const x = ;</script>');
    for (const fixture of [
      { id: 'no-oracle', before: 'before.html', action: 'allow' },
      { id: '../escape', before: 'before.html', action: 'fail' },
    ]) {
      await writeFile(path.join(root, 'fixtures.json'), JSON.stringify({ fixtures: [fixture] }));
      await expect(loadReplayFixtures(path.join(root, 'fixtures.json'))).rejects.toThrow();
    }
  });

  it('[P1] requires committed terminal evidence, not just a passing staged candidate', () => {
    const fixture = { id: 'summary', source: 'broken', expected: 'fixed', action: 'allow' as const, attempts: 1 };
    const finalization = { action: 'allow', summaryVersion: 1, initialStatus: 'repairable', repairEngine: 'host-safe-fixer@2', stagedPatchCount: 1, committedPatchCount: 1, committedRepairRules: ['close_unterminated_string'] };
    const run = { status: 'succeeded', deliverableSyntaxValidation: { status: 'pass', repairState: { attempt: 1 }, metrics: { appliedRepairRules: ['close_unterminated_string'] }, finalization } };
    expect(replayCaseVerdict(fixture, run, 'fixed').passed).toBe(true);
    for (const invalid of [
      { ...finalization, committedPatchCount: 0 },
      { ...finalization, summaryVersion: undefined },
      { ...finalization, committedRepairRules: [] },
      { ...finalization, initialStatus: 'pass' },
    ]) {
      expect(replayCaseVerdict(fixture, { ...run, deliverableSyntaxValidation: { ...run.deliverableSyntaxValidation, finalization: invalid } }, 'fixed').passed).toBe(false);
    }
  });

  it('[P1] failed finalization requires unchanged bytes and does not count terminal timing as delivery', () => {
    const fixture = { id: 'rejected', source: '<script>const x = ;</script>', expected: '<script>const x = ;</script>', action: 'fail' as const, refusal: 'unsupported_syntax_error' };
    const run = { status: 'failed', deliverableSyntaxValidation: { status: 'repairable', metrics: { repairToDeliveryDurationMs: 194 }, finalization: { action: 'fail', refusal: 'unsupported_syntax_error', summaryVersion: 1, repairEngine: 'host-safe-fixer@2', initialStatus: 'repairable', stagedPatchCount: 0, committedPatchCount: 0, committedRepairRules: [] } } };
    expect(replayCaseVerdict(fixture, run, fixture.source)).toMatchObject({ passed: true, beforeAfterEqual: true, expectedAfterEqual: true, discoveryToDeliveryMs: null, discoveryToBlockedTerminalMs: 194 });
    expect(replayCaseVerdict(fixture, run, 'changed').passed).toBe(false);
  });

  it('[P1] retains completed cases from events after runner interruption and separates unfinished from not started', async () => {
    const root = await scratch();
    await writeFile(path.join(root, 'events.jsonl'), [
      { type: 'case_started', evalId: 'done' },
      { type: 'case_finished', evalId: 'done', status: 'succeeded', metrics },
      { type: 'case_started', evalId: 'interrupted' },
    ].map(entry => JSON.stringify(entry)).join('\n') + '\n');
    const recovered = await collectRealEvidence(root, ['done', 'interrupted', 'not-started']);
    expect(recovered.cases).toHaveLength(1);
    expect(recovered.cases[0]).toMatchObject({ evalId: 'done', status: 'succeeded', passed: true });
    expect(recovered.collection).toMatchObject({ complete: false, source: 'events', finishedCaseCount: 1, unfinishedCaseIds: ['interrupted'], notStartedCaseIds: ['not-started'] });
  });

  it('[P1] prefers result cases but recovers missing entries from events without duplicating completed cases', async () => {
    const root = await scratch();
    await writeFile(path.join(root, 'result.json'), JSON.stringify({ cases: [{ evalId: 'one', status: 'succeeded', metrics }] }));
    await writeFile(path.join(root, 'events.jsonl'), ['one', 'two'].map(evalId => JSON.stringify({ type: 'case_finished', evalId, status: 'succeeded', metrics })).join('\n'));
    const recovered = await collectRealEvidence(root, ['one', 'two']);
    expect(recovered.cases).toHaveLength(2);
    expect(recovered.collection).toMatchObject({ complete: true, source: 'result+events', finishedCaseCount: 2 });
  });

  it('[P1] reports malformed or unexpected evidence without discarding earlier finished records', async () => {
    const root = await scratch();
    await writeFile(path.join(root, 'events.jsonl'), JSON.stringify({ type: 'case_finished', evalId: 'unexpected', status: 'succeeded', metrics }) + '\n{"type":');
    const recovered = await collectRealEvidence(root, ['expected']);
    expect(recovered.cases).toHaveLength(1);
    expect(recovered.collection.complete).toBe(false);
    expect(recovered.collection.unexpectedCaseIds).toEqual(['unexpected']);
    expect(recovered.collection.evidenceErrors).toHaveLength(1);
  });

  it('[P1] failed preflight still persists sourceAfter and confirmed cleanup without starting a runtime', async () => {
    const previousExitCode = process.exitCode;
    try {
      // Explicitly invalid profile fails before build/login/start; all lifecycle operations below are mocked.
      const result = await runSyntaxAcceptance(['--mode', 'real', '--profile', 'prod']);
      scratchRoots.push(result.root);
      expect(result.status).toBe('BLOCKED');
      expect(result.error).toContain('requires --profile test');
      expect(runtime.startWeb).not.toHaveBeenCalled();
      expect(result.sourceAfter).toMatchObject({ branch: expect.any(String), commit: expect.any(String), harnessSha256: expect.any(String) });
      expect(result.cleanup).toMatchObject({ attempted: true, stopped: true });
      const persisted = JSON.parse(await readFile(path.join(result.root, 'report.json'), 'utf8'));
      expect(persisted.sourceAfter).toEqual(result.sourceAfter);
      expect(persisted.cleanup.stopped).toBe(true);
    } finally { process.exitCode = previousExitCode; }
  });
});
