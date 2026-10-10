import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const chartDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');

interface RenderOptions {
  configWebBasePath?: string;
  imageRepository?: string;
  imageTag?: string;
  imageWebBasePath?: string;
}

async function renderChart(options: RenderOptions = {}): Promise<string> {
  const args = ['template', 'open-design-test', chartDirectory];
  const values = [
    ['config.webBasePath', options.configWebBasePath],
    ['image.repository', options.imageRepository],
    ['image.tag', options.imageTag],
    ['image.webBasePath', options.imageWebBasePath],
  ] as const;

  for (const [name, value] of values) {
    if (value !== undefined) args.push('--set-string', `${name}=${value}`);
  }

  const { stdout } = await execFileAsync('helm', args, { encoding: 'utf8' });
  return stdout;
}

function errorDetails(error: unknown): string {
  const record = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {};
  return `${String(record.message ?? error)}\n${String(record.stderr ?? '')}`;
}

test('the root deployment accepts the stock root-built image', async () => {
  const rendered = await renderChart();

  assert.match(rendered, /OD_WEB_BASE_PATH: ""/u);
  assert.match(rendered, /image: "ghcr\.io\/nexu-io\/od:latest"/u);
});

test('a non-root runtime path requires a matching image build declaration', async () => {
  await assert.rejects(
    () => renderChart({ configWebBasePath: '/open-design' }),
    (error: unknown) => {
      assert.match(errorDetails(error), /image\.webBasePath must match config\.webBasePath/u);
      return true;
    },
  );

  await assert.rejects(
    () => renderChart({ configWebBasePath: '/open-design', imageWebBasePath: '/other' }),
    (error: unknown) => {
      assert.match(errorDetails(error), /image\.webBasePath must match config\.webBasePath/u);
      return true;
    },
  );
});

test('a matching custom image and runtime path render together', async () => {
  const rendered = await renderChart({
    configWebBasePath: '/open-design',
    imageRepository: 'registry.example.test/open-design',
    imageTag: 'open-design',
    imageWebBasePath: '/open-design',
  });

  assert.match(rendered, /OD_WEB_BASE_PATH: "\/open-design"/u);
  assert.match(rendered, /image: "registry\.example\.test\/open-design:open-design"/u);
});

test('reserved browser namespaces are rejected as deployment prefixes', async (t) => {
  for (const prefix of ['/api', '/_next', '/artifacts', '/frames', '/API/v2']) {
    await t.test(prefix, async () => {
      await assert.rejects(
        () => renderChart({ configWebBasePath: prefix, imageWebBasePath: prefix }),
        (error: unknown) => {
          assert.match(errorDetails(error), /must not start with the reserved browser namespaces/u);
          return true;
        },
      );
    });
  }
});
