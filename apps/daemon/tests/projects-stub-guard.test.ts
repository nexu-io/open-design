import type http from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';

interface FilePostBody {
  name: string;
  content: string;
  encoding?: 'utf8' | 'base64';
  artifactManifest?: unknown;
}

function htmlBody(byteLength: number): string {
  const filler = 'x'.repeat(Math.max(0, byteLength - 96));
  return `<!doctype html><html><head><title>Doc</title></head><body><main>${filler}</main></body></html>`;
}

function manifestFor(identifier: string, kind: 'html' | 'deck' = 'html') {
  return {
    kind,
    renderer: kind === 'deck' ? 'deck-html' : 'html',
    title: identifier,
    exports: kind === 'deck' ? ['html', 'pdf'] : ['html'],
    metadata: { identifier },
  };
}

describe('artifact stub guard via /api/projects/:id/files', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    vi.stubEnv('OD_ARTIFACT_STUB_GUARD', 'reject');
    vi.stubEnv('OD_ARTIFACT_STUB_GUARD_MIN_PRIOR_BYTES', '1024');
    vi.stubEnv('OD_ARTIFACT_STUB_GUARD_MIN_RATIO', '0.2');
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(() => {
    // Each test resets the mode it changed; default back to reject.
    vi.stubEnv('OD_ARTIFACT_STUB_GUARD', 'reject');
  });

  async function createProject(prefix: string) {
    const id = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: id }),
    });
    expect(resp.status).toBe(200);
    return id;
  }

  async function postFile(projectId: string, body: FilePostBody) {
    return fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('rejects a stub-sized rewrite with ARTIFACT_REGRESSION', async () => {
    const projectId = await createProject('reject');

    const firstResp = await postFile(projectId, {
      name: 'dashboard.html',
      content: htmlBody(20_000),
      artifactManifest: manifestFor('dashboard'),
    });
    expect(firstResp.status).toBe(200);

    const stubResp = await postFile(projectId, {
      name: 'dashboard-2.html',
      content: 'See dashboard.html in this project — full standalone file written to disk.',
      artifactManifest: manifestFor('dashboard'),
    });

    expect(stubResp.status).toBe(422);
    const stubBody = (await stubResp.json()) as {
      error: { code: string; message: string; details?: { identifier?: string; priorName?: string } };
    };
    expect(stubBody.error.code).toBe('ARTIFACT_REGRESSION');
    expect(stubBody.error.details?.identifier).toBe('dashboard');
    expect(stubBody.error.details?.priorName).toBe('dashboard.html');
  });

  it('does not write the new file or its manifest when rejected', async () => {
    const projectId = await createProject('not-written');

    const firstResp = await postFile(projectId, {
      name: 'report.html',
      content: htmlBody(20_000),
      artifactManifest: manifestFor('report'),
    });
    expect(firstResp.status).toBe(200);

    const stubResp = await postFile(projectId, {
      name: 'report-2.html',
      content: '<html><body>see report.html</body></html>',
      artifactManifest: manifestFor('report'),
    });
    expect(stubResp.status).toBe(422);

    const listResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`);
    expect(listResp.status).toBe(200);
    const listBody = (await listResp.json()) as { files: Array<{ name: string }> };
    const names = listBody.files.map((f) => f.name).sort();
    expect(names).not.toContain('report-2.html');
    expect(names).not.toContain('report-2.html.artifact.json');
    expect(names).toContain('report.html');
  });

  it('allows a same-size revision through', async () => {
    const projectId = await createProject('allow');

    const firstResp = await postFile(projectId, {
      name: 'landing-page.html',
      content: htmlBody(20_000),
      artifactManifest: manifestFor('landing-page'),
    });
    expect(firstResp.status).toBe(200);

    const secondResp = await postFile(projectId, {
      name: 'landing-page-2.html',
      content: htmlBody(20_500),
      artifactManifest: manifestFor('landing-page'),
    });
    expect(secondResp.status).toBe(200);
  });

  it('warns instead of rejecting when guard mode is warn', async () => {
    vi.stubEnv('OD_ARTIFACT_STUB_GUARD', 'warn');
    const projectId = await createProject('warn');

    const firstResp = await postFile(projectId, {
      name: 'overview.html',
      content: htmlBody(20_000),
      artifactManifest: manifestFor('overview'),
    });
    expect(firstResp.status).toBe(200);

    const stubResp = await postFile(projectId, {
      name: 'overview-2.html',
      content: '<html><body>placeholder</body></html>',
      artifactManifest: manifestFor('overview'),
    });
    expect(stubResp.status).toBe(200);

    const writeBody = (await stubResp.json()) as {
      file: { name: string; stubGuardWarning?: { code: string; identifier: string } };
    };
    expect(writeBody.file.name).toBe('overview-2.html');
    expect(writeBody.file.stubGuardWarning?.code).toBe('ARTIFACT_REGRESSION');
    expect(writeBody.file.stubGuardWarning?.identifier).toBe('overview');
  });

  it('skips the guard entirely when mode is off', async () => {
    vi.stubEnv('OD_ARTIFACT_STUB_GUARD', 'off');
    const projectId = await createProject('off');

    const firstResp = await postFile(projectId, {
      name: 'briefing.html',
      content: htmlBody(20_000),
      artifactManifest: manifestFor('briefing'),
    });
    expect(firstResp.status).toBe(200);

    const stubResp = await postFile(projectId, {
      name: 'briefing-2.html',
      content: '<html><body>see briefing.html</body></html>',
      artifactManifest: manifestFor('briefing'),
    });
    expect(stubResp.status).toBe(200);

    const writeBody = (await stubResp.json()) as { file: { stubGuardWarning?: unknown } };
    expect(writeBody.file.stubGuardWarning).toBeUndefined();
  });

  it('accepts a stub-sized first emission of a new identifier', async () => {
    const projectId = await createProject('first');

    const resp = await postFile(projectId, {
      name: 'changelog.html',
      content: '<html><body>tiny</body></html>',
      artifactManifest: manifestFor('changelog'),
    });
    expect(resp.status).toBe(200);
  });

  it('rejects a stub rewrite of a deck artifact (kind: deck)', async () => {
    const projectId = await createProject('deck');

    const firstResp = await postFile(projectId, {
      name: 'kickoff-deck.html',
      content: htmlBody(40_000),
      artifactManifest: manifestFor('kickoff-deck', 'deck'),
    });
    expect(firstResp.status).toBe(200);

    const stubResp = await postFile(projectId, {
      name: 'kickoff-deck-2.html',
      content: '<html><body>see kickoff-deck.html</body></html>',
      artifactManifest: manifestFor('kickoff-deck', 'deck'),
    });
    expect(stubResp.status).toBe(422);
    const body = (await stubResp.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ARTIFACT_REGRESSION');
  });

  it('detects prior siblings written with .htm extension', async () => {
    const projectId = await createProject('htm');

    const firstResp = await postFile(projectId, {
      name: 'overview-doc.htm',
      content: htmlBody(20_000),
      artifactManifest: manifestFor('overview-doc'),
    });
    expect(firstResp.status).toBe(200);

    const stubResp = await postFile(projectId, {
      name: 'overview-doc-2.html',
      content: '<html><body>see overview-doc.htm</body></html>',
      artifactManifest: manifestFor('overview-doc'),
    });
    expect(stubResp.status).toBe(422);
    const body = (await stubResp.json()) as {
      error: { code: string; details?: { priorName?: string } };
    };
    expect(body.error.code).toBe('ARTIFACT_REGRESSION');
    expect(body.error.details?.priorName).toBe('overview-doc.htm');
  });

  it('rejects a same-name overwrite that shrinks the existing file (lefarcen P1)', async () => {
    const projectId = await createProject('overwrite');

    const firstResp = await postFile(projectId, {
      name: 'dashboard.html',
      content: htmlBody(20_000),
      artifactManifest: manifestFor('dashboard'),
    });
    expect(firstResp.status).toBe(200);

    // Same name, same identifier, stub body: existing file is the prior.
    const stubResp = await postFile(projectId, {
      name: 'dashboard.html',
      content: '<html><body>see dashboard.html</body></html>',
      artifactManifest: manifestFor('dashboard'),
    });
    expect(stubResp.status).toBe(422);
    const body = (await stubResp.json()) as {
      error: { code: string; details?: { priorName?: string } };
    };
    expect(body.error.code).toBe('ARTIFACT_REGRESSION');
    expect(body.error.details?.priorName).toBe('dashboard.html');

    // Confirm the original 20 KB file is intact (not overwritten).
    const filesResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`);
    const files = (await filesResp.json()) as { files: Array<{ name: string; size: number }> };
    const dashboard = files.files.find((f) => f.name === 'dashboard.html');
    expect(dashboard?.size).toBeGreaterThan(15_000);
  });

  it('rejects stub regressions in subdirectories (Codex/mrcfps P2)', async () => {
    const projectId = await createProject('nested');

    const firstResp = await postFile(projectId, {
      name: 'reports/overview.html',
      content: htmlBody(20_000),
      artifactManifest: manifestFor('overview'),
    });
    expect(firstResp.status).toBe(200);

    const stubResp = await postFile(projectId, {
      name: 'reports/overview-2.html',
      content: '<html><body>see reports/overview.html</body></html>',
      artifactManifest: manifestFor('overview'),
    });
    expect(stubResp.status).toBe(422);
    const body = (await stubResp.json()) as {
      error: { code: string; details?: { priorName?: string } };
    };
    expect(body.error.code).toBe('ARTIFACT_REGRESSION');
    expect(body.error.details?.priorName).toBe('overview.html');
  });

  it('finds slug-form sibling when manifest carries non-slug identifier (Codex/lefarcen/mrcfps P2)', async () => {
    const projectId = await createProject('slug');

    // Frontend wrote the previous artifact under a slugified name but the
    // manifest carried the raw identifier "Landing Page".
    const firstResp = await postFile(projectId, {
      name: 'landing-page.html',
      content: htmlBody(20_000),
      artifactManifest: { ...manifestFor('landing-page'), metadata: { identifier: 'Landing Page' } },
    });
    expect(firstResp.status).toBe(200);

    const stubResp = await postFile(projectId, {
      name: 'landing-page-2.html',
      content: '<html><body>see landing-page.html</body></html>',
      artifactManifest: { ...manifestFor('landing-page'), metadata: { identifier: 'Landing Page' } },
    });
    expect(stubResp.status).toBe(422);
    const body = (await stubResp.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ARTIFACT_REGRESSION');
  });

  it('finds artifact.html siblings when identifier slugifies to empty (lefarcen P2)', async () => {
    const projectId = await createProject('empty-slug');

    // Frontend persistArtifact slugifies "测试" -> "" -> falls back to
    // "artifact", so the file lands as artifact.html. A subsequent stub
    // emission with the same non-ASCII identifier must still find the
    // prior via the empty-slug fallback.
    const firstResp = await postFile(projectId, {
      name: 'artifact.html',
      content: htmlBody(20_000),
      artifactManifest: { ...manifestFor('artifact'), metadata: { identifier: '测试' } },
    });
    expect(firstResp.status).toBe(200);

    const stubResp = await postFile(projectId, {
      name: 'artifact-2.html',
      content: '<html><body>see artifact.html</body></html>',
      artifactManifest: { ...manifestFor('artifact'), metadata: { identifier: '测试' } },
    });
    expect(stubResp.status).toBe(422);
    const body = (await stubResp.json()) as {
      error: { code: string; details?: { priorName?: string } };
    };
    expect(body.error.code).toBe('ARTIFACT_REGRESSION');
    expect(body.error.details?.priorName).toBe('artifact.html');
  });
});
