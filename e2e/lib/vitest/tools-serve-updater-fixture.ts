import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { once } from 'node:events';
import type { Readable } from 'node:stream';

import type { ReleaseChannel } from '@open-design/release';

export type ToolsServeUpdaterFixture = {
  close: () => Promise<void>;
  info: {
    metadataUrl: string;
    payloadPath: string | null;
    payloadSha256: string | null;
    payloadUrl: string | null;
    version: string;
  };
};

export async function startToolsServeUpdaterFixture(options: {
  channel: ReleaseChannel;
  payloadPath: string;
  platform: 'mac' | 'win';
  version: string;
  workspaceRoot: string;
}): Promise<ToolsServeUpdaterFixture> {
  const pnpmArgs = [
    '--silent',
    'exec',
    'tools-serve',
    'start',
    'updater',
    '--json',
    '--channel',
    options.channel,
    '--version',
    options.version,
    '--platform',
    options.platform,
    '--include-payload',
    '--payload-path',
    options.payloadPath,
  ];
  const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm.cmd', ...pnpmArgs] : pnpmArgs;
  const child = spawn(command, args, {
    cwd: options.workspaceRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const stderrChunks: Buffer[] = [];
  child.stderr.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });

  try {
    const info = await readStartupInfo(child, stderrChunks);
    return {
      close: () => closeChild(child),
      info,
    };
  } catch (error) {
    await closeChild(child).catch(() => undefined);
    throw error;
  }
}

type ToolsServeChild = ChildProcessByStdio<null, Readable, Readable>;

async function readStartupInfo(
  child: ToolsServeChild,
  stderrChunks: Buffer[],
): Promise<ToolsServeUpdaterFixture['info']> {
  const stdoutLines: string[] = [];
  let stdoutBuffer = '';
  const startup = new Promise<ToolsServeUpdaterFixture['info']>((resolveStartup, rejectStartup) => {
    const timeout = setTimeout(() => {
      rejectStartup(new Error(`tools-serve updater fixture did not start within 10000ms${formatStderr(stderrChunks)}`));
    }, 10000);

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off('data', onStdout);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    const onStdout = (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf8');
      let newline = stdoutBuffer.indexOf('\n');
      while (newline >= 0) {
        const line = stdoutBuffer.slice(0, newline).trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (line.length === 0) {
          newline = stdoutBuffer.indexOf('\n');
          continue;
        }
        stdoutLines.push(line);
        try {
          const parsed = parseInfo(line);
          cleanup();
          resolveStartup(parsed);
          return;
        } catch (error) {
          cleanup();
          rejectStartup(error);
          return;
        }
        newline = stdoutBuffer.indexOf('\n');
      }
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      rejectStartup(new Error(
        `tools-serve updater fixture exited before startup code=${String(code)} signal=${String(signal)} stdout=${stdoutLines.join('\\n')}${formatStderr(stderrChunks)}`,
      ));
    };
    const onError = (error: Error) => {
      cleanup();
      rejectStartup(error);
    };

    child.stdout.on('data', onStdout);
    child.once('exit', onExit);
    child.once('error', onError);
  });
  return startup;
}

function parseInfo(line: string): ToolsServeUpdaterFixture['info'] {
  const parsed = JSON.parse(line) as Partial<ToolsServeUpdaterFixture['info']>;
  if (typeof parsed.metadataUrl !== 'string' || parsed.metadataUrl.length === 0) {
    throw new Error(`tools-serve updater fixture did not print metadataUrl: ${line}`);
  }
  if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
    throw new Error(`tools-serve updater fixture did not print version: ${line}`);
  }
  return {
    metadataUrl: parsed.metadataUrl,
    payloadPath: typeof parsed.payloadPath === 'string' ? parsed.payloadPath : null,
    payloadSha256: typeof parsed.payloadSha256 === 'string' ? parsed.payloadSha256 : null,
    payloadUrl: typeof parsed.payloadUrl === 'string' ? parsed.payloadUrl : null,
    version: parsed.version,
  };
}

async function closeChild(child: ToolsServeChild): Promise<void> {
  if (child.exitCode != null || child.killed) return;
  if (process.platform === 'win32' && child.pid != null) {
    const taskkill = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    await once(taskkill, 'exit').then(() => undefined, () => undefined);
    return;
  }
  child.kill();
  await once(child, 'exit').then(() => undefined, () => undefined);
}

function formatStderr(chunks: Buffer[]): string {
  const stderr = Buffer.concat(chunks).toString('utf8').trim();
  return stderr.length === 0 ? '' : ` stderr=${stderr}`;
}
