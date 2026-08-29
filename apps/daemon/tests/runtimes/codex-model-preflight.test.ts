import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  extractCodexRootModelConfig,
  parseStableCodexVersion,
  preflightCodexDefaultModel,
} from '../../src/runtimes/codex-model-preflight.js';

const { statPathFixtures } = vi.hoisted(() => ({
  statPathFixtures: new Map<string, string>(),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    stat: (filePath: Parameters<typeof actual.stat>[0]) =>
      actual.stat(statPathFixtures.get(String(filePath)) ?? filePath),
  };
});

describe('Codex model capability preflight', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    statPathFixtures.clear();
    await Promise.all(
      tempDirs.splice(0).map((dir) =>
        rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
      ),
    );
  });

  it('reads only root model settings and detects compatibility overlays', () => {
    expect(
      extractCodexRootModelConfig([
        'model = "gpt-5.6-terra" # active model',
        'model_provider = "openai"',
        'profile = "work"',
        'notes = "value # not a comment"',
        '[profiles.other]',
        'model = "gpt-5.4"',
      ].join('\n')),
    ).toEqual({
      model: 'gpt-5.6-terra',
      modelProvider: 'openai',
      hasCompatibilityOverlay: true,
    });

    expect(
      extractCodexRootModelConfig([
        'model = "gpt-5.6-terra"',
        'project_root_markers = [".hg", ".git"]',
      ].join('\n')).hasCompatibilityOverlay,
    ).toBe(true);

    expect(
      extractCodexRootModelConfig([
        'model = "gpt-5.6-terra"',
        '[model_providers.openai]',
        'base_url = "https://example.invalid/v1"',
      ].join('\n')).hasCompatibilityOverlay,
    ).toBe(true);

    expect(
      extractCodexRootModelConfig([
        '"model" = "gpt-5.6-terra"',
        '"chatgpt_base_url" = "https://chatgpt-proxy.example.invalid/backend-api/"',
      ].join('\n')),
    ).toEqual({
      model: 'gpt-5.6-terra',
      modelProvider: null,
      hasCompatibilityOverlay: true,
    });
  });

  it('accepts only stable Codex versions for the known boundary', () => {
    expect(parseStableCodexVersion('codex-cli 0.142.5')).toEqual({
      major: 0,
      minor: 142,
      patch: 5,
    });
    expect(parseStableCodexVersion('codex-cli 0.145.0-alpha.30')).toBeNull();
    expect(parseStableCodexVersion('codex-cli unknown')).toBeNull();
  });

  it('blocks the known-old stable CLI only with confirmed ChatGPT auth', async () => {
    const fixture = await createFixture({
      config: 'model = "gpt-5.6-terra"\n',
      version: 'codex-cli 0.142.5',
      loginStatus: 'Logged in using ChatGPT',
    });

    await expect(preflightCodexDefaultModel({
      launchPath: fixture.bin,
      env: cleanCodexEnv(fixture.codexHome),
      requestedModel: 'default',
      projectRoot: fixture.projectRoot,
    })).resolves.toEqual({
      status: 'incompatible',
      model: 'gpt-5.6-terra',
      cliVersion: 'codex-cli 0.142.5',
      requiredCliVersion: '0.143.0',
    });
  });

  it('fails open when a system config layer can override the endpoint', async () => {
    const fixture = await createFixture({
      config: 'model = "gpt-5.6-terra"\n',
      version: 'codex-cli 0.142.5',
      loginStatus: 'Logged in using ChatGPT',
    });
    const systemConfigFixture = path.join(
      path.dirname(fixture.codexHome),
      'system-config.toml',
    );
    await writeFile(
      systemConfigFixture,
      'openai_base_url = "https://system.example.invalid/v1"\n',
      'utf8',
    );
    statPathFixtures.set(codexSystemConfigPath(), systemConfigFixture);

    await expect(preflightCodexDefaultModel({
      launchPath: fixture.bin,
      env: cleanCodexEnv(fixture.codexHome),
      requestedModel: 'default',
      projectRoot: fixture.projectRoot,
    })).resolves.toEqual({
      status: 'unknown',
      reason: 'system_config',
    });
  });

  it('allows 0.143.0 even when no model catalog command exists', async () => {
    const fixture = await createFixture({
      config: 'model = "gpt-5.6-terra"\n',
      version: 'codex-cli 0.143.0',
    });

    await expect(preflightCodexDefaultModel({
      launchPath: fixture.bin,
      env: cleanCodexEnv(fixture.codexHome),
      requestedModel: null,
      projectRoot: fixture.projectRoot,
    })).resolves.toEqual({
      status: 'compatible',
      model: 'gpt-5.6-terra',
      cliVersion: 'codex-cli 0.143.0',
      requiredCliVersion: '0.143.0',
    });
  });

  it('fails open for explicit models, custom providers, and project config', async () => {
    await expect(preflightCodexDefaultModel({
      launchPath: '/path/that/does/not/exist',
      env: {},
      requestedModel: 'future-custom-model',
    })).resolves.toEqual({
      status: 'not_applicable',
      reason: 'explicit_model',
    });

    const customProvider = await createFixture({
      config: [
        'model = "deployment-name"',
        'model_provider = "azure"',
      ].join('\n'),
    });
    await expect(preflightCodexDefaultModel({
      launchPath: customProvider.bin,
      env: cleanCodexEnv(customProvider.codexHome),
      requestedModel: 'default',
      projectRoot: customProvider.projectRoot,
    })).resolves.toEqual({
      status: 'not_applicable',
      reason: 'custom_provider',
    });

    const projectConfig = await createFixture({
      config: 'model = "gpt-5.6-terra"\n',
    });
    await mkdir(path.join(projectConfig.projectRoot, '.codex'), { recursive: true });
    await writeFile(
      path.join(projectConfig.projectRoot, '.codex', 'config.toml'),
      'model = "project-model"\n',
      'utf8',
    );
    await expect(preflightCodexDefaultModel({
      launchPath: projectConfig.bin,
      env: cleanCodexEnv(projectConfig.codexHome),
      requestedModel: 'default',
      projectRoot: projectConfig.projectRoot,
    })).resolves.toEqual({
      status: 'unknown',
      reason: 'project_config',
    });

    const parentProjectConfig = await createFixture({
      config: 'model = "gpt-5.6-terra"\n',
    });
    const nestedCwd = path.join(parentProjectConfig.projectRoot, 'packages', 'app');
    await Promise.all([
      mkdir(path.join(parentProjectConfig.projectRoot, '.git'), { recursive: true }),
      mkdir(path.join(parentProjectConfig.projectRoot, '.codex'), { recursive: true }),
      mkdir(nestedCwd, { recursive: true }),
    ]);
    await writeFile(
      path.join(parentProjectConfig.projectRoot, '.codex', 'config.toml'),
      'model = "project-model"\n',
      'utf8',
    );
    await expect(preflightCodexDefaultModel({
      launchPath: parentProjectConfig.bin,
      env: cleanCodexEnv(parentProjectConfig.codexHome),
      requestedModel: 'default',
      projectRoot: nestedCwd,
    })).resolves.toEqual({
      status: 'unknown',
      reason: 'project_config',
    });
  });

  it.skipIf(process.platform === 'win32')(
    'resolves a symlinked project cwd before checking project config',
    async () => {
      const fixture = await createFixture({
        config: 'model = "gpt-5.6-terra"\n',
      });
      await Promise.all([
        mkdir(path.join(fixture.projectRoot, '.git'), { recursive: true }),
        mkdir(path.join(fixture.projectRoot, '.codex'), { recursive: true }),
      ]);
      await writeFile(
        path.join(fixture.projectRoot, '.codex', 'config.toml'),
        'model = "project-model"\n',
        'utf8',
      );
      const linkedProject = path.join(path.dirname(fixture.projectRoot), 'project-link');
      await symlink(fixture.projectRoot, linkedProject, 'dir');

      await expect(preflightCodexDefaultModel({
        launchPath: fixture.bin,
        env: cleanCodexEnv(fixture.codexHome),
        requestedModel: 'default',
        projectRoot: linkedProject,
      })).resolves.toEqual({
        status: 'unknown',
        reason: 'project_config',
      });
    },
  );

  it('fails open for config overlays, API auth, and unconfirmed ChatGPT auth', async () => {
    const overlay = await createFixture({
      config: [
        'model = "gpt-5.6-terra"',
        'openai_base_url = "https://example.invalid/v1"',
      ].join('\n'),
    });
    await expect(preflightCodexDefaultModel({
      launchPath: overlay.bin,
      env: cleanCodexEnv(overlay.codexHome),
      requestedModel: 'default',
      projectRoot: overlay.projectRoot,
    })).resolves.toEqual({
      status: 'unknown',
      reason: 'config_overlay',
    });

    const apiAuth = await createFixture({
      config: 'model = "gpt-5.6-terra"\n',
    });
    await expect(preflightCodexDefaultModel({
      launchPath: apiAuth.bin,
      env: {
        ...cleanCodexEnv(apiAuth.codexHome),
        OpenAI_Api_Key: 'test-only-key',
      },
      requestedModel: 'default',
      projectRoot: apiAuth.projectRoot,
    })).resolves.toEqual({
      status: 'unknown',
      reason: 'auth_override',
    });

    const noChatGpt = await createFixture({
      config: 'model = "gpt-5.6-terra"\n',
      version: 'codex-cli 0.142.5',
      loginStatus: 'Not logged in',
    });
    await expect(preflightCodexDefaultModel({
      launchPath: noChatGpt.bin,
      env: cleanCodexEnv(noChatGpt.codexHome),
      requestedModel: 'default',
      projectRoot: noChatGpt.projectRoot,
    })).resolves.toEqual({
      status: 'unknown',
      reason: 'auth_unconfirmed',
    });

    const managed = await createFixture({
      config: 'model = "gpt-5.6-terra"\n',
      version: 'codex-cli 0.142.5',
    });
    await writeFile(
      path.join(managed.codexHome, 'managed_config.toml'),
      'model = "managed-model"\n',
      'utf8',
    );
    await expect(preflightCodexDefaultModel({
      launchPath: managed.bin,
      env: cleanCodexEnv(managed.codexHome),
      requestedModel: 'default',
      projectRoot: managed.projectRoot,
    })).resolves.toEqual({
      status: 'unknown',
      reason: 'managed_config',
    });

    const cloudManaged = await createFixture({
      config: 'model = "gpt-5.6-terra"\n',
      version: 'codex-cli 0.142.5',
    });
    await writeFile(
      path.join(cloudManaged.codexHome, 'cloud-config-bundle-cache.json'),
      '{"signed_payload":{"bundle":{"config":{"openai_base_url":"https://enterprise.example.invalid/v1"}}}}\n',
      'utf8',
    );
    await expect(preflightCodexDefaultModel({
      launchPath: cloudManaged.bin,
      env: cleanCodexEnv(cloudManaged.codexHome),
      requestedModel: 'default',
      projectRoot: cloudManaged.projectRoot,
    })).resolves.toEqual({
      status: 'unknown',
      reason: 'managed_config',
    });
  });

  it('fails open for prerelease versions and models without a known requirement', async () => {
    const prerelease = await createFixture({
      config: 'model = "gpt-5.6-terra"\n',
      version: 'codex-cli 0.145.0-alpha.30',
    });
    const prereleaseInput = {
      launchPath: prerelease.bin,
      env: cleanCodexEnv(prerelease.codexHome),
      requestedModel: 'default',
      projectRoot: prerelease.projectRoot,
    } as const;
    await expect(preflightCodexDefaultModel(prereleaseInput)).resolves.toEqual({
      status: 'unknown',
      reason: 'version_unavailable',
    });
    await expect(preflightCodexDefaultModel(prereleaseInput)).resolves.toEqual({
      status: 'unknown',
      reason: 'version_unavailable',
    });
    expect(
      (await readFile(prerelease.versionProbeCount, 'utf8'))
        .trim()
        .split(/\r?\n/),
    ).toHaveLength(1);

    const futureModel = await createFixture({
      config: 'model = "future-model"\n',
      version: 'codex-cli 0.142.5',
    });
    await expect(preflightCodexDefaultModel({
      launchPath: futureModel.bin,
      env: cleanCodexEnv(futureModel.codexHome),
      requestedModel: 'default',
      projectRoot: futureModel.projectRoot,
    })).resolves.toEqual({
      status: 'not_applicable',
      reason: 'no_known_requirement',
    });
  });

  function cleanCodexEnv(codexHome: string): NodeJS.ProcessEnv {
    const {
      OPENAI_API_KEY: _openAiApiKey,
      OPENAI_BASE_URL: _openAiBaseUrl,
      OPENAI_API_BASE: _openAiApiBase,
      CODEX_API_KEY: _codexApiKey,
      ...env
    } = process.env;
    return { ...env, CODEX_HOME: codexHome };
  }

  function codexSystemConfigPath(): string {
    if (process.platform !== 'win32') return '/etc/codex/config.toml';
    const programData = Object.entries(process.env).find(
      ([key, value]) =>
        key.toUpperCase() === 'PROGRAMDATA'
        && typeof value === 'string'
        && value.trim().length > 0,
    )?.[1] ?? 'C:\\ProgramData';
    return path.join(programData, 'OpenAI', 'Codex', 'config.toml');
  }

  async function createFixture(input: {
    config: string;
    version?: string;
    loginStatus?: string;
  }): Promise<{
    bin: string;
    codexHome: string;
    projectRoot: string;
    versionProbeCount: string;
  }> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-codex-preflight-unit-'));
    tempDirs.push(dir);
    const codexHome = path.join(dir, 'codex-home');
    const projectRoot = path.join(dir, 'project');
    await Promise.all([
      mkdir(codexHome, { recursive: true }),
      mkdir(projectRoot, { recursive: true }),
    ]);
    await writeFile(path.join(codexHome, 'config.toml'), input.config, 'utf8');

    const script = path.join(dir, 'fake-codex.cjs');
    const versionProbeCount = path.join(dir, 'version-probes.txt');
    await writeFile(
      script,
      `
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--version')) {
  fs.appendFileSync(${JSON.stringify(versionProbeCount)}, '1\\n');
  console.log(${JSON.stringify(input.version ?? 'codex-cli 0.143.0')});
  process.exit(0);
}
if (args[0] === 'login' && args[1] === 'status') {
  console.log(${JSON.stringify(input.loginStatus ?? 'Logged in using ChatGPT')});
  process.exit(0);
}
process.exit(2);
`,
      'utf8',
    );
    const bin = path.join(dir, process.platform === 'win32' ? 'codex.cmd' : 'codex');
    if (process.platform === 'win32') {
      await writeFile(
        bin,
        `@echo off\r\n"${process.execPath}" "${script}" %*\r\nexit /b %ERRORLEVEL%\r\n`,
        'utf8',
      );
    } else {
      await writeFile(
        bin,
        `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`,
        'utf8',
      );
      await chmod(bin, 0o755);
    }
    return { bin, codexHome, projectRoot, versionProbeCount };
  }
});
