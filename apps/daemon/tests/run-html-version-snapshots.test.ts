import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  artifactOriginForRun,
  snapshotAiHtmlVersionsForRun,
} from '../src/run-html-version-snapshots.js';
import { listProjectFileVersions } from '../src/project-file-versions.js';

describe('AI HTML version snapshots', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('derives bounded Artifact origin only from a validated Plugin run context', () => {
    expect(artifactOriginForRun({
      runId: 'run-1',
      externalPluginAnalytics: {
        entrySurface: 'external_mcp',
        externalPluginId: 'open-design',
        pluginWorkflowId: 'workflow-1',
      },
    })).toEqual({
      entrySurface: 'external_mcp',
      externalPluginId: 'open-design',
      pluginWorkflowId: 'workflow-1',
      runId: 'run-1',
    });
    expect(artifactOriginForRun({
      runId: 'run-old-id',
      externalPluginAnalytics: {
        entrySurface: 'external_mcp',
        externalPluginId: 'open-design-cloud',
        pluginWorkflowId: 'workflow-old-id',
      },
    })).toBeUndefined();
    expect(artifactOriginForRun({
      runId: 'run-2',
      externalPluginAnalytics: {
        entrySurface: 'open_design_ui',
        externalPluginId: 'open-design',
        pluginWorkflowId: 'workflow-2',
      },
    })).toBeUndefined();
    expect(artifactOriginForRun({
      runId: 'run-3',
      externalPluginAnalytics: {
        entrySurface: 'external_mcp',
        externalPluginId: 'unknown-plugin',
        pluginWorkflowId: 'workflow-3',
      },
    })).toBeUndefined();
  });

  async function makeProject(): Promise<{ root: string; projectsRoot: string; projectId: string; projectRoot: string }> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-html-version-snapshots-'));
    roots.push(root);
    const projectsRoot = path.join(root, 'projects');
    const projectId = 'project-1';
    const projectRoot = path.join(projectsRoot, projectId);
    await fs.mkdir(projectRoot, { recursive: true });
    return { root, projectsRoot, projectId, projectRoot };
  }

  it('throws an aggregate error when a touched HTML version cannot be persisted', async () => {
    const { projectsRoot, projectId, projectRoot } = await makeProject();
    const htmlPath = path.join(projectRoot, 'index.html');
    await fs.writeFile(htmlPath, '<html><body>draft</body></html>');
    await fs.writeFile(path.join(projectRoot, '.file-versions'), 'blocked');

    await expect(snapshotAiHtmlVersionsForRun({
      projectsRoot,
      projectId,
      projectRoot,
      diff: { touchedPaths: [htmlPath] },
      prompt: 'Make a page',
      promptSource: 'message',
    })).rejects.toMatchObject({
      code: 'HTML_VERSION_SNAPSHOT_FAILED',
      failures: [{ fileName: 'index.html' }],
    });
  });

  it('persists the validated run origin on each touched HTML snapshot', async () => {
    const { projectsRoot, projectId, projectRoot } = await makeProject();
    const htmlPath = path.join(projectRoot, 'index.html');
    await fs.writeFile(htmlPath, '<html><body>plugin artifact</body></html>');

    const result = await snapshotAiHtmlVersionsForRun({
      projectsRoot,
      projectId,
      projectRoot,
      diff: { touchedPaths: [htmlPath] },
      prompt: 'Make a page',
      promptSource: 'message',
      origin: {
        entrySurface: 'external_mcp',
        externalPluginId: 'open-design',
        pluginWorkflowId: 'workflow-1',
        runId: 'run-1',
      },
    });

    const versions = await listProjectFileVersions(projectsRoot, projectId, 'index.html');
    expect(result.snapshots).toEqual([
      {
        fileName: 'index.html',
        version: expect.objectContaining({
          id: versions[0]?.id,
          current: true,
          origin: expect.objectContaining({ runId: 'run-1' }),
        }),
      },
    ]);
    expect(versions).toMatchObject([
      {
        current: true,
        contentDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        origin: {
          entrySurface: 'external_mcp',
          externalPluginId: 'open-design',
          pluginWorkflowId: 'workflow-1',
          runId: 'run-1',
        },
      },
    ]);
  });

  it('creates a new version when identical HTML is produced by a different Plugin run', async () => {
    const { projectsRoot, projectId, projectRoot } = await makeProject();
    const htmlPath = path.join(projectRoot, 'index.html');
    await fs.writeFile(htmlPath, '<html><body>same artifact</body></html>');

    for (const run of ['run-1', 'run-2']) {
      await snapshotAiHtmlVersionsForRun({
        projectsRoot,
        projectId,
        projectRoot,
        diff: { touchedPaths: [htmlPath] },
        prompt: 'Make a page',
        promptSource: 'message',
        origin: {
          entrySurface: 'external_mcp',
          externalPluginId: 'open-design',
          pluginWorkflowId: `workflow-${run}`,
          runId: run,
        },
      });
    }

    const versions = await listProjectFileVersions(
      projectsRoot,
      projectId,
      'index.html',
    );
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({
      current: false,
      origin: { runId: 'run-1' },
    });
    expect(versions[1]).toMatchObject({
      current: true,
      origin: { runId: 'run-2' },
    });
  });
});
