import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { Express, Request, RequestHandler, Response } from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import { registerDeliverableSyntaxToolRoutes } from '../../src/routes/deliverable-syntax-tool.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixture(input: {
  entryFile: string;
  content: string;
  kind?: string;
  relatedPaths?: string[];
}) {
  const projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-syntax-tool-'));
  roots.push(projectsRoot);
  const projectId = 'project-1';
  const projectRoot = path.join(projectsRoot, projectId);
  await fs.mkdir(path.dirname(path.join(projectRoot, input.entryFile)), { recursive: true });
  await fs.writeFile(path.join(projectRoot, input.entryFile), input.content, 'utf8');
  const run: { id: string; [key: string]: any } = { id: 'run-1' };
  let persistCount = 0;
  let monotonicNow = 0;
  let routeHandler: RequestHandler | undefined;
  const app = {
    post(route: string, handler: RequestHandler) {
      expect(route).toBe('/api/tools/deliverable-syntax/check');
      routeHandler = handler;
    },
  } as unknown as Express;
  registerDeliverableSyntaxToolRoutes(app, {
    projectsRoot,
    authorizeToolRequest: (_req, _res, operation) => (
      operation === 'deliverable-syntax:check'
        ? { runId: run.id, projectId }
        : null
    ),
    authorizeProjectToolRequest: async () => true,
    getProject: () => ({
      metadata: { kind: input.kind ?? 'prototype', entryFile: input.entryFile },
    }),
    getRun: () => run,
    persistRunState: () => { persistCount += 1; },
    relatedPathsForRun: async () => input.relatedPaths ?? [],
    monotonicNow: () => {
      const current = monotonicNow;
      monotonicNow += 5;
      return current;
    },
  });
  if (!routeHandler) throw new Error('syntax tool route was not registered');
  return {
    projectRoot,
    run,
    persistCount: () => persistCount,
    check: async () => {
      let status = 200;
      let body: Record<string, any> | undefined;
      const response = {
        req: {},
        status(code: number) {
          status = code;
          return this;
        },
        json(value: Record<string, any>) {
          body = value;
          return this;
        },
      } as unknown as Response;
      await routeHandler!({} as Request, response, () => {});
      if (!body) throw new Error('syntax tool route returned no body');
      return { status, body };
    },
  };
}

describe('deliverable syntax tool route', () => {
  it('skips non-Web canonical deliverables without inspecting related code', async () => {
    const test = await fixture({
      entryFile: 'report.pdf',
      content: 'pdf bytes',
      kind: 'other',
      relatedPaths: ['broken.ts'],
    });
    await fs.writeFile(path.join(test.projectRoot, 'broken.ts'), 'const broken: = ;', 'utf8');

    const response = await test.check();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      schema: 'open-design.deliverable-syntax-tool/v1',
      status: 'skipped',
      repair: { action: 'none', attempt: 0, maxAttempts: 3 },
    });
    expect(test.run.deliverableSyntaxValidation.status).toBe('skipped');
  });

  it('returns one narrow repair instruction, then passes immediately after the fix', async () => {
    const test = await fixture({
      entryFile: 'index.html',
      content: '<!doctype html><script>const broken = ;</script>',
    });

    const failed = await test.check();
    expect(failed.body).toMatchObject({
      status: 'repairable',
      repair: { action: 'repair', attempt: 1, maxAttempts: 3 },
    });
    expect(failed.body.agentMessage).toContain('index.html:1:');

    await fs.writeFile(
      path.join(test.projectRoot, 'index.html'),
      '<!doctype html><script>const fixed = true;</script>',
      'utf8',
    );
    const passed = await test.check();
    expect(passed.body).toMatchObject({
      status: 'pass',
      repair: { action: 'none', attempt: 1, maxAttempts: 3 },
    });
    expect(passed.body.agentMessage).toBeUndefined();
    expect(test.run.deliverableSyntaxValidation.metrics).toEqual({
      schema: 'open-design.deliverable-syntax-metrics/v1',
      checkCount: 2,
      checkerDurationMs: 10,
      repairableCheckCount: 1,
      initialDiagnosticCount: 1,
      latestDiagnosticCount: 0,
      firstRepairableAtMs: expect.any(Number),
      repairPassedAtMs: expect.any(Number),
      repairWindowDurationMs: expect.any(Number),
    });
    expect(test.persistCount()).toBe(2);
  });

  it('checks JavaScript render dependencies that changed with the HTML entry', async () => {
    const test = await fixture({
      entryFile: 'index.html',
      content: '<!doctype html><script src="app.js"></script>',
      relatedPaths: ['app.js'],
    });
    await fs.writeFile(path.join(test.projectRoot, 'app.js'), 'const broken = ;', 'utf8');

    expect((await test.check()).body).toMatchObject({
      status: 'repairable',
      diagnostics: [expect.objectContaining({ file: 'app.js', source: 'file' })],
      repair: { action: 'repair', attempt: 1 },
    });
  });

  it('captures the first repairable diagnostic count even after an earlier pass', async () => {
    const test = await fixture({
      entryFile: 'index.html',
      content: '<!doctype html><script>const initiallyValid = true;</script>',
    });
    expect((await test.check()).body.status).toBe('pass');
    await fs.writeFile(
      path.join(test.projectRoot, 'index.html'),
      '<!doctype html><script>const brokenLate = ;</script>',
      'utf8',
    );
    expect((await test.check()).body.status).toBe('repairable');
    expect(test.run.deliverableSyntaxValidation.metrics).toMatchObject({
      checkCount: 2,
      repairableCheckCount: 1,
      initialDiagnosticCount: 1,
    });
  });

  it('stops early when the failed candidate did not change', async () => {
    const test = await fixture({
      entryFile: 'index.html',
      content: '<!doctype html><script>const broken = ;</script>',
    });

    expect((await test.check()).body.repair.action).toBe('repair');
    expect((await test.check()).body).toMatchObject({
      status: 'exhausted',
      repair: { action: 'stop', attempt: 1, reason: 'no_progress' },
    });
  });

  it('permits at most three changed repair attempts and never a fourth', async () => {
    const test = await fixture({
      entryFile: 'index.html',
      content: '<!doctype html><script>const broken0 = ;</script>',
    });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await test.check();
      expect(response.body.repair).toMatchObject({ action: 'repair', attempt });
      await fs.writeFile(
        path.join(test.projectRoot, 'index.html'),
        `<!doctype html><script>const broken${attempt} = ;</script>`,
        'utf8',
      );
    }
    expect((await test.check()).body).toMatchObject({
      status: 'exhausted',
      repair: { action: 'stop', attempt: 3, reason: 'attempt_limit_reached' },
    });
    expect(test.run.deliverableSyntaxValidation.metrics).toMatchObject({
      checkCount: 4,
      checkerDurationMs: 20,
      repairableCheckCount: 4,
      initialDiagnosticCount: 1,
      latestDiagnosticCount: 1,
    });
  });
});
