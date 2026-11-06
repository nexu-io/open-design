import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { execute } from '../hyperframes.ts';

test('detached render environment reaches the child while execution timeout still cancels it', async () => {
  await assert.rejects(execute(process.execPath, ['-e', 'process.stderr.write("detached="+process.env.HYPERFRAMES_RENDER_DETACHED);setInterval(()=>{},1000)'], tmpdir(), 500,
    { HYPERFRAMES_RENDER_DETACHED: '1' }), /Hyperframes 执行超时：detached=1/);
});


test('explicit cancellation waits for the owned process group to stop', { skip: process.platform === 'win32', timeout: 10_000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'motion-cancel-process-'));
  const controller = new AbortController();
  const source = `const {spawn}=require('node:child_process'); const fs=require('node:fs'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'}); fs.writeFileSync('owned.json',JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);`;
  const result = execute(process.execPath, ['-e', source], directory, 10_000, {}, controller.signal);
  const stopped = assert.rejects(result, /COMMAND_CANCELLED/);
  try {
    let pids: number[] = [];
    for (let i = 0; i < 100; i++) {
      pids = await readFile(path.join(directory, 'owned.json'), 'utf8').then(JSON.parse, () => []);
      if (pids.length) break; await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(pids.length, 2); controller.abort(); await stopped;
    for (const pid of pids) {
      try { process.kill(pid, 0); } catch (error) { assert.equal((error as NodeJS.ErrnoException).code, 'ESRCH'); continue; }
      // Exited grandchildren can await PID1 reaping in CI containers.
      const state = process.platform === 'linux' ? await readFile(`/proc/${pid}/stat`, 'utf8').then(text => text.match(/\) ([A-Z]) /)?.[1], error => { if (error.code === 'ENOENT') return 'X'; throw error; }) : null;
      assert.ok(state === 'Z' || state === 'X', `owned process ${pid} is still executing`);
    }
  } finally { controller.abort(); await stopped; await rm(directory, { recursive: true, force: true }); }
});
