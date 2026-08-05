import { describe, expect, it } from 'vitest';
import { execFileBuffered } from '../../src/runtimes/child-process.js';

describe('child-process boundary', () => {
  it('returns trimmed output and a successful result', async () => {
    const result = await execFileBuffered(process.execPath, [
      '-e',
      "process.stdout.write('  ready\\n'); process.stderr.write('  note\\n')",
    ]);

    expect(result).toMatchObject({
      ok: true,
      stdout: 'ready',
      stderr: 'note',
    });
    expect(result.error).toBeUndefined();
  });

  it('captures non-zero command status without rejecting', async () => {
    const result = await execFileBuffered(process.execPath, [
      '-e',
      "process.stderr.write('bad\\n'); process.exit(7)",
    ]);

    expect(result.ok).toBe(false);
    expect(result.code).toBe(7);
    expect(result.stderr).toBe('bad');
    expect(result.error).toBeDefined();
  });
});
