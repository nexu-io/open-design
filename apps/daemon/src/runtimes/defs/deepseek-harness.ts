import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';
import {
  parseDshProfileModelsOutput,
  parseDshProfileProbeOutput,
} from '../../agent-protocol/dsh-profile/index.js';

function parseModels(stdout: string) {
  const catalog = parseDshProfileModelsOutput(stdout);
  if (!catalog) return null;
  return [
    DEFAULT_MODEL_OPTION,
    ...catalog.map((model) => ({
      id: `${model.provider}/${model.id}`,
      label: `${model.name} · ${model.provider_name}`,
      ...(model.reasoning_options?.length
        ? {
            reasoningOptions: model.reasoning_options.map((effort) => ({
              id: effort.id,
              label: effort.name,
              ...(effort.default === true ? { default: true } : {}),
            })),
          }
        : {}),
    })),
  ];
}

export function hasOpenDesignProfile(env: NodeJS.ProcessEnv): boolean {
  return existsSync(path.join(resolveOpenDesignProfileDir(env), 'package.json'));
}

export function resolveOpenDesignProfileDir(env: NodeJS.ProcessEnv): string {
  const configuredHome = env.DSH_HOME?.trim();
  const dshHome = configuredHome
    ? path.resolve(configuredHome)
    : path.join(homedir(), '.dsh');
  return path.join(dshHome, 'profiles', 'open-design');
}

const DSH_VERSION_RE = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/u;

export function parseDeepSeekHarnessVersion(raw: string): string | null {
  return DSH_VERSION_RE.exec(raw.trim())?.[1] ?? null;
}

export const deepseekHarnessAgentDef = {
  id: 'deepseek-harness',
  name: 'DeepSeek Harness',
  bin: 'dsh',
  versionArgs: ['--version'],
  versionPolicy: {
    supportedVersions: ['0.1.0-rc.6'],
    requireVersion: true,
    parse: parseDeepSeekHarnessVersion,
  },
  compatibilityProbe: {
    args: ['--profile', 'open-design', '--probe'],
    timeoutMs: 10_000,
    // rc.6 auto-initializes a missing profile before booting it, so avoid
    // invoking --probe until the user-installed profile already exists.
    preflight: hasOpenDesignProfile,
    parse: (stdout) => parseDshProfileProbeOutput(stdout).plugin_version,
  },
  listModels: {
    args: ['--profile', 'open-design', '--models'],
    parse: parseModels,
    timeoutMs: 10_000,
  },
  fallbackModels: [DEFAULT_MODEL_OPTION],
  buildArgs: () => ['--profile', 'open-design', '--stdio'],
  promptViaStdin: true,
  streamFormat: 'dsh-profile-jsonl',
  resumesSessionViaProfileStdio: true,
  capturesSessionIdFromStream: true,
  supportsCustomModel: false,
} satisfies RuntimeAgentDef;
