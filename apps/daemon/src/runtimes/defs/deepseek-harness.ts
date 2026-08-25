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
    // `dsh` is published as a stream of release candidates whose sibling
    // packages peer-require each other, so the version our own installer
    // hands the user moves with upstream. Naming one of them made every user
    // who followed our instructions land on an "untested version" warning the
    // week after we bumped the installer. Accept the release line; a version
    // off it still warns.
    supportedVersions: ['0.1.0-rc.8', '0.1.1-rc.2'],
    // The line, not one point on it. Scoping this to `0.1.0-rc.N` was still a
    // pin: upstream shipped `0.1.1-rc.1` two days later and every user on it
    // was told their CLI was untested.
    //
    // Prerelease acceptance may never exceed what `packages/dsh-runtime`'s peer
    // ranges can install, or this suppresses the warning for a version whose
    // companion cannot resolve — a worse failure than the warning, and silent.
    // semver admits a prerelease only against a comparator sharing its exact
    // major.minor.patch AND carrying a prerelease, so the accepted release
    // candidates are precisely the peers' tuples and floors: `0.1.0-rc.6+` and
    // any `0.1.1-rc.N`. Stable releases on the line need no such comparator.
    // `e2e/tests/dsh-installer-version-policy.test.ts` holds the two together.
    supportedVersionPattern: /^0\.1\.\d+$|^0\.1\.0-rc\.(?:[6-9]|[1-9]\d+)$|^0\.1\.1-rc\.\d+$/u,
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
