import { afterEach } from 'vitest';
import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AGENT_DEFS,
  applyAgentLaunchEnv,
  buildLiveArtifactsMcpServersForAgent,
  checkPromptArgvBudget,
  checkWindowsCmdShimCommandLineBudget,
  checkWindowsDirectExeCommandLineBudget,
  detectAgents,
  inspectAgentExecutableResolution,
  resolveAgentLaunch,
  resolveAgentExecutable,
  spawnEnvForAgent,
} from '../../../src/agents.js';
import type { RuntimeAgentDef } from '../../../src/runtimes/types.js';

export {
  assert,
  AGENT_DEFS,
  applyAgentLaunchEnv,
  buildLiveArtifactsMcpServersForAgent,
  checkPromptArgvBudget,
  checkWindowsCmdShimCommandLineBudget,
  checkWindowsDirectExeCommandLineBudget,
  chmodSync,
  detectAgents,
  inspectAgentExecutableResolution,
  join,
  mkdirSync,
  mkdtempSync,
  resolveAgentExecutable,
  resolveAgentLaunch,
  rmSync,
  spawnEnvForAgent,
  tmpdir,
  writeFileSync,
};

export type TestAgentDef = RuntimeAgentDef;

export function requireAgent(id: string): TestAgentDef {
  const agent = AGENT_DEFS.find((candidate) => candidate.id === id);
  assert.ok(agent, `missing agent definition for ${id}`);
  return agent;
}

export function minimalAgentDef(
  partial: Pick<TestAgentDef, 'bin'> & Partial<TestAgentDef>,
): TestAgentDef {
  const { bin, ...rest } = partial;
  return {
    id: partial.id ?? `test-${bin}`,
    name: partial.name ?? bin,
    bin,
    versionArgs: partial.versionArgs ?? ['--version'],
    fallbackModels: partial.fallbackModels ?? [{ id: 'default', label: 'Default' }],
    buildArgs: partial.buildArgs ?? (() => []),
    streamFormat: partial.streamFormat ?? 'plain',
    ...rest,
  };
}

export const codex = requireAgent('codex');
export const hermes = requireAgent('hermes');
export const kimi = requireAgent('kimi');
export const copilot = requireAgent('copilot');
export const cursorAgent = requireAgent('cursor-agent');
export const kiro = requireAgent('kiro');
export const kilo = requireAgent('kilo');
export const vibe = requireAgent('vibe');
export const claude = requireAgent('claude');
export const devin = requireAgent('devin');
export const pi = requireAgent('pi');
export const deepseek = requireAgent('deepseek');
export const gemini = requireAgent('gemini');
export const qoder = requireAgent('qoder');
export const opencode = requireAgent('opencode');
export const deepseekMaxPromptArgBytes = (() => {
  assert.ok(
    deepseek.maxPromptArgBytes !== undefined,
    'deepseek must define maxPromptArgBytes for argv budget tests',
  );
  return deepseek.maxPromptArgBytes;
})();
const originalDisablePlugins = process.env.OD_CODEX_DISABLE_PLUGINS;
const originalPath = process.env.PATH;
const originalHome = process.env.HOME;
const originalAgentHome = process.env.OD_AGENT_HOME;
const originalDaemonUrl = process.env.OD_DAEMON_URL;
const originalToolToken = process.env.OD_TOOL_TOKEN;
const originalNpmConfigPrefix = process.env.NPM_CONFIG_PREFIX;
const originalPathExt = process.env.PATHEXT;
const originalVpHome = process.env.VP_HOME;
const originalFetch = globalThis.fetch;
const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

afterEach(() => {
  if (originalDisablePlugins == null) {
    delete process.env.OD_CODEX_DISABLE_PLUGINS;
  } else {
    process.env.OD_CODEX_DISABLE_PLUGINS = originalDisablePlugins;
  }
  process.env.PATH = originalPath;
  if (originalHome == null) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalAgentHome == null) {
    delete process.env.OD_AGENT_HOME;
  } else {
    process.env.OD_AGENT_HOME = originalAgentHome;
  }
  if (originalDaemonUrl == null) {
    delete process.env.OD_DAEMON_URL;
  } else {
    process.env.OD_DAEMON_URL = originalDaemonUrl;
  }
  if (originalToolToken == null) {
    delete process.env.OD_TOOL_TOKEN;
  } else {
    process.env.OD_TOOL_TOKEN = originalToolToken;
  }
  if (originalNpmConfigPrefix == null) {
    delete process.env.NPM_CONFIG_PREFIX;
  } else {
    process.env.NPM_CONFIG_PREFIX = originalNpmConfigPrefix;
  }
  if (originalPathExt == null) {
    delete process.env.PATHEXT;
  } else {
    process.env.PATHEXT = originalPathExt;
  }
  if (originalVpHome == null) {
    delete process.env.VP_HOME;
  } else {
    process.env.VP_HOME = originalVpHome;
  }
  globalThis.fetch = originalFetch;
  if (originalPlatformDescriptor) {
    Object.defineProperty(process, 'platform', originalPlatformDescriptor);
  }
});

export function withPlatform<T>(platform: NodeJS.Platform, run: () => T): T {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });
  return run();
}

export function withEnvSnapshot<T>(
  keys: readonly string[],
  run: () => T | Promise<T>,
): T | Promise<T> {
  const snapshot = new Map(keys.map((key) => [key, process.env[key]]));
  const restore = () => {
    for (const key of keys) {
      const value = snapshot.get(key);
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  let result: T | Promise<T>;
  try {
    result = run();
  } catch (error) {
    restore();
    throw error;
  }
  if (result instanceof Promise) {
    return result.finally(restore);
  }
  restore();
  return result;
}
