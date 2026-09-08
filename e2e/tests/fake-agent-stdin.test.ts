import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, test } from 'vitest';

import { createFakeAgentRuntimes } from '@/fake-agents';

test('fake OpenCode waits for the complete text prompt across delayed stdin chunks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'od-fake-stdin-'));
  try {
    const runtimes = await createFakeAgentRuntimes({ root, runtimeIds: ['opencode'] });
    const child = spawn(process.execPath, [runtimes.opencode.bin], {
      cwd: root, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdin.on('error', () => {}); // Preserve the assertion if a broken fixture exits before EOF.
    const closed = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    child.stdin.write('od-next-adaptive-v1\n');
    await delay(500);
    child.stdin.end('Only plan the OD Next canary; do not create the artifact');
    expect(await closed, stderr).toBe(0);
    expect(stdout).toContain('Plan only: establish the requested layout');
    expect(stdout).toContain('deliveryKind');
    expect(stdout).not.toContain('Fake Agent Runtime opencode');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
