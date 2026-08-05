import { describe, expect, it } from 'vitest';
import { runExport, type ExportCliDeps } from '../src/export/cli.js';

function makeDeps(overrides: Partial<ExportCliDeps> = {}): ExportCliDeps {
  return {
    resolveDaemonBaseUrl: async () => 'http://127.0.0.1:7456',
    fetch: async () => new Response('pdf-bytes', {
      status: 200,
      headers: { 'content-disposition': 'attachment; filename="rendered.pdf"' },
    }),
    structuredHttpFailure: async () => { throw new Error('unexpected HTTP failure'); },
    writeFile: async () => undefined,
    writeStdout: () => undefined,
    writeStderr: () => undefined,
    log: () => undefined,
    printHelp: () => undefined,
    exit: (code) => { throw new Error(`exit ${code}`); },
    ...overrides,
  };
}

describe('export CLI', () => {
  it('posts the export request and uses the response filename', async () => {
    let requestUrl = '';
    let requestBody: Record<string, unknown> | undefined;
    let writtenPath = '';
    let writtenBytes = 0;
    await runExport(['index.html', '--project', 'project/one', '--format', 'pdf', '--deck', '--json'], makeDeps({
      fetch: async (input, init) => {
        requestUrl = String(input);
        requestBody = JSON.parse(String(init?.body));
        return new Response('pdf-bytes', {
          status: 200,
          headers: { 'content-disposition': "attachment; filename*=UTF-8''deck%20one.pdf" },
        });
      },
      writeFile: async (path, data) => { writtenPath = path; writtenBytes = data.length; },
    }));

    expect(requestUrl).toBe('http://127.0.0.1:7456/api/projects/project%2Fone/export');
    expect(requestBody).toEqual({ fileName: 'index.html', format: 'pdf', deck: true });
    expect(writtenPath).toBe('deck one.pdf');
    expect(writtenBytes).toBe(9);
  });

  it('uses explicit output and emits the JSON result envelope', async () => {
    const output: string[] = [];
    let writtenPath = '';
    await runExport(['slide.html', '--project', 'p1', '--format', 'image', '--image-format', 'jpeg', '--out', 'slide.jpg', '--json'], makeDeps({
      writeFile: async (path) => { writtenPath = path; },
      writeStdout: (text) => output.push(text),
    }));

    expect(writtenPath).toBe('slide.jpg');
    expect(JSON.parse(output[0] ?? '')).toMatchObject({ ok: true, out: 'slide.jpg', bytes: 9, format: 'image' });
  });

  it('rejects invalid formats before contacting the daemon', async () => {
    let fetchCalls = 0;
    const errors: string[] = [];
    await expect(runExport(['index.html', '--project', 'p1', '--format', 'svg'], makeDeps({
      fetch: async () => { fetchCalls++; return new Response(); },
      writeStderr: (text) => errors.push(text),
    }))).rejects.toThrow('exit 2');

    expect(fetchCalls).toBe(0);
    expect(errors[0]).toContain('invalid --format: svg');
  });
});
