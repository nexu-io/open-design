import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as repairDecision from '../../src/artifacts/deliverable-syntax-repair.js';
import { projectDeliverableSyntaxTelemetry } from '../../src/langfuse-bridge.js';

import { finalizeSuccessfulRunDeliverable } from '../../src/artifacts/successful-run-deliverable-finalization.js';
import { deliverableSyntaxFinalizerEnabled } from '../../src/artifacts/successful-run-deliverable-finalization.js';

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function projectFixture(file: string, content: string) {
  const projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-success-finalization-'));
  roots.push(projectsRoot);
  const projectId = 'project-1';
  const target = path.join(projectsRoot, projectId, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
  return { projectsRoot, projectId, target };
}

describe('successful physical Run deliverable finalization', () => {
  it('records an internal error at the delivery boundary without withholding the original artifact', async () => {
    const source = '<script>const items = [1;</script>';
    const fixture = await projectFixture('index.html', source);
    vi.spyOn(repairDecision, 'decideDeliverableSyntaxRepair').mockReturnValue({ action: 'accept', next: undefined });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await finalizeSuccessfulRunDeliverable({
      ...fixture, projectMetadata: { kind: 'prototype', entryFile: 'index.html' },
      artifactCount: 1, touchedPaths: ['index.html'], processTreeQuiescent: true,
    });
    expect(result).toMatchObject({ deliverable: { valid: true }, syntax: {
      action: 'warn', reason: 'internal_error', validation: {
        status: 'incomplete', reason: 'internal_error',
        finalization: { action: 'warn', reason: 'internal_error', committedPatchCount: 0 },
      },
    } });
    expect(log).toHaveBeenCalledWith('[deliverable-syntax] internal_error');
    expect(JSON.stringify(log.mock.calls)).not.toContain(source);
    await expect(fs.readFile(fixture.target, 'utf8')).resolves.toBe(source);
    if (result.syntax.action === 'skip') throw new Error('Missing syntax evidence');
    expect(projectDeliverableSyntaxTelemetry({ deliverableSyntaxValidation: result.syntax.validation, status: 'succeeded' })).toMatchObject({
      finalization: { reason: 'internal_error' }, recoveredDeliveryCount: 0, deliveredWithSyntaxWarningCount: 1,
    });
  });

  it('provides an environment kill switch while defaulting the candidate on', () => {
    expect(deliverableSyntaxFinalizerEnabled({})).toBe(true);
    expect(deliverableSyntaxFinalizerEnabled({ OD_DELIVERABLE_SYNTAX_FINALIZER: 'off' }))
      .toBe(false);
  });

  it('runs the Host finalizer from physical artifact evidence without strategy state', async () => {
    const fixture = await projectFixture(
      'index.html',
      '<!doctype html><script>const items = [1, 2;</script>',
    );

    const result = await finalizeSuccessfulRunDeliverable({
      projectsRoot: fixture.projectsRoot,
      projectId: fixture.projectId,
      projectMetadata: { kind: 'prototype', entryFile: 'index.html' },
      artifactCount: 1,
      touchedPaths: ['index.html'],
      processTreeQuiescent: true,
    });

    expect(result).toMatchObject({
      deliverable: { valid: true, artifactKind: 'html', entryFile: 'index.html' },
      syntax: {
        action: 'allow',
        validation: {
          source: 'run_finalizer',
          status: 'pass',
          repairState: { attempt: 1, mode: 'host_safe_fixer' },
        },
      },
    });
    await expect(fs.readFile(fixture.target, 'utf8'))
      .resolves.toBe('<!doctype html><script>const items = [1, 2];</script>');
  });

  it('warns on a known unsafe syntax error without changing the file', async () => {
    const source = '<!doctype html><script>const value = ;</script>';
    const fixture = await projectFixture('index.html', source);

    const result = await finalizeSuccessfulRunDeliverable({
      projectsRoot: fixture.projectsRoot,
      projectId: fixture.projectId,
      projectMetadata: { kind: 'prototype', entryFile: 'index.html' },
      artifactCount: 1,
      touchedPaths: ['index.html'],
      processTreeQuiescent: true,
    });

    expect(result.syntax).toMatchObject({ action: 'warn', reason: 'no_safe_fix' });
    await expect(fs.readFile(fixture.target, 'utf8')).resolves.toBe(source);
  });

  it('does not run the syntax finalizer for a pre-existing untouched entry', async () => {
    const fixture = await projectFixture('index.html', '<!doctype html><title>Old</title>');

    await expect(finalizeSuccessfulRunDeliverable({
      projectsRoot: fixture.projectsRoot,
      projectId: fixture.projectId,
      projectMetadata: { kind: 'prototype', entryFile: 'index.html' },
      artifactCount: 1,
      touchedPaths: ['notes.txt'],
      processTreeQuiescent: true,
    })).resolves.toMatchObject({
      deliverable: { valid: false, validation: 'entry_not_touched' },
      syntax: { action: 'skip' },
    });
  });

  it('checks the changed linked page while retaining the canonical entry (OPEND-2887)', async () => {
    const entry = '<!doctype html><a href="catalog.html">Catalog</a>';
    const source = '<!doctype html><script>const value = ;</script>';
    const fixture = await projectFixture('index.html', entry);
    const linkedPage = path.join(fixture.projectsRoot, fixture.projectId, 'catalog.html');
    await fs.writeFile(linkedPage, source, 'utf8');

    const result = await finalizeSuccessfulRunDeliverable({
      ...fixture,
      projectMetadata: { kind: 'prototype', entryFile: 'index.html' },
      artifactCount: 1,
      touchedPaths: ['catalog.html'],
      processTreeQuiescent: true,
    });

    expect(result).toMatchObject({
      deliverable: { valid: true, entryFile: 'index.html', linkedPage: 'catalog.html' },
      syntax: { action: 'warn', reason: 'no_safe_fix' },
    });
    await expect(fs.readFile(linkedPage, 'utf8')).resolves.toBe(source);
    await expect(fs.readFile(fixture.target, 'utf8')).resolves.toBe(entry);
  });

  it.each(['budget', 'cancel'] as const)('stops scoped finalization before mutation on %s', async (stop) => {
    const source = '<!doctype html><script>const items = [1, 2;</script>';
    const fixture = await projectFixture('index.html', source);
    const abort = new AbortController();
    if (stop === 'cancel') abort.abort();
    const result = await finalizeSuccessfulRunDeliverable({ ...fixture,
      projectMetadata: { kind: 'prototype', entryFile: 'index.html' }, artifactCount: 1,
      touchedPaths: ['index.html'], processTreeQuiescent: true,
      prototypeQuality: { userBrief: '支持 tab 切换', remainingBudgetMs: stop === 'budget' ? 0 : 30_000, signal: abort.signal } });
    expect(result.quality).toMatchObject({ status: 'incomplete', candidateHash: '',
      coverage: { expected: 0, checked: 0, complete: false },
      checks: [{ reason: stop === 'budget' ? 'host_budget_exhausted' : 'canceled' }] });
    await expect(fs.readFile(fixture.target, 'utf8')).resolves.toBe(source);
  });
  it('retains cautious host safe fixes and their initial failure under the shared deadline', async () => {
    const fixture = await projectFixture('index.html', '<!doctype html><main>静态内容</main><script>const items = [1, 2;</script>');
    const result = await finalizeSuccessfulRunDeliverable({ ...fixture,
      projectMetadata: { kind: 'prototype', entryFile: 'index.html' }, artifactCount: 1,
      touchedPaths: ['index.html'], processTreeQuiescent: true,
      prototypeQuality: { userBrief: '静态介绍页面，没有交互' } });
    expect(result.syntax).toMatchObject({ action: 'allow', validation: { finalization: {
      initialStatus: 'repairable', committedPatchCount: 1 } } });
    expect(result.quality?.initialStatus).toBe('fail');
    expect(result.quality?.durationMs).toBeGreaterThan(0);
    await expect(fs.readFile(fixture.target, 'utf8')).resolves.toContain('const items = [1, 2];');
  });

  it('does not check an unsettled candidate or pretend it has a verified hash', async () => {
    const fixture = await projectFixture('index.html', '<!doctype html><button>切换</button>');
    const result = await finalizeSuccessfulRunDeliverable({ ...fixture,
      projectMetadata: { kind: 'prototype', entryFile: 'index.html' }, artifactCount: 1,
      touchedPaths: ['index.html'], processTreeQuiescent: false, syntaxFinalizerEnabled: false,
      prototypeQuality: { userBrief: '支持主要 tab 切换' } });
    expect(result.quality).toMatchObject({ status: 'incomplete', candidateHash: '',
      coverage: { checked: 0, complete: false }, checks: [{ reason: 'process_tree_not_quiescent' }] });
  });
  it('records a scoped invalid entry as a fault with unknown candidate identity', async () => {
    const fixture = await projectFixture('notes.txt', 'No HTML was generated');
    const result = await finalizeSuccessfulRunDeliverable({ ...fixture,
      projectMetadata: { kind: 'prototype', entryFile: 'index.html' }, artifactCount: 1,
      touchedPaths: ['notes.txt'], processTreeQuiescent: true,
      prototypeQuality: { userBrief: '点餐应用，支持堂食自提' } });
    expect(result.quality).toMatchObject({ status: 'fail', candidateHash: '',
      checks: [{ id: 'canonical-entry', status: 'fail' }] });
  });

  it('records an explicit prototype fault even when the legacy syntax mutation switch is off', async () => {
    const source = '<!doctype html><button role="tab">堂食</button><button role="tab">自提</button><script>const value = ;</script>';
    const fixture = await projectFixture('index.html', source);
    const result = await finalizeSuccessfulRunDeliverable({ ...fixture,
      projectMetadata: { kind: 'prototype', entryFile: 'index.html' }, artifactCount: 1,
      touchedPaths: ['index.html'], processTreeQuiescent: true, syntaxFinalizerEnabled: false,
      prototypeQuality: { userBrief: '点餐应用，支持堂食和自提 tab 切换' } });
    expect(result).toMatchObject({ deliverable: { valid: true }, syntax: { action: 'skip' }, quality: { status: 'fail' } });
    expect(result.quality?.checks.some((check) => check.kind === 'syntax' && check.status === 'fail')).toBe(true);
    await expect(fs.readFile(fixture.target, 'utf8')).resolves.toBe(source);
  });

  it('skips syntax mutation when the kill switch is off', async () => {
    const source = '<!doctype html><script>const items = [1, 2;</script>';
    const fixture = await projectFixture('index.html', source);

    await expect(finalizeSuccessfulRunDeliverable({
      projectsRoot: fixture.projectsRoot,
      projectId: fixture.projectId,
      projectMetadata: { kind: 'prototype', entryFile: 'index.html' },
      artifactCount: 1,
      touchedPaths: ['index.html'],
      processTreeQuiescent: true,
      syntaxFinalizerEnabled: false,
    })).resolves.toMatchObject({
      deliverable: { valid: true },
      syntax: { action: 'skip' },
    });
    await expect(fs.readFile(fixture.target, 'utf8')).resolves.toBe(source);
  });
});
