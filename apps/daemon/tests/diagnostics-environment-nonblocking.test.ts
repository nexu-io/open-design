import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { resolveSystemProxyEnv } from '@open-design/platform';
import { buildAutomaticDiagnosticSources } from '../src/diagnostics-export.js';

vi.mock('@open-design/platform', async importOriginal => ({
  ...await importOriginal<typeof import('@open-design/platform')>(),
  resolveSystemProxyEnv: vi.fn(() => ({})),
}));

afterEach(() => vi.clearAllMocks());

it('locates diagnostic log homes without synchronous OS proxy discovery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'od-diag-nonblocking-'));
  const codexHome = join(root, 'configured-codex');
  await mkdir(join(codexHome, 'log'), { recursive: true });
  await writeFile(join(codexHome, 'log', 'codex-tui.log'), '{"type":"event"}\n');
  await writeFile(join(root, 'app-config.json'), JSON.stringify({
    agentCliEnv: { codex: { CODEX_HOME: codexHome } },
  }));
  try {
    const sources = await buildAutomaticDiagnosticSources({ runtime: null, projectRoot: root, dataDir: root }, { agentId: '*' });
    expect(sources.some(source => source.absolutePath.startsWith(codexHome))).toBe(true);
    expect(resolveSystemProxyEnv).not.toHaveBeenCalled();
  } finally { await rm(root, { recursive: true, force: true }); }
});
