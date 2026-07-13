import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { deleteProjectFile, listFiles, readProjectFile, writeProjectFile } from '../src/projects.js';
import {
  acquireLiveArtifactRefreshLock,
  appendLiveArtifactRefreshLogEntry,
  commitLiveArtifactRefreshCandidate,
  compactLiveArtifactRefreshError,
  createLiveArtifact,
  ensureLiveArtifactStoreLayout,
  generateLiveArtifactId,
  generateLiveArtifactSlug,
  getLiveArtifact,
  ensureLiveArtifactPreview,
  liveArtifactStorePaths,
  listLiveArtifactRefreshLogEntries,
  listLiveArtifacts,
  LiveArtifactRefreshLockError,
  LiveArtifactStaleRefreshError,
  markLiveArtifactRefreshCommitted,
  regenerateLiveArtifactPreview,
  releaseLiveArtifactRefreshLock,
  recoverStaleLiveArtifactRefreshes,
  updateLiveArtifact,
  validateLiveArtifactStorageId,
} from '../src/live-artifacts/store.js';
import {
  applyLiveArtifactOutputMapping,
  buildLiveArtifactRefreshCandidate,
  LiveArtifactRefreshAbortError,
  executeLocalDaemonRefreshSource,
  LiveArtifactRefreshRunRegistry,
  normalizeLiveArtifactRefreshTimeouts,
  withLiveArtifactRefreshRun,
  withLiveArtifactRefreshSourceTimeout,
} from '../src/live-artifacts/refresh.js';

const tempRoots: string[] = [];

async function makeProjectsRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'od-live-artifacts-'));
  tempRoots.push(root);
  return path.join(root, 'projects');
}

