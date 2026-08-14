import {
  releaseChannelDescriptor,
  type CountedReleaseChannel,
  type ReleaseChannel,
} from "@open-design/release";

export type ReleaseActivation = "accepted-publication" | "direct-latest" | "stable-promotion";
export type ReleaseBaseVersionPolicy = "packaged" | "release-branch-or-input" | "release-branch";
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

const prereleaseProfile = {
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
} as const satisfies CountedReleaseChannelProfile;

const stableProfile = {
  activation: "stable-promotion",
  baseVersionPolicy: "release-branch",
  channel: "stable",
  counted: false,
  releaseNoteRequired: true,
  stableFloor: "prerelease-metadata",
  workflow: "release-stable",
} as const satisfies ReleaseChannelProfile;

export const RELEASE_CHANNEL_PROFILES = Object.freeze({ prerelease: prereleaseProfile, stable: stableProfile });

function exactProfile(channel: CountedReleaseChannel): CountedReleaseChannelProfile {
  return {
    activation: "accepted-publication",
    baseVersionPolicy: "packaged",
    channel,
    counted: true,
    ...(channel === "beta" ? { legacyNumberField: "betaNumber", legacyVersionField: "betaVersion" } : {}),
    metadataSource: `${channel} metadata.json`,
    metadataUrlEnv: "OPEN_DESIGN_EXACT_METADATA_URL",
    releaseNoteRequired: false,
    stableFloor: "stable-metadata-or-tags",
    workflow: "release-beta",
  };
}

export function releaseChannelProfile(value: string): ReleaseChannelProfile {
  const channel = releaseChannelDescriptor(value).channel;
  if (channel === "stable" || channel === "prerelease") return RELEASE_CHANNEL_PROFILES[channel];
  return exactProfile(channel);
}

export function countedReleaseChannelProfile(value: string): CountedReleaseChannelProfile {
  const profile = releaseChannelProfile(value);
  if (!profile.counted) {
    throw new Error(`${profile.channel} is not a counted release channel`);
  }
  return profile as CountedReleaseChannelProfile;
}
