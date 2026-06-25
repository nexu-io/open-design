// Daemon-side core of the clipper "capture → editable OD page" exit: turning a
// captured `html` library asset into a brand-new project whose `index.html` is
// the captured page, with a seeded conversation. Driven over the loopback
// daemon HTTP boundary (the cheapest layer that sees the whole flow).

import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('library edit-as-page route', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectsToClean: string[] = [];
  const assetsToClean: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    for (const id of projectsToClean.splice(0)) {
      await fetch(`${baseUrl}/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(
        () => {},
      );
    }
    for (const id of assetsToClean.splice(0)) {
      await fetch(`${baseUrl}/api/library/assets/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function ingest(body: Record<string, unknown>): Promise<{ id: string; kind: string }> {
    const resp = await fetch(`${baseUrl}/api/library/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(resp.ok).toBe(true);
    const json = (await resp.json()) as { asset: { id: string; kind: string } };
    assetsToClean.push(json.asset.id);
    return json.asset;
  }

  it('turns a captured html asset into a new editable project seeded with index.html', async () => {
    const html = '<!doctype html><html><body><h1>Captured page</h1></body></html>';
    const asset = await ingest({ text: html, kind: 'html', sourceTitle: 'Captured Test Page' });
    expect(asset.kind).toBe('html');

    const resp = await fetch(
      `${baseUrl}/api/library/assets/${encodeURIComponent(asset.id)}/edit-as-page`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      projectId: string;
      conversationId: string;
      relPath: string;
    };
    expect(body.projectId).toBeTruthy();
    expect(body.conversationId).toBeTruthy();
    expect(body.relPath).toBe('index.html');
    projectsToClean.push(body.projectId);

    // The project exists and the capture landed as its editable entry file.
    const projResp = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(body.projectId)}`);
    expect(projResp.status).toBe(200);

    const filesResp = await fetch(
      `${baseUrl}/api/projects/${encodeURIComponent(body.projectId)}/files`,
    );
    expect(filesResp.status).toBe(200);
    const filesBody = (await filesResp.json()) as { files: Array<{ name?: string; path?: string }> };
    expect(
      filesBody.files.some((f) => f.name === 'index.html' || f.path === 'index.html'),
    ).toBe(true);

    // The asset gained a project back-link so its "Open project" affordance resolves.
    const detailResp = await fetch(
      `${baseUrl}/api/library/assets/${encodeURIComponent(asset.id)}`,
    );
    const detail = (await detailResp.json()) as {
      asset: { sources: Array<{ projectId?: string }> };
    };
    expect(detail.asset.sources.some((s) => s.projectId === body.projectId)).toBe(true);
  });

  it('rejects edit-as-page for a non-html asset', async () => {
    const asset = await ingest({ text: 'just some notes', kind: 'text' });
    const resp = await fetch(
      `${baseUrl}/api/library/assets/${encodeURIComponent(asset.id)}/edit-as-page`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    );
    expect(resp.status).toBe(400);
  });
});
