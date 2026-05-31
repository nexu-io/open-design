export type PackagedUpdateChannel = 'stable' | 'beta' | 'nightly' | 'preview';

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
): void {
  env.OD_UPDATE_ENABLED = '1';
  env.OD_UPDATE_METADATA_URL = metadataUrl;
  env.OD_UPDATE_OPEN_DRY_RUN = '1';
  env.OD_UPDATE_AUTO_CHECK = '1';
  if (scenario.currentVersionOverride == null) {
    delete env.OD_UPDATE_CURRENT_VERSION;
  } else {
    env.OD_UPDATE_CURRENT_VERSION = scenario.currentVersionOverride;
  }
}

function parseChannel(value: string): PackagedUpdateChannel {
  if (value === 'stable' || value === 'beta' || value === 'nightly' || value === 'preview') return value;
  throw new Error(`unsupported release channel for packaged updater smoke: ${value}`);
}

function nextFixtureVersion(channel: PackagedUpdateChannel, version: string): string {
  if (channel === 'stable') return nextStablePatch(version);
  if (channel === 'nightly') return nextDottedPrerelease(version, 'nightly');
  return nextHyphenPrerelease(version, channel);
}

function nextStablePatch(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match?.[1] == null || match[2] == null || match[3] == null) {
    throw new Error(`stable release version must be x.y.z; got ${version}`);
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function nextDottedPrerelease(version: string, label: string): string {
  const match = new RegExp(`^(\\d+\\.\\d+\\.\\d+)\\.${label}\\.(\\d+)$`).exec(version);
  if (match?.[1] == null || match[2] == null) {
    throw new Error(`${label} release version must be x.y.z.${label}.N; got ${version}`);
  }
  return `${match[1]}.${label}.${Number(match[2]) + 1}`;
}

function nextHyphenPrerelease(version: string, label: string): string {
  const match = new RegExp(`^(\\d+\\.\\d+\\.\\d+)-${label}\\.(\\d+)$`).exec(version);
  if (match?.[1] == null || match[2] == null) {
    throw new Error(`${label} release version must be x.y.z-${label}.N; got ${version}`);
  }
  return `${match[1]}-${label}.${Number(match[2]) + 1}`;
}
