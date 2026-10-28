import { expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runPinnedVelaCommand } from '../src/collab/vela-pinned-command.js';
import type { VelaControlApiContext } from '../src/integrations/vela.js';
import type { runVelaCommand } from '../src/integrations/vela-command.js';
it.each([0, 1, 'SIGTERM', 'SIGKILL'] as const)('propagates the pinned context through a real child and cleans up, outcome=%s', async (exitCode) => {
  const root = await mkdtemp(path.join(tmpdir(), 'od-pinned-child-'));
  try {
    const script = `
      const fs = require('node:fs');
      const path = require('node:path');
      const env = process.env;
      const config = JSON.parse(fs.readFileSync(path.join(env.AMR_HOME, 'config.json'), 'utf8'));
      const valid = env.VELA_PROFILE === 'test'
        && env.VELA_API_URL === 'https://example.test'
        && env.VELA_WORKSPACE_ID === 'original-workspace'
        && config.profiles.test.controlKey === 'synthetic-child-key'
        && config.profiles.test.apiUrl === 'https://example.test';
      if (!valid) { process.stdout.write('wrong-context'); process.exit(2); }
      fs.writeFileSync(process.argv[1], 'context-verified');
      process.stdout.write('context-verified');
      ${typeof exitCode === 'number' ? `process.exit(${exitCode});` : `process.kill(process.pid, '${exitCode}');`}
    `;
    const result = runPinnedVelaCommand({
      args: ['-e', script, path.join(root, 'child-marker')], dataRoot: root, workspaceId: 'original-workspace',
      session: { profile: 'test', apiUrl: 'https://example.test', controlKey: 'synthetic-child-key', user: null, configMtimeMs: null },
      configuredEnv: { VELA_BIN: process.execPath, VELA_PROFILE: 'prod', AMR_HOME: 'wrong-home', VELA_API_URL: 'https://wrong.test', VELA_WORKSPACE_ID: 'wrong-workspace' },
    });
    if (exitCode === 0) expect(await result).toBe('context-verified');
    else await expect(result).rejects.toThrow(/^VELA_PINNED_COMMAND_FAILED$/);
    // Distinguish actual post-load exit/signal death from fixture failure (exit2).
    expect(await readFile(path.join(root, 'child-marker'), 'utf8')).toBe('context-verified');
    expect(await readdir(root)).toEqual(['child-marker']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it.each([false, true])('pins CLI session until settlement and cleans its private config, rejection=%s', async (reject) => {
  const root = await mkdtemp(path.join(tmpdir(), 'od-pinned-cli-'));
  try {
    const session: VelaControlApiContext = { profile: 'test', apiUrl: 'https://example.test', controlKey: 'synthetic-key', user: null, configMtimeMs: null };
    const args = ['share', 'stop', 'stable', '--project-id', 'project', '--json'];
    const run = vi.fn<typeof runVelaCommand>().mockImplementation(async (argv, options) => {
      expect(argv).toEqual(['share', 'stop', 'stable', '--project-id', 'project', '--json']);
      const env = options?.configuredEnv;
      expect(env).toMatchObject({ VELA_PROFILE: 'test', VELA_API_URL: 'https://example.test', VELA_WORKSPACE_ID: 'workspace', VELA_BIN: 'fixture-bin' });
      expect(options?.timeoutMs).toBe(30_000);
      const home = env?.AMR_HOME; if (!home) throw new Error('missing pinned home');
      expect(path.relative(root, home).startsWith('..')).toBe(false);
      const config = path.join(home, 'config.json');
      expect(JSON.parse(await readFile(config, 'utf8'))).toEqual({ profiles: { test: { controlKey: 'synthetic-key', apiUrl: 'https://example.test' } } });
      if (process.platform !== 'win32') {
        expect((await stat(home)).mode & 0o777).toBe(0o700);
        expect((await stat(config)).mode & 0o777).toBe(0o600);
      }
      if (reject) throw new Error('sensitive child diagnostics');
      return '{"status":"stopped"}';
    });
    const pending = runPinnedVelaCommand({ args, session, dataRoot: root, workspaceId: 'workspace', configuredEnv: { AMR_HOME: 'wrong-home', VELA_PROFILE: 'prod', VELA_API_URL: 'https://wrong.test', VELA_WORKSPACE_ID: 'wrong', VELA_BIN: 'fixture-bin' } }, run);
    session.controlKey = 'switched-key'; session.apiUrl = 'https://switched.test'; args[2] = 'wrong-slug';
    if (reject) await expect(pending).rejects.toThrow(/^VELA_PINNED_COMMAND_FAILED$/);
    else expect(await pending).toBe('{"status":"stopped"}');
    expect(run).toHaveBeenCalledTimes(1);
    expect(await readdir(root)).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
