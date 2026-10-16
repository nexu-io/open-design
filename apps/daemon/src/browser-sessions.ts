import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BrowserCdpPage } from './browser-cdp.js';
import type { BrowserNetworkPolicy } from './browser-network-policy.js';
import { createBrowserNetworkProxy, type BrowserNetworkProxy } from './browser-network-proxy.js';

const STARTUP_TIMEOUT_MS = 15_000;
const SHUTDOWN_GRACE_MS = 2_000;
const FORCED_SHUTDOWN_WAIT_MS = 2_000;

export interface BrowserSessionView {
  id: string;
}

export interface BrowserPageView {
  id: string;
  url: string;
}

interface BrowserSession extends BrowserSessionView {
  browserHttpBase: string;
  child: ChildProcess;
  networkProxy: BrowserNetworkProxy;
  pages: Map<string, BrowserCdpPage>;
  profileDir: string;
  projectId: string;
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

type RemoveDirectory = (path: string, options: { force: true; recursive: true }) => Promise<void>;

export async function removeBrowserProfile(
  profileDir: string,
  remove: RemoveDirectory = fs.promises.rm,
  delay: (timeoutMs: number) => Promise<void> = (timeoutMs) => new Promise((resolve) => setTimeout(resolve, timeoutMs)),
): Promise<void> {
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      await remove(profileDir, { force: true, recursive: true });
      return;
    } catch (error) {
      if (attempt === 6) throw error;
      // Antivirus and Chromium child processes can briefly retain handles on
      // Windows after the parent exits. Retry with a small bounded backoff.
      await delay(100 * (attempt + 1));
    }
  }
}

export async function terminateBrowserProcess(
  child: ChildProcess,
  profileDir: string,
  removeProfile: (profileDir: string) => Promise<void> = removeBrowserProfile,
  wait = { forcedMs: FORCED_SHUTDOWN_WAIT_MS, gracefulMs: SHUTDOWN_GRACE_MS },
): Promise<void> {
  if (child.exitCode == null && child.signalCode == null) {
    child.kill('SIGTERM');
    await waitForExit(child, wait.gracefulMs);
    if (child.exitCode == null && child.signalCode == null) {
      child.kill('SIGKILL');
      // Windows keeps the profile locked until the process has actually
      // exited. Never race recursive deletion against a still-live browser.
      await waitForExit(child, wait.forcedMs);
    }
  }
  await removeProfile(profileDir);
}

export interface BrowserSessionServiceOptions extends BrowserNetworkPolicy {
  removeProfile?: (profileDir: string) => Promise<void>;
}

export function createBrowserSessionService(options: BrowserSessionServiceOptions = {}) {
  const sessions = new Map<string, BrowserSession>();

  const sessionForProject = (projectId: string, id: string): BrowserSession | null => {
    const session = sessions.get(id);
    return session?.projectId === projectId ? session : null;
  };

  const close = async (projectId: string, id: string): Promise<boolean> => {
    const session = sessionForProject(projectId, id);
    if (!session) return false;
    sessions.delete(id);
    if (session.closing) return true;
    session.closing = true;
    await Promise.allSettled([...session.pages.values()].map((page) => page.close()));
    session.pages.clear();
    try {
      await terminateBrowserProcess(session.child, session.profileDir, options.removeProfile);
    } finally {
      await session.networkProxy.close();
    }
    return true;
  };

  const create = async (projectId: string): Promise<BrowserSessionView> => {
    const executablePath = findBrowserExecutable();
    if (!executablePath) {
      throw new Error(
        'No compatible Chrome, Edge, or Chromium executable is available. '
        + 'Install a system browser or set OD_BROWSER_EXECUTABLE_PATH.',
      );
    }
    const id = randomUUID();
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-browser-session-'));
    const networkProxy = await createBrowserNetworkProxy(options);
    const child = spawn(executablePath, [
      '--headless=new',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      `--proxy-server=http://127.0.0.1:${networkProxy.port}`,
      '--proxy-bypass-list=<-loopback>',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-quic',
      '--disable-sync',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
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
    }).catch(async (error) => {
      try {
        await terminateBrowserProcess(child, profileDir, options.removeProfile);
      } finally {
        await networkProxy.close();
      }
      throw error;
    });

    const socket = new URL(websocketUrl);
    const session: BrowserSession = {
      browserHttpBase: `http://${socket.host}`,
      child,
      closing: false,
      id,
      networkProxy,
      pages: new Map(),
      profileDir,
      projectId,
    };
    sessions.set(id, session);
    child.once('exit', () => {
      if (!session.closing) {
        sessions.delete(id);
        void Promise.all([...session.pages.values()].map((page) => page.close()))
          .then(() => Promise.all([
            (options.removeProfile ?? removeBrowserProfile)(profileDir),
            networkProxy.close(),
          ]))
          .catch((error) => console.warn('[od] failed to clean browser session profile:', error));
      }
    });
    return { id };
  };

  const createPage = async (projectId: string, sessionId: string): Promise<BrowserPageView | null> => {
    const session = sessionForProject(projectId, sessionId);
    if (!session || session.closing) return null;
    const response = await fetch(`${session.browserHttpBase}/json/new?${encodeURIComponent('about:blank')}`, {
      method: 'PUT',
    });
    if (!response.ok) throw new Error(`Chrome target creation failed: HTTP ${response.status}`);
    const target = await response.json() as { id?: unknown; url?: unknown; webSocketDebuggerUrl?: unknown };
    if (typeof target.id !== 'string' || typeof target.webSocketDebuggerUrl !== 'string') {
      throw new Error('Chrome returned an invalid target');
    }
    let page: BrowserCdpPage;
    try {
      page = await BrowserCdpPage.connect(target.id, target.webSocketDebuggerUrl, options);
    } catch (error) {
      await fetch(`${session.browserHttpBase}/json/close/${encodeURIComponent(target.id)}`).catch(() => undefined);
      throw error;
    }
    session.pages.set(target.id, page);
    return { id: target.id, url: typeof target.url === 'string' ? target.url : 'about:blank' };
  };

  const command = async (
    projectId: string,
    sessionId: string,
    pageId: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> => {
    const page = sessionForProject(projectId, sessionId)?.pages.get(pageId);
    return page ? page.command(method, params) : null;
  };

  const events = async (
    projectId: string,
    sessionId: string,
    pageId: string,
    after: number,
    timeoutMs: number,
  ) => {
    const page = sessionForProject(projectId, sessionId)?.pages.get(pageId);
    return page ? page.eventsAfter(after, timeoutMs) : null;
  };

  const closePage = async (projectId: string, sessionId: string, pageId: string): Promise<boolean> => {
    const session = sessionForProject(projectId, sessionId);
    const page = session?.pages.get(pageId);
    if (!session || !page) return false;
    session.pages.delete(pageId);
    await page.close();
    await fetch(`${session.browserHttpBase}/json/close/${encodeURIComponent(pageId)}`).catch(() => undefined);
    return true;
  };

  const shutdownActive = async (): Promise<void> => {
    await Promise.all([...sessions.values()].map((session) => close(session.projectId, session.id)));
  };

  return { close, closePage, command, create, createPage, events, shutdownActive };
}

export type BrowserSessionService = ReturnType<typeof createBrowserSessionService>;
