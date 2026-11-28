import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAgentFileMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/runtimes/invocation.js', () => ({
  execAgentFile: execAgentFileMock,
}));

import { createOpenCodeSanitizedExportLoader } from '../../src/runtimes/opencode-child-evidence.js';

const CHILD = 'ses_child_v2x';

// The sanitized child export is the only OpenCode surface that emits a child
// transcript with its parentID. The command moved between CLI generations:
// 1.x exposed it as top-level `export <id> --sanitize --pure`; 2.x nests it
// under `session export <id> --sanitize` and has no `--pure`.
describe('opencode sanitized child export argv by CLI generation', () => {
  beforeEach(() => {
    execAgentFileMock.mockReset();
    execAgentFileMock.mockResolvedValue({ stdout: '{}' });
  });

  it('legacy (default, no version supplied): `export <id> --sanitize --pure`', async () => {
    const load = createOpenCodeSanitizedExportLoader({ launchPath: 'opencode', env: {} });
    await load(CHILD);
    expect(execAgentFileMock.mock.calls[0]![1]).toEqual(['export', CHILD, '--sanitize', '--pure']);
  });

  it('v2 (cliVersion >= 2): `session export <id> --sanitize`', async () => {
    const load = createOpenCodeSanitizedExportLoader({
      launchPath: 'opencode',
      env: {},
      cliVersion: '2.4.2',
    });
    await load(CHILD);
    expect(execAgentFileMock.mock.calls[0]![1]).toEqual(['session', 'export', CHILD, '--sanitize']);
  });

  it('v1 explicit version keeps the legacy argv', async () => {
    const load = createOpenCodeSanitizedExportLoader({
      launchPath: 'opencode',
      env: {},
      cliVersion: '1.18.18',
    });
    await load(CHILD);
    expect(execAgentFileMock.mock.calls[0]![1]).toEqual(['export', CHILD, '--sanitize', '--pure']);
  });
});
