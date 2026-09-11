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
