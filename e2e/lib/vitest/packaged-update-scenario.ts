import {
  formatReleaseVersion,
  isReleaseChannel,
  parseReleaseVersion,
  type ReleaseChannel,
} from '@open-design/release';

export type PackagedUpdateChannel = ReleaseChannel;

export type PackagedUpdateScenario = {
  channel: PackagedUpdateChannel;
  currentVersionOverride: string | null;
  expectedCurrentVersion: string;
  fixtureVersion: string;
};

export function resolvePackagedUpdateScenario(input: {
  releaseChannel?: string | undefined;
  releaseVersion?: string | undefined;
}): PackagedUpdateScenario {
  const releaseChannel = input.releaseChannel;
  const releaseVersion = input.releaseVersion;

  if ((releaseChannel == null || releaseChannel === '') && (releaseVersion == null || releaseVersion === '')) {
    return {
      channel: 'beta',
      currentVersionOverride: '99.0.0-beta.0',
      expectedCurrentVersion: '99.0.0-beta.0',
      fixtureVersion: '99.0.0-beta.1',
    };
  }

  if (releaseChannel == null || releaseChannel === '' || releaseVersion == null || releaseVersion === '') {
    throw new Error('OD_PACKAGED_E2E_RELEASE_CHANNEL and OD_PACKAGED_E2E_RELEASE_VERSION must be set together');
  }

  const channel = parseChannel(releaseChannel);
  return {
    channel,
    currentVersionOverride: null,
    expectedCurrentVersion: releaseVersion,
    fixtureVersion: nextFixtureVersion(channel, releaseVersion),
  };
}

export function applyPackagedUpdateEnv(
  env: NodeJS.ProcessEnv,
  scenario: PackagedUpdateScenario,
  metadataUrl: string,
  options: { openDryRun?: boolean } = {},
): void {
  env.OD_UPDATE_ENABLED = '1';
  env.OD_UPDATE_METADATA_URL = metadataUrl;
  env.OD_UPDATE_OPEN_DRY_RUN = options.openDryRun === false ? '0' : '1';
  env.OD_UPDATE_AUTO_CHECK = '1';
  if (scenario.currentVersionOverride == null) {
    delete env.OD_UPDATE_CURRENT_VERSION;
  } else {
    env.OD_UPDATE_CURRENT_VERSION = scenario.currentVersionOverride;
  }
}

function parseChannel(value: string): PackagedUpdateChannel {
  if (isReleaseChannel(value)) return value;
  throw new Error(`unsupported release channel for packaged updater smoke: ${value}`);
}

function nextFixtureVersion(channel: PackagedUpdateChannel, version: string): string {
  if (channel === 'stable') return nextStablePatch(version);
  return nextHyphenPrerelease(version, channel);
}

function nextStablePatch(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match?.[1] == null || match[2] == null || match[3] == null) {
    throw new Error(`stable release version must be x.y.z; got ${version}`);
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function nextHyphenPrerelease(version: string, label: string): string {
  if (label !== 'beta' && label !== 'betas' && label !== 'prerelease' && label !== 'preview') {
    throw new Error(`unsupported counted release channel: ${label}`);
  }
  const parsed = parseReleaseVersion(version, label);
  if (parsed.channel === 'stable') {
    throw new Error(`${label} release version must be x.y.z-${label}.N; got ${version}`);
  }
  return formatReleaseVersion(label, parsed.baseVersion, parsed.number + 1);
}
