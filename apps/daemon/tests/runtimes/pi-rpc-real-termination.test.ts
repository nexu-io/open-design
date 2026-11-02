import { test, expect, vi } from 'vitest';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { attachPiRpcSession } from '../../src/agent-protocol/pi-rpc/session.js';
import { classifyChatRunCloseStatus } from '../../src/runtimes/chat-run-lifecycle.js';

test.skipIf(process.platform !== 'darwin')('a real zombie before the completion callback stays failed', async () => {
  const grace = process.env.PI_GRACEFUL_SHUTDOWN_MS;
  process.env.PI_GRACEFUL_SHUTDOWN_MS = '10';
  const cwd = mkdtempSync(path.join(tmpdir(), 'od-real-exit-'));
  const child = spawn(process.execPath, ['-e', `
const fs=require('node:fs');
process.stdin.once('data',()=>{
 fs.writeSync(1,JSON.stringify({type:'agent_end'})+'\\n');
});
process.on('message',message=>{
 if(message==='exit-now')process.exit(143);
});
`], {stdio:['pipe','pipe','pipe','ipc']});
  const stdout = child.stdout;
  if (!stdout) {
    child.kill('SIGKILL');
    throw new Error('Expected a piped child stdout');
  }
  const closed = once(child, 'close');
  const pending: Array<() => void> = [];
  const nativeTimeout = globalThis.setTimeout;
  const timeout = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
    const timer = nativeTimeout(callback, delay, ...args);
    if (delay === 10) pending.push(() => {
      clearTimeout(timer);
      callback(...args);
    });
    return timer;
  });
  const session = attachPiRpcSession({child,prompt:'close race',cwd,send:()=>{}});
  let observed = false;
  try {
    stdout.once('data', () => {
      expect(pending).toHaveLength(1);
      child.send('exit-now');
      const deadline = performance.now() + 2000;
      let state = '';
      while (performance.now() < deadline) {
        state = execFileSync('/bin/ps', ['-o','state=','-p',String(child.pid)], {encoding:'utf8'}).trim();
        if (state.startsWith('Z')) break;
      }
      expect(state).toMatch(/^Z/);
      expect(child.exitCode).toBeNull();
      expect(child.signalCode).toBeNull();
      observed = true;
      let invoked = 0;
      for (const callback of pending) {
        callback();
        invoked++;
      }
      expect(invoked).toBe(1);
    });
    await closed;
    expect(observed).toBe(true);
    expect(child.exitCode).toBe(143);
    expect(child.signalCode).toBeNull();
    expect(classifyChatRunCloseStatus({
      cancelRequested:false,
      code:child.exitCode,
      signal:child.signalCode,
      acpCleanCompletion:session.completedSuccessfully(),
      acpCompletionShutdownRequested:session.completionShutdownRequested(),
      artifactQuietShutdownRequested:false,
      turnCompletedCleanly:false,
      artifactProducedThisRun:false,
    })).toBe('failed');
  } finally {
    timeout.mockRestore();
    if (child.exitCode===null&&child.signalCode===null) child.kill('SIGKILL');
    await closed;
    rmSync(cwd,{recursive:true,force:true});
    if(grace===undefined)delete process.env.PI_GRACEFUL_SHUTDOWN_MS;
    else process.env.PI_GRACEFUL_SHUTDOWN_MS=grace;
  }
});
