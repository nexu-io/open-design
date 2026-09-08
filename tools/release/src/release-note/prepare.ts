import { resolve } from "node:path";

import { releaseChannelDescriptor } from "@open-design/release";

import { optional, required, writeJson } from "../storage/common.ts";
import { reportReleaseNotePolicyWarnings, reviewReleaseNotePlanPolicy } from "./policy.ts";
import { discoverReleaseNotePlan } from "./source.ts";

const channel = releaseChannelDescriptor(required("RELEASE_CHANNEL")).channel;
const releaseVersion = required("RELEASE_VERSION");
const sourceRoot = resolve(optional("RELEASE_NOTE_SOURCE_ROOT", "docs/CHANGELOG"));
const planPath = required("RELEASE_NOTE_PLAN_PATH");

const plan = discoverReleaseNotePlan({ channel, releaseVersion, sourceRoot });
// prepare owns the reporting: it is the first release-note command every
// channel runs, so publish/verify enforce the same policy without repeating
// the annotation.
reportReleaseNotePolicyWarnings(reviewReleaseNotePlanPolicy(plan, channel));
writeJson(planPath, plan);

if (plan.state === "absent") {
  console.log(`release notes absent for ${channel} ${releaseVersion}`);
} else {
  console.log(`prepared ${channel} ${releaseVersion} release notes: ${plan.entries.map((entry) => entry.locale).join(", ")}`);
}
