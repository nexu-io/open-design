import type http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getWorkspaceResourceByResourceId, openDatabase } from '../src/db.js';
import { startServer } from '../src/server.js';

let server: http.Server;
let baseUrl: string;
let shutdown: (() => Promise<void> | void) | undefined;

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  server = started.server;
  shutdown = started.shutdown;
});

afterAll(async () => {
  await Promise.resolve(shutdown?.());
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function batchBody(
  items: Array<Record<string, unknown>>,
  headers: Record<string, string> = {},
) {
  return fetch(`${baseUrl}/api/skills/import-batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ skills: items }),
  });
}

function skillMdFor(name: string, body = `# ${name}\n\nDo the thing.`) {
  return `---\nname: ${name}\ndescription: ${name} fixture\n---\n\n${body}`;
}

function skillItem(name: string, body?: string) {
  return { fallbackName: name, skillMd: skillMdFor(name, body) };
}

describe('POST /api/skills/import-batch', () => {
  it('imports independent items and reports per-skill outcomes (partial success)', async () => {
    const suffix = Date.now();
    // Pre-existing user skill: the duplicate item must not abort the batch.
    const seeded = await fetch(`${baseUrl}/api/skills/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: `batch-seeded-${suffix}`, description: 'seed', body: '# seed' }),
    });
    expect(seeded.status).toBe(201);
    await seeded.json();

    const response = await batchBody([
      skillItem(`batch-good-${suffix}`),
      skillItem(`batch-seeded-${suffix}`),
      { fallbackName: `batch-empty-${suffix}`, skillMd: '   ' },
      { skillMd: '# nameless' },
    ]);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      results: Array<Record<string, unknown>>;
    };
    const results = payload.results;
    expect(results).toHaveLength(4);

    expect(results[0]).toMatchObject({
      name: `batch-good-${suffix}`,
      status: 'imported',
      id: `batch-good-${suffix}`,
    });
    expect(existsSync(
      path.join(process.env.OD_DATA_DIR!, 'skills', `batch-good-${suffix}`, 'SKILL.md'),
    )).toBe(true);

    expect(results[1]).toMatchObject({
      name: `batch-seeded-${suffix}`,
      status: 'skipped',
    });
    expect(String(results[1]!.code)).toBeTruthy();

    expect(results[2]).toMatchObject({
      name: `batch-empty-${suffix}`,
      status: 'failed',
      code: 'BAD_REQUEST',
    });

    expect(results[3]).toMatchObject({ name: '', status: 'failed', code: 'BAD_REQUEST' });
  });

  it('materializes the original SKILL.md and companion files verbatim', async () => {
    const suffix = Date.now();
    const name = `batch-folder-${suffix}`;
    // Block-scalar description + triggers + companion files: every part the
    // old rebuild-from-parse path dropped (mrcfps PR #8754 review).
    const skillMd = [
      '---',
      `name: ${name}`,
      'description: |',
      '  Line one of a block scalar.',
      '  Line two survives only when the file is not rebuilt.',
      'triggers:',
      '  - "deploy"',
      '---',
      '',
      `# ${name}`,
      '',
      'Uses references/api.md and scripts/run.sh.',
      '',
    ].join('\n');
    const response = await batchBody([
      {
        fallbackName: name,
        skillMd,
        files: [
          {
            path: 'references/api.md',
            contentBase64: Buffer.from('# API reference\n\nEndpoints live here.\n').toString('base64'),
          },
          {
            path: 'scripts/run.sh',
            contentBase64: Buffer.from('#!/bin/sh\necho ok\n').toString('base64'),
          },
        ],
      },
    ]);
    expect(response.status).toBe(200);
    const { results } = (await response.json()) as {
      results: Array<Record<string, unknown>>;
    };
    expect(results[0]).toMatchObject({ name, status: 'imported', id: name });

    const dir = path.join(process.env.OD_DATA_DIR!, 'skills', name);
    expect(readFileSync(path.join(dir, 'SKILL.md'), 'utf8')).toBe(skillMd);
    expect(
      readFileSync(path.join(dir, 'references', 'api.md'), 'utf8'),
    ).toBe('# API reference\n\nEndpoints live here.\n');
    expect(readFileSync(path.join(dir, 'scripts', 'run.sh'), 'utf8')).toBe('#!/bin/sh\necho ok\n');
  });

  it('binds the slug id a nameless-frontmatter import will report', async () => {
    const suffix = Date.now();
    const fallbackName = `Beta Skill ${suffix}`;
    const slug = `beta-skill-${suffix}`;
    const response = await batchBody([
      {
        fallbackName,
        // Nameless frontmatter: the id must be the slug the folder and
        // listSkills() report, not the raw folder name (mrcfps PR #8754
        // review).
        skillMd: `# ${fallbackName}\n\nNo frontmatter name here.\n`,
      },
      {
        // Slugifies to an empty string: the item must fail, not import.
        fallbackName: '!!!',
        skillMd: `# no slug\n\nAlso nameless.\n`,
      },
    ]);
    expect(response.status).toBe(200);
    const { results } = (await response.json()) as {
      results: Array<Record<string, unknown>>;
    };
    expect(results[0]).toMatchObject({ name: slug, status: 'imported', id: slug });
    expect(existsSync(path.join(process.env.OD_DATA_DIR!, 'skills', slug, 'SKILL.md'))).toBe(true);
    expect(results[1]).toMatchObject({ name: '!!!', status: 'failed', code: 'BAD_REQUEST' });
  });

  it('fails items whose side files escape the folder or carry dotfiles, leaving nothing behind', async () => {
    const suffix = Date.now();
    const first = `batch-escape-${suffix}`;
    const second = `batch-dot-${suffix}`;
    const response = await batchBody([
      {
        fallbackName: first,
        skillMd: skillMdFor(first),
        files: [{ path: '../evil.txt', contentBase64: Buffer.from('hi').toString('base64') }],
      },
      {
        fallbackName: second,
        skillMd: skillMdFor(second),
        files: [{ path: '.git/config', contentBase64: Buffer.from('hi').toString('base64') }],
      },
    ]);
    expect(response.status).toBe(200);
    const { results } = (await response.json()) as {
      results: Array<Record<string, unknown>>;
    };
    expect(results[0]).toMatchObject({ name: first, status: 'failed', code: 'BAD_REQUEST' });
    expect(results[1]).toMatchObject({ name: second, status: 'failed', code: 'BAD_REQUEST' });
    expect(existsSync(path.join(process.env.OD_DATA_DIR!, 'evil.txt'))).toBe(false);
    expect(existsSync(path.join(process.env.OD_DATA_DIR!, 'skills', first))).toBe(false);
    expect(existsSync(path.join(process.env.OD_DATA_DIR!, 'skills', second))).toBe(false);
  });

  it('reports a within-batch duplicate as skipped without blocking the first import', async () => {
    const name = `batch-twice-${Date.now()}`;
    const response = await batchBody([skillItem(name), skillItem(name)]);
    expect(response.status).toBe(200);
    const { results } = (await response.json()) as {
      results: Array<Record<string, unknown>>;
    };
    expect(results[0]).toMatchObject({ name, status: 'imported' });
    expect(results[1]).toMatchObject({ name, status: 'skipped', code: 'CONFLICT' });
  });

  it('rejects a malformed batch body before touching the filesystem', async () => {
    for (const body of [{}, { skills: [] }, { skills: 'nope' }]) {
      const response = await fetch(`${baseUrl}/api/skills/import-batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
      await response.text();
    }
  });

  it('binds imported items to the acting workspace and skips ids owned by another member', async () => {
    const name = `batch-ws-${Date.now()}`;
    const first = await batchBody(
      [skillItem(name)],
      { 'x-od-workspace-id': 'ws-batch-a', 'x-od-workspace-member-id': 'member-batch-a' },
    );
    expect(first.status).toBe(200);
    const { results } = (await first.json()) as {
      results: Array<Record<string, unknown>>;
    };
    const db = openDatabase(process.cwd(), { dataDir: process.env.OD_DATA_DIR! });
    expect(results[0]).toMatchObject({ name, status: 'imported' });
    const binding = getWorkspaceResourceByResourceId(db, 'skill', name);
    expect(binding?.workspaceId).toBe('ws-batch-a');
    expect(binding?.visibility).toBe('personal');

    const second = await batchBody(
      [skillItem(name)],
      { 'x-od-workspace-id': 'ws-batch-b', 'x-od-workspace-member-id': 'member-batch-b' },
    );
    expect(second.status).toBe(200);
    const secondPayload = (await second.json()) as {
      results: Array<Record<string, unknown>>;
    };
    expect(secondPayload.results[0]).toMatchObject({
      name,
      status: 'skipped',
      code: 'WORKSPACE_RESOURCE_ID_CONFLICT',
    });
  });
});
