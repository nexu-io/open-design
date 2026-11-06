import { fork } from 'node:child_process';
import { fstatSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startStudio } from '../hyperframes.ts';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

const filename = fileURLToPath(import.meta.url);

export async function startOwnedStudio(root, runtimeRoot, projectDirectory, logFile, port) {
  // Keep the same flock alive until the surviving owner has closed the old Studio.
  const child = fork(filename, ['--owner', root, runtimeRoot, projectDirectory, logFile, String(port)], {
    detached: true,
    execArgv: ['--experimental-strip-types'],
    env: { ...process.env, OPENMOTION_EDITOR_LOCK_FD: '4' },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc', Number(process.env.OPENMOTION_EDITOR_LOCK_FD)],
  });
  const exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
  const close = async () => {
    if (child.connected) child.disconnect();
    await exited;
  };
  try {
    const studio = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Studio owner did not become ready')), 65_000);
      const fail = error => { clearTimeout(timer); reject(error); };
      child.once('error', fail);
      child.once('exit', (code, signal) => fail(new Error(`Studio owner exited (${signal || code})`)));
      child.once('message', message => {
        clearTimeout(timer);
        if (!message.ready || message.projectDirectory !== projectDirectory || typeof message.url !== 'string') {
          reject(new Error(message.error || 'Invalid Studio owner response'));
        } else resolve(message);
      });
    });
    return { url: studio.url, projectDirectory, alive: () => child.connected && child.exitCode === null && child.signalCode === null, close };
  } catch (error) { await close(); throw error; }
}

if (path.resolve(process.argv[1] || '') === filename && process.argv[2] === '--owner') {
  const [, , , root, runtimeRoot, projectDirectory, logFile, port] = process.argv;
  const held = fstatSync(Number(process.env.OPENMOTION_EDITOR_LOCK_FD));
  const lock = statSync(path.join(root, '.editor-runtime', 'runtime.lock'));
  if (held.dev !== lock.dev || held.ino !== lock.ino) throw new Error('Studio owner requires the editor lock');
  let closing = false, monitor;
  const opening = startStudio(runtimeRoot, projectDirectory, logFile, Number(port));
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(monitor);
    const studio = await opening.catch(() => null);
    if (studio) {
      await studio.close();
      // startStudio escalates to SIGKILL after 5s; wait for its child exit before releasing flock.
      while (studio.alive()) await pause(10);
    }
    process.exit(0);
  };
  process.once('disconnect', () => { void close(); });
  process.once('SIGTERM', () => { void close(); });
  process.once('SIGINT', () => { void close(); });
  opening.then(studio => {
    if (closing || !process.connected) { void close(); return; }
    monitor = setInterval(() => { if (!studio.alive()) void close(); }, 100);
    process.send({ ready: true, url: studio.url, projectDirectory }, () => {});
  }, error => {
    if (process.connected) process.send({ error: error.message }, () => { void close(); });
    else void close();
  });
}
