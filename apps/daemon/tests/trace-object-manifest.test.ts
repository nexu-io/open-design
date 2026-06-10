import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const projectFileReadTracker = vi.hoisted(() => ({ calls: 0 }));

vi.mock('../src/projects.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/projects.js')>();
  return {
    ...actual,
    readProjectFile: async (...args: Parameters<typeof actual.readProjectFile>) => {
      projectFileReadTracker.calls += 1;
      return actual.readProjectFile(...args);
    },
  };
});

import { buildTraceObjectManifests } from '../src/trace-object-manifest.js';

describe('buildTraceObjectManifests', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-trace-objects-'));
    projectFileReadTracker.calls = 0;
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('splits relay uploads when combined base64 JSON would exceed the worker batch cap', async () => {
    const projectsRoot = path.join(dataDir, 'projects');
    const projectDir = path.join(projectsRoot, 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'one.bin'), Buffer.alloc(900, 1));
    await writeFile(path.join(projectDir, 'two.bin'), Buffer.alloc(900, 2));

    const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      const body = init.body as string;
      if (url.includes('/api/objects/authorize')) {
        const parsed = JSON.parse(body) as { objects: unknown[] };
        expect(parsed.objects).toHaveLength(2);
        return new Response(JSON.stringify({ upload_token: 'upload-token' }), { status: 200 });
      }
      expect(init.headers).toMatchObject({
        'X-Open-Design-Telemetry': 'object-ingestion-v1',
      });
      expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(2300);
      const parsed = JSON.parse(body) as {
        upload_token: string;
        objects: Array<{ storage_ref: string; content_base64: string }>;
      };
      expect(parsed.upload_token).toBe('upload-token');
      expect(parsed.objects).toHaveLength(1);
      return new Response(
        JSON.stringify({
          objects: parsed.objects.map((object) => ({
            storage_ref: object.storage_ref,
            status: 'available',
            size_bytes: Buffer.from(object.content_base64, 'base64').byteLength,
            sha256: `sha256:${object.storage_ref.split('/').at(-1)}`,
          })),
        }),
        { status: 200 },
      );
    });

    const manifests = await buildTraceObjectManifests({
      installationId: 'install-1',
      projectId: 'proj-1',
      runId: 'run-1',
      projectsRoot,
      artifacts: [
        { summary: { slug: 'one.bin', type: 'artifact', sizeBytes: 900 } },
        { summary: { slug: 'two.bin', type: 'artifact', sizeBytes: 900 } },
      ],
      prompt: 'prompt',
      prefs: { metrics: true, content: true, artifactManifest: true },
      fetchImpl: fetchSpy as any,
      env: {
        NODE_ENV: 'test',
        OPEN_DESIGN_OBJECT_RELAY_URL: 'https://telemetry.open-design.ai/api/objects/batch',
        OPEN_DESIGN_OBJECT_MAX_BYTES: '1024',
        OPEN_DESIGN_OBJECT_BATCH_MAX_BYTES: '2300',
      },
      now: () => new Date('2026-06-08T00:00:00.000Z'),
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(manifests?.completeness).toBe('complete');
    expect(manifests?.artifactManifest).toHaveLength(2);
    expect(manifests?.artifactManifest?.map((entry) => entry.status)).toEqual(['ok', 'ok']);
    expect(manifests?.artifactManifest?.map((entry) => entry.stored_in_open_design))
      .toEqual([true, true]);
  });

  it('reads attachments and nested produced artifacts from imported project metadata roots', async () => {
    const projectsRoot = path.join(dataDir, 'projects');
    const importedRoot = path.join(dataDir, 'imported-project');
    await mkdir(path.join(importedRoot, 'dist'), { recursive: true });
    await mkdir(path.join(importedRoot, 'uploads'), { recursive: true });
    await writeFile(path.join(importedRoot, 'dist', 'index.html'), '<!doctype html><h1>imported</h1>');
    await writeFile(path.join(importedRoot, 'uploads', 'brief.txt'), 'imported brief');
    await mkdir(path.join(projectsRoot, 'proj-1'), { recursive: true });
    await writeFile(path.join(projectsRoot, 'proj-1', 'index.html'), '<!doctype html><h1>wrong root</h1>');
    await mkdir(path.join(projectsRoot, 'proj-1', 'uploads'), { recursive: true });
    await writeFile(path.join(projectsRoot, 'proj-1', 'uploads', 'brief.txt'), 'wrong brief');

    const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      const parsed = JSON.parse(init.body as string) as {
        objects: Array<{
          storage_ref: string;
          object_class: string;
          filename: string;
          content_base64: string;
        }>;
      };
      if (url.includes('/api/objects/authorize')) {
        expect(parsed.objects).toHaveLength(2);
        return new Response(JSON.stringify({ upload_token: 'upload-token' }), { status: 200 });
      }
      expect((parsed as unknown as { upload_token: string }).upload_token).toBe('upload-token');
      expect(parsed.objects).toHaveLength(2);
      const attachment = parsed.objects.find((object) => object.object_class === 'attachment');
      const artifact = parsed.objects.find((object) => object.object_class === 'artifact');
      expect(attachment?.filename).toBe('uploads/brief.txt');
      expect(Buffer.from(attachment!.content_base64, 'base64').toString('utf8'))
        .toBe('imported brief');
      expect(artifact?.filename).toBe('dist/index.html');
      expect(Buffer.from(artifact!.content_base64, 'base64').toString('utf8'))
        .toBe('<!doctype html><h1>imported</h1>');
      return new Response(
        JSON.stringify({
          objects: parsed.objects.map((object) => ({
            storage_ref: object.storage_ref,
            status: 'available',
            size_bytes: Buffer.from(object.content_base64, 'base64').byteLength,
          })),
        }),
        { status: 200 },
      );
    });

    const manifests = await buildTraceObjectManifests({
      installationId: 'install-1',
      projectId: 'proj-1',
      runId: 'run-1',
      projectsRoot,
      projectMetadata: { baseDir: importedRoot },
      attachmentPaths: ['uploads/brief.txt'],
      artifacts: [
        {
          summary: { slug: 'index.html', type: 'html', sizeBytes: 31 },
          sourcePath: 'dist/index.html',
        },
      ],
      prompt: 'prompt',
      prefs: { metrics: true, content: true, artifactManifest: true },
      fetchImpl: fetchSpy as any,
      env: {
        NODE_ENV: 'test',
        OPEN_DESIGN_OBJECT_RELAY_URL: 'https://telemetry.open-design.ai/api/objects/batch',
      },
      now: () => new Date('2026-06-08T00:00:00.000Z'),
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(manifests?.completeness).toBe('complete');
    expect(manifests?.attachmentManifest?.[0]).toMatchObject({
      status: 'ok',
      extension: 'txt',
      stored_in_open_design: true,
    });
    expect(manifests?.artifactManifest?.[0]).toMatchObject({
      status: 'ok',
      extension: 'html',
      stored_in_open_design: true,
    });
    expect(manifests?.attachmentManifest?.[0]).not.toHaveProperty('reason');
    expect(manifests?.artifactManifest?.[0]).not.toHaveProperty('reason');
  });

  it('does not put pending authorization reasons into registration-only manifests', async () => {
    const projectsRoot = path.join(dataDir, 'projects');
    const projectDir = path.join(projectsRoot, 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'artifact.txt'), 'release artifact');

    const manifests = await buildTraceObjectManifests({
      installationId: 'install-1',
      projectId: 'proj-1',
      runId: 'run-1',
      projectsRoot,
      artifacts: [
        { summary: { slug: 'artifact.txt', type: 'text', sizeBytes: 'release artifact'.length } },
      ],
      prompt: 'prompt',
      prefs: { metrics: true, content: true, artifactManifest: true },
      fetchImpl: vi.fn() as any,
      env: {
        NODE_ENV: 'test',
        OPEN_DESIGN_OBJECT_RELAY_URL: 'https://telemetry.open-design.ai/api/objects/batch',
      },
      uploadMode: 'manifest-only',
      now: () => new Date('2026-06-08T00:00:00.000Z'),
    });

    expect(manifests?.completeness).toBe('partial');
    expect(manifests?.artifactManifest?.[0]).toMatchObject({
      status: 'unavailable',
      stored_in_open_design: false,
      size_bytes: 'release artifact'.length,
      sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(manifests?.artifactManifest?.[0]).not.toHaveProperty('reason');
  });

  it('splits relay uploads at the worker object count cap', async () => {
    const projectsRoot = path.join(dataDir, 'projects');
    const projectDir = path.join(projectsRoot, 'proj-1');
    await mkdir(projectDir, { recursive: true });
    const artifacts = [];
    for (let index = 0; index < 101; index += 1) {
      const name = `artifact-${index}.txt`;
      await writeFile(path.join(projectDir, name), `artifact ${index}`);
      artifacts.push({ summary: { slug: name, type: 'text', sizeBytes: `artifact ${index}`.length } });
    }

    const batchSizes: number[] = [];
    const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      const parsed = JSON.parse(init.body as string) as {
        objects: Array<{ storage_ref: string; content_base64: string }>;
      };
      if (url.includes('/api/objects/authorize')) {
        expect(parsed.objects).toHaveLength(101);
        return new Response(JSON.stringify({ upload_token: 'upload-token' }), { status: 200 });
      }
      batchSizes.push(parsed.objects.length);
      return new Response(
        JSON.stringify({
          objects: parsed.objects.map((object) => ({
            storage_ref: object.storage_ref,
            status: 'available',
            size_bytes: Buffer.from(object.content_base64, 'base64').byteLength,
          })),
        }),
        { status: 200 },
      );
    });

    const manifests = await buildTraceObjectManifests({
      installationId: 'install-1',
      projectId: 'proj-1',
      runId: 'run-1',
      projectsRoot,
      artifacts,
      prompt: 'prompt',
      prefs: { metrics: true, content: true, artifactManifest: true },
      fetchImpl: fetchSpy as any,
      env: {
        NODE_ENV: 'test',
        OPEN_DESIGN_OBJECT_RELAY_URL: 'https://telemetry.open-design.ai/api/objects/batch',
      },
      now: () => new Date('2026-06-08T00:00:00.000Z'),
    });

    expect(batchSizes).toEqual([100, 1]);
    expect(manifests?.completeness).toBe('complete');
    expect(manifests?.artifactManifest).toHaveLength(101);
  });

  it('derives the object relay endpoint from the telemetry relay endpoint', async () => {
    const projectsRoot = path.join(dataDir, 'projects');
    const projectDir = path.join(projectsRoot, 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'artifact.txt'), 'release artifact');
    const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      const parsed = JSON.parse(init.body as string) as {
        objects: Array<{ storage_ref: string; content_base64?: string }>;
      };
      if (url.includes('/api/objects/authorize')) {
        expect(parsed.objects).toHaveLength(1);
        return new Response(JSON.stringify({ upload_token: 'upload-token' }), { status: 200 });
      }
      expect(url).toBe('https://telemetry.open-design.ai/api/objects/batch');
      expect((parsed as unknown as { upload_token: string }).upload_token).toBe('upload-token');
      expect(parsed.objects).toHaveLength(1);
      return new Response(
        JSON.stringify({
          objects: parsed.objects.map((object) => ({
            storage_ref: object.storage_ref,
            status: 'available',
            size_bytes: Buffer.from(object.content_base64!, 'base64').byteLength,
          })),
        }),
        { status: 200 },
      );
    });

    const manifests = await buildTraceObjectManifests({
      installationId: 'install-1',
      projectId: 'proj-1',
      runId: 'run-1',
      projectsRoot,
      artifacts: [
        { summary: { slug: 'artifact.txt', type: 'text', sizeBytes: 'release artifact'.length } },
      ],
      prompt: 'prompt',
      prefs: { metrics: true, content: true, artifactManifest: true },
      fetchImpl: fetchSpy as any,
      env: {
        NODE_ENV: 'production',
        OPEN_DESIGN_TELEMETRY_RELAY_URL: 'https://telemetry.open-design.ai/api/langfuse//',
      },
      now: () => new Date('2026-06-08T00:00:00.000Z'),
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0]![0]).toBe('https://telemetry.open-design.ai/api/objects/authorize');
    expect(fetchSpy.mock.calls[1]![0]).toBe('https://telemetry.open-design.ai/api/objects/batch');
    expect(projectFileReadTracker.calls).toBe(1);
    expect(manifests?.completeness).toBe('complete');
    expect(manifests?.artifactManifest?.[0]).toMatchObject({
      status: 'ok',
      stored_in_open_design: true,
      size_bytes: 'release artifact'.length,
    });
  });

  it('skips over-limit project files before loading their contents', async () => {
    const projectsRoot = path.join(dataDir, 'projects');
    const projectDir = path.join(projectsRoot, 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'too-large.bin'), Buffer.alloc(16, 1));
    const fetchSpy = vi.fn();

    const manifests = await buildTraceObjectManifests({
      installationId: 'install-1',
      projectId: 'proj-1',
      runId: 'run-1',
      projectsRoot,
      artifacts: [
        { summary: { slug: 'too-large.bin', type: 'artifact', sizeBytes: 16 } },
      ],
      prompt: 'prompt',
      prefs: { metrics: true, content: true, artifactManifest: true },
      fetchImpl: fetchSpy as any,
      env: {
        NODE_ENV: 'test',
        OPEN_DESIGN_OBJECT_RELAY_URL: 'https://telemetry.open-design.ai/api/objects/batch',
        OPEN_DESIGN_OBJECT_MAX_BYTES: '8',
      },
      now: () => new Date('2026-06-08T00:00:00.000Z'),
    });

    expect(projectFileReadTracker.calls).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(manifests?.completeness).toBe('partial');
    expect(manifests?.artifactManifest?.[0]).toMatchObject({
      status: 'unavailable',
      reason: 'object_too_large',
      size_bytes: 16,
    });
  });
});
