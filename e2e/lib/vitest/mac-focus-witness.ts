import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const applicationAsnPattern = /ASN:0x[0-9a-f]+-0x[0-9a-f]+:/iu;

export type MacFocusWitnessSnapshot = {
  applications: Array<{ appPath: string; asn: string | null; pid: number }>;
  eventLogPath: string;
  frontmostEvents: number;
};

export class MacFocusWitness {
  readonly #applications = new Map<number, { appPath: string; asn: string | null; pid: number }>();
  readonly #bundlePaths = new Set<string>();
  readonly #chunks: Buffer[] = [];
  readonly #eventLogPath: string;
  #listener: ChildProcess | null = null;

  constructor(outputRoot: string) {
    this.#eventLogPath = join(outputRoot, 'focus', 'mac-frontmost-events.log');
  }

  async start(): Promise<void> {
    if (this.#listener != null) return;
    const listener = spawn('/usr/bin/lsappinfo', ['listen', '+becameFrontmost', 'forever'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.#listener = listener;
    listener.stdout?.on('data', (chunk: Buffer) => this.#chunks.push(chunk));
    listener.stderr?.on('data', (chunk: Buffer) => this.#chunks.push(chunk));
    await new Promise<void>((resolveStart, rejectStart) => {
      listener.once('error', rejectStart);
      listener.once('spawn', resolveStart);
    });
    // `spawn` confirms the process exists; give LaunchServices one turn to
    // register the notification listener before the first packaged launch.
    await delay(50);
  }

  async track(input: { appPath: string; pid: number }): Promise<void> {
    await this.start();
    if (!this.#bundlePaths.has(input.appPath)) {
      await assertBackgroundAgentBundle(input.appPath);
      this.#bundlePaths.add(input.appPath);
    }
    const asn = await resolveApplicationAsn(input.pid);
    if (asn != null) await assertUiElementProcess(input.pid);
    this.#applications.set(input.pid, { ...input, asn });
    await this.assertNeverFrontmost();
  }

  async assertNeverFrontmost(): Promise<void> {
    await delay(25);
    const events = this.#eventLog();
    const activated = [...this.#applications.values()].filter(
      ({ asn }) => asn != null && events.includes(asn),
    );
    const frontmostPid = await resolveFrontmostPid();
    if (frontmostPid != null && this.#applications.has(frontmostPid)) {
      throw new Error(`headless packaged pid ${frontmostPid} is currently frontmost`);
    }
    if (activated.length > 0) {
      throw new Error(
        `headless packaged app became frontmost: ${activated.map(({ asn, pid }) => `${asn} pid=${pid}`).join(', ')}`,
      );
    }
  }

  snapshot(): MacFocusWitnessSnapshot {
    return {
      applications: [...this.#applications.values()],
      eventLogPath: this.#eventLogPath,
      frontmostEvents: this.#eventLog().match(/becameFrontmost/gu)?.length ?? 0,
    };
  }

  async stop(): Promise<void> {
    const listener = this.#listener;
    this.#listener = null;
    if (listener != null && listener.exitCode == null && listener.signalCode == null) {
      listener.kill('SIGTERM');
      await Promise.race([
        new Promise<void>((resolveExit) => listener.once('exit', () => resolveExit())),
        delay(1_000),
      ]);
    }
    await mkdir(dirname(this.#eventLogPath), { recursive: true });
    await writeFile(this.#eventLogPath, this.#eventLog(), 'utf8');
  }

  #eventLog(): string {
    return Buffer.concat(this.#chunks).toString('utf8');
  }
}

async function assertBackgroundAgentBundle(appPath: string): Promise<void> {
  const plistPath = join(appPath, 'Contents', 'Info.plist');
  const { stdout } = await execFileAsync('/usr/bin/plutil', [
    '-extract',
    'LSUIElement',
    'raw',
    '-o',
    '-',
    plistPath,
  ]);
  if (stdout.trim() !== 'true') {
    throw new Error(`headless packaged app must declare LSUIElement=true: ${plistPath}`);
  }
}

async function resolveApplicationAsn(pid: number): Promise<string | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { stdout } = await execFileAsync('/usr/bin/lsappinfo', ['find', `pid=${pid}`]);
    const asn = stdout.match(applicationAsnPattern)?.[0];
    if (asn != null) return asn;
    await delay(25);
  }
  return null;
}

async function resolveFrontmostPid(): Promise<number | null> {
  const { stdout: front } = await execFileAsync('/usr/bin/lsappinfo', ['front']);
  const asn = front.match(applicationAsnPattern)?.[0];
  if (asn == null) return null;
  const { stdout: info } = await execFileAsync('/usr/bin/lsappinfo', [
    'info',
    '-only',
    'pid',
    '-app',
    asn,
  ]);
  const pid = /"pid"=(\d+)/u.exec(info)?.[1];
  return pid == null ? null : Number.parseInt(pid, 10);
}

async function assertUiElementProcess(pid: number): Promise<void> {
  await retryLaunchServices(async () => {
    const { stdout } = await execFileAsync('/usr/bin/lsappinfo', [
      'info',
      '-only',
      'ApplicationType',
      '-app',
      `#${pid}`,
    ]);
    if (!stdout.includes('"ApplicationType"="UIElement"')) {
      throw new Error(`headless packaged pid ${pid} is not a LaunchServices UIElement: ${stdout.trim()}`);
    }
  });
}

async function retryLaunchServices<T>(task: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      await delay(50);
    }
  }
  throw lastError;
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, ms));
}
