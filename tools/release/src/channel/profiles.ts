import {
  isReleaseChannel,
  releaseChannelDescriptor,
  type CountedReleaseChannel,
  type ReleaseChannel,
} from "@open-design/release";

export type ReleaseActivation = "accepted-publication" | "direct-latest" | "stable-promotion";
export type ReleaseBaseVersionPolicy = "packaged" | "preview-branch-or-input" | "release-branch-or-input" | "release-branch";
export type ReleaseStableFloor = "github-releases" | "prerelease-metadata" | "stable-metadata-or-tags" | "stable-tags";

export type ReleaseChannelProfile = {
  activation: ReleaseActivation;
  baseVersionPolicy: ReleaseBaseVersionPolicy;
  channel: ReleaseChannel;
  counted: boolean;
  releaseNoteRequired: boolean;
  stableFloor: ReleaseStableFloor;
  workflow: `release-${string}`;
};

export type CountedReleaseChannelProfile = ReleaseChannelProfile & {
  channel: CountedReleaseChannel;
  counted: true;
  legacyNumberField?: `${string}Number`;
  legacyVersionField?: `${string}Version`;
  metadataSource: string;
  metadataUrlEnv: `OPEN_DESIGN_${string}_METADATA_URL`;
};

const countedProfiles = {
  beta: {
    activation: "accepted-publication",
    baseVersionPolicy: "packaged",
    channel: "beta",
    counted: true,
    legacyNumberField: "betaNumber",
    legacyVersionField: "betaVersion",
    metadataSource: "beta metadata.json",
    metadataUrlEnv: "OPEN_DESIGN_BETA_METADATA_URL",
    releaseNoteRequired: false,
    stableFloor: "stable-metadata-or-tags",
    workflow: "release-beta",
  },
  prerelease: {
    activation: "direct-latest",
    baseVersionPolicy: "release-branch-or-input",
    channel: "prerelease",
    counted: true,
    legacyNumberField: "prereleaseNumber",
    legacyVersionField: "prereleaseVersion",
    metadataSource: "R2 prerelease metadata.json",
    metadataUrlEnv: "OPEN_DESIGN_PRERELEASE_METADATA_URL",
    releaseNoteRequired: false,
    stableFloor: "github-releases",
    workflow: "release-prerelease",
  },
  preview: {
    activation: "direct-latest",
    baseVersionPolicy: "preview-branch-or-input",
    channel: "preview",
    counted: true,
    legacyNumberField: "previewNumber",
    legacyVersionField: "previewVersion",
    metadataSource: "R2 preview metadata.json",
    metadataUrlEnv: "OPEN_DESIGN_PREVIEW_METADATA_URL",
    releaseNoteRequired: false,
    stableFloor: "stable-tags",
    workflow: "release-preview",
  },
} as const satisfies Record<CountedReleaseChannel, CountedReleaseChannelProfile>;

const stableProfile = {
  activation: "stable-promotion",
  baseVersionPolicy: "release-branch",
  channel: "stable",
  counted: false,
  releaseNoteRequired: true,
  stableFloor: "prerelease-metadata",
  workflow: "release-stable",
} as const satisfies ReleaseChannelProfile;

export const RELEASE_CHANNEL_PROFILES = Object.freeze({ ...countedProfiles, stable: stableProfile });

export function releaseChannelProfile(value: string): ReleaseChannelProfile {
  if (!isReleaseChannel(value)) {
    releaseChannelDescriptor(value);
  }
  return RELEASE_CHANNEL_PROFILES[value as ReleaseChannel];
}

export function countedReleaseChannelProfile(value: string): CountedReleaseChannelProfile {
  const profile = releaseChannelProfile(value);
  if (!profile.counted) {
    throw new Error(`${profile.channel} is not a counted release channel`);
  }
  return profile as CountedReleaseChannelProfile;
}
