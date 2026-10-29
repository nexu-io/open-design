import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveLauncherCliContext, resolveLauncherPaths } from '@open-design/launcher-proto';
import { describe, expect, it } from 'vitest';
import {
  codexAgentDef,
  codexOpenDesignShellEnvironmentArgs,
} from '../../src/runtimes/defs/codex.js';

// codex is capture-style: it mints its own thread id (reported on the stream's
// `thread.started` event) rather than accepting a daemon-minted one. So a
// create turn passes NO id (plain `exec`) and a resume turn replays the stored
// thread id as `exec resume <id>`. The id daemon-side `newSessionId` is ignored
// by codex on purpose.
describe('codex buildArgs session resume', () => {
  const THREAD = '019eef4f-7409-7c82-bebe-30504eed3959';

  it('uses plain `exec` (no resume, no id) on a create turn', () => {
    const args = codexAgentDef.buildArgs('prompt', [], [], {}, {
      newSessionId: '11111111-1111-4111-8111-111111111111',
      resumeSessionId: null,
    });
    expect(args[0]).toBe('exec');
    expect(args).not.toContain('resume');
    // The minted daemon id must NOT leak into argv — codex would reject/ignore.
    expect(args).not.toContain('11111111-1111-4111-8111-111111111111');
    // Create turn keeps the `--sandbox` flag form.
    expect(args).toContain('--sandbox');
  });

  it('uses `exec resume <thread_id>` with the stored id on a resume turn', () => {
    const args = codexAgentDef.buildArgs('prompt', [], [], {}, {
      newSessionId: '22222222-2222-4222-8222-222222222222',
      resumeSessionId: THREAD,
    });
    expect(args.slice(0, 2)).toEqual(['exec', 'resume']);
    // The thread id is the trailing positional SESSION_ID arg.
    expect(args[args.length - 1]).toBe(THREAD);
  });

  it('passes sandbox via `-c sandbox_mode` on resume (never `--sandbox`, which resume rejects)', () => {
    const args = codexAgentDef.buildArgs('prompt', [], [], {}, {
      resumeSessionId: THREAD,
    });
    expect(args).not.toContain('--sandbox');
    expect(args.some((a) => a.startsWith('sandbox_mode='))).toBe(true);
    // The `-c key=value` override carries the value (workspace-write default).
    expect(args).toContain('-c');
    expect(args.some((a) => a.includes('sandbox_mode="workspace-write"'))).toBe(true);
  });

  it('keeps model + reasoning overrides ahead of the trailing thread id on resume', () => {
    const args = codexAgentDef.buildArgs(
      'prompt',
      [],
      [],
      { model: 'gpt-5.1-codex', reasoning: 'high' },
      { resumeSessionId: THREAD },
    );
    const idIndex = args.indexOf(THREAD);
    expect(idIndex).toBe(args.length - 1);
    const modelIndex = args.indexOf('--model');
    expect(modelIndex).toBeGreaterThan(-1);
    // Flags precede the positional session id.
    expect(modelIndex).toBeLessThan(idIndex);
  });

  it('excludes the create-only `-C` and `--add-dir` flags on resume (rejected by `exec resume`)', () => {
    const args = codexAgentDef.buildArgs(
      'prompt',
      [],
      ['/extra/writable/dir'],
      {},
      { resumeSessionId: THREAD, cwd: '/some/project/dir' },
    );
    // `codex exec resume` errors with "unexpected argument '-C' found" / same
    // for `--add-dir`, so a resume turn must not carry either — the daemon
    // spawns the child in the right cwd and the resumed session keeps its dirs.
    expect(args).not.toContain('-C');
    expect(args).not.toContain('--add-dir');
    expect(args).not.toContain('/some/project/dir');
    expect(args).not.toContain('/extra/writable/dir');
  });

  it('still passes `-C` and `--add-dir` on a create turn', () => {
    const args = codexAgentDef.buildArgs(
      'prompt',
      [],
      ['/extra/writable/dir'],
      {},
      { resumeSessionId: null, cwd: '/some/project/dir' },
    );
    expect(args[args.indexOf('-C') + 1]).toBe('/some/project/dir');
    expect(args[args.indexOf('--add-dir') + 1]).toBe('/extra/writable/dir');
  });

  it('uses plain `exec` when no session context is supplied (back-compat)', () => {
    const args = codexAgentDef.buildArgs('prompt', [], [], {}, {});
    expect(args[0]).toBe('exec');
    expect(args).not.toContain('resume');
  });

  it('carries only the OpenDesign wrapper contract across Codex shell environment filtering', () => {
    const args = codexAgentDef.buildArgs('prompt', [], [], {}, {});
    const shellArgs = codexOpenDesignShellEnvironmentArgs();

    expect(args).toEqual(expect.arrayContaining(shellArgs));
    expect(shellArgs).toContain('allow_login_shell=false');
    expect(shellArgs).toContain('shell_environment_policy.inherit="all"');
    expect(shellArgs).toContain(
      'shell_environment_policy.ignore_default_excludes=true',
    );
    const includeOnly = shellArgs.find((arg) =>
      arg.startsWith('shell_environment_policy.include_only='),
    );
    expect(includeOnly).toContain('"PATH"');
    expect(includeOnly).toContain('"ELECTRON_RUN_AS_NODE"');
    expect(includeOnly).toContain('"OD_NODE_BIN"');
    expect(includeOnly).toContain('"ELECTRON_RUN_AS_NODE"');
    expect(includeOnly).toContain('"OD_HYPERFRAMES_BIN"');
    expect(includeOnly).toContain('"OD_BIN"');
    expect(includeOnly).toContain('"OD_DAEMON_URL"');
    expect(includeOnly).toContain('"OD_TOOL_TOKEN"');
    expect(includeOnly).toContain('"OD_DATA_DIR"');
    expect(includeOnly).toContain('"OD_PROJECT_ID"');
    expect(includeOnly).toContain('"OD_WORKSPACE_ID"');
    expect(includeOnly).toContain('"OD_WORKSPACE_MEMBER_ID"');
    expect(includeOnly).toContain('"OD_PROJECT_DIR"');
    expect(includeOnly).toContain('"OD_TASK_INPUT_DIR"');
    expect(includeOnly).toContain('"OD_STOCK_RUN_ID"');
    expect(includeOnly).toContain('"OD_STOCK_ANALYTICS_DEVICE_ID"');
    expect(includeOnly).toContain('"OD_STOCK_ANALYTICS_SESSION_ID"');
    expect(includeOnly).toContain('"OD_STOCK_SOURCE_COMMIT"');
    expect(includeOnly).toContain('"OD_STOCK_EVALUATION_RUN_ID"');
    expect(includeOnly).not.toContain('OPENAI_API_KEY');
    expect(includeOnly).not.toContain('OD_API_TOKEN');
  });

  it('declares CLI-managed, capture-style session resume', () => {
    expect(codexAgentDef.resumesSessionViaCli).toBe(true);
    expect(codexAgentDef.capturesSessionIdFromStream).toBe(true);
  });

  it('keeps packaged CLI installation selection through Codex shell filtering', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-codex-launcher-'));
    try {
      const namespace = 'custom-beta';
      const paths = resolveLauncherPaths({ channel: 'beta', namespace, root });
      const pointer = { generation: 1, version: '99.0.0-beta.2' };
      await mkdir(dirname(paths.runtimePath), { recursive: true });
      await writeFile(paths.runtimePath, JSON.stringify({
        active: pointer, channel: 'beta', lastSuccessful: pointer,
        namespace, schemaVersion: 1,
      }));
      const includeOnly = codexOpenDesignShellEnvironmentArgs().find((arg) =>
        arg.startsWith('shell_environment_policy.include_only='),
      )!;
      const allowedKeys = JSON.parse(includeOnly.slice(includeOnly.indexOf('=') + 1)) as string[];
      const daemonEnv = {
        OD_APP_VERSION: pointer.version,
        OD_DATA_DIR: join(root, 'namespaces', namespace, 'data'),
        OD_INSTALLATION_DIR: root,
        OD_API_TOKEN: 'daemon-secret',
        OPENAI_API_KEY: 'provider-secret',
        OD_SIDECAR_SUPERVISED_CONTEXT: 'private-sidecar-context',
      };
      const shellEnv = Object.fromEntries(Object.entries(daemonEnv).filter(([key]) => allowedKeys.includes(key)));

      // Namespace discovery stays authoritative; no private sidecar identity is
      // needed to find this installation's sole persisted namespace.
      await expect(resolveLauncherCliContext({ env: shellEnv, home: root, platform: 'darwin' }))
        .resolves.toMatchObject({ channel: 'beta', namespace, root });
      expect(shellEnv.OD_API_TOKEN).toBeUndefined();
      expect(shellEnv.OPENAI_API_KEY).toBeUndefined();
      expect(shellEnv.OD_SIDECAR_SUPERVISED_CONTEXT).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
