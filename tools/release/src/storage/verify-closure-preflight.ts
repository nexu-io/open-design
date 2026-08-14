import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  createClosureDistributionControl,
  validateClosureDistributionManifest,
  type ClosureDistributionManifest,
} from "@open-design/closure/protocol";
import {
  ClosureInstallerRequiredError,
  selectClosureDistributionReleaseCandidate,
} from "@open-design/closure/update";
import {
  compareReleaseVersions,
  formatReleaseVersion,
  parseReleaseVersion,
  type ReleaseChannel,
} from "@open-design/release";

export type ClosurePreflightAcceptance = Readonly<{
  currentShellVersion: string;
  minimumShellVersion: string;
  previousShellVersion: string | null;
  result: "compatible" | "installer-required-before-graph" | "no-n-minus-one";
}>;

export function verifyClosureNMinusOnePreflight(input: Readonly<{
  channel: ReleaseChannel;
  manifest: ClosureDistributionManifest;
  releaseVersion: string;
}>): ClosurePreflightAcceptance {
  const parsed = parseReleaseVersion(input.releaseVersion, input.channel);
  const minimumShellVersion = input.manifest.compatibility.shell.electron?.version.min;
  if (minimumShellVersion == null) throw new Error("Closure manifest has no electron Shell floor");
  const previousShellVersion = "number" in parsed && parsed.number > 1
    ? formatReleaseVersion(input.channel, parsed.baseVersion, parsed.number - 1)
    : null;
  if (previousShellVersion == null) {
    return {
      currentShellVersion: input.releaseVersion,
      minimumShellVersion,
      previousShellVersion,
      result: "no-n-minus-one",
    };
  }

  const target = Object.keys(input.manifest.required.targets).sort()[0];
  if (target == null) throw new Error("Closure manifest has no required target");
  const metadata = {
    channel: input.channel,
    closure: input.manifest,
    closureControl: createClosureDistributionControl(input.manifest),
    releaseState: "complete",
    releaseVersion: input.releaseVersion,
  };
  const incompatible = compareReleaseVersions(
    previousShellVersion,
    minimumShellVersion,
    input.channel,
  ) < 0;
  if (!incompatible) {
    const selected = selectClosureDistributionReleaseCandidate(metadata, {
      channel: input.channel,
      consumer: { shellType: "electron", shellVersion: previousShellVersion },
      target,
    });
    if (selected == null) throw new Error("compatible N-1 Shell did not select the Closure distribution");
    return {
      currentShellVersion: input.releaseVersion,
      minimumShellVersion,
      previousShellVersion,
      result: "compatible",
    };
  }

  let observed: unknown;
  try {
    selectClosureDistributionReleaseCandidate({ ...metadata, closure: { schemaVersion: 999 } }, {
      channel: input.channel,
      consumer: { shellType: "electron", shellVersion: previousShellVersion },
      target,
    });
  } catch (error) {
    observed = error;
  }
  if (!(observed instanceof ClosureInstallerRequiredError)) {
    throw new Error("incompatible N-1 Shell reached the deep Closure graph before installer preflight", {
      cause: observed,
    });
  }
  return {
    currentShellVersion: input.releaseVersion,
    minimumShellVersion,
    previousShellVersion,
    result: "installer-required-before-graph",
  };
}

export function verifyClosureNMinusOnePreflightFile(input: Readonly<{
  channel: ReleaseChannel;
  manifestPath: string;
  releaseVersion: string;
}>): ClosurePreflightAcceptance {
  const value = JSON.parse(readFileSync(input.manifestPath, "utf8")) as unknown;
  return verifyClosureNMinusOnePreflight({
    channel: input.channel,
    manifest: validateClosureDistributionManifest(
      value,
      (canonical) => `sha256:${createHash("sha256").update(canonical).digest("hex")}`,
    ),
    releaseVersion: input.releaseVersion,
  });
}
