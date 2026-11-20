/**
 * Generated media must be held to the SAME project-directory containment as the
 * project file APIs — for managed projects and for imported/custom-location
 * projects (`metadata.baseDir`) alike.
 *
 * Before this suite existed, the media write path resolved its target with
 * `path.join(dir, sanitizeName(output))`. `sanitizeName` flattens separators, so
 * `../escape.png` silently became `__escape.png` instead of being refused the
 * way `writeProjectFile` refuses it, and a symlinked subdirectory inside the
 * project stayed a valid place to write through. Both are guarantees the file
 * APIs already make, and "inside the project" has to mean one thing, so the
 * media path now calls the same helpers (`sanitizePath` + `resolveSafeReal`)
 * instead of defining a second, looser rule.
 *
 * Every rejection below is asserted TWICE: once through `generateMedia`, once
 * through `writeProjectFile` with the identical name and project. That is the
 * point of the suite — not just "media rejects this", but "media rejects it
 * exactly the way the file APIs do".
 */

import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media/index.js';
import { writeProjectFile } from '../src/projects.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';

interface ProjectFlow {
  /** `managed` = daemon-owned projects root; `imported` = metadata.baseDir. */
  name: string;
  /** Fixed project id so both APIs write into the same project. */
  projectId: string;
  /** Every assertion reads here. */
  expectedRoot: () => string;
  /** `metadata` handed to both APIs; the only difference between the flows. */
  metadata: () => unknown;
}

