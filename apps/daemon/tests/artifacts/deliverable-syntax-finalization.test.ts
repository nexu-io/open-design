import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { finalizeDeliverableSyntax } from '../../src/artifacts/deliverable-syntax-finalization.js';
import { checkDeliverableSyntax } from '../../src/artifacts/deliverable-syntax.js';
import * as safeFix from '../../src/artifacts/deliverable-syntax-safe-fix.js';

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => (
    fs.rm(root, { recursive: true, force: true })
  )));
});

async function htmlFixture(source: string): Promise<string> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-syntax-finalizer-'));
  roots.push(projectRoot);
  await fs.writeFile(path.join(projectRoot, 'index.html'), source, 'utf8');
  return projectRoot;
}

describe('deliverable syntax finalization', () => {
  it('accepts a parse-valid final Web deliverable', async () => {
    const projectRoot = await htmlFixture(
      '<!doctype html><script>const ready = true;</script>',
    );

    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html',
      projectRoot,
      entryFile: 'index.html',
      processTreeQuiescent: true,
      checkedAt: 123,
      previousMetrics: {
        schema: 'open-design.deliverable-syntax-metrics/v1',
        checkCount: 2,
        checkerDurationMs: 9,
        repairableCheckCount: 1,
        initialDiagnosticCount: 1,
        latestDiagnosticCount: 1,
        firstRepairableAtMs: 100,
      },
      monotonicNow: (() => {
        const values = [100, 107];
        return () => values.shift() ?? 107;
      })(),
    })).resolves.toMatchObject({
      action: 'allow',
      validation: {
        status: 'pass',
        source: 'run_finalizer',
        checkedAt: 123,
        finalization: {
          action: 'allow', summaryVersion: 1, initialStatus: 'pass',
          repairEngine: 'host-safe-fixer@2', stagedPatchCount: 0,
          committedPatchCount: 0, committedRepairRules: [],
        },
        metrics: {
          checkCount: 3,
          checkerDurationMs: 16,
          repairableCheckCount: 1,
          initialDiagnosticCount: 1,
          latestDiagnosticCount: 0,
          firstRepairableAtMs: 100,
          repairPassedAtMs: 123,
          repairWindowDurationMs: 23,
        },
      },
    });
  });

  it('blocks terminal success when the final Web candidate is still broken', async () => {
    const projectRoot = await htmlFixture(
      '<!doctype html><script>const broken = ;</script>',
    );

    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html',
      projectRoot,
      entryFile: 'index.html',
      processTreeQuiescent: true,
    })).resolves.toMatchObject({
      action: 'fail',
      reason: 'no_safe_fix',
      location: expect.stringMatching(/^index\.html:1:/u),
      validation: {
        status: 'repairable', source: 'run_finalizer',
        finalization: { action: 'fail', reason: 'no_safe_fix', refusal: 'unsupported_syntax_error' },
        metrics: { safeFixProposalCount: 1, safeFixProposalDurationMs: expect.any(Number) },
      },
    });
    await expect(fs.readFile(path.join(projectRoot, 'index.html'), 'utf8'))
      .resolves.toBe('<!doctype html><script>const broken = ;</script>');
  });

  it('repairs in memory, verifies the complete candidate, then commits once', async () => {
    const projectRoot = await htmlFixture(
      '<!doctype html><script>function ready() { const items = [1, 2;</script>',
    );

    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html',
      projectRoot,
      entryFile: 'index.html',
      processTreeQuiescent: true,
    })).resolves.toMatchObject({
      action: 'allow',
      validation: {
        status: 'pass',
        source: 'run_finalizer',
        finalization: {
          action: 'allow', summaryVersion: 1, initialStatus: 'repairable',
          repairEngine: 'host-safe-fixer@2', stagedPatchCount: 2,
          committedPatchCount: 2, committedRepairRules: ['insert_missing_closing_delimiter'],
        },
        repairState: {
          mode: 'host_safe_fixer',
          attempt: 2,
          maxAttempts: 8,
        },
        metrics: {
          checkCount: 3,
          repairableCheckCount: 2,
          repairExecutor: 'host_safe_fixer',
          safeFixProposalCount: 2,
          appliedRepairRules: ['insert_missing_closing_delimiter'],
        },
      },
    });
    await expect(fs.readFile(path.join(projectRoot, 'index.html'), 'utf8'))
      .resolves.toBe(
        '<!doctype html><script>function ready() { const items = [1, 2];}</script>',
      );
  });

  it('does not publish any staged bytes when eight program patches are insufficient', async () => {
    const source = `<script>const items = ${'['.repeat(9)}1;</script>`;
    const projectRoot = await htmlFixture(source);

    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html',
      projectRoot,
      entryFile: 'index.html',
      processTreeQuiescent: true,
    })).resolves.toMatchObject({
      action: 'fail',
      reason: 'attempt_limit_reached',
      validation: {
        status: 'repairable',
        repairState: { attempt: 8, maxAttempts: 8, mode: 'host_safe_fixer' },
        metrics: { checkCount: 9, repairableCheckCount: 9 },
        finalization: {
          action: 'fail', initialStatus: 'repairable', stagedPatchCount: 8,
          committedPatchCount: 0, committedRepairRules: [],
        },
      },
    });
    await expect(fs.readFile(path.join(projectRoot, 'index.html'), 'utf8'))
      .resolves.toBe(source);
  });

  it('discards staged patches when the cooperative repair deadline expires', async () => {
    const source = '<script>const one = \'ready";\nconst two = \'done";</script>';
    const projectRoot = await htmlFixture(source);
    const times = [0, 1, 1, 2, 2, 5, 1002];
    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html', projectRoot, entryFile: 'index.html', processTreeQuiescent: true,
      monotonicNow: () => times.shift() ?? 1002,
    })).resolves.toMatchObject({
      action: 'fail', reason: 'repair_budget_exceeded',
      validation: { repairState: { attempt: 1, maxAttempts: 8 } },
    });
    await expect(fs.readFile(path.join(projectRoot, 'index.html'), 'utf8')).resolves.toBe(source);
  });

  it('does not apply the repair-only deadline to an already-valid file', async () => {
    const source = '<script>const ready = true;</script>';
    const projectRoot = await htmlFixture(source);
    const times = [0, 10000];
    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html', projectRoot, entryFile: 'index.html', processTreeQuiescent: true,
      monotonicNow: () => times.shift() ?? 10000,
    })).resolves.toMatchObject({ action: 'allow', validation: { status: 'pass' } });
    await expect(fs.readFile(path.join(projectRoot, 'index.html'), 'utf8')).resolves.toBe(source);
  });

  it('discards all staged patches when the edited-character budget would be exceeded', async () => {
    const attrs = Array.from({ length: 6 }, (_, i) => ` data-a${i}="value"`).join('');
    const source = `<script>\n${Array.from({ length: 3 }, (_, i) => `const s${i} = "<span${attrs}>hi</span>";`).join('\n')}\n</script>`;
    const projectRoot = await htmlFixture(source);
    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html', projectRoot, entryFile: 'index.html', processTreeQuiescent: true,
    })).resolves.toMatchObject({
      action: 'fail', reason: 'repair_budget_exceeded',
      validation: { repairState: { attempt: 2, maxAttempts: 8 } },
    });
    await expect(fs.readFile(path.join(projectRoot, 'index.html'), 'utf8')).resolves.toBe(source);
  });

  it('skips non-Web deliverables before touching the filesystem', async () => {
    await expect(finalizeDeliverableSyntax({
      artifactKind: 'pdf',
      projectRoot: '/path/that/does/not/exist',
      entryFile: 'report.pdf',
      processTreeQuiescent: true,
    })).resolves.toEqual({ action: 'skip' });
  });

  it('starts a fresh Host budget even when the Agent already exhausted the same candidate', async () => {
    const projectRoot = await htmlFixture('<script>const items = [1;</script>');
    const checked = await checkDeliverableSyntax({ projectRoot, entryFile: 'index.html' });
    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html', projectRoot, entryFile: 'index.html', processTreeQuiescent: true,
      repairState: {
        schema: 'open-design.deliverable-syntax-repair/v1', mode: 'agent_tool',
        attempt: 3, maxAttempts: 3, checker: 'web-syntax@1', candidateHash: checked.candidateHash!,
      },
    })).resolves.toMatchObject({
      action: 'allow', validation: {
        repairState: { mode: 'host_safe_fixer', attempt: 1, maxAttempts: 8 },
        finalization: { initialStatus: 'repairable', stagedPatchCount: 1, committedPatchCount: 1 },
      },
    });
  });

  it.each(['concurrent_modification', 'write_failed'] as const)(
    'does not count a passing staged candidate as committed when commit returns %s', async (reason) => {
      const source = '<script>const items = [1;</script>';
      const projectRoot = await htmlFixture(source);
      vi.spyOn(safeFix, 'commitDeliverableSyntaxSafeFix').mockResolvedValue({ action: 'none', reason });
      await expect(finalizeDeliverableSyntax({
        artifactKind: 'html', projectRoot, entryFile: 'index.html', processTreeQuiescent: true,
      })).resolves.toMatchObject({
        action: 'fail', validation: {
          status: 'pass', finalization: {
            action: 'fail', initialStatus: 'repairable', stagedPatchCount: 1,
            committedPatchCount: 0, committedRepairRules: [],
          },
        },
      });
      await expect(fs.readFile(path.join(projectRoot, 'index.html'), 'utf8')).resolves.toBe(source);
    },
  );

  it('does not commit a passing staged candidate after the cooperative deadline', async () => {
    const source = '<script>const items = [1;</script>';
    const projectRoot = await htmlFixture(source);
    const times = [0, 1, 1, 2, 2, 5, 1002];
    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html', projectRoot, entryFile: 'index.html', processTreeQuiescent: true,
      monotonicNow: () => times.shift() ?? 1002,
    })).resolves.toMatchObject({
      action: 'fail', reason: 'repair_budget_exceeded', validation: {
        status: 'pass', finalization: {
          initialStatus: 'repairable', stagedPatchCount: 1, committedPatchCount: 0,
          committedRepairRules: [],
        },
      },
    });
    await expect(fs.readFile(path.join(projectRoot, 'index.html'), 'utf8')).resolves.toBe(source);
  });

  it('blocks an inconclusive check while the process tree is not quiet', async () => {
    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html',
      projectRoot: '/path/that/does/not/exist',
      entryFile: 'index.html',
      processTreeQuiescent: false,
      checkedAt: 456,
    })).resolves.toMatchObject({
      action: 'fail',
      reason: 'check_incomplete',
      validation: {
        status: 'incomplete',
        reason: 'process_tree_not_quiescent',
        checkedAt: 456,
        finalization: { initialStatus: 'incomplete', stagedPatchCount: 0, committedPatchCount: 0 },
      },
    });
  });

  it.each(['missing', 'oversize'])('blocks %s input without presenting it as checked', async (kind) => {
    const source = kind === 'oversize' ? `<script>${' '.repeat(2 * 1024 * 1024)}</script>` : '';
    const projectRoot = await htmlFixture(source);
    if (kind === 'missing') await fs.unlink(path.join(projectRoot, 'index.html'));
    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html', projectRoot, entryFile: 'index.html', processTreeQuiescent: true,
    })).resolves.toMatchObject({
      action: 'fail', reason: 'check_incomplete', validation: { status: 'incomplete' },
    });
  });

  it.each([
    'const ratio = 10 / 2; const items = [1, 2;',
    'const pattern = /[(){}]/; const items = [1, 2;',
    'const label = `value: ${1 + 2}`; const items = [1, 2;',
    'const pattern = /[\\\\]{}]/; function ready() {',
  ])('repairs a missing delimiter after valid lexical constructs: %s', async (script) => {
    const projectRoot = await htmlFixture(`<script>${script}</script>`);
    await expect(finalizeDeliverableSyntax({
      artifactKind: 'html', projectRoot, entryFile: 'index.html', processTreeQuiescent: true,
    })).resolves.toMatchObject({
      action: 'allow', validation: { status: 'pass', repairState: { attempt: 1 } },
    });
  });
});
