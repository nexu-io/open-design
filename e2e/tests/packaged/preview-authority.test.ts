import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';
import { electronDisplayCommand } from '@/vitest/electron-display';
import { createSmokeSuite, e2eWorkspaceRoot } from '@/vitest/suite';

const execute = promisify(execFile);
const root = e2eWorkspaceRoot();
const packagedRequire = createRequire(join(root, 'apps/packaged/package.json'));

test('real Electron protocol preserves opaque preview asset authority through the daemon', async () => {
  const suite = await createSmokeSuite('preview-authority');
  await suite.with.toolsDev(async ({ runtime, webUrl }) => {
    const daemon = `http://127.0.0.1:${runtime.daemonPort}`;
    const plugin = join(suite.scratchDir, 'private-plugin');
    await mkdir(plugin, { recursive: true });
    await writeFile(join(plugin, 'open-design.json'), JSON.stringify({
      $schema: 'https://open-design.ai/schemas/plugin.v1.json',
      name: 'preview-authority-private', title: 'Preview authority fixture', version: '1.0.0',
      description: 'Isolated security regression', license: 'MIT',
      od: { kind: 'skill', capabilities: ['prompt:inject', 'genui:custom-component'], context: { assets: ['./private.txt', './private.webp', './private.ttf'] } },
    }));
    await writeFile(join(plugin, 'SKILL.md'), '# Preview authority fixture');
    await writeFile(join(plugin, 'private.txt'), 'PRIVATE_PREVIEW_AUTHORITY_SENTINEL');
    for (const [name, asset] of [['private.webp', 'sticker_img/s_01.webp'], ['private.ttf', 'fonts/TikTokSans.ttf']]) {
      const response = await fetch(`${daemon}/api/plugins/example-open-design-homepage/asset/assets/${asset}`);
      expect(response.status).toBe(200);
      await writeFile(join(plugin, name!), Buffer.from(await response.arrayBuffer()));
    }
    const install = await fetch(`${daemon}/api/plugins/install`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ source: plugin }),
    });
    expect(install.ok).toBe(true);
    await suite.report.save('install.txt', await install.text());
    const privateUrl = `${daemon}/api/plugins/preview-authority-private/asset/private.txt`;
    expect(await (await fetch(privateUrl)).text()).toBe('PRIVATE_PREVIEW_AUTHORITY_SENTINEL');
    const output = join(suite.scratchDir, 'electron.cjs');
    const resultPath = join(suite.scratchDir, 'result.json');
    await packagedRequire('esbuild').build({
      entryPoints: [fileURLToPath(new URL('../../resources/packaged-preview-authority.ts', import.meta.url))],
      outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['electron'],
    });
    const redirects = createServer((request, response) => {
      response.writeHead(302, { location: request.url === '/http' ? privateUrl : privateUrl.replace(daemon, 'od://app'), 'access-control-allow-origin': '*' });
      response.end();
    });
    await new Promise<void>(resolve => redirects.listen(0, '127.0.0.1', resolve));
    const address = redirects.address();
    if (address == null || typeof address === 'string') throw new Error('redirect fixture port unavailable');
    const redirectUrl = `http://127.0.0.1:${address.port}`;
    let execution;
    try {
      const invocation = electronDisplayCommand(packagedRequire('electron'), [output, webUrl, join(suite.scratchDir, 'electron-data'), resultPath, `${redirectUrl}/od`, `${redirectUrl}/http`]);
      execution = await execute(invocation.command, invocation.args, { timeout: 120000, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    } finally { await new Promise<void>(resolve => redirects.close(() => resolve())); }
    await suite.report.json('electron-process.json', execution);
    const result = JSON.parse(await readFile(resultPath, 'utf8'));
    await suite.report.save('authority.json', JSON.stringify(result, (key, value) => key === 'body' && typeof value === 'string' && value.length > 1024 ? {sha256: createHash('sha256').update(value).digest('hex'), length: value.length} : value, 2));
    expect(result.electron).toBe(packagedRequire('electron/package.json').version);
    for (const run of [result, result.second, result.reregistered]) {
      expect(run.trusted.private).toEqual({ status: 200, body: 'PRIVATE_PREVIEW_AUTHORITY_SENTINEL' });
      expect(run.trusted.privateImage.loaded).toBe(true);
      expect(run.trusted.privateFont.loaded).toBe(true);
      expect(run.opaque.results.privateImage.loaded).toBe(false);
      expect(run.opaque.results.privateFont.loaded).toBe(false);
      expect(run.opaque.results.bundledImage.pixel).toHaveLength(4);
      expect(run.opaque.results.bundledFont.loaded).toBe(true);
      for (const name of ['redirect', 'redirectHttp']) {
        const denied = run.opaque.results[name];
        expect(denied.error != null || denied.status === 403, name).toBe(true);
        expect(denied.body ?? '', name).not.toContain('PRIVATE_PREVIEW_AUTHORITY_SENTINEL');
      }
      expect(run.opaque.origin).toBe('null');
      expect(run.opaque.results.bundled.status).toBe(200);
      expect(run.opaque.results.bundled.body).toBe(await (await fetch(`${daemon}/api/plugins/example-open-design-homepage/asset/assets/model/hello.gltf`)).text());
      for (const name of ['private', 'undeclared', 'forged']) {
        const denied = run.opaque.results[name];
        expect(denied.status, name).toBe(403);
        expect(denied.body ?? '', name).not.toContain('PRIVATE_PREVIEW_AUTHORITY_SENTINEL');
      }
      expect(run.opaque.results.write.error).toContain('Failed to fetch');
    }
    expect(await (await fetch(privateUrl)).text()).toBe('PRIVATE_PREVIEW_AUTHORITY_SENTINEL');
  });
}, 180000);
