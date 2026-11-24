import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fetchVelaRemoteModelsWithRetry } from '../src/runtimes/defs/amr.js';

const tmpDirs: string[] = [];

function writeFakeVela(dirName: string, stderr: string): { bin: string; countFile: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), dirName));
  tmpDirs.push(dir);
  const bin = path.join(dir, 'vela');
  const countFile = path.join(dir, 'attempts');
  fs.writeFileSync(
    bin,
    `#!/bin/sh\necho x >> "${countFile}"\necho "${stderr}" >&2\nexit 2\n`,
  );
  fs.chmodSync(bin, 0o755);
  return { bin, countFile };
}

function attempts(countFile: string): number {
  return fs.readFileSync(countFile, 'utf8').trim().split('\n').length;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('fetchVelaRemoteModelsWithRetry', () => {
  it('does not retry a usage error just because the binary path contains a retriable token (#9574)', async () => {
    // The install path carries '503' — a string the retriable classifier used
    // to match inside `Command failed: <path>` — but the process output is a
    // non-transient usage error, so a single attempt must suffice.
    const { bin, countFile } = writeFakeVela('vela-cli-503-', 'usage error: unknown flag');

    await expect(fetchVelaRemoteModelsWithRetry(bin, {})).rejects.toThrow();
    expect(attempts(countFile)).toBe(1);
  });

  it('still retries a transient failure reported by the process output', async () => {
    const { bin, countFile } = writeFakeVela('vela-cli-', '503 service temporarily unavailable');

    await expect(fetchVelaRemoteModelsWithRetry(bin, {})).rejects.toThrow();
    expect(attempts(countFile)).toBe(3);
  });
});
