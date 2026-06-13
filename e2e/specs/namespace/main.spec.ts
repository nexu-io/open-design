// @vitest-environment node

import { execFile } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

import { requestJson } from '@/vitest/http';
import { createSmokeSuite, e2eWorkspaceRoot } from '@/vitest/smoke-suite';

const execFileAsync = promisify(execFile);

type DaemonStatusResponse = {
  dataDir?: string;
  installedPlugins?: unknown;
  mediaConfigDir?: string | null;
  namespace?: unknown;
  pid?: number;
  port?: number;
};

type McpInstallInfoResponse = {
  args: string[];
  env: Record<string, string>;
};

type InstalledPlugin = {
  fsPath?: string;
  id: string;
  source?: string;
  sourceKind?: string;
  version?: string;
};

type SseEvent = {
  data: unknown;
  event: string;
};

describe('namespace isolation spec', () => {
  test('keeps namespace in lifecycle infrastructure while daemon clients use URL or concrete IPC transport', async () => {
    const suite = await createSmokeSuite('namespace-isolation');

    await suite.with.toolsDev(async ({ runtime, status, webUrl }) => {
      expect(status.namespace).toBe(suite.namespace);

      const daemonStatus = await requestJson<DaemonStatusResponse>(webUrl, '/api/daemon/status');
      expect(daemonStatus.port).toBe(runtime.daemonPort);
      expect(daemonStatus.dataDir).toBe(suite.dataDir);
      expect(daemonStatus).not.toHaveProperty('namespace');

      const installInfo = await requestJson<McpInstallInfoResponse>(webUrl, '/api/mcp/install-info');
      const ipcPath = installInfo.env.OD_SIDECAR_IPC_PATH;
      if (typeof ipcPath !== 'string' || ipcPath.length === 0) {
        throw new Error('MCP install-info did not include OD_SIDECAR_IPC_PATH');
      }
      expect(ipcPath).toEqual(expect.any(String));
      expect(installInfo.args).not.toContain('--daemon-url');
      expect(installInfo.env.OD_DATA_DIR).toBe(suite.dataDir);
      expect(installInfo.env).not.toHaveProperty('OD_NAMESPACE');
      expect(installInfo.env).not.toHaveProperty('OD_SIDECAR_NAMESPACE');
      expect(installInfo.env).not.toHaveProperty('OD_SIDECAR_IPC_BASE');

      const cliStatus = await runDaemonCliJson<DaemonStatusResponse>(
        ['daemon', 'status', '--json'],
        {
          OD_DATA_DIR: suite.dataDir,
          OD_NAMESPACE: 'wrong-daemon-namespace',
          OD_SIDECAR_IPC_BASE: path.join(suite.scratchDir, 'wrong-ipc-base'),
          OD_SIDECAR_IPC_PATH: ipcPath,
          OD_SIDECAR_NAMESPACE: 'wrong-sidecar-namespace',
        },
      );
      expect(cliStatus.port).toBe(runtime.daemonPort);
      expect(cliStatus.dataDir).toBe(suite.dataDir);
      expect(cliStatus).not.toHaveProperty('namespace');

      const rejected = await runDaemonCliExpectFailure(
        ['daemon', 'status', '--json', '--namespace', 'should-not-parse'],
        { OD_SIDECAR_IPC_PATH: ipcPath },
      );
      expect(`${rejected.stdout}\n${rejected.stderr}`).toContain('unknown flag: --namespace');

      const pluginSource = await writeLocalPluginFixture(suite.scratchDir);
      const sourceForDaemon = `./${path.relative(e2eWorkspaceRoot(), pluginSource).replace(/\\/g, '/')}`;
      const installResponse = await fetch(new URL('/api/plugins/install', ensureTrailingSlash(webUrl)), {
        body: JSON.stringify({ source: sourceForDaemon }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(installResponse.ok).toBe(true);
      const installEvents = parseSseEvents(await installResponse.text());
      const success = installEvents.find((entry) => entry.event === 'success')?.data as
        | { plugin?: InstalledPlugin }
        | undefined;
      const expectedPluginRoot = path.join(suite.dataDir, 'plugins', 'e2e-namespace-plugin');
      expect(success?.plugin?.id).toBe('e2e-namespace-plugin');
      expect(success?.plugin?.fsPath).toBe(expectedPluginRoot);

      const pluginInfo = await requestJson<InstalledPlugin>(webUrl, '/api/plugins/e2e-namespace-plugin');
      expect(pluginInfo.fsPath).toBe(expectedPluginRoot);
      await access(path.join(expectedPluginRoot, 'open-design.json'));
      expect(await readFile(path.join(expectedPluginRoot, 'SKILL.md'), 'utf8')).toContain('E2E namespace plugin');

      await suite.report.json('summary.json', {
        cliStatus,
        daemonStatus,
        installInfo: {
          args: installInfo.args,
          envKeys: Object.keys(installInfo.env).sort(),
          ipcPath,
        },
        plugin: pluginInfo,
        runtime,
        toolsDevNamespace: status.namespace,
      });
    });
  }, 180_000);
});

async function writeLocalPluginFixture(root: string): Promise<string> {
  const pluginRoot = path.join(root, 'plugin-source');
  await mkdir(pluginRoot, { recursive: true });
  await writeFile(
    path.join(pluginRoot, 'open-design.json'),
    JSON.stringify(
      {
        name: 'e2e-namespace-plugin',
        od: {
          inputs: [{ name: 'topic', required: true, type: 'string' }],
          kind: 'skill',
          taskKind: 'new-generation',
          useCase: { query: 'Make a {{topic}} brief.' },
        },
        title: 'E2E Namespace Plugin',
        version: '1.0.0',
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(pluginRoot, 'SKILL.md'),
    [
      '# E2E namespace plugin',
      '',
      'Create a deterministic fixture artifact for namespace isolation tests.',
      '',
    ].join('\n'),
  );
  return pluginRoot;
}

async function runDaemonCliJson<T>(args: string[], env: Record<string, string>): Promise<T> {
  const result = await runDaemonCli(args, env);
  return parseJsonOutput<T>(result.stdout);
}

async function runDaemonCliExpectFailure(
  args: string[],
  env: Record<string, string>,
): Promise<{ stderr: string; stdout: string }> {
  try {
    await runDaemonCli(args, env);
  } catch (error) {
    const failure = error as { stderr?: string; stdout?: string };
    return {
      stderr: failure.stderr ?? '',
      stdout: failure.stdout ?? '',
    };
  }
  throw new Error(`expected daemon CLI to fail for args: ${args.join(' ')}`);
}

async function runDaemonCli(
  args: string[],
  env: Record<string, string>,
): Promise<{ stderr: string; stdout: string }> {
  const mergedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...env,
  };
  delete mergedEnv.OD_DAEMON_URL;
  delete mergedEnv.OD_PORT;

  const { stderr, stdout } = await execFileAsync(
    process.execPath,
    ['--import', 'tsx', 'apps/daemon/src/cli.ts', ...args],
    {
      cwd: e2eWorkspaceRoot(),
      env: mergedEnv,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  return { stderr, stdout };
}

function parseJsonOutput<T>(stdout: string): T {
  const trimmed = stdout.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as T;
  }
  const objectStart = stdout.lastIndexOf('\n{');
  const arrayStart = stdout.lastIndexOf('\n[');
  const jsonStart = Math.max(objectStart, arrayStart);
  if (jsonStart < 0) {
    throw new Error(`Expected JSON output from daemon CLI, got: ${stdout}`);
  }
  return JSON.parse(stdout.slice(jsonStart + 1)) as T;
}

function parseSseEvents(text: string): SseEvent[] {
  return text
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
        if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trim());
      }
      return {
        data: dataLines.length > 0 ? JSON.parse(dataLines.join('\n')) : null,
        event,
      };
    });
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
