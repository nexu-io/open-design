import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { expect, test } from 'vitest';

import { composeToolsDevEnv } from '@/tools-dev/cli';

const execFileAsync = promisify(execFile);

test('tools-dev starts Next without waiting for registry metadata and preserves application fetch', async () => {
  // Model an unreachable registry before loading the harness. A real local
  // HTTP request below must still reach its server through the same fetch API.
  const stalledRegistry = `
    const original = globalThis.fetch;
    globalThis.fetch = (input, init) => String(input) === 'https://registry.npmjs.org/-/package/next/dist-tags'
      ? new Promise(() => {}) : original(input, init);
  `;
  const env = composeToolsDevEnv({
    namespace: 'next-version', root: '', toolsDevRoot: '', codexHomeDir: '', dataDir: '',
  }, {}, {
    ...process.env,
    NODE_OPTIONS: `--import=data:text/javascript,${encodeURIComponent(stalledRegistry)}`,
  });
  const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', `
    import { createRequire } from 'node:module';
    import { createServer } from 'node:http';
    import { pathToFileURL } from 'node:url';
    const require = createRequire(pathToFileURL(process.cwd() + '/apps/web/package.json'));
    const { getVersionInfo } = require('next/dist/server/dev/hot-reloader-shared-utils.js');
    const server = createServer((req, res) => res.end('application-response'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const version = await getVersionInfo();
      const url = 'http://127.0.0.1:' + server.address().port;
      const responses = await Promise.all([url, new URL(url), new Request(url)]
        .map(async input => (await fetch(input)).text()));
      console.log(JSON.stringify({ staleness: version.staleness, responses }));
    } finally {
      server.closeAllConnections();
      server.close();
    }
  `], {
    cwd: fileURLToPath(new URL('../../../..', import.meta.url)), env, timeout: 10_000,
  });
  expect(JSON.parse(stdout)).toEqual({
    staleness: 'unknown',
    responses: ['application-response', 'application-response', 'application-response'],
  });
}, 15_000);
