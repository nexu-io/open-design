import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ZCODE_BIN = '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs';
const describeIfLocalZcode =
  process.platform === 'darwin' && existsSync(ZCODE_BIN) ? describe : describe.skip;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function spawnZcodeAppServer(storageDir: string): ChildProcess {
  return spawn(ZCODE_BIN, ['app-server'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ZCODE_STORAGE_DIR: storageDir,
      ZCODE_SESSION_DB_PATH: path.join(storageDir, 'session.db'),
    },
  });
}

async function requestOnce(
  child: ChildProcess,
  payload: JsonRecord,
  timeoutMs = 10_000,
): Promise<JsonRecord> {
  return await new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const cleanup = () => {
      clearTimeout(timer);
      child.stdout?.off('data', onStdout);
      child.stderr?.off('data', onStderr);
      child.off('error', onError);
      child.off('close', onClose);
    };

    const finishWithError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const onStdout = (chunk: string | Buffer) => {
      stdout += String(chunk);
      const lines = stdout.split('\n');
      stdout = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (!isRecord(parsed)) continue;
        if (parsed.id !== payload.id) continue;

        if (isRecord(parsed.error)) {
          const message =
            typeof parsed.error.message === 'string'
              ? parsed.error.message
              : JSON.stringify(parsed.error);
          finishWithError(new Error(`zcode app-server returned error: ${message}`));
          return;
        }

        cleanup();
        resolve(parsed);
        return;
      }
    };

    const onStderr = (chunk: string | Buffer) => {
      stderr += String(chunk);
    };

    const onError = (err: Error) => {
      finishWithError(err);
    };

    const onClose = () => {
      finishWithError(
        new Error(`zcode app-server exited before responding. stderr: ${stderr}`),
      );
    };

    const timer = setTimeout(() => {
      finishWithError(
        new Error(`Timed out waiting for zcode app-server response. stderr: ${stderr}`),
      );
    }, timeoutMs);

    child.stdout?.on('data', onStdout);
    child.stderr?.on('data', onStderr);
    child.on('error', onError);
    child.on('close', onClose);

    child.stdin?.write(`${JSON.stringify(payload)}\n`);
  });
}

async function terminateChild(child: ChildProcess): Promise<void> {
  child.stdin?.end();
  if (child.exitCode !== null) return;
  if (!child.killed) child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    child.once('close', () => resolve());
    child.once('exit', () => resolve());
  });
}

describeIfLocalZcode('zcode app-server smoke', () => {
  it('responds to session/list with redirected storage', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'od-zcode-smoke-'));
    const storageDir = path.join(root, 'zcode');
    const child = spawnZcodeAppServer(storageDir);

    try {
      const response = await requestOnce(child, {
        id: '1',
        method: 'session/list',
        params: {},
      });

      expect(response.id).toBe('1');
      expect(isRecord(response.result)).toBe(true);
      expect(Array.isArray((response.result as JsonRecord).sessions)).toBe(true);
    } finally {
      await terminateChild(child);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
