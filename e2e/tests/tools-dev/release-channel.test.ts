// @vitest-environment node

/**
 * Why this lives in `e2e/tests/` rather than in either app: the invariant spans
 * two boundaries that neither side can assert alone — the e2e harness decides
 * what environment a tools-dev runtime runs under, and the daemon decides what
 * that environment means for the post-update release card. Only a cross-app
 * test can hold the two ends together, so it follows the same shape as
 * `e2e/tests/question-form-parity.test.ts` and imports the daemon helpers
 * directly.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import {
  composeToolsDevEnv,
  E2E_TOOLS_DEV_RELEASE_CHANNEL,
} from '@/tools-dev/cli';
import type { ToolsDevSuiteSpec } from '@/tools-dev/types';
import { resolveAppVersionInfo } from '../../../apps/daemon/src/app-version.ts';
import {
  DEFAULT_WHATS_NEW_URL,
  whatsNewSourceUrl,
} from '../../../apps/daemon/src/services/whats-new.ts';

/**
 * Where GitHub's hosted Linux runners install the Node toolchain. The daemon's
 * `isPackagedRuntime` treats any linux `execPath` under `/opt/` as a packaged
 * install, which is what makes a CI daemon claim a release channel.
 */
const GITHUB_RUNNER_EXEC_PATH = '/opt/hostedtoolcache/node/24.13.0/x64/bin/node';

const DAEMON_VERSION = readDaemonVersion();

const SUITE: ToolsDevSuiteSpec = {
  codexHomeDir: '/tmp/od-e2e-release-channel/codex-home',
  dataDir: '/tmp/od-e2e-release-channel/data',
  namespace: 'e2e-release-channel',
  root: '/tmp/od-e2e-release-channel',
  toolsDevRoot: '/tmp/od-e2e-release-channel/tools-dev',
};

function resolveCiShapedChannel(env: NodeJS.ProcessEnv): string {
  return resolveAppVersionInfo({
    arch: 'x64',
    env,
    execPath: GITHUB_RUNNER_EXEC_PATH,
    packageMetadata: { version: DAEMON_VERSION },
    platform: 'linux',
    resourcesPath: undefined,
  }).channel;
}

describe('e2e tools-dev release channel', () => {
  test('a CI-shaped runtime without the harness default fetches the live release card', () => {
    // The red half of this file. If the daemon ever stops mistaking a hosted
    // runner for a packaged install, this expectation fails and the harness
    // default below becomes belt without suspenders — which is worth knowing.
    const ciShaped = resolveAppVersionInfo({
      arch: 'x64',
      env: {},
      execPath: GITHUB_RUNNER_EXEC_PATH,
      packageMetadata: { version: DAEMON_VERSION },
      platform: 'linux',
      resourcesPath: undefined,
    });

    expect(ciShaped.packaged).toBe(true);
    expect(whatsNewSourceUrl({}, ciShaped.channel)).toBe(DEFAULT_WHATS_NEW_URL);
  });

  test('the harness environment resolves that same runtime to no release card', () => {
    const env = composeToolsDevEnv(SUITE, {}, {});

    expect(env.OD_RELEASE_CHANNEL).toBe(E2E_TOOLS_DEV_RELEASE_CHANNEL);
    expect(resolveCiShapedChannel(env)).toBe('development');
    expect(whatsNewSourceUrl(env, resolveCiShapedChannel(env))).toBeNull();
  });

  test('an ambient shell channel cannot pull the card back into a test run', () => {
    const env = composeToolsDevEnv(SUITE, {}, { OD_RELEASE_CHANNEL: 'stable' });

    expect(resolveCiShapedChannel(env)).toBe('development');
    expect(whatsNewSourceUrl(env, resolveCiShapedChannel(env))).toBeNull();
  });

  test('a spec that means to exercise a release channel can still opt back in', () => {
    const env = composeToolsDevEnv(SUITE, { OD_RELEASE_CHANNEL: 'beta' }, {});

    expect(resolveCiShapedChannel(env)).toBe('beta');
    expect(whatsNewSourceUrl(env, resolveCiShapedChannel(env))).toBe(DEFAULT_WHATS_NEW_URL);
  });

  test('an explicit document URL still overrides the channel, which is what the page route covers', () => {
    // The channel default and the Playwright `suppressWhatsNew` route defend
    // different things. This env reaches `development` and still resolves to a
    // document, so a machine carrying `OD_WHATS_NEW_URL` would serve a card that
    // only the page-level route can stop.
    const env = composeToolsDevEnv(SUITE, {}, { OD_WHATS_NEW_URL: 'https://example.test/card.json' });

    expect(resolveCiShapedChannel(env)).toBe('development');
    expect(whatsNewSourceUrl(env, resolveCiShapedChannel(env))).toBe('https://example.test/card.json');
  });

  test('per-suite runtime identity stays below every override', () => {
    const env = composeToolsDevEnv(
      SUITE,
      { OD_DATA_DIR: '/tmp/not-this-suite' },
      { CODEX_HOME: '/tmp/developer-home' },
    );

    expect(env.CODEX_HOME).toBe(SUITE.codexHomeDir);
    expect(env.OD_DATA_DIR).toBe(SUITE.dataDir);
    expect(env.OD_MEDIA_CONFIG_DIR).toBe(SUITE.dataDir);
  });
});

function readDaemonVersion(): string {
  const packageJsonPath = fileURLToPath(new URL('../../../apps/daemon/package.json', import.meta.url));
  const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };
  if (typeof parsed.version !== 'string' || parsed.version.trim() === '') {
    throw new Error(`apps/daemon/package.json has no usable version: ${String(parsed.version)}`);
  }
  return parsed.version;
}
