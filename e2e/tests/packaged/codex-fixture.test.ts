import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeAgentRuntimes } from '@/fake-agents';
import {
  PACKAGED_HOME_FIRST_RUN_OUTPUT,
  PACKAGED_HOME_FIRST_RUN_PROMPT,
} from '@/vitest/packaged-home-first-run';
import { attachCodexAppServerSession } from '../../../apps/daemon/src/agent-protocol/codex-app-server/session.js';

describe('packaged Codex fixture transport', () => {
  it.each([null, 'resumed-smoke-thread'])(
    '[P0] delivers the Home prompt through the production app-server session (resume=%s)',
    async (resumeSessionId) => {
      const root = await mkdtemp(join(tmpdir(), 'od-codex-fixture-'));
      const { codex } = await createFakeAgentRuntimes({ root, runtimeIds: ['codex'], recordInvocations: true });
      const child = spawn(process.execPath, [join(root, 'codex-e2e.cjs'), 'app-server'], { stdio: 'pipe' });
      const closed = once(child, 'close');
      const events: Record<string, unknown>[] = [];
      const milestones: string[] = [];
      const session = attachCodexAppServerSession({
        child, cwd: root, prompt: PACKAGED_HOME_FIRST_RUN_PROMPT,
        sandboxMode: 'workspace-write', resumeSessionId,
        onAgentEvent: (event) => events.push(event),
        onSessionReady: () => milestones.push('session'),
        onPromptSendStart: () => milestones.push('prompt'),
        onTurnComplete: () => milestones.push('complete'),
      });
      try {
        expect(await closed).toEqual([0, null]);
        expect(milestones).toEqual(['session', 'prompt', 'complete']);
        expect(session.completedSuccessfully()).toBe(true);
        expect(session.getDurableSessionId()).toBe(resumeSessionId ?? 'fake-codex-session');
        expect(JSON.stringify(events)).toContain(PACKAGED_HOME_FIRST_RUN_OUTPUT);
        expect(session.stats()).toEqual({ unknownNotifications: 0, unknownItems: 0 });
        const receipts = (await readFile(codex.invocation!.path, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
        expect(receipts.every((entry) => entry.nonce === codex.invocation!.nonce && entry.pid === child.pid)).toBe(true);
        expect(receipts.filter((entry) => entry.event === 'request').map((entry) => entry.method))
          .toEqual(['initialize', 'initialized', resumeSessionId ? 'thread/resume' : 'thread/start', 'turn/start']);
        expect(JSON.stringify(receipts)).not.toContain(PACKAGED_HOME_FIRST_RUN_PROMPT);
      } finally {
        if (child.exitCode == null && child.signalCode == null) child.kill();
        await closed;
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it.each([
    ['Return an intentional daemon smoke failure', false],
    ['Return an empty daemon smoke response', true],
  ] as const)('[P0] preserves the %s scenario without hanging', async (prompt, completedSuccessfully) => {
    const root = await mkdtemp(join(tmpdir(), 'od-codex-fixture-'));
    await createFakeAgentRuntimes({ root, runtimeIds: ['codex'] });
    const child = spawn(process.execPath, [join(root, 'codex-e2e.cjs'), 'app-server']);
    const closed = once(child, 'close');
    const events: Record<string, unknown>[] = [];
    const session = attachCodexAppServerSession({
      child, cwd: root, prompt, sandboxMode: 'workspace-write', onAgentEvent: (event) => events.push(event),
    });
    try {
      expect(await closed).toEqual([0, null]);
      expect(session.completedSuccessfully()).toBe(completedSuccessfully);
      expect(events.filter((event) => event.type === 'text_delta')).toEqual([]);
      if (!completedSuccessfully) expect(JSON.stringify(events)).toContain('intentional fake codex failure');
      // Empty completion remains empty: the daemon's existing empty-output
      // guard, rather than a fake success message, owns its failed Run status.
    } finally {
      if (child.exitCode == null && child.signalCode == null) child.kill();
      await closed;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('[P0] carries the Home scenario through OD Next planning and native continuation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-codex-fixture-'));
    await createFakeAgentRuntimes({ root, runtimeIds: ['codex'] });
    // Match the identity envelope the production prompt composer supplies;
    // capability admission remains the daemon's responsibility, not this fake's.
    const prompts = [
      `${PACKAGED_HOME_FIRST_RUN_PROMPT}\n<recipe_identity strategy_version="2.0.0" applied_snapshot="smoke-snapshot" task_profile_version="2.0.0" />\n"packageHash": "${'a'.repeat(64)}"`,
      '# OD Next native continuation — production',
    ];
    try {
      for (const [index, prompt] of prompts.entries()) {
        const child = spawn(process.execPath, [join(root, 'codex-e2e.cjs'), 'app-server']);
        const closed = once(child, 'close');
        const events: Record<string, unknown>[] = [];
        const session = attachCodexAppServerSession({
          child, cwd: root, prompt, sandboxMode: 'workspace-write',
          resumeSessionId: index === 0 ? null : 'fake-codex-session',
          onAgentEvent: (event) => events.push(event),
        });
        try {
          expect(await closed).toEqual([0, null]);
          expect(session.completedSuccessfully()).toBe(true);
          const text = events.filter((event) => event.type === 'text_delta').map((event) => event.delta).join('');
          if (index === 0) expect(text).toContain('<open-design-plan-contract>');
          else {
            expect(text).toContain(PACKAGED_HOME_FIRST_RUN_OUTPUT);
            expect(text).toContain('"outcome":"completed"');
            expect(await readFile(join(root, 'od-next-active-canary.html'), 'utf8')).toContain('Delayed Daemon Smoke');
          }
        } finally {
          if (child.exitCode == null && child.signalCode == null) child.kill();
          await closed;
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('[P0] keeps exec-json compatibility and rejects an app-server turn before initialization', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-codex-fixture-'));
    await createFakeAgentRuntimes({ root, runtimeIds: ['codex'] });
    try {
      for (const mode of ['exec-json', 'app-server']) {
        const child = spawn(process.execPath, [join(root, 'codex-e2e.cjs'), ...(
          mode === 'app-server' ? ['app-server'] : ['exec', '--json', '-']
        )]);
        const closed = once(child, 'close');
        let stdout = '';
        child.stdout.on('data', (chunk) => { stdout += String(chunk); });
        child.stdin.end(mode === 'app-server'
          ? JSON.stringify({ id: 19, method: 'turn/start', params: { input: [] } }) + '\n'
          : PACKAGED_HOME_FIRST_RUN_PROMPT);
        try {
          expect(await closed).toEqual([0, null]);
          if (mode === 'app-server') {
            expect(JSON.parse(stdout)).toMatchObject({ id: 19, error: { code: -32601 } });
            expect(stdout).not.toContain(PACKAGED_HOME_FIRST_RUN_OUTPUT);
          } else {
            expect(stdout).toContain(PACKAGED_HOME_FIRST_RUN_OUTPUT);
            expect(stdout.trim().split('\n').map((line) => JSON.parse(line).type))
              .toEqual(['thread.started', 'turn.started', 'item.completed', 'turn.completed']);
          }
        } finally {
          if (child.exitCode == null && child.signalCode == null) child.kill();
          await closed;
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