describe('generated media honours the project file APIs\' containment', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  let importedRoot: string;
  let flows: ProjectFlow[];
  const realFetch = globalThis.fetch;
  const originalMinimaxApiKey = process.env.OD_MINIMAX_API_KEY;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-media-containment-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    importedRoot = path.join(root, 'imported-project');
    await mkdir(projectsRoot, { recursive: true });
    await mkdir(importedRoot, { recursive: true });

    flows = [
      {
        name: 'managed project',
        projectId: 'managed-containment',
        expectedRoot: () => path.join(projectsRoot, 'managed-containment'),
        metadata: () => undefined,
      },
      {
        name: 'imported project',
        projectId: 'imported-containment',
        expectedRoot: () => importedRoot,
        metadata: () => ({ kind: 'prototype', baseDir: importedRoot }),
      },
    ];

    process.env.OD_MINIMAX_API_KEY = 'minimax-test-key';
    const configFile = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(configFile), { recursive: true });
    await writeFile(configFile, JSON.stringify({ providers: { minimax: {} } }), 'utf8');
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    if (originalMinimaxApiKey == null) {
      delete process.env.OD_MINIMAX_API_KEY;
    } else {
      process.env.OD_MINIMAX_API_KEY = originalMinimaxApiKey;
    }
    await rm(root, { recursive: true, force: true });
  });

  /**
   * Stub the provider so only the write path under test can fail. A case that
   * must be refused before any bytes are requested asserts the mock is never
   * called; a case that must succeed just answers with a real 1x1 PNG.
   */
  function stubProvider({ mustNotBeCalled = false } = {}) {
    const fetchMock = vi.fn(async () => {
      expect(
        mustNotBeCalled,
        'the provider was reached, so the path was not refused before generation',
      ).toBe(false);
      return new Response(JSON.stringify({
        base_resp: { status_code: 0, status_msg: 'success' },
        data: { image_base64: [PNG_BASE64] },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function generate(flow: ProjectFlow, output: string) {
    return generateMedia({
      projectRoot,
      projectsRoot,
      projectId: flow.projectId,
      metadata: flow.metadata(),
      surface: 'image',
      model: 'minimax-image-01',
      prompt: 'containment probe',
      output,
    });
  }

  function writeThroughFileApi(flow: ProjectFlow, name: string) {
    return writeProjectFile(
      projectsRoot,
      flow.projectId,
      name,
      Buffer.from(PNG_BASE64, 'base64'),
      {},
      flow.metadata(),
    );
  }

  type Refusal = Error & { code?: string };

  /**
   * Capture a refusal from both APIs so the two can be compared rather than
   * merely both "throwing". A path the file API refuses and the media path
   * accepts — or refuses for a different reason — is exactly the drift this
   * suite exists to catch.
   */
  async function refusalsFor(flow: ProjectFlow, output: string) {
    stubProvider({ mustNotBeCalled: true });

    const media = await generate(flow, output).then(
      () => null,
      (err: Refusal) => err,
    );
    expect(media, `generateMedia accepted "${output}" in the ${flow.name}`).not.toBeNull();

    const fileApi = await writeThroughFileApi(flow, output).then(
      () => null,
      (err: Refusal) => err,
    );
    expect(fileApi, `writeProjectFile accepted "${output}" in the ${flow.name}`).not.toBeNull();

    return { media: media!, fileApi: fileApi! };
  }

  describe.each(['managed project', 'imported project'])('%s', (flowName) => {
    const flowFor = () => flows.find((flow) => flow.name === flowName)!;

    it('refuses a traversal name exactly as the file APIs do', async () => {
      const flow = flowFor();
      const { media, fileApi } = await refusalsFor(flow, '../escape.png');

      // Identical verdict, byte for byte — the media path reuses the file
      // APIs' own validator rather than flattening the name into the project
      // (`sanitizeName` used to turn this into `__escape.png`).
      expect(media.message).toBe(fileApi.message);
      expect(media.code).toBe(fileApi.code);
      expect(media.message).toMatch(
        /^invalid file name$|^hidden path segments are not accessible in imported folders$/,
      );

      await expect(readFile(path.join(root, 'escape.png'))).rejects.toThrow();
      await expect(readFile(path.join(flow.expectedRoot(), 'escape.png'))).rejects.toThrow();
      await expect(readFile(path.join(flow.expectedRoot(), '__escape.png'))).rejects.toThrow();
    });

    it('refuses an absolute output path exactly as the file APIs do', async () => {
      const flow = flowFor();
      const absolute = path.join(root, 'absolute-escape.png');
      const { media, fileApi } = await refusalsFor(flow, absolute);

      expect(media.message).toBe(fileApi.message);
      expect(media.code).toBe(fileApi.code);
      await expect(readFile(absolute)).rejects.toThrow();
    });

    it('refuses to write through a symlinked subdirectory, like the file APIs', async (ctx) => {
      const flow = flowFor();
      const outside = path.join(root, `${flow.projectId}-outside`);
      const projectDir = flow.expectedRoot();
      await mkdir(projectDir, { recursive: true });
      await mkdir(outside, { recursive: true });

      // Windows without Developer Mode only permits directory junctions; both
      // forms resolve identically through realpath(), which is the check the
      // shared helper makes.
      try {
        await symlink(outside, path.join(projectDir, 'assets'), process.platform === 'win32' ? 'junction' : 'dir');
      } catch {
        // No symlink privilege on this host. Report it as skipped instead of
        // passing silently — the string-level containment rules stay covered by
        // the traversal and absolute-path cases above.
        ctx.skip('this host does not allow creating a directory symlink');
      }

      const { media, fileApi } = await refusalsFor(flow, 'assets/linked.png');

      expect(fileApi.code).toBe('EPATHESCAPE');
      expect(media.code).toBe(fileApi.code);
      expect(media.message).toBe(fileApi.message);
      await expect(readFile(path.join(outside, 'linked.png'))).rejects.toThrow();
    });

    it('still writes a normal nested media name under the project root', async () => {
      const flow = flowFor();
      stubProvider();

      const result = await generate(flow, 'media/shots/poster.png');

      // `name` is what the chat card and the late-association entry point key
      // off, so it must stay the project-relative nested path rather than a
      // flattened `media_shots_poster.png`.
      expect(result.name).toBe('media/shots/poster.png');
      expect(result.kind).toBe('image');
      await expect(readFile(path.join(flow.expectedRoot(), 'media', 'shots', 'poster.png')))
        .resolves.toEqual(Buffer.from(PNG_BASE64, 'base64'));
    });
  });

  it('keeps the imported root as the write target, never the managed projects dir', async () => {
    const imported = flows.find((flow) => flow.name === 'imported project')!;
    stubProvider();

    const result = await generate(imported, 'imported-only.png');

    expect(result.name).toBe('imported-only.png');
    await expect(readFile(path.join(importedRoot, 'imported-only.png')))
      .resolves.toEqual(Buffer.from(PNG_BASE64, 'base64'));
    await expect(
      readFile(path.join(projectsRoot, imported.projectId, 'imported-only.png')),
    ).rejects.toThrow();
  });
});
