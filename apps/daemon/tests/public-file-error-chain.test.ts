import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPinnedVelaCommand } from '../src/collab/vela-pinned-command.js';
import { publishVelaShareVersion } from '../src/collab/vela-share-publish.js';
import { classifyVelaCommandFailure } from '../src/collab/public-file-failure.js';
import type { runVelaCommand } from '../src/integrations/vela-command.js';

const io = vi.hoisted(() => ({ mkdtemp: vi.fn(), readdir: vi.fn(), writeFile: vi.fn(), rm: vi.fn() }));
vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(), ...io,
}));
const input = { filePath: 'index.html', workspaceId: 'workspace', projectId: 'project', resourceId: 'resource', slug: 'stable', sourceKey: 'source', entryPath: 'index.html', name: 'Synthetic', versionId: 'version' };
const receipt = { slug: 'stable', version: 1, publishedAt: 1234, entryPath: 'index.html', versionId: 'version' };
const wire = { ...receipt, status: 'published', snapshot: { versionId: 'version' }, receipt };
const session = { profile: 'test' as const, apiUrl: 'https://synthetic.invalid', controlKey: 'synthetic-private-key', user: null, configMtimeMs: null };
function prepared(run: typeof runVelaCommand): typeof runVelaCommand {
  return args => runPinnedVelaCommand({ args, session, dataRoot: '/synthetic-root', workspaceId: 'workspace' }, run);
}
async function failure(run: typeof runVelaCommand): Promise<unknown> {
  return publishVelaShareVersion(input, prepared(run)).catch((error: unknown) => error);
}
function expectSafe(error: unknown) {
  expect(error).toBeInstanceOf(Error);
  expect(String(error)).toBe('Error: PUBLIC_SHARE_PUBLISH_FAILED');
  const serialized = JSON.stringify(error);
  for (const text of ['synthetic-private-key', 'private-body', 'private-name', 'private-output', 'synthetic-root']) {
    expect(serialized).not.toContain(text);
  }
  expect(error).not.toHaveProperty('cause');
  expect(error).not.toHaveProperty('stderr');
  expect(error).not.toHaveProperty('stdout');
}
beforeEach(() => {
  vi.resetAllMocks();
  io.readdir.mockResolvedValue([]);
  io.mkdtemp.mockResolvedValue('/synthetic-root/session');
  io.writeFile.mockResolvedValue(undefined);
  io.rm.mockResolvedValue(undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('OPEND-3796: safe failure detail through pinned and publish boundaries', () => {
  it.each([
    ['network', { stderr: 'connection reset by peer private-body' }, { reason: 'network' }],
    ['timeout', { code: 'ETIMEDOUT' }, { reason: 'timeout' }],
    ['aborted', { code: 'ABORT_ERR' }, { reason: 'aborted' }],
    ['HTTP JSON', { stderr: JSON.stringify({ error: 'API request failed with status 409: share_binding_stopped', errorCode: 'share_binding_stopped', status: 409, body: 'private-body' }) }, { reason: 'upstream_http', upstreamStatus: 409, upstreamCode: 'share_binding_stopped' }],
    ['unknown', { stderr: 'private-body' }, { reason: 'unknown' }],
  ])('preserves %s without raw diagnostics or retry', async (_name, detail, expected) => {
    const run = vi.fn<typeof runVelaCommand>().mockRejectedValue(Object.assign(new Error('private-name'), { stdout: 'private-output', ...detail }));
    const error = await failure(run);
    expect(classifyVelaCommandFailure('snapshot', error)).toEqual({ stage: 'snapshot', ...expected });
    expectSafe(error);
    expect(run).toHaveBeenCalledTimes(1);
    expect(io.rm).toHaveBeenCalledTimes(1);
  });

  it('distinguishes session preparation failure before the CLI starts', async () => {
    io.writeFile.mockRejectedValue(Object.assign(new Error('synthetic-private-key'), { code: 'ENOENT' }));
    const run = vi.fn<typeof runVelaCommand>();
    const error = await failure(run);
    expect(classifyVelaCommandFailure('snapshot', error)).toEqual({ stage: 'snapshot', reason: 'session_setup' });
    expect(run).not.toHaveBeenCalled();
    expectSafe(error);
  });

  it('marks failed cleanup after a valid CLI receipt as unconfirmed, not a network failure', async () => {
    io.rm.mockRejectedValue(new Error('synthetic-private-key'));
    const run = vi.fn<typeof runVelaCommand>().mockResolvedValue(JSON.stringify(wire));
    const error = await failure(run);
    expect(classifyVelaCommandFailure('snapshot', error)).toEqual({ stage: 'snapshot', reason: 'session_cleanup' });
    expectSafe(error);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not replace the primary command failure when cleanup also fails', async () => {
    io.rm.mockRejectedValue(new Error('synthetic-private-key'));
    const run = vi.fn<typeof runVelaCommand>().mockRejectedValue(Object.assign(new Error('private-name'), { stderr: 'connection reset by peer' }));
    const error = await failure(run);
    expect(classifyVelaCommandFailure('snapshot', error)).toEqual({ stage: 'snapshot', reason: 'network' });
    expectSafe(error);
    expect(console.warn).toHaveBeenCalledWith('[od] pinned Vela session cleanup failed');
  });

  it.each(['{', '{}', JSON.stringify({ ...wire, receipt: { ...receipt, versionId: 'wrong' } })])('distinguishes malformed and mismatched receipts: %s', async stdout => {
    const run = vi.fn<typeof runVelaCommand>().mockResolvedValue(stdout);
    const error = await failure(run);
    expect(classifyVelaCommandFailure('snapshot', error)).toEqual({ stage: 'snapshot', reason: 'invalid_receipt' });
    expectSafe(error);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retains the successful path and session cleanup', async () => {
    const run = vi.fn<typeof runVelaCommand>().mockResolvedValue(JSON.stringify(wire));
    expect(await publishVelaShareVersion(input, prepared(run))).toEqual({ status: 'published', receipt: { ...receipt, filePath: input.filePath } });
    expect(io.rm).toHaveBeenCalledTimes(1);
  });
});
