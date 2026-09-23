// The Thursday patch cut's pre-flight, in one place that can be run outside a
// GitHub runner.
//
// Two modes, one per workflow step in cut-patch-release.yml:
//   resolve — decide which version to cut, and which already-cut release must
//             have shipped stable before we are allowed to stack on top of it
//   gate    — ask GitHub whether that release is a published stable release
//
// This used to be inline shell in the workflow. It moved out so the gate
// decision is testable: e2e/tests/scripts/resolve-patch-cut.test.ts drives both
// modes against a real git remote and a real `gh` lookup.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const TAG_PREFIX = "open-design-v";
const DEFAULT_REPO = "nexu-io/open-design";
const DEFAULT_REMOTE = "origin";

type ReleaseVersion = {
  major: number;
  minor: number;
  patch: number;
  text: string;
};

function fail(message: string): never {
  console.error(`::error::${message}`);
  process.exit(1);
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function setOutput(name: string, value: string): void {
  const file = env("GITHUB_OUTPUT");
  if (file.length === 0) fail("GITHUB_OUTPUT is required");
  appendFileSync(file, `${name}=${value}\n`, "utf8");
}

/** Strict x.y.z, digits only — rejects shell metacharacters, newlines, etc. */
function parseVersion(text: string): ReleaseVersion | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (match == null) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    text,
  };
}

function compareVersions(left: ReleaseVersion, right: ReleaseVersion): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

/** Every `release/vX.Y.Z` branch on the remote, ascending. */
function releaseBranchVersions(): ReleaseVersion[] {
  const remote = env("RELEASE_REMOTE") || DEFAULT_REMOTE;
  let stdout: string;
  try {
    stdout = execFileSync("git", ["ls-remote", "--heads", remote, "release/v*"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  } catch {
    return fail(`Could not list release/v* branches on remote '${remote}'.`);
  }
  return stdout
    .split("\n")
    .map((line) => /refs\/heads\/release\/v(\S+)$/.exec(line.trim())?.[1] ?? "")
    .map(parseVersion)
    .filter((version): version is ReleaseVersion => version != null)
    .sort(compareVersions);
}

/**
 * The release a cut of `version` stacks on, and therefore the one that must
 * already have shipped stable before the cut is allowed: the highest
 * `release/vX.Y.Z` below it.
 *
 * Not the minor base X.Y.0. Gating on the base stops guarding anything after
 * the line's first patch — once X.Y.0 ships, X.Y.2, X.Y.3, ... all pass while
 * the releases directly beneath them may never have shipped. That is how
 * release/v0.22.3 got cut on 2026-09-10 while release/v0.22.2 was unshipped and
 * still taking backports; nothing looked at 0.22.2 at any point.
 *
 * This is the same target cut-release.yml gates the Tuesday minor on, and it
 * still gives the answer the old minor-base rule was written for: cutting
 * 0.15.1 checks open-design-v0.15.0 rather than the 0.14.x line it just left,
 * because 0.15.0 is the branch directly below it.
 *
 * A manual `version=` below every existing branch has nothing beneath it; fall
 * back to the highest branch so a back-fill still gates on a real release
 * instead of on nothing.
 */
function previousRelease(branches: readonly ReleaseVersion[], version: ReleaseVersion): ReleaseVersion {
  const below = branches.filter((branch) => compareVersions(branch, version) < 0).at(-1);
  const previous = below ?? branches.at(-1);
  if (previous == null) fail("No release/vX.Y.Z branch found to gate the patch cut on.");
  return previous;
}

function resolve(): void {
  const branches = releaseBranchVersions();
  const input = env("INPUT_VERSION");

  // Decide the final version V FIRST: a validated manual override wins,
  // otherwise bump the patch of the highest release branch.
  let version: ReleaseVersion;
  if (input.length > 0) {
    const parsed = parseVersion(input);
    if (parsed == null) fail(`Invalid version '${input}' (expected x.y.z, digits only)`);
    version = parsed;
  } else {
    const highest = branches.at(-1);
    if (highest == null) fail("No release/vX.Y.Z branch found to base a patch on.");
    const patch = highest.patch + 1;
    version = {
      major: highest.major,
      minor: highest.minor,
      patch,
      text: `${highest.major}.${highest.minor}.${patch}`,
    };
  }

  const gate = previousRelease(branches, version).text;

  setOutput("version", version.text);
  setOutput("branch", `release/v${version.text}`);
  setOutput("gate_version", gate);
  setOutput("gate_tag", `${TAG_PREFIX}${gate}`);
  console.log(`Cutting patch v${version.text} (branch release/v${version.text}); gating on stable v${gate}`);
}

function gate(): void {
  if (env("FORCE") === "true") {
    console.log("force=true: skipping the publish guard");
    setOutput("published", "true");
    return;
  }

  const tag = env("GATE_TAG");
  if (tag.length === 0) fail("GATE_TAG is required");
  const repo = env("RELEASE_REPO") || DEFAULT_REPO;

  // "published" = the release exists AND is neither a draft nor a prerelease.
  // gh's --jq evaluates `(.isDraft or .isPrerelease) | not` to true only when
  // both are false. Only gh's exact missing-release sentinel is an unpublished
  // release; other lookup failures must fail the job so operators can retry it.
  let answer = "";
  try {
    answer = execFileSync(
      "gh",
      [
        "release",
        "view",
        tag,
        "--repo",
        repo,
        "--json",
        "isDraft,isPrerelease",
        "--jq",
        "(.isDraft or .isPrerelease) | not",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch (error) {
    const failure = error as Error & { status?: number; stderr?: string };
    const detail = failure.stderr?.trim() ?? "";
    if (failure.status !== 1 || detail !== "release not found") {
      fail(`Could not look up release '${tag}': ${detail || failure.message}`);
    }
    answer = "false";
  }
  if (answer !== "true" && answer !== "false") {
    fail(`Unexpected publication status for release '${tag}': ${JSON.stringify(answer)}`);
  }

  const published = answer === "true" ? "true" : "false";
  console.log(`release ${tag} -> published=${published}`);
  setOutput("published", published);
}

const mode = process.argv[2];
if (mode === "resolve") {
  resolve();
} else if (mode === "gate") {
  gate();
} else {
  fail("usage: resolve-patch-cut.ts <resolve|gate>");
}
