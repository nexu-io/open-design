import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STARTUP_TIMEOUT_MS = 15_000;
const SHUTDOWN_GRACE_MS = 2_000;

export interface BrowserSessionView {
  id: string;
  websocketUrl: string;
}

interface BrowserSession extends BrowserSessionView {
  child: ChildProcess;
  profileDir: string;
  closing: boolean;
}

function firstExisting(candidates: Array<string | undefined>): string | null {
  return candidates.find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate))) ?? null;
}

function executableFromPath(names: string[]): string | null {
  const pathValue = process.env.PATH || process.env.Path || '';
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
    : [''];
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      for (const extension of extensions) {
        const candidate = path.join(directory, `${name}${extension}`);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

export function findBrowserExecutable(): string | null {
  const configured = process.env.OD_BROWSER_EXECUTABLE_PATH;
  if (configured) return fs.existsSync(configured) ? configured : null;
  if (process.platform === 'darwin') {
    return firstExisting([
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      path.join(os.homedir(), 'Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
    ]);
  }
  if (process.platform === 'win32') {
    const roots = [
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
      process.env.LOCALAPPDATA,
    ].filter((value): value is string => Boolean(value));
    return firstExisting(roots.flatMap((root) => [
      path.join(root, 'Google/Chrome/Application/chrome.exe'),
      path.join(root, 'Microsoft/Edge/Application/msedge.exe'),
      path.join(root, 'Chromium/Application/chrome.exe'),
    ]));
  }
  return executableFromPath([
    'google-chrome-stable',
    'google-chrome',
    'microsoft-edge-stable',
    'microsoft-edge',
    'chromium',
    'chromium-browser',
  ]);
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode != null || child.signalCode != null) return Promise.resolve();
  return Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export function createBrowserSessionService() {
  const sessions = new Map<string, BrowserSession>();

  const close = async (id: string): Promise<boolean> => {
    const session = sessions.get(id);
    if (!session) return false;
    sessions.delete(id);
    if (session.closing) return true;
    session.closing = true;
    if (session.child.exitCode == null && session.child.signalCode == null) {
      session.child.kill('SIGTERM');
      await waitForExit(session.child, SHUTDOWN_GRACE_MS);
      if (session.child.exitCode == null && session.child.signalCode == null) {
        session.child.kill('SIGKILL');
      }
    }
    fs.rmSync(session.profileDir, { recursive: true, force: true });
    return true;
  };

  const create = async (): Promise<BrowserSessionView> => {
    const executablePath = findBrowserExecutable();
    if (!executablePath) {
      throw new Error(
        'No compatible Chrome, Edge, or Chromium executable is available. '
        + 'Install a system browser or set OD_BROWSER_EXECUTABLE_PATH.',
      );
    }
    const id = randomUUID();
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-browser-session-'));
    const child = spawn(executablePath, [
      '--headless=new',
      '--remote-debugging-port=0',
      '--remote-allow-origins=*',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-sync',
      '--metrics-recording-only',
      'about:blank',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let output = '';
    const websocketUrl = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('system browser startup timed out')), STARTUP_TIMEOUT_MS);
      timer.unref?.();
      const finish = (callback: () => void) => {
        clearTimeout(timer);
        child.stdout?.off('data', inspect);
        child.stderr?.off('data', inspect);
        child.off('error', onError);
        child.off('exit', onExit);
        callback();
      };
      const inspect = (chunk: Buffer | string) => {
        output = `${output}${String(chunk)}`.slice(-16_384);
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        const discoveredUrl = match?.[1];
        if (discoveredUrl) finish(() => resolve(discoveredUrl));
      };
      const onError = (error: Error) => finish(() => reject(error));
      const onExit = (code: number | null, signal: NodeJS.Signals | null) => finish(() => reject(
        new Error(`system browser exited before CDP was ready (code ${code}, signal ${signal})\n${output}`),
      ));
      child.stdout?.on('data', inspect);
      child.stderr?.on('data', inspect);
      child.once('error', onError);
      child.once('exit', onExit);
    }).catch((error) => {
      child.kill('SIGKILL');
      fs.rmSync(profileDir, { recursive: true, force: true });
      throw error;
    });

    const session: BrowserSession = { id, websocketUrl, child, profileDir, closing: false };
    sessions.set(id, session);
    child.once('exit', () => {
      if (!session.closing) {
        sessions.delete(id);
        fs.rmSync(profileDir, { recursive: true, force: true });
      }
    });
    return { id, websocketUrl };
  };

  const shutdownActive = async (): Promise<void> => {
    await Promise.all([...sessions.keys()].map((id) => close(id)));
  };

  return { create, close, shutdownActive };
}

export type BrowserSessionService = ReturnType<typeof createBrowserSessionService>;
