import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))));

const execFileAsync = promisify(execFile);

async function runPython(script: string, ...args: string[]) {
  try {
    const result = await execFileAsync('python3', [script, ...args], { cwd: resolve('..'), encoding: 'utf8' });
    return { status: 0, ...result };
  } catch (error) {
    const failure = error as Error & { code?: number; stdout?: string; stderr?: string };
    return { status: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

describe('exact release scripts', () => {
  it('derives publication time from the immutable source commit', async () => {
    const workflow = await readFile(resolve('../.github/workflows/release-exact.yml'), 'utf8');
    expect(workflow).toContain("subprocess.check_output(['git', 'show', '--no-patch', '--format=%cI', os.environ['SOURCE_SHA']]");
    expect(workflow).not.toContain('datetime.now');
  });

  it('rejects a reused Terminal scene for a different standalone version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'exact-pack-version-'));
    roots.push(root);
    const scene = join(root, 'scene');
    await mkdir(scene);
    await writeFile(join(scene, 'scene.json'), JSON.stringify({ standaloneVersion: '0.1.0' }));
    const request = join(root, 'request.json');
    await writeFile(request, JSON.stringify({
      schemaVersion: 1,
      operation: 'exact.pack',
      channel: 'betahyx',
      releaseVersion: '0.1.0-betahyx.1',
      standaloneVersion: '0.2.0',
      sourceCommit: 'a'.repeat(40),
      outputDirectory: join(root, 'output'),
      sceneDirectory: scene,
      targets: [{ target: 'darwin-arm64' }, { target: 'win32-x64' }],
    }));
    const result = await runPython('.github/scripts/pack.py', '--request', request, '--receipt', join(root, 'receipt.json'));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('requested standaloneVersion differs from Terminal scene');
  });

  it('replays identical immutable documents on a repeated publish', async () => {
    const root = await mkdtemp(join(tmpdir(), 'exact-release-replay-'));
    roots.push(root);
    const objects = new Map<string, Buffer>();
    const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
      const path = request.url ?? '/';
      if (request.method === 'GET') {
        const body = objects.get(path);
        response.statusCode = body == null ? 404 : 200;
        if (body != null) response.setHeader('ETag', `"${body.length}"`);
        response.end(body);
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      if (request.headers['if-none-match'] === '*' && objects.has(path)) response.statusCode = 412;
      else { objects.set(path, body); response.statusCode = 200; response.setHeader('ETag', `"${body.length}"`); }
      response.end();
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    try {
      const address = server.address();
      if (address == null || typeof address === 'string') throw new Error('missing fixture address');
      const output = join(root, 'output');
      await mkdir(output);
      const artifact = join(output, 'artifact.bin');
      const document = join(output, 'closure-metadata.json');
      const head = join(output, 'channel-head.json');
      await writeFile(artifact, 'artifact');
      await writeFile(document, '{"document":true}\n');
      await writeFile(head, '{"head":{"lanes":{"closure":{"releaseVersion":"0.1.0-betahyx.1"},"terminal":{"releaseVersion":"0.1.0-betahyx.1"}}}}\n');
      const digest = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex');
      const described = async (file: string) => ({ file, sha256: await digest(file), size: (await readFile(file)).length });
      const pack = join(root, 'pack.json');
      await writeFile(pack, JSON.stringify({
        channel: 'betahyx', releaseVersion: '0.1.0-betahyx.1',
        artifacts: [await described(artifact)], documents: [await described(document)], channelHeadFile: head,
      }));
      const request = join(root, 'release.json');
      await writeFile(request, JSON.stringify({ schemaVersion: 1, operation: 'exact.release', packReceipt: pack, endpointUrl: `http://127.0.0.1:${address.port}`, bucket: 'fixture' }));
      const first = await runPython('.github/scripts/release.py', '--request', request, '--receipt', join(root, 'first.json'));
      const second = await runPython('.github/scripts/release.py', '--request', request, '--receipt', join(root, 'second.json'));
      expect(first.stderr).toBe('');
      expect(first.status).toBe(0);
      expect(second.stderr).toBe('');
      expect(second.status).toBe(0);
      expect(JSON.parse(await readFile(join(root, 'second.json'), 'utf8')).replayed).toBe(true);
    } finally {
      await new Promise<void>((done, reject) => server.close((error) => error == null ? done() : reject(error)));
    }
  });
});
