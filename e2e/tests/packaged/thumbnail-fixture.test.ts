import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createFakeAgentRuntimes } from '@/fake-agents';
import { T } from '@/timeouts';
import { PACKAGED_THUMBNAIL_HTML, PACKAGED_THUMBNAIL_PNG_A_BASE64 } from '../../resources/packaged-thumbnail.ts';

describe('packaged thumbnail CLI transport', () => {
  it('[P0] writes the thumbnail source with only allowed CLI configuration and exits after host EOF', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-thumbnail-cli-'));
    try {
      const input = join(root, 'input');
      const project = join(root, 'project');
      await Promise.all([mkdir(input), mkdir(project)]);
      const image = Buffer.from(PACKAGED_THUMBNAIL_PNG_A_BASE64, 'base64');
      await Promise.all([
        writeFile(join(input, 'index.html'), PACKAGED_THUMBNAIL_HTML),
        writeFile(join(input, 'a.png'), image),
      ]);
      const { codex } = await createFakeAgentRuntimes({ root, runtimeIds: ['codex'], recordInvocations: true });
      expect(Object.keys(codex.env)).toEqual(['CODEX_BIN']);
      // The app-config API admits CODEX_BIN, not arbitrary OD_E2E_* entries.
      // Spawn the generated CLI itself; its app-server cwd comes from thread/start.
      const child = spawn(process.execPath, [join(root, 'codex-e2e.cjs'), 'app-server'], {
        cwd: project,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...codex.env },
        stdio: 'pipe',
      });
      const closed = once(child, 'close');
      let stdout = '';
      let stderr = '';
      let pending = '';
      let completed: unknown;
      let protocolError: unknown;
      let timedOut = false;
      let hostEndedAfterCompletion = false;
      const send = (frame: unknown) => child.stdin.write(JSON.stringify(frame) + '\n');
      child.stdin.on('error', (error) => { protocolError ??= error; });
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
        pending += String(chunk);
        let newline: number;
        while ((newline = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, newline);
          pending = pending.slice(newline + 1);
          if (!line.trim()) continue;
          try {
            const frame = JSON.parse(line);
            if (frame.id === 1) {
              send({ method: 'initialized', params: {} });
              send({ id: 2, method: 'thread/start', params: { cwd: project } });
            } else if (frame.id === 2) {
              send({ id: 3, method: 'turn/start', params: {
                threadId: frame.result.thread.id,
                input: [{ type: 'text', text: 'Create the packaged thumbnail filter SVG fixture' }],
              } });
            } else if (frame.method === 'turn/completed') {
              completed = frame.params.turn;
              hostEndedAfterCompletion = true;
              child.stdin.end();
            }
          } catch (error) {
            protocolError = error;
            child.kill();
          }
        }
      });
      // Real process I/O: the timeout is only a failure/cleanup budget, never a settle delay.
      const deadline = setTimeout(() => { timedOut = true; child.kill(); }, T.medium);
      try {
        send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'thumbnail-fixture', version: '1' } } });
        const exit = await closed;
        expect(timedOut, stderr + stdout).toBe(false);
        expect(protocolError, stderr + stdout).toBeUndefined();
        expect(exit, stderr + stdout).toEqual([0, null]);
        expect(completed).toMatchObject({ status: 'completed', error: null });
        expect(hostEndedAfterCompletion).toBe(true);
        expect(await readFile(join(project, 'index.html'), 'utf8')).toBe(PACKAGED_THUMBNAIL_HTML);
        expect(await readFile(join(project, 'assets', 'a.png'))).toEqual(image);
        if (!codex.invocation) throw new Error('missing fixture invocation recorder');
        const receipts = (await readFile(codex.invocation.path, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
        expect(receipts.filter((entry) => entry.event === 'request').map((entry) => entry.method))
          .toEqual(['initialize', 'initialized', 'thread/start', 'turn/start']);
        expect(receipts.filter((entry) => entry.event === 'thumbnail-written'))
          .toEqual([expect.objectContaining({ nonce: codex.invocation.nonce, pid: child.pid, projectDir: project })]);
        expect(receipts.filter((entry) => entry.event === 'completed'))
          .toEqual([expect.objectContaining({ nonce: codex.invocation.nonce, pid: child.pid, failed: false })]);
      } finally {
        clearTimeout(deadline);
        if (child.exitCode == null && child.signalCode == null) child.kill();
        await closed;
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, T.long);
});
