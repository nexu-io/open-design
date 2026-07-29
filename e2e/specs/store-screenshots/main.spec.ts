// @vitest-environment node

import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import JSZip from 'jszip';
import { PNG } from 'pngjs';
import { describe, expect, test } from 'vitest';

import { requestJson } from '@/vitest/http';
import { createSmokeSuite, e2eWorkspaceRoot } from '@/vitest/suite';

const execFileAsync = promisify(execFile);

const createInput = {
  product: {
    name: 'Focus Atlas',
    summary: 'Plan focused work with a calm daily rhythm.',
    audience: 'Independent creators',
    features: ['Plan the day', 'Focus deeply', 'Review progress', 'Build momentum'],
  },
  designSystemId: 'neutral-modern',
  templateId: 'minimal-center',
  pageCount: 4,
  platforms: ['appStore', 'googlePlay'],
};

type ProjectResponse = { project: { id: string } };
type DocumentResponse = { document: { id: string; pages: Array<{ id: string }>; version: number } };
type AssetResponse = { asset: { id: string; width: number; height: number } };
type ChangeResponse = { document: { version: number; pages: Array<{ headline: string }> } };
type ValidationResponse = { valid: boolean; issues: unknown[] };
type CliExportResponse = { ok: true; outputPath: string; bytes: number; job: { status: string } };

describe('store screenshot main spec', () => {
  test('[P1] creates, edits, validates, and exports both store targets through real HTTP and od CLI', async () => {
    const suite = await createSmokeSuite('store-screenshots-main');
    const cliOutput = await mkdtemp(join(tmpdir(), 'od-store-screenshot-cli-'));

    try {
      await suite.with.toolsDev(async ({ webUrl }) => {
        const projectId = `store-e2e-${randomUUID()}`;
        const project = await requestJson<ProjectResponse>(webUrl, '/api/projects', {
          method: 'POST',
          body: {
            id: projectId,
            name: 'Store screenshot HTTP and CLI smoke',
            skillId: null,
            designSystemId: null,
            pendingPrompt: null,
            metadata: { kind: 'image', intent: 'store-screenshot' },
          },
        });
        expect(project.project.id).toBe(projectId);

        const created = await requestJson<DocumentResponse>(webUrl, storePath(projectId), {
          method: 'POST',
          body: createInput,
        });
        expect(created.document.pages).toHaveLength(4);

        const pngPath = join(suite.scratchDir, 'focus-atlas.png');
        const png = new PNG({ width: 8, height: 16, colorType: 2 });
        for (let index = 0; index < png.data.length; index += 4) {
          png.data[index] = 32;
          png.data[index + 1] = 96;
          png.data[index + 2] = 224;
          png.data[index + 3] = 255;
        }
        await writeFile(pngPath, PNG.sync.write(png));

        const form = new FormData();
        form.append('file', new Blob([await readFile(pngPath)], { type: 'image/png' }), 'focus-atlas.png');
        const uploadResponse = await fetch(new URL(`${storePath(projectId)}/assets`, webUrl), {
          method: 'POST',
          body: form,
        });
        const uploadBody = await uploadResponse.text();
        expect(uploadResponse.ok, uploadBody).toBe(true);
        const uploaded = JSON.parse(uploadBody) as AssetResponse;
        expect(uploaded.asset.width).toBe(8);
        expect(uploaded.asset.height).toBe(16);

        const documentAfterUpload = await requestJson<DocumentResponse>(webUrl, storePath(projectId));

        const applied = await requestJson<ChangeResponse>(webUrl, `${storePath(projectId)}/changes/apply`, {
          method: 'POST',
          body: {
            baseVersion: documentAfterUpload.document.version,
            operations: [
              { op: 'setText', pageId: created.document.pages[0]!.id, field: 'headline', value: 'Plan with confidence' },
              { op: 'setAsset', pageId: created.document.pages[0]!.id, assetId: uploaded.asset.id },
            ],
          },
        });
        expect(applied.document.version).toBe(documentAfterUpload.document.version + 1);
        expect(applied.document.pages[0]?.headline).toBe('Plan with confidence');

        const validation = await requestJson<ValidationResponse>(webUrl, `${storePath(projectId)}/validate`, {
          method: 'POST',
          body: { platforms: ['appStore', 'googlePlay'] },
        });
        expect(validation).toEqual({ valid: true, issues: [] });

        const exported = await runStoreScreenshotCli<CliExportResponse>(
          ['store-screenshot', 'export', projectId, '--platform', 'all', '--wait', '--output', cliOutput, '--json'],
          webUrl,
        );
        expect(exported.ok).toBe(true);
        expect(exported.job.status).toBe('done');
        expect(exported.bytes).toBeGreaterThan(0);

        const zip = await JSZip.loadAsync(await readFile(exported.outputPath));
        const expectedFiles = [
          'app-store/01.png', 'app-store/02.png', 'app-store/03.png', 'app-store/04.png',
          'google-play/01.png', 'google-play/02.png', 'google-play/03.png', 'google-play/04.png',
          'manifest.json',
        ];
        expect(Object.keys(zip.files).sort()).toEqual(expectedFiles);
        const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as {
          files: Array<{ fileName: string; width: number; height: number; sha256: string }>;
          platforms: Record<string, { targetSize: { width: number; height: number }; pageCount: number }>;
        };
        expect(manifest.files).toHaveLength(8);
        const manifestPngFiles = manifest.files.map(({ fileName }) => fileName);
        const zipPngFiles = Object.keys(zip.files).filter((name) => name.endsWith('.png'));
        expect(new Set(manifestPngFiles).size).toBe(8);
        expect([...manifestPngFiles].sort()).toEqual([...zipPngFiles].sort());
        expect(manifest.platforms.appStore).toEqual({ targetSize: { width: 1290, height: 2796 }, pageCount: 4, ruleVersion: 1 });
        expect(manifest.platforms.googlePlay).toEqual({ targetSize: { width: 1080, height: 1920 }, pageCount: 4, ruleVersion: 1 });
        for (const file of manifest.files) {
          const body = await zip.file(file.fileName)!.async('nodebuffer');
          const decoded = PNG.sync.read(body);
          expect(readPngIhdr(body)).toEqual({ bitDepth: 8, colorType: 2 });
          expect(decoded.width).toBe(file.width);
          expect(decoded.height).toBe(file.height);
          expect(createHash('sha256').update(body).digest('hex')).toBe(file.sha256);
        }

        await suite.report.json('summary.json', {
          exported: { bytes: exported.bytes, outputPath: exported.outputPath },
          manifest,
          projectId,
          uploaded: uploaded.asset,
        });
      });
    } finally {
      await rm(cliOutput, { force: true, recursive: true });
    }
  }, 180_000);
});

function storePath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/store-screenshots`;
}

function readPngIhdr(body: Buffer): { bitDepth: number; colorType: number } {
  expect(body.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(body.readUInt32BE(8)).toBe(13);
  expect(body.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { bitDepth: body[24]!, colorType: body[25]! };
}

async function runStoreScreenshotCli<T>(args: string[], daemonUrl: string): Promise<T> {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--import', 'tsx', 'apps/daemon/src/cli.ts', ...args],
    {
      cwd: e2eWorkspaceRoot(),
      env: { ...process.env, OD_DAEMON_URL: daemonUrl },
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  return JSON.parse(stdout.trim()) as T;
}
