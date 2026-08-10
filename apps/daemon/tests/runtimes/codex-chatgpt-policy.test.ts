import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { inspectCodexChatGptRoutePolicy } from '../../src/runtimes/auth.js';

type StrictPolicy = {
  allowed: boolean;
  providerEnvKey: string | null;
  reason: 'custom_provider_not_allowed' | 'config_inspection_failed' | null;
};

const inspectPolicy = inspectCodexChatGptRoutePolicy as unknown as (
  env: NodeJS.ProcessEnv,
  effectiveCwd?: string | null,
) => Promise<StrictPolicy>;

describe('strict ChatGPT Codex config policy', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ));
  });

  it.each([
    ['custom provider', 'model_provider = "local-gateway"\n'],
    ['custom endpoint', 'openai_base_url = "https://example.invalid/v1"\n'],
  ])('rejects a project %s from the effective child cwd', async (_label, content) => {
    const root = await makeTempDir();
    const codexHome = path.join(root, 'codex-home');
    const projectRoot = path.join(root, 'repo');
    await mkdir(path.join(codexHome), { recursive: true });
    await mkdir(path.join(projectRoot, '.git'), { recursive: true });
    await mkdir(path.join(projectRoot, '.codex'), { recursive: true });
    await writeFile(path.join(projectRoot, '.codex', 'config.toml'), content, 'utf8');

    await expect(inspectPolicy(isolatedEnv(codexHome, root), projectRoot)).resolves.toMatchObject({
      allowed: false,
      reason: 'custom_provider_not_allowed',
    });
  });

  it('rejects a managed endpoint overlay', async () => {
    const root = await makeTempDir();
    const codexHome = path.join(root, 'codex-home');
    await mkdir(codexHome, { recursive: true });
    await writeFile(
      path.join(codexHome, 'managed_config.toml'),
      'chatgpt_base_url = "https://managed.example.invalid/backend-api/codex"\n',
      'utf8',
    );

    await expect(inspectPolicy(isolatedEnv(codexHome, root))).resolves.toMatchObject({
      allowed: false,
      reason: 'custom_provider_not_allowed',
    });
  });

  it('rejects a custom provider under a mixed-case Windows CODEX_HOME key', async () => {
    const root = await makeTempDir();
    const codexHome = path.join(root, 'codex-home');
    await mkdir(codexHome, { recursive: true });
    await writeFile(
      path.join(codexHome, 'config.toml'),
      'model_provider = "local-gateway"\n',
      'utf8',
    );

    await expect(inspectPolicy({
      Codex_Home: codexHome,
      PROGRAMDATA: path.join(root, 'program-data'),
    })).resolves.toMatchObject({
      allowed: false,
      reason: 'custom_provider_not_allowed',
    });
  });

  it('fails closed when an effective config layer cannot be read', async () => {
    const root = await makeTempDir();
    const codexHome = path.join(root, 'codex-home');
    await mkdir(path.join(codexHome, 'config.toml'), { recursive: true });

    await expect(inspectPolicy(isolatedEnv(codexHome, root))).resolves.toMatchObject({
      allowed: false,
      reason: 'config_inspection_failed',
    });
  });

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-codex-chatgpt-policy-'));
    tempDirs.push(dir);
    return dir;
  }
});

function isolatedEnv(codexHome: string, root: string): NodeJS.ProcessEnv {
  return {
    CODEX_HOME: codexHome,
    PROGRAMDATA: path.join(root, 'program-data'),
  };
}
