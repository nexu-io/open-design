import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { runLiveArtifactsToolCli } from '../src/tools-live-artifacts-cli.js';

const ORIGINAL_ENV = { ...process.env };

describe('live artifact tool CLI environment', () => {
  let stdoutWrite: { mockRestore: () => void };
  let stderrWrite: { mockRestore: () => void };
  let stdoutOutput: string[];
  let stderrOutput: string[];
  let fetchMock: ReturnType<typeof vi.fn>;
  const tempRoots: string[] = [];

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    stdoutOutput = [];
    stderrOutput = [];
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutOutput.push(String(chunk));
      return true;
    });
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrOutput.push(String(chunk));
      return true;
    });
    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ artifacts: [] }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
    process.env = ORIGINAL_ENV;
    return Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))).then(() => undefined);
  });

  async function makeArtifactInputFiles() {
    const root = await mkdtemp(path.join(tmpdir(), 'od-live-artifact-cli-'));
    tempRoots.push(root);
    const artifactPath = path.join(root, 'artifact.json');
    await writeFile(artifactPath, JSON.stringify({
      title: 'Data backed artifact',
      preview: { type: 'html', entry: 'index.html' },
      document: {
        format: 'html_template_v1',
        templatePath: 'template.html',
        generatedPreviewPath: 'index.html',
        dataPath: 'data.json',
        dataJson: {},
      },
    }));
    await writeFile(path.join(root, 'data.json'), JSON.stringify({ title: 'Injected title', metrics: { count: 3 } }));
    await writeFile(path.join(root, 'template.html'), '<h1>{{data.title}}</h1>');
    await writeFile(path.join(root, 'provenance.json'), JSON.stringify({ generatedAt: '2026-05-05T00:00:00.000Z', generatedBy: 'agent', sources: [] }));
    return artifactPath;
  }

  it('reads OD_DAEMON_URL and OD_TOOL_TOKEN from the injected environment', async () => {
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456/base/';
    process.env.OD_TOOL_TOKEN = 'agent-run-token';

    const result = await runLiveArtifactsToolCli(['list']);

    expect(result.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/base/api/tools/live-artifacts/list',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer agent-run-token',
          Accept: 'application/json',
        }),
      }),
    );
    expect(JSON.parse(stdoutOutput.join(''))).toEqual({ ok: true, artifacts: [] });
  });

  it('prints compact success JSON for list results', async () => {
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456';
    process.env.OD_TOOL_TOKEN = 'agent-run-token';
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          artifacts: [
            {
              id: 'live_1',
              title: 'Launch Metrics',
              status: 'active',
              refreshStatus: 'idle',
              preview: { type: 'html', entry: 'index.html' },
              updatedAt: '2026-04-30T12:00:00.000Z',
              dataJson: { large: 'omitted from compact output' },
            },
          ],
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    );

    const result = await runLiveArtifactsToolCli(['list']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join(''))).toEqual({
      ok: true,
      artifacts: [
        {
          id: 'live_1',
          title: 'Launch Metrics',
          status: 'active',
          refreshStatus: 'idle',
          preview: { type: 'html', entry: 'index.html' },
          updatedAt: '2026-04-30T12:00:00.000Z',
        },
      ],
    });
    expect(stderrOutput.join('')).toBe('');
  });

  it('injects sibling data.json into document dataJson when creating artifacts', async () => {
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456/base/';
    process.env.OD_TOOL_TOKEN = 'agent-run-token';
    const artifactPath = await makeArtifactInputFiles();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          artifact: {
            id: 'live_1',
            title: 'Data backed artifact',
            status: 'active',
            refreshStatus: 'idle',
            preview: { type: 'html', entry: 'index.html' },
            updatedAt: '2026-05-05T00:00:00.000Z',
          },
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    );

    const result = await runLiveArtifactsToolCli(['create', '--input', artifactPath]);

    expect(result.exitCode).toBe(0);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.input.document.dataJson).toEqual({ title: 'Injected title', metrics: { count: 3 } });
    expect(requestBody.templateHtml).toBe('<h1>{{data.title}}</h1>');
    expect(requestBody.provenanceJson).toMatchObject({ generatedBy: 'agent' });
  });

  it('calls the refresh tool endpoint with the artifact id', async () => {
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456/base/';
    process.env.OD_TOOL_TOKEN = 'agent-run-token';
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          artifact: {
            id: 'live_1',
            title: 'Launch Metrics',
            status: 'active',
            refreshStatus: 'succeeded',
            preview: { type: 'html', entry: 'index.html' },
            updatedAt: '2026-04-30T12:00:00.000Z',
          },
          refresh: { id: 'refresh-000001', status: 'succeeded', refreshedSourceCount: 1 },
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    );

    const result = await runLiveArtifactsToolCli(['refresh', '--artifact-id', 'live_1']);

    expect(result.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/base/api/tools/live-artifacts/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ artifactId: 'live_1' }),
        headers: expect.objectContaining({ Authorization: 'Bearer agent-run-token' }),
      }),
    );
    expect(JSON.parse(stdoutOutput.join(''))).toEqual({
      ok: true,
      artifact: {
        id: 'live_1',
        title: 'Launch Metrics',
        status: 'active',
        refreshStatus: 'succeeded',
        preview: { type: 'html', entry: 'index.html' },
        updatedAt: '2026-04-30T12:00:00.000Z',
      },
      refresh: { id: 'refresh-000001', status: 'succeeded', refreshedSourceCount: 1 },
    });
  });

  it('prints compact validation errors and exits non-zero on API failure', async () => {
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456';
    process.env.OD_TOOL_TOKEN = 'agent-run-token';
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'LIVE_ARTIFACT_INVALID',
            message: 'Live artifact validation failed',
            details: {
              kind: 'validation',
              issues: [
                {
                  path: 'sourceJson.token',
                  message: 'credential-like fields are not allowed',
                  code: 'FORBIDDEN_KEY',
                  received: 'secret value that must not be echoed',
                },
              ],
            },
            retryable: false,
          },
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 },
      ),
    );

    const result = await runLiveArtifactsToolCli(['list']);

    expect(result.exitCode).toBe(1);
    expect(stdoutOutput.join('')).toBe('');
    expect(JSON.parse(stderrOutput.join(''))).toEqual({
      ok: false,
      status: 400,
      error: {
        code: 'LIVE_ARTIFACT_INVALID',
        message: 'Live artifact validation failed',
        details: {
          kind: 'validation',
          issues: [
            {
              path: 'sourceJson.token',
              message: 'credential-like fields are not allowed',
              code: 'FORBIDDEN_KEY',
            },
          ],
        },
        retryable: false,
      },
    });
  });

  it('fails before making a request when the injected environment is missing', async () => {
    delete process.env.OD_DAEMON_URL;
    delete process.env.OD_TOOL_TOKEN;

    const result = await runLiveArtifactsToolCli(['list']);

    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderrOutput.join('')).toContain('OD_DAEMON_URL is required');
  });

  it('requires OD_TOOL_TOKEN from the injected environment', async () => {
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456';
    delete process.env.OD_TOOL_TOKEN;

    const result = await runLiveArtifactsToolCli(['list']);

    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderrOutput.join('')).toContain('OD_TOOL_TOKEN is required');
  });
});
