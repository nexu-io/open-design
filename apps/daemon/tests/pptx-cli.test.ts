import { mkdtemp, open, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runGroundedPptxCli } from '../src/pptx-cli.js';
import { GROUNDED_PPTX_LIMITS } from '../src/pptx-grounded/office-kit-adapter.js';

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('od pptx', () => {
  it('analyzes through the daemon API and prints JSON', async () => {
    const request = vi.fn(async () =>
      new Response(JSON.stringify({ structure: { slideCount: 2 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', request);
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runGroundedPptxCli([
      'analyze',
      'deck one',
      '--daemon-url',
      'http://daemon.test',
      '--json',
    ]);

    expect(request).toHaveBeenCalledWith('http://daemon.test/api/projects/deck%20one/pptx');
    expect(output).toHaveBeenCalledWith('{"structure":{"slideCount":2}}');
  });

  it('exports the current native revision to the requested path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-cli-'));
    roots.push(root);
    const outputPath = path.join(root, 'result.pptx');
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ manifest: { currentRevisionId: 'r0007' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([0x50, 0x4b, 1, 2]), { status: 200 }));
    vi.stubGlobal('fetch', request);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runGroundedPptxCli([
      'export',
      'deck-1',
      '--output',
      outputPath,
      '--daemon-url',
      'http://daemon.test',
      '--json',
    ]);

    expect(request).toHaveBeenLastCalledWith(
      'http://daemon.test/api/projects/deck-1/pptx/revisions/r0007/download',
    );
    expect(await readFile(outputPath)).toEqual(Buffer.from([0x50, 0x4b, 1, 2]));
  });

  it('imports and applies through the daemon request contracts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-cli-'));
    roots.push(root);
    const source = path.join(root, 'source.pptx');
    const operations = path.join(root, 'operations.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(source, new Uint8Array([0x50, 0x4b]));
    await writeFile(operations, JSON.stringify([{ op: 'duplicateSlide', sourceIndex: 0, insertAt: 1, replacements: [] }]));
    const request = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({ ok: true }), { status: 201 }));
    vi.stubGlobal('fetch', request);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runGroundedPptxCli(['import', 'deck-1', source, '--daemon-url', 'http://daemon.test']);
    expect(request.mock.calls[0]?.[0]).toBe('http://daemon.test/api/projects/deck-1/pptx/import');
    expect(request.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));

    await runGroundedPptxCli(['apply', 'deck-1', '--operations', operations, '--expected-revision', 'r0001', '--daemon-url', 'http://daemon.test']);
    expect(request).toHaveBeenLastCalledWith(
      'http://daemon.test/api/projects/deck-1/pptx/apply',
      expect.objectContaining({ body: expect.stringContaining('"expectedRevisionId":"r0001"') }),
    );
  });

  it('rejects a symlinked import instead of following a checked pathname', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-cli-'));
    roots.push(root);
    const target = path.join(root, 'target.pptx');
    const source = path.join(root, 'source.pptx');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(target, new Uint8Array([0x50, 0x4b]));
    await symlink(target, source);
    const request = vi.fn();
    vi.stubGlobal('fetch', request);

    await expect(runGroundedPptxCli([
      'import', 'deck-1', source, '--daemon-url', 'http://daemon.test',
    ])).rejects.toThrow(/regular|symlink|safe/i);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects an oversized import from the opened handle before reading or sending it', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-cli-'));
    roots.push(root);
    const source = path.join(root, 'oversized.pptx');
    const handle = await open(source, 'w');
    await handle.truncate(GROUNDED_PPTX_LIMITS.maxCompressedBytes + 1);
    await handle.close();
    const request = vi.fn();
    vi.stubGlobal('fetch', request);

    await expect(runGroundedPptxCli([
      'import', 'deck-1', source, '--daemon-url', 'http://daemon.test',
    ])).rejects.toThrow('compressed size exceeds limit');
    expect(request).not.toHaveBeenCalled();
  });

  it('writes a requested slide preview to disk', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-cli-'));
    roots.push(root);
    const outputPath = path.join(root, 'slide.png');
    const request = vi.fn(async () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200 }));
    vi.stubGlobal('fetch', request);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runGroundedPptxCli(['preview', 'deck-1', '--revision', 'r0002', '--slide', '3', '--output', outputPath, '--daemon-url', 'http://daemon.test']);
    expect(request).toHaveBeenCalledWith('http://daemon.test/api/projects/deck-1/pptx/revisions/r0002/slides/3/preview');
    expect(await readFile(outputPath)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });
});
