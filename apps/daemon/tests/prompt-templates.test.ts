import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listPromptTemplates, readPromptTemplate } from '../src/media/prompt-templates.js';

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sample',
    surface: 'image',
    title: 'Sample template',
    summary: 'A short description',
    category: 'General',
    tags: ['demo'],
    prompt: 'Render a cinematic still life with even rim lighting.',
    source: { repo: 'example/repo', license: 'MIT' },
    ...overrides,
  };
}

describe('listPromptTemplates', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-prompt-templates-'));
    await mkdir(path.join(root, 'image'), { recursive: true });
    await mkdir(path.join(root, 'video'), { recursive: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it('returns an empty list when the root has no templates', async () => {
    expect(await listPromptTemplates(root)).toEqual([]);
  });

  it('returns an empty list when the root directory is missing', async () => {
    await rm(root, { recursive: true, force: true });
    expect(await listPromptTemplates(root)).toEqual([]);
  });

  it('loads valid templates from both surfaces', async () => {
    await writeFile(
      path.join(root, 'image', 'still-life.json'),
      JSON.stringify(makeTemplate({ id: 'still-life', title: 'Still life' })),
    );
    await writeFile(
      path.join(root, 'video', 'pan-shot.json'),
      JSON.stringify(makeTemplate({ id: 'pan-shot', surface: 'video', title: 'Pan shot' })),
    );
    const result = await listPromptTemplates(root);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(['still-life', 'pan-shot']);
  });

  it('orders image surface before video, then alpha by title', async () => {
    await writeFile(
      path.join(root, 'image', 'b.json'),
      JSON.stringify(makeTemplate({ id: 'b', title: 'Beta' })),
    );
    await writeFile(
      path.join(root, 'image', 'a.json'),
      JSON.stringify(makeTemplate({ id: 'a', title: 'Alpha' })),
    );
    await writeFile(
      path.join(root, 'video', 'z.json'),
      JSON.stringify(makeTemplate({ id: 'z', surface: 'video', title: 'Zeta' })),
    );
    const result = await listPromptTemplates(root);
    expect(result.map((t) => t.title)).toEqual(['Alpha', 'Beta', 'Zeta']);
  });

  it('skips files whose surface does not match the folder', async () => {
    await writeFile(
      path.join(root, 'image', 'wrong.json'),
      JSON.stringify(makeTemplate({ surface: 'video' })),
    );
    expect(await listPromptTemplates(root)).toEqual([]);
  });

  it('skips files missing id, title, prompt, or source', async () => {
    await writeFile(
      path.join(root, 'image', 'no-id.json'),
      JSON.stringify(makeTemplate({ id: '' })),
    );
    await writeFile(
      path.join(root, 'image', 'short-prompt.json'),
      JSON.stringify(makeTemplate({ id: 'short', prompt: 'too short' })),
    );
    await writeFile(
      path.join(root, 'image', 'no-source.json'),
      JSON.stringify(makeTemplate({ id: 'no-src', source: undefined })),
    );
    await writeFile(
      path.join(root, 'image', 'no-title.json'),
      JSON.stringify(makeTemplate({ id: 'no-title', title: '' })),
    );
    expect(await listPromptTemplates(root)).toEqual([]);
  });

  it('skips a file whose id does not match its filename', async () => {
    // The list exposes `id` and readPromptTemplate resolves `${id}.json`; if a
    // file's id drifts from its filename the gallery would advertise a template
    // the detail endpoint immediately 404s. Both paths must reject it.
    await writeFile(
      path.join(root, 'image', 'real-name.json'),
      JSON.stringify(makeTemplate({ id: 'different-id' })),
    );
    expect(await listPromptTemplates(root)).toEqual([]);
    expect(await readPromptTemplate(root, 'image', 'different-id')).toBeNull();
    expect(await readPromptTemplate(root, 'image', 'real-name')).toBeNull();
  });

  it('skips malformed JSON without throwing', async () => {
    await writeFile(path.join(root, 'image', 'bad.json'), '{not json');
    await writeFile(
      path.join(root, 'image', 'good.json'),
      JSON.stringify(makeTemplate({ id: 'good' })),
    );
    const result = await listPromptTemplates(root);
    expect(result.map((t) => t.id)).toEqual(['good']);
  });

  it('ignores non-json files in the surface directory', async () => {
    await writeFile(path.join(root, 'image', 'README.md'), '# notes');
    await writeFile(
      path.join(root, 'image', 'real.json'),
      JSON.stringify(makeTemplate({ id: 'real' })),
    );
    const result = await listPromptTemplates(root);
    expect(result.map((t) => t.id)).toEqual(['real']);
  });
});

describe('readPromptTemplate', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-prompt-templates-'));
    await mkdir(path.join(root, 'image'), { recursive: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it('returns the parsed template when the id exists', async () => {
    await writeFile(
      path.join(root, 'image', 'hero.json'),
      JSON.stringify(makeTemplate({ id: 'hero', title: 'Hero shot' })),
    );
    const result = await readPromptTemplate(root, 'image', 'hero');
    expect(result?.id).toBe('hero');
    expect(result?.title).toBe('Hero shot');
  });

  it('returns null for an unknown id', async () => {
    expect(await readPromptTemplate(root, 'image', 'missing')).toBeNull();
  });

  it('returns null for an unsupported surface', async () => {
    expect(await readPromptTemplate(root, 'audio', 'anything')).toBeNull();
  });

  it('returns null when the JSON parses but fails validation', async () => {
    await writeFile(
      path.join(root, 'image', 'bad.json'),
      JSON.stringify(makeTemplate({ id: 'bad', prompt: 'too short' })),
    );
    expect(await readPromptTemplate(root, 'image', 'bad')).toBeNull();
  });

  it('returns null for a path-traversal id instead of reading outside the surface dir', async () => {
    // `id` arrives straight from the request path (`/api/prompt-templates/:surface/:id`,
    // where a percent-encoded `..%2f` decodes back to `../`). Plant a valid template one
    // level above the surface dir and confirm a traversal id can't resolve to it.
    await writeFile(
      path.join(root, 'secret.json'),
      JSON.stringify(makeTemplate({ id: '../secret' })),
    );
    expect(await readPromptTemplate(root, 'image', '../secret')).toBeNull();
  });
});
