import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const chartDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');

interface RenderCase {
  name: string;
  webBasePath: string;
  ingressPath: string;
  expectedPath?: string;
  error?: boolean;
}

const renderCases: RenderCase[] = [
  { name: 'root config with root ingress', webBasePath: '', ingressPath: '/', expectedPath: '/' },
  { name: 'root config rejects a prefixed ingress', webBasePath: '', ingressPath: '/open-design', error: true },
  {
    name: 'configured prefix accepts the root ingress convenience form',
    webBasePath: '/open-design',
    ingressPath: '/',
    expectedPath: '/open-design',
  },
  {
    name: 'configured prefix accepts a matching ingress',
    webBasePath: '/open-design',
    ingressPath: '/open-design',
    expectedPath: '/open-design',
  },
  { name: 'configured prefix rejects a mismatching ingress', webBasePath: '/open-design', ingressPath: '/other', error: true },
  {
    name: 'configured prefix accepts a matching trailing slash',
    webBasePath: '/open-design',
    ingressPath: '/open-design/',
    expectedPath: '/open-design/',
  },
];

async function renderIngress(webBasePath: string, ingressPath: string): Promise<{ stdout: string; stderr: string }> {
  const args = [
    'template',
    'open-design-test',
    chartDirectory,
    '--show-only',
    'templates/ingress.yaml',
    '--set',
    'ingress.enabled=true',
    '--set-string',
    `ingress.hosts[0].paths[0].path=${ingressPath}`,
  ];
  if (webBasePath !== '') args.push('--set-string', `config.webBasePath=${webBasePath}`);
  return execFileAsync('helm', args, { encoding: 'utf8' });
}

function renderedIngressPath(output: string): string {
  const match = output.match(/^\s+- path: (.+)$/mu);
  assert.ok(match, `expected an ingress path in Helm output:\n${output}`);
  return match[1].trim();
}

test('Helm ingress path validation matrix', async (t) => {
  for (const renderCase of renderCases) {
    await t.test(renderCase.name, async () => {
      if (renderCase.error) {
        await assert.rejects(
          () => renderIngress(renderCase.webBasePath, renderCase.ingressPath),
          (error: unknown) => {
            const record = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {};
            const details = `${String(record.message ?? error)}\n${String(record.stderr ?? '')}`;
            assert.match(details, /ingress path must match config\.webBasePath/);
            return true;
          },
        );
        return;
      }

      const rendered = await renderIngress(renderCase.webBasePath, renderCase.ingressPath);
      assert.equal(renderedIngressPath(rendered.stdout), renderCase.expectedPath);
    });
  }
});
