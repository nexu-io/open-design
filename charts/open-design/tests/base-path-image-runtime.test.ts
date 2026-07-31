import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const chartDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const imageReference = process.env.OD_HELM_SMOKE_IMAGE?.trim() ?? '';
const webBasePath = process.env.OD_HELM_SMOKE_WEB_BASE_PATH?.trim() || '/open-design';

function splitTaggedImage(reference: string): { repository: string; tag: string } {
  if (reference.includes('@')) throw new Error('OD_HELM_SMOKE_IMAGE must use a tag, not a digest');
  const lastSlash = reference.lastIndexOf('/');
  const lastColon = reference.lastIndexOf(':');
  if (lastColon <= lastSlash || lastColon === reference.length - 1) {
    throw new Error('OD_HELM_SMOKE_IMAGE must include an explicit tag');
  }
  return { repository: reference.slice(0, lastColon), tag: reference.slice(lastColon + 1) };
}

function yamlString(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"')) return JSON.parse(value) as string;
  return value;
}

function renderedConfigMapData(rendered: string): Map<string, string> {
  const configDocument = rendered
    .split(/^---\r?$/mu)
    .find((document) => /# Source: open-design\/templates\/configmap\.yaml/u.test(document));
  assert.ok(configDocument, `expected the application ConfigMap in Helm output:\n${rendered}`);

  const lines = configDocument.split(/\r?\n/u);
  const dataLine = lines.findIndex((line) => line === 'data:');
  assert.notEqual(dataLine, -1, 'expected a data block in the application ConfigMap');

  const values = new Map<string, string>();
  for (const line of lines.slice(dataLine + 1)) {
    const match = /^  ([A-Z][A-Z0-9_]*):\s*(.*)$/u.exec(line);
    if (match == null) {
      if (line.trim() !== '') break;
      continue;
    }
    const key = match[1];
    const rawValue = match[2];
    assert.ok(key != null && rawValue != null, `invalid ConfigMap data line: ${line}`);
    values.set(key, yamlString(rawValue));
  }
  return values;
}

async function renderImageAndConfig(reference: string): Promise<{
  config: Map<string, string>;
  image: string;
}> {
  const { repository, tag } = splitTaggedImage(reference);
  const { stdout } = await execFileAsync('helm', [
    'template',
    'open-design-smoke',
    chartDirectory,
    '--show-only',
    'templates/configmap.yaml',
    '--show-only',
    'templates/deployment.yaml',
    '--set-string',
    `image.repository=${repository}`,
    '--set-string',
    `image.tag=${tag}`,
    '--set-string',
    `image.webBasePath=${webBasePath}`,
    '--set-string',
    `config.webBasePath=${webBasePath}`,
  ], { encoding: 'utf8' });

  const imageMatch = /^\s+image: "([^"]+)"$/mu.exec(stdout);
  assert.ok(imageMatch, `expected the application image in Helm output:\n${stdout}`);
  const image = imageMatch[1];
  assert.ok(image, 'expected a non-empty application image reference');
  return { config: renderedConfigMapData(stdout), image };
}

async function containerLogs(containerId: string): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync('docker', ['logs', containerId], { encoding: 'utf8' });
    return `${stdout}${stderr}`;
  } catch (error) {
    return String(error);
  }
}

test('the exact Helm-rendered non-root image and runtime config boot together', {
  skip: imageReference === '' ? 'set OD_HELM_SMOKE_IMAGE to a locally available tagged image' : false,
  timeout: 120_000,
}, async () => {
  const rendered = await renderImageAndConfig(imageReference);
  assert.equal(rendered.image, imageReference);
  assert.equal(rendered.config.get('OD_WEB_BASE_PATH'), webBasePath);

  const dockerArgs = ['run', '--detach'];
  for (const [name, value] of rendered.config) {
    dockerArgs.push('--env', `${name}=${value}`);
  }
  dockerArgs.push('--env', 'OD_API_TOKEN=helm-base-path-smoke', rendered.image);

  const { stdout } = await execFileAsync('docker', dockerArgs, { encoding: 'utf8' });
  const containerId = stdout.trim();
  assert.notEqual(containerId, '', 'docker run did not return a container id');

  try {
    const port = rendered.config.get('OD_PORT') ?? '7456';
    const healthUrl = `http://127.0.0.1:${port}${webBasePath}/api/health`;
    let lastError = '';

    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const { stdout: health } = await execFileAsync(
          'docker',
          ['exec', containerId, 'wget', '-qO-', healthUrl],
          { encoding: 'utf8' },
        );
        assert.match(health, /"ok"\s*:\s*true/u);
        return;
      } catch (error) {
        lastError = String(error);
        const { stdout: running } = await execFileAsync(
          'docker',
          ['inspect', '--format', '{{.State.Running}}', containerId],
          { encoding: 'utf8' },
        );
        if (running.trim() !== 'true') break;
        await delay(1_000);
      }
    }

    assert.fail(`Helm-rendered container did not become healthy: ${lastError}\n${await containerLogs(containerId)}`);
  } finally {
    await execFileAsync('docker', ['rm', '--force', containerId], { encoding: 'utf8' }).catch(() => undefined);
  }
});