function validCreateInput() {
  return {
    title: 'Launch Metrics: Q2!',
    slug: 'launch-metrics-q2',
    sessionId: 'session-123',
    pinned: true,
    status: 'archived' as const,
    preview: {
      type: 'html' as const,
      entry: 'index.html',
    },
    document: {
      format: 'html_template_v1' as const,
      templatePath: 'template.html' as const,
      generatedPreviewPath: 'index.html' as const,
      dataPath: 'data.json' as const,
      dataJson: {
        title: 'Launch <Metrics>',
        owner: 'R&D & Ops',
        note: 'Use "quotes" and <tags> and \'apostrophes\'',
      },
    },
  };
}

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('live artifact store layout', () => {
  it('generates normalized live artifact slugs', () => {
    expect(generateLiveArtifactSlug(' Launch Metrics: Q2! ')).toBe('launch-metrics-q2');
    expect(generateLiveArtifactSlug('Crème brûlée dashboard')).toBe('creme-brulee-dashboard');
    expect(generateLiveArtifactSlug('---')).toBe('live-artifact');
    expect(generateLiveArtifactSlug('A'.repeat(200))).toHaveLength(128);
  });

  it('generates safe collision-resistant live artifact storage ids', () => {
    const id = generateLiveArtifactId({
      title: 'Launch Metrics: Q2!',
      randomSuffix: 'A1B2C3D4E5F6',
    });

    expect(id).toBe('la-launch-metrics-q2-a1b2c3d4e5f6');
    expect(validateLiveArtifactStorageId(id)).toBe(id);
    expect(generateLiveArtifactId({ title: 'Launch Metrics', randomSuffix: '000001' })).not.toBe(
      generateLiveArtifactId({ title: 'Launch Metrics', randomSuffix: '000002' }),
    );
  });

  it('uses normalized caller-provided slugs and keeps generated ids bounded', () => {
    const id = generateLiveArtifactId({
      title: 'Ignored title',
      slug: '../Custom Slug With Spaces/'.repeat(20),
      randomSuffix: 'abcdef123456',
    });

    expect(id).toMatch(/^la-custom-slug-with-spaces-custom-slug-with-spaces/);
    expect(id.endsWith('-abcdef123456')).toBe(true);
    expect(id.length).toBeLessThanOrEqual(128);
    expect(validateLiveArtifactStorageId(id)).toBe(id);
  });

  it('rejects invalid deterministic suffixes used by id generation tests', () => {
    expect(() => generateLiveArtifactId({ title: 'Launch Metrics', randomSuffix: '../bad' })).toThrow(
      /invalid live artifact id random suffix/,
    );
  });

  it('resolves and creates the project-scoped live artifact directory layout', async () => {
    const projectsRoot = await makeProjectsRoot();
    const paths = await ensureLiveArtifactStoreLayout(projectsRoot, 'project-1', 'artifact-1');

    expect(paths.projectDir).toBe(path.join(projectsRoot, 'project-1'));
    expect(paths.rootDir).toBe(path.join(projectsRoot, 'project-1', '.live-artifacts'));
    expect(paths.artifactDir).toBe(path.join(paths.rootDir, 'artifact-1'));
    expect(paths.artifactJsonPath).toBe(path.join(paths.artifactDir, 'artifact.json'));
    expect(paths.templateHtmlPath).toBe(path.join(paths.artifactDir, 'template.html'));
    expect(paths.dataJsonPath).toBe(path.join(paths.artifactDir, 'data.json'));
    expect(paths.provenanceJsonPath).toBe(path.join(paths.artifactDir, 'provenance.json'));
    expect(paths.refreshesJsonlPath).toBe(path.join(paths.artifactDir, 'refreshes.jsonl'));
    expect(paths.snapshotsDir).toBe(path.join(paths.artifactDir, 'snapshots'));
    await expect(stat(paths.snapshotsDir)).resolves.toMatchObject({});
    await expect(readFile(paths.refreshesJsonlPath, 'utf8')).resolves.toBe('');
  });

  it('keeps live artifact storage under the configured projects root', async () => {
    const projectsRoot = path.join(await makeProjectsRoot(), 'custom-data-root', 'projects');
    const paths = liveArtifactStorePaths(projectsRoot, 'project-1', 'artifact-1');

    expect(paths.artifactDir).toBe(
      path.join(projectsRoot, 'project-1', '.live-artifacts', 'artifact-1'),
    );
  });

  it('rejects artifact ids that could escape the storage root', async () => {
    const projectsRoot = await makeProjectsRoot();
    await ensureLiveArtifactStoreLayout(projectsRoot, 'project-1', 'artifact-1');

    expect(() => liveArtifactStorePaths(projectsRoot, 'project-1', '../artifact')).toThrow(/invalid live artifact id/);
    expect(() => liveArtifactStorePaths(projectsRoot, 'project-1', '/artifact')).toThrow(/invalid live artifact id/);
    expect(() => liveArtifactStorePaths(projectsRoot, '../project-1', 'artifact-1')).toThrow(/invalid project id/);
    expect(() => liveArtifactStorePaths(projectsRoot, '/project-1', 'artifact-1')).toThrow(/invalid project id/);
  });

  it('rejects absolute and traversal paths from generic project file payloads', async () => {
    const projectsRoot = await makeProjectsRoot();
    await ensureLiveArtifactStoreLayout(projectsRoot, 'project-1', 'artifact-1');

    await expect(writeProjectFile(projectsRoot, 'project-1', '/absolute.txt', Buffer.from('x'))).rejects.toThrow(
      /invalid file name/,
    );
    await expect(writeProjectFile(projectsRoot, 'project-1', '\\absolute.txt', Buffer.from('x'))).rejects.toThrow(
      /invalid file name/,
    );
    await expect(writeProjectFile(projectsRoot, 'project-1', 'nested/../secret.txt', Buffer.from('x'))).rejects.toThrow(
      /invalid file name/,
    );
  });

  it('excludes .live-artifacts from generic project file reads, writes, deletes, and listings', async () => {
    const projectsRoot = await makeProjectsRoot();
    const paths = await ensureLiveArtifactStoreLayout(projectsRoot, 'project-1', 'artifact-1');

    await writeProjectFile(projectsRoot, 'project-1', 'public.txt', Buffer.from('visible'));
    await writeProjectFile(projectsRoot, 'project-1', paths.artifactJsonPath.slice(paths.projectDir.length + 1), Buffer.from('{}'))
      .then(
        () => Promise.reject(new Error('reserved write unexpectedly succeeded')),
        (error) => expect(String(error)).toContain('reserved project path'),
      );

    await expect(readProjectFile(projectsRoot, 'project-1', '.live-artifacts/artifact-1/artifact.json')).rejects.toThrow(
      /reserved project path/,
    );
    await expect(deleteProjectFile(projectsRoot, 'project-1', '.live-artifacts/artifact-1/artifact.json')).rejects.toThrow(
      /reserved project path/,
    );

    const files = await listFiles(projectsRoot, 'project-1');
    expect(files.map((file) => file.path)).toEqual(['public.txt']);
    await expect(readdir(paths.rootDir)).resolves.toEqual(['artifact-1']);
  });

  it('creates a live artifact by assigning daemon-owned fields and persisting artifact files', async () => {
    const projectsRoot = await makeProjectsRoot();
    const now = new Date('2026-04-30T10:11:12.345Z');
    const input = validCreateInput();
    const templateHtml = [
      '<!doctype html>',
      '<html>',
      '  <body>',
      '    <h1>{{data.title}}</h1>',
      '    <p>{{data.owner}}</p>',
      '    <div>{{data.note}}</div>',
      '  </body>',
      '</html>',
      '',
    ].join('\n');
    const provenanceJson = {
      generatedAt: '2026-04-30T10:11:12.345Z',
      generatedBy: 'agent' as const,
      notes: 'Explicit provenance',
      sources: [{ label: 'User prompt', type: 'user_input' as const }],
    };

    const record = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input,
      templateHtml,
      provenanceJson,
      createdByRunId: 'run-123',
      now,
    });

    expect(record.artifact).toMatchObject({
      schemaVersion: 1,
      projectId: 'project-1',
      sessionId: 'session-123',
      createdByRunId: 'run-123',
      title: input.title,
      slug: 'launch-metrics-q2',
      status: 'archived',
      pinned: true,
      preview: input.preview,
      refreshStatus: 'idle',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      document: input.document,
    });
    expect(record.artifact.id).toMatch(/^la-launch-metrics-q2-[a-f0-9]{12}$/);

    expect(await readFile(record.paths.artifactJsonPath, 'utf8')).toBe(`${JSON.stringify(record.artifact, null, 2)}\n`);
    expect(await readFile(record.paths.templateHtmlPath, 'utf8')).toBe(templateHtml);
    expect(await readFile(record.paths.dataJsonPath, 'utf8')).toBe(`${JSON.stringify(input.document.dataJson, null, 2)}\n`);
    expect(await readFile(record.paths.provenanceJsonPath, 'utf8')).toBe(`${JSON.stringify(provenanceJson, null, 2)}\n`);
    expect(await readFile(record.paths.refreshesJsonlPath, 'utf8')).toBe('');
    await expect(stat(record.paths.snapshotsDir)).resolves.toMatchObject({});

    expect(await readFile(record.paths.generatedPreviewHtmlPath, 'utf8')).toContain(
      '<h1>Launch &lt;Metrics&gt;</h1>',
    );
    expect(await readFile(record.paths.generatedPreviewHtmlPath, 'utf8')).toContain('<p>R&amp;D &amp; Ops</p>');
    expect(await readFile(record.paths.generatedPreviewHtmlPath, 'utf8')).toContain(
      '<div>Use &quot;quotes&quot; and &lt;tags&gt; and &#39;apostrophes&#39;</div>',
    );
  });

  it('preserves requested refresh permission when creating live artifact sources', async () => {
    const projectsRoot = await makeProjectsRoot();
    const baseInput = validCreateInput();
    const input = {
      ...baseInput,
      document: {
        ...baseInput.document,
        sourceJson: {
          type: 'daemon_tool' as const,
          toolName: 'project_files.read_json',
          input: { path: 'metrics.json' },
          refreshPermission: 'none' as const,
        },
      },
    };

    const record = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input,
    });

    expect(record.artifact.document?.sourceJson?.refreshPermission).toBe('none');
    expect(JSON.parse(await readFile(record.paths.artifactJsonPath, 'utf8'))).toMatchObject({
      document: { sourceJson: { refreshPermission: 'none' } },
    });
  });

  it('lists compact live artifact summaries without exposing implementation files', async () => {
    const projectsRoot = await makeProjectsRoot();
    const older = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input: validCreateInput(),
      now: new Date('2026-04-30T10:11:12.345Z'),
    });
    const newer = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input: {
        ...validCreateInput(),
        title: 'Current Health',
        slug: 'current-health',
      },
      now: new Date('2026-04-30T10:12:12.345Z'),
    });

    const summaries = await listLiveArtifacts({ projectsRoot, projectId: 'project-1' });

    expect(summaries.map((artifact) => artifact.id)).toEqual([newer.artifact.id, older.artifact.id]);
    expect(summaries[0]).toMatchObject({
      id: newer.artifact.id,
      projectId: 'project-1',
      title: 'Current Health',
      hasDocument: true,
    });
    expect(summaries[1]).toMatchObject({
      id: older.artifact.id,
      hasDocument: true,
    });
    expect(summaries[0]).not.toHaveProperty('document');
    expect(JSON.stringify(summaries)).not.toContain('snapshots');
    expect(JSON.stringify(summaries)).not.toContain('template.html');
    expect(JSON.stringify(summaries)).not.toContain('data.json');
  });

  it('gets a full project-scoped live artifact record by id with data.json as source of truth', async () => {
    const projectsRoot = await makeProjectsRoot();
    const created = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input: validCreateInput(),
      now: new Date('2026-04-30T10:11:12.345Z'),
    });
    const diskDataJson = { title: 'Disk Title', owner: 'Disk Owner', note: 'From data.json' };
    await writeFile(created.paths.dataJsonPath, `${JSON.stringify(diskDataJson, null, 2)}\n`, 'utf8');

    const record = await getLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
    });

    expect(record.artifact).toEqual({
      ...created.artifact,
      document: { ...created.artifact.document!, dataJson: diskDataJson },
    });
    expect(record.paths).toEqual(created.paths);
    expect(record.artifact.document).toMatchObject({
      format: 'html_template_v1',
      templatePath: 'template.html',
      generatedPreviewPath: 'index.html',
      dataPath: 'data.json',
    });
  });

  it('appends and reads compact refresh log entries without rewriting prior records', async () => {
    const projectsRoot = await makeProjectsRoot();
    const created = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input: validCreateInput(),
    });

    const first = await appendLiveArtifactRefreshLogEntry({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
      refreshId: 'refresh-000001',
      sequence: 0,
      step: 'document',
      status: 'running',
      startedAt: '2026-04-30T10:00:00.000Z',
      source: {
        sourceType: 'document',
        toolName: 'github.issues.list',
        connector: {
          connectorId: 'github',
          accountLabel: 'octo-org',
          toolName: 'issues.list',
          approvalPolicy: 'manual_refresh_granted_for_read_only',
        },
      },
      metadata: { rows: 3, transform: 'compact_table' },
      now: new Date('2026-04-30T10:00:00.010Z'),
    });
    const afterFirstAppend = await readFile(created.paths.refreshesJsonlPath, 'utf8');

    const second = await appendLiveArtifactRefreshLogEntry({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
      refreshId: 'refresh-000001',
      sequence: 1,
      step: 'document',
      status: 'failed',
      startedAt: '2026-04-30T10:00:00.000Z',
      finishedAt: '2026-04-30T10:00:01.250Z',
      error: Object.assign(new Error('Provider returned too many rows with a long diagnostic'), { code: 'TOO_MANY_ROWS', path: 'document' }),
      now: new Date('2026-04-30T10:00:01.260Z'),
    });

    expect(first).toMatchObject({
      schemaVersion: 1,
      projectId: 'project-1',
      artifactId: created.artifact.id,
      refreshId: 'refresh-000001',
      sequence: 0,
      status: 'running',
      source: {
        sourceType: 'document',
        toolName: 'github.issues.list',
        connector: { connectorId: 'github', accountLabel: 'octo-org', toolName: 'issues.list' },
      },
      metadata: { rows: 3, transform: 'compact_table' },
    });
    expect(second).toMatchObject({
      status: 'failed',
      durationMs: 1250,
      error: { code: 'TOO_MANY_ROWS', message: 'Provider returned too many rows with a long diagnostic', path: 'document' },
    });

    const logText = await readFile(created.paths.refreshesJsonlPath, 'utf8');
    expect(logText.startsWith(afterFirstAppend)).toBe(true);
    expect(logText.trim().split('\n')).toHaveLength(2);
    expect(logText).not.toContain('\n{\n');
    await expect(listLiveArtifactRefreshLogEntries({ projectsRoot, projectId: 'project-1', artifactId: created.artifact.id })).resolves.toEqual([
      first,
      second,
    ]);
  });

  it('rejects a second concurrent refresh lock for the same artifact but allows different artifacts', async () => {
    const projectsRoot = await makeProjectsRoot();
    const firstArtifact = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input: validCreateInput(),
    });
    const secondArtifact = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input: { ...validCreateInput(), title: 'Other dashboard', slug: 'other-dashboard' },
    });

    const firstLock = await acquireLiveArtifactRefreshLock({
      projectsRoot,
      projectId: 'project-1',
      artifactId: firstArtifact.artifact.id,
      now: new Date('2026-04-30T10:00:00.000Z'),
    });

    await expect(
      acquireLiveArtifactRefreshLock({
        projectsRoot,
        projectId: 'project-1',
        artifactId: firstArtifact.artifact.id,
        now: new Date('2026-04-30T10:00:01.000Z'),
      }),
    ).rejects.toBeInstanceOf(LiveArtifactRefreshLockError);

    const secondLock = await acquireLiveArtifactRefreshLock({
      projectsRoot,
      projectId: 'project-1',
      artifactId: secondArtifact.artifact.id,
      now: new Date('2026-04-30T10:00:02.000Z'),
    });

    expect(firstLock.lockPath).not.toBe(secondLock.lockPath);
    expect(JSON.parse(await readFile(firstLock.lockPath, 'utf8'))).toMatchObject({
      projectId: 'project-1',
      artifactId: firstArtifact.artifact.id,
      acquiredAt: '2026-04-30T10:00:00.000Z',
    });

    await Promise.all([
      releaseLiveArtifactRefreshLock(firstLock),
      releaseLiveArtifactRefreshLock(secondLock),
    ]);
  });

  it('allows reacquiring a refresh lock after release', async () => {
    const projectsRoot = await makeProjectsRoot();
    const created = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input: validCreateInput(),
    });

    const firstLock = await acquireLiveArtifactRefreshLock({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
    });
    await releaseLiveArtifactRefreshLock(firstLock);
    await expect(stat(firstLock.lockPath)).rejects.toMatchObject({ code: 'ENOENT' });

    const secondLock = await acquireLiveArtifactRefreshLock({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
    });

    expect(secondLock.metadata.lockId).not.toBe(firstLock.metadata.lockId);
    await releaseLiveArtifactRefreshLock(secondLock);
  });

  it('recovers timed-out running refresh locks on startup without rewriting the last valid preview', async () => {
    const projectsRoot = await makeProjectsRoot();
    const created = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input: validCreateInput(),
      templateHtml: '<h1>{{data.title}}</h1>',
    });
    const previewBefore = await readFile(created.paths.generatedPreviewHtmlPath, 'utf8');

    await writeFile(created.paths.artifactJsonPath, `${JSON.stringify({
      ...created.artifact,
      refreshStatus: 'running',
      updatedAt: '2026-04-30T10:00:00.000Z',
    }, null, 2)}\n`, 'utf8');
    const lock = await acquireLiveArtifactRefreshLock({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
      now: new Date('2026-04-30T10:00:00.000Z'),
    });
    await appendLiveArtifactRefreshLogEntry({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
      refreshId: lock.metadata.refreshId,
      sequence: 0,
      step: 'refresh:start',
      status: 'running',
      startedAt: '2026-04-30T10:00:00.000Z',
      now: new Date('2026-04-30T10:00:00.010Z'),
    });

    await expect(recoverStaleLiveArtifactRefreshes({
      projectsRoot,
      staleAfterMs: 120_000,
      now: new Date('2026-04-30T10:03:00.000Z'),
    })).resolves.toEqual([
      { projectId: 'project-1', artifactId: created.artifact.id, refreshId: lock.metadata.refreshId, status: 'recovered' },
    ]);

    await expect(stat(lock.lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(created.paths.generatedPreviewHtmlPath, 'utf8')).resolves.toBe(previewBefore);
    await expect(getLiveArtifact({ projectsRoot, projectId: 'project-1', artifactId: created.artifact.id })).resolves.toMatchObject({
      artifact: { refreshStatus: 'failed', updatedAt: '2026-04-30T10:03:00.000Z' },
    });
    await expect(listLiveArtifactRefreshLogEntries({ projectsRoot, projectId: 'project-1', artifactId: created.artifact.id })).resolves.toMatchObject([
      { refreshId: lock.metadata.refreshId, sequence: 0, status: 'running' },
      {
        refreshId: lock.metadata.refreshId,
        sequence: 1,
        step: 'refresh:crash_recovery',
        status: 'failed',
        durationMs: 180_000,
        error: { code: 'REFRESH_CRASH_RECOVERY_TIMEOUT' },
      },
    ]);

    const nextLock = await acquireLiveArtifactRefreshLock({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
    });
    expect(nextLock.metadata.refreshId).toBe('refresh-000002');
    await releaseLiveArtifactRefreshLock(nextLock);
  });

  it('leaves non-timed-out refresh locks in place during startup recovery', async () => {
    const projectsRoot = await makeProjectsRoot();
    const created = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input: validCreateInput(),
    });
    const lock = await acquireLiveArtifactRefreshLock({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
      now: new Date('2026-04-30T10:00:00.000Z'),
    });

    await expect(recoverStaleLiveArtifactRefreshes({
      projectsRoot,
      staleAfterMs: 120_000,
      now: new Date('2026-04-30T10:01:00.000Z'),
    })).resolves.toEqual([
      {
        projectId: 'project-1',
        artifactId: created.artifact.id,
        refreshId: lock.metadata.refreshId,
        status: 'skipped',
        reason: 'lock has not timed out',
      },
    ]);

    await expect(stat(lock.lockPath)).resolves.toMatchObject({});
    await releaseLiveArtifactRefreshLock(lock);
  });

  it('assigns monotonic refresh ids and rejects stale refresh commits', async () => {
    const projectsRoot = await makeProjectsRoot();
    const created = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input: validCreateInput(),
    });

    const firstLock = await acquireLiveArtifactRefreshLock({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
      now: new Date('2026-04-30T10:00:00.000Z'),
    });
    expect(firstLock.metadata).toMatchObject({
      refreshId: 'refresh-000001',
      refreshOrdinal: 1,
    });

    await releaseLiveArtifactRefreshLock(firstLock);

    const secondLock = await acquireLiveArtifactRefreshLock({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
      now: new Date('2026-04-30T10:00:01.000Z'),
    });
    expect(secondLock.metadata).toMatchObject({
      refreshId: 'refresh-000002',
      refreshOrdinal: 2,
    });

    await expect(
      markLiveArtifactRefreshCommitted({
        projectsRoot,
        projectId: 'project-1',
        artifactId: created.artifact.id,
        refreshId: secondLock.metadata.refreshId,
      }),
    ).resolves.toMatchObject({
      nextRefreshOrdinal: 3,
      lastCommittedRefreshId: 'refresh-000002',
      lastCommittedRefreshOrdinal: 2,
    });

    await expect(
      markLiveArtifactRefreshCommitted({
        projectsRoot,
        projectId: 'project-1',
        artifactId: created.artifact.id,
        refreshId: firstLock.metadata.refreshId,
      }),
    ).rejects.toBeInstanceOf(LiveArtifactStaleRefreshError);

    await releaseLiveArtifactRefreshLock(secondLock);
    const thirdLock = await acquireLiveArtifactRefreshLock({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
      now: new Date('2026-04-30T10:00:02.000Z'),
    });
    expect(thirdLock.metadata.refreshId).toBe('refresh-000003');
    await releaseLiveArtifactRefreshLock(thirdLock);
  });

  it('commits document refresh candidates', async () => {
    const projectsRoot = await makeProjectsRoot();
    const input: any = validCreateInput();
    input.document!.dataJson = { title: 'Revenue', revenue: 42 };
    input.document!.sourceJson = {
      type: 'daemon_tool' as const,
      toolName: 'project_files.read_json',
      input: { path: 'metrics.json' },
      outputMapping: {
        dataPaths: [{ from: 'json.revenue', to: 'value' }],
        transform: 'identity' as const,
      },
      refreshPermission: 'manual_refresh_granted_for_read_only' as const,
    };
    const created = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input,
      templateHtml: '<h1>{{data.title}}</h1><p>{{data.value}}</p>',
    });
    const successLock = await acquireLiveArtifactRefreshLock({ projectsRoot, projectId: 'project-1', artifactId: created.artifact.id });
    const candidate = buildLiveArtifactRefreshCandidate({
      artifact: created.artifact,
      currentDataJson: created.artifact.document!.dataJson,
      documentOutput: { output: { json: { revenue: 99 } } },
      now: new Date('2026-04-30T11:01:00.000Z'),
    });
    const committed = await commitLiveArtifactRefreshCandidate({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
      refreshId: successLock.metadata.refreshId,
      dataJson: candidate.dataJson,
      now: new Date('2026-04-30T11:01:00.000Z'),
    });
    await releaseLiveArtifactRefreshLock(successLock);

    expect(committed.artifact.refreshStatus).toBe('succeeded');
    expect(committed.artifact.lastRefreshedAt).toBe('2026-04-30T11:01:00.000Z');
    await expect(readFile(created.paths.dataJsonPath, 'utf8')).resolves.toContain('"value": 99');
    await expect(readFile(created.paths.generatedPreviewHtmlPath, 'utf8')).resolves.toContain('<p>99</p>');
    const snapshotDir = path.join(created.paths.snapshotsDir, successLock.metadata.refreshId);
    await expect(readFile(path.join(snapshotDir, 'artifact.json'), 'utf8')).resolves.toContain('"lastRefreshedAt": "2026-04-30T11:01:00.000Z"');
    await expect(readFile(path.join(snapshotDir, 'data.json'), 'utf8')).resolves.toContain('"value": 99');
    await expect(readFile(path.join(snapshotDir, 'index.html'), 'utf8')).resolves.toContain('<p>99</p>');
    await expect(readFile(path.join(snapshotDir, 'template.html'), 'utf8')).resolves.toContain('{{data.value}}');
    expect(await readdir(created.paths.snapshotsDir)).toEqual([successLock.metadata.refreshId]);
    await expect(
      markLiveArtifactRefreshCommitted({
        projectsRoot,
        projectId: 'project-1',
        artifactId: created.artifact.id,
        refreshId: successLock.metadata.refreshId,
      }),
    ).rejects.toBeInstanceOf(LiveArtifactStaleRefreshError);
  });

  it('does not mutate live artifact files when refresh snapshot persistence fails', async () => {
    const projectsRoot = await makeProjectsRoot();
    const input: any = validCreateInput();
    input.document!.dataJson = { title: 'Revenue', revenue: 42 };
    input.document!.sourceJson = {
      type: 'daemon_tool' as const,
      toolName: 'project_files.read_json',
      input: { path: 'metrics.json' },
      outputMapping: {
        dataPaths: [{ from: 'json.revenue', to: 'value' }],
        transform: 'identity' as const,
      },
      refreshPermission: 'manual_refresh_granted_for_read_only' as const,
    };
    const created = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input,
      templateHtml: '<h1>{{data.title}}</h1><p>{{data.value}}</p>',
    });
    const originalArtifactJson = await readFile(created.paths.artifactJsonPath, 'utf8');
    const originalDataJson = await readFile(created.paths.dataJsonPath, 'utf8');
    const originalPreviewHtml = await readFile(created.paths.generatedPreviewHtmlPath, 'utf8');

    const lock = await acquireLiveArtifactRefreshLock({ projectsRoot, projectId: 'project-1', artifactId: created.artifact.id });
    const candidate = buildLiveArtifactRefreshCandidate({
      artifact: created.artifact,
      currentDataJson: created.artifact.document!.dataJson,
      documentOutput: { output: { json: { revenue: 99 } } },
      now: new Date('2026-04-30T11:01:00.000Z'),
    });
    await rm(created.paths.snapshotsDir, { recursive: true, force: true });
    await writeFile(created.paths.snapshotsDir, 'not a directory', 'utf8');

    await expect(commitLiveArtifactRefreshCandidate({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
      refreshId: lock.metadata.refreshId,
      dataJson: candidate.dataJson,
      now: new Date('2026-04-30T11:01:00.000Z'),
    })).rejects.toThrow();

    await expect(readFile(created.paths.artifactJsonPath, 'utf8')).resolves.toBe(originalArtifactJson);
    await expect(readFile(created.paths.dataJsonPath, 'utf8')).resolves.toBe(originalDataJson);
    await expect(readFile(created.paths.generatedPreviewHtmlPath, 'utf8')).resolves.toBe(originalPreviewHtml);
    await expect(readFile(created.paths.refreshStatePath, 'utf8')).resolves.not.toContain('lastCommittedRefreshId');
  });

  it('does not mark refresh committed when live artifact file persistence fails', async () => {
    const projectsRoot = await makeProjectsRoot();
    const input: any = validCreateInput();
    input.document!.dataJson = { title: 'Revenue', revenue: 42 };
    input.document!.sourceJson = {
      type: 'daemon_tool' as const,
      toolName: 'project_files.read_json',
      input: { path: 'metrics.json' },
      outputMapping: {
        dataPaths: [{ from: 'json.revenue', to: 'value' }],
        transform: 'identity' as const,
      },
      refreshPermission: 'manual_refresh_granted_for_read_only' as const,
    };
    const created = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input,
      templateHtml: '<h1>{{data.title}}</h1><p>{{data.value}}</p>',
    });

    const lock = await acquireLiveArtifactRefreshLock({ projectsRoot, projectId: 'project-1', artifactId: created.artifact.id });
    const candidate = buildLiveArtifactRefreshCandidate({
      artifact: created.artifact,
      currentDataJson: created.artifact.document!.dataJson,
      documentOutput: { output: { json: { revenue: 99 } } },
      now: new Date('2026-04-30T11:01:00.000Z'),
    });
    await rm(created.paths.provenanceJsonPath, { force: true });
    await mkdir(created.paths.provenanceJsonPath);

    await expect(commitLiveArtifactRefreshCandidate({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
      refreshId: lock.metadata.refreshId,
      dataJson: candidate.dataJson,
      provenanceJson: {
        generatedAt: '2026-04-30T11:01:00.000Z',
        generatedBy: 'agent',
        sources: [{ label: 'test', type: 'user_input' }],
      },
      now: new Date('2026-04-30T11:01:00.000Z'),
    })).rejects.toThrow();

    await expect(readFile(created.paths.refreshStatePath, 'utf8')).resolves.not.toContain('lastCommittedRefreshId');
  });

  it('maps document refresh data paths directly even when a legacy transform is present', () => {
    const document: any = {
      format: 'html_template_v1',
      templatePath: 'template.html',
      generatedPreviewPath: 'index.html',
      dataPath: 'data.json',
      dataJson: {
        repository: {
          fullName: 'nexu-io/open-design',
          url: 'https://github.com/nexu-io/open-design',
          starCount: 100,
          starCountFormatted: '100',
          fetchedAt: '2026-05-01T00:00:00.000Z',
          fetchedDate: 'May 1, 2026',
        },
      },
      sourceJson: {
        type: 'daemon_tool',
        toolName: 'public_github_repository_metric',
        input: { url: 'https://api.github.com/repos/nexu-io/open-design' },
        outputMapping: {
          dataPaths: [
            { from: 'stargazers_count', to: 'repository.starCount' },
            { from: 'full_name', to: 'repository.fullName' },
            { from: 'html_url', to: 'repository.url' },
          ],
          transform: 'metric_summary',
        },
        refreshPermission: 'none',
      },
    };

    const candidate = buildLiveArtifactRefreshCandidate({
      artifact: {
        schemaVersion: 1,
        id: 'la-github-stars',
        projectId: 'project-1',
        title: 'GitHub Stars',
        slug: 'github-stars',
        status: 'active',
        pinned: false,
        preview: { type: 'html', entry: 'index.html' },
        refreshStatus: 'idle',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        document,
      },
      currentDataJson: document.dataJson,
      documentOutput: {
        output: {
          stargazers_count: 12987,
          full_name: 'nexu-io/open-design',
          html_url: 'https://github.com/nexu-io/open-design',
          updated_at: '2026-05-02T00:00:00Z',
        },
      },
    });

    expect(candidate.dataJson).toMatchObject({
      repository: {
        starCount: 12987,
        starCountFormatted: '12,987',
        fetchedDate: 'May 2, 2026',
      },
    });
    expect(candidate.dataJson).not.toHaveProperty('value');
  });

  it('does not fall back to full refresh output when all mapped data paths are missing', () => {
    const document: any = {
      format: 'html_template_v1',
      templatePath: 'template.html',
      generatedPreviewPath: 'index.html',
      dataPath: 'data.json',
      dataJson: { title: 'Notion word cloud' },
      sourceJson: {
        type: 'connector_tool',
        toolName: 'notion.notion_fetch_data',
        input: { fetch_type: 'pages' },
        connector: { connectorId: 'notion', toolName: 'notion.notion_fetch_data' },
        outputMapping: {
          dataPaths: [{ from: 'values', to: 'documents' }],
          transform: 'compact_table',
        },
        refreshPermission: 'none',
      },
    };

    const candidate = buildLiveArtifactRefreshCandidate({
      artifact: {
        schemaVersion: 1,
        id: 'la-notion-word-cloud',
        projectId: 'project-1',
        title: 'Notion word cloud',
        slug: 'notion-word-cloud',
        status: 'active',
        pinned: false,
        preview: { type: 'html', entry: 'index.html' },
        refreshStatus: 'idle',
        createdAt: '2026-05-05T00:00:00.000Z',
        updatedAt: '2026-05-05T00:00:00.000Z',
        document,
      },
      currentDataJson: document.dataJson,
      documentOutput: {
        output: {
          data: {
            results: [
              { title: 'Page one', characters: 120 },
              { title: 'Page two', characters: 80 },
            ],
          },
        },
      },
    });

    expect(candidate.dataJson).toEqual({ title: 'Notion word cloud' });
  });

  it('normalizes refresh timeout configuration and rejects invalid durations', () => {
    expect(normalizeLiveArtifactRefreshTimeouts()).toEqual({
      sourceTimeoutMs: 30_000,
      totalTimeoutMs: 120_000,
    });
    expect(normalizeLiveArtifactRefreshTimeouts({ sourceTimeoutMs: 250, totalTimeoutMs: 1_000 })).toEqual({
      sourceTimeoutMs: 250,
      totalTimeoutMs: 1_000,
    });
    expect(() => normalizeLiveArtifactRefreshTimeouts({ sourceTimeoutMs: 0 })).toThrow(RangeError);
    expect(() => normalizeLiveArtifactRefreshTimeouts({ totalTimeoutMs: Number.MAX_SAFE_INTEGER + 1 })).toThrow(RangeError);
  });

  it('aborts a refresh source when its per-source timeout expires', async () => {
    vi.useFakeTimers();
    const registry = new LiveArtifactRefreshRunRegistry();
    const scope = { projectId: 'project-1', artifactId: 'artifact-1', refreshId: 'refresh-000001' };
    const promise = withLiveArtifactRefreshRun(registry, { ...scope, totalTimeoutMs: 1_000 }, async (run) => (
      withLiveArtifactRefreshSourceTimeout(run, { step: 'document', sourceTimeoutMs: 25 }, async () => new Promise<string>(() => {}))
    ));
    promise.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(25);
    await expect(promise).rejects.toMatchObject({
      name: 'LiveArtifactRefreshAbortError',
      kind: 'source_timeout',
      projectId: 'project-1',
      artifactId: 'artifact-1',
      refreshId: 'refresh-000001',
      timeoutMs: 25,
      step: 'document',
    });
    expect(registry.hasRun(scope)).toBe(false);
  });

  it('aborts the whole refresh when the total timeout expires', async () => {
    vi.useFakeTimers();
    const registry = new LiveArtifactRefreshRunRegistry();
    const scope = { projectId: 'project-1', artifactId: 'artifact-1', refreshId: 'refresh-000002' };
    const promise = withLiveArtifactRefreshRun(registry, { ...scope, totalTimeoutMs: 50 }, async () => new Promise<string>(() => {}));
    promise.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(50);
    await expect(promise).rejects.toMatchObject({
      name: 'LiveArtifactRefreshAbortError',
      kind: 'total_timeout',
      projectId: 'project-1',
      artifactId: 'artifact-1',
      refreshId: 'refresh-000002',
      timeoutMs: 50,
    });
    expect(registry.hasRun(scope)).toBe(false);
  });

  it('supports user cancellation of a registered refresh run', async () => {
    const registry = new LiveArtifactRefreshRunRegistry();
    const scope = { projectId: 'project-1', artifactId: 'artifact-1', refreshId: 'refresh-000003' };
    const promise = withLiveArtifactRefreshRun(registry, { ...scope, totalTimeoutMs: 60_000 }, async (run) => {
      expect(registry.hasRun(run)).toBe(true);
      expect(registry.cancelRun(run, 'Stopped by user')).toBe(true);
      return new Promise<string>(() => {});
    });

    await expect(promise).rejects.toMatchObject({
      name: 'LiveArtifactRefreshAbortError',
      kind: 'cancelled',
      message: 'Stopped by user',
      projectId: 'project-1',
      artifactId: 'artifact-1',
      refreshId: 'refresh-000003',
    });
    expect(registry.hasRun(scope)).toBe(false);
    expect(registry.cancelRun(scope)).toBe(false);
  });

  it('rejects unsafe refresh log metadata and compacts arbitrary errors', async () => {
    const projectsRoot = await makeProjectsRoot();
    const created = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input: validCreateInput(),
    });

    expect(compactLiveArtifactRefreshError('plain failure')).toEqual({ message: 'plain failure' });
    await expect(
      appendLiveArtifactRefreshLogEntry({
        projectsRoot,
        projectId: 'project-1',
        artifactId: created.artifact.id,
        refreshId: 'refresh-000001',
        sequence: 0,
        step: 'source:read',
        status: 'failed',
        startedAt: '2026-04-30T10:00:00.000Z',
        finishedAt: '2026-04-30T10:00:00.100Z',
        metadata: { headers: { authorization: 'Bearer secret' } },
        error: { message: 'Credential-like metadata must not be persisted' },
      }),
    ).rejects.toMatchObject({
      name: 'LiveArtifactStoreValidationError',
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'refreshLogEntry.metadata.headers' }),
        expect.objectContaining({ path: 'refreshLogEntry.metadata.headers.authorization' }),
      ]),
    });
  });

  it('executes local project file refresh sources with safe bounded outputs', async () => {
    const projectsRoot = await makeProjectsRoot();
    await writeProjectFile(projectsRoot, 'project-1', 'metrics.json', JSON.stringify({ title: 'Q2 Metrics', rows: [{ name: 'Revenue', value: 42 }] }));
    await writeProjectFile(projectsRoot, 'project-1', 'notes/report.md', 'Launch dashboard mentions Revenue and activation.');

    await expect(executeLocalDaemonRefreshSource({
      projectsRoot,
      projectId: 'project-1',
      source: {
        type: 'daemon_tool',
        toolName: 'project_files.search',
        input: { query: 'Revenue', maxResults: 10 },
        refreshPermission: 'manual_refresh_granted_for_read_only',
      },
    })).resolves.toMatchObject({
      toolName: 'project_files.search',
      query: 'Revenue',
      count: 2,
      matches: expect.arrayContaining([
        expect.objectContaining({ path: 'metrics.json' }),
        expect.objectContaining({ path: 'notes/report.md', preview: expect.stringContaining('Revenue') }),
      ]),
    });

    await expect(executeLocalDaemonRefreshSource({
      projectsRoot,
      projectId: 'project-1',
      source: {
        type: 'local_file',
        input: { path: 'metrics.json' },
        refreshPermission: 'manual_refresh_granted_for_read_only',
      },
    })).resolves.toMatchObject({
      toolName: 'project_files.read_json',
      path: 'metrics.json',
      json: { title: 'Q2 Metrics', rows: [{ name: 'Revenue', value: 42 }] },
    });

    await expect(executeLocalDaemonRefreshSource({
      projectsRoot,
      projectId: 'project-1',
      source: {
        type: 'daemon_tool',
        toolName: 'project_files.read_json',
        input: { path: 'metrics.json' },
        refreshPermission: 'manual_refresh_granted_for_read_only',
      },
    })).resolves.toMatchObject({
      toolName: 'project_files.read_json',
      path: 'metrics.json',
      json: { title: 'Q2 Metrics', rows: [{ name: 'Revenue', value: 42 }] },
    });

    await expect(executeLocalDaemonRefreshSource({
      projectsRoot,
      projectId: 'project-1',
      source: {
        type: 'daemon_tool',
        toolName: 'project_files.read_json',
        input: { path: '../secret.json' },
        refreshPermission: 'manual_refresh_granted_for_read_only',
      },
    })).rejects.toThrow(/invalid file name|path escapes|reserved project path/);
  });

  it('merges local_file refresh output into existing document data', () => {
    const document: any = {
      format: 'html_template_v1',
      templatePath: 'template.html',
      generatedPreviewPath: 'index.html',
      dataPath: 'data.json',
      dataJson: {
        title: 'Launch Metrics',
        summary: { owner: 'Agent', status: 'draft' },
      },
      sourceJson: {
        type: 'local_file',
        input: { path: 'project-metrics.json' },
        outputMapping: {
          dataPaths: [
            { from: 'json.summary', to: 'summary' },
            { from: 'json.stats', to: 'stats' },
          ],
          transform: 'identity',
        },
        refreshPermission: 'manual_refresh_granted_for_read_only',
      },
    };

    const candidate = buildLiveArtifactRefreshCandidate({
      artifact: {
        schemaVersion: 1,
        id: 'la-launch-metrics',
        projectId: 'project-1',
        title: 'Launch Metrics',
        slug: 'launch-metrics',
        status: 'active',
        pinned: false,
        preview: { type: 'html', entry: 'index.html' },
        refreshStatus: 'idle',
        createdAt: '2026-05-05T00:00:00.000Z',
        updatedAt: '2026-05-05T00:00:00.000Z',
        document,
      },
      currentDataJson: document.dataJson,
      documentOutput: {
        output: {
          toolName: 'project_files.read_json',
          path: 'project-metrics.json',
          json: {
            summary: { owner: 'Local file', status: 'ready' },
            stats: { openBugs: 7 },
          },
        },
      },
    });

    expect(candidate.dataJson).toEqual({
      title: 'Launch Metrics',
      summary: { owner: 'Local file', status: 'ready' },
      stats: { openBugs: 7 },
    });
  });

  it('executes git.summary as a read-only local refresh source', async () => {
    const projectsRoot = await makeProjectsRoot();
    await writeProjectFile(projectsRoot, 'project-1', 'index.html', '<h1>Draft</h1>');

    const summary = await executeLocalDaemonRefreshSource({
      projectsRoot,
      projectId: 'project-1',
      source: {
        type: 'daemon_tool',
        toolName: 'git.summary',
        input: { maxCommits: 5 },
        refreshPermission: 'manual_refresh_granted_for_read_only',
      },
    });

    expect(summary).toMatchObject({
      toolName: 'git.summary',
      isRepository: false,
      status: [],
      recentCommits: [],
      diffStat: [],
    });
  });

  it('applies declarative refresh output mappings and transforms', () => {
    const output = {
      json: {
        title: 'Q2 Metrics',
        rows: [
          { name: 'Revenue', value: 42, extra: { ignored: true } },
          { name: 'Activation', value: 0.73 },
        ],
      },
      count: 2,
    };

    expect(applyLiveArtifactOutputMapping({
      output,
      source: {
        type: 'daemon_tool',
        toolName: 'project_files.read_json',
        input: { path: 'metrics.json' },
        outputMapping: {
          dataPaths: [
            { from: 'json.title', to: 'summary.title' },
            { from: 'json.rows.0.value', to: 'summary.primaryValue' },
          ],
          transform: 'identity',
        },
        refreshPermission: 'manual_refresh_granted_for_read_only',
      },
    })).toEqual({ summary: { title: 'Q2 Metrics', primaryValue: 42 } });

    expect(applyLiveArtifactOutputMapping({
      output,
      source: {
        type: 'daemon_tool',
        toolName: 'project_files.read_json',
        input: { path: 'metrics.json' },
        outputMapping: { dataPaths: [{ from: 'json.rows', to: 'rows' }], transform: 'compact_table' },
        refreshPermission: 'manual_refresh_granted_for_read_only',
      },
    })).toMatchObject({
      columns: [{ key: 'name', label: 'Name' }, { key: 'value', label: 'Value' }],
      rows: [{ name: 'Revenue', value: 42 }, { name: 'Activation', value: 0.73 }],
      count: 2,
      truncated: false,
    });

    expect(applyLiveArtifactOutputMapping({
      output: { metric: { label: 'Revenue', value: 42, unit: 'k' } },
      source: {
        type: 'daemon_tool',
        toolName: 'project_files.read_json',
        input: { path: 'metrics.json' },
        outputMapping: { dataPaths: [{ from: 'metric', to: 'metric' }], transform: 'metric_summary' },
        refreshPermission: 'manual_refresh_granted_for_read_only',
      },
    })).toMatchObject({ label: 'Revenue', value: 42, unit: 'k', source: { label: 'Revenue', value: 42, unit: 'k' } });
  });

  it('regenerates preview HTML from template.html and data.json as the source of truth', async () => {
    const projectsRoot = await makeProjectsRoot();
    const created = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input: validCreateInput(),
      templateHtml: '<h1>{{data.title}}</h1><p>{{data.owner}}</p>',
    });

    await writeFile(created.paths.dataJsonPath, `${JSON.stringify({ title: 'Disk <Title>', owner: 'Disk & Owner' }, null, 2)}\n`, 'utf8');

    const rendered = await regenerateLiveArtifactPreview({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
    });

    expect(rendered.html).toBe('<h1>Disk &lt;Title&gt;</h1><p>Disk &amp; Owner</p>');
    expect(await readFile(created.paths.generatedPreviewHtmlPath, 'utf8')).toBe(rendered.html);
  });

  it('regenerates missing derived preview output when needed', async () => {
    const projectsRoot = await makeProjectsRoot();
    const created = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input: validCreateInput(),
      templateHtml: '<h1>{{data.title}}</h1>',
    });
    await rm(created.paths.generatedPreviewHtmlPath, { force: true });

    const preview = await ensureLiveArtifactPreview({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
    });

    expect(preview.html).toBe('<h1>Launch &lt;Metrics&gt;</h1>');
    expect(await readFile(created.paths.generatedPreviewHtmlPath, 'utf8')).toBe(preview.html);
  });

  it('updates mutable live artifact presentation fields without changing daemon-owned fields', async () => {
    const projectsRoot = await makeProjectsRoot();
    const created = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input: validCreateInput(),
      createdByRunId: 'run-123',
      now: new Date('2026-04-30T10:11:12.345Z'),
    });

    const updatedDocument = {
      ...created.artifact.document!,
      dataJson: { title: 'Updated <Title>', owner: 'Ops' },
      sourceJson: {
        type: 'connector_tool' as const,
        toolName: 'gmail.search_messages',
        input: { query: 'to:reports' },
        connector: {
          connectorId: 'gmail',
          toolName: 'gmail.search_messages',
          approvalPolicy: 'manual_refresh_granted_for_read_only' as const,
        },
        refreshPermission: 'none' as const,
      },
    };

    const record = await updateLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      artifactId: created.artifact.id,
      input: {
        title: 'Updated Dashboard',
        slug: 'Updated Dashboard!',
        pinned: false,
        status: 'active',
        preview: { type: 'html', entry: 'index.html' },
        document: updatedDocument,
      },
      now: new Date('2026-04-30T10:12:12.345Z'),
    });

    expect(record.artifact).toMatchObject({
      id: created.artifact.id,
      projectId: 'project-1',
      createdByRunId: 'run-123',
      schemaVersion: 1,
      title: 'Updated Dashboard',
      slug: 'updated-dashboard',
      pinned: false,
      status: 'active',
      refreshStatus: 'idle',
      createdAt: '2026-04-30T10:11:12.345Z',
      updatedAt: '2026-04-30T10:12:12.345Z',
      document: updatedDocument,
    });
    expect(await readFile(record.paths.dataJsonPath, 'utf8')).toBe(`${JSON.stringify(updatedDocument.dataJson, null, 2)}\n`);
    expect(await readFile(record.paths.generatedPreviewHtmlPath, 'utf8')).toContain('Updated &lt;Title&gt;');
  });

  it('rejects daemon-owned and run override fields in update input', async () => {
    const projectsRoot = await makeProjectsRoot();
    const created = await createLiveArtifact({
      projectsRoot,
      projectId: 'project-1',
      input: validCreateInput(),
    });

    await expect(
      updateLiveArtifact({
        projectsRoot,
        projectId: 'project-1',
        artifactId: created.artifact.id,
        input: {
          title: 'Should fail',
          id: 'other',
          projectId: 'other-project',
          run: 'run-override',
          runId: 'run-override',
          createdAt: '2026-04-30T10:11:12.345Z',
          updatedAt: '2026-04-30T10:11:12.345Z',
          createdByRunId: 'run-override',
          schemaVersion: 1,
          refreshStatus: 'running',
        },
      }),
    ).rejects.toMatchObject({
      name: 'LiveArtifactStoreValidationError',
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'id' }),
        expect.objectContaining({ path: 'projectId' }),
        expect.objectContaining({ path: 'run' }),
        expect.objectContaining({ path: 'runId' }),
        expect.objectContaining({ path: 'createdAt' }),
        expect.objectContaining({ path: 'updatedAt' }),
        expect.objectContaining({ path: 'createdByRunId' }),
        expect.objectContaining({ path: 'schemaVersion' }),
        expect.objectContaining({ path: 'refreshStatus' }),
      ]),
    });
  });

  it('rejects invalid ids and missing live artifacts during get', async () => {
    const projectsRoot = await makeProjectsRoot();

    await expect(
      getLiveArtifact({ projectsRoot, projectId: 'project-1', artifactId: '../artifact' }),
    ).rejects.toThrow(/invalid live artifact id/);
    await expect(
      getLiveArtifact({ projectsRoot, projectId: 'project-1', artifactId: 'missing-artifact' }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('returns an empty live artifact list when the project has no live artifact storage', async () => {
    const projectsRoot = await makeProjectsRoot();

    await expect(listLiveArtifacts({ projectsRoot, projectId: 'project-1' })).resolves.toEqual([]);
  });

  it('rejects daemon-owned fields in create input', async () => {
    const projectsRoot = await makeProjectsRoot();

    await expect(
      createLiveArtifact({
        projectsRoot,
        projectId: 'project-1',
        input: {
          ...validCreateInput(),
          id: 'artifact-1',
          projectId: 'other-project',
          createdAt: '2026-04-30T10:11:12.345Z',
          updatedAt: '2026-04-30T10:11:12.345Z',
          createdByRunId: 'run-123',
          schemaVersion: 99,
          refreshStatus: 'running',
          lastRefreshedAt: '2026-04-30T10:11:12.345Z',
        },
      }),
    ).rejects.toMatchObject({
      name: 'LiveArtifactStoreValidationError',
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'id' }),
        expect.objectContaining({ path: 'projectId' }),
        expect.objectContaining({ path: 'createdAt' }),
        expect.objectContaining({ path: 'updatedAt' }),
        expect.objectContaining({ path: 'createdByRunId' }),
        expect.objectContaining({ path: 'schemaVersion' }),
        expect.objectContaining({ path: 'refreshStatus' }),
        expect.objectContaining({ path: 'lastRefreshedAt' }),
      ]),
    });
  });
});
